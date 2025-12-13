# Server Integration Test Plan

**Version:** 1.0
**Date:** December 13, 2025
**Related:** docs/PRD.md, docs/DESIGN.md, Issue #40

---

## 1. Testing Approach Evaluation

### CLI-based Testing vs HTTP-based Testing

| Aspect | CLI (./whereish) | HTTP (requests/pytest) |
|--------|------------------|------------------------|
| **Directness** | Tests CLI + API together | Tests API directly |
| **Speed** | Slower (subprocess calls) | Faster (in-process) |
| **Readability** | Very readable | Readable with helpers |
| **Edge cases** | Hard to test | Easy to test |
| **Error testing** | Limited (exit codes) | Full (status codes, bodies) |
| **Fixtures** | Manual setup | pytest fixtures |
| **Debugging** | Harder | Easier (pdb, logging) |
| **CI integration** | Good | Excellent |

### Recommendation: HTTP-based Testing

**Decision:** Use HTTP-based testing with the `requests` library.

**Rationale:**
1. **Direct API testing** - Tests the actual contract that all clients use
2. **Precise error testing** - Can verify exact status codes and error messages
3. **Speed** - No subprocess overhead, faster CI runs
4. **Flexibility** - Easy to test edge cases, malformed requests, auth failures
5. **Industry standard** - pytest + requests is the standard for API testing

**Mitigation for readability:** Create a thin helper module (`api_client.py`) that provides CLI-like method names while using HTTP under the hood:

```python
# Instead of raw requests:
response = requests.post(f"{BASE_URL}/api/auth/register", json={...})

# Use readable helpers:
user1 = client.register("alice@test.com", "password123", "Alice")
client.login("alice@test.com", "password123")
contacts = client.get_contacts()
```

---

## 2. Test Categories

### 2.1 Authentication Flow Tests
**File:** `test_auth.py`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Register new user | PRD §5.1 Account & Identity |
| Register duplicate email fails | PRD §5.1 |
| Login with valid credentials | PRD §5.1 |
| Login with invalid credentials fails | Design §6.1 |
| Access protected endpoint without token fails | Design §6.1 |
| Access protected endpoint with valid token | Design §6.1 |
| Token expiry behavior | Design §4.3 |
| GET /api/me returns user info | Implementation |

### 2.2 Contact Lifecycle Tests
**File:** `test_contacts.py`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Send contact request | PRD §5.1 Contacts |
| Receive pending request | PRD §5.1 |
| Accept contact request | PRD §5.1 Mutual Consent |
| Decline contact request | PRD §5.1 |
| Cancel outgoing request | Implementation |
| Cannot request self | Implementation |
| Cannot duplicate request | Implementation |
| Remove existing contact | PRD §5.1 |
| List contacts shows accepted only | Implementation |
| Request non-existent user fails | Implementation |

### 2.3 Permission Management Tests
**File:** `test_permissions.py`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Default permission is planet | PRD §4.4, Design §5.3 |
| Update permission level | PRD §5.1 Sharing Permissions |
| Permission levels filter hierarchy correctly | Design §5.6 |
| Planet shows nothing | PRD §4.2 |
| City shows continent→city | PRD §4.2 |
| Street shows continent→street | PRD §4.2 |
| Address shows everything | PRD §4.2 |
| Cannot update permission for non-contact | Implementation |
| Invalid permission level rejected | Implementation |
| Permissions are asymmetric | PRD §4.4 |

### 2.4 Location Publishing Tests
**File:** `test_location.py`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Publish location succeeds | Design §6.2 |
| Get own location | Design §6.2 |
| Location updates overwrite previous | Implementation |
| Missing payload fails | Implementation |
| Location includes timestamp | Design §5.6 |

### 2.5 Named Location Visibility Tests
**File:** `test_named_locations.py`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Private named location not shown | PRD §4.3, Design §5.5 |
| Named location visible to all | PRD §4.3 |
| Named location visible to selected contacts | PRD §4.3 |
| Named location visibility is independent of geographic permission | PRD §4.3 Key Principle |
| Street permission does NOT reveal private named location | PRD §4.3 Critical Example |
| Planet permission CAN see named location if explicitly granted | PRD §4.3 |
| Legacy string format treated as private | Implementation |

### 2.6 Contact Location Retrieval Tests
**File:** `test_contact_locations.py`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Get single contact location | Design §6.2 |
| Get all contact locations | Design §6.2 |
| Location filtered by permission | Design §5.6 |
| Cannot get location of non-contact | Implementation |
| Stale location marked as stale | Implementation |
| No location returns null | Implementation |

---

## 3. Test Scenarios (End-to-End)

### Scenario A: Two Users Become Contacts
**PRD Reference:** Story 4: New Contact Request

```
1. Alice registers
2. Bob registers
3. Alice sends contact request to Bob
4. Bob sees incoming request
5. Alice sees outgoing request
6. Bob accepts request
7. Alice and Bob appear in each other's contact lists
8. Default permission is "planet" for both directions
```

### Scenario B: Location Sharing with Permission Levels
**PRD Reference:** Story 2: Soccer Practice

```
1. Alice and Bob are contacts
2. Alice sets Bob's permission to "city"
3. Alice publishes location with full hierarchy (Seattle, WA, USA)
4. Bob retrieves Alice's location
5. Bob sees city + state + country, NOT street/address
6. Alice updates permission to "street"
7. Bob now sees street-level detail
```

### Scenario C: Named Location Visibility (Orthogonal Permissions)
**PRD Reference:** §4.3 Key Principle, Cancer Treatment Facility Example

```
1. Alice, Bob, and Carol are all contacts
2. Alice publishes location at "123 Medical Plaza" with named location "Treatment Center"
3. Named location visibility: Bob only (selected)
4. Alice grants Bob "street" permission, Carol "street" permission
5. Bob retrieves Alice's location → sees "123 Medical Plaza" AND "Treatment Center"
6. Carol retrieves Alice's location → sees "123 Medical Plaza" but NOT "Treatment Center"
7. Alice changes named location visibility to "private"
8. Bob retrieves again → sees "123 Medical Plaza" but NOT "Treatment Center"
```

### Scenario D: Named Location with Planet Permission
**PRD Reference:** §4.3 - planet permission can still see named location if granted

```
1. Alice and Bob are contacts
2. Alice sets Bob's permission to "planet" (minimum)
3. Alice publishes location with named location "Soccer Field", visibility: "all"
4. Bob retrieves Alice's location
5. Bob sees "Soccer Field" but NO geographic hierarchy
6. This proves named location visibility is independent of geographic permission
```

### Scenario E: Contact Removal Cleans Up
```
1. Alice and Bob are contacts with custom permissions
2. Alice removes Bob as contact
3. Bob no longer appears in Alice's contacts
4. Alice no longer appears in Bob's contacts
5. Permissions are removed
6. Cannot retrieve location of removed contact
```

---

## 4. Test Infrastructure

### 4.1 Directory Structure

```
tests/
└── server/
    └── integration/
        ├── TEST_PLAN.md          # This document
        ├── conftest.py           # Pytest fixtures
        ├── api_client.py         # HTTP client helpers
        ├── test_auth.py          # Authentication tests
        ├── test_contacts.py      # Contact lifecycle tests
        ├── test_permissions.py   # Permission tests
        ├── test_location.py      # Location publishing tests
        ├── test_named_locations.py # Named location visibility
        └── test_contact_locations.py # Contact location retrieval
```

### 4.2 Fixtures (conftest.py)

```python
@pytest.fixture(scope="session")
def server():
    """Start test server with temporary database."""
    # Start Flask app in subprocess
    # Return base URL
    # Cleanup on teardown

@pytest.fixture
def client(server):
    """Fresh API client for each test."""
    return APIClient(server)

@pytest.fixture
def alice(client):
    """Pre-registered user Alice."""
    return client.register("alice@test.com", "password123", "Alice")

@pytest.fixture
def bob(client):
    """Pre-registered user Bob."""
    return client.register("bob@test.com", "password123", "Bob")

@pytest.fixture
def alice_and_bob_contacts(alice, bob, client):
    """Alice and Bob as accepted contacts."""
    # Setup contact relationship
    return (alice, bob)
```

### 4.3 API Client Helpers (api_client.py)

```python
class APIClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.token = None

    def register(self, email, password, name) -> User
    def login(self, email, password) -> Token
    def logout(self)
    def whoami(self) -> User

    def send_contact_request(self, email)
    def get_pending_requests() -> dict
    def accept_request(self, request_id)
    def decline_request(self, request_id)
    def cancel_request(self, request_id)
    def get_contacts() -> list
    def remove_contact(self, contact_id)

    def set_permission(self, contact_id, level)
    def get_permission(self, contact_id) -> dict

    def publish_location(self, hierarchy, named_location=None)
    def get_my_location() -> dict
    def get_contact_location(self, contact_id) -> dict
    def get_all_contact_locations() -> list
```

---

## 5. Running Tests

### Local Development

```bash
# Install test dependencies
pip install pytest requests

# Run all integration tests
pytest tests/server/integration -v

# Run specific test file
pytest tests/server/integration/test_auth.py -v

# Run specific test
pytest tests/server/integration/test_auth.py::test_register_new_user -v

# Run with coverage
pytest tests/server/integration --cov=server --cov-report=html
```

### CI/CD (GitHub Actions)

```yaml
test-integration:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - run: pip install -r server/requirements.txt
    - run: pip install pytest requests
    - run: pytest tests/server/integration -v
```

---

## 6. Coverage Requirements

| Area | Minimum Coverage |
|------|------------------|
| Authentication | 100% of endpoints |
| Contacts | 100% of endpoints |
| Permissions | 100% of levels |
| Location | 100% of endpoints |
| Named Locations | All visibility modes |
| Error cases | All 4xx responses |

---

## 7. Test Data

### Standard Test Users
- Alice: alice@test.com / password123 / "Alice"
- Bob: bob@test.com / password123 / "Bob"
- Carol: carol@test.com / password123 / "Carol"

### Standard Location Hierarchies

```python
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
```

### Standard Named Locations

```python
SOCCER_FIELD = {
    "label": "Soccer Field",
    "visibleTo": "all"
}

PRIVATE_PLACE = {
    "label": "Treatment Center",
    "visibleTo": "private"
}

def selected_visibility(label, contact_ids):
    return {"label": label, "visibleTo": contact_ids}
```

---

*End of Test Plan*
