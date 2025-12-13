"""
Contact lifecycle integration tests.

Tests cover:
- Sending contact requests
- Accepting/declining/canceling requests
- Listing contacts
- Removing contacts
"""

import pytest

from .api_client import APIClient


class TestContactRequests:
    """Tests for sending contact requests."""

    def test_send_contact_request(self, alice_client, bob, alice):
        """Can send a contact request to another user."""
        result = alice_client.send_contact_request(bob.email)

        assert result['success'] is True
        assert bob.name in result['message']

    def test_send_request_creates_pending(self, alice_client, bob_client, bob, alice):
        """Sent request appears as pending for both users."""
        alice_client.send_contact_request(bob.email)

        # Check Alice's outgoing
        alice_requests = alice_client.get_pending_requests()
        assert len(alice_requests['outgoing']) == 1
        assert alice_requests['outgoing'][0]['email'] == bob.email

        # Check Bob's incoming
        bob_requests = bob_client.get_pending_requests()
        assert len(bob_requests['incoming']) == 1
        assert bob_requests['incoming'][0]['email'] == alice.email

    def test_cannot_request_self(self, alice_client, alice):
        """Cannot send contact request to yourself."""
        response = alice_client.send_contact_request_raw(alice.email)

        assert response.status_code == 400
        assert "yourself" in response.json()['error'].lower()

    def test_cannot_duplicate_request(self, alice_client, bob):
        """Cannot send duplicate contact request."""
        alice_client.send_contact_request(bob.email)

        response = alice_client.send_contact_request_raw(bob.email)

        assert response.status_code == 409
        assert "pending" in response.json()['error'].lower()

    def test_request_nonexistent_user_fails(self, alice_client):
        """Cannot send request to non-existent user."""
        response = alice_client.send_contact_request_raw("nobody@example.com")

        assert response.status_code == 404
        assert "not found" in response.json()['error'].lower()


class TestAcceptRequest:
    """Tests for accepting contact requests."""

    def test_accept_request(self, alice_client, bob_client, bob, alice):
        """Recipient can accept a contact request."""
        alice_client.send_contact_request(bob.email)

        # Bob accepts
        requests = bob_client.get_pending_requests()
        request_id = requests['incoming'][0]['requestId']
        result = bob_client.accept_request(request_id)

        assert result['success'] is True
        assert result['contact']['name'] == alice.name

    def test_accept_request_creates_contact(self, alice_client, bob_client, bob, alice):
        """Accepted request creates mutual contact relationship."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        bob_client.accept_request(requests['incoming'][0]['requestId'])

        # Both should see each other as contacts
        alice_contacts = alice_client.get_contacts()
        bob_contacts = bob_client.get_contacts()

        assert len(alice_contacts) == 1
        assert alice_contacts[0]['name'] == bob.name

        assert len(bob_contacts) == 1
        assert bob_contacts[0]['name'] == alice.name

    def test_accept_request_clears_pending(self, alice_client, bob_client, bob, alice):
        """Accepted request is removed from pending lists."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        bob_client.accept_request(requests['incoming'][0]['requestId'])

        # No more pending requests
        alice_requests = alice_client.get_pending_requests()
        bob_requests = bob_client.get_pending_requests()

        assert len(alice_requests['outgoing']) == 0
        assert len(bob_requests['incoming']) == 0

    def test_cannot_accept_others_request(self, alice_client, bob_client, carol_client, bob, carol):
        """Cannot accept a request meant for someone else."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        request_id = requests['incoming'][0]['requestId']

        # Carol tries to accept Bob's request
        response = carol_client.accept_request_raw(request_id)

        assert response.status_code == 404

    def test_cannot_accept_nonexistent_request(self, bob_client):
        """Cannot accept non-existent request."""
        response = bob_client.accept_request_raw(99999)

        assert response.status_code == 404


class TestDeclineRequest:
    """Tests for declining contact requests."""

    def test_decline_request(self, alice_client, bob_client, bob):
        """Recipient can decline a contact request."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        request_id = requests['incoming'][0]['requestId']

        result = bob_client.decline_request(request_id)

        assert result['success'] is True

    def test_decline_removes_request(self, alice_client, bob_client, bob):
        """Declined request is removed from pending lists."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        bob_client.decline_request(requests['incoming'][0]['requestId'])

        # No pending requests
        alice_requests = alice_client.get_pending_requests()
        bob_requests = bob_client.get_pending_requests()

        assert len(alice_requests['outgoing']) == 0
        assert len(bob_requests['incoming']) == 0

    def test_decline_does_not_create_contact(self, alice_client, bob_client, bob):
        """Declined request does not create contact relationship."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        bob_client.decline_request(requests['incoming'][0]['requestId'])

        alice_contacts = alice_client.get_contacts()
        bob_contacts = bob_client.get_contacts()

        assert len(alice_contacts) == 0
        assert len(bob_contacts) == 0

    def test_cannot_decline_others_request(self, alice_client, bob_client, carol_client, bob):
        """Cannot decline a request meant for someone else."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        request_id = requests['incoming'][0]['requestId']

        response = carol_client.decline_request_raw(request_id)

        assert response.status_code == 404


class TestCancelRequest:
    """Tests for canceling outgoing requests."""

    def test_cancel_outgoing_request(self, alice_client, bob_client, bob):
        """Requester can cancel their outgoing request."""
        alice_client.send_contact_request(bob.email)
        requests = alice_client.get_pending_requests()
        request_id = requests['outgoing'][0]['requestId']

        result = alice_client.cancel_request(request_id)

        assert result['success'] is True

    def test_cancel_removes_request(self, alice_client, bob_client, bob):
        """Canceled request is removed from pending lists."""
        alice_client.send_contact_request(bob.email)
        requests = alice_client.get_pending_requests()
        alice_client.cancel_request(requests['outgoing'][0]['requestId'])

        alice_requests = alice_client.get_pending_requests()
        bob_requests = bob_client.get_pending_requests()

        assert len(alice_requests['outgoing']) == 0
        assert len(bob_requests['incoming']) == 0

    def test_cannot_cancel_incoming_request(self, alice_client, bob_client, bob):
        """Cannot cancel a request you received (use decline instead)."""
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        request_id = requests['incoming'][0]['requestId']

        # Bob tries to cancel (should fail - he's the recipient)
        response = bob_client.cancel_request_raw(request_id)

        assert response.status_code == 404


class TestContactList:
    """Tests for listing contacts."""

    def test_contacts_list_empty_initially(self, alice_client):
        """New user has no contacts."""
        contacts = alice_client.get_contacts()

        assert len(contacts) == 0

    def test_contacts_list_shows_accepted_only(self, alice_client, bob_client, carol_client, bob, carol):
        """Contact list only shows accepted contacts, not pending."""
        # Alice requests Bob and Carol
        alice_client.send_contact_request(bob.email)
        alice_client.send_contact_request(carol.email)

        # Only Bob accepts
        requests = bob_client.get_pending_requests()
        bob_client.accept_request(requests['incoming'][0]['requestId'])

        contacts = alice_client.get_contacts()

        assert len(contacts) == 1
        assert contacts[0]['name'] == bob.name

    def test_contacts_include_permission_info(self, alice_and_bob_contacts, alice_client):
        """Contact list includes permission information."""
        contacts = alice_client.get_contacts()

        assert len(contacts) == 1
        assert 'permissionGranted' in contacts[0]
        assert 'permissionReceived' in contacts[0]


class TestRemoveContact:
    """Tests for removing contacts."""

    def test_remove_contact(self, alice_and_bob_contacts, alice_client, bob):
        """Can remove an existing contact."""
        result = alice_client.remove_contact(bob.id)

        assert result['success'] is True

    def test_remove_contact_bidirectional(self, alice_and_bob_contacts, alice_client, bob_client, bob):
        """Removing contact removes from both users' lists."""
        alice_client.remove_contact(bob.id)

        alice_contacts = alice_client.get_contacts()
        bob_contacts = bob_client.get_contacts()

        assert len(alice_contacts) == 0
        assert len(bob_contacts) == 0

    def test_remove_nonexistent_contact_fails(self, alice_client):
        """Cannot remove non-existent contact."""
        response = alice_client.remove_contact_raw("nonexistent-id")

        assert response.status_code == 404

    def test_remove_contact_clears_permissions(self, alice_and_bob_contacts, alice_client, bob_client, bob):
        """Removing contact clears permission grants."""
        # Set a custom permission first
        alice_client.set_permission(bob.id, 'city')

        # Remove contact
        alice_client.remove_contact(bob.id)

        # Re-add contact
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        bob_client.accept_request(requests['incoming'][0]['requestId'])

        # Permission should be back to default
        contacts = alice_client.get_contacts()
        assert contacts[0]['permissionGranted'] == 'planet'


class TestCannotRequestExistingContact:
    """Tests for preventing duplicate contact relationships."""

    def test_cannot_request_existing_contact(self, alice_and_bob_contacts, alice_client, bob):
        """Cannot send request to someone who is already a contact."""
        response = alice_client.send_contact_request_raw(bob.email)

        assert response.status_code == 409
        assert "already contacts" in response.json()['error'].lower()
