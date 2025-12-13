"""
Tests for encrypted location API endpoints (E2E encryption support).
"""

import pytest

from .api_client import APIClient


# Sample base64-encoded 32-byte public keys (valid format)
ALICE_PUBLIC_KEY = "abcdefghijklmnopqrstuvwxyz012345678901234567"  # 44 chars
BOB_PUBLIC_KEY = "zyxwvutsrqponmlkjihgfedcba987654321098765432"  # 44 chars


class TestRegisterPublicKey:
    """Tests for POST /api/identity/register"""

    def test_register_public_key_success(self, alice_client):
        """User can register their public key."""
        result = alice_client.register_public_key(ALICE_PUBLIC_KEY)
        assert result['success'] is True

    def test_register_public_key_requires_auth(self, client):
        """Public key registration requires authentication."""
        response = client.register_public_key_raw(ALICE_PUBLIC_KEY)
        assert response.status_code == 401

    def test_register_public_key_missing_key(self, alice_client):
        """Missing public key returns error."""
        response = alice_client._post('/api/identity/register', {})
        assert response.status_code == 400
        assert 'Missing publicKey' in response.json()['error']

    def test_register_public_key_invalid_format(self, alice_client):
        """Invalid public key format returns error."""
        response = alice_client.register_public_key_raw("too-short")
        assert response.status_code == 400
        assert 'Invalid public key format' in response.json()['error']

    def test_register_public_key_update(self, alice_client):
        """User can update their public key."""
        alice_client.register_public_key(ALICE_PUBLIC_KEY)
        result = alice_client.register_public_key(BOB_PUBLIC_KEY)
        assert result['success'] is True


class TestGetContactPublicKey:
    """Tests for GET /api/contacts/<contact_id>/public-key"""

    def test_get_contact_public_key_success(self, alice_client, bob_client, alice_and_bob_contacts):
        """Can get a contact's public key."""
        alice, bob = alice_and_bob_contacts

        # Bob registers his public key
        bob_client.register_public_key(BOB_PUBLIC_KEY)

        # Alice gets Bob's public key
        result = alice_client.get_contact_public_key(bob.id)
        assert result['publicKey'] == BOB_PUBLIC_KEY
        assert result['name'] == 'Bob'

    def test_get_contact_public_key_not_registered(self, alice_client, alice_and_bob_contacts):
        """Returns null if contact hasn't registered a key."""
        alice, bob = alice_and_bob_contacts

        result = alice_client.get_contact_public_key(bob.id)
        assert result['publicKey'] is None
        assert result['name'] == 'Bob'

    def test_get_contact_public_key_requires_auth(self, client, bob):
        """Getting public key requires authentication."""
        response = client.get_contact_public_key_raw(bob.id)
        assert response.status_code == 401

    def test_get_contact_public_key_not_contact(self, alice_client, bob):
        """Can't get public key of non-contact."""
        response = alice_client.get_contact_public_key_raw(bob.id)
        assert response.status_code == 403
        assert 'Not a contact' in response.json()['error']


class TestPublishEncryptedLocations:
    """Tests for POST /api/location/encrypted"""

    def test_publish_encrypted_locations_success(self, alice_client, alice_and_bob_contacts):
        """User can publish encrypted locations for contacts."""
        alice, bob = alice_and_bob_contacts

        locations = [
            {
                'contactId': bob.id,
                'blob': {'v': 1, 'n': 'nonce123', 'c': 'ciphertext123'}
            }
        ]
        result = alice_client.publish_encrypted_locations(locations)
        assert result['success'] is True
        assert result['count'] == 1

    def test_publish_encrypted_locations_multiple(self, alice_client, bob_client, carol_client, three_users_contacts):
        """Can publish to multiple contacts at once."""
        alice, bob, carol = three_users_contacts

        locations = [
            {'contactId': bob.id, 'blob': {'v': 1, 'n': 'n1', 'c': 'c1'}},
            {'contactId': carol.id, 'blob': {'v': 1, 'n': 'n2', 'c': 'c2'}},
        ]
        result = alice_client.publish_encrypted_locations(locations)
        assert result['success'] is True
        assert result['count'] == 2

    def test_publish_encrypted_locations_requires_auth(self, client):
        """Requires authentication."""
        response = client.publish_encrypted_locations_raw([])
        assert response.status_code == 401

    def test_publish_encrypted_locations_ignores_non_contacts(self, alice_client, bob):
        """Non-contacts are silently ignored."""
        locations = [
            {'contactId': bob.id, 'blob': {'v': 1, 'n': 'n', 'c': 'c'}}
        ]
        # Bob is not Alice's contact, should be ignored
        result = alice_client.publish_encrypted_locations(locations)
        assert result['success'] is True

    def test_publish_encrypted_locations_upsert(self, alice_client, bob_client, alice_and_bob_contacts):
        """Publishing again updates existing blob."""
        alice, bob = alice_and_bob_contacts

        # First publish
        alice_client.publish_encrypted_locations([
            {'contactId': bob.id, 'blob': {'v': 1, 'n': 'old', 'c': 'old'}}
        ])

        # Second publish updates
        alice_client.publish_encrypted_locations([
            {'contactId': bob.id, 'blob': {'v': 1, 'n': 'new', 'c': 'new'}}
        ])

        # Bob should see the new blob
        contacts = bob_client.get_contacts_encrypted()
        alice_contact = next(c for c in contacts if c['id'] == alice.id)
        assert alice_contact['encryptedLocation']['blob']['n'] == 'new'


class TestGetContactsEncrypted:
    """Tests for GET /api/contacts/encrypted"""

    def test_get_contacts_encrypted_success(self, alice_client, bob_client, alice_and_bob_contacts):
        """Can retrieve contacts with encrypted locations."""
        alice, bob = alice_and_bob_contacts

        # Bob registers key and publishes encrypted location for Alice
        bob_client.register_public_key(BOB_PUBLIC_KEY)
        bob_client.publish_encrypted_locations([
            {'contactId': alice.id, 'blob': {'v': 1, 'n': 'nonce', 'c': 'cipher'}}
        ])

        # Alice gets encrypted contacts
        contacts = alice_client.get_contacts_encrypted()
        assert len(contacts) == 1

        bob_contact = contacts[0]
        assert bob_contact['id'] == bob.id
        assert bob_contact['name'] == 'Bob'
        assert bob_contact['publicKey'] == BOB_PUBLIC_KEY
        assert bob_contact['encryptedLocation'] is not None
        assert bob_contact['encryptedLocation']['blob']['n'] == 'nonce'

    def test_get_contacts_encrypted_no_location(self, alice_client, bob_client, alice_and_bob_contacts):
        """Contact without encrypted location shows null."""
        alice, bob = alice_and_bob_contacts

        bob_client.register_public_key(BOB_PUBLIC_KEY)

        contacts = alice_client.get_contacts_encrypted()
        bob_contact = contacts[0]
        assert bob_contact['publicKey'] == BOB_PUBLIC_KEY
        assert bob_contact['encryptedLocation'] is None

    def test_get_contacts_encrypted_no_public_key(self, alice_client, alice_and_bob_contacts):
        """Contact without public key shows null."""
        alice, bob = alice_and_bob_contacts

        contacts = alice_client.get_contacts_encrypted()
        bob_contact = contacts[0]
        assert bob_contact['publicKey'] is None

    def test_get_contacts_encrypted_includes_permissions(self, alice_client, bob_client, alice_and_bob_contacts):
        """Encrypted contacts include permission levels."""
        alice, bob = alice_and_bob_contacts

        # Alice grants Bob city-level permission
        alice_client.set_permission(bob.id, 'city')

        contacts = alice_client.get_contacts_encrypted()
        bob_contact = contacts[0]
        assert bob_contact['permissionGranted'] == 'city'
        assert bob_contact['permissionReceived'] == 'planet'  # Default

    def test_get_contacts_encrypted_requires_auth(self, client):
        """Requires authentication."""
        response = client._get('/api/contacts/encrypted')
        assert response.status_code == 401

    def test_get_contacts_encrypted_empty(self, alice_client):
        """User with no contacts gets empty list."""
        contacts = alice_client.get_contacts_encrypted()
        assert contacts == []
