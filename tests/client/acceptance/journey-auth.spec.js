// @ts-check
/**
 * Journey: Authentication
 *
 * Tests user authentication flows including login, logout, and session persistence.
 * These tests verify UI behavior, not internal implementation.
 *
 * Journeys covered:
 * - J1: First-Time User Login
 * - J9: Logout
 */

const {
    test,
    expect,
    MOCK_USER,
    setupMinimalMocks,
    setAuthToken,
    clearAuth
} = require('../fixtures/test-helpers');

test.describe('Journey: Authentication', () => {

    test.describe('J1: First-Time User Login', () => {

        test('unauthenticated user sees welcome screen', async ({ page }) => {
            await setupMinimalMocks(page);
            await page.goto('/');

            // Welcome screen should be visible
            await expect(page.locator('[data-view="welcome"]')).toBeVisible();

            // Google sign-in button should be present (primary auth method)
            await expect(page.locator('#google-signin-btn')).toBeVisible();
        });

        test('welcome screen shows location', async ({ page }) => {
            await setupMinimalMocks(page);
            await page.goto('/');

            // Welcome hierarchy should be visible (shows "Locating..." initially)
            await expect(page.locator('#welcome-hierarchy')).toBeVisible();
        });

        test('authenticated user bypasses welcome screen', async ({ page }) => {
            await setupMinimalMocks(page);

            // Mock user endpoint after login
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify(MOCK_USER)
                });
            });

            // Mock contacts endpoint
            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({ contacts: [] })
                });
            });

            // Mock devices endpoint
            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token-123');
            await page.reload();

            // Should navigate to main view (not welcome)
            await expect(page.locator('[data-view="main"]')).toBeVisible({ timeout: 10000 });
        });

        test('transfer button is visible on welcome screen', async ({ page }) => {
            await setupMinimalMocks(page);
            await page.goto('/');

            // Transfer button should be present for device linking
            await expect(page.locator('#welcome-transfer-btn')).toBeVisible();
        });

        test('import identity button is visible on welcome screen', async ({ page }) => {
            await setupMinimalMocks(page);
            await page.goto('/');

            // Import identity button should be present for backup restoration
            await expect(page.locator('#import-identity-btn')).toBeVisible();
        });

    });

    test.describe('J9: Logout', () => {

        test('logout button is visible in settings', async ({ page }) => {
            await setupMinimalMocks(page);

            // Mock authenticated endpoints
            await page.route('**/api/me', route => {
                route.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) });
            });
            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            // Wait for main view
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Navigate to settings via settings button (not a tab)
            await page.click('#settings-btn');

            // Wait for settings view
            await expect(page.locator('[data-view="settings"]')).toBeVisible();

            // Logout button should be visible
            await expect(page.locator('#settings-logout-btn')).toBeVisible();
        });

        test('logout returns to welcome screen', async ({ page }) => {
            await setupMinimalMocks(page);

            // Mock authenticated endpoints
            await page.route('**/api/me', route => {
                route.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) });
            });
            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });
            await page.route('**/api/auth/logout', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            // Wait for main view
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Navigate to settings and click logout
            await page.click('#settings-btn');
            await expect(page.locator('[data-view="settings"]')).toBeVisible();
            await page.click('#settings-logout-btn');

            // Should return to welcome screen (after page reload or navigation)
            await expect(page.locator('[data-view="welcome"]')).toBeVisible({ timeout: 10000 });
        });

    });

    test.describe('Session Persistence', () => {

        test('authenticated user sees main view on page load', async ({ page }) => {
            await setupMinimalMocks(page);

            // Mock authenticated endpoints
            await page.route('**/api/me', route => {
                route.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) });
            });
            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ contacts: [] }) });
            });
            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            // Main view should be visible (not welcome)
            await expect(page.locator('[data-view="main"]')).toBeVisible({ timeout: 10000 });
        });

        test('expired session returns to welcome screen', async ({ page }) => {
            await setupMinimalMocks(page);

            // Mock 401 response (expired session)
            await page.route('**/api/me', route => {
                route.fulfill({ status: 401, body: JSON.stringify({ error: 'Unauthorized' }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'expired-token');
            await page.reload();

            // Should show welcome screen
            await expect(page.locator('[data-view="welcome"]')).toBeVisible({ timeout: 10000 });
        });

    });

});
