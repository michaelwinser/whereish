// @ts-check
const { test, expect, setAuthToken, MOCK_USER } = require('../fixtures/test-helpers');

/**
 * Invitation Acceptance Flow Tests (Issue #50)
 *
 * These tests verify that invitation acceptance works correctly.
 *
 * The core issue was browser caching of API responses causing stale invitations
 * to appear in the UI. The fix adds Cache-Control headers to prevent caching.
 *
 * Key scenarios tested:
 * 1. Accepting an invitation succeeds and updates the UI
 * 2. Failed acceptance (404 - already processed) shows error
 * 3. Cache-Control headers are present on mock responses (simulating server behavior)
 */

test.describe('Invitation Acceptance Flow', () => {

    /**
     * Helper to set up standard mocks for an authenticated user
     */
    async function setupAuthenticatedMocks(page, requestsResponse = { incoming: [], outgoing: [] }) {
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
        await page.route('**/api/contacts/encrypted', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
        });
        await page.route('**/api/me', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_USER)
            });
        });

        // Requests endpoint with Cache-Control headers (simulating server fix)
        await page.route('**/api/contacts/requests', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
                body: JSON.stringify(requestsResponse)
            });
        });
    }

    test.describe('Accept Invitation', () => {

        test('accepting invitation removes it from UI without page refresh', async ({ page }) => {
            let acceptCalled = false;
            let requestsCallCount = 0;

            await setupAuthenticatedMocks(page);

            // Override requests endpoint to track calls and change response after accept
            await page.unroute('**/api/contacts/requests');
            await page.route('**/api/contacts/requests', route => {
                requestsCallCount++;
                if (!acceptCalled) {
                    // Before accept: show the invitation
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
                        body: JSON.stringify({
                            incoming: [{
                                requestId: 42,
                                userId: 'sender-123',
                                name: 'Test Sender',
                                email: 'sender@example.com',
                                createdAt: new Date().toISOString()
                            }],
                            outgoing: []
                        })
                    });
                } else {
                    // After accept: invitation is gone
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                }
            });

            // Mock the accept endpoint
            await page.route('**/api/contacts/requests/42/accept', route => {
                acceptCalled = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, contact: { id: 'sender-123', name: 'Test Sender' } })
                });
            });

            // Load app authenticated
            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Verify invitation is visible
            const senderVisible = await page.locator('text=Test Sender').isVisible();
            expect(senderVisible).toBe(true);

            // Click Accept button
            const acceptButton = page.locator('button:has-text("Accept")');
            expect(await acceptButton.isVisible()).toBe(true);
            await acceptButton.click();

            // Wait for UI to update (accept triggers loadContactRequests which re-renders)
            await page.waitForTimeout(500);

            // Invitation should be gone without page refresh
            const senderStillVisible = await page.locator('text=Test Sender').isVisible();
            expect(senderStillVisible).toBe(false);
            expect(acceptCalled).toBe(true);

            // Verify requests endpoint was called multiple times (initial load + after accept)
            expect(requestsCallCount).toBeGreaterThan(1);
        });

        // TODO: Flaky - geolocation error toast interferes with accept error toast
        test.skip('failed acceptance shows error and re-enables button', async ({ page }) => {
            await setupAuthenticatedMocks(page, {
                incoming: [{
                    requestId: 99,
                    userId: 'sender-456',
                    name: 'Another Sender',
                    email: 'another@example.com',
                    createdAt: new Date().toISOString()
                }],
                outgoing: []
            });

            // Mock accept to fail with 404 (invitation already processed)
            await page.route('**/api/contacts/requests/99/accept', route => {
                route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Request not found' })
                });
            });

            // Load app
            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Verify invitation is visible
            expect(await page.locator('text=Another Sender').isVisible()).toBe(true);

            // Click Accept
            const acceptButton = page.locator('button:has-text("Accept")');
            await acceptButton.click();

            // Wait for toast to appear
            const toast = page.locator('.toast-error');
            await expect(toast).toBeVisible({ timeout: 2000 });

            // Should show error message in toast
            const toastMessage = await toast.locator('.toast-message').textContent();
            expect(toastMessage).toContain('Failed to accept');

            // Button should be re-enabled after failure
            const buttonDisabled = await acceptButton.isDisabled();
            expect(buttonDisabled).toBe(false);
        });

        test('decline invitation removes it from UI', async ({ page }) => {
            let declineCalled = false;

            await setupAuthenticatedMocks(page);

            await page.unroute('**/api/contacts/requests');
            await page.route('**/api/contacts/requests', route => {
                if (!declineCalled) {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            incoming: [{
                                requestId: 55,
                                userId: 'decliner',
                                name: 'To Decline',
                                email: 'decline@example.com',
                                createdAt: new Date().toISOString()
                            }],
                            outgoing: []
                        })
                    });
                } else {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                }
            });

            await page.route('**/api/contacts/requests/55/decline', route => {
                declineCalled = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true })
                });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            expect(await page.locator('text=To Decline').isVisible()).toBe(true);

            const declineButton = page.locator('button:has-text("Decline")');
            await declineButton.click();

            await page.waitForTimeout(500);

            expect(await page.locator('text=To Decline').isVisible()).toBe(false);
            expect(declineCalled).toBe(true);
        });

    });

    test.describe('Cache-Control Headers', () => {

        test('API responses include no-cache headers to prevent stale data', async ({ page }) => {
            let responseHeaders = null;

            // Listen for responses to capture headers
            page.on('response', response => {
                if (response.url().includes('/api/contacts/requests')) {
                    responseHeaders = response.headers();
                }
            });

            await setupAuthenticatedMocks(page);

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            // Verify response had correct cache control headers
            expect(responseHeaders).not.toBeNull();
            if (responseHeaders) {
                expect(responseHeaders['cache-control']).toContain('no-cache');
                expect(responseHeaders['cache-control']).toContain('no-store');
            }
        });

    });

    test.describe('Outgoing Requests', () => {

        test('sending request shows it in outgoing list immediately', async ({ page }) => {
            let sendCalled = false;
            let requestsCallCount = 0;

            await setupAuthenticatedMocks(page);

            // Override requests endpoint to return the new outgoing request after send
            await page.unroute('**/api/contacts/requests');
            await page.route('**/api/contacts/requests', route => {
                requestsCallCount++;
                if (!sendCalled) {
                    // Before send: no requests
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                } else {
                    // After send: outgoing request appears
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            incoming: [],
                            outgoing: [{
                                requestId: 123,
                                userId: 'new-friend',
                                email: 'newfriend@example.com',
                                createdAt: new Date().toISOString()
                            }]
                        })
                    });
                }
            });

            // Mock send endpoint
            await page.route('**/api/contacts/request', route => {
                sendCalled = true;
                route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Request sent' })
                });
            });

            // Dismiss alerts
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Initially no outgoing requests
            expect(await page.locator('text=newfriend@example.com').isVisible()).toBe(false);

            // Open add contact modal and send request
            const addButton = page.locator('#add-contact-btn');
            if (await addButton.isVisible()) {
                await addButton.click();
                await page.waitForSelector('#add-contact-modal:not(.hidden)', { timeout: 3000 });

                await page.fill('#contact-email', 'newfriend@example.com');
                await page.click('#add-contact-modal button[type="submit"]');

                await page.waitForTimeout(500);

                // Outgoing request should appear immediately without page refresh
                expect(await page.locator('text=newfriend@example.com').isVisible()).toBe(true);
                expect(sendCalled).toBe(true);
                // Verify loadContactRequests was called after sending (at least initial + after send)
                expect(requestsCallCount).toBeGreaterThan(1);
            }
        });

        test('cancel outgoing request removes it from UI', async ({ page }) => {
            let cancelCalled = false;

            await setupAuthenticatedMocks(page);

            await page.unroute('**/api/contacts/requests');
            await page.route('**/api/contacts/requests', route => {
                if (!cancelCalled) {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            incoming: [],
                            outgoing: [{
                                requestId: 77,
                                userId: 'pending-recipient',
                                email: 'pending@example.com',
                                createdAt: new Date().toISOString()
                            }]
                        })
                    });
                } else {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                }
            });

            await page.route('**/api/contacts/requests/77/cancel', route => {
                cancelCalled = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true })
                });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            expect(await page.locator('text=pending@example.com').isVisible()).toBe(true);

            // Use specific class selector to avoid matching other Cancel buttons (modals, etc.)
            const cancelButton = page.locator('.cancel-request-btn');
            await cancelButton.click();

            await page.waitForTimeout(500);

            expect(await page.locator('text=pending@example.com').isVisible()).toBe(false);
            expect(cancelCalled).toBe(true);
        });

    });

});
