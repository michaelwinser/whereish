// @ts-check
const { test, expect, MOCK_USER, MOCK_CONTACTS, SEATTLE_HIERARCHY } = require('../fixtures/test-helpers');

/**
 * API Module Tests
 *
 * Tests for API client using network mocking.
 * No real server needed - all responses mocked.
 * Note: These tests DON'T use setupMinimalMocks so we can precisely control route handlers.
 */

test.describe('API Module', () => {

    // Clear localStorage before each test
    test.beforeEach(async ({ page }) => {
        // Set up only health and permission-levels mocks (required for app to load)
        // Don't mock other endpoints - individual tests will do that
        await page.route('**/api/health', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'ok' })
            });
        });
        await page.route('**/api/version', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ version: '1.0.0' })
            });
        });
        await page.route('**/api/permission-levels', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    levels: ['planet', 'continent', 'country', 'state', 'city', 'street', 'address'],
                    default: 'planet'
                })
            });
        });
        // Mock contacts endpoints with empty responses (can be overridden in tests)
        await page.route('**/api/contacts/requests', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ incoming: [], outgoing: [] })
            });
        });
        await page.route('**/api/contacts/locations', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ contacts: [] })
            });
        });
        // Mock /api/me to prevent 401/404 clearing auth state during page load
        await page.route('**/api/me', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: 'test-user', email: 'test@example.com', name: 'Test User' })
            });
        });

        await page.goto('/');
        await page.evaluate(() => {
            localStorage.clear();
        });
        await page.reload();
        await page.waitForFunction(() => typeof API !== 'undefined');
    });

    test.describe('Authentication', () => {

        test('register stores token', async ({ page }) => {
            // Mock register endpoint
            await page.route('**/api/auth/register', route => {
                route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        user: MOCK_USER,
                        token: 'new-token-123'
                    })
                });
            });

            const result = await page.evaluate(async () => {
                const data = await API.register('test@example.com', 'password123', 'Test User');
                return {
                    user: data.user,
                    isAuthenticated: API.isAuthenticated(),
                    storedToken: localStorage.getItem('whereish_auth_token')
                };
            });

            expect(result.user.email).toBe('test@example.com');
            expect(result.isAuthenticated).toBe(true);
            expect(result.storedToken).toBe('new-token-123');
        });

        test('login stores token', async ({ page }) => {
            await page.route('**/api/auth/login', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        user: MOCK_USER,
                        token: 'login-token-456'
                    })
                });
            });

            const result = await page.evaluate(async () => {
                await API.login('test@example.com', 'password123');
                return {
                    isAuthenticated: API.isAuthenticated(),
                    storedToken: localStorage.getItem('whereish_auth_token')
                };
            });

            expect(result.isAuthenticated).toBe(true);
            expect(result.storedToken).toBe('login-token-456');
        });

        test('token persists in localStorage', async ({ page }) => {
            await page.route('**/api/auth/login', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ user: MOCK_USER, token: 'persistent-token' })
                });
            });

            await page.evaluate(async () => {
                await API.login('test@example.com', 'password123');
            });

            // Reload page
            await page.reload();
            await page.waitForFunction(() => typeof API !== 'undefined');

            const isAuth = await page.evaluate(() => API.isAuthenticated());
            expect(isAuth).toBe(true);
        });

        test('logout clears token', async ({ page }) => {
            // Set a token first
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'some-token');
            });
            await page.reload();
            await page.waitForFunction(() => typeof API !== 'undefined');

            const result = await page.evaluate(() => {
                API.logout();
                return {
                    isAuthenticated: API.isAuthenticated(),
                    storedToken: localStorage.getItem('whereish_auth_token')
                };
            });

            expect(result.isAuthenticated).toBe(false);
            expect(result.storedToken).toBeNull();
        });

        test('isAuthenticated returns correct state', async ({ page }) => {
            const beforeAuth = await page.evaluate(() => API.isAuthenticated());
            expect(beforeAuth).toBe(false);

            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForFunction(() => typeof API !== 'undefined');

            const afterAuth = await page.evaluate(() => API.isAuthenticated());
            expect(afterAuth).toBe(true);
        });

    });

    test.describe('Request Headers', () => {

        test('includes auth header when logged in', async ({ page }) => {
            // Set token
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'bearer-test-token');
            });
            await page.reload();
            await page.waitForFunction(() => typeof API !== 'undefined');

            let capturedHeaders = null;
            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/contacts');
            await page.route('**/api/contacts', route => {
                capturedHeaders = route.request().headers();
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [] })
                });
            });

            await page.evaluate(async () => {
                await API.getContacts();
            });

            expect(capturedHeaders['authorization']).toBe('Bearer bearer-test-token');
        });

        test('requests without token for public endpoints', async ({ page }) => {
            let capturedHeaders = null;
            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/health');
            await page.route('**/api/health', route => {
                capturedHeaders = route.request().headers();
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'ok' })
                });
            });

            await page.evaluate(async () => {
                await API.checkHealth();
            });

            // Authorization header should not be present or should be empty
            expect(capturedHeaders['authorization']).toBeFalsy();
        });

    });

    test.describe('Error Handling', () => {

        test('API errors throw with message', async ({ page }) => {
            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/contacts');
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Bad request' })
                });
            });

            const error = await page.evaluate(async () => {
                try {
                    await API.getContacts();
                    return null;
                } catch (e) {
                    return e.message;
                }
            });

            expect(error).toBe('Bad request');
        });

        test('401 response is handled', async ({ page }) => {
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'old-token');
            });
            await page.reload();
            await page.waitForFunction(() => typeof API !== 'undefined');

            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/me');
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Unauthorized' })
                });
            });

            const result = await page.evaluate(async () => {
                try {
                    await API.getCurrentUser();
                    return { error: null, isAuth: API.isAuthenticated() };
                } catch (e) {
                    return { error: e.message, isAuth: API.isAuthenticated() };
                }
            });

            // Should have thrown and cleared auth
            expect(result.error).toBeTruthy();
            expect(result.isAuth).toBe(false);
        });

    });

    test.describe('Contacts API', () => {

        test('getContacts returns array', async ({ page }) => {
            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/contacts');
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            const contacts = await page.evaluate(async () => {
                return await API.getContacts();
            });

            expect(Array.isArray(contacts)).toBe(true);
            expect(contacts.length).toBe(3);
            expect(contacts[0].name).toBe('Alice');
        });

        test('sendContactRequest sends email', async ({ page }) => {
            let capturedBody = null;
            await page.route('**/api/contacts/request', route => {
                capturedBody = route.request().postDataJSON();
                route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Request sent' })
                });
            });

            await page.evaluate(async () => {
                await API.sendContactRequest('friend@example.com');
            });

            expect(capturedBody.email).toBe('friend@example.com');
        });

        test('acceptContactRequest calls correct endpoint', async ({ page }) => {
            let capturedUrl = null;
            await page.route('**/api/contacts/requests/*/accept', route => {
                capturedUrl = route.request().url();
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true })
                });
            });

            await page.evaluate(async () => {
                await API.acceptContactRequest(123);
            });

            expect(capturedUrl).toContain('/api/contacts/requests/123/accept');
        });

    });

    test.describe('Location API', () => {

        test('publishLocation sends correct payload', async ({ page }) => {
            let capturedBody = null;
            await page.route('**/api/location', route => {
                if (route.request().method() === 'POST') {
                    capturedBody = route.request().postDataJSON();
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true })
                    });
                }
            });

            await page.evaluate(async () => {
                await API.publishLocation({
                    hierarchy: { city: 'Seattle', state: 'Washington' },
                    namedLocation: { label: 'Home', visibleTo: 'private' }
                });
            });

            expect(capturedBody.payload).toBeDefined();
            const payload = JSON.parse(capturedBody.payload);
            expect(payload.hierarchy.city).toBe('Seattle');
            expect(payload.namedLocation.label).toBe('Home');
        });

        test('getContactsWithLocations returns array', async ({ page }) => {
            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/contacts/locations');
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        contacts: [{
                            id: 'user1',
                            name: 'Alice',
                            location: {
                                data: { hierarchy: SEATTLE_HIERARCHY },
                                updated_at: '2025-12-13T10:00:00Z'
                            }
                        }]
                    })
                });
            });

            const contacts = await page.evaluate(async () => {
                return await API.getContactsWithLocations();
            });

            expect(Array.isArray(contacts)).toBe(true);
            expect(contacts[0].location.data.hierarchy.city).toBe('Seattle');
        });

    });

    test.describe('Permissions API', () => {

        test('updateContactPermission sends correct level', async ({ page }) => {
            let capturedBody = null;
            await page.route('**/api/contacts/*/permission', route => {
                if (route.request().method() === 'PUT') {
                    capturedBody = route.request().postDataJSON();
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true })
                    });
                }
            });

            await page.evaluate(async () => {
                await API.updateContactPermission('user123', 'city');
            });

            expect(capturedBody.level).toBe('city');
        });

        test('getPermissionLevels returns levels array', async ({ page }) => {
            // Unroute the beforeEach handler first (Playwright uses first-match-wins)
            await page.unroute('**/api/permission-levels');
            await page.route('**/api/permission-levels', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        levels: ['planet', 'city', 'street', 'address'],
                        default: 'planet'
                    })
                });
            });

            const result = await page.evaluate(async () => {
                return await API.getPermissionLevels();
            });

            expect(result.levels).toContain('planet');
            expect(result.levels).toContain('city');
            expect(result.default).toBe('planet');
        });

    });

    test.describe('Health Check', () => {

        test('checkHealth returns true when server healthy', async ({ page }) => {
            // The beforeEach already mocks /api/health to return ok
            // Just verify that API.checkHealth() works correctly
            const healthy = await page.evaluate(async () => {
                return await API.checkHealth();
            });

            expect(healthy).toBe(true);
        });

        test('checkHealth returns false when server down', async ({ page }) => {
            // Unroute beforeEach handler and add failing handler
            await page.unroute('**/api/health');
            await page.route('**/api/health', route => {
                route.abort('connectionrefused');
            });

            const healthy = await page.evaluate(async () => {
                return await API.checkHealth();
            });

            expect(healthy).toBe(false);
        });

    });

});
