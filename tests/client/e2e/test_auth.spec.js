// @ts-check
const { test, expect, setupMinimalMocks, setAuthToken, clearAuth, MOCK_USER } = require('../fixtures/test-helpers');

/**
 * Authentication E2E Tests
 *
 * Tests for login, registration, and logout flows.
 * Note: The app uses a welcome view with an auth modal, not separate login/register views.
 */

test.describe('Authentication Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Set up mocks BEFORE navigating to the page
        await setupMinimalMocks(page);
        await page.goto('/');
        await clearAuth(page);
        await page.reload();
    });

    test.describe('Welcome Screen', () => {

        test('shows welcome screen when not authenticated', async ({ page }) => {
            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            const welcomeVisible = await page.locator('[data-view="welcome"]').isVisible();
            expect(welcomeVisible).toBe(true);
        });

        test('welcome screen has login and signup buttons', async ({ page }) => {
            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });

            const loginBtn = page.locator('#welcome-login-btn');
            const signupBtn = page.locator('#welcome-signup-btn');

            await expect(loginBtn).toBeVisible();
            await expect(signupBtn).toBeVisible();
        });

        test('login button opens auth modal', async ({ page }) => {
            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });

            await page.click('#welcome-login-btn');

            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });
            const modalVisible = await page.locator('#auth-modal').isVisible();
            expect(modalVisible).toBe(true);
        });

    });

    test.describe('Login', () => {

        test('auth modal has required fields', async ({ page }) => {
            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            await page.click('#welcome-login-btn');
            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });

            const emailInput = page.locator('#auth-email');
            const passwordInput = page.locator('#auth-password');
            const submitButton = page.locator('#auth-submit-btn');

            await expect(emailInput).toBeVisible();
            await expect(passwordInput).toBeVisible();
            await expect(submitButton).toBeVisible();
        });

        test('successful login redirects to main view', async ({ page }) => {
            // Mock login endpoint (with identity info)
            await page.route('**/api/auth/login', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        user: MOCK_USER,
                        token: 'test-token',
                        hasPublicKey: false,  // No existing key, will create new identity
                        publicKey: null
                    })
                });
            });
            // Mock /api/me for post-login user fetch
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(MOCK_USER)
                });
            });
            // Mock identity registration endpoint
            await page.route('**/api/identity/register', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true })
                });
            });

            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            await page.click('#welcome-login-btn');
            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });

            await page.fill('#auth-email', 'test@example.com');
            await page.fill('#auth-password', 'password123');
            await page.click('#auth-submit-btn');

            // Should navigate to main view
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            const mainVisible = await page.locator('[data-view="main"]').isVisible();
            expect(mainVisible).toBe(true);
        });

        test('failed login shows error message', async ({ page }) => {
            await page.route('**/api/auth/login', route => {
                route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Invalid email or password' })
                });
            });

            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            await page.click('#welcome-login-btn');
            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });

            await page.fill('#auth-email', 'wrong@example.com');
            await page.fill('#auth-password', 'wrongpassword');
            await page.click('#auth-submit-btn');

            // Should show error and stay on modal
            await page.waitForTimeout(500);
            const modalStillVisible = await page.locator('#auth-modal').isVisible();
            expect(modalStillVisible).toBe(true);
        });

    });

    test.describe('Registration', () => {

        test('can switch to registration form', async ({ page }) => {
            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            await page.click('#welcome-signup-btn');
            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });

            // Name field should be visible for registration
            const nameInput = page.locator('#auth-name');
            const nameGroup = page.locator('#auth-name-group');
            // Check if name field is visible (registration mode shows it)
            await page.waitForTimeout(200);
            const nameVisible = await nameGroup.isVisible();
            expect(nameVisible).toBe(true);
        });

        test('successful registration logs user in', async ({ page }) => {
            await page.route('**/api/auth/register', route => {
                route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        user: { ...MOCK_USER, name: 'New User' },
                        token: 'new-user-token'
                    })
                });
            });
            // Mock /api/me for post-registration user fetch
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ...MOCK_USER, name: 'New User' })
                });
            });
            // Mock identity registration endpoint
            await page.route('**/api/identity/register', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true })
                });
            });

            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            await page.click('#welcome-signup-btn');
            await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 5000 });

            await page.fill('#auth-name', 'New User');
            await page.fill('#auth-email', 'new@example.com');
            await page.fill('#auth-password', 'password123');
            await page.fill('#auth-confirm-password', 'password123');
            await page.click('#auth-submit-btn');

            // Should navigate to main view
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });
            const mainVisible = await page.locator('[data-view="main"]').isVisible();
            expect(mainVisible).toBe(true);
        });

    });

    test.describe('Logout', () => {

        test('logout returns to welcome screen', async ({ page }) => {
            // Mock /api/me for authenticated startup
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(MOCK_USER)
                });
            });

            // Start authenticated
            await setAuthToken(page, 'test-token');
            await page.reload();

            // Should be at main view
            await page.waitForSelector('[data-view="main"]:not(.hidden)', { timeout: 5000 });

            // Navigate to settings and logout
            await page.click('#settings-btn');
            await page.waitForSelector('[data-view="settings"]:not(.hidden)', { timeout: 5000 });

            // Click logout
            await page.click('#settings-logout-btn');

            // Should be back at welcome
            await page.waitForSelector('[data-view="welcome"]:not(.hidden)', { timeout: 5000 });
            const welcomeVisible = await page.locator('[data-view="welcome"]').isVisible();
            expect(welcomeVisible).toBe(true);
        });

        test('logout clears stored token', async ({ page }) => {
            await setAuthToken(page, 'test-token');
            await page.reload();

            // Verify token exists
            const tokenBefore = await page.evaluate(() =>
                localStorage.getItem('whereish_auth_token')
            );
            expect(tokenBefore).toBe('test-token');

            // Wait for page to load
            await page.waitForFunction(() => typeof API !== 'undefined');

            // Call logout via API
            await page.evaluate(() => API.logout());

            const tokenAfter = await page.evaluate(() =>
                localStorage.getItem('whereish_auth_token')
            );
            expect(tokenAfter).toBeNull();
        });

    });

    test.describe('Session Persistence', () => {

        test('authenticated user stays logged in on refresh', async ({ page }) => {
            await setAuthToken(page, 'persistent-token');

            // Mock API for authenticated view
            await page.route('**/api/me', route => {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(MOCK_USER)
                });
            });

            await page.reload();

            // Wait for app to load
            await page.waitForFunction(() => typeof API !== 'undefined');

            // Should not show welcome
            await page.waitForTimeout(500);
            const isAuth = await page.evaluate(() => API.isAuthenticated());
            expect(isAuth).toBe(true);
        });

    });

});
