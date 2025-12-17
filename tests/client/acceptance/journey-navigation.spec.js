// @ts-check
/**
 * Journey: Navigation
 *
 * Tests navigation flows including tab switching, view transitions,
 * and modal behavior.
 *
 * Journeys covered:
 * - J14: Tab Navigation
 * - J15: Contact Detail Navigation
 * - J16: Modal Dismissal
 */

const {
    test,
    expect,
    MOCK_CONTACTS,
    setupAuthenticatedPage
} = require('../fixtures/test-helpers');

test.describe('Journey: Navigation', () => {

    test.describe('J14: Tab Navigation', () => {

        test('clicking tab switches view', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Click places tab
            await page.click('[data-tab="places"]');

            // Places view should be visible
            await expect(page.locator('[data-view="places"]')).toBeVisible();

            // Main view should be hidden
            await expect(page.locator('[data-view="main"]')).not.toBeVisible();
        });

        test('active tab updates visual state', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Initially main tab should be active
            const mainTab = page.locator('[data-tab="main"]');
            await expect(mainTab).toHaveClass(/active/);

            // Click places tab
            await page.click('[data-tab="places"]');

            // Places tab should now be active
            const placesTab = page.locator('[data-tab="places"]');
            await expect(placesTab).toHaveClass(/active/);

            // Main tab should no longer be active
            await expect(mainTab).not.toHaveClass(/active/);
        });

        test('tab bar visible on tab views', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Tab bar should be visible on main view
            await expect(page.locator('#tab-bar, .tab-bar')).toBeVisible();

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Tab bar should still be visible
            await expect(page.locator('#tab-bar, .tab-bar')).toBeVisible();
        });

        test('can switch between all tabs', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Main tab (should already be here)
            await expect(page.locator('[data-view="main"]')).toBeVisible();

            // Places tab
            await page.click('[data-tab="places"]');
            await expect(page.locator('[data-view="places"]')).toBeVisible();

            // Back to main
            await page.click('[data-tab="main"]');
            await expect(page.locator('[data-view="main"]')).toBeVisible();

            // Settings is accessed via button, not tab
            await page.click('#settings-btn');
            await expect(page.locator('[data-view="settings"]')).toBeVisible();

            // Back to main from settings
            await page.click('#settings-back-btn');
            await expect(page.locator('[data-view="main"]')).toBeVisible();
        });

    });

    test.describe('J15: Contact Detail Navigation', () => {

        test('clicking contact navigates to detail view', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Click on a contact
            await page.click('.contact-item:has-text("Alice")');

            // Detail view should be visible
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Main view should be hidden
            await expect(page.locator('[data-view="main"]')).not.toBeVisible();
        });

        test('tab bar hidden on detail view', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Navigate to contact detail
            await page.click('.contact-item:has-text("Alice")');

            // Tab bar should be hidden
            await expect(page.locator('#tab-bar, .tab-bar')).not.toBeVisible();
        });

        test('back button returns to contacts list', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Navigate to contact detail
            await page.click('.contact-item:has-text("Alice")');
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Click back button
            await page.click('#contact-detail-back-btn, .back-btn, [data-action="back"]');

            // Should return to main view
            await expect(page.locator('[data-view="main"]')).toBeVisible();

            // Tab bar should be visible again
            await expect(page.locator('#tab-bar, .tab-bar')).toBeVisible();
        });

    });

    test.describe('J16: Modal Dismissal', () => {

        test('escape key closes modal', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Open add contact modal
            await page.click('#add-contact-btn');
            await expect(page.locator('#add-contact-modal')).toBeVisible();

            // Press Escape
            await page.keyboard.press('Escape');

            // Modal should close
            await expect(page.locator('#add-contact-modal')).not.toBeVisible();
        });

        test('close button closes modal', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Open add contact modal
            await page.click('#add-contact-btn');
            await expect(page.locator('#add-contact-modal')).toBeVisible();

            // Click close button
            const closeBtn = page.locator('#add-contact-modal .close-btn, #add-contact-modal [aria-label="Close"], #add-contact-close-btn');
            if (await closeBtn.isVisible()) {
                await closeBtn.click();

                // Modal should close
                await expect(page.locator('#add-contact-modal')).not.toBeVisible();
            }
        });

        test('backdrop click closes modal', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Open add contact modal
            await page.click('#add-contact-btn');
            await expect(page.locator('#add-contact-modal')).toBeVisible();

            // Click backdrop (area outside modal content)
            const backdrop = page.locator('.modal-backdrop, .modal-overlay');
            if (await backdrop.isVisible()) {
                await backdrop.click({ position: { x: 10, y: 10 } });

                // Modal should close
                await expect(page.locator('#add-contact-modal')).not.toBeVisible();
            }
        });

        test('cancel button closes modal', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Open add contact modal
            await page.click('#add-contact-btn');
            await expect(page.locator('#add-contact-modal')).toBeVisible();

            // Click cancel if present
            const cancelBtn = page.locator('#add-contact-modal button:has-text("Cancel")');
            if (await cancelBtn.isVisible()) {
                await cancelBtn.click();

                // Modal should close
                await expect(page.locator('#add-contact-modal')).not.toBeVisible();
            }
        });

    });

    test.describe('View History', () => {

        test('escape navigates back from detail view', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Navigate to contact detail
            await page.click('.contact-item:has-text("Alice")');
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Press Escape (should navigate back)
            await page.keyboard.press('Escape');

            // Should return to main view
            await expect(page.locator('[data-view="main"]')).toBeVisible();
        });

        test('multiple navigations maintain history', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Start at main
            await expect(page.locator('[data-view="main"]')).toBeVisible();

            // Go to contact detail
            await page.click('.contact-item:has-text("Alice")');
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Go back
            await page.click('#contact-detail-back-btn, .back-btn, [data-action="back"]');
            await expect(page.locator('[data-view="main"]')).toBeVisible();

            // Go to places
            await page.click('[data-tab="places"]');
            await expect(page.locator('[data-view="places"]')).toBeVisible();

            // Go to settings (via button, not tab)
            await page.click('#settings-btn');
            await expect(page.locator('[data-view="settings"]')).toBeVisible();

            // Back to main via back button
            await page.click('#settings-back-btn');
            await expect(page.locator('[data-view="main"]')).toBeVisible();
        });

    });

});
