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
import html
import json
import os
import secrets
import sqlite3
import warnings
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
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

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            platform TEXT,
            is_active BOOLEAN DEFAULT FALSE,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_devices_user_id
        ON devices(user_id);

        CREATE TABLE IF NOT EXISTS transfers (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            source_user_id TEXT NOT NULL,
            source_device_id TEXT NOT NULL,
            target_device_id TEXT,
            target_device_name TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            encrypted_identity TEXT,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (source_user_id) REFERENCES users(id),
            FOREIGN KEY (source_device_id) REFERENCES devices(id)
        );

        CREATE INDEX IF NOT EXISTS idx_transfers_code
        ON transfers(code);

        CREATE INDEX IF NOT EXISTS idx_transfers_source_user
        ON transfers(source_user_id);
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
# Device Helpers
# ===================


def generate_device_id():
    """Generate a unique device ID."""
    return secrets.token_hex(16)


def register_device(user_id, device_name, platform=None, device_id=None):
    """Register a new device for a user.

    Returns the device record. First device for a user becomes active by default.
    """
    db = get_db()

    # Generate device ID if not provided
    if not device_id:
        device_id = generate_device_id()

    # Check if user has any devices already
    existing = db.execute(
        'SELECT COUNT(*) as count FROM devices WHERE user_id = ?', (user_id,)
    ).fetchone()
    is_first_device = existing['count'] == 0

    # Insert device (first device is active by default)
    db.execute(
        """INSERT INTO devices (id, user_id, name, platform, is_active, last_seen)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (device_id, user_id, device_name, platform, is_first_device, datetime.utcnow()),
    )
    db.commit()

    return {
        'id': device_id,
        'name': device_name,
        'platform': platform,
        'isActive': is_first_device,
    }


def get_user_devices(user_id):
    """Get all devices for a user."""
    db = get_db()
    rows = db.execute(
        """SELECT id, name, platform, is_active, last_seen, created_at
           FROM devices WHERE user_id = ? ORDER BY created_at DESC""",
        (user_id,),
    ).fetchall()

    return [
        {
            'id': row['id'],
            'name': row['name'],
            'platform': row['platform'],
            'isActive': bool(row['is_active']),
            'lastSeen': format_timestamp(row['last_seen']),
            'createdAt': format_timestamp(row['created_at']),
        }
        for row in rows
    ]


def set_active_device(user_id, device_id):
    """Set a device as the active device for location sharing.

    Only one device can be active at a time.
    """
    db = get_db()

    # Verify device belongs to user
    row = db.execute(
        'SELECT id FROM devices WHERE id = ? AND user_id = ?', (device_id, user_id)
    ).fetchone()
    if not row:
        return False

    # Deactivate all devices for this user
    db.execute('UPDATE devices SET is_active = FALSE WHERE user_id = ?', (user_id,))

    # Activate the specified device
    db.execute(
        'UPDATE devices SET is_active = TRUE, last_seen = ? WHERE id = ?',
        (datetime.utcnow(), device_id),
    )
    db.commit()
    return True


def delete_device(user_id, device_id):
    """Delete a device from user's device list.

    Returns True if deleted, False if not found.
    """
    db = get_db()

    result = db.execute('DELETE FROM devices WHERE id = ? AND user_id = ?', (device_id, user_id))
    db.commit()
    return result.rowcount > 0


def update_device_last_seen(device_id):
    """Update the last_seen timestamp for a device."""
    db = get_db()
    db.execute('UPDATE devices SET last_seen = ? WHERE id = ?', (datetime.utcnow(), device_id))
    db.commit()


# ===================
# Transfer Helpers
# ===================

# Transfer session expiry (minutes)
TRANSFER_EXPIRY_MINUTES = 10


def generate_transfer_code():
    """Generate a 6-digit transfer code."""
    return ''.join(str(secrets.randbelow(10)) for _ in range(6))


def create_transfer_session(user_id, source_device_id):
    """Create a new transfer session.

    Returns the transfer record with code for sharing.
    """
    db = get_db()

    # Generate unique transfer ID and code
    transfer_id = secrets.token_hex(16)
    code = generate_transfer_code()

    # Ensure code is unique (very unlikely to collide, but be safe)
    while db.execute('SELECT id FROM transfers WHERE code = ?', (code,)).fetchone():
        code = generate_transfer_code()

    # Set expiry time
    expires_at = datetime.utcnow() + timedelta(minutes=TRANSFER_EXPIRY_MINUTES)

    db.execute(
        """INSERT INTO transfers (id, code, source_user_id, source_device_id, status, expires_at)
           VALUES (?, ?, ?, ?, 'pending', ?)""",
        (transfer_id, code, user_id, source_device_id, expires_at),
    )
    db.commit()

    return {
        'id': transfer_id,
        'code': code,
        'status': 'pending',
        'expiresAt': format_timestamp(expires_at),
    }


def get_transfer_by_code(code):
    """Get transfer by code (for target device to claim)."""
    db = get_db()
    row = db.execute(
        """SELECT t.*, u.name as source_user_name, d.name as source_device_name
           FROM transfers t
           JOIN users u ON t.source_user_id = u.id
           JOIN devices d ON t.source_device_id = d.id
           WHERE t.code = ? AND t.expires_at > ?""",
        (code, datetime.utcnow()),
    ).fetchone()

    if not row:
        return None

    return dict(row)


def get_transfer_by_id(transfer_id, user_id=None):
    """Get transfer by ID (for status checking)."""
    db = get_db()
    query = 'SELECT * FROM transfers WHERE id = ?'
    params = [transfer_id]

    if user_id:
        query += ' AND source_user_id = ?'
        params.append(user_id)

    row = db.execute(query, params).fetchone()
    return dict(row) if row else None


def claim_transfer(transfer_id, target_device_id, target_device_name):
    """Claim a transfer session (target device)."""
    db = get_db()

    # Check transfer exists and is pending
    transfer = get_transfer_by_id(transfer_id)
    if not transfer:
        return None
    if transfer['status'] != 'pending':
        return None

    # Update with target device info
    db.execute(
        """UPDATE transfers SET target_device_id = ?, target_device_name = ?, status = 'claimed'
           WHERE id = ? AND status = 'pending'""",
        (target_device_id, target_device_name, transfer_id),
    )
    db.commit()

    return get_transfer_by_id(transfer_id)


def approve_transfer(transfer_id, user_id, encrypted_identity):
    """Approve a transfer and provide encrypted identity (source device)."""
    db = get_db()

    # Verify transfer belongs to user and is claimed
    transfer = get_transfer_by_id(transfer_id, user_id)
    if not transfer:
        return None
    if transfer['status'] != 'claimed':
        return None

    db.execute(
        """UPDATE transfers SET encrypted_identity = ?, status = 'approved'
           WHERE id = ? AND source_user_id = ? AND status = 'claimed'""",
        (encrypted_identity, transfer_id, user_id),
    )
    db.commit()

    return get_transfer_by_id(transfer_id, user_id)


def complete_transfer(transfer_id):
    """Mark a transfer as completed (target device received identity)."""
    db = get_db()
    db.execute(
        "UPDATE transfers SET status = 'completed' WHERE id = ? AND status = 'approved'",
        (transfer_id,),
    )
    db.commit()


def cancel_transfer(transfer_id, user_id):
    """Cancel a transfer (source device)."""
    db = get_db()
    result = db.execute(
        'DELETE FROM transfers WHERE id = ? AND source_user_id = ?',
        (transfer_id, user_id),
    )
    db.commit()
    return result.rowcount > 0


def cleanup_expired_transfers():
    """Remove expired transfer sessions."""
    db = get_db()
    db.execute('DELETE FROM transfers WHERE expires_at < ?', (datetime.utcnow(),))
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
    """Register a new user.

    DEPRECATED: Use /api/auth/google for new registrations.
    This endpoint remains for backwards compatibility with existing users.
    """
    warnings.warn(
        'Email/password registration is deprecated. Use Google OAuth instead.',
        DeprecationWarning,
        stacklevel=2,
    )
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
    """Login with email and password.

    DEPRECATED: Use /api/auth/google for authentication.
    This endpoint remains for backwards compatibility with existing users.
    """
    warnings.warn(
        'Email/password login is deprecated. Use Google OAuth instead.',
        DeprecationWarning,
        stacklevel=2,
    )
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
        {
            "id_token": "eyJ...",
            "device": { "name": "My iPhone", "platform": "ios" }  // optional
        }

    Response:
        {
            "user": { "id", "email", "name" },
            "token": "session_token",
            "isNew": true/false,
            "hasPublicKey": true/false,
            "hasServerBackup": true/false,
            "device": { "id", "name", "platform", "isActive" }  // if device provided
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

    # Build response
    response_data = {
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name']},
        'token': session_token,
        'isNew': is_new,
        'hasPublicKey': has_public_key,
        'hasServerBackup': has_server_backup,
    }

    # Register device if provided
    device_data = data.get('device')
    if device_data and isinstance(device_data, dict):
        device_name = device_data.get('name', '').strip()
        device_platform = device_data.get('platform', '').strip() or None

        if device_name:
            device = register_device(user['id'], device_name, device_platform)
            response_data['device'] = device

    return jsonify(response_data)


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


@app.route('/api/identity/backup', methods=['POST'])
@require_auth
def store_identity_backup():
    """Store encrypted identity backup on server.

    The server stores this blob encrypted - it cannot decrypt it.
    Only the user with their PIN can decrypt this data.
    """
    user = g.current_user
    data = request.get_json()

    if not data or 'encryptedIdentity' not in data:
        return jsonify({'error': 'Missing encryptedIdentity'}), 400

    encrypted_identity = data['encryptedIdentity']

    # Basic validation - should be a non-empty string (JSON blob)
    if not encrypted_identity or not isinstance(encrypted_identity, str):
        return jsonify({'error': 'Invalid encrypted identity format'}), 400

    # Size limit - 10KB should be plenty for encrypted identity
    if len(encrypted_identity) > 10240:
        return jsonify({'error': 'Encrypted identity too large'}), 400

    db = get_db()
    db.execute(
        'UPDATE users SET encrypted_identity = ? WHERE id = ?',
        (encrypted_identity, user['id']),
    )
    db.commit()

    return jsonify({'success': True})


@app.route('/api/identity/backup', methods=['GET'])
@require_auth
def get_identity_backup():
    """Retrieve encrypted identity backup from server.

    Returns the encrypted blob that was stored. User must decrypt with PIN.
    """
    user = g.current_user

    db = get_db()
    row = db.execute('SELECT encrypted_identity FROM users WHERE id = ?', (user['id'],)).fetchone()

    if not row or not row['encrypted_identity']:
        return jsonify({'error': 'No backup found'}), 404

    return jsonify({'encryptedIdentity': row['encrypted_identity']})


@app.route('/api/identity/backup', methods=['DELETE'])
@require_auth
def delete_identity_backup():
    """Remove encrypted identity backup from server."""
    user = g.current_user

    db = get_db()
    db.execute('UPDATE users SET encrypted_identity = NULL WHERE id = ?', (user['id'],))
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
            'email': contact['email'],
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
# API Routes - Devices
# ===================


@app.route('/api/devices', methods=['GET'])
@require_auth
def list_devices():
    """Get list of user's devices."""
    user = g.current_user
    devices = get_user_devices(user['id'])
    return jsonify({'devices': devices})


@app.route('/api/devices', methods=['POST'])
@require_auth
def add_device():
    """Register a new device.

    Request:
        { "name": "My iPhone", "platform": "ios" }

    Response:
        { "device": { "id", "name", "platform", "isActive" } }
    """
    user = g.current_user
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    name = data.get('name', '').strip()
    platform = data.get('platform', '').strip() or None

    if not name:
        return jsonify({'error': 'Device name is required'}), 400

    if len(name) > 50:
        return jsonify({'error': 'Device name too long (max 50 chars)'}), 400

    device = register_device(user['id'], name, platform)
    return jsonify({'device': device}), 201


@app.route('/api/devices/<device_id>/activate', methods=['POST'])
@require_auth
def activate_device(device_id):
    """Set a device as the active location-sharing device.

    Only one device can be active at a time. The active device is the one
    that reports location to contacts.
    """
    user = g.current_user

    if not set_active_device(user['id'], device_id):
        return jsonify({'error': 'Device not found'}), 404

    return jsonify({'success': True, 'deviceId': device_id})


@app.route('/api/devices/<device_id>', methods=['DELETE'])
@require_auth
def remove_device(device_id):
    """Remove a device from user's device list."""
    user = g.current_user

    if not delete_device(user['id'], device_id):
        return jsonify({'error': 'Device not found'}), 404

    return jsonify({'success': True})


# ===================
# API Routes - Identity Transfer
# ===================


@app.route('/api/transfers', methods=['POST'])
@require_auth
def create_transfer():
    """Create a new identity transfer session.

    Source device calls this to start a transfer.
    Returns a 6-digit code to share with target device.

    Request:
        { "deviceId": "source_device_id" }

    Response:
        { "id": "transfer_id", "code": "123456", "status": "pending", "expiresAt": "..." }
    """
    user = g.current_user
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    device_id = data.get('deviceId')
    if not device_id:
        return jsonify({'error': 'Device ID is required'}), 400

    # Verify device belongs to user
    devices = get_user_devices(user['id'])
    if not any(d['id'] == device_id for d in devices):
        return jsonify({'error': 'Device not found'}), 404

    # Cleanup expired transfers first
    cleanup_expired_transfers()

    # Create transfer session
    transfer = create_transfer_session(user['id'], device_id)

    return jsonify(transfer), 201


@app.route('/api/transfers/<transfer_id>', methods=['GET'])
@require_auth
def get_transfer_status(transfer_id):
    """Get transfer status (source device polling).

    Response includes target device info when claimed.
    """
    user = g.current_user

    transfer = get_transfer_by_id(transfer_id, user['id'])
    if not transfer:
        return jsonify({'error': 'Transfer not found'}), 404

    # Check if expired
    if datetime.fromisoformat(str(transfer['expires_at'])) < datetime.utcnow():
        return jsonify({'error': 'Transfer expired'}), 410

    response = {
        'id': transfer['id'],
        'status': transfer['status'],
        'expiresAt': format_timestamp(transfer['expires_at']),
    }

    # Include target device info if claimed
    if transfer['status'] in ('claimed', 'approved', 'completed'):
        response['targetDevice'] = {
            'id': transfer['target_device_id'],
            'name': transfer['target_device_name'],
        }

    return jsonify(response)


@app.route('/api/transfers/<transfer_id>/approve', methods=['POST'])
@require_auth
def approve_transfer_request(transfer_id):
    """Approve a claimed transfer (source device).

    Provides encrypted identity for target device.

    Request:
        { "encryptedIdentity": "..." }
    """
    user = g.current_user
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    encrypted_identity = data.get('encryptedIdentity')
    if not encrypted_identity:
        return jsonify({'error': 'Encrypted identity is required'}), 400

    transfer = approve_transfer(transfer_id, user['id'], encrypted_identity)
    if not transfer:
        return jsonify({'error': 'Transfer not found or not in claimed status'}), 404

    return jsonify(
        {
            'success': True,
            'status': transfer['status'],
        }
    )


@app.route('/api/transfers/<transfer_id>/cancel', methods=['POST'])
@require_auth
def cancel_transfer_request(transfer_id):
    """Cancel a transfer session (source device)."""
    user = g.current_user

    if not cancel_transfer(transfer_id, user['id']):
        return jsonify({'error': 'Transfer not found'}), 404

    return jsonify({'success': True})


@app.route('/api/transfers/claim', methods=['POST'])
def claim_transfer_request():
    """Claim a transfer using code (target device).

    Target device enters code from source device.
    No authentication required - this is how a new device joins.

    Request:
        { "code": "123456", "deviceName": "My iPhone", "devicePlatform": "ios" }

    Response:
        { "transferId": "...", "sourceUser": "...", "sourceDevice": "..." }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing request body'}), 400

    code = data.get('code', '').strip()
    device_name = data.get('deviceName', '').strip()

    if not code or len(code) != 6:
        return jsonify({'error': 'Invalid code format'}), 400

    if not device_name:
        return jsonify({'error': 'Device name is required'}), 400

    # Find transfer by code
    transfer = get_transfer_by_code(code)
    if not transfer:
        return jsonify({'error': 'Invalid or expired code'}), 404

    # Generate a temporary device ID for the target device
    # (will be properly registered after transfer completes)
    temp_device_id = secrets.token_hex(16)

    # Claim the transfer
    claimed = claim_transfer(transfer['id'], temp_device_id, device_name)
    if not claimed:
        return jsonify({'error': 'Transfer already claimed'}), 409

    return jsonify(
        {
            'transferId': transfer['id'],
            'tempDeviceId': temp_device_id,
            'sourceUser': transfer['source_user_name'],
            'sourceDevice': transfer['source_device_name'],
        }
    )


@app.route('/api/transfers/<transfer_id>/receive', methods=['GET'])
def receive_transfer_identity(transfer_id):
    """Receive encrypted identity (target device polling).

    Target device polls this after claiming until identity is available.
    No authentication - uses transfer ID as authorization.
    """
    transfer = get_transfer_by_id(transfer_id)
    if not transfer:
        return jsonify({'error': 'Transfer not found'}), 404

    # Check expiry
    if datetime.fromisoformat(str(transfer['expires_at'])) < datetime.utcnow():
        return jsonify({'error': 'Transfer expired'}), 410

    if transfer['status'] == 'claimed':
        # Still waiting for approval
        return jsonify(
            {
                'status': 'waiting',
                'message': 'Waiting for approval from source device',
            }
        )

    if transfer['status'] == 'approved':
        # Identity ready - return it
        identity = transfer['encrypted_identity']

        # Mark as completed
        complete_transfer(transfer_id)

        return jsonify(
            {
                'status': 'approved',
                'encryptedIdentity': identity,
            }
        )

    if transfer['status'] == 'completed':
        return jsonify({'error': 'Transfer already completed'}), 410

    return jsonify({'error': 'Invalid transfer status'}), 400


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

    # Default to index.html - inject configuration values
    return serve_index_html()


def serve_index_html():
    """Serve index.html with injected configuration values."""
    index_path = STATIC_DIR / 'index.html'
    if not index_path.is_file():
        return jsonify({'error': 'index.html not found'}), 404

    # Read and inject config (escape to prevent HTML injection)
    content = index_path.read_text()
    safe_client_id = html.escape(GOOGLE_CLIENT_ID or '')
    content = content.replace('__GOOGLE_CLIENT_ID__', safe_client_id)

    return Response(content, mimetype='text/html')


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
