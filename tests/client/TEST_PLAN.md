# Browser Client Test Plan

**Version:** 1.0
**Date:** December 13, 2025
**Related:** PRD.md, DESIGN.md, Issue #39

---

## 1. Testing Approach Evaluation

### Testing Framework Options

| Framework | Type | Pros | Cons |
|-----------|------|------|------|
| **Jest + jsdom** | Unit | Fast, good mocking, industry standard | No real browser, limited IndexedDB |
| **Vitest** | Unit | Fast, ESM-native, similar to Jest | Same limitations as Jest |
| **Playwright** | E2E | Real browser, visual testing, network mocking | Slower, requires running server |
| **Puppeteer** | E2E | Real Chrome, good for PWA testing | Chrome-only, slower |
| **Web Test Runner** | Unit | Real browser, modern | Less mature ecosystem |

### Challenge: Vanilla JS without Build Step

The Whereish client uses vanilla JavaScript with no build step (by design for supply chain security). This creates testing challenges:

1. **No module imports** - Code uses IIFEs that attach to global scope
2. **IndexedDB** - Requires real browser or complex mocking
3. **Geolocation API** - Requires mocking
4. **Service Worker** - Requires special testing approach

### Recommended Approach: Two-Tier Testing

#### Tier 1: Unit Tests with Playwright (Component Testing)

Use Playwright's component testing capability to run tests in a real browser:
- Real IndexedDB support
- Real DOM APIs
- Can load actual JS files via script tags
- Fast enough for unit-style tests

#### Tier 2: E2E Tests with Playwright

Full end-to-end tests with real server:
- Complete user journeys
- Visual regression testing
- PWA installation testing
- Cross-browser verification

### Decision: Playwright for Both Tiers

**Rationale:**
1. **Real browser environment** - IndexedDB, Geolocation, Service Worker all work
2. **No build step needed** - Loads vanilla JS directly
3. **Single tool** - Same API for unit and E2E tests
4. **Network mocking** - Can test API module without real server
5. **Cross-browser** - Chromium, Firefox, WebKit

---

## 2. Test Categories

### 2.1 Geofence Module Tests
**File:** `test_geofence.spec.js`

Pure calculation tests - no browser APIs needed.

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Calculate distance between two points (Haversine) | Design §4.2 |
| Distance calculation accuracy (known distances) | Design §4.2 |
| Point inside geofence returns true | PRD §5.1 Named Locations |
| Point outside geofence returns false | PRD §5.1 |
| Point on boundary (edge case) | Implementation |
| Find all matching locations | PRD §5.1 |
| Find best match (smallest geofence) | Design §4.2 |
| Empty locations array returns null | Implementation |
| Format distance (meters) | Implementation |
| Format distance (kilometers) | Implementation |
| Radius options list | Implementation |

### 2.2 Storage Module Tests
**File:** `test_storage.spec.js`

Requires real browser for IndexedDB.

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Initialize database creates stores | Design §5.5 |
| Save named location with all fields | PRD §5.1 Named Locations |
| Save named location generates ID | Implementation |
| Get all locations for user | Design §5.5 |
| Get all locations returns empty for no user | Implementation |
| Get specific location by ID | Implementation |
| Get non-existent location returns null | Implementation |
| Delete named location | PRD §5.1 |
| Update existing location | Implementation |
| Locations scoped by userId | Design §5.5 |
| Visibility field defaults to private | PRD §4.3 |
| Visibility migration for old records | Implementation |
| Save and get settings | Implementation |
| Settings default value | Implementation |

### 2.3 API Module Tests
**File:** `test_api.spec.js`

Uses Playwright network mocking - no real server needed.

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Register stores token | PRD §5.1 Account |
| Login stores token | PRD §5.1 |
| Token persists in localStorage | Implementation |
| Logout clears token | Implementation |
| isAuthenticated returns correct state | Implementation |
| Requests include auth header when logged in | Design §6.1 |
| Requests without token for public endpoints | Implementation |
| API errors throw with message | Implementation |
| 401 response triggers logout | Implementation |
| Publish location sends correct payload | Design §6.2 |
| Get contacts returns array | Design §6.3 |
| Update permission sends correct level | Design §6.4 |
| Version mismatch shows update banner | Implementation |

### 2.4 ViewManager Tests
**File:** `test_views.spec.js`

Tests navigation state machine.

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Navigate shows target view | PRD §5.1 Core UI |
| Navigate hides current view | Implementation |
| Navigate calls onExit callback | Implementation |
| Navigate calls onEnter callback | Implementation |
| Tab navigation clears history | Implementation |
| Non-tab navigation adds to history | Implementation |
| goBack returns to previous view | Implementation |
| goBack to main when no history | Implementation |
| Tab bar shows on tab views | PRD §5.1 |
| Tab bar hidden on sub-views | Implementation |
| Active tab state updates | Implementation |
| Browser back button works | Implementation |

### 2.5 App Integration Tests
**File:** `test_app.spec.js`

Full app behavior tests.

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Initial load shows login when not authenticated | PRD §5.1 |
| Initial load shows main when authenticated | PRD §5.1 |
| Login form validation | PRD §5.1 |
| Registration flow | PRD §5.1 Account |
| Contact list renders correctly | PRD §5.1 Core UI |
| Contact shows location with permission info | PRD §5.1 |
| Permission dropdown updates | PRD §5.1 Sharing Permissions |
| Add contact modal flow | PRD §5.1 Contacts |
| Pending requests display | PRD §5.1 |
| Accept request adds to contacts | PRD §4.5 Mutual Consent |
| Decline request removes from pending | Implementation |
| Settings page shows user email | Implementation |
| Logout clears state and shows login | Implementation |

### 2.6 Named Location UI Tests
**File:** `test_named_locations.spec.js`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Places tab shows saved locations | PRD §5.1 Named Locations |
| Create named location with current position | PRD §5.1 |
| Edit named location | PRD §5.1 |
| Delete named location with confirmation | PRD §5.1 |
| Visibility selector shows options | PRD §4.3 |
| Private visibility is default | PRD §4.3 |
| Selected contacts visibility shows contact picker | PRD §4.3 |
| Edit modal pre-fills values | Implementation |
| Radius selector options | Implementation |

### 2.7 Location Publishing Tests
**File:** `test_location_publishing.spec.js`

| Test Case | PRD/Design Reference |
|-----------|---------------------|
| Publish includes hierarchy | Design §5.6 |
| Publish includes named location when matched | PRD §5.1 |
| Named location visibility included in payload | PRD §4.3 Key Principle |
| Geofence matching selects best match | Design §4.2 |
| Location update interval respects config | PRD §7.1 |

---

## 3. Test Scenarios (End-to-End)

### Scenario A: New User Onboarding
**PRD Reference:** Story 4: New Contact Request

```
1. User opens app - sees login screen
2. Clicks "Create account"
3. Fills registration form (email, password, name)
4. Submits - account created
5. Redirected to main view
6. Sees empty contact list
7. Prompted to add first contact
```

### Scenario B: Adding a Contact
**PRD Reference:** §4.5 Mutual Consent

```
1. User clicks "Add Contact"
2. Modal opens with email input
3. Enters friend's email
4. Submits - request sent
5. Sees confirmation message
6. Request appears in "Sent" section
7. Friend accepts (via API)
8. Contact appears in list
```

### Scenario C: Viewing Contact Location
**PRD Reference:** §5.1 Core UI

```
1. User has contact with location published
2. Opens app - sees contact list
3. Contact shows name and semantic location
4. Location filtered by permission level
5. Stale indicator shown if location old
6. Taps contact - sees detail view (if implemented)
```

### Scenario D: Creating Named Location
**PRD Reference:** Story 2: Soccer Practice

```
1. User taps "Places" tab
2. Taps "Add Place" button
3. Map/location picker opens
4. Selects current location or enters manually
5. Enters label "Soccer Field"
6. Selects radius (100m)
7. Sets visibility to specific contacts
8. Saves - location appears in list
9. When at location, contacts see "Soccer Field"
```

### Scenario E: Changing Permission Level
**PRD Reference:** §5.1 Sharing Permissions

```
1. User views contact list
2. Taps permission dropdown for a contact
3. Options shown: planet, city, street, etc.
4. Selects "city"
5. Permission updates immediately
6. Contact now sees city-level location
```

### Scenario F: Named Location with Private Visibility
**PRD Reference:** §4.3 Key Principle (Orthogonal Permissions)

```
1. User creates named location "Therapist Office"
2. Sets visibility to "Private"
3. Contact has "street" permission
4. User arrives at therapist office
5. Location published
6. Contact sees "123 Medical Plaza" (street)
7. Contact does NOT see "Therapist Office"
```

---

## 4. Test Infrastructure

### 4.1 Directory Structure

```
tests/
└── client/
    ├── TEST_PLAN.md              # This document
    ├── playwright.config.js       # Playwright configuration
    ├── fixtures/
    │   ├── test-app.js           # Test harness for loading app
    │   └── mocks.js              # Common mocks (geolocation, etc.)
    ├── unit/
    │   ├── test_geofence.spec.js
    │   ├── test_storage.spec.js
    │   ├── test_api.spec.js
    │   └── test_views.spec.js
    └── e2e/
        ├── test_auth.spec.js
        ├── test_contacts.spec.js
        ├── test_named_locations.spec.js
        └── test_full_journey.spec.js
```

### 4.2 Test Harness

Since the app uses IIFEs, tests need to load the app in a browser context:

```javascript
// fixtures/test-app.js
async function loadApp(page) {
    await page.goto('http://localhost:8080');

    // Wait for modules to be available
    await page.waitForFunction(() =>
        window.API && window.Storage && window.Geofence && window.ViewManager
    );

    return {
        API: await page.evaluateHandle(() => window.API),
        Storage: await page.evaluateHandle(() => window.Storage),
        Geofence: await page.evaluateHandle(() => window.Geofence),
        ViewManager: await page.evaluateHandle(() => window.ViewManager)
    };
}
```

### 4.3 Mocking Strategies

#### Geolocation Mock
```javascript
await page.context().grantPermissions(['geolocation']);
await page.context().setGeolocation({ latitude: 47.6062, longitude: -122.3321 });
```

#### Network Mock (API)
```javascript
await page.route('**/api/contacts', route => {
    route.fulfill({
        status: 200,
        body: JSON.stringify({ contacts: [...] })
    });
});
```

#### IndexedDB Setup
```javascript
// Clear before each test
await page.evaluate(() => indexedDB.deleteDatabase('whereish'));
```

### 4.4 Server Handling

#### Unit Tests
- Mock all API calls with `page.route()`
- No server needed

#### E2E Tests
Option A: Real server with test database
```javascript
// playwright.config.js
webServer: {
    command: 'DATABASE_PATH=test.db python -m server.app',
    port: 8500,
    reuseExistingServer: !process.env.CI
}
```

Option B: Mock server for deterministic tests
```javascript
// Use MSW (Mock Service Worker) or Playwright routes
```

---

## 5. Running Tests

### Setup

```bash
# Install Playwright
npm init -y
npm install -D @playwright/test
npx playwright install
```

### Commands

```bash
# Run all client tests
npx playwright test tests/client

# Run unit tests only
npx playwright test tests/client/unit

# Run E2E tests only
npx playwright test tests/client/e2e

# Run with UI mode (interactive)
npx playwright test --ui

# Run specific test file
npx playwright test tests/client/unit/test_geofence.spec.js

# Debug mode
npx playwright test --debug
```

### CI/CD

```yaml
# .github/workflows/test.yml
test-client:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
    - run: npm ci
    - run: npx playwright install --with-deps
    - run: npx playwright test tests/client
```

---

## 6. Coverage Requirements

| Module | Minimum Coverage |
|--------|------------------|
| Geofence | 100% (pure functions) |
| Storage | 90% (all CRUD operations) |
| API | 80% (main flows) |
| ViewManager | 80% (navigation logic) |
| E2E Journeys | All critical paths |

---

## 7. Test Data

### Standard Test Locations

```javascript
const TEST_LOCATIONS = {
    SEATTLE: { latitude: 47.6062, longitude: -122.3321 },
    NYC: { latitude: 40.7128, longitude: -74.0060 },
    LONDON: { latitude: 51.5074, longitude: -0.1278 }
};

const NAMED_LOCATIONS = {
    HOME: {
        label: 'Home',
        latitude: 47.6062,
        longitude: -122.3321,
        radiusMeters: 100,
        visibility: { mode: 'private', contactIds: [] }
    },
    SOCCER_FIELD: {
        label: 'Soccer Field',
        latitude: 47.6200,
        longitude: -122.3500,
        radiusMeters: 200,
        visibility: { mode: 'all', contactIds: [] }
    }
};
```

### Mock API Responses

```javascript
const MOCK_RESPONSES = {
    CONTACTS: {
        contacts: [
            { id: 'user1', name: 'Alice', permissionGranted: 'city', permissionReceived: 'street' },
            { id: 'user2', name: 'Bob', permissionGranted: 'planet', permissionReceived: 'city' }
        ]
    },
    CONTACT_WITH_LOCATION: {
        contacts: [
            {
                id: 'user1',
                name: 'Alice',
                permissionGranted: 'city',
                permissionReceived: 'street',
                location: {
                    data: {
                        hierarchy: { city: 'Seattle', state: 'Washington', country: 'United States' },
                        namedLocation: 'Coffee Shop'
                    },
                    updated_at: '2025-12-13T10:00:00Z',
                    stale: false
                }
            }
        ]
    }
};
```

---

## 8. PWA-Specific Tests

### Service Worker Tests
**File:** `test_service_worker.spec.js`

| Test Case | Notes |
|-----------|-------|
| Service worker registers | Check navigator.serviceWorker.ready |
| Assets cached on install | Check cache storage |
| Fetch from cache when offline | Simulate offline mode |
| Cache update on version change | Bump CACHE_NAME |
| Old caches deleted | Migration behavior |

### Install Prompt Tests
**File:** `test_pwa_install.spec.js`

| Test Case | Notes |
|-----------|-------|
| Install banner shown on eligible | Mock beforeinstallprompt |
| Install banner triggers prompt | Click handler |
| iOS instructions shown on iOS | User agent detection |
| Banner dismisses correctly | UI state |

---

## 9. Accessibility Tests

Using Playwright's accessibility testing:

```javascript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('should not have accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
});
```

| Test Case | WCAG Criteria |
|-----------|---------------|
| Color contrast sufficient | 1.4.3 |
| Form labels present | 1.3.1 |
| Keyboard navigation works | 2.1.1 |
| Focus visible | 2.4.7 |
| Screen reader labels | 4.1.2 |

---

## 10. Visual Regression Tests

Using Playwright's screenshot comparison:

```javascript
test('contact list renders correctly', async ({ page }) => {
    await page.goto('/');
    // Setup: login, load contacts
    await expect(page.locator('#contact-list')).toHaveScreenshot('contact-list.png');
});
```

Snapshots stored in:
```
tests/client/e2e/screenshots/
├── contact-list.png
├── login-form.png
├── add-contact-modal.png
└── settings-page.png
```

---

## 11. Browser Matrix

| Browser | Priority | Notes |
|---------|----------|-------|
| Chromium (Desktop) | P0 | Primary development |
| Mobile Chrome | P0 | PWA target |
| Firefox | P1 | Cross-browser |
| Safari/WebKit | P1 | iOS users |
| Mobile Safari | P2 | iOS PWA limitations |

---

*End of Browser Client Test Plan*
