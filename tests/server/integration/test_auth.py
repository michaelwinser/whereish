"""
Authentication flow integration tests.

Tests cover:
- User registration
- User login
- Token validation
- Protected endpoint access
"""

import pytest

from .api_client import APIClient


class TestRegistration:
    """Tests for user registration."""

    def test_register_new_user(self, client, unique_email):
        """New user can register successfully."""
        email = unique_email("newuser")
        user = client.register(email, "password123", "New User")

        assert user.email == email
        assert user.name == "New User"
        assert user.id is not None
        assert user.token is not None

    def test_register_returns_token(self, client, unique_email):
        """Registration returns a valid token."""
        email = unique_email("tokentest")
        user = client.register(email, "password123", "Token Test")

        # Token should be stored in client
        assert client.token == user.token

        # Should be able to access protected endpoint
        me = client.whoami()
        assert me['email'] == email

    def test_register_duplicate_email_fails(self, client, unique_email):
        """Cannot register with an already used email."""
        email = unique_email("duplicate")
        client.register(email, "password123", "First User")

        # Try to register again with same email
        other_client = APIClient(client.base_url)
        response = other_client.register_raw(email, "different123", "Second User")

        assert response.status_code == 409
        assert "already registered" in response.json()['error'].lower()

    def test_register_invalid_email_fails(self, client):
        """Cannot register with invalid email."""
        response = client.register_raw("not-an-email", "password123", "Bad Email")

        assert response.status_code == 400
        assert "email" in response.json()['error'].lower()

    def test_register_short_password_fails(self, client, unique_email):
        """Cannot register with password shorter than 6 characters."""
        email = unique_email("shortpass")
        response = client.register_raw(email, "12345", "Short Pass")

        assert response.status_code == 400
        assert "password" in response.json()['error'].lower()

    def test_register_missing_name_fails(self, client, unique_email):
        """Cannot register without a name."""
        email = unique_email("noname")
        response = client.register_raw(email, "password123", "")

        assert response.status_code == 400
        assert "name" in response.json()['error'].lower()

    def test_register_email_normalized_lowercase(self, client, unique_email):
        """Email is normalized to lowercase."""
        base = unique_email("mixedcase")
        mixed_case_email = base.replace("mixedcase", "MixedCase")

        user = client.register(mixed_case_email, "password123", "Mixed Case")

        assert user.email == mixed_case_email.lower()


class TestLogin:
    """Tests for user login."""

    def test_login_valid_credentials(self, client, unique_email):
        """User can login with valid credentials."""
        email = unique_email("logintest")
        original_user = client.register(email, "password123", "Login Test")

        # Logout and login again
        client.logout()
        logged_in_user = client.login(email, "password123")

        assert logged_in_user.email == email
        assert logged_in_user.id == original_user.id
        assert logged_in_user.token is not None

    def test_login_invalid_password_fails(self, client, unique_email):
        """Cannot login with wrong password."""
        email = unique_email("wrongpass")
        client.register(email, "password123", "Wrong Pass")
        client.logout()

        response = client.login_raw(email, "wrongpassword")

        assert response.status_code == 401
        assert "invalid" in response.json()['error'].lower()

    def test_login_nonexistent_user_fails(self, client, unique_email):
        """Cannot login with non-existent email."""
        email = unique_email("nonexistent")
        response = client.login_raw(email, "password123")

        assert response.status_code == 401
        assert "invalid" in response.json()['error'].lower()

    def test_login_stores_token(self, client, unique_email):
        """Login stores token in client for subsequent requests."""
        email = unique_email("storetoken")
        client.register(email, "password123", "Store Token")
        client.logout()

        assert client.token is None

        client.login(email, "password123")

        assert client.token is not None

    def test_login_email_case_insensitive(self, client, unique_email):
        """Login works with different email casing."""
        base = unique_email("caselogin")
        client.register(base, "password123", "Case Login")
        client.logout()

        # Login with uppercase
        upper_email = base.upper()
        user = client.login(upper_email, "password123")

        assert user.email == base.lower()


class TestProtectedEndpoints:
    """Tests for protected endpoint access."""

    def test_whoami_with_valid_token(self, client, unique_email):
        """Can access /api/me with valid token."""
        email = unique_email("whoami")
        client.register(email, "password123", "Whoami Test")

        me = client.whoami()

        assert me['email'] == email
        assert me['name'] == "Whoami Test"
        assert 'id' in me

    def test_whoami_without_token_fails(self, client):
        """Cannot access /api/me without token."""
        response = client.whoami_raw()

        assert response.status_code == 401

    def test_whoami_with_invalid_token_fails(self, client):
        """Cannot access /api/me with invalid token."""
        client.set_token("invalid-token-here")
        response = client.whoami_raw()

        assert response.status_code == 401

    def test_protected_endpoints_require_auth(self, server):
        """All protected endpoints return 401 without auth."""
        client = APIClient(server)

        protected_endpoints = [
            ('GET', '/api/me'),
            ('GET', '/api/contacts'),
            ('GET', '/api/contacts/requests'),
            ('POST', '/api/contacts/request'),
            ('GET', '/api/location'),
            ('POST', '/api/location'),
            ('GET', '/api/contacts/locations'),
        ]

        for method, endpoint in protected_endpoints:
            response = client._request(method, endpoint, auth=False)
            assert response.status_code == 401, f"{method} {endpoint} should require auth"


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check_no_auth_required(self, client):
        """Health endpoint does not require authentication."""
        client.logout()
        health = client.health()

        assert health['status'] == 'ok'
        assert 'timestamp' in health

    def test_permission_levels_no_auth_required(self, client):
        """Permission levels endpoint does not require authentication."""
        client.logout()
        levels = client.get_permission_levels()

        assert 'levels' in levels
        assert 'planet' in levels['levels']
        assert 'address' in levels['levels']
        assert levels['default'] == 'planet'
