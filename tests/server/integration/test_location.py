"""
Location publishing integration tests.

Tests cover:
- Publishing location
- Retrieving own location
- Location updates
"""

import json
import pytest

from .api_client import APIClient, SEATTLE_FULL, NYC_FULL


class TestPublishLocation:
    """Tests for publishing location."""

    def test_publish_location(self, alice_client):
        """Can publish location."""
        result = alice_client.publish_location(SEATTLE_FULL)

        assert result['success'] is True
        assert 'timestamp' in result

    def test_publish_location_with_named_location(self, alice_client):
        """Can publish location with named location."""
        result = alice_client.publish_location(
            SEATTLE_FULL,
            {"label": "Home", "visibleTo": "private"}
        )

        assert result['success'] is True

    def test_publish_missing_payload_fails(self, alice_client):
        """Publishing without payload fails."""
        response = alice_client._post('/api/location', {})

        assert response.status_code == 400
        assert "payload" in response.json()['error'].lower()


class TestGetOwnLocation:
    """Tests for retrieving own location."""

    def test_get_own_location(self, alice_client):
        """Can retrieve own published location."""
        alice_client.publish_location(SEATTLE_FULL)

        result = alice_client.get_my_location()

        assert result['location'] is not None
        assert 'payload' in result['location']
        assert 'updated_at' in result['location']

    def test_get_location_returns_full_payload(self, alice_client):
        """Own location returns full unfiltered payload."""
        alice_client.publish_location(
            SEATTLE_FULL,
            {"label": "Home", "visibleTo": "private"}
        )

        result = alice_client.get_my_location()
        payload = json.loads(result['location']['payload'])

        assert payload['hierarchy'] == SEATTLE_FULL
        assert payload['namedLocation']['label'] == 'Home'

    def test_get_location_when_none_published(self, alice_client):
        """Getting location when none published returns null."""
        result = alice_client.get_my_location()

        assert result['location'] is None


class TestLocationUpdates:
    """Tests for location update behavior."""

    def test_location_update_overwrites_previous(self, alice_client):
        """New location update overwrites previous."""
        alice_client.publish_location(SEATTLE_FULL)
        alice_client.publish_location(NYC_FULL)

        result = alice_client.get_my_location()
        payload = json.loads(result['location']['payload'])

        assert payload['hierarchy']['city'] == 'New York City'
        assert payload['hierarchy']['state'] == 'New York'

    def test_location_update_changes_timestamp(self, alice_client):
        """Location update changes the timestamp."""
        alice_client.publish_location(SEATTLE_FULL)
        first_result = alice_client.get_my_location()
        first_timestamp = first_result['location']['updated_at']

        # Small delay to ensure different timestamp
        import time
        time.sleep(0.1)

        alice_client.publish_location(NYC_FULL)
        second_result = alice_client.get_my_location()
        second_timestamp = second_result['location']['updated_at']

        assert second_timestamp != first_timestamp


class TestLocationPayloadFormat:
    """Tests for location payload format."""

    def test_location_payload_is_json_string(self, alice_client):
        """Location payload is stored as JSON string."""
        alice_client.publish_location(SEATTLE_FULL)

        result = alice_client.get_my_location()

        # Should be valid JSON
        payload = json.loads(result['location']['payload'])
        assert isinstance(payload, dict)
        assert 'hierarchy' in payload

    def test_sparse_hierarchy_works(self, alice_client):
        """Can publish location with sparse hierarchy."""
        sparse = {"city": "Seattle", "country": "United States"}
        alice_client.publish_location(sparse)

        result = alice_client.get_my_location()
        payload = json.loads(result['location']['payload'])

        assert payload['hierarchy']['city'] == 'Seattle'
        assert payload['hierarchy']['country'] == 'United States'
        assert 'state' not in payload['hierarchy']
