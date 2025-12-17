const { test, expect } = require('@playwright/test');

test.describe('V2 Implementation Loading', () => {

    test('v1 loads without errors', async ({ page }) => {
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

    test('v2 loads without errors', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', err => jsErrors.push(err.message));

        await page.route('**/api/health', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        });

        await page.goto('/?v2');
        await page.waitForTimeout(2000);

        // V2 should show welcome view
        await expect(page.locator('[data-view="welcome"]')).toBeVisible();

        // No JavaScript runtime errors
        expect(jsErrors).toHaveLength(0);
    });

    test('v2 console shows initialization message', async ({ page }) => {
        const logs = [];
        page.on('console', msg => {
            if (msg.type() === 'log') logs.push(msg.text());
        });

        await page.route('**/api/health', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        });

        await page.goto('/?v2');
        await page.waitForTimeout(2000);

        // V2 should log initialization message
        expect(logs.some(log => log.includes('[v2] Initialized'))).toBe(true);
    });

});
