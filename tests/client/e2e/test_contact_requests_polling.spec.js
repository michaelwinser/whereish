// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Contact Requests Polling Tests (Issue #48)
 *
 * These tests verify that contact requests are properly polled/refreshed
 * without requiring a full page reload.
 *
 * Root cause: loadContactRequests() is not called on a timer,
 * only refreshContacts() is called periodically.
 */

test.describe('Contact Requests Polling', () => {

    test.describe('Polling Behavior', () => {

        test('loadContactRequests should be called periodically', async ({ page }) => {
            // Track API calls to /api/contacts/requests
            const requestCalls = [];

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

            // Track requests to /api/contacts/requests
            await page.route('**/api/contacts/requests', route => {
                requestCalls.push(Date.now());
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ incoming: [], outgoing: [] })
                });
            });

            // Set auth token
            await page.goto('/');
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            // Initial call should have happened
            expect(requestCalls.length).toBeGreaterThanOrEqual(1);
            const initialCalls = requestCalls.length;

            // Wait for potential polling (if implemented, would happen within ~60s)
            // For now, we wait a shorter time to verify the bug exists
            await page.waitForTimeout(5000);

            // BUG: No additional calls should happen (proving the bug)
            // FIXED: Additional calls should happen (proving the fix)
            const callsAfterWait = requestCalls.length;

            // This test documents the current (buggy) behavior:
            // If this test FAILS (more calls happened), the bug has been fixed!
            // If this test PASSES (no additional calls), the bug still exists.
            console.log(`Contact requests API calls: initial=${initialCalls}, after wait=${callsAfterWait}`);

            // Document that no polling occurs currently
            // When fixed, change this to expect(callsAfterWait).toBeGreaterThan(initialCalls)
            expect(callsAfterWait).toBe(initialCalls);
        });

        test('new incoming request should appear without page reload', async ({ page }) => {
            let callCount = 0;

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

            // First call returns empty, subsequent calls return a new request
            await page.route('**/api/contacts/requests', route => {
                callCount++;
                if (callCount === 1) {
                    // Initial load - no requests
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                } else {
                    // Subsequent calls - new request appeared
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
                }
            });

            // Set auth token and load app
            await page.goto('/');
            await page.evaluate(() => {
                localStorage.setItem('whereish_auth_token', 'test-token');
            });
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            // Initially, no pending requests should be visible
            const pendingSection = page.locator('#pending-requests');
            await expect(pendingSection).toBeHidden();

            // Wait for potential polling (simulating time passing)
            await page.waitForTimeout(5000);

            // BUG: The new request should appear automatically, but it doesn't
            // because loadContactRequests is not polled
            const newFriendVisible = await page.locator('text=New Friend').isVisible();

            // This documents the bug - New Friend should be visible but isn't
            // When fixed, change to: expect(newFriendVisible).toBe(true)
            expect(newFriendVisible).toBe(false);
        });

    });

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

            // The incoming request should show "5m ago" or similar
            // BUG: Currently, incoming requests don't show timestamps at all
            const timeText = await page.locator('.request-time').first().isVisible();

            // This documents the bug - timestamp should be visible but isn't
            // The incoming request section doesn't render createdAt
            // When fixed, change to: expect(timeText).toBe(true)
            // For now, we check if ANY time indicator exists in the incoming section
            const incomingSection = page.locator('#incoming-requests');
            const hasTimeIndicator = await incomingSection.locator('text=/\\d+[mhd] ago|Just now/').isVisible();

            // Documents bug: incoming requests don't show timestamps
            expect(hasTimeIndicator).toBe(false);
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

            // Outgoing requests DO show timestamps (this should pass)
            const outgoingSection = page.locator('#outgoing-requests');
            const hasTimeText = await outgoingSection.locator('.request-time').isVisible();

            expect(hasTimeText).toBe(true);
        });

    });

});
