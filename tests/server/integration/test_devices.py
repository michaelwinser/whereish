"""
Device registry integration tests.

Tests cover:
- Listing devices
- Adding devices
- Activating devices
- Deleting devices
- Device registration via OAuth
"""

from .api_client import APIClient


class TestDeviceList:
    """Tests for listing devices."""

    def test_list_devices_empty(self, client, unique_email):
        """New user has no devices."""
        email = unique_email("nodevices")
        client.register(email, "password123", "No Devices User")

        devices = client.get_devices()

        assert devices == []

    def test_list_devices_requires_auth(self, server):
        """List devices requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.get_devices_raw()

        assert response.status_code == 401


class TestDeviceAdd:
    """Tests for adding devices."""

    def test_add_device_success(self, client, unique_email):
        """User can add a device."""
        email = unique_email("adddevice")
        client.register(email, "password123", "Device User")

        device = client.add_device("My iPhone", "ios")

        assert device['id'] is not None
        assert device['name'] == "My iPhone"
        assert device['platform'] == "ios"
        assert device['isActive'] is True  # First device is active

    def test_add_device_without_platform(self, client, unique_email):
        """User can add a device without specifying platform."""
        email = unique_email("noplatform")
        client.register(email, "password123", "Platform User")

        device = client.add_device("My Device")

        assert device['name'] == "My Device"
        assert device['platform'] is None

    def test_add_second_device_inactive(self, client, unique_email):
        """Second device is not active by default."""
        email = unique_email("twodevices")
        client.register(email, "password123", "Two Device User")

        device1 = client.add_device("First Device", "ios")
        device2 = client.add_device("Second Device", "android")

        assert device1['isActive'] is True
        assert device2['isActive'] is False

    def test_add_device_requires_name(self, client, unique_email):
        """Add device fails without name."""
        email = unique_email("noname")
        client.register(email, "password123", "No Name User")

        response = client.add_device_raw(body={'name': ''})

        assert response.status_code == 400
        assert 'name is required' in response.json()['error']

    def test_add_device_name_too_long(self, client, unique_email):
        """Add device fails with name too long."""
        email = unique_email("longname")
        client.register(email, "password123", "Long Name User")

        long_name = "x" * 51
        response = client.add_device_raw(name=long_name)

        assert response.status_code == 400
        assert 'too long' in response.json()['error']

    def test_add_device_requires_auth(self, server):
        """Add device requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.add_device_raw(name="Test Device")

        assert response.status_code == 401


class TestDeviceActivate:
    """Tests for activating devices."""

    def test_activate_device_success(self, client, unique_email):
        """User can activate a different device."""
        email = unique_email("activate")
        client.register(email, "password123", "Activate User")

        device1 = client.add_device("First Device")
        device2 = client.add_device("Second Device")

        # Activate second device
        result = client.activate_device(device2['id'])

        assert result['success'] is True
        assert result['deviceId'] == device2['id']

        # Verify device states
        devices = client.get_devices()
        device_map = {d['id']: d for d in devices}

        assert device_map[device1['id']]['isActive'] is False
        assert device_map[device2['id']]['isActive'] is True

    def test_activate_nonexistent_device(self, client, unique_email):
        """Activating non-existent device fails."""
        email = unique_email("noactivate")
        client.register(email, "password123", "No Activate User")

        response = client.activate_device_raw("nonexistent123")

        assert response.status_code == 404

    def test_activate_other_user_device(self, client, unique_email, server):
        """Cannot activate another user's device."""
        # Create first user with device
        email1 = unique_email("user1")
        client.register(email1, "password123", "User One")
        device = client.add_device("User1 Device")

        # Create second user
        client2 = APIClient(server)
        email2 = unique_email("user2")
        client2.register(email2, "password123", "User Two")

        # Try to activate first user's device
        response = client2.activate_device_raw(device['id'])

        assert response.status_code == 404

    def test_activate_device_requires_auth(self, server):
        """Activate device requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.activate_device_raw("someid")

        assert response.status_code == 401


class TestDeviceDelete:
    """Tests for deleting devices."""

    def test_delete_device_success(self, client, unique_email):
        """User can delete a device."""
        email = unique_email("delete")
        client.register(email, "password123", "Delete User")

        device = client.add_device("Device to Delete")
        result = client.delete_device(device['id'])

        assert result['success'] is True

        # Verify it's gone
        devices = client.get_devices()
        assert len(devices) == 0

    def test_delete_nonexistent_device(self, client, unique_email):
        """Deleting non-existent device fails."""
        email = unique_email("nodelete")
        client.register(email, "password123", "No Delete User")

        response = client.delete_device_raw("nonexistent123")

        assert response.status_code == 404

    def test_delete_other_user_device(self, client, unique_email, server):
        """Cannot delete another user's device."""
        # Create first user with device
        email1 = unique_email("deluser1")
        client.register(email1, "password123", "Del User One")
        device = client.add_device("User1 Device")

        # Create second user
        client2 = APIClient(server)
        email2 = unique_email("deluser2")
        client2.register(email2, "password123", "Del User Two")

        # Try to delete first user's device
        response = client2.delete_device_raw(device['id'])

        assert response.status_code == 404

    def test_delete_device_requires_auth(self, server):
        """Delete device requires authentication."""
        anon_client = APIClient(server)
        response = anon_client.delete_device_raw("someid")

        assert response.status_code == 401


class TestDeviceOAuth:
    """Tests for device registration via OAuth."""

    def test_oauth_with_device_registers_device(self, client, unique_email):
        """OAuth login with device info registers the device."""
        from .test_google_oauth import make_test_token

        email = unique_email("oauthdevice")
        token = make_test_token(email, "OAuth Device User")

        # Login with device info
        response = client.auth_google_raw(body={
            'id_token': token,
            'device': {
                'name': 'My Test iPhone',
                'platform': 'ios'
            }
        })

        data = response.json()
        assert 'device' in data
        assert data['device']['name'] == 'My Test iPhone'
        assert data['device']['platform'] == 'ios'
        assert data['device']['isActive'] is True

        # Verify device was created
        client.set_token(data['token'])
        devices = client.get_devices()
        assert len(devices) == 1
        assert devices[0]['name'] == 'My Test iPhone'

    def test_oauth_without_device_no_device(self, client, unique_email):
        """OAuth login without device info doesn't create device."""
        from .test_google_oauth import make_test_token

        email = unique_email("oauthnodevice")
        token = make_test_token(email, "OAuth No Device User")

        response = client.auth_google_raw(token)
        data = response.json()

        assert 'device' not in data

        # Verify no device was created
        client.set_token(data['token'])
        devices = client.get_devices()
        assert len(devices) == 0

    def test_oauth_with_empty_device_name_no_device(self, client, unique_email):
        """OAuth login with empty device name doesn't create device."""
        from .test_google_oauth import make_test_token

        email = unique_email("oauthempty")
        token = make_test_token(email, "OAuth Empty User")

        response = client.auth_google_raw(body={
            'id_token': token,
            'device': {
                'name': '',
                'platform': 'ios'
            }
        })

        data = response.json()
        assert 'device' not in data


class TestDeviceMultiple:
    """Tests for multiple device scenarios."""

    def test_three_devices_only_one_active(self, client, unique_email):
        """Only one device can be active at a time."""
        email = unique_email("threedevices")
        client.register(email, "password123", "Three Device User")

        client.add_device("Device 1")
        client.add_device("Device 2")
        device3 = client.add_device("Device 3")

        # Activate third device
        client.activate_device(device3['id'])

        # Check only one is active
        devices = client.get_devices()
        active_count = sum(1 for d in devices if d['isActive'])

        assert active_count == 1
        assert any(d['id'] == device3['id'] and d['isActive'] for d in devices)

    def test_device_list_contains_all_devices(self, client, unique_email):
        """Device list contains all registered devices."""
        email = unique_email("listall")
        client.register(email, "password123", "List All User")

        client.add_device("First Device")
        client.add_device("Second Device")
        client.add_device("Third Device")

        devices = client.get_devices()
        device_names = [d['name'] for d in devices]

        assert len(devices) == 3
        assert "First Device" in device_names
        assert "Second Device" in device_names
        assert "Third Device" in device_names
