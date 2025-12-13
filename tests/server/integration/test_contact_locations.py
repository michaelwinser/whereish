"""
Contact location retrieval integration tests.

Tests cover:
- Getting single contact location
- Getting all contact locations
- Location filtering
- Non-contact access denial
- Stale location handling
"""

import pytest

from .api_client import APIClient, SEATTLE_FULL, NYC_FULL, LONDON_FULL


class TestGetContactLocation:
    """Tests for retrieving a single contact's location."""

    def test_get_contact_location(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Can retrieve a contact's location."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)

        assert location['location'] is not None
        assert 'data' in location['location']
        assert 'updated_at' in location['location']

    def test_get_contact_location_includes_permission_level(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Response includes the permission level used for filtering."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)

        assert location['permissionLevel'] == 'city'

    def test_cannot_get_non_contact_location(self, alice_client, bob):
        """Cannot retrieve location of someone who is not a contact."""
        response = alice_client.get_contact_location_raw(bob.id)

        assert response.status_code == 403

    def test_get_location_when_none_published(self, alice_and_bob_contacts, bob_client, alice):
        """Getting location when contact hasn't published returns null."""
        location = bob_client.get_contact_location(alice.id)

        assert location['location'] is None

    def test_location_filtered_by_my_received_permission(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Location is filtered by the permission the owner granted to me."""
        alice_client.publish_location(SEATTLE_FULL)

        # Alice grants Bob 'city' permission
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)
        hierarchy = location['location']['data']['hierarchy']

        assert hierarchy.get('city') == 'Seattle'
        assert 'street' not in hierarchy


class TestGetAllContactLocations:
    """Tests for retrieving all contact locations."""

    def test_get_all_contact_locations(self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol):
        """Can retrieve all contacts with their locations."""
        bob_client.publish_location(SEATTLE_FULL)
        carol_client.publish_location(NYC_FULL)

        contacts = alice_client.get_all_contact_locations()

        assert len(contacts) == 2

        bob_contact = next(c for c in contacts if c['id'] == bob.id)
        carol_contact = next(c for c in contacts if c['id'] == carol.id)

        assert bob_contact['name'] == bob.name
        assert carol_contact['name'] == carol.name

    def test_get_all_locations_includes_permission_info(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Bulk response includes both permission directions."""
        bob_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')
        bob_client.set_permission(alice.id, 'street')

        contacts = alice_client.get_all_contact_locations()
        bob_contact = next(c for c in contacts if c['id'] == bob.id)

        assert bob_contact['permissionGranted'] == 'city'  # What Bob sees of Alice
        assert bob_contact['permissionReceived'] == 'street'  # What Alice sees of Bob

    def test_get_all_locations_filtered_per_contact(self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol):
        """Each contact's location is filtered by their specific permission."""
        bob_client.publish_location(SEATTLE_FULL)
        carol_client.publish_location(NYC_FULL)

        # Bob grants Alice 'city', Carol grants Alice 'street'
        bob_client.set_permission(alice.id, 'city')
        carol_client.set_permission(alice.id, 'street')

        contacts = alice_client.get_all_contact_locations()

        bob_contact = next(c for c in contacts if c['id'] == bob.id)
        carol_contact = next(c for c in contacts if c['id'] == carol.id)

        # Bob's location filtered to city
        assert bob_contact['location']['data']['hierarchy'].get('city') == 'Seattle'
        assert 'street' not in bob_contact['location']['data']['hierarchy']

        # Carol's location includes street
        assert carol_contact['location']['data']['hierarchy'].get('city') == 'New York City'
        assert carol_contact['location']['data']['hierarchy'].get('street') == '5th Avenue'

    def test_get_all_locations_includes_contacts_without_location(self, alice_and_bob_contacts, alice_client, bob):
        """Contacts without published location are included with null location."""
        contacts = alice_client.get_all_contact_locations()

        bob_contact = next(c for c in contacts if c['id'] == bob.id)

        assert bob_contact['name'] == bob.name
        assert bob_contact['location'] is None

    def test_get_all_locations_empty_when_no_contacts(self, alice_client):
        """Returns empty list when user has no contacts."""
        contacts = alice_client.get_all_contact_locations()

        assert contacts == []


class TestLocationStaleness:
    """Tests for stale location detection."""

    def test_fresh_location_not_marked_stale(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Recently published location is not marked as stale."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)

        assert location['location']['stale'] is False

    # Note: Testing actual staleness would require waiting 30+ minutes
    # or mocking time, which is beyond basic integration testing


class TestLocationTimestamp:
    """Tests for location timestamp handling."""

    def test_location_includes_updated_at(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Location response includes updated_at timestamp."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)

        assert location['location']['updated_at'] is not None

    def test_location_includes_client_timestamp(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Location data includes client-provided timestamp if present."""
        import json

        payload = json.dumps({
            "hierarchy": SEATTLE_FULL,
            "timestamp": "2025-12-13T10:00:00Z"
        })
        alice_client.publish_location_raw(payload)
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)

        assert location['location']['data']['timestamp'] == "2025-12-13T10:00:00Z"


class TestMultipleUsersScenario:
    """End-to-end scenarios with multiple users."""

    def test_three_users_see_appropriate_locations(self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol):
        """
        Scenario: Three users with different permission configurations.

        Alice publishes location.
        Bob has city permission.
        Carol has street permission.
        Each sees appropriate filtered location.
        """
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')
        alice_client.set_permission(carol.id, 'street')

        bob_view = bob_client.get_contact_location(alice.id)
        carol_view = carol_client.get_contact_location(alice.id)

        # Bob sees through city
        assert bob_view['location']['data']['hierarchy'].get('city') == 'Seattle'
        assert 'street' not in bob_view['location']['data']['hierarchy']

        # Carol sees through street
        assert carol_view['location']['data']['hierarchy'].get('city') == 'Seattle'
        assert carol_view['location']['data']['hierarchy'].get('street') == 'Broadway E'

    def test_users_only_see_contacts_in_bulk(self, alice_client, bob_client, carol_client, alice, bob, carol):
        """
        Users only see contacts they have in bulk retrieval.

        Alice → Bob (contacts)
        Bob → Carol (contacts)
        Alice does NOT see Carol
        """
        # Create Alice-Bob relationship only
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        bob_client.accept_request(requests['incoming'][0]['requestId'])

        # Create Bob-Carol relationship only
        bob_client.send_contact_request(carol.email)
        requests = carol_client.get_pending_requests()
        carol_client.accept_request(requests['incoming'][0]['requestId'])

        # All publish locations
        alice_client.publish_location(SEATTLE_FULL)
        bob_client.publish_location(NYC_FULL)
        carol_client.publish_location(LONDON_FULL)

        # Alice only sees Bob
        alice_contacts = alice_client.get_all_contact_locations()
        assert len(alice_contacts) == 1
        assert alice_contacts[0]['id'] == bob.id

        # Bob sees both Alice and Carol
        bob_contacts = bob_client.get_all_contact_locations()
        assert len(bob_contacts) == 2
        contact_ids = {c['id'] for c in bob_contacts}
        assert alice.id in contact_ids
        assert carol.id in contact_ids

        # Carol only sees Bob
        carol_contacts = carol_client.get_all_contact_locations()
        assert len(carol_contacts) == 1
        assert carol_contacts[0]['id'] == bob.id
