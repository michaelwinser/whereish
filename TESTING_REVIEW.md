# Testing Architecture Review

This document evaluates the current client testing approach and proposes improvements leveraging the new Model-View architecture (Issue #45).

## Executive Summary

The new Model-View separation creates opportunities for:
1. **Fast unit tests** for Model pure functions (~1ms vs ~100ms)
2. **Simpler E2E tests** that focus on integration rather than business logic
3. **In-client testing module** for rapid UI validation during development

## Current Test Structure Analysis

### Client Tests Overview

| File | Type | Tests | Avg Time | Dependencies |
|------|------|-------|----------|--------------|
| `test_api.spec.js` | Unit | 16 | ~100ms | Playwright, route mocks |
| `test_storage.spec.js` | Unit | 30 | ~100ms | Playwright, IndexedDB |
| `test_geofence.spec.js` | Unit | 20 | ~100ms | Playwright (for module loading) |
| `test_views.spec.js` | Unit | 15 | ~100ms | Playwright, DOM |
| `test_auth.spec.js` | E2E | 20 | ~500ms | Playwright, route mocks |
| `test_contacts.spec.js` | E2E | 25 | ~500ms | Playwright, route mocks |

**Current Status**: 89 passing, 16 failing (pre-existing route conflicts)

### Key Observation: Unnecessary Browser Dependencies

Several "unit" tests only need the browser to load JavaScript modules:

```javascript
// Current approach - requires full browser context
test('calculates distance using Haversine formula', async ({ page }) => {
    await setupMinimalMocks(page);
    await page.goto('/');
    await page.waitForFunction(() => typeof Geofence !== 'undefined');

    const distance = await page.evaluate(() => {
        return Geofence.calculateDistance(47.6062, -122.3321, 40.7128, -74.0060);
    });

    expect(distance).toBeGreaterThan(3800000);
});
```

This is ~100ms per test just to test a pure mathematical function.

---

## Model Layer Testability Analysis

The new `model.js` contains these testable components:

### 1. Pure Functions (No Dependencies)

| Function | Description | Current Test Coverage |
|----------|-------------|----------------------|
| `buildHierarchy()` | Nominatim response → hierarchy object | None |
| `findMostSpecificLevel()` | Find most specific location in hierarchy | None |
| `formatTimeAgo()` | Date string → "5m ago" format | None |
| `escapeHtml()` | XSS prevention (pure, no DOM) | None |
| `getVisibilityIndicator()` | Visibility mode → icon/tooltip | None |
| `getFilteredHierarchy()` | Filter hierarchy by permission level | None |
| `getPermissionLabel()` | Level key → human label | None |

**Recommendation**: These can be tested without any browser, ~1ms per test.

### 2. State Management (No DOM Dependencies)

| Function | Description | Current Test Coverage |
|----------|-------------|----------------------|
| `setLocation()` / `getLocation()` | Coordinates + hierarchy | None |
| `setPlaces()` / `getPlaces()` | Named locations array | None |
| `setCurrentMatch()` / `getCurrentMatch()` | Current place match | None |
| `setContacts()` / `getContacts()` | Contacts array | None |
| `setSelectedContact()` / `getSelectedContact()` | Selected contact | None |
| `setContactRequests()` / `getContactRequests()` | Pending requests | None |
| `setCurrentUserId()` / `getCurrentUserId()` | Auth state | None |
| `setServerConnected()` / `isServerConnected()` | Connection status | None |
| `setPermissionLevels()` / `getPermissionLevels()` | Permission config | None |

**Recommendation**: Test state + event emission without browser.

### 3. Constants

| Constant | Description | Used By |
|----------|-------------|---------|
| `HIERARCHY_LEVELS` | Geographic level definitions | buildHierarchy, filtering |
| `COUNTRY_TO_CONTINENT` | Country → continent mapping | buildHierarchy |
| `CONFIG` | Intervals, URLs, geolocation opts | Multiple modules |
| `EVENTS` | Event type constants | All Model operations |

---

## Proposed Testing Architecture

### Three-Tier Testing Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│  Tier 1: Model Unit Tests (NEW)                                 │
│  - Pure functions (buildHierarchy, formatTimeAgo, etc.)         │
│  - State management (set/get + event emission)                  │
│  - Run in browser context but no DOM/API dependencies           │
│  - ~1-5ms per test                                              │
│  - Expected: 50+ tests                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Tier 2: Module Integration Tests (EXISTING - Streamlined)      │
│  - API module with mocked network                               │
│  - Storage module with IndexedDB                                │
│  - Geofence calculations (already pure)                         │
│  - ViewManager state machine                                    │
│  - ~50-100ms per test                                           │
│  - Expected: 80 tests (reduced from ~106)                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Tier 3: E2E Integration Tests (EXISTING - Focused)             │
│  - Full user workflows (login → add contact → view location)    │
│  - Model-View integration verification                          │
│  - Critical path smoke tests                                    │
│  - ~500ms per test                                              │
│  - Expected: 20 critical tests (reduced from ~106)              │
└─────────────────────────────────────────────────────────────────┘
```

### Coverage Redistribution

| Test Type | Current | Proposed | Speed Improvement |
|-----------|---------|----------|-------------------|
| Model Unit | 0 | 50+ | N/A (new) |
| Module Integration | ~80 | ~60 | Same |
| E2E | ~26 | ~20 | Same |
| **Total** | ~106 | ~130+ | Better coverage |
| **Total Time** | ~20s | ~5s | 4x faster |

---

## In-Client Testing Module Evaluation

### Concept

An in-client testing module would:
1. Load as a script in development mode
2. Simulate user actions directly via DOM manipulation
3. Run tests without Playwright overhead
4. Provide instant feedback during development

### Proposed Implementation

```javascript
// app/testing.js (only loaded in dev mode)
const Testing = (function() {
    'use strict';

    const results = [];

    function test(name, fn) {
        try {
            fn();
            results.push({ name, passed: true });
            console.log(`✓ ${name}`);
        } catch (error) {
            results.push({ name, passed: false, error: error.message });
            console.error(`✗ ${name}: ${error.message}`);
        }
    }

    function expect(actual) {
        return {
            toBe: (expected) => {
                if (actual !== expected) {
                    throw new Error(`Expected ${expected}, got ${actual}`);
                }
            },
            toEqual: (expected) => {
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            },
            toBeTruthy: () => {
                if (!actual) throw new Error(`Expected truthy, got ${actual}`);
            },
            toContain: (item) => {
                if (!actual.includes(item)) {
                    throw new Error(`Expected to contain ${item}`);
                }
            }
        };
    }

    // Simulate user actions
    function click(selector) {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        el.click();
    }

    function type(selector, text) {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function visible(selector) {
        const el = document.querySelector(selector);
        if (!el) return false;
        return !el.classList.contains('hidden') && el.offsetParent !== null;
    }

    function waitFor(selector, timeout = 1000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (document.querySelector(selector)) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject(new Error(`Timeout waiting for ${selector}`));
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    }

    async function runAll() {
        results.length = 0;
        console.group('In-Client Tests');

        // Run all registered test suites
        for (const suite of suites) {
            await suite();
        }

        console.groupEnd();
        const passed = results.filter(r => r.passed).length;
        console.log(`\n${passed}/${results.length} tests passed`);
        return results;
    }

    const suites = [];
    function describe(name, fn) {
        suites.push(async () => {
            console.group(name);
            await fn();
            console.groupEnd();
        });
    }

    return {
        test, expect, click, type, visible, waitFor, runAll, describe
    };
})();
```

### Example In-Client Tests

```javascript
// Model unit tests (run directly in browser)
Testing.describe('Model Pure Functions', () => {
    Testing.test('buildHierarchy creates continent from country', () => {
        const hierarchy = Model.buildHierarchy({ country: 'United States', city: 'Seattle' });
        Testing.expect(hierarchy.continent).toBe('North America');
        Testing.expect(hierarchy.city).toBe('Seattle');
    });

    Testing.test('formatTimeAgo returns "Just now" for recent times', () => {
        const now = new Date().toISOString();
        Testing.expect(Model.formatTimeAgo(now)).toBe('Just now');
    });

    Testing.test('escapeHtml prevents XSS', () => {
        const escaped = Model.escapeHtml('<script>alert("xss")</script>');
        Testing.expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
});

// UI interaction tests
Testing.describe('Contact List UI', async () => {
    Testing.test('clicking contact opens detail view', async () => {
        // Requires contacts to be loaded first
        const firstContact = document.querySelector('.contact-item');
        if (firstContact) {
            Testing.click('.contact-item');
            await Testing.waitFor('[data-view="contact-detail"]:not(.hidden)');
            Testing.expect(Testing.visible('[data-view="contact-detail"]')).toBeTruthy();
        }
    });
});
```

### In-Client Testing: Pros and Cons

| Pros | Cons |
|------|------|
| Instant feedback (~1ms per test) | Can't test page load scenarios |
| No external dependencies | Requires development mode |
| Direct DOM manipulation | Limited isolation (tests share state) |
| Easy to debug (same console) | No automatic screenshot on failure |
| Can test Model layer directly | Manual trigger required |
| Works with hot reload | Not suitable for CI/CD |

### Recommendation: Hybrid Approach

Use in-client testing for:
- Model pure function validation
- Quick UI smoke tests during development
- Event emission verification
- State management validation

Keep Playwright for:
- Full user workflow E2E tests
- Page load and navigation scenarios
- CI/CD automated testing
- Screenshot comparison (future)

---

## Test-by-Test Evaluation

### Tests to KEEP in Playwright (Integration/E2E)

These tests validate Model-View integration and require browser context:

| Test File | Tests to Keep | Reason |
|-----------|---------------|--------|
| `test_auth.spec.js` | All 20 | Full auth workflow E2E |
| `test_contacts.spec.js` | All 25 | Contact UI integration |
| `test_api.spec.js` | 10 of 16 | Network mocking tests |
| `test_storage.spec.js` | All 30 | IndexedDB operations |
| `test_views.spec.js` | All 15 | ViewManager state machine |

### Tests to MIGRATE to Model Unit Tests

These test pure logic that can run faster:

| Current Location | Function | New Location |
|------------------|----------|--------------|
| (none) | `Model.buildHierarchy()` | `test_model.spec.js` |
| (none) | `Model.findMostSpecificLevel()` | `test_model.spec.js` |
| (none) | `Model.formatTimeAgo()` | `test_model.spec.js` |
| (none) | `Model.escapeHtml()` | `test_model.spec.js` |
| (none) | `Model.getFilteredHierarchy()` | `test_model.spec.js` |
| (none) | `Model.getVisibilityIndicator()` | `test_model.spec.js` |
| `test_geofence.spec.js` | Distance calculations | Keep (Geofence module) |
| `test_api.spec.js` | Header building | Consider Model test |

### Tests to ADD for Model Coverage

| Test Suite | Tests to Add |
|------------|--------------|
| `buildHierarchy` | 8 tests (various inputs, continent mapping, edge cases) |
| `findMostSpecificLevel` | 5 tests (all levels, empty hierarchy, missing levels) |
| `formatTimeAgo` | 6 tests (just now, minutes, hours, days, weeks, invalid) |
| `escapeHtml` | 4 tests (special chars, null, XSS vectors) |
| `getFilteredHierarchy` | 8 tests (all permission levels) |
| `getVisibilityIndicator` | 4 tests (private, all, selected modes) |
| `state management` | 15 tests (set/get/events for all state) |
| **Total New** | ~50 tests |

---

## Failing Tests Analysis

The 16 currently failing tests all share a common pattern:

### Root Cause: Playwright Route Registration Order

```javascript
// In beforeEach - registers default routes
await page.route('**/api/contacts/locations', route => {
    route.fulfill({ body: JSON.stringify({ contacts: [] }) });
});

// In test - attempts to override (FAILS - first match wins)
await page.route('**/api/contacts/locations', route => {
    route.fulfill({ body: JSON.stringify({ contacts: MOCK_CONTACTS }) });
});
```

### Affected Tests

All 16 failing tests are in:
- `test_api.spec.js` - 6 tests
- `test_auth.spec.js` - 2 tests
- `test_contacts.spec.js` - 8 tests

### Fix Strategy

1. **Option A**: Use `page.unroute()` before re-registering
2. **Option B**: Use single route with conditional responses
3. **Option C**: Refactor to use request interception patterns

```javascript
// Option A: Explicit unroute
await page.unroute('**/api/contacts/locations');
await page.route('**/api/contacts/locations', route => { ... });

// Option B: Conditional responses
let contactsResponse = { contacts: [] };
await page.route('**/api/contacts/locations', route => {
    route.fulfill({ body: JSON.stringify(contactsResponse) });
});
// Later in test:
contactsResponse = { contacts: MOCK_CONTACTS };
await page.reload();

// Option C: Request interception
page.on('request', request => {
    if (request.url().includes('/api/contacts/locations')) {
        // Handle based on test state
    }
});
```

---

## Recommended Implementation Plan

### Phase 1: Model Unit Tests (Priority: High)

Create `tests/client/unit/test_model.spec.js`:

```javascript
test.describe('Model Module', () => {
    test.describe('buildHierarchy', () => {
        test('creates hierarchy from Nominatim response', ...);
        test('maps country to continent', ...);
        test('handles missing fields gracefully', ...);
    });

    test.describe('State Management', () => {
        test('setLocation emits LOCATION_CHANGED event', ...);
        test('getLocation returns current state', ...);
    });
});
```

**Effort**: 1-2 hours
**Impact**: 50+ new tests, ~5ms total runtime

### Phase 2: Fix Failing Tests (Priority: High)

Apply route management fix to all 16 failing tests.

**Effort**: 1 hour
**Impact**: 105/105 tests passing

### Phase 3: In-Client Testing Module (Priority: Medium)

Create `app/testing.js` for development mode.

**Effort**: 2 hours
**Impact**: Rapid development feedback loop

### Phase 4: Test Consolidation (Priority: Low)

- Remove redundant tests
- Improve test isolation
- Add Model event testing

**Effort**: 2-3 hours
**Impact**: Faster, more maintainable test suite

---

## Summary Recommendations

| Recommendation | Priority | Effort | Impact |
|----------------|----------|--------|--------|
| Create Model unit tests | High | 2h | +50 tests, 4x faster |
| Fix failing tests (route order) | High | 1h | 16 tests fixed |
| In-client testing module | Medium | 2h | Dev feedback loop |
| E2E test consolidation | Low | 3h | Maintenance |

### Key Architecture Benefits

1. **Model tests are DOM-independent**: Can run without Playwright browser context
2. **Events enable integration testing**: Verify Model→View communication
3. **Pure functions enable deterministic tests**: No mocking required
4. **Separation reduces E2E scope**: E2E tests focus on integration only

### Proposed Test Distribution

| Layer | Current Tests | Proposed Tests | Runtime |
|-------|---------------|----------------|---------|
| Model Unit | 0 | 50+ | ~50ms |
| Module Integration | 106 | 60 | ~6s |
| E2E | (in above) | 20 | ~10s |
| **Total** | 106 | 130+ | ~16s |

The new architecture enables better test coverage with faster execution.
