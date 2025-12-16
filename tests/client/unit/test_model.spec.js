// @ts-check
const { test, expect, setupMinimalMocks, SEATTLE_HIERARCHY } = require('../fixtures/test-helpers');

/**
 * Model Module Tests
 *
 * Tests for the Model layer pure functions and state management.
 * These tests validate business logic without DOM dependencies.
 */

test.describe('Model Module', () => {

    test.beforeEach(async ({ page }) => {
        await setupMinimalMocks(page);
        await page.goto('/');
        await page.waitForFunction(() => typeof Model !== 'undefined');
    });

    // ===================
    // Pure Functions
    // ===================

    test.describe('buildHierarchy', () => {

        test('creates hierarchy from Nominatim address components', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({
                    city: 'Seattle',
                    state: 'Washington',
                    country: 'United States'
                });
            });

            expect(hierarchy.city).toBe('Seattle');
            expect(hierarchy.state).toBe('Washington');
            expect(hierarchy.country).toBe('United States');
        });

        test('maps country to continent', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({ country: 'United States' });
            });

            expect(hierarchy.continent).toBe('North America');
        });

        test('maps European countries correctly', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({ country: 'United Kingdom' });
            });

            expect(hierarchy.continent).toBe('Europe');
        });

        test('maps Asian countries correctly', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({ country: 'Japan' });
            });

            expect(hierarchy.continent).toBe('Asia');
        });

        test('sets planet for unknown countries (continent not mapped)', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({ country: 'Atlantis' });
            });

            // Unknown country has no continent mapping, but planet is always set
            expect(hierarchy.continent).toBeUndefined();
            expect(hierarchy.planet).toBe('Planet Earth');
        });

        test('builds address from house_number and road', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({
                    house_number: '123',
                    road: 'Broadway E',
                    city: 'Seattle'
                });
            });

            expect(hierarchy.address).toBe('123 Broadway E');
        });

        test('handles missing house_number (no address)', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({
                    road: 'Broadway E',
                    city: 'Seattle'
                });
            });

            expect(hierarchy.address).toBeUndefined();
            expect(hierarchy.street).toBe('Broadway E');
        });

        test('maps neighbourhood to neighborhood', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({
                    neighbourhood: 'Capitol Hill',
                    city: 'Seattle'
                });
            });

            expect(hierarchy.neighborhood).toBe('Capitol Hill');
        });

        test('maps suburb to neighborhood', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({
                    suburb: 'Fremont',
                    city: 'Seattle'
                });
            });

            expect(hierarchy.neighborhood).toBe('Fremont');
        });

        test('maps town to city', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({
                    town: 'Kirkland',
                    state: 'Washington'
                });
            });

            expect(hierarchy.city).toBe('Kirkland');
        });

        test('handles empty input (planet always set)', async ({ page }) => {
            const hierarchy = await page.evaluate(() => {
                return Model.buildHierarchy({});
            });

            // Empty input still gets planet as minimum level
            expect(hierarchy.planet).toBe('Planet Earth');
        });
    });

    test.describe('findMostSpecificLevel', () => {

        test('returns address when available', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.findMostSpecificLevel({
                    address: '123 Broadway E',
                    street: 'Broadway E',
                    city: 'Seattle'
                });
            });

            expect(result).toBe('123 Broadway E');
        });

        test('returns street when address missing', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.findMostSpecificLevel({
                    street: 'Broadway E',
                    city: 'Seattle'
                });
            });

            expect(result).toBe('Broadway E');
        });

        test('returns city when only city available', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.findMostSpecificLevel({
                    city: 'Seattle',
                    state: 'Washington'
                });
            });

            expect(result).toBe('Seattle');
        });

        test('returns continent as fallback', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.findMostSpecificLevel({
                    continent: 'North America'
                });
            });

            expect(result).toBe('North America');
        });

        test('returns null for empty hierarchy', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.findMostSpecificLevel({});
            });

            expect(result).toBeNull();
        });

        test('returns Planet Earth when only planet is set', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.findMostSpecificLevel({ planet: 'Planet Earth' });
            });

            expect(result).toBe('Planet Earth');
        });
    });

    test.describe('formatTimeAgo', () => {

        test('returns "Just now" for recent times', async ({ page }) => {
            const result = await page.evaluate(() => {
                const now = new Date().toISOString();
                return Model.formatTimeAgo(now);
            });

            expect(result).toBe('Just now');
        });

        test('returns minutes ago', async ({ page }) => {
            const result = await page.evaluate(() => {
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
                return Model.formatTimeAgo(fiveMinutesAgo);
            });

            expect(result).toBe('5m ago');
        });

        test('returns hours ago', async ({ page }) => {
            const result = await page.evaluate(() => {
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
                return Model.formatTimeAgo(twoHoursAgo);
            });

            expect(result).toBe('2h ago');
        });

        test('returns days ago', async ({ page }) => {
            const result = await page.evaluate(() => {
                const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
                return Model.formatTimeAgo(threeDaysAgo);
            });

            expect(result).toBe('3d ago');
        });

        test('returns date string for old dates', async ({ page }) => {
            const result = await page.evaluate(() => {
                const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
                return Model.formatTimeAgo(twoWeeksAgo);
            });

            // Should return a locale date string
            expect(result).not.toBe('');
            expect(result).not.toContain('ago');
        });

        test('returns empty string for null input', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.formatTimeAgo(null);
            });

            expect(result).toBe('');
        });

        test('returns empty string for invalid date', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.formatTimeAgo('not-a-date');
            });

            expect(result).toBe('');
        });
    });

    test.describe('escapeHtml', () => {

        test('escapes < and >', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml('<script>alert("xss")</script>');
            });

            expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });

        test('escapes ampersand', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml('Tom & Jerry');
            });

            expect(result).toBe('Tom &amp; Jerry');
        });

        test('escapes quotes', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml('He said "hello"');
            });

            expect(result).toBe('He said &quot;hello&quot;');
        });

        test('escapes single quotes', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml("It's fine");
            });

            expect(result).toBe('It&#039;s fine');
        });

        test('returns empty string for null', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml(null);
            });

            expect(result).toBe('');
        });

        test('returns empty string for undefined', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml(undefined);
            });

            expect(result).toBe('');
        });

        test('handles plain text without escaping', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.escapeHtml('Hello World');
            });

            expect(result).toBe('Hello World');
        });
    });

    test.describe('getVisibilityIndicator', () => {

        test('returns lock for private mode', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getVisibilityIndicator({ mode: 'private', contactIds: [] });
            });

            expect(result.icon).toBe('🔒');
            expect(result.tooltip).toContain('Private');
        });

        test('returns lock for null visibility', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getVisibilityIndicator(null);
            });

            expect(result.icon).toBe('🔒');
        });

        test('returns group icon for all mode', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getVisibilityIndicator({ mode: 'all', contactIds: [] });
            });

            expect(result.icon).toBe('👥');
            expect(result.tooltip).toContain('all contacts');
        });

        test('returns count for selected mode', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getVisibilityIndicator({ mode: 'selected', contactIds: ['a', 'b', 'c'] });
            });

            expect(result.icon).toBe('👤×3');
            expect(result.tooltip).toContain('3 contacts');
        });

        test('handles singular contact count', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getVisibilityIndicator({ mode: 'selected', contactIds: ['a'] });
            });

            expect(result.icon).toBe('👤×1');
            expect(result.tooltip).toContain('1 contact');
            expect(result.tooltip).not.toContain('contacts');
        });
    });

    test.describe('getFilteredHierarchy', () => {

        test('returns full hierarchy for address level', async ({ page }) => {
            const result = await page.evaluate(() => {
                const hierarchy = {
                    address: '123 Broadway',
                    street: 'Broadway',
                    city: 'Seattle',
                    state: 'Washington',
                    country: 'United States',
                    continent: 'North America'
                };
                return Model.getFilteredHierarchy(hierarchy, 'address');
            });

            expect(result.address).toBe('123 Broadway');
            expect(result.city).toBe('Seattle');
        });

        test('filters out address for street level', async ({ page }) => {
            const result = await page.evaluate(() => {
                const hierarchy = {
                    address: '123 Broadway',
                    street: 'Broadway',
                    city: 'Seattle',
                    state: 'Washington'
                };
                return Model.getFilteredHierarchy(hierarchy, 'street');
            });

            expect(result.address).toBeUndefined();
            expect(result.street).toBe('Broadway');
            expect(result.city).toBe('Seattle');
        });

        test('returns only city and above for city level', async ({ page }) => {
            const result = await page.evaluate(() => {
                const hierarchy = {
                    address: '123 Broadway',
                    street: 'Broadway',
                    neighborhood: 'Capitol Hill',
                    city: 'Seattle',
                    state: 'Washington',
                    country: 'United States',
                    continent: 'North America'
                };
                return Model.getFilteredHierarchy(hierarchy, 'city');
            });

            expect(result.address).toBeUndefined();
            expect(result.street).toBeUndefined();
            expect(result.neighborhood).toBeUndefined();
            expect(result.city).toBe('Seattle');
            expect(result.state).toBe('Washington');
        });

        test('returns only continent for continent level', async ({ page }) => {
            const result = await page.evaluate(() => {
                const hierarchy = {
                    city: 'Seattle',
                    state: 'Washington',
                    country: 'United States',
                    continent: 'North America'
                };
                return Model.getFilteredHierarchy(hierarchy, 'continent');
            });

            expect(result.city).toBeUndefined();
            expect(result.country).toBeUndefined();
            expect(result.continent).toBe('North America');
        });

        test('returns only planet for planet level', async ({ page }) => {
            const result = await page.evaluate(() => {
                const hierarchy = {
                    city: 'Seattle',
                    state: 'Washington',
                    country: 'United States',
                    continent: 'North America',
                    planet: 'Planet Earth'
                };
                return Model.getFilteredHierarchy(hierarchy, 'planet');
            });

            expect(result.city).toBeUndefined();
            expect(result.continent).toBeUndefined();
            expect(result.planet).toBe('Planet Earth');
        });

        test('returns planet for null hierarchy', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getFilteredHierarchy(null, 'city');
            });

            expect(result.planet).toBe('Planet Earth');
        });

        test('returns planet for unknown level', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getFilteredHierarchy({ city: 'Seattle' }, 'unknown');
            });

            expect(result.planet).toBe('Planet Earth');
        });
    });

    test.describe('getPermissionLabel', () => {

        test('returns Address for address key', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getPermissionLabel('address');
            });

            expect(result).toBe('Address');
        });

        test('returns City for city key', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getPermissionLabel('city');
            });

            expect(result).toBe('City');
        });

        test('returns key for unknown level', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getPermissionLabel('unknown');
            });

            expect(result).toBe('unknown');
        });
    });

    // ===================
    // State Management
    // ===================

    test.describe('Location State', () => {

        test('getLocation returns initial null state', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getLocation();
            });

            // May be set by app initialization, but structure should exist
            expect(result).toHaveProperty('coordinates');
            expect(result).toHaveProperty('hierarchy');
        });

        test('setLocation updates state', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setLocation(
                    { latitude: 47.6062, longitude: -122.3321 },
                    { city: 'Seattle', state: 'Washington' }
                );
                return Model.getLocation();
            });

            expect(result.coordinates.latitude).toBe(47.6062);
            expect(result.hierarchy.city).toBe('Seattle');
        });

        test('setLocation emits LOCATION_CHANGED event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedData = null;
                Model.on(Model.EVENTS.LOCATION_CHANGED, (data) => {
                    emittedData = data;
                });
                Model.setLocation(
                    { latitude: 47.6062, longitude: -122.3321 },
                    { city: 'Seattle' }
                );
                return emittedData;
            });

            expect(result).not.toBeNull();
            expect(result.coordinates.latitude).toBe(47.6062);
            expect(result.hierarchy.city).toBe('Seattle');
        });

        test('setLocationLoading emits LOCATION_LOADING event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emitted = false;
                Model.on(Model.EVENTS.LOCATION_LOADING, () => {
                    emitted = true;
                });
                Model.setLocationLoading();
                return emitted;
            });

            expect(result).toBe(true);
        });

        test('setLocationError emits LOCATION_ERROR event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let errorMessage = null;
                Model.on(Model.EVENTS.LOCATION_ERROR, (data) => {
                    errorMessage = data.message;
                });
                Model.setLocationError('GPS unavailable');
                return errorMessage;
            });

            expect(result).toBe('GPS unavailable');
        });
    });

    test.describe('Places State', () => {

        test('getPlaces returns array', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Array.isArray(Model.getPlaces());
            });

            expect(result).toBe(true);
        });

        test('setPlaces updates state', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setPlaces([{ id: '1', label: 'Home' }]);
                return Model.getPlaces();
            });

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Home');
        });

        test('setPlaces emits PLACES_CHANGED event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedPlaces = null;
                Model.on(Model.EVENTS.PLACES_CHANGED, (data) => {
                    emittedPlaces = data.places;
                });
                Model.setPlaces([{ id: '1', label: 'Work' }]);
                return emittedPlaces;
            });

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Work');
        });

        test('addPlace appends to array', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setPlaces([{ id: '1', label: 'Home' }]);
                Model.addPlace({ id: '2', label: 'Work' });
                return Model.getPlaces();
            });

            expect(result).toHaveLength(2);
            expect(result[1].label).toBe('Work');
        });

        test('updatePlace modifies existing place', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setPlaces([{ id: '1', label: 'Home' }]);
                Model.updatePlace('1', { id: '1', label: 'My House' });
                return Model.getPlaces();
            });

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('My House');
        });

        test('removePlace filters out place', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setPlaces([
                    { id: '1', label: 'Home' },
                    { id: '2', label: 'Work' }
                ]);
                Model.removePlace('1');
                return Model.getPlaces();
            });

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('Work');
        });

        test('getCurrentMatch returns null initially', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setCurrentMatch(null);
                return Model.getCurrentMatch();
            });

            expect(result).toBeNull();
        });

        test('setCurrentMatch updates and emits event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedMatch = 'not-set';
                Model.on(Model.EVENTS.PLACE_MATCH_CHANGED, (data) => {
                    emittedMatch = data.match;
                });
                Model.setCurrentMatch({ id: '1', label: 'Home' });
                return {
                    current: Model.getCurrentMatch(),
                    emitted: emittedMatch
                };
            });

            expect(result.current.label).toBe('Home');
            expect(result.emitted.label).toBe('Home');
        });
    });

    test.describe('Contacts State', () => {

        test('getContacts returns array', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Array.isArray(Model.getContacts());
            });

            expect(result).toBe(true);
        });

        test('setContacts updates and emits event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedContacts = null;
                Model.on(Model.EVENTS.CONTACTS_CHANGED, (data) => {
                    emittedContacts = data.contacts;
                });
                Model.setContacts([{ id: '1', name: 'Alice' }]);
                return {
                    current: Model.getContacts(),
                    emitted: emittedContacts
                };
            });

            expect(result.current).toHaveLength(1);
            expect(result.emitted).toHaveLength(1);
        });

        test('getSelectedContact returns null initially', async ({ page }) => {
            const result = await page.evaluate(() => {
                Model.setSelectedContact(null);
                return Model.getSelectedContact();
            });

            expect(result).toBeNull();
        });

        test('setSelectedContact updates and emits event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedContact = 'not-set';
                Model.on(Model.EVENTS.CONTACT_SELECTED, (data) => {
                    emittedContact = data.contact;
                });
                Model.setSelectedContact({ id: '1', name: 'Bob' });
                return {
                    current: Model.getSelectedContact(),
                    emitted: emittedContact
                };
            });

            expect(result.current.name).toBe('Bob');
            expect(result.emitted.name).toBe('Bob');
        });

        test('getContactRequests returns object with arrays', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.getContactRequests();
            });

            expect(result).toHaveProperty('incoming');
            expect(result).toHaveProperty('outgoing');
        });

        test('setContactRequests updates and emits event', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedRequests = null;
                Model.on(Model.EVENTS.CONTACT_REQUESTS_CHANGED, (data) => {
                    emittedRequests = data.requests;
                });
                Model.setContactRequests({
                    incoming: [{ id: '1' }],
                    outgoing: [{ id: '2' }]
                });
                return {
                    current: Model.getContactRequests(),
                    emitted: emittedRequests
                };
            });

            expect(result.current.incoming).toHaveLength(1);
            expect(result.current.outgoing).toHaveLength(1);
            expect(result.emitted.incoming).toHaveLength(1);
        });
    });

    test.describe('Auth State', () => {

        test('getCurrentUserId returns value', async ({ page }) => {
            const result = await page.evaluate(() => {
                return typeof Model.getCurrentUserId();
            });

            // Could be null or string depending on app state
            expect(['string', 'object']).toContain(result);
        });

        test('setCurrentUserId updates and emits AUTH_CHANGED', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedAuth = null;
                Model.on(Model.EVENTS.AUTH_CHANGED, (data) => {
                    emittedAuth = data;
                });
                Model.setCurrentUserId('user-123');
                return {
                    current: Model.getCurrentUserId(),
                    emitted: emittedAuth
                };
            });

            expect(result.current).toBe('user-123');
            expect(result.emitted.userId).toBe('user-123');
            expect(result.emitted.authenticated).toBe(true);
        });

        test('setCurrentUserId(null) sets authenticated to false', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedAuth = null;
                Model.on(Model.EVENTS.AUTH_CHANGED, (data) => {
                    emittedAuth = data;
                });
                Model.setCurrentUserId(null);
                return emittedAuth;
            });

            expect(result.authenticated).toBe(false);
        });

        test('isServerConnected returns boolean', async ({ page }) => {
            const result = await page.evaluate(() => {
                return typeof Model.isServerConnected();
            });

            expect(result).toBe('boolean');
        });

        test('setServerConnected emits SERVER_STATUS_CHANGED', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedStatus = null;
                Model.on(Model.EVENTS.SERVER_STATUS_CHANGED, (data) => {
                    emittedStatus = data;
                });
                Model.setServerConnected(true);
                return emittedStatus;
            });

            expect(result.connected).toBe(true);
        });

        test('getPermissionLevels returns array', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Array.isArray(Model.getPermissionLevels());
            });

            expect(result).toBe(true);
        });

        test('setPermissionLevels emits PERMISSION_LEVELS_LOADED', async ({ page }) => {
            const result = await page.evaluate(() => {
                let emittedLevels = null;
                Model.on(Model.EVENTS.PERMISSION_LEVELS_LOADED, (data) => {
                    emittedLevels = data.levels;
                });
                Model.setPermissionLevels(['city', 'state', 'country']);
                return emittedLevels;
            });

            expect(result).toHaveLength(3);
            expect(result).toContain('city');
        });
    });

    // ===================
    // Constants
    // ===================

    test.describe('Constants', () => {

        test('HIERARCHY_LEVELS contains expected levels', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Model.HIERARCHY_LEVELS.map(l => l.key);
            });

            expect(result).toContain('address');
            expect(result).toContain('street');
            expect(result).toContain('city');
            expect(result).toContain('state');
            expect(result).toContain('country');
            expect(result).toContain('continent');
        });

        test('CONFIG has expected properties', async ({ page }) => {
            const result = await page.evaluate(() => {
                return {
                    hasGeocodeUrl: typeof Model.CONFIG.geocodeUrl === 'string',
                    hasGeolocation: typeof Model.CONFIG.geolocation === 'object',
                    hasContactsRefreshInterval: typeof Model.CONFIG.contactsRefreshInterval === 'number'
                };
            });

            expect(result.hasGeocodeUrl).toBe(true);
            expect(result.hasGeolocation).toBe(true);
            expect(result.hasContactsRefreshInterval).toBe(true);
        });

        test('EVENTS has all event types', async ({ page }) => {
            const result = await page.evaluate(() => {
                return Object.keys(Model.EVENTS);
            });

            expect(result).toContain('LOCATION_CHANGED');
            expect(result).toContain('PLACES_CHANGED');
            expect(result).toContain('CONTACTS_CHANGED');
            expect(result).toContain('AUTH_CHANGED');
        });
    });

    // ===================
    // Event System
    // ===================

    test.describe('Event System', () => {

        test('on() returns unsubscribe function', async ({ page }) => {
            const result = await page.evaluate(() => {
                const unsub = Model.on(Model.EVENTS.LOCATION_CHANGED, () => {});
                return typeof unsub === 'function';
            });

            expect(result).toBe(true);
        });

        test('unsubscribe prevents further callbacks', async ({ page }) => {
            const result = await page.evaluate(() => {
                let callCount = 0;
                const unsub = Model.on(Model.EVENTS.LOCATION_CHANGED, () => {
                    callCount++;
                });

                Model.setLocation({ latitude: 1, longitude: 1 }, {});
                unsub();
                Model.setLocation({ latitude: 2, longitude: 2 }, {});

                return callCount;
            });

            expect(result).toBe(1);
        });

        test('off() removes specific callback', async ({ page }) => {
            const result = await page.evaluate(() => {
                let callCount = 0;
                const callback = () => { callCount++; };

                Model.on(Model.EVENTS.LOCATION_CHANGED, callback);
                Model.setLocation({ latitude: 1, longitude: 1 }, {});
                Model.off(Model.EVENTS.LOCATION_CHANGED, callback);
                Model.setLocation({ latitude: 2, longitude: 2 }, {});

                return callCount;
            });

            expect(result).toBe(1);
        });
    });
});
