"""
Whereish Backend Server
Milestone 3: Simple Backend

A minimal Flask server for location storage and retrieval.
Uses SQLite for prototype, designed to swap to Postgres/Firestore.

Key principle: Server treats location payloads as opaque blobs.
In production, these would be encrypted client-side.
"""

import os
import json
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, g

# ===================
# Configuration
# ===================

app = Flask(__name__)
app.config['DATABASE'] = os.environ.get('DATABASE_PATH', 'whereish.db')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# Location expiry (how long before a location is considered stale)
LOCATION_EXPIRY_MINUTES = 30

# ===================
# Hardcoded Test Users (Milestone 3 only)
# ===================

TEST_USERS = {
    'alice': {
        'id': 'alice',
        'name': 'Alice',
        'token': 'alice-test-token-123'
    },
    'bob': {
        'id': 'bob',
        'name': 'Bob',
        'token': 'bob-test-token-456'
    },
    'charlie': {
        'id': 'charlie',
        'name': 'Charlie',
        'token': 'charlie-test-token-789'
    }
}

# Hardcoded contact relationships (bidirectional for test)
# In production, this comes from the database
TEST_CONTACTS = {
    'alice': ['bob', 'charlie'],
    'bob': ['alice', 'charlie'],
    'charlie': ['alice', 'bob']
}

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
        CREATE TABLE IF NOT EXISTS locations (
            user_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_locations_updated
        ON locations(updated_at);
    ''')
    db.commit()


@app.before_request
def before_request():
    """Ensure database is initialized."""
    init_db()


app.teardown_appcontext(close_db)

# ===================
# Authentication (Simplified for Milestone 3)
# ===================

def get_current_user():
    """
    Get current user from Authorization header.
    For Milestone 3, uses simple token matching.
    Production would use JWT or session-based auth.
    """
    auth_header = request.headers.get('Authorization', '')

    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header[7:]  # Remove 'Bearer ' prefix

    # Find user by token
    for user_id, user in TEST_USERS.items():
        if user['token'] == token:
            return user

    return None


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
# API Routes
# ===================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/auth/test-tokens', methods=['GET'])
def get_test_tokens():
    """
    Return test tokens for development.
    REMOVE THIS IN PRODUCTION.
    """
    return jsonify({
        'users': [
            {'id': u['id'], 'name': u['name'], 'token': u['token']}
            for u in TEST_USERS.values()
        ]
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


@app.route('/api/location', methods=['POST'])
@require_auth
def publish_location():
    """
    Publish current user's location.

    Body: { "payload": "<opaque string>" }

    The payload is treated as opaque - server doesn't parse it.
    In production, this would be encrypted client-side.
    """
    user = g.current_user
    data = request.get_json()

    if not data or 'payload' not in data:
        return jsonify({'error': 'Missing payload'}), 400

    payload = data['payload']

    # Store location (upsert)
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


@app.route('/api/contacts', methods=['GET'])
@require_auth
def get_contacts():
    """
    Get list of contacts for current user.
    For Milestone 3, returns hardcoded contacts.
    """
    user = g.current_user
    contact_ids = TEST_CONTACTS.get(user['id'], [])

    contacts = []
    for contact_id in contact_ids:
        if contact_id in TEST_USERS:
            contact = TEST_USERS[contact_id]
            contacts.append({
                'id': contact['id'],
                'name': contact['name']
            })

    return jsonify({'contacts': contacts})


@app.route('/api/contacts/<contact_id>/location', methods=['GET'])
@require_auth
def get_contact_location(contact_id):
    """
    Get a contact's location.
    Only returns location if contact is in user's contact list.
    """
    user = g.current_user

    # Check if contact_id is in user's contacts
    contact_ids = TEST_CONTACTS.get(user['id'], [])
    if contact_id not in contact_ids:
        return jsonify({'error': 'Not a contact'}), 403

    # Get contact's location
    db = get_db()
    row = db.execute(
        'SELECT payload, updated_at FROM locations WHERE user_id = ?',
        (contact_id,)
    ).fetchone()

    if not row:
        return jsonify({'location': None})

    # Check if location is stale
    updated_at = row['updated_at']
    if updated_at:
        expiry_time = datetime.utcnow() - timedelta(minutes=LOCATION_EXPIRY_MINUTES)
        if updated_at < expiry_time:
            return jsonify({
                'location': {
                    'payload': row['payload'],
                    'updated_at': updated_at.isoformat(),
                    'stale': True
                }
            })

    return jsonify({
        'location': {
            'payload': row['payload'],
            'updated_at': updated_at.isoformat() if updated_at else None,
            'stale': False
        }
    })


@app.route('/api/contacts/locations', methods=['GET'])
@require_auth
def get_all_contact_locations():
    """
    Get locations for all contacts.
    More efficient than fetching one at a time.
    """
    user = g.current_user
    contact_ids = TEST_CONTACTS.get(user['id'], [])

    if not contact_ids:
        return jsonify({'contacts': []})

    db = get_db()
    placeholders = ','.join('?' * len(contact_ids))
    rows = db.execute(
        f'SELECT user_id, payload, updated_at FROM locations WHERE user_id IN ({placeholders})',
        contact_ids
    ).fetchall()

    # Build location map
    location_map = {row['user_id']: row for row in rows}

    # Build response with contact info
    expiry_time = datetime.utcnow() - timedelta(minutes=LOCATION_EXPIRY_MINUTES)
    contacts = []

    for contact_id in contact_ids:
        if contact_id not in TEST_USERS:
            continue

        contact = TEST_USERS[contact_id]
        contact_data = {
            'id': contact['id'],
            'name': contact['name'],
            'location': None
        }

        if contact_id in location_map:
            row = location_map[contact_id]
            updated_at = row['updated_at']
            is_stale = updated_at and updated_at < expiry_time

            contact_data['location'] = {
                'payload': row['payload'],
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
║   Whereish Backend Server                                    ║
║                                                              ║
║   Local:   http://localhost:{port}                            ║
║   Health:  http://localhost:{port}/api/health                 ║
║                                                              ║
║   Test tokens: GET /api/auth/test-tokens                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
""")

    app.run(host='0.0.0.0', port=port, debug=debug)
