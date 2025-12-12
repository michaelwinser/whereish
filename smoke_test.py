#!/usr/bin/env python3
"""
Whereish Smoke Tests
Fast sanity checks for the server API (~5 seconds)

Run: python3 smoke_test.py
  or: make test-smoke
"""

import atexit
import os
import sys
import tempfile

# Add server directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

from app import app

# =============================================================================
# Test Configuration
# =============================================================================

# Use temp file for SQLite (in-memory doesn't persist across connections)
_temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
_temp_db.close()
app.config['DATABASE'] = _temp_db.name
app.config['TESTING'] = True


# Cleanup temp file on exit
def _cleanup():
    try:
        os.unlink(_temp_db.name)
    except OSError:
        pass


atexit.register(_cleanup)


def run_smoke_tests():
    """Run all smoke tests and return success/failure."""

    passed = 0
    failed = 0

    with app.test_client() as client:
        # Force database initialization
        with app.app_context():
            from app import init_db

            init_db()

        # ---------------------------------------------------------------------
        # Test 1: Health check
        # ---------------------------------------------------------------------
        print('  Testing GET /api/health...', end=' ')
        resp = client.get('/api/health')
        if resp.status_code == 200:
            print('✓ 200')
            passed += 1
        else:
            print(f'✗ {resp.status_code}')
            failed += 1

        # ---------------------------------------------------------------------
        # Test 2: Register user
        # ---------------------------------------------------------------------
        print('  Testing POST /api/auth/register...', end=' ')
        resp = client.post(
            '/api/auth/register',
            json={'email': 'test@example.com', 'password': 'testpass123', 'name': 'Test User'},
        )
        if resp.status_code == 201:
            print('✓ 201')
            passed += 1
            token = resp.get_json().get('token')
        else:
            print(f'✗ {resp.status_code}: {resp.get_json()}')
            failed += 1
            token = None

        # ---------------------------------------------------------------------
        # Test 3: Login
        # ---------------------------------------------------------------------
        print('  Testing POST /api/auth/login...', end=' ')
        resp = client.post(
            '/api/auth/login', json={'email': 'test@example.com', 'password': 'testpass123'}
        )
        if resp.status_code == 200:
            print('✓ 200')
            passed += 1
            token = resp.get_json().get('token')
        else:
            print(f'✗ {resp.status_code}: {resp.get_json()}')
            failed += 1

        # ---------------------------------------------------------------------
        # Test 4: Get current user (authenticated)
        # ---------------------------------------------------------------------
        print('  Testing GET /api/me...', end=' ')
        if token:
            resp = client.get('/api/me', headers={'Authorization': f'Bearer {token}'})
            if resp.status_code == 200:
                print('✓ 200')
                passed += 1
            else:
                print(f'✗ {resp.status_code}: {resp.get_json()}')
                failed += 1
        else:
            print('✗ SKIP (no token)')
            failed += 1

        # ---------------------------------------------------------------------
        # Test 5: Publish location (authenticated)
        # ---------------------------------------------------------------------
        print('  Testing POST /api/location...', end=' ')
        if token:
            resp = client.post(
                '/api/location',
                headers={'Authorization': f'Bearer {token}'},
                json={
                    'payload': '{"hierarchy":{"city":"Seattle"},"timestamp":"2024-01-01T00:00:00Z"}'
                },
            )
            if resp.status_code == 200:
                print('✓ 200')
                passed += 1
            else:
                print(f'✗ {resp.status_code}: {resp.get_json()}')
                failed += 1
        else:
            print('✗ SKIP (no token)')
            failed += 1

        # ---------------------------------------------------------------------
        # Test 6: Get contacts (authenticated)
        # ---------------------------------------------------------------------
        print('  Testing GET /api/contacts...', end=' ')
        if token:
            resp = client.get('/api/contacts', headers={'Authorization': f'Bearer {token}'})
            if resp.status_code == 200:
                print('✓ 200')
                passed += 1
            else:
                print(f'✗ {resp.status_code}: {resp.get_json()}')
                failed += 1
        else:
            print('✗ SKIP (no token)')
            failed += 1

        # ---------------------------------------------------------------------
        # Test 7: Unauthorized access rejected
        # ---------------------------------------------------------------------
        print('  Testing GET /api/me (no auth)...', end=' ')
        resp = client.get('/api/me')
        if resp.status_code == 401:
            print('✓ 401')
            passed += 1
        else:
            print(f'✗ {resp.status_code} (expected 401)')
            failed += 1

    return passed, failed


def main():
    print('\n' + '=' * 50)
    print('Whereish Server Smoke Tests')
    print('=' * 50 + '\n')

    passed, failed = run_smoke_tests()

    print('\n' + '-' * 50)
    print(f'Results: {passed} passed, {failed} failed')
    print('-' * 50 + '\n')

    if failed > 0:
        print('✗ Smoke tests FAILED')
        sys.exit(1)
    else:
        print('✓ Smoke tests PASSED')
        sys.exit(0)


if __name__ == '__main__':
    main()
