# Testing Strategy

This document describes the testing approach for the Whereish application, including both server-side and client-side testing.

## Overview

Whereish uses a two-tier testing strategy:

| Component | Framework | Tests | Coverage |
|-----------|-----------|-------|----------|
| Server (Python/Flask) | pytest | 99 tests | Integration + Unit |
| Client (Vanilla JS PWA) | Playwright | 106 tests | Unit + E2E |

## Server Tests

### Framework & Tools
- **pytest** - Test runner
- **pytest-cov** - Coverage reporting
- **SQLite in-memory** - Test database isolation

### Test Location
```
tests/
├── conftest.py           # Shared fixtures
├── test_api.py           # REST API integration tests
├── test_auth.py          # Authentication tests
├── test_contacts.py      # Contact management tests
├── test_location.py      # Location publishing tests
└── test_permissions.py   # Permission level tests
```

### Running Server Tests
```bash
# All tests
make test

# With coverage
pytest --cov=server --cov-report=html

# Specific test file
pytest tests/test_auth.py -v
```

### Key Patterns
- Each test gets a fresh database via the `client` fixture
- Authentication handled via `auth_headers(client, email)` helper
- Tests are independent and can run in any order

---

## Client Tests

### Framework & Tools
- **Playwright** - Browser automation and testing
- **Chromium** - Test browser (Firefox/WebKit available)
- **Python HTTP server** - Static file serving for PWA
- **Flask dev server** - API backend for integration tests

### Test Location
```
tests/client/
├── fixtures/
│   └── test-helpers.js   # Shared utilities, mocks, test data
├── unit/
│   ├── test_storage.spec.js    # IndexedDB operations
│   ├── test_geofence.spec.js   # Distance calculations
│   ├── test_views.spec.js      # ViewManager navigation
│   └── test_api.spec.js        # API client module
└── e2e/
    ├── test_auth.spec.js       # Login/register/logout flows
    └── test_contacts.spec.js   # Contact management UI
```

### Running Client Tests
```bash
# All tests
npx playwright test

# With UI mode
npx playwright test --ui

# Specific test file
npx playwright test tests/client/unit/test_storage.spec.js

# Debug mode
npx playwright test --debug
```

### Configuration
The Playwright configuration (`playwright.config.js`) sets up:
- **Port 8081**: Static file server for PWA (`python3 -m http.server`)
- **Port 8501**: Flask API server for integration tests
- **Chromium only** by default (cross-browser available)

---

## Lessons Learned

### 1. JavaScript Module Scope vs Window Properties

**Problem**: Tests waited for `typeof window.API !== 'undefined'` but modules using `const API = ...` don't create window properties.

**Solution**: Use `typeof API !== 'undefined'` (global scope, not window property).

```javascript
// Wrong - const declarations don't become window properties
await page.waitForFunction(() => typeof window.API !== 'undefined');

// Correct - check global scope directly
await page.waitForFunction(() => typeof API !== 'undefined');
```

**Why**: In browser JavaScript, `const`/`let` at the top level create global bindings but NOT properties on `window`. Only `var` and explicit `window.X = ...` assignments create window properties.

### 2. Playwright Route Registration Order

**Problem**: Routes registered in `beforeEach` cannot be overridden by routes registered in individual tests.

**Behavior**: Playwright matches routes in registration order (first match wins), not reverse order as initially assumed.

**Impact**: Tests that need specific mock data for endpoints already mocked in `beforeEach` fail because the `beforeEach` mock is always used.

**Workaround Options**:
1. Use `page.unroute()` before registering new routes
2. Structure fixtures to avoid conflicts
3. Don't mock endpoints in `beforeEach` that tests need to customize

### 3. API Mocking Before Navigation

**Problem**: Tests that set up API mocks after `page.goto()` miss requests made during page load.

**Solution**: Always set up route mocks BEFORE navigation:

```javascript
// Correct order
await page.route('**/api/health', route => { ... });
await page.goto('/');

// Wrong - misses requests during page load
await page.goto('/');
await page.route('**/api/health', route => { ... });
```

### 4. Service Worker Interference

**Problem**: Service workers can cache responses and interfere with API mocking.

**Consideration**: For reliable testing, consider:
- Using `reuseExistingServer: false` in CI
- Clearing service worker registration between tests
- Using unique cache versions for test builds

### 5. Authentication State Persistence

**Problem**: Setting `localStorage` token after page load doesn't automatically update app state.

**Solution**: Set token, then reload the page:

```javascript
await page.goto('/');
await page.evaluate(() => {
    localStorage.setItem('whereish_auth_token', 'test-token');
});
await page.reload();  // App now recognizes the token
```

---

## Test Data & Fixtures

### Shared Test Data (`test-helpers.js`)

```javascript
const TEST_LOCATIONS = {
    SEATTLE: { latitude: 47.6062, longitude: -122.3321 },
    NYC: { latitude: 40.7128, longitude: -74.0060 },
};

const MOCK_CONTACTS = [
    { id: 'user1', name: 'Alice', permissionGranted: 'city' },
    { id: 'user2', name: 'Bob', permissionGranted: 'planet' },
];

const MOCK_USER = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User'
};
```

### Helper Functions

| Function | Purpose |
|----------|---------|
| `setupMinimalMocks(page)` | Mock essential startup endpoints |
| `setAuthToken(page, token)` | Set authentication token in localStorage |
| `clearAuth(page)` | Remove authentication token |
| `waitForAppReady(page)` | Wait for all JS modules to load |

---

## Future Considerations

### 1. Route Management Improvements

Implement a cleaner route management system:

```javascript
// Proposed: Configurable mock factory
const mocks = createMocks({
    contacts: MOCK_CONTACTS,
    requests: { incoming: [...], outgoing: [] },
    authenticated: true
});
await mocks.apply(page);
await page.goto('/');
```

### 2. Page Object Pattern

Consider implementing page objects for complex E2E flows:

```javascript
class MainPage {
    constructor(page) { this.page = page; }

    async loadWithContacts(contacts) {
        await this.setupMocks(contacts);
        await this.navigate();
    }

    async clickContact(name) {
        await this.page.click(`text=${name}`);
    }
}
```

### 3. Visual Regression Testing

Add screenshot comparison for UI consistency:

```javascript
test('contact list renders correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('contact-list.png');
});
```

### 4. Accessibility Testing

Integrate accessibility audits:

```javascript
const { AxeBuilder } = require('@axe-core/playwright');

test('main view is accessible', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
});
```

### 5. Performance Testing

Add performance budgets:

```javascript
test('page loads within budget', async ({ page }) => {
    const metrics = await page.evaluate(() => performance.getEntriesByType('navigation')[0]);
    expect(metrics.loadEventEnd - metrics.startTime).toBeLessThan(3000);
});
```

### 6. Test Parallelization

Current setup runs tests in parallel by default. For CI:
- Consider `workers: 1` for stability
- Use separate test databases per worker
- Ensure port availability

### 7. Coverage Reporting

Add client-side coverage with Istanbul/NYC:

```bash
npx nyc --reporter=html npx playwright test
```

### 8. Model-View Separation (Issue #45)

The most impactful improvement would be separating Model (business logic) from View (DOM). Currently `app.js` (1856 lines) mixes both concerns, requiring all tests to run in Playwright.

**Current Architecture:**
```
┌─────────────────────────────────────────┐
│  app.js (mixed Model + View)            │
│  - State management                     │
│  - Business logic (hierarchy, filters)  │
│  - DOM manipulation                     │
│  - Event handlers                       │
└─────────────────────────────────────────┘
        ↓ All tests require browser
```

**Proposed Architecture:**
```
┌─────────────────┐      events      ┌─────────────────┐
│    model.js     │ ───────────────▶ │    app.js       │
│  (Pure Logic)   │                  │  (View Only)    │
│  - State        │ ◀─────────────── │  - DOM          │
│  - Business     │   user actions   │  - Handlers     │
│  - API calls    │                  │  - Rendering    │
└─────────────────┘                  └─────────────────┘
        ↓                                    ↓
   Node.js tests                      Playwright tests
   (~1ms/test)                        (~100ms/test)
```

**Testing Benefits:**

| Test Type | Target | Framework | Speed |
|-----------|--------|-----------|-------|
| Model Unit | Business logic | Node.js + mocks | ~1ms |
| Model Integration | API + Model | Node.js + server | ~10ms |
| View Unit | DOM rendering | Playwright + mocked Model | ~100ms |
| E2E | Full flows | Playwright + server | ~500ms |

This refactoring would allow ~80% of client logic to be tested without browser automation, dramatically improving test speed and reliability.

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  server-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pytest --cov=server

  client-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: test-results/
```

---

## Quick Reference

### Run All Tests
```bash
# Quick validation (smoke + lint)
make test

# Server tests only (pytest)
make test-server

# Client tests only (Playwright)
make test-client

# Full test suite (server + client)
make test-all
```

### Debug Failing Tests
```bash
# Server - verbose output
pytest tests/server -v -s

# Client - headed mode with DevTools
npx playwright test --headed --debug

# Client - generate trace
npx playwright test --trace on
```

### View Test Reports
```bash
# Server coverage
open htmlcov/index.html

# Playwright report
npx playwright show-report
```

---

## Related Issues
- Issue #39: Unit Tests (browser client)
- Issue #40: Integration Tests
- Issue #43: Fix remaining browser client test failures
- Issue #45: Model-View architecture refactoring
