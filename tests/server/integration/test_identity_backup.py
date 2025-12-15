"""
Identity backup integration tests.

Tests cover:
- Storing encrypted identity backup
- Retrieving backup
- Deleting backup
- Error handling
"""

from .api_client import APIClient


class TestIdentityBackupStore:
    """Tests for storing identity backup."""

    def test_store_backup_success(self, client, unique_email):
        """User can store encrypted identity backup."""
        email = unique_email("backup")
        client.register(email, "password123", "Backup User")

        # Store a backup (simulated encrypted JSON)
        encrypted = '{"version":2,"type":"whereish-identity-encrypted","payload":"abc123=="}'
        result = client.store_identity_backup(encrypted)

        assert result['success'] is True

    def test_store_backup_requires_auth(self, server):
        """Store backup requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.store_identity_backup_raw("some_data")

        assert response.status_code == 401

    def test_store_backup_missing_data(self, client, unique_email):
        """Store backup fails without encrypted identity."""
        email = unique_email("nodata")
        client.register(email, "password123", "No Data User")

        response = client.store_identity_backup_raw(body={})

        assert response.status_code == 400
        assert 'Missing encryptedIdentity' in response.json()['error']

    def test_store_backup_size_limit(self, client, unique_email):
        """Store backup enforces size limit."""
        email = unique_email("bigdata")
        client.register(email, "password123", "Big Data User")

        # Try to store >10KB of data
        big_data = 'x' * 20000
        response = client.store_identity_backup_raw(big_data)

        assert response.status_code == 400
        assert 'too large' in response.json()['error']


class TestIdentityBackupRetrieve:
    """Tests for retrieving identity backup."""

    def test_get_backup_success(self, client, unique_email):
        """User can retrieve stored backup."""
        email = unique_email("retrieve")
        client.register(email, "password123", "Retrieve User")

        # Store then retrieve
        encrypted = '{"version":2,"payload":"test_data"}'
        client.store_identity_backup(encrypted)

        result = client.get_identity_backup()

        assert result['encryptedIdentity'] == encrypted

    def test_get_backup_not_found(self, client, unique_email):
        """Get backup returns 404 when no backup exists."""
        email = unique_email("nobackup")
        client.register(email, "password123", "No Backup User")

        response = client.get_identity_backup_raw()

        assert response.status_code == 404
        assert 'No backup found' in response.json()['error']

    def test_get_backup_requires_auth(self, server):
        """Get backup requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.get_identity_backup_raw()

        assert response.status_code == 401


class TestIdentityBackupDelete:
    """Tests for deleting identity backup."""

    def test_delete_backup_success(self, client, unique_email):
        """User can delete their backup."""
        email = unique_email("deleter")
        client.register(email, "password123", "Deleter User")

        # Store then delete
        client.store_identity_backup('{"test":"data"}')
        result = client.delete_identity_backup()

        assert result['success'] is True

        # Verify it's gone
        response = client.get_identity_backup_raw()
        assert response.status_code == 404

    def test_delete_backup_idempotent(self, client, unique_email):
        """Delete backup succeeds even if no backup exists."""
        email = unique_email("idempotent")
        client.register(email, "password123", "Idempotent User")

        # Delete without storing first
        result = client.delete_identity_backup()

        assert result['success'] is True

    def test_delete_backup_requires_auth(self, server):
        """Delete backup requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.delete_identity_backup_raw()

        assert response.status_code == 401


class TestIdentityBackupOAuthFlow:
    """Tests for backup with OAuth flow."""

    def test_has_server_backup_flag_false_initially(self, client, unique_email):
        """OAuth response shows hasServerBackup=false for new user."""
        from .test_google_oauth import make_test_token

        email = unique_email("oauthbackup")
        token = make_test_token(email, "OAuth Backup User")

        response = client.auth_google_raw(token)
        data = response.json()

        assert data['hasServerBackup'] is False

    def test_has_server_backup_flag_true_after_store(self, client, unique_email):
        """OAuth response shows hasServerBackup=true after storing backup."""
        from .test_google_oauth import make_test_token

        email = unique_email("oauthstored")
        google_id = f"google_{id(client)}"
        token = make_test_token(email, "OAuth Stored User", google_id)

        # First login
        response = client.auth_google_raw(token)
        client.set_token(response.json()['token'])

        # Store backup
        client.store_identity_backup('{"encrypted":"data"}')

        # Login again
        other_client = APIClient(client.base_url)
        response = other_client.auth_google_raw(token)
        data = response.json()

        assert data['hasServerBackup'] is True
