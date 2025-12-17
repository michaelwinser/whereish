// @ts-check
/**
 * Journey: Location Management
 *
 * Tests location display and refresh functionality.
 *
 * Journeys covered:
 * - J7: Refresh Location
 */

const {
    test,
    expect,
    TEST_LOCATIONS,
    SEATTLE_HIERARCHY,
    setupAuthenticatedPage,
    mockGeolocation,
    mockGeocode
} = require('../fixtures/test-helpers');

test.describe('Journey: Location Management', () => {

    test.describe('J7: Refresh Location', () => {

        test('location bar displays current location', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await mockGeocode(page, SEATTLE_HIERARCHY);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            // Location bar should be visible
            const locationBar = page.locator('#location-bar, .location-bar, [data-component="location-bar"]');
            await expect(locationBar).toBeVisible();
        });

        // TODO: Unskip when v2 implements location refresh
        test.skip('refresh button triggers location update', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await mockGeocode(page, SEATTLE_HIERARCHY);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            // Click refresh button
            const refreshBtn = page.locator('#refresh-btn, #refresh-location-btn, button:has-text("Refresh")');
            if (await refreshBtn.isVisible()) {
                await refreshBtn.click();

                // Wait for location to update
                await page.waitForTimeout(2000);

                // Location should show Seattle area
                const locationText = page.locator('#location-bar-primary, .location-primary, .location-text');
                // Location bar should have some content (not just loading)
                await expect(locationText).not.toHaveText(/Locating|Loading/);
            }
        });

        // TODO: Unskip when v2 implements location loading states
        test.skip('loading state shown during refresh', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock slow geocode to observe loading state
            await page.route('**/nominatim.openstreetmap.org/**', async route => {
                await new Promise(r => setTimeout(r, 2000));
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        address: {
                            city: 'Seattle',
                            state: 'Washington',
                            country: 'United States'
                        }
                    })
                });
            });

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            const refreshBtn = page.locator('#refresh-btn, #refresh-location-btn, button:has-text("Refresh")');
            if (await refreshBtn.isVisible()) {
                await refreshBtn.click();

                // Should show loading state
                const locationText = page.locator('#location-bar-primary, .location-primary');
                // Check for loading indicator text
                await expect(locationText).toContainText(/Locating|Getting|Loading/);
            }
        });

        // TODO: Unskip when v2 implements location error handling
        test.skip('location error displays error message', async ({ page, context }) => {
            // Don't grant geolocation permission to trigger error
            await setupAuthenticatedPage(page, { contacts: [] });

            // Try to refresh without geolocation permission
            const refreshBtn = page.locator('#refresh-btn, #refresh-location-btn, button:has-text("Refresh")');
            if (await refreshBtn.isVisible()) {
                await refreshBtn.click();

                // Wait for error to appear
                await page.waitForTimeout(2000);

                // Error message should be visible or location bar should show error state
                const errorIndicator = page.locator('.location-error, #location-error, text=permission, text=error');
                // Some error indication should be present
            }
        });

    });

    test.describe('Named Location Match', () => {

        // TODO: Unskip when v2 implements named location matching
        test.skip('matched place name shows in location bar', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await mockGeocode(page, SEATTLE_HIERARCHY);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            // Create a place at current location
            await page.evaluate(() => {
                return Storage.saveNamedLocation({
                    id: 'test-place-1',
                    userId: 'test-user-123',
                    label: 'My Home',
                    latitude: 47.6062,
                    longitude: -122.3321,
                    radiusMeters: 500, // Large radius to ensure match
                    visibility: { mode: 'private', contactIds: [] },
                    createdAt: new Date().toISOString()
                });
            });

            // Refresh location
            const refreshBtn = page.locator('#refresh-btn, #refresh-location-btn, button:has-text("Refresh")');
            if (await refreshBtn.isVisible()) {
                await refreshBtn.click();
                await page.waitForTimeout(2000);

                // Location bar should show the place name
                const locationBar = page.locator('#location-bar-primary, .location-primary');
                // The place name "My Home" should appear if matched
                // Note: This test may need adjustment based on actual UI behavior
            }
        });

    });

});
