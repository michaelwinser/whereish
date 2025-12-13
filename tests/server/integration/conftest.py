"""
Pytest fixtures for server integration tests.
"""

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pytest
import requests

from .api_client import APIClient

# Default test server port
TEST_PORT = 8599
TEST_URL = f"http://localhost:{TEST_PORT}"


def wait_for_server(url, timeout=10):
    """Wait for server to be ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(f"{url}/api/health", timeout=1)
            if response.status_code == 200:
                return True
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(0.1)
    return False


@pytest.fixture(scope="session")
def server():
    """Start test server with temporary database for the entire test session."""
    # Create temporary database
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test.db")

    # Get server directory
    repo_root = Path(__file__).parent.parent.parent.parent
    server_dir = repo_root / "server"

    # Start server process
    env = os.environ.copy()
    env['DATABASE_PATH'] = db_path
    env['SECRET_KEY'] = 'test-secret-key-for-integration-tests'
    env['PORT'] = str(TEST_PORT)
    env['FLASK_DEBUG'] = 'false'

    process = subprocess.Popen(
        [sys.executable, '-m', 'server.app'],
        cwd=str(repo_root),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # Wait for server to start
    if not wait_for_server(TEST_URL):
        process.kill()
        stdout, stderr = process.communicate()
        pytest.fail(f"Server failed to start.\nstdout: {stdout.decode()}\nstderr: {stderr.decode()}")

    yield TEST_URL

    # Cleanup
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()

    # Remove temp database
    try:
        os.unlink(db_path)
        os.rmdir(temp_dir)
    except OSError:
        pass


@pytest.fixture
def client(server) -> APIClient:
    """Fresh API client for each test (no stored auth)."""
    return APIClient(server)


@pytest.fixture
def unique_email():
    """Generate unique email for test isolation."""
    counter = [0]

    def _generate(prefix="user"):
        counter[0] += 1
        return f"{prefix}_{counter[0]}_{time.time_ns()}@test.com"

    return _generate


@pytest.fixture
def alice(client, unique_email) -> "User":
    """Pre-registered user Alice."""
    from .api_client import User
    email = unique_email("alice")
    return client.register(email, "password123", "Alice")


@pytest.fixture
def bob(client, unique_email) -> "User":
    """Pre-registered user Bob (separate client)."""
    from .api_client import User
    bob_client = APIClient(client.base_url)
    email = unique_email("bob")
    return bob_client.register(email, "password123", "Bob")


@pytest.fixture
def carol(client, unique_email) -> "User":
    """Pre-registered user Carol (separate client)."""
    from .api_client import User
    carol_client = APIClient(client.base_url)
    email = unique_email("carol")
    return carol_client.register(email, "password123", "Carol")


@pytest.fixture
def alice_client(server, alice) -> APIClient:
    """API client logged in as Alice."""
    c = APIClient(server)
    c.set_token(alice.token)
    return c


@pytest.fixture
def bob_client(server, bob) -> APIClient:
    """API client logged in as Bob."""
    c = APIClient(server)
    c.set_token(bob.token)
    return c


@pytest.fixture
def carol_client(server, carol) -> APIClient:
    """API client logged in as Carol."""
    c = APIClient(server)
    c.set_token(carol.token)
    return c


@pytest.fixture
def alice_and_bob_contacts(alice_client, bob_client, alice, bob):
    """Alice and Bob as accepted contacts."""
    # Alice sends request to Bob
    alice_client.send_contact_request(bob.email)

    # Bob accepts
    requests = bob_client.get_pending_requests()
    request_id = requests['incoming'][0]['requestId']
    bob_client.accept_request(request_id)

    return alice, bob


@pytest.fixture
def three_users_contacts(alice_client, bob_client, carol_client, alice, bob, carol):
    """Alice, Bob, and Carol all connected as contacts."""
    # Alice → Bob
    alice_client.send_contact_request(bob.email)
    requests = bob_client.get_pending_requests()
    bob_client.accept_request(requests['incoming'][0]['requestId'])

    # Alice → Carol
    alice_client.send_contact_request(carol.email)
    requests = carol_client.get_pending_requests()
    carol_client.accept_request(requests['incoming'][0]['requestId'])

    # Bob → Carol
    bob_client.send_contact_request(carol.email)
    requests = carol_client.get_pending_requests()
    carol_client.accept_request(requests['incoming'][0]['requestId'])

    return alice, bob, carol
