// @ts-check
/**
 * Journey: Contact Management
 *
 * Tests contact-related user flows including viewing contacts, accepting/declining
 * requests, adding new contacts, and managing permissions.
 *
 * Journeys covered:
 * - J2: View Contact Location
 * - J3: Accept Contact Request
 * - J4: Change Permission Level
 * - J5: Add Contact
 * - J6: Decline Contact Request
 */

const {
    test,
    expect,
    MOCK_USER,
    MOCK_CONTACTS,
    MOCK_CONTACT_WITH_LOCATION,
    setupAuthenticatedPage,
    setupMinimalMocks,
    setAuthToken
} = require('../fixtures/test-helpers');

test.describe('Journey: Contact Management', () => {

    test.describe('J2: View Contact Location', () => {

        test('contact list shows contact names', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Contact names should be visible
            await expect(page.locator('text=Alice')).toBeVisible();
            await expect(page.locator('text=Bob')).toBeVisible();
            await expect(page.locator('text=Carol')).toBeVisible();
        });

        test('contact shows location when available', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [MOCK_CONTACT_WITH_LOCATION] });

            // Contact name should be visible
            await expect(page.locator('text=Alice')).toBeVisible();

            // Contact should show some location text (even if decryption isn't mocked)
            // Without E2E encryption setup, location shows as "Planet Earth" (default)
            const contactLocation = page.locator('.contact-location');
            await expect(contactLocation.first()).toBeVisible();
        });

        test('empty contact list shows appropriate message', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Should show empty state or prompt to add contacts
            const contactsSection = page.locator('#contacts-section');
            await expect(contactsSection).toBeVisible();
        });

    });

    test.describe('J3: Accept Contact Request', () => {

        test('incoming request shows accept and decline buttons', async ({ page }) => {
            await setupAuthenticatedPage(page, {
                contacts: [],
                requests: {
                    incoming: [{
                        requestId: 1,
                        fromUserId: 'user-new',
                        name: 'New Friend',
                        email: 'friend@example.com',
                        createdAt: new Date().toISOString()
                    }],
                    outgoing: []
                }
            });

            // Incoming request should show with buttons
            await expect(page.locator('text=New Friend')).toBeVisible();
            await expect(page.locator('button:has-text("Accept")')).toBeVisible();
            await expect(page.locator('button:has-text("Decline")')).toBeVisible();
        });

        // TODO: Unskip when v2 implements contact request acceptance
        test.skip('accepting request removes it from pending', async ({ page }) => {
            let acceptCalled = false;

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

            // Dynamic requests mock - returns different data after accept
            await page.route('**/api/contacts/requests', route => {
                if (acceptCalled) {
                    route.fulfill({
                        status: 200,
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                } else {
                    route.fulfill({
                        status: 200,
                        body: JSON.stringify({
                            incoming: [{
                                requestId: 1,
                                fromUserId: 'user-new',
                                name: 'New Friend',
                                email: 'friend@example.com'
                            }],
                            outgoing: []
                        })
                    });
                }
            });

            // Mock accept endpoint
            await page.route('**/api/contacts/requests/*/accept', route => {
                acceptCalled = true;
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Click accept
            await page.click('button:has-text("Accept")');

            // Wait for request to be removed
            await page.waitForTimeout(1000);

            // Request should no longer be visible
            await expect(page.locator('text=New Friend').first()).not.toBeVisible({ timeout: 5000 });
        });

    });

    test.describe('J4: Change Permission Level', () => {

        test('contact detail shows permission dropdown', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Click on a contact to open detail
            await page.click('.contact-item:has-text("Alice")');

            // Wait for detail view
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Permission dropdown should be present
            await expect(page.locator('#detail-permission-select')).toBeVisible();
        });

        // TODO: Unskip when v2 implements permission changes
        test.skip('changing permission sends update to server', async ({ page }) => {
            let permissionUpdated = false;

            await setupMinimalMocks(page);

            // Mock authenticated endpoints
            await page.route('**/api/me', route => {
                route.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) });
            });

            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ contacts: MOCK_CONTACTS }) });
            });

            await page.route('**/api/contacts/requests', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ incoming: [], outgoing: [] }) });
            });

            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });

            // Mock permission update endpoint
            await page.route('**/api/contacts/*/permission', route => {
                permissionUpdated = true;
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            // Mock location publish
            await page.route('**/api/location/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Open contact detail
            await page.click('.contact-item:has-text("Alice")');
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Change permission level
            await page.selectOption('#detail-permission-select', 'city');

            // Wait for API call
            await page.waitForTimeout(1000);

            expect(permissionUpdated).toBe(true);
        });

    });

    test.describe('J5: Add Contact', () => {

        test('add contact button opens modal', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: [] });

            // Click add contact button
            await page.click('#add-contact-btn');

            // Modal should be visible
            await expect(page.locator('#add-contact-modal')).toBeVisible();

            // Email input should be present
            await expect(page.locator('#contact-email')).toBeVisible();
        });

        test('submitting email sends contact request', async ({ page }) => {
            let requestSent = false;

            await setupMinimalMocks(page);

            // Mock authenticated endpoints
            await page.route('**/api/me', route => {
                route.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) });
            });

            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ contacts: [] }) });
            });

            await page.route('**/api/contacts/requests', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ incoming: [], outgoing: [] }) });
            });

            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });

            // Mock send request endpoint
            await page.route('**/api/contacts/request', route => {
                requestSent = true;
                route.fulfill({ status: 201, body: JSON.stringify({ success: true, requestId: 123 }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Open add contact modal
            await page.click('#add-contact-btn');

            // Fill in email
            await page.fill('#contact-email', 'newcontact@example.com');

            // Submit
            await page.click('#add-contact-form button[type="submit"]');

            // Wait for API call
            await page.waitForTimeout(1000);

            expect(requestSent).toBe(true);
        });

        test('modal closes after successful request', async ({ page }) => {
            await setupMinimalMocks(page);

            // Mock authenticated endpoints
            await page.route('**/api/me', route => {
                route.fulfill({ status: 200, body: JSON.stringify(MOCK_USER) });
            });

            await page.route('**/api/contacts/encrypted', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ contacts: [] }) });
            });

            await page.route('**/api/contacts/requests', route => {
                route.fulfill({ status: 200, body: JSON.stringify({ incoming: [], outgoing: [] }) });
            });

            await page.route('**/api/devices', route => {
                route.fulfill({
                    status: 200,
                    body: JSON.stringify({
                        devices: [{ id: 'device-1', name: 'Test', platform: 'web', isActive: true, isCurrent: true }]
                    })
                });
            });

            await page.route('**/api/contacts/request', route => {
                route.fulfill({ status: 201, body: JSON.stringify({ success: true, requestId: 123 }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Open modal and submit
            await page.click('#add-contact-btn');
            await page.fill('#contact-email', 'newcontact@example.com');
            await page.click('#add-contact-form button[type="submit"]');

            // Modal should close
            await expect(page.locator('#add-contact-modal')).not.toBeVisible({ timeout: 5000 });
        });

    });

    test.describe('J6: Decline Contact Request', () => {

        // TODO: Unskip when v2 implements contact request decline
        test.skip('declining request removes it from list', async ({ page }) => {
            let declineCalled = false;

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

            // Dynamic requests mock
            await page.route('**/api/contacts/requests', route => {
                if (declineCalled) {
                    route.fulfill({
                        status: 200,
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                } else {
                    route.fulfill({
                        status: 200,
                        body: JSON.stringify({
                            incoming: [{
                                requestId: 1,
                                fromUserId: 'user-unwanted',
                                name: 'Unwanted Person',
                                email: 'unwanted@example.com'
                            }],
                            outgoing: []
                        })
                    });
                }
            });

            // Mock decline endpoint
            await page.route('**/api/contacts/requests/*/decline', route => {
                declineCalled = true;
                route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
            });

            await page.goto('/');
            await setAuthToken(page, 'test-token');
            await page.reload();

            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 10000 });

            // Click decline
            await page.click('button:has-text("Decline")');

            // Wait for removal
            await page.waitForTimeout(1000);

            // Request should be removed
            await expect(page.locator('text=Unwanted Person').first()).not.toBeVisible({ timeout: 5000 });
        });

    });

    test.describe('Contact Detail View', () => {

        test('clicking contact opens detail view', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Click on contact
            await page.click('.contact-item:has-text("Alice")');

            // Detail view should be visible
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Contact name should be in detail view
            await expect(page.locator('#contact-detail-name')).toContainText('Alice');
        });

        test('back button returns to contact list', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Open detail
            await page.click('.contact-item:has-text("Alice")');
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Click back
            await page.click('#contact-detail-back-btn');

            // Should return to main view
            await expect(page.locator('[data-view="main"]')).toBeVisible();
        });

        test('remove contact shows confirmation', async ({ page }) => {
            await setupAuthenticatedPage(page, { contacts: MOCK_CONTACTS });

            // Open detail
            await page.click('.contact-item:has-text("Alice")');
            await expect(page.locator('[data-view="contact-detail"]')).toBeVisible();

            // Click remove (if button exists)
            const removeBtn = page.locator('#remove-contact-btn');
            if (await removeBtn.isVisible()) {
                await removeBtn.click();

                // Confirmation should appear
                await expect(page.locator('.confirm-modal, #confirm-modal')).toBeVisible();
            }
        });

    });

});
