"""
Whereish Backend Server
Milestone 4: Authentication + Milestone 5: Permissions

A minimal Flask server for location storage and retrieval.
Uses SQLite for prototype, designed to swap to Postgres/Firestore.

Key principles:
- Email/password authentication with JWT tokens
- Server filters location based on permission level
"""

import os
import json
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash

# ===================
# Configuration
# ===================

app = Flask(__name__)
app.config['DATABASE'] = os.environ.get('DATABASE_PATH', 'whereish.db')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Location expiry (how long before a location is considered stale)
LOCATION_EXPIRY_MINUTES = 30

# Token expiry
TOKEN_EXPIRY_DAYS = 30

# ===================
# Permission Levels
# ===================

# Ordered from least specific to most specific
# Index 0 = least detail, higher index = more detail
PERMISSION_LEVELS = [
    'planet',        # 0 - "Planet Earth" (effectively nothing)
    'continent',     # 1
    'country',       # 2
    'state',         # 3
    'county',        # 4
    'city',          # 5
    'neighborhood',  # 6 - Area/suburb/district
    'street',        # 7
    'address'        # 8 - Most specific
]

# Default permission level for new contacts
DEFAULT_PERMISSION_LEVEL = 'planet'

def get_permission_index(level):
    """Get numeric index for permission level."""
    try:
        return PERMISSION_LEVELS.index(level)
    except ValueError:
        return 0  # Default to planet

def filter_hierarchy_by_permission(hierarchy, permission_level):
    """
    Filter a location hierarchy based on permission level.
    Returns only the levels the viewer is allowed to see.
    """
    if not hierarchy:
        return {}

    allowed_index = get_permission_index(permission_level)
    filtered = {}

    # Map hierarchy keys to permission levels
    key_to_level = {
        'continent': 'continent',
        'country': 'country',
        'state': 'state',
        'county': 'county',
        'city': 'city',
        'neighborhood': 'neighborhood',
        'street': 'street',
        'address': 'address'
    }

    for key, value in hierarchy.items():
        level = key_to_level.get(key)
        if level:
            level_index = get_permission_index(level)
            if level_index <= allowed_index:
                filtered[key] = value

    return filtered

# ===================
# Token Management
# ===================

def generate_token(user_id):
    """Generate a simple token for authentication."""
    # Format: user_id:random_hex:timestamp_hex
    random_part = secrets.token_hex(16)
    timestamp = int(datetime.utcnow().timestamp())
    token_data = f"{user_id}:{random_part}:{timestamp:x}"
    # Sign with secret key
    signature = hashlib.sha256(
        (token_data + app.config['SECRET_KEY']).encode()
    ).hexdigest()[:16]
    return f"{token_data}:{signature}"


def verify_token(token):
    """Verify token and return user_id if valid."""
    try:
        parts = token.split(':')
        if len(parts) != 4:
            return None

        user_id, random_part, timestamp_hex, signature = parts
        token_data = f"{user_id}:{random_part}:{timestamp_hex}"

        # Verify signature
        expected_sig = hashlib.sha256(
            (token_data + app.config['SECRET_KEY']).encode()
        ).hexdigest()[:16]

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
        g.db = sqlite3.connect(
            app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
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
    db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS locations (
            user_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_locations_updated
        ON locations(updated_at);

        CREATE TABLE IF NOT EXISTS permissions (
            granter_id TEXT NOT NULL,
            grantee_id TEXT NOT NULL,
            permission_level TEXT NOT NULL DEFAULT 'planet',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (granter_id, grantee_id),
            FOREIGN KEY (granter_id) REFERENCES users(id),
            FOREIGN KEY (grantee_id) REFERENCES users(id)
        );
    ''')
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
        (granter_id, grantee_id)
    ).fetchone()

    if row:
        return row['permission_level']
    return DEFAULT_PERMISSION_LEVEL


def set_permission_level(granter_id, grantee_id, level):
    """Set the permission level granter gives to grantee."""
    if level not in PERMISSION_LEVELS:
        raise ValueError(f'Invalid permission level: {level}')

    db = get_db()
    db.execute('''
        INSERT INTO permissions (granter_id, grantee_id, permission_level, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(granter_id, grantee_id) DO UPDATE SET
            permission_level = excluded.permission_level,
            updated_at = excluded.updated_at
    ''', (granter_id, grantee_id, level, datetime.utcnow()))
    db.commit()

# ===================
# User Helpers
# ===================

def get_user_by_id(user_id):
    """Get user by ID from database."""
    db = get_db()
    row = db.execute(
        'SELECT id, email, name, created_at FROM users WHERE id = ?',
        (user_id,)
    ).fetchone()
    if row:
        return {
            'id': row['id'],
            'email': row['email'],
            'name': row['name'],
            'created_at': row['created_at']
        }
    return None


def get_user_by_email(email):
    """Get user by email from database."""
    db = get_db()
    row = db.execute(
        'SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?',
        (email.lower(),)
    ).fetchone()
    if row:
        return {
            'id': row['id'],
            'email': row['email'],
            'name': row['name'],
            'password_hash': row['password_hash'],
            'created_at': row['created_at']
        }
    return None


def get_user_contacts(user_id):
    """Get list of contact user IDs for a user (accepted contacts only)."""
    db = get_db()
    # Get contacts where user is requester or recipient, status is accepted
    rows = db.execute('''
        SELECT
            CASE WHEN requester_id = ? THEN recipient_id ELSE requester_id END as contact_id
        FROM contacts
        WHERE (requester_id = ? OR recipient_id = ?) AND status = 'accepted'
    ''', (user_id, user_id, user_id)).fetchall()
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
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat()
    })


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
        (user_id, email, password_hash, name)
    )
    db.commit()

    # Generate token
    token = generate_token(user_id)

    return jsonify({
        'user': {
            'id': user_id,
            'email': email,
            'name': name
        },
        'token': token
    }), 201


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

    # Generate token
    token = generate_token(user['id'])

    return jsonify({
        'user': {
            'id': user['id'],
            'email': user['email'],
            'name': user['name']
        },
        'token': token
    })


@app.route('/api/me', methods=['GET'])
@require_auth
def get_current_user_info():
    """Get current user info."""
    user = g.current_user
    return jsonify({
        'id': user['id'],
        'name': user['name']
    })


@app.route('/api/permission-levels', methods=['GET'])
def get_permission_levels():
    """Get available permission levels."""
    return jsonify({
        'levels': PERMISSION_LEVELS,
        'default': DEFAULT_PERMISSION_LEVEL
    })

# ===================
# API Routes - Location
# ===================

@app.route('/api/location', methods=['POST'])
@require_auth
def publish_location():
    """Publish current user's location."""
    user = g.current_user
    data = request.get_json()

    if not data or 'payload' not in data:
        return jsonify({'error': 'Missing payload'}), 400

    payload = data['payload']

    db = get_db()
    db.execute('''
        INSERT INTO locations (user_id, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
    ''', (user['id'], payload, datetime.utcnow()))
    db.commit()

    return jsonify({
        'success': True,
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/location', methods=['GET'])
@require_auth
def get_my_location():
    """Get current user's stored location."""
    user = g.current_user

    db = get_db()
    row = db.execute(
        'SELECT payload, updated_at FROM locations WHERE user_id = ?',
        (user['id'],)
    ).fetchone()

    if not row:
        return jsonify({'location': None})

    return jsonify({
        'location': {
            'payload': row['payload'],
            'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
        }
    })

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
    existing = db.execute('''
        SELECT status FROM contacts
        WHERE (requester_id = ? AND recipient_id = ?)
           OR (requester_id = ? AND recipient_id = ?)
    ''', (user['id'], target['id'], target['id'], user['id'])).fetchone()

    if existing:
        if existing['status'] == 'accepted':
            return jsonify({'error': 'Already contacts'}), 409
        elif existing['status'] == 'pending':
            return jsonify({'error': 'Request already pending'}), 409

    # Create request
    db.execute(
        'INSERT INTO contacts (requester_id, recipient_id, status) VALUES (?, ?, ?)',
        (user['id'], target['id'], 'pending')
    )
    db.commit()

    return jsonify({
        'success': True,
        'message': f'Contact request sent to {target["name"]}'
    }), 201


@app.route('/api/contacts/requests', methods=['GET'])
@require_auth
def get_pending_requests():
    """Get pending contact requests (incoming and outgoing)."""
    user = g.current_user
    db = get_db()

    # Incoming requests
    incoming = db.execute('''
        SELECT c.id, c.requester_id, u.name, u.email, c.created_at
        FROM contacts c
        JOIN users u ON c.requester_id = u.id
        WHERE c.recipient_id = ? AND c.status = 'pending'
    ''', (user['id'],)).fetchall()

    # Outgoing requests
    outgoing = db.execute('''
        SELECT c.id, c.recipient_id, u.name, u.email, c.created_at
        FROM contacts c
        JOIN users u ON c.recipient_id = u.id
        WHERE c.requester_id = ? AND c.status = 'pending'
    ''', (user['id'],)).fetchall()

    return jsonify({
        'incoming': [{
            'requestId': row['id'],
            'userId': row['requester_id'],
            'name': row['name'],
            'email': row['email'],
            'createdAt': row['created_at'].isoformat() if row['created_at'] else None
        } for row in incoming],
        'outgoing': [{
            'requestId': row['id'],
            'userId': row['recipient_id'],
            'name': row['name'],
            'email': row['email'],
            'createdAt': row['created_at'].isoformat() if row['created_at'] else None
        } for row in outgoing]
    })


@app.route('/api/contacts/requests/<int:request_id>/accept', methods=['POST'])
@require_auth
def accept_contact_request(request_id):
    """Accept a pending contact request."""
    user = g.current_user
    db = get_db()

    # Verify request exists and user is recipient
    row = db.execute(
        'SELECT * FROM contacts WHERE id = ? AND recipient_id = ? AND status = ?',
        (request_id, user['id'], 'pending')
    ).fetchone()

    if not row:
        return jsonify({'error': 'Request not found'}), 404

    # Accept request
    db.execute(
        'UPDATE contacts SET status = ?, accepted_at = ? WHERE id = ?',
        ('accepted', datetime.utcnow(), request_id)
    )
    db.commit()

    requester = get_user_by_id(row['requester_id'])
    return jsonify({
        'success': True,
        'contact': {
            'id': requester['id'],
            'name': requester['name']
        }
    })


@app.route('/api/contacts/requests/<int:request_id>/decline', methods=['POST'])
@require_auth
def decline_contact_request(request_id):
    """Decline a pending contact request."""
    user = g.current_user
    db = get_db()

    # Verify request exists and user is recipient
    row = db.execute(
        'SELECT * FROM contacts WHERE id = ? AND recipient_id = ? AND status = ?',
        (request_id, user['id'], 'pending')
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
    result = db.execute('''
        DELETE FROM contacts
        WHERE ((requester_id = ? AND recipient_id = ?)
           OR (requester_id = ? AND recipient_id = ?))
          AND status = 'accepted'
    ''', (user['id'], contact_id, contact_id, user['id']))
    db.commit()

    if result.rowcount == 0:
        return jsonify({'error': 'Contact not found'}), 404

    # Also remove permission grants
    db.execute('DELETE FROM permissions WHERE granter_id = ? AND grantee_id = ?',
               (user['id'], contact_id))
    db.execute('DELETE FROM permissions WHERE granter_id = ? AND grantee_id = ?',
               (contact_id, user['id']))
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

            contacts.append({
                'id': contact['id'],
                'name': contact['name'],
                'permissionGranted': granted_level,  # What they can see of my location
                'permissionReceived': received_level  # What I can see of their location
            })

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

    return jsonify({
        'contactId': contact_id,
        'permissionGranted': granted_level,
        'permissionReceived': received_level
    })


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

    return jsonify({
        'success': True,
        'contactId': contact_id,
        'permissionGranted': level
    })


@app.route('/api/contacts/<contact_id>/location', methods=['GET'])
@require_auth
def get_contact_location(contact_id):
    """Get a contact's location filtered by permission level."""
    user = g.current_user

    # Verify contact exists
    contact_ids = get_user_contacts(user['id'])
    if contact_id not in contact_ids:
        return jsonify({'error': 'Not a contact'}), 403

    # Get permission level contact has granted to me
    permission_level = get_permission_level(contact_id, user['id'])

    # Get contact's location
    db = get_db()
    row = db.execute(
        'SELECT payload, updated_at FROM locations WHERE user_id = ?',
        (contact_id,)
    ).fetchone()

    if not row:
        return jsonify({'location': None, 'permissionLevel': permission_level})

    # Parse and filter the location
    try:
        location_data = json.loads(row['payload'])
    except json.JSONDecodeError:
        return jsonify({'location': None, 'permissionLevel': permission_level})

    # Filter hierarchy based on permission
    filtered_hierarchy = filter_hierarchy_by_permission(
        location_data.get('hierarchy', {}),
        permission_level
    )

    # Filter named location (only show if permission is high enough)
    # Named locations are considered street-level precision
    filtered_named = None
    if get_permission_index(permission_level) >= get_permission_index('street'):
        filtered_named = location_data.get('namedLocation')

    # Build filtered payload
    filtered_data = {
        'hierarchy': filtered_hierarchy,
        'namedLocation': filtered_named,
        'timestamp': location_data.get('timestamp')
    }

    # Check staleness
    updated_at = row['updated_at']
    is_stale = False
    if updated_at:
        expiry_time = datetime.utcnow() - timedelta(minutes=LOCATION_EXPIRY_MINUTES)
        is_stale = updated_at < expiry_time

    return jsonify({
        'location': {
            'data': filtered_data,
            'updated_at': updated_at.isoformat() if updated_at else None,
            'stale': is_stale
        },
        'permissionLevel': permission_level
    })


@app.route('/api/contacts/locations', methods=['GET'])
@require_auth
def get_all_contact_locations():
    """Get locations for all contacts with permission filtering."""
    user = g.current_user
    contact_ids = get_user_contacts(user['id'])

    if not contact_ids:
        return jsonify({'contacts': []})

    db = get_db()
    placeholders = ','.join('?' * len(contact_ids))
    rows = db.execute(
        f'SELECT user_id, payload, updated_at FROM locations WHERE user_id IN ({placeholders})',
        contact_ids
    ).fetchall()

    location_map = {row['user_id']: row for row in rows}
    expiry_time = datetime.utcnow() - timedelta(minutes=LOCATION_EXPIRY_MINUTES)
    contacts = []

    for contact_id in contact_ids:
        contact = get_user_by_id(contact_id)
        if not contact:
            continue

        # Get permission level this contact has granted to me
        permission_level = get_permission_level(contact_id, user['id'])
        # Get permission level I've granted to this contact
        granted_level = get_permission_level(user['id'], contact_id)

        contact_data = {
            'id': contact['id'],
            'name': contact['name'],
            'permissionGranted': granted_level,
            'permissionReceived': permission_level,
            'location': None
        }

        if contact_id in location_map:
            row = location_map[contact_id]
            updated_at = row['updated_at']
            is_stale = updated_at and updated_at < expiry_time

            # Parse and filter location
            try:
                location_data = json.loads(row['payload'])
            except json.JSONDecodeError:
                location_data = {}

            # Filter hierarchy based on permission
            filtered_hierarchy = filter_hierarchy_by_permission(
                location_data.get('hierarchy', {}),
                permission_level
            )

            # Filter named location
            filtered_named = None
            if get_permission_index(permission_level) >= get_permission_index('street'):
                filtered_named = location_data.get('namedLocation')

            contact_data['location'] = {
                'data': {
                    'hierarchy': filtered_hierarchy,
                    'namedLocation': filtered_named,
                    'timestamp': location_data.get('timestamp')
                },
                'updated_at': updated_at.isoformat() if updated_at else None,
                'stale': is_stale
            }

        contacts.append(contact_data)

    return jsonify({'contacts': contacts})

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
    """Add CORS headers for development."""
    origin = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response


@app.route('/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    """Handle CORS preflight requests."""
    return '', 204

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
