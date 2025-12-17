const { test, expect } = require('@playwright/test');

test.describe('App Loading', () => {

    test('app loads without errors', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', err => jsErrors.push(err.message));

        await page.route('**/api/health', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        });

        await page.goto('/');
        await page.waitForTimeout(2000);

        // Check for welcome view (unauthenticated)
        await expect(page.locator('[data-view="welcome"]')).toBeVisible();

        // No JavaScript runtime errors (page errors, not console errors)
        expect(jsErrors).toHaveLength(0);
    });

    test('console shows initialization message', async ({ page }) => {
        const logs = [];
        page.on('console', msg => {
            if (msg.type() === 'log') logs.push(msg.text());
        });

        await page.route('**/api/health', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        });

        await page.goto('/');
        await page.waitForTimeout(2000);

        // App should log initialization message
        expect(logs.some(log => log.includes('[v2] Initialized'))).toBe(true);
    });

});
