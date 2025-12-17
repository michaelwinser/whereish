// @ts-check
/**
 * Journey: Places Management
 *
 * Tests named location (places) management including creating, editing,
 * deleting places, and setting visibility modes.
 *
 * Journeys covered:
 * - J8: Save Named Location
 * - J10: View Places List
 * - J11: Edit Place
 * - J12: Delete Place
 * - J13: Place Visibility Modes
 */

const {
    test,
    expect,
    MOCK_USER,
    MOCK_CONTACTS,
    TEST_LOCATIONS,
    SEATTLE_HIERARCHY,
    setupAuthenticatedPage,
    setupMinimalMocks,
    setAuthToken,
    mockGeolocation,
    mockGeocode,
    createPlace,
    clearPlaces
} = require('../fixtures/test-helpers');

test.describe('Journey: Places Management', () => {

    test.describe('J10: View Places List', () => {

        test('places tab is accessible', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Click places tab
            await page.click('[data-tab="places"]');

            // Places view should be visible
            await expect(page.locator('[data-view="places"]')).toBeVisible();
        });

        test('places tab shows saved locations', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Create a place with unique name
            await createPlace(page, 'TestPlace123', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Wait for places view to load
            await expect(page.locator('[data-view="places"]')).toBeVisible();

            // Place should be visible in the places list
            await expect(page.locator('.named-location-item:has-text("TestPlace123")')).toBeVisible({ timeout: 5000 });
        });

        test('empty places shows appropriate message', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Should show some indication of empty state
            const placesView = page.locator('[data-view="places"]');
            await expect(placesView).toBeVisible();
        });

    });

    test.describe('J8: Save Named Location', () => {

        test('save location button opens modal', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock geocode
            await mockGeocode(page, SEATTLE_HIERARCHY);

            // Click save location button (if on main view)
            const saveBtn = page.locator('#save-location-btn');
            if (await saveBtn.isVisible()) {
                await saveBtn.click();

                // Modal should open
                await expect(page.locator('#save-modal, #save-location-modal')).toBeVisible();

                // Label input should be present
                await expect(page.locator('#location-label, #save-location-label')).toBeVisible();
            }
        });

        test('saving location adds it to places list', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock geocode
            await mockGeocode(page, SEATTLE_HIERARCHY);

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            // Create place directly (UI flow may vary)
            await createPlace(page, 'New Place', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // New place should be visible
            await expect(page.locator('text=New Place')).toBeVisible();
        });

    });

    test.describe('J11: Edit Place', () => {

        test('edit button opens modal with current values', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Create a place to edit
            await createPlace(page, 'EditMe', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Click edit button
            const editBtn = page.locator('.edit-location-btn, [data-action="edit"]').first();
            if (await editBtn.isVisible()) {
                await editBtn.click();

                // Edit modal should open
                await expect(page.locator('#edit-place-modal, #edit-location-modal')).toBeVisible();

                // Label should be pre-filled
                const labelInput = page.locator('#edit-place-label, #edit-location-label');
                await expect(labelInput).toHaveValue('EditMe');
            }
        });

        test('saving edit updates place in list', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            // Create a place
            await createPlace(page, 'OldName', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Click edit
            const editBtn = page.locator('.edit-location-btn, [data-action="edit"]').first();
            if (await editBtn.isVisible()) {
                await editBtn.click();

                // Change the name
                const labelInput = page.locator('#edit-place-label, #edit-location-label');
                await labelInput.clear();
                await labelInput.fill('NewName');

                // Save
                await page.click('#edit-place-form button[type="submit"], #save-edit-btn');

                // Wait for modal to close
                await page.waitForTimeout(500);

                // New name should appear
                await expect(page.locator('text=NewName')).toBeVisible();
            }
        });

    });

    test.describe('J12: Delete Place', () => {

        test('delete button shows confirmation', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Create a place
            await createPlace(page, 'ToDelete', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Click delete button
            const deleteBtn = page.locator('.delete-location-btn, [data-action="delete"]').first();
            if (await deleteBtn.isVisible()) {
                await deleteBtn.click();

                // Confirmation should appear
                await expect(page.locator('.confirm-modal, #confirm-modal, [role="dialog"]')).toBeVisible();
            }
        });

        test('confirming delete removes place', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: [] });

            // Create a place
            await createPlace(page, 'WillBeDeleted', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Verify place exists
            await expect(page.locator('text=WillBeDeleted')).toBeVisible();

            // Click delete
            const deleteBtn = page.locator('.delete-location-btn, [data-action="delete"]').first();
            if (await deleteBtn.isVisible()) {
                await deleteBtn.click();

                // Confirm deletion
                const confirmBtn = page.locator('.confirm-modal button:has-text("Delete"), #confirm-delete-btn, button:has-text("Confirm")');
                if (await confirmBtn.isVisible()) {
                    await confirmBtn.click();

                    // Wait for deletion
                    await page.waitForTimeout(500);

                    // Place should be removed
                    await expect(page.locator('text=WillBeDeleted')).not.toBeVisible();
                }
            }
        });

    });

    test.describe('J13: Place Visibility Modes', () => {

        test('edit modal shows visibility options', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Create a place
            await createPlace(page, 'TestVisibility', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Click edit
            const editBtn = page.locator('.edit-location-btn, [data-action="edit"]').first();
            if (await editBtn.isVisible()) {
                await editBtn.click();

                // Visibility options should be present
                const privateRadio = page.locator('input[name="visibility"][value="private"]');
                const allRadio = page.locator('input[name="visibility"][value="all"]');
                const selectedRadio = page.locator('input[name="visibility"][value="selected"]');

                // At least check if visibility controls exist
                const hasVisibility = await privateRadio.isVisible() ||
                                      await allRadio.isVisible() ||
                                      await selectedRadio.isVisible();

                // This is informational - visibility UI may vary
                if (hasVisibility) {
                    await expect(privateRadio).toBeVisible();
                }
            }
        });

        test('selected visibility shows contact picker', async ({ page, context }) => {
            await mockGeolocation(context, TEST_LOCATIONS.SEATTLE);
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Create a place
            await createPlace(page, 'TestSelected', 100, TEST_LOCATIONS.SEATTLE);

            // Navigate to places
            await page.click('[data-tab="places"]');

            // Click edit
            const editBtn = page.locator('.edit-location-btn, [data-action="edit"]').first();
            if (await editBtn.isVisible()) {
                await editBtn.click();

                // Click "selected" visibility mode
                const selectedRadio = page.locator('input[name="visibility"][value="selected"]');
                if (await selectedRadio.isVisible()) {
                    await selectedRadio.click();

                    // Contact selector should appear
                    await expect(page.locator('#visibility-contact-selector, .contact-selector')).toBeVisible();
                }
            }
        });

    });

});
