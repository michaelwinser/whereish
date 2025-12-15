"""
Google OAuth authentication integration tests.

Tests cover:
- New user creation via OAuth
- Existing user login via OAuth
- Error handling (missing token, invalid format)
- Account linking (existing email gets Google ID linked)
"""

import base64
import time

from .api_client import APIClient


def make_test_token(email: str, name: str, google_id: str = None) -> str:
    """Generate a test token for OAuth testing.

    Format: test:email:name:google_id
    """
    if google_id is None:
        google_id = f"google_{int(time.time_ns())}"
    return f"test:{email}:{name}:{google_id}"


def make_fake_public_key() -> str:
    """Generate a fake base64-encoded public key (32 bytes)."""
    # NaCl public keys are 32 bytes
    fake_key = b'\x00' * 32
    return base64.b64encode(fake_key).decode('utf-8')


class TestGoogleOAuthNewUser:
    """Tests for new user registration via Google OAuth."""

    def test_creates_new_user(self, client, unique_email):
        """New Google user can sign up successfully."""
        email = unique_email("googleuser")
        token = make_test_token(email, "Google User")

        response = client.auth_google_raw(token)

        assert response.status_code == 200
        data = response.json()
        assert data['user']['email'] == email
        assert data['user']['name'] == "Google User"
        assert data['isNew'] is True
        assert 'token' in data

    def test_returns_session_token(self, client, unique_email):
        """OAuth returns a valid session token."""
        email = unique_email("tokenuser")
        token = make_test_token(email, "Token User")

        response = client.auth_google_raw(token)
        data = response.json()

        # Use returned token to access protected endpoint
        client.set_token(data['token'])
        me = client.whoami()
        assert me['email'] == email

    def test_normalizes_email_lowercase(self, client, unique_email):
        """Email is normalized to lowercase."""
        base = unique_email("mixedcase")
        mixed_case_email = base.replace("mixedcase", "MixedCase")
        token = make_test_token(mixed_case_email, "Mixed Case User")

        response = client.auth_google_raw(token)
        data = response.json()

        assert data['user']['email'] == mixed_case_email.lower()

    def test_returns_has_public_key_false(self, client, unique_email):
        """New user has no public key registered."""
        email = unique_email("nopubkey")
        token = make_test_token(email, "No Pub Key")

        response = client.auth_google_raw(token)
        data = response.json()

        assert data['hasPublicKey'] is False

    def test_returns_has_server_backup_false(self, client, unique_email):
        """New user has no server backup."""
        email = unique_email("nobackup")
        token = make_test_token(email, "No Backup")

        response = client.auth_google_raw(token)
        data = response.json()

        assert data['hasServerBackup'] is False


class TestGoogleOAuthExistingUser:
    """Tests for existing user login via Google OAuth."""

    def test_login_returns_existing_user(self, client, unique_email):
        """Existing Google user can log in again."""
        email = unique_email("returning")
        google_id = f"google_{time.time_ns()}"
        token = make_test_token(email, "Returning User", google_id)

        # First login creates user
        first_response = client.auth_google_raw(token)
        first_data = first_response.json()
        user_id = first_data['user']['id']

        # Second login returns same user
        other_client = APIClient(client.base_url)
        second_response = other_client.auth_google_raw(token)
        second_data = second_response.json()

        assert second_data['user']['id'] == user_id
        assert second_data['isNew'] is False

    def test_links_google_to_email_password_user(self, client, unique_email):
        """OAuth links Google ID to existing email/password user."""
        email = unique_email("linkeduser")

        # Create user via email/password registration
        client.register(email, "password123", "Linked User")
        original_user_id = client.whoami()['id']
        client.logout()

        # Login via OAuth with same email
        google_id = f"google_{time.time_ns()}"
        token = make_test_token(email, "Linked User", google_id)

        other_client = APIClient(client.base_url)
        response = other_client.auth_google_raw(token)
        data = response.json()

        # Should be same user, not new
        assert data['user']['id'] == original_user_id
        assert data['isNew'] is False

    def test_linked_user_can_still_login_with_password(self, client, unique_email):
        """After OAuth linking, user can still use email/password."""
        email = unique_email("bothlogins")

        # Create user via email/password
        client.register(email, "password123", "Both Logins")
        user_id = client.whoami()['id']
        client.logout()

        # Link via OAuth
        google_id = f"google_{time.time_ns()}"
        token = make_test_token(email, "Both Logins", google_id)
        other_client = APIClient(client.base_url)
        other_client.auth_google_raw(token)

        # Can still login with password
        password_client = APIClient(client.base_url)
        user = password_client.login(email, "password123")
        assert user.id == user_id


class TestGoogleOAuthErrors:
    """Tests for OAuth error handling."""

    def test_empty_request_body_returns_400(self, client):
        """Empty request body returns 400."""
        response = client.auth_google_raw(body={})

        assert response.status_code == 400
        # Empty object {} is falsy when checking `if not data:`
        assert 'Missing' in response.json()['error']

    def test_missing_id_token_returns_400(self, client):
        """Missing id_token returns 400."""
        response = client.auth_google_raw(body={'other': 'data'})

        assert response.status_code == 400
        assert 'Missing id_token' in response.json()['error']

    def test_invalid_test_token_format_returns_400(self, client):
        """Invalid test token format returns 400."""
        # Test token with insufficient parts
        response = client.auth_google_raw(id_token='test:email_only')

        assert response.status_code == 400
        assert 'Invalid test token format' in response.json()['error']

    def test_empty_id_token_returns_400(self, client):
        """Empty id_token returns 400."""
        response = client.auth_google_raw(id_token='')

        assert response.status_code == 400


class TestGoogleOAuthWithPublicKey:
    """Tests for OAuth response with existing public key."""

    def test_has_public_key_true_after_registration(self, client, unique_email):
        """User with registered public key shows hasPublicKey=true."""
        email = unique_email("withpubkey")
        google_id = f"google_{time.time_ns()}"
        token = make_test_token(email, "With Pub Key", google_id)

        # Create user via OAuth
        response = client.auth_google_raw(token)
        client.set_token(response.json()['token'])

        # Register public key (must be valid 32-byte base64)
        client.register_public_key(make_fake_public_key())

        # Login again
        client.logout()
        second_response = client.auth_google_raw(token)
        data = second_response.json()

        assert data['hasPublicKey'] is True
