"""
Permission management integration tests.

Tests cover:
- Default permission levels
- Setting/getting permissions
- Permission filtering of location hierarchy
- Asymmetric permissions
"""

import pytest

from .api_client import APIClient, SEATTLE_FULL


class TestDefaultPermissions:
    """Tests for default permission behavior."""

    def test_default_permission_is_planet(self, alice_and_bob_contacts, alice_client, bob):
        """New contacts default to 'planet' permission."""
        contacts = alice_client.get_contacts()
        bob_contact = next(c for c in contacts if c['id'] == bob.id)

        assert bob_contact['permissionGranted'] == 'planet'
        assert bob_contact['permissionReceived'] == 'planet'

    def test_get_permission_returns_default(self, alice_and_bob_contacts, alice_client, bob):
        """Get permission returns 'planet' for new contact."""
        perm = alice_client.get_permission(bob.id)

        assert perm['permissionGranted'] == 'planet'
        assert perm['permissionReceived'] == 'planet'


class TestSetPermission:
    """Tests for setting permission levels."""

    def test_set_permission_level(self, alice_and_bob_contacts, alice_client, bob):
        """Can set permission level for a contact."""
        result = alice_client.set_permission(bob.id, 'city')

        assert result['success'] is True
        assert result['permissionGranted'] == 'city'

    def test_set_permission_persists(self, alice_and_bob_contacts, alice_client, bob):
        """Set permission level persists."""
        alice_client.set_permission(bob.id, 'street')

        perm = alice_client.get_permission(bob.id)

        assert perm['permissionGranted'] == 'street'

    def test_set_all_permission_levels(self, alice_and_bob_contacts, alice_client, bob):
        """Can set all valid permission levels."""
        levels = alice_client.get_permission_levels()['levels']

        for level in levels:
            result = alice_client.set_permission(bob.id, level)
            assert result['permissionGranted'] == level

    def test_invalid_permission_level_fails(self, alice_and_bob_contacts, alice_client, bob):
        """Cannot set invalid permission level."""
        response = alice_client.set_permission_raw(bob.id, 'invalid_level')

        assert response.status_code == 400
        assert "invalid" in response.json()['error'].lower()

    def test_cannot_set_permission_for_non_contact(self, alice_client, bob):
        """Cannot set permission for someone who is not a contact."""
        response = alice_client.set_permission_raw(bob.id, 'city')

        assert response.status_code == 403


class TestAsymmetricPermissions:
    """Tests for asymmetric permission behavior."""

    def test_permissions_are_asymmetric(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Each user sets their own permission independently."""
        # Alice grants Bob 'city'
        alice_client.set_permission(bob.id, 'city')

        # Bob grants Alice 'street'
        bob_client.set_permission(alice.id, 'street')

        # Check from Alice's perspective
        alice_perm = alice_client.get_permission(bob.id)
        assert alice_perm['permissionGranted'] == 'city'  # What Bob sees of Alice
        assert alice_perm['permissionReceived'] == 'street'  # What Alice sees of Bob

        # Check from Bob's perspective
        bob_perm = bob_client.get_permission(alice.id)
        assert bob_perm['permissionGranted'] == 'street'  # What Alice sees of Bob
        assert bob_perm['permissionReceived'] == 'city'  # What Bob sees of Alice


class TestPermissionFiltering:
    """Tests for permission filtering of location hierarchy."""

    def test_planet_shows_nothing(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Planet permission shows no location hierarchy."""
        # Alice publishes full location
        alice_client.publish_location(SEATTLE_FULL)

        # Bob has default 'planet' permission
        location = bob_client.get_contact_location(alice.id)

        assert location['location']['data']['hierarchy'] == {}

    def test_continent_shows_continent_only(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Continent permission shows only continent."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'continent')

        location = bob_client.get_contact_location(alice.id)
        hierarchy = location['location']['data']['hierarchy']

        assert hierarchy.get('continent') == 'North America'
        assert 'country' not in hierarchy
        assert 'city' not in hierarchy

    def test_country_shows_continent_and_country(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Country permission shows continent and country."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'country')

        location = bob_client.get_contact_location(alice.id)
        hierarchy = location['location']['data']['hierarchy']

        assert hierarchy.get('continent') == 'North America'
        assert hierarchy.get('country') == 'United States'
        assert 'state' not in hierarchy

    def test_city_shows_through_city(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """City permission shows continent through city."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'city')

        location = bob_client.get_contact_location(alice.id)
        hierarchy = location['location']['data']['hierarchy']

        assert hierarchy.get('continent') == 'North America'
        assert hierarchy.get('country') == 'United States'
        assert hierarchy.get('state') == 'Washington'
        assert hierarchy.get('city') == 'Seattle'
        assert 'neighborhood' not in hierarchy
        assert 'street' not in hierarchy

    def test_street_shows_through_street(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Street permission shows continent through street."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'street')

        location = bob_client.get_contact_location(alice.id)
        hierarchy = location['location']['data']['hierarchy']

        assert hierarchy.get('continent') == 'North America'
        assert hierarchy.get('city') == 'Seattle'
        assert hierarchy.get('street') == 'Broadway E'
        assert 'address' not in hierarchy

    def test_address_shows_everything(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Address permission shows full hierarchy."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.set_permission(bob.id, 'address')

        location = bob_client.get_contact_location(alice.id)
        hierarchy = location['location']['data']['hierarchy']

        assert hierarchy.get('continent') == 'North America'
        assert hierarchy.get('country') == 'United States'
        assert hierarchy.get('state') == 'Washington'
        assert hierarchy.get('city') == 'Seattle'
        assert hierarchy.get('neighborhood') == 'Capitol Hill'
        assert hierarchy.get('street') == 'Broadway E'
        assert hierarchy.get('address') == '123 Broadway E'

    def test_permission_change_affects_future_reads(self, alice_and_bob_contacts, alice_client, bob_client, alice, bob):
        """Changing permission affects subsequent location reads."""
        alice_client.publish_location(SEATTLE_FULL)

        # Start with planet - Bob sees nothing
        location = bob_client.get_contact_location(alice.id)
        assert location['location']['data']['hierarchy'] == {}

        # Upgrade to city
        alice_client.set_permission(bob.id, 'city')
        location = bob_client.get_contact_location(alice.id)
        assert location['location']['data']['hierarchy'].get('city') == 'Seattle'

        # Downgrade to continent
        alice_client.set_permission(bob.id, 'continent')
        location = bob_client.get_contact_location(alice.id)
        assert 'city' not in location['location']['data']['hierarchy']
        assert location['location']['data']['hierarchy'].get('continent') == 'North America'


class TestPermissionLevelsEndpoint:
    """Tests for the permission levels endpoint."""

    def test_get_permission_levels(self, client):
        """Can retrieve available permission levels."""
        levels = client.get_permission_levels()

        expected_levels = [
            'planet', 'continent', 'country', 'state', 'county',
            'city', 'neighborhood', 'street', 'address'
        ]

        assert levels['levels'] == expected_levels
        assert levels['default'] == 'planet'

    def test_permission_levels_ordered_least_to_most(self, client):
        """Permission levels are ordered from least to most specific."""
        levels = client.get_permission_levels()['levels']

        assert levels[0] == 'planet'  # Least specific
        assert levels[-1] == 'address'  # Most specific
