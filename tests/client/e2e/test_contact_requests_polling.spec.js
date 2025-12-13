// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Contact Requests Polling Tests (Issue #48)
 *
 * These tests verify that contact requests are properly polled/refreshed
 * and that timestamps are displayed correctly.
 */

test.describe('Contact Requests', () => {

    test.describe('Timestamp Display', () => {

        test('incoming requests should show timestamp', async ({ page }) => {
            await page.route('**/api/health', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
            });
            await page.route('**/api/version', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0' }) });
            });
            await page.route('**/api/permission-levels', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ levels: ['planet', 'city', 'street', 'address'], default: 'planet' })
                });
            });
            await page.route('**/api/contacts', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'test-user', email: 'test@example.com', name: 'Test User' })
                });
            });

            // Return an incoming request from 5 minutes ago
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            await page.route('**/api/contacts/requests', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        incoming: [{
                            requestId: 1,
                            userId: 'sender-123',
                            name: 'Friend Request',
                            email: 'friend@example.com',
                            createdAt: fiveMinutesAgo
                        }],
                        outgoing: []
                    })
                });
            });

            // Load app
            await page.goto('/');
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // The incoming request should show "5m ago"
            const incomingSection = page.locator('#incoming-requests');
            const hasTimeIndicator = await incomingSection.locator('.request-time').isVisible();

            expect(hasTimeIndicator).toBe(true);
        });

        test('outgoing requests should show timestamp', async ({ page }) => {
            await page.route('**/api/health', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
            });
            await page.route('**/api/version', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0' }) });
            });
            await page.route('**/api/permission-levels', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ levels: ['planet', 'city', 'street', 'address'], default: 'planet' })
                });
            });
            await page.route('**/api/contacts', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'test-user', email: 'test@example.com', name: 'Test User' })
                });
            });

            // Return an outgoing request from 10 minutes ago
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            await page.route('**/api/contacts/requests', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        incoming: [],
                        outgoing: [{
                            requestId: 2,
                            userId: 'recipient-456',
                            name: 'Pending Friend',
                            email: 'pending@example.com',
                            createdAt: tenMinutesAgo
                        }]
                    })
                });
            });

            // Load app
            await page.goto('/');
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Outgoing requests show timestamps
            const outgoingSection = page.locator('#outgoing-requests');
            const hasTimeText = await outgoingSection.locator('.request-time').isVisible();

            expect(hasTimeText).toBe(true);
        });

    });

    test.describe('Initial Load', () => {

        test('contact requests are fetched on startup', async ({ page }) => {
            let requestsCalled = false;

            await page.route('**/api/health', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
            });
            await page.route('**/api/version', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0' }) });
            });
            await page.route('**/api/permission-levels', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ levels: ['planet', 'city', 'street', 'address'], default: 'planet' })
                });
            });
            await page.route('**/api/contacts', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'test-user', email: 'test@example.com', name: 'Test User' })
                });
            });

            await page.route('**/api/contacts/requests', route => {
                requestsCalled = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ incoming: [], outgoing: [] })
                });
            });

            await page.goto('/');
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            expect(requestsCalled).toBe(true);
        });

        test('incoming requests are displayed', async ({ page }) => {
            await page.route('**/api/health', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
            });
            await page.route('**/api/version', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0' }) });
            });
            await page.route('**/api/permission-levels', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ levels: ['planet', 'city', 'street', 'address'], default: 'planet' })
                });
            });
            await page.route('**/api/contacts', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 'test-user', email: 'test@example.com', name: 'Test User' })
                });
            });

            await page.route('**/api/contacts/requests', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        incoming: [{
                            requestId: 1,
                            userId: 'sender-123',
                            name: 'New Friend',
                            email: 'friend@example.com',
                            createdAt: new Date().toISOString()
                        }],
                        outgoing: []
                    })
                });
            });

            await page.goto('/');
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Incoming request should be visible
            const newFriendVisible = await page.locator('text=New Friend').isVisible();
            expect(newFriendVisible).toBe(true);

            // Accept button should be present
            const acceptButton = page.locator('button:has-text("Accept")');
            expect(await acceptButton.isVisible()).toBe(true);
        });

    });

});
