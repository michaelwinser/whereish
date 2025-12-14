"""
API Response Headers integration tests.

Tests verify that API responses include proper headers for:
- Cache control (preventing stale data issues)
- CORS support
- Version information
"""

import pytest

from .api_client import APIClient


class TestCacheControlHeaders:
    """Tests for Cache-Control headers on API responses."""

    def test_contacts_requests_has_cache_control(self, alice_client):
        """GET /api/contacts/requests includes no-cache headers."""
        response = alice_client.get_pending_requests_raw()

        assert response.status_code == 200
        assert 'Cache-Control' in response.headers
        cache_control = response.headers['Cache-Control']
        assert 'no-cache' in cache_control
        assert 'no-store' in cache_control
        assert 'must-revalidate' in cache_control

    def test_contacts_requests_has_pragma_no_cache(self, alice_client):
        """GET /api/contacts/requests includes Pragma: no-cache for HTTP/1.0."""
        response = alice_client.get_pending_requests_raw()

        assert response.status_code == 200
        assert 'Pragma' in response.headers
        assert response.headers['Pragma'] == 'no-cache'

    def test_contacts_requests_has_expires_zero(self, alice_client):
        """GET /api/contacts/requests includes Expires: 0."""
        response = alice_client.get_pending_requests_raw()

        assert response.status_code == 200
        assert 'Expires' in response.headers
        assert response.headers['Expires'] == '0'

    def test_contacts_list_has_cache_control(self, alice_client):
        """GET /api/contacts includes no-cache headers."""
        response = alice_client._get('/api/contacts')

        assert response.status_code == 200
        assert 'Cache-Control' in response.headers
        cache_control = response.headers['Cache-Control']
        assert 'no-cache' in cache_control

    def test_contacts_encrypted_has_cache_control(self, alice_client, bob_client, bob, alice):
        """GET /api/contacts/encrypted includes no-cache headers."""
        # Create contact relationship first
        alice_client.send_contact_request(bob.email)
        requests = bob_client.get_pending_requests()
        request_id = requests['incoming'][0]['requestId']
        bob_client.accept_request(request_id)

        # Get encrypted contacts list (E2E encryption endpoint)
        response = alice_client._get('/api/contacts/encrypted')

        assert response.status_code == 200
        assert 'Cache-Control' in response.headers
        cache_control = response.headers['Cache-Control']
        assert 'no-cache' in cache_control

    def test_whoami_has_cache_control(self, alice_client):
        """GET /api/me includes no-cache headers."""
        response = alice_client.whoami_raw()

        assert response.status_code == 200
        assert 'Cache-Control' in response.headers
        cache_control = response.headers['Cache-Control']
        assert 'no-cache' in cache_control

    def test_health_endpoint_not_api_no_cache_control(self, api_client):
        """GET /api/health is still under /api/ so has cache control."""
        # Note: Health is under /api/ so it will have cache control
        # This is fine - health checks shouldn't be cached anyway
        response = api_client._get('/api/health', auth=False)

        assert response.status_code == 200
        assert 'Cache-Control' in response.headers


class TestVersionHeaders:
    """Tests for version headers on API responses."""

    def test_api_response_includes_version_header(self, alice_client):
        """API responses include X-App-Version header."""
        response = alice_client.get_pending_requests_raw()

        assert response.status_code == 200
        assert 'X-App-Version' in response.headers
        # Version should be a number
        version = int(response.headers['X-App-Version'])
        assert version > 0

    def test_api_response_includes_min_version_header(self, alice_client):
        """API responses include X-Min-App-Version header."""
        response = alice_client.get_pending_requests_raw()

        assert response.status_code == 200
        assert 'X-Min-App-Version' in response.headers


class TestCorsHeaders:
    """Tests for CORS headers on API responses."""

    def test_api_response_includes_cors_headers(self, alice_client):
        """API responses include CORS headers."""
        response = alice_client.get_pending_requests_raw()

        assert response.status_code == 200
        assert 'Access-Control-Allow-Origin' in response.headers
        assert 'Access-Control-Allow-Methods' in response.headers
        assert 'Access-Control-Allow-Headers' in response.headers
