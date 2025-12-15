"""
Whereish Backend Server
Milestone 4: Authentication + Milestone 5: Permissions

A minimal Flask server for location storage and retrieval.
Uses SQLite for prototype, designed to swap to Postgres/Firestore.

Key principles:
- Email/password authentication with JWT tokens
- Server filters location based on permission level
"""

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

# ===================
# Utilities
# ===================


def format_timestamp(ts):
    """Format timestamp for JSON - handles both datetime objects and strings.

    SQLite can return TIMESTAMP columns as either datetime objects or strings
    depending on how the data was inserted. This handles both cases.
    """
    if ts is None:
        return None
    if hasattr(ts, 'isoformat'):
        return ts.isoformat()
    # Already a string (SQLite sometimes returns strings for TIMESTAMP)
    return str(ts)


# ===================
# Configuration
# ===================

app = Flask(__name__)
app.config['DATABASE'] = os.environ.get('DATABASE_PATH', 'whereish.db')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Static file serving for production (Docker)
# In development, use separate http.server on :8080
STATIC_DIR = Path(__file__).parent.parent / 'app'
SERVE_STATIC = os.environ.get('SERVE_STATIC', 'false').lower() == 'true'

# Reverse proxy support
# Set BEHIND_PROXY=true when running behind nginx, traefik, etc.
# This trusts X-Forwarded-* headers for correct client IP and protocol detection
BEHIND_PROXY = os.environ.get('BEHIND_PROXY', 'false').lower() == 'true'
if BEHIND_PROXY:
    # Trust 1 proxy by default. For multiple proxies, adjust x_for accordingly.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Location expiry (how long before a location is considered stale)
LOCATION_EXPIRY_MINUTES = 30

# Token expiry
TOKEN_EXPIRY_DAYS = 30

# App version for client refresh detection
# This should match the service worker CACHE_NAME version number
# v100 - E2E encryption (breaking change from plaintext location sharing)
APP_VERSION = os.environ.get('APP_VERSION', '100')

# Minimum supported client version
# Clients below this version will be forced to update
# v100 required for E2E encryption compatibility
MIN_APP_VERSION = os.environ.get('MIN_APP_VERSION', '100')

# Google OAuth Client ID
# Get from Google Cloud Console -> APIs & Services -> Credentials
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')

# Testing mode - allows test tokens to bypass Google verification
# NEVER set this in production!
TESTING_MODE = os.environ.get('TESTING_MODE', 'false').lower() == 'true'

# ===================
# Permission Levels
# ===================

# Ordered from least specific to most specific
# Index 0 = least detail, higher index = more detail
PERMISSION_LEVELS = [
    'planet',  # 0 - "Planet Earth" (effectively nothing)
    'continent',  # 1
    'country',  # 2
    'state',  # 3
    'county',  # 4
    'city',  # 5
    'neighborhood',  # 6 - Area/suburb/district
    'street',  # 7
    'address',  # 8 - Most specific
]

# Default permission level for new contacts
DEFAULT_PERMISSION_LEVEL = 'planet'


# ===================
# Token Management
# ===================


def generate_token(user_id):
    """Generate a simple token for authentication."""
    # Format: user_id:random_hex:timestamp_hex
    random_part = secrets.token_hex(16)
    timestamp = int(datetime.utcnow().timestamp())
    token_data = f'{user_id}:{random_part}:{timestamp:x}'
    # Sign with secret key
    signature = hashlib.sha256((token_data + app.config['SECRET_KEY']).encode()).hexdigest()[:16]
    return f'{token_data}:{signature}'


def verify_token(token):
    """Verify token and return user_id if valid."""
    try:
        parts = token.split(':')
        if len(parts) != 4:
            return None

        user_id, random_part, timestamp_hex, signature = parts
        token_data = f'{user_id}:{random_part}:{timestamp_hex}'

        # Verify signature
        expected_sig = hashlib.sha256((token_data + app.config['SECRET_KEY']).encode()).hexdigest()[
            :16
        ]

        if signature != expected_sig:
            return None

        # Check expiry
        timestamp = int(timestamp_hex, 16)
        token_time = datetime.fromtimestamp(timestamp)
        if datetime.utcnow() - token_time > timedelta(days=TOKEN_EXPIRY_DAYS):
            return None

        return user_id
    except (ValueError, TypeError):
        return None


# ===================
# Database Setup
# ===================


def get_db():
    """Get database connection for current request."""
    if 'db' not in g:
        g.db = sqlite3.connect(app.config['DATABASE'], detect_types=sqlite3.PARSE_DECLTYPES)
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(e=None):
    """Close database connection."""
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    """Initialize database schema."""
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            public_key TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_email
        ON users(email);

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            accepted_at TIMESTAMP,
            FOREIGN KEY (requester_id) REFERENCES users(id),
            FOREIGN KEY (recipient_id) REFERENCES users(id),
            UNIQUE(requester_id, recipient_id)
        );

        CREATE INDEX IF NOT EXISTS idx_contacts_requester
        ON contacts(requester_id);

        CREATE INDEX IF NOT EXISTS idx_contacts_recipient
        ON contacts(recipient_id);

        CREATE TABLE IF NOT EXISTS permissions (
            granter_id TEXT NOT NULL,
            grantee_id TEXT NOT NULL,
            permission_level TEXT NOT NULL DEFAULT 'planet',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (granter_id, grantee_id),
            FOREIGN KEY (granter_id) REFERENCES users(id),
            FOREIGN KEY (grantee_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS encrypted_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id TEXT NOT NULL,
            to_user_id TEXT NOT NULL,
            encrypted_blob TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (from_user_id) REFERENCES users(id),
            FOREIGN KEY (to_user_id) REFERENCES users(id),
            UNIQUE(from_user_id, to_user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_encrypted_locations_to_user
        ON encrypted_locations(to_user_id);
    """)
    db.commit()

    # Migration: add columns to existing users table if missing
    cursor = db.execute('PRAGMA table_info(users)')
    columns = [row[1] for row in cursor.fetchall()]
    if 'public_key' not in columns:
        db.execute('ALTER TABLE users ADD COLUMN public_key TEXT')
        db.commit()
    if 'google_id' not in columns:
        # Note: SQLite doesn't support ADD COLUMN with UNIQUE constraint on non-empty tables
        # The UNIQUE constraint is enforced at application level for migrations
        db.execute('ALTER TABLE users ADD COLUMN google_id TEXT')
        # Create index for uniqueness check (allows NULL duplicates, which is fine)
        db.execute(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL'
        )
        db.commit()
    if 'encrypted_identity' not in columns:
        db.execute('ALTER TABLE users ADD COLUMN encrypted_identity TEXT')
        db.commit()


@app.before_request
def before_request():
    """Ensure database is initialized."""
    init_db()


app.teardown_appcontext(close_db)

# ===================
# Permission Helpers
# ===================


def get_permission_level(granter_id, grantee_id):
    """Get the permission level granter has given to grantee."""
    db = get_db()
    row = db.execute(
        'SELECT permission_level FROM permissions WHERE granter_id = ? AND grantee_id = ?',
        (granter_id, grantee_id),
    ).fetchone()

    if row:
        return row['permission_level']
    return DEFAULT_PERMISSION_LEVEL


def set_permission_level(granter_id, grantee_id, level):
    """Set the permission level granter gives to grantee."""
    if level not in PERMISSION_LEVELS:
        raise ValueError(f'Invalid permission level: {level}')

    db = get_db()
    db.execute(
        """
        INSERT INTO permissions (granter_id, grantee_id, permission_level, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(granter_id, grantee_id) DO UPDATE SET
            permission_level = excluded.permission_level,
            updated_at = excluded.updated_at
    """,
        (granter_id, grantee_id, level, datetime.utcnow()),
    )
    db.commit()


# ===================
# User Helpers
# ===================


def get_user_by_id(user_id):
    """Get user by ID from database."""
    db = get_db()
    row = db.execute(
        'SELECT id, email, name, created_at FROM users WHERE id = ?', (user_id,)
    ).fetchone()
    if row:
        return {
            'id': row['id'],
            'email': row['email'],
            'name': row['name'],
            'created_at': row['created_at'],
        }
    return None


def get_user_by_email(email):
    """Get user by email from database."""
    db = get_db()
    row = db.execute(
        'SELECT id, email, name, password_hash, google_id, created_at FROM users WHERE email = ?',
        (email.lower(),),
    ).fetchone()
    if row:
        return {
            'id': row['id'],
            'email': row['email'],
            'name': row['name'],
            'password_hash': row['password_hash'],
            'google_id': row['google_id'],
            'created_at': row['created_at'],
        }
    return None


def get_user_contacts(user_id):
    """Get list of contact user IDs for a user (accepted contacts only)."""
    db = get_db()
    # Get contacts where user is requester or recipient, status is accepted
    rows = db.execute(
        """
        SELECT
            CASE WHEN requester_id = ? THEN recipient_id ELSE requester_id END as contact_id
        FROM contacts
        WHERE (requester_id = ? OR recipient_id = ?) AND status = 'accepted'
    """,
        (user_id, user_id, user_id),
    ).fetchall()
    return [row['contact_id'] for row in rows]


# ===================
# Authentication
# ===================


def get_current_user():
    """Get current user from Authorization header."""
    auth_header = request.headers.get('Authorization', '')

    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header[7:]
    user_id = verify_token(token)

    if not user_id:
        return None

    return get_user_by_id(user_id)


def require_auth(f):
    """Decorator to require authentication."""

    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
        g.current_user = user
        return f(*args, **kwargs)

    return decorated


# ===================
# API Routes - General
# ===================


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '').strip()

    # Validation
    if not email or '@' not in email:
        return jsonify({'error': 'Valid email is required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    # Check if email already exists
    if get_user_by_email(email):
        return jsonify({'error': 'Email already registered'}), 409

    # Create user
    user_id = secrets.token_hex(8)  # 16-char hex ID
    password_hash = generate_password_hash(password)

    db = get_db()
    db.execute(
        'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
        (user_id, email, password_hash, name),
    )
    db.commit()

    # Generate token
    token = generate_token(user_id)

    return jsonify({'user': {'id': user_id, 'email': email, 'name': name}, 'token': token}), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login with email and password."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    # Find user
    user = get_user_by_email(email)
    if not user:
        return jsonify({'error': 'Invalid email or password'}), 401

    # Check password
    if not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password'}), 401

    # Get public key status
    db = get_db()
    row = db.execute('SELECT public_key FROM users WHERE id = ?', (user['id'],)).fetchone()
    has_public_key = row and row['public_key'] is not None
    server_public_key = row['public_key'] if row else None

    # Generate token
    token = generate_token(user['id'])

    return jsonify(
        {
            'user': {'id': user['id'], 'email': user['email'], 'name': user['name']},
            'token': token,
            'hasPublicKey': has_public_key,
            'publicKey': server_public_key,
        }
    )


@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    """
    Authenticate via Google OAuth.

    Accepts a Google ID token, verifies it with Google's servers,
    and returns a session token. Creates a new user if email not found,
    or links Google ID to existing account if email matches.

    Request:
        { "id_token": "eyJ..." }

    Response:
        {
            "user": { "id", "email", "name" },
            "token": "session_token",
            "isNew": true/false,
            "hasPublicKey": true/false,
            "hasServerBackup": true/false
        }
    """
    if not GOOGLE_CLIENT_ID and not TESTING_MODE:
        return jsonify({'error': 'Google OAuth not configured'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    token = data.get('id_token')
    if not token:
        return jsonify({'error': 'Missing id_token'}), 400

    # In testing mode, accept test tokens with format "test:email:name:google_id"
    if TESTING_MODE and token.startswith('test:'):
        parts = token.split(':')
        if len(parts) >= 4:
            email = parts[1].lower()
            name = parts[2]
            google_id = parts[3]
        else:
            return jsonify({'error': 'Invalid test token format'}), 400
    else:
        try:
            # Verify the token with Google
            idinfo = google_id_token.verify_oauth2_token(
                token, google_requests.Request(), GOOGLE_CLIENT_ID
            )

            # Get user info from token
            email = idinfo.get('email', '').lower()
            name = idinfo.get('name', email.split('@')[0])
            google_id = idinfo.get('sub')  # Google's unique user ID

            if not email:
                return jsonify({'error': 'No email in token'}), 400

        except ValueError as e:
            # Invalid token
            return jsonify({'error': f'Invalid token: {str(e)}'}), 401

    db = get_db()
    is_new = False

    # First, check if user exists by email
    user = get_user_by_email(email)

    if user:
        # Existing user - link Google ID if not already linked
        if not user.get('google_id'):
            db.execute(
                'UPDATE users SET google_id = ? WHERE id = ?',
                (google_id, user['id']),
            )
            db.commit()
    else:
        # New user - create account
        is_new = True
        user_id = secrets.token_hex(8)

        # For OAuth users, we set a placeholder password hash
        # They can't log in with password, only OAuth
        placeholder_hash = 'oauth:' + google_id

        db.execute(
            'INSERT INTO users (id, email, password_hash, name, google_id) VALUES (?, ?, ?, ?, ?)',
            (user_id, email, placeholder_hash, name, google_id),
        )
        db.commit()

        user = {'id': user_id, 'email': email, 'name': name}

    # Get additional user info
    row = db.execute(
        'SELECT public_key, encrypted_identity FROM users WHERE id = ?', (user['id'],)
    ).fetchone()
    has_public_key = row and row['public_key'] is not None
    has_server_backup = row and row['encrypted_identity'] is not None

    # Generate session token
    session_token = generate_token(user['id'])

    return jsonify(
        {
            'user': {'id': user['id'], 'email': user['email'], 'name': user['name']},
            'token': session_token,
            'isNew': is_new,
            'hasPublicKey': has_public_key,
            'hasServerBackup': has_server_backup,
        }
    )


@app.route('/api/me', methods=['GET'])
@require_auth
def get_current_user_info():
    """Get current user info."""
    user = g.current_user
    return jsonify({'id': user['id'], 'name': user['name'], 'email': user['email']})


@app.route('/api/auth/delete-account', methods=['POST'])
@require_auth
def delete_account():
    """Permanently delete user account. Requires password confirmation."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    password = data.get('password', '')
    if not password:
        return jsonify({'error': 'Password required to confirm account deletion'}), 400

    user = g.current_user
    user_id = user['id']

    # Fetch password hash (not included in g.current_user for security)
    db = get_db()
    row = db.execute('SELECT password_hash FROM users WHERE id = ?', (user_id,)).fetchone()
    if not row:
        return jsonify({'error': 'User not found'}), 404

    # Verify password
    if not check_password_hash(row['password_hash'], password):
        return jsonify({'error': 'Incorrect password'}), 401

    # Delete all user data
    db.execute(
        'DELETE FROM encrypted_locations WHERE from_user_id = ? OR to_user_id = ?',
        (user_id, user_id),
    )
    db.execute(
        'DELETE FROM permissions WHERE granter_id = ? OR grantee_id = ?',
        (user_id, user_id),
    )
    db.execute(
        'DELETE FROM contacts WHERE requester_id = ? OR recipient_id = ?',
        (user_id, user_id),
    )
    db.execute('DELETE FROM users WHERE id = ?', (user_id,))
    db.commit()

    return jsonify({'success': True, 'message': 'Account deleted'})


@app.route('/api/permission-levels', methods=['GET'])
def get_permission_levels():
    """Get available permission levels."""
    return jsonify({'levels': PERMISSION_LEVELS, 'default': DEFAULT_PERMISSION_LEVEL})


# ===================
# API Routes - Encrypted Location (E2E Encryption)
# ===================


@app.route('/api/identity/register', methods=['POST'])
@require_auth
def register_public_key():
    """Register or update user's public key for E2E encryption."""
    user = g.current_user
    data = request.get_json()

    if not data or 'publicKey' not in data:
        return jsonify({'error': 'Missing publicKey'}), 400

    public_key = data['publicKey']

    # Validate: should be base64, 44 chars (32 bytes encoded)
    if not public_key or len(public_key) != 44:
        return jsonify({'error': 'Invalid public key format'}), 400

    db = get_db()
    db.execute('UPDATE users SET public_key = ? WHERE id = ?', (public_key, user['id']))
    db.commit()

    return jsonify({'success': True})


@app.route('/api/contacts/<contact_id>/public-key', methods=['GET'])
@require_auth
def get_contact_public_key(contact_id):
    """Get a contact's public key for encryption."""
    user = g.current_user

    # Verify contact relationship exists
    contact_ids = get_user_contacts(user['id'])
    if contact_id not in contact_ids:
        return jsonify({'error': 'Not a contact'}), 403

    db = get_db()
    row = db.execute('SELECT public_key, name FROM users WHERE id = ?', (contact_id,)).fetchone()

    if not row:
        return jsonify({'error': 'Contact not found'}), 404

    return jsonify({'publicKey': row['public_key'], 'name': row['name']})


@app.route('/api/location/encrypted', methods=['POST'])
@require_auth
def publish_encrypted_locations():
    """Publish encrypted location blobs for contacts."""
    user = g.current_user
    data = request.get_json()

    if not data or 'locations' not in data:
        return jsonify({'error': 'Missing locations'}), 400

    locations = data['locations']
    if not isinstance(locations, list):
        return jsonify({'error': 'locations must be an array'}), 400

    db = get_db()
    for loc in locations:
        contact_id = loc.get('contactId')
        blob = loc.get('blob')

        if not contact_id or not blob:
            continue

        # Verify contact relationship
        contact_ids = get_user_contacts(user['id'])
        if contact_id not in contact_ids:
            continue

        db.execute(
            """
            INSERT INTO encrypted_locations (from_user_id, to_user_id, encrypted_blob, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(from_user_id, to_user_id) DO UPDATE SET
                encrypted_blob = excluded.encrypted_blob,
                updated_at = excluded.updated_at
        """,
            (user['id'], contact_id, json.dumps(blob), datetime.utcnow()),
        )

    db.commit()
    return jsonify({'success': True, 'count': len(locations)})


@app.route('/api/contacts/encrypted', methods=['GET'])
@require_auth
def get_contacts_encrypted():
    """Get contacts with their encrypted location blobs."""
    user = g.current_user
    contact_ids = get_user_contacts(user['id'])

    if not contact_ids:
        return jsonify({'contacts': []})

    db = get_db()
    contacts = []
    expiry_time = datetime.utcnow() - timedelta(minutes=LOCATION_EXPIRY_MINUTES)

    for contact_id in contact_ids:
        contact = get_user_by_id(contact_id)
        if not contact:
            continue

        # Get contact's public key
        row = db.execute('SELECT public_key FROM users WHERE id = ?', (contact_id,)).fetchone()
        public_key = row['public_key'] if row else None

        # Get permission levels
        granted_level = get_permission_level(user['id'], contact_id)
        received_level = get_permission_level(contact_id, user['id'])

        # Get encrypted location blob from this contact to me
        enc_row = db.execute(
            'SELECT encrypted_blob, updated_at FROM encrypted_locations WHERE from_user_id = ? AND to_user_id = ?',
            (contact_id, user['id']),
        ).fetchone()

        contact_data = {
            'id': contact['id'],
            'name': contact['name'],
            'publicKey': public_key,
            'permissionGranted': granted_level,
            'permissionReceived': received_level,
            'encryptedLocation': None,
        }

        if enc_row:
            updated_at = enc_row['updated_at']
            is_stale = updated_at and updated_at < expiry_time

            try:
                blob = json.loads(enc_row['encrypted_blob'])
            except json.JSONDecodeError:
                blob = None

            contact_data['encryptedLocation'] = {
                'blob': blob,
                'updated_at': format_timestamp(updated_at),
                'stale': is_stale,
            }

        contacts.append(contact_data)

    return jsonify({'contacts': contacts})


# ===================
# API Routes - Contacts
# ===================


@app.route('/api/contacts/request', methods=['POST'])
@require_auth
def send_contact_request():
    """Send a contact request to another user by email."""
    user = g.current_user
    data = request.get_json()

    if not data or 'email' not in data:
        return jsonify({'error': 'Email is required'}), 400

    email = data['email'].strip().lower()

    # Find target user
    target = get_user_by_email(email)
    if not target:
        return jsonify({'error': 'User not found'}), 404

    if target['id'] == user['id']:
        return jsonify({'error': 'Cannot add yourself as a contact'}), 400

    # Check if already contacts or request pending
    db = get_db()
    existing = db.execute(
        """
        SELECT status FROM contacts
        WHERE (requester_id = ? AND recipient_id = ?)
           OR (requester_id = ? AND recipient_id = ?)
    """,
        (user['id'], target['id'], target['id'], user['id']),
    ).fetchone()

    if existing:
        if existing['status'] == 'accepted':
            return jsonify({'error': 'Already contacts'}), 409
        elif existing['status'] == 'pending':
            return jsonify({'error': 'Request already pending'}), 409

    # Create request
    db.execute(
        'INSERT INTO contacts (requester_id, recipient_id, status) VALUES (?, ?, ?)',
        (user['id'], target['id'], 'pending'),
    )
    db.commit()

    return jsonify({'success': True, 'message': f'Contact request sent to {target["name"]}'}), 201


@app.route('/api/contacts/requests', methods=['GET'])
@require_auth
def get_pending_requests():
    """Get pending contact requests (incoming and outgoing)."""
    user = g.current_user
    db = get_db()

    # Incoming requests
    incoming = db.execute(
        """
        SELECT c.id, c.requester_id, u.name, u.email, c.created_at
        FROM contacts c
        JOIN users u ON c.requester_id = u.id
        WHERE c.recipient_id = ? AND c.status = 'pending'
    """,
        (user['id'],),
    ).fetchall()

    # Outgoing requests
    outgoing = db.execute(
        """
        SELECT c.id, c.recipient_id, u.name, u.email, c.created_at
        FROM contacts c
        JOIN users u ON c.recipient_id = u.id
        WHERE c.requester_id = ? AND c.status = 'pending'
    """,
        (user['id'],),
    ).fetchall()

    return jsonify(
        {
            'incoming': [
                {
                    'requestId': row['id'],
                    'userId': row['requester_id'],
                    'name': row['name'],
                    'email': row['email'],
                    'createdAt': format_timestamp(row['created_at']),
                }
                for row in incoming
            ],
            'outgoing': [
                {
                    'requestId': row['id'],
                    'userId': row['recipient_id'],
                    'name': row['name'],
                    'email': row['email'],
                    'createdAt': format_timestamp(row['created_at']),
                }
                for row in outgoing
            ],
        }
    )


@app.route('/api/contacts/requests/<int:request_id>/accept', methods=['POST'])
@require_auth
def accept_contact_request(request_id):
    """Accept a pending contact request."""
    user = g.current_user
    db = get_db()

    # Verify request exists and user is recipient
    row = db.execute(
        'SELECT * FROM contacts WHERE id = ? AND recipient_id = ? AND status = ?',
        (request_id, user['id'], 'pending'),
    ).fetchone()

    if not row:
        return jsonify({'error': 'Request not found'}), 404

    # Accept request
    db.execute(
        'UPDATE contacts SET status = ?, accepted_at = ? WHERE id = ?',
        ('accepted', datetime.utcnow(), request_id),
    )
    db.commit()

    requester = get_user_by_id(row['requester_id'])
    return jsonify({'success': True, 'contact': {'id': requester['id'], 'name': requester['name']}})


@app.route('/api/contacts/requests/<int:request_id>/decline', methods=['POST'])
@require_auth
def decline_contact_request(request_id):
    """Decline a pending contact request."""
    user = g.current_user
    db = get_db()

    # Verify request exists and user is recipient
    row = db.execute(
        'SELECT * FROM contacts WHERE id = ? AND recipient_id = ? AND status = ?',
        (request_id, user['id'], 'pending'),
    ).fetchone()

    if not row:
        return jsonify({'error': 'Request not found'}), 404

    # Delete request
    db.execute('DELETE FROM contacts WHERE id = ?', (request_id,))
    db.commit()

    return jsonify({'success': True})


@app.route('/api/contacts/requests/<int:request_id>/cancel', methods=['POST'])
@require_auth
def cancel_contact_request(request_id):
    """Cancel a pending contact request sent by current user."""
    user = g.current_user
    db = get_db()

    # Verify request exists and user is the requester
    row = db.execute(
        'SELECT * FROM contacts WHERE id = ? AND requester_id = ? AND status = ?',
        (request_id, user['id'], 'pending'),
    ).fetchone()

    if not row:
        return jsonify({'error': 'Request not found'}), 404

    # Delete request
    db.execute('DELETE FROM contacts WHERE id = ?', (request_id,))
    db.commit()

    return jsonify({'success': True})


@app.route('/api/contacts/<contact_id>', methods=['DELETE'])
@require_auth
def remove_contact(contact_id):
    """Remove a contact."""
    user = g.current_user
    db = get_db()

    # Delete the contact relationship
    result = db.execute(
        """
        DELETE FROM contacts
        WHERE ((requester_id = ? AND recipient_id = ?)
           OR (requester_id = ? AND recipient_id = ?))
          AND status = 'accepted'
    """,
        (user['id'], contact_id, contact_id, user['id']),
    )
    db.commit()

    if result.rowcount == 0:
        return jsonify({'error': 'Contact not found'}), 404

    # Also remove permission grants
    db.execute(
        'DELETE FROM permissions WHERE granter_id = ? AND grantee_id = ?', (user['id'], contact_id)
    )
    db.execute(
        'DELETE FROM permissions WHERE granter_id = ? AND grantee_id = ?', (contact_id, user['id'])
    )
    db.commit()

    return jsonify({'success': True})


@app.route('/api/contacts', methods=['GET'])
@require_auth
def get_contacts():
    """Get list of contacts with permission info."""
    user = g.current_user
    contact_ids = get_user_contacts(user['id'])

    contacts = []
    for contact_id in contact_ids:
        contact = get_user_by_id(contact_id)
        if contact:
            # Get permission I've granted to this contact
            granted_level = get_permission_level(user['id'], contact_id)
            # Get permission this contact has granted to me
            received_level = get_permission_level(contact_id, user['id'])

            contacts.append(
                {
                    'id': contact['id'],
                    'name': contact['name'],
                    'permissionGranted': granted_level,  # What they can see of my location
                    'permissionReceived': received_level,  # What I can see of their location
                }
            )

    return jsonify({'contacts': contacts})


@app.route('/api/contacts/<contact_id>/permission', methods=['GET'])
@require_auth
def get_contact_permission(contact_id):
    """Get permission level for a specific contact."""
    user = g.current_user

    # Verify contact exists
    contact_ids = get_user_contacts(user['id'])
    if contact_id not in contact_ids:
        return jsonify({'error': 'Not a contact'}), 403

    granted_level = get_permission_level(user['id'], contact_id)
    received_level = get_permission_level(contact_id, user['id'])

    return jsonify(
        {
            'contactId': contact_id,
            'permissionGranted': granted_level,
            'permissionReceived': received_level,
        }
    )


@app.route('/api/contacts/<contact_id>/permission', methods=['PUT'])
@require_auth
def update_contact_permission(contact_id):
    """Update permission level for a contact."""
    user = g.current_user
    data = request.get_json()

    # Verify contact exists
    contact_ids = get_user_contacts(user['id'])
    if contact_id not in contact_ids:
        return jsonify({'error': 'Not a contact'}), 403

    if not data or 'level' not in data:
        return jsonify({'error': 'Missing level'}), 400

    level = data['level']
    if level not in PERMISSION_LEVELS:
        return jsonify({'error': f'Invalid level. Must be one of: {PERMISSION_LEVELS}'}), 400

    set_permission_level(user['id'], contact_id, level)

    return jsonify({'success': True, 'contactId': contact_id, 'permissionGranted': level})


# ===================
# Error Handlers
# ===================


@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


# ===================
# CORS Support (for development)
# ===================


@app.after_request
def after_request(response):
    """Add CORS headers, version header, and cache control for API routes."""
    origin = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Expose-Headers'] = 'X-App-Version, X-Min-App-Version'
    response.headers['X-App-Version'] = APP_VERSION
    response.headers['X-Min-App-Version'] = MIN_APP_VERSION

    # Prevent browser caching of API responses to avoid stale data issues
    # (e.g., showing already-accepted invitations that fail when clicked)
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'

    return response


@app.route('/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    """Handle CORS preflight requests."""
    return '', 204


# ===================
# Static File Serving (Production)
# ===================


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    """Serve static PWA files when SERVE_STATIC is enabled."""
    if not SERVE_STATIC:
        return jsonify({'error': 'Static serving disabled'}), 404

    # Don't serve static for API routes (shouldn't reach here, but safety check)
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404

    # Serve requested file or index.html for SPA routing
    if path and (STATIC_DIR / path).is_file():
        return send_from_directory(STATIC_DIR, path)

    # Default to index.html
    return send_from_directory(STATIC_DIR, 'index.html')


# ===================
# Main Entry Point
# ===================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8500))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Whereish Backend Server (Milestone 5)                      ║
║                                                              ║
║   Local:   http://localhost:{port}                            ║
║   Health:  http://localhost:{port}/api/health                 ║
║                                                              ║
║   Test tokens: GET /api/auth/test-tokens                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")

    app.run(host='0.0.0.0', port=port, debug=debug)
