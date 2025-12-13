"""
Named location visibility integration tests.

These tests verify the KEY PRINCIPLE from the PRD:
Named location visibility is COMPLETELY INDEPENDENT of geographic permissions.

Tests cover:
- Private named locations (nobody sees)
- Named locations visible to all
- Named locations visible to selected contacts
- Independence from geographic permissions
- The "Cancer Treatment Facility" scenario
"""

import pytest

from .api_client import (
    APIClient, SEATTLE_FULL,
    named_location_private, named_location_all, named_location_selected
)


class TestPrivateNamedLocations:
    """Tests for private named location visibility."""

    def test_private_named_location_not_shown(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Private named location is not shown to anyone."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_private("Secret Place")
        )

        # Even with full address permission
        alice_client.set_permission(bob.id, 'address')

        location = bob_client.get_contact_location(alice.id)

        assert location['location']['data']['namedLocation'] is None

    def test_private_named_location_with_all_permission_levels(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Private named location hidden regardless of geographic permission."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_private("Private Office")
        )

        for level in ['planet', 'city', 'street', 'address']:
            alice_client.set_permission(bob.id, level)
            location = bob_client.get_contact_location(alice.id)

            assert location['location']['data']['namedLocation'] is None, \
                f"Private named location should be hidden at {level} level"


class TestNamedLocationVisibleToAll:
    """Tests for named locations visible to all contacts."""

    def test_named_location_visible_to_all(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Named location with 'all' visibility is shown to contacts."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_all("Coffee Shop")
        )

        location = bob_client.get_contact_location(alice.id)

        assert location['location']['data']['namedLocation'] == "Coffee Shop"

    def test_visible_to_all_with_planet_permission(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Named location visible even with planet (minimal) geographic permission."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_all("Soccer Field")
        )

        # Bob has default planet permission (sees no geographic info)
        location = bob_client.get_contact_location(alice.id)

        # Bob sees the named location but NOT the geographic hierarchy
        assert location['location']['data']['namedLocation'] == "Soccer Field"
        assert location['location']['data']['hierarchy'] == {}

    def test_visible_to_all_multiple_contacts(self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol):
        """Named location with 'all' visibility shown to all contacts."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_all("Public Place")
        )

        bob_location = bob_client.get_contact_location(alice.id)
        carol_location = carol_client.get_contact_location(alice.id)

        assert bob_location['location']['data']['namedLocation'] == "Public Place"
        assert carol_location['location']['data']['namedLocation'] == "Public Place"


class TestNamedLocationVisibleToSelected:
    """Tests for named locations visible to selected contacts."""

    def test_named_location_visible_to_selected(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Named location with selected visibility shown only to specified contacts."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_selected("Team Meeting Room", [bob.id])
        )

        location = bob_client.get_contact_location(alice.id)

        assert location['location']['data']['namedLocation'] == "Team Meeting Room"

    def test_named_location_hidden_from_non_selected(self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol):
        """Named location hidden from contacts not in selected list."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_selected("Bob's Eyes Only", [bob.id])
        )

        bob_location = bob_client.get_contact_location(alice.id)
        carol_location = carol_client.get_contact_location(alice.id)

        assert bob_location['location']['data']['namedLocation'] == "Bob's Eyes Only"
        assert carol_location['location']['data']['namedLocation'] is None

    def test_selected_visibility_multiple_contacts(self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol):
        """Named location visible to multiple selected contacts."""
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_selected("Team Hangout", [bob.id, carol.id])
        )

        bob_location = bob_client.get_contact_location(alice.id)
        carol_location = carol_client.get_contact_location(alice.id)

        assert bob_location['location']['data']['namedLocation'] == "Team Hangout"
        assert carol_location['location']['data']['namedLocation'] == "Team Hangout"


class TestOrthogonalPermissions:
    """
    Tests for the KEY PRINCIPLE:
    Named location visibility is COMPLETELY INDEPENDENT of geographic permissions.

    These two permission systems NEVER interact:
    - Geographic permission controls: continent, country, state, city, etc.
    - Named location visibility controls: the semantic label ("Home", "Work", etc.)
    """

    def test_street_permission_does_not_reveal_private_named_location(
        self, alice_and_bob_contacts, alice_client, bob_client, alice, bob
    ):
        """
        PRD Critical Example: Cancer Treatment Facility scenario.

        Even with street-level geographic permission, a private named location
        is NOT revealed. The contact sees the address but NOT the semantic label.
        """
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_private("Cancer Treatment Facility")
        )

        # Bob has street-level permission
        alice_client.set_permission(bob.id, 'street')

        location = bob_client.get_contact_location(alice.id)

        # Bob sees geographic info up to street
        assert location['location']['data']['hierarchy'].get('street') == 'Broadway E'
        assert location['location']['data']['hierarchy'].get('city') == 'Seattle'

        # But Bob does NOT see the named location label
        assert location['location']['data']['namedLocation'] is None

    def test_planet_permission_can_see_named_location_if_granted(
        self, alice_and_bob_contacts, alice_client, bob_client, alice, bob
    ):
        """
        A contact with planet (minimal) geographic permission CAN see
        a named location if explicitly granted visibility.

        This proves the systems are truly independent.
        """
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_all("Soccer Field")
        )

        # Bob has planet permission (sees no geographic hierarchy)
        alice_client.set_permission(bob.id, 'planet')

        location = bob_client.get_contact_location(alice.id)

        # No geographic info
        assert location['location']['data']['hierarchy'] == {}

        # But CAN see the named location
        assert location['location']['data']['namedLocation'] == "Soccer Field"

    def test_address_permission_still_respects_named_location_privacy(
        self, alice_and_bob_contacts, alice_client, bob_client, alice, bob
    ):
        """
        Even with the highest geographic permission (address),
        private named locations remain hidden.
        """
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_private("Therapist Office")
        )

        # Bob has full address permission
        alice_client.set_permission(bob.id, 'address')

        location = bob_client.get_contact_location(alice.id)

        # Full geographic info visible
        assert location['location']['data']['hierarchy'].get('address') == '123 Broadway E'

        # Named location still hidden
        assert location['location']['data']['namedLocation'] is None

    def test_mixed_permissions_scenario(
        self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol
    ):
        """
        Complex scenario testing orthogonal permissions:
        - Bob: street permission, granted named location visibility
        - Carol: street permission, NOT granted named location visibility

        Both see the same geographic info, but only Bob sees the label.
        """
        alice_client.publish_location(
            SEATTLE_FULL,
            named_location_selected("Doctor's Office", [bob.id])
        )

        # Both have street permission
        alice_client.set_permission(bob.id, 'street')
        alice_client.set_permission(carol.id, 'street')

        bob_location = bob_client.get_contact_location(alice.id)
        carol_location = carol_client.get_contact_location(alice.id)

        # Both see the same geographic info
        assert bob_location['location']['data']['hierarchy'].get('street') == 'Broadway E'
        assert carol_location['location']['data']['hierarchy'].get('street') == 'Broadway E'

        # Only Bob sees the named location
        assert bob_location['location']['data']['namedLocation'] == "Doctor's Office"
        assert carol_location['location']['data']['namedLocation'] is None


class TestLegacyNamedLocationFormat:
    """Tests for backward compatibility with legacy named location format."""

    def test_legacy_string_format_treated_as_private(
        self, alice_and_bob_contacts, alice_client, bob_client, alice, bob
    ):
        """
        Legacy format (just a string label) is treated as private.
        This maintains backward compatibility while defaulting to privacy.
        """
        # Publish with legacy format (string instead of object)
        import json
        payload = json.dumps({
            "hierarchy": SEATTLE_FULL,
            "namedLocation": "Legacy Place"  # String, not object
        })
        alice_client.publish_location_raw(payload)

        # Even with address permission
        alice_client.set_permission(bob.id, 'address')

        location = bob_client.get_contact_location(alice.id)

        # Legacy string format is treated as private - not shown
        assert location['location']['data']['namedLocation'] is None


class TestNamedLocationInBulkRetrieval:
    """Tests for named location visibility in bulk contact location retrieval."""

    def test_get_all_locations_respects_named_visibility(
        self, three_users_contacts, alice_client, bob_client, carol_client, alice, bob, carol
    ):
        """Named location visibility is respected in get_all_contact_locations."""
        # Bob publishes with named location visible only to Alice
        bob_client.publish_location(
            SEATTLE_FULL,
            named_location_selected("Bob's Secret Spot", [alice.id])
        )

        # Alice gets all contacts' locations
        contacts = alice_client.get_all_contact_locations()
        bob_contact = next(c for c in contacts if c['id'] == bob.id)

        assert bob_contact['location']['data']['namedLocation'] == "Bob's Secret Spot"

        # Carol gets all contacts' locations
        contacts = carol_client.get_all_contact_locations()
        bob_contact = next(c for c in contacts if c['id'] == bob.id)

        assert bob_contact['location']['data']['namedLocation'] is None
