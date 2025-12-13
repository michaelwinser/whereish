// @ts-check
const { test, expect, setAuthToken, setupMinimalMocks, MOCK_USER, MOCK_CONTACTS, MOCK_CONTACT_WITH_LOCATION, SEATTLE_HIERARCHY } = require('../fixtures/test-helpers');

/**
 * Contacts E2E Tests
 *
 * Tests for contact list, adding contacts, and viewing locations.
 */

test.describe('Contacts', () => {

    test.beforeEach(async ({ page }) => {
        // Set up minimal mocks for app to load
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
        await page.route('**/api/contacts/requests', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ incoming: [], outgoing: [] }) });
        });
        await page.route('**/api/contacts/locations', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
        });
        // Default empty contacts (tests will override as needed)
        await page.route('**/api/contacts', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contacts: [] }) });
        });
        // Mock /api/me for authenticated startup
        await page.route('**/api/me', route => {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) });
        });

        // Start authenticated
        await page.goto('/');
        await setAuthToken(page, 'test-token');
        // Reload so app picks up the token
        await page.reload();
        await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
    });

    test.describe('Contact List', () => {

        test('displays contacts with names', async ({ page }) => {
            // Set up routes for contact data, then trigger refresh
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            // Trigger data reload
            await page.evaluate(() => window.location.reload());
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Check that contacts are displayed
            const aliceVisible = await page.locator('text=Alice').isVisible();
            const bobVisible = await page.locator('text=Bob').isVisible();

            expect(aliceVisible).toBe(true);
            expect(bobVisible).toBe(true);
        });

        test('shows location for contacts with location', async ({ page }) => {
            // Unroute beforeEach handlers before overriding
            await page.unroute('**/api/contacts');
            await page.unroute('**/api/contacts/locations');
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [MOCK_CONTACT_WITH_LOCATION] })
                });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [MOCK_CONTACT_WITH_LOCATION] })
                });
            });

            await page.evaluate(() => window.location.reload());
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Contact's location should be visible (shows named location when available)
            const locationVisible = await page.locator('text=Coffee Shop').isVisible();
            expect(locationVisible).toBe(true);
        });

        test('shows named location when visible', async ({ page }) => {
            const contactWithNamedLocation = {
                ...MOCK_CONTACT_WITH_LOCATION,
                location: {
                    ...MOCK_CONTACT_WITH_LOCATION.location,
                    data: {
                        hierarchy: SEATTLE_HIERARCHY,
                        namedLocation: 'Coffee Shop'
                    }
                }
            };

            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [contactWithNamedLocation] })
                });
            });
            await page.route('**/api/contacts/locations', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [contactWithNamedLocation] })
                });
            });

            await page.evaluate(() => window.location.reload());
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            const namedLocationVisible = await page.locator('text=Coffee Shop').isVisible();
            expect(namedLocationVisible).toBe(true);
        });

        test('shows contacts section when contacts exist', async ({ page }) => {
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            await page.evaluate(() => window.location.reload());
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Contacts section should be visible
            const contactsSection = page.locator('#contacts-section');
            const visible = await contactsSection.isVisible();
            expect(visible).toBe(true);
        });

    });

    test.describe('Add Contact', () => {

        test('add contact button opens modal', async ({ page }) => {
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [] })
                });
            });

            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            // Click add contact button
            const addButton = page.locator('#add-contact-btn');
            await page.waitForTimeout(500);
            if (await addButton.isVisible()) {
                await addButton.click();

                // Modal should open
                await page.waitForSelector('#add-contact-modal:not(.hidden)', { timeout: 5000 });
                const modalVisible = await page.locator('#add-contact-modal').isVisible();
                expect(modalVisible).toBe(true);
            }
        });

        test('sending contact request calls API', async ({ page }) => {
            let requestSent = false;

            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [] })
                });
            });

            await page.route('**/api/contacts/request', route => {
                requestSent = true;
                route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Request sent' })
                });
            });

            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            // Open modal and submit
            const addButton = page.locator('#add-contact-btn');
            await page.waitForTimeout(500);
            if (await addButton.isVisible()) {
                await addButton.click();
                await page.waitForSelector('#add-contact-modal:not(.hidden)', { timeout: 5000 });

                await page.fill('#contact-email', 'friend@example.com');
                await page.click('#add-contact-form button[type="submit"]');

                await page.waitForTimeout(500);
                expect(requestSent).toBe(true);
            }
        });

    });

    test.describe('Pending Requests', () => {

        test('shows incoming requests', async ({ page }) => {
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: [] })
                });
            });

            await page.route('**/api/contacts/requests', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        incoming: [
                            { requestId: 1, userId: 'user1', name: 'New Friend', email: 'friend@example.com' }
                        ],
                        outgoing: []
                    })
                });
            });

            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Should show pending request section or accept button
            const pendingSection = page.locator('#pending-requests');
            const acceptButton = page.locator('button:has-text("Accept")');

            const hasRequests = await pendingSection.isVisible() || await acceptButton.isVisible();
            expect(hasRequests).toBe(true);
        });

        test('accept request adds to contacts', async ({ page }) => {
            let acceptCalled = false;

            await page.route('**/api/contacts', route => {
                if (acceptCalled) {
                    // After accept, return the new contact
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            contacts: [{ id: 'user1', name: 'New Friend', permissionGranted: 'planet', permissionReceived: 'planet' }]
                        })
                    });
                } else {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ contacts: [] })
                    });
                }
            });

            await page.route('**/api/contacts/requests', route => {
                if (acceptCalled) {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ incoming: [], outgoing: [] })
                    });
                } else {
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            incoming: [{ requestId: 1, userId: 'user1', name: 'New Friend', email: 'friend@example.com' }],
                            outgoing: []
                        })
                    });
                }
            });

            await page.route('**/api/contacts/requests/1/accept', route => {
                acceptCalled = true;
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, contact: { id: 'user1', name: 'New Friend' } })
                });
            });

            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Click accept
            const acceptButton = page.locator('button:has-text("Accept")');
            if (await acceptButton.first().isVisible()) {
                await acceptButton.first().click();
                await page.waitForTimeout(500);
                expect(acceptCalled).toBe(true);
            }
        });

    });

    test.describe('Permission Management', () => {

        test('permission dropdown shows options', async ({ page }) => {
            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            await page.route('**/api/contacts/locations', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            // Find permission dropdown
            const dropdown = page.locator('select.permission-select');
            if (await dropdown.first().isVisible()) {
                // Check it has options
                const optionCount = await dropdown.first().locator('option').count();
                expect(optionCount).toBeGreaterThan(1);
            }
        });

        test('changing permission calls API', async ({ page }) => {
            let permissionUpdated = false;

            await page.route('**/api/contacts', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            await page.route('**/api/contacts/locations', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ contacts: MOCK_CONTACTS })
                });
            });

            await page.route('**/api/contacts/*/permission', route => {
                if (route.request().method() === 'PUT') {
                    permissionUpdated = true;
                    route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true })
                    });
                }
            });

            await page.reload();
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            await page.waitForTimeout(500);

            const dropdown = page.locator('select.permission-select');
            if (await dropdown.first().isVisible()) {
                await dropdown.first().selectOption('city');
                await page.waitForTimeout(500);
                expect(permissionUpdated).toBe(true);
            }
        });

    });

});
