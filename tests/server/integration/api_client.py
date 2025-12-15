"""
API Client for integration testing.

Provides a clean, readable interface for API operations while using HTTP under the hood.
"""

import json
from dataclasses import dataclass

import requests


@dataclass
class User:
    """Represents a registered user."""
    id: str
    email: str
    name: str
    token: str


class APIError(Exception):
    """API request failed."""
    def __init__(self, status_code, message):
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP {status_code}: {message}")


class APIClient:
    """HTTP client for Whereish API integration testing."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.token = None

    def _request(self, method: str, endpoint: str, data=None, auth=True, expected_status=None):
        """Make an API request."""
        url = f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}

        if auth and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        response = requests.request(method, url, json=data, headers=headers)

        # Check expected status if provided
        if expected_status is not None:
            if response.status_code != expected_status:
                try:
                    error = response.json().get('error', response.text)
                except Exception:
                    error = response.text
                raise APIError(response.status_code, error)

        return response

    def _get(self, endpoint, auth=True, expected_status=None):
        return self._request('GET', endpoint, auth=auth, expected_status=expected_status)

    def _post(self, endpoint, data=None, auth=True, expected_status=None):
        return self._request('POST', endpoint, data=data, auth=auth, expected_status=expected_status)

    def _put(self, endpoint, data=None, auth=True, expected_status=None):
        return self._request('PUT', endpoint, data=data, auth=auth, expected_status=expected_status)

    def _delete(self, endpoint, auth=True, expected_status=None):
        return self._request('DELETE', endpoint, auth=auth, expected_status=expected_status)

    # ===================
    # Health
    # ===================

    def health(self) -> dict:
        """Check server health."""
        response = self._get('/api/health', auth=False, expected_status=200)
        return response.json()

    # ===================
    # Authentication
    # ===================

    def register(self, email: str, password: str, name: str) -> User:
        """Register a new user and store token."""
        response = self._post('/api/auth/register', {
            'email': email,
            'password': password,
            'name': name
        }, auth=False, expected_status=201)

        data = response.json()
        self.token = data['token']
        return User(
            id=data['user']['id'],
            email=data['user']['email'],
            name=data['user']['name'],
            token=data['token']
        )

    def register_raw(self, email: str, password: str, name: str):
        """Register without automatic token storage - for testing errors."""
        return self._post('/api/auth/register', {
            'email': email,
            'password': password,
            'name': name
        }, auth=False)

    def login(self, email: str, password: str) -> User:
        """Login and store token."""
        response = self._post('/api/auth/login', {
            'email': email,
            'password': password
        }, auth=False, expected_status=200)

        data = response.json()
        self.token = data['token']
        return User(
            id=data['user']['id'],
            email=data['user']['email'],
            name=data['user']['name'],
            token=data['token']
        )

    def login_raw(self, email: str, password: str):
        """Login without automatic token storage - for testing errors."""
        return self._post('/api/auth/login', {
            'email': email,
            'password': password
        }, auth=False)

    def auth_google(self, id_token: str) -> User:
        """Authenticate via Google OAuth and store token."""
        response = self._post('/api/auth/google', {
            'id_token': id_token
        }, auth=False, expected_status=200)

        data = response.json()
        self.token = data['token']
        return User(
            id=data['user']['id'],
            email=data['user']['email'],
            name=data['user']['name'],
            token=data['token']
        )

    def auth_google_raw(self, id_token: str = None, body: dict = None):
        """Google OAuth without automatic token storage - for testing errors."""
        if body is not None:
            return self._post('/api/auth/google', body, auth=False)
        return self._post('/api/auth/google', {'id_token': id_token}, auth=False)

    def logout(self):
        """Clear stored token."""
        self.token = None

    def whoami(self) -> dict:
        """Get current user info."""
        response = self._get('/api/me', expected_status=200)
        return response.json()

    def whoami_raw(self):
        """Get current user info without status check."""
        return self._get('/api/me')

    def set_token(self, token: str):
        """Manually set auth token."""
        self.token = token

    # ===================
    # Identity Backup
    # ===================

    def store_identity_backup(self, encrypted_identity: str) -> dict:
        """Store encrypted identity backup on server."""
        response = self._post('/api/identity/backup', {
            'encryptedIdentity': encrypted_identity
        }, expected_status=200)
        return response.json()

    def store_identity_backup_raw(self, encrypted_identity: str = None, body: dict = None):
        """Store backup without status check."""
        if body is not None:
            return self._post('/api/identity/backup', body)
        return self._post('/api/identity/backup', {'encryptedIdentity': encrypted_identity})

    def get_identity_backup(self) -> dict:
        """Get encrypted identity backup from server."""
        response = self._get('/api/identity/backup', expected_status=200)
        return response.json()

    def get_identity_backup_raw(self):
        """Get backup without status check."""
        return self._get('/api/identity/backup')

    def delete_identity_backup(self) -> dict:
        """Delete encrypted identity backup from server."""
        response = self._delete('/api/identity/backup', expected_status=200)
        return response.json()

    def delete_identity_backup_raw(self):
        """Delete backup without status check."""
        return self._delete('/api/identity/backup')

    # ===================
    # Contacts
    # ===================

    def send_contact_request(self, email: str) -> dict:
        """Send a contact request."""
        response = self._post('/api/contacts/request', {'email': email}, expected_status=201)
        return response.json()

    def send_contact_request_raw(self, email: str):
        """Send contact request without status check."""
        return self._post('/api/contacts/request', {'email': email})

    def get_pending_requests(self) -> dict:
        """Get pending contact requests (incoming and outgoing)."""
        response = self._get('/api/contacts/requests', expected_status=200)
        return response.json()

    def get_pending_requests_raw(self):
        """Get pending requests with full response (for header testing)."""
        return self._get('/api/contacts/requests')

    def accept_request(self, request_id: int) -> dict:
        """Accept a contact request."""
        response = self._post(f'/api/contacts/requests/{request_id}/accept', expected_status=200)
        return response.json()

    def accept_request_raw(self, request_id: int):
        """Accept request without status check."""
        return self._post(f'/api/contacts/requests/{request_id}/accept')

    def decline_request(self, request_id: int) -> dict:
        """Decline a contact request."""
        response = self._post(f'/api/contacts/requests/{request_id}/decline', expected_status=200)
        return response.json()

    def decline_request_raw(self, request_id: int):
        """Decline request without status check."""
        return self._post(f'/api/contacts/requests/{request_id}/decline')

    def cancel_request(self, request_id: int) -> dict:
        """Cancel an outgoing contact request."""
        response = self._post(f'/api/contacts/requests/{request_id}/cancel', expected_status=200)
        return response.json()

    def cancel_request_raw(self, request_id: int):
        """Cancel request without status check."""
        return self._post(f'/api/contacts/requests/{request_id}/cancel')

    def get_contacts(self) -> list:
        """Get list of contacts."""
        response = self._get('/api/contacts', expected_status=200)
        return response.json()['contacts']

    def remove_contact(self, contact_id: str) -> dict:
        """Remove a contact."""
        response = self._delete(f'/api/contacts/{contact_id}', expected_status=200)
        return response.json()

    def remove_contact_raw(self, contact_id: str):
        """Remove contact without status check."""
        return self._delete(f'/api/contacts/{contact_id}')

    # ===================
    # Permissions
    # ===================

    def get_permission(self, contact_id: str) -> dict:
        """Get permission for a contact."""
        response = self._get(f'/api/contacts/{contact_id}/permission', expected_status=200)
        return response.json()

    def get_permission_raw(self, contact_id: str):
        """Get permission without status check."""
        return self._get(f'/api/contacts/{contact_id}/permission')

    def set_permission(self, contact_id: str, level: str) -> dict:
        """Set permission level for a contact."""
        response = self._put(f'/api/contacts/{contact_id}/permission', {'level': level}, expected_status=200)
        return response.json()

    def set_permission_raw(self, contact_id: str, level: str):
        """Set permission without status check."""
        return self._put(f'/api/contacts/{contact_id}/permission', {'level': level})

    def get_permission_levels(self) -> dict:
        """Get available permission levels."""
        response = self._get('/api/permission-levels', auth=False, expected_status=200)
        return response.json()

    # ===================
    # Location
    # ===================

    def publish_location(self, hierarchy: dict, named_location: dict = None) -> dict:
        """Publish current location."""
        payload = {'hierarchy': hierarchy}
        if named_location:
            payload['namedLocation'] = named_location

        response = self._post('/api/location', {'payload': json.dumps(payload)}, expected_status=200)
        return response.json()

    def publish_location_raw(self, payload_str: str):
        """Publish location with raw payload string."""
        return self._post('/api/location', {'payload': payload_str})

    def get_my_location(self) -> dict:
        """Get own stored location."""
        response = self._get('/api/location', expected_status=200)
        return response.json()

    def get_contact_location(self, contact_id: str) -> dict:
        """Get a contact's location."""
        response = self._get(f'/api/contacts/{contact_id}/location', expected_status=200)
        return response.json()

    def get_contact_location_raw(self, contact_id: str):
        """Get contact location without status check."""
        return self._get(f'/api/contacts/{contact_id}/location')

    def get_all_contact_locations(self) -> list:
        """Get all contacts with their locations."""
        response = self._get('/api/contacts/locations', expected_status=200)
        return response.json()['contacts']

    # ===================
    # Encrypted Location (E2E Encryption)
    # ===================

    def register_public_key(self, public_key: str) -> dict:
        """Register user's public key for E2E encryption."""
        response = self._post('/api/identity/register', {'publicKey': public_key}, expected_status=200)
        return response.json()

    def register_public_key_raw(self, public_key: str):
        """Register public key without status check."""
        return self._post('/api/identity/register', {'publicKey': public_key})

    def get_contact_public_key(self, contact_id: str) -> dict:
        """Get a contact's public key."""
        response = self._get(f'/api/contacts/{contact_id}/public-key', expected_status=200)
        return response.json()

    def get_contact_public_key_raw(self, contact_id: str):
        """Get contact public key without status check."""
        return self._get(f'/api/contacts/{contact_id}/public-key')

    def publish_encrypted_locations(self, locations: list) -> dict:
        """Publish encrypted location blobs for contacts."""
        response = self._post('/api/location/encrypted', {'locations': locations}, expected_status=200)
        return response.json()

    def publish_encrypted_locations_raw(self, locations: list):
        """Publish encrypted locations without status check."""
        return self._post('/api/location/encrypted', {'locations': locations})

    def get_contacts_encrypted(self) -> list:
        """Get contacts with encrypted location blobs."""
        response = self._get('/api/contacts/encrypted', expected_status=200)
        return response.json()['contacts']

    # ===================
    # Devices
    # ===================

    def get_devices(self) -> list:
        """Get list of user's devices."""
        response = self._get('/api/devices', expected_status=200)
        return response.json()['devices']

    def get_devices_raw(self):
        """Get devices without status check."""
        return self._get('/api/devices')

    def add_device(self, name: str, platform: str = None) -> dict:
        """Register a new device."""
        data = {'name': name}
        if platform:
            data['platform'] = platform
        response = self._post('/api/devices', data, expected_status=201)
        return response.json()['device']

    def add_device_raw(self, name: str = None, platform: str = None, body: dict = None):
        """Add device without status check."""
        if body is not None:
            return self._post('/api/devices', body)
        data = {}
        if name:
            data['name'] = name
        if platform:
            data['platform'] = platform
        return self._post('/api/devices', data)

    def activate_device(self, device_id: str) -> dict:
        """Set a device as active."""
        response = self._post(f'/api/devices/{device_id}/activate', expected_status=200)
        return response.json()

    def activate_device_raw(self, device_id: str):
        """Activate device without status check."""
        return self._post(f'/api/devices/{device_id}/activate')

    def delete_device(self, device_id: str) -> dict:
        """Remove a device."""
        response = self._delete(f'/api/devices/{device_id}', expected_status=200)
        return response.json()

    def delete_device_raw(self, device_id: str):
        """Delete device without status check."""
        return self._delete(f'/api/devices/{device_id}')


# ===================
# Test Data Helpers
# ===================

SEATTLE_FULL = {
    "continent": "North America",
    "country": "United States",
    "state": "Washington",
    "city": "Seattle",
    "neighborhood": "Capitol Hill",
    "street": "Broadway E",
    "address": "123 Broadway E"
}

NYC_FULL = {
    "continent": "North America",
    "country": "United States",
    "state": "New York",
    "city": "New York City",
    "neighborhood": "Manhattan",
    "street": "5th Avenue",
    "address": "350 5th Avenue"
}

LONDON_FULL = {
    "continent": "Europe",
    "country": "United Kingdom",
    "state": "England",
    "city": "London",
    "neighborhood": "Westminster",
    "street": "Downing Street",
    "address": "10 Downing Street"
}


def named_location_private(label: str) -> dict:
    """Create a private named location."""
    return {"label": label, "visibleTo": "private"}


def named_location_all(label: str) -> dict:
    """Create a named location visible to all contacts."""
    return {"label": label, "visibleTo": "all"}


def named_location_selected(label: str, contact_ids: list) -> dict:
    """Create a named location visible to selected contacts."""
    return {"label": label, "visibleTo": contact_ids}
