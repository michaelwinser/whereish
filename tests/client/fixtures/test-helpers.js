// @ts-check
const playwright = require('@playwright/test');
const base = playwright.test;
const expect = playwright.expect;

/**
 * Test data constants
 */
const TEST_LOCATIONS = {
    SEATTLE: { latitude: 47.6062, longitude: -122.3321 },
    NYC: { latitude: 40.7128, longitude: -74.0060 },
    LONDON: { latitude: 51.5074, longitude: -0.1278 },
    // Point 100m from Seattle
    NEAR_SEATTLE: { latitude: 47.6071, longitude: -122.3321 },
    // Point 10km from Seattle
    FAR_FROM_SEATTLE: { latitude: 47.7, longitude: -122.3321 },
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
    },
    WORK: {
        label: 'Work',
        latitude: 47.6062,
        longitude: -122.3400,
        radiusMeters: 50,
        visibility: { mode: 'selected', contactIds: ['user1', 'user2'] }
    }
};

const MOCK_USER = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User'
};

const MOCK_CONTACTS = [
    { id: 'user1', name: 'Alice', permissionGranted: 'city', permissionReceived: 'street' },
    { id: 'user2', name: 'Bob', permissionGranted: 'planet', permissionReceived: 'city' },
    { id: 'user3', name: 'Carol', permissionGranted: 'address', permissionReceived: 'planet' }
];

const MOCK_CONTACT_WITH_LOCATION = {
    id: 'user1',
    name: 'Alice',
    permissionGranted: 'city',
    permissionReceived: 'street',
    location: {
        data: {
            hierarchy: {
                continent: 'North America',
                country: 'United States',
                state: 'Washington',
                city: 'Seattle',
                street: 'Broadway E'
            },
            namedLocation: 'Coffee Shop'
        },
        updated_at: '2025-12-13T10:00:00Z',
        stale: false
    }
};

const SEATTLE_HIERARCHY = {
    continent: 'North America',
    country: 'United States',
    state: 'Washington',
    city: 'Seattle',
    neighborhood: 'Capitol Hill',
    street: 'Broadway E',
    address: '123 Broadway E'
};

/**
 * Extended test fixture with app helpers
 * NOTE: Our modules use const declarations, so they're in global scope but NOT on window.
 * Use `typeof API` instead of `typeof window.API` to check for module availability.
 */
const test = base.extend({
    /**
     * Load the app and wait for modules to be available
     */
    appPage: async ({ page }, use) => {
        await page.goto('/');

        // Wait for all modules to be loaded (no window. prefix - const declarations)
        await page.waitForFunction(() =>
            typeof API !== 'undefined' &&
            typeof Storage !== 'undefined' &&
            typeof Geofence !== 'undefined' &&
            typeof ViewManager !== 'undefined'
        );

        await use(page);
    },

    /**
     * Page with mocked geolocation
     */
    geoPage: async ({ context, page }, use) => {
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation(TEST_LOCATIONS.SEATTLE);
        await page.goto('/');
        await page.waitForFunction(() => typeof Geofence !== 'undefined');
        await use(page);
    },

    /**
     * Page with cleared IndexedDB
     */
    freshPage: async ({ page }, use) => {
        await page.goto('/');
        // Clear IndexedDB before test
        await page.evaluate(() => {
            return new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase('whereish');
                req.onsuccess = () => resolve(undefined);
                req.onerror = () => reject(req.error);
            });
        });
        // Reload to reinitialize
        await page.reload();
        await page.waitForFunction(() => typeof Storage !== 'undefined');
        await use(page);
    },
});

/**
 * Setup API mocks for a page (call BEFORE page.goto)
 * @param {import('@playwright/test').Page} page
 * @param {Object} mocks - Map of endpoint patterns to responses
 */
async function setupApiMocks(page, mocks = {}) {
    const defaultMocks = {
        '/api/health': { status: 'ok' },
        '/api/me': MOCK_USER,
        '/api/contacts': { contacts: MOCK_CONTACTS },
        '/api/contacts/requests': { incoming: [], outgoing: [] },
        '/api/contacts/locations': { contacts: [MOCK_CONTACT_WITH_LOCATION] },
        '/api/permission-levels': {
            levels: ['planet', 'continent', 'country', 'state', 'county', 'city', 'neighborhood', 'street', 'address'],
            default: 'planet'
        },
    };

    const allMocks = { ...defaultMocks, ...mocks };

    for (const [pattern, response] of Object.entries(allMocks)) {
        await page.route(`**${pattern}`, route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(response)
            });
        });
    }
}

/**
 * Setup minimal mocks needed for app to load (call BEFORE page.goto)
 * Use this for unit tests that only need modules to be defined
 * @param {import('@playwright/test').Page} page
 */
async function setupMinimalMocks(page) {
    // Mock health check so app doesn't show offline state
    await page.route('**/api/health', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'ok' })
        });
    });

    // Mock version check
    await page.route('**/api/version', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ version: '1.0.0' })
        });
    });

    // Mock permission levels - loaded on startup
    await page.route('**/api/permission-levels', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                levels: ['planet', 'continent', 'country', 'state', 'county', 'city', 'neighborhood', 'street', 'address'],
                default: 'planet'
            })
        });
    });

    // Mock contacts - may be loaded on authenticated startup
    await page.route('**/api/contacts', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ contacts: [] })
        });
    });

    // Mock contact requests
    await page.route('**/api/contacts/requests', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ incoming: [], outgoing: [] })
        });
    });

    // Mock contact locations
    await page.route('**/api/contacts/locations', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ contacts: [] })
        });
    });
}

/**
 * Login helper - sets token directly
 * @param {import('@playwright/test').Page} page
 * @param {string} token
 */
async function setAuthToken(page, token = 'test-token-123') {
    await page.evaluate((t) => {
        localStorage.setItem('whereish_auth_token', t);
    }, token);
}

/**
 * Clear auth state
 * @param {import('@playwright/test').Page} page
 */
async function clearAuth(page) {
    await page.evaluate(() => {
        localStorage.removeItem('whereish_auth_token');
    });
}

/**
 * Wait for the app to be fully loaded and authenticated
 * @param {import('@playwright/test').Page} page
 */
async function waitForAppReady(page) {
    await page.waitForFunction(() =>
        typeof API !== 'undefined' &&
        typeof Storage !== 'undefined'
    );
}

// =============================================================================
// Acceptance Test Helpers
// =============================================================================

/**
 * Setup an authenticated page with API mocks ready for acceptance tests.
 * Sets up mocks, navigates to app, sets auth token, and waits for main view.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options - Optional overrides for contacts, requests, etc.
 */
async function setupAuthenticatedPage(page, options = {}) {
    const {
        contacts = MOCK_CONTACTS,
        requests = { incoming: [], outgoing: [] },
        user = MOCK_USER
    } = options;

    // Setup API mocks before navigation
    await page.route('**/api/health', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });

    await page.route('**/api/me', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    });

    await page.route('**/api/contacts/encrypted', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts }) });
    });

    await page.route('**/api/contacts/requests', route => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(requests) });
    });

    await page.route('**/api/permission-levels', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                levels: ['planet', 'continent', 'country', 'state', 'county', 'city', 'neighborhood', 'street', 'address'],
                default: 'planet'
            })
        });
    });

    await page.route('**/api/devices', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                devices: [{ id: 'device-1', name: 'Test Device', platform: 'web', isActive: true, isCurrent: true }]
            })
        });
    });

    // Navigate and set auth
    await page.goto('/');
    await setAuthToken(page, 'test-token-123');
    await page.reload();

    // Wait for main view to be visible (authenticated state)
    await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

    // Wait for contacts to finish loading (no longer shows "Loading contacts...")
    // If contacts are provided, wait for them to render
    if (contacts.length > 0) {
        await page.waitForFunction(() => {
            const contactsList = document.getElementById('contacts-list');
            return contactsList && !contactsList.textContent.includes('Loading contacts');
        }, { timeout: 10000 });
    }
}

/**
 * Mock browser geolocation with specific coordinates
 * @param {import('@playwright/test').BrowserContext} context
 * @param {Object} coords - { latitude, longitude }
 */
async function mockGeolocation(context, coords = TEST_LOCATIONS.SEATTLE) {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(coords);
}

/**
 * Mock Nominatim geocoding response
 * @param {import('@playwright/test').Page} page
 * @param {Object} hierarchy - Location hierarchy object
 */
async function mockGeocode(page, hierarchy = SEATTLE_HIERARCHY) {
    await page.route('**/nominatim.openstreetmap.org/**', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                address: {
                    continent: hierarchy.continent,
                    country: hierarchy.country,
                    state: hierarchy.state,
                    county: hierarchy.county,
                    city: hierarchy.city,
                    suburb: hierarchy.neighborhood,
                    road: hierarchy.street,
                    house_number: hierarchy.address?.split(' ')[0]
                }
            })
        });
    });
}

/**
 * Create a named location via Storage API
 * @param {import('@playwright/test').Page} page
 * @param {string} label - Location name
 * @param {number} radius - Radius in meters
 * @param {Object} coords - { latitude, longitude }
 * @param {Object} visibility - { mode: 'private'|'all'|'selected', contactIds: [] }
 */
async function createPlace(page, label, radius, coords = TEST_LOCATIONS.SEATTLE, visibility = { mode: 'private', contactIds: [] }) {
    await page.evaluate(({ label, radius, coords, visibility }) => {
        return Storage.saveNamedLocation({
            id: crypto.randomUUID(),
            userId: 'test-user-123',
            label,
            latitude: coords.latitude,
            longitude: coords.longitude,
            radiusMeters: radius,
            visibility,
            createdAt: new Date().toISOString()
        });
    }, { label, radius, coords, visibility });
}

/**
 * Clear all named locations for clean test state
 * @param {import('@playwright/test').Page} page
 */
async function clearPlaces(page) {
    await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase('whereish');
            req.onsuccess = () => resolve(undefined);
            req.onerror = () => reject(req.error);
        });
    });
}

module.exports = {
    test,
    expect,
    TEST_LOCATIONS,
    NAMED_LOCATIONS,
    MOCK_USER,
    MOCK_CONTACTS,
    MOCK_CONTACT_WITH_LOCATION,
    SEATTLE_HIERARCHY,
    setupApiMocks,
    setupMinimalMocks,
    setAuthToken,
    clearAuth,
    waitForAppReady,
    // Acceptance test helpers
    setupAuthenticatedPage,
    mockGeolocation,
    mockGeocode,
    createPlace,
    clearPlaces,
};
