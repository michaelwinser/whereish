// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright configuration for Whereish client tests
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests/client',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: process.env.CI ? 'github' : 'list',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL for navigation */
    baseURL: 'http://localhost:8081',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run local dev server before starting the tests */
  webServer: [
    {
      // Static file server for the PWA client
      command: 'python3 -m http.server 8081 -d app',
      port: 8081,
      reuseExistingServer: !process.env.CI,
    },
    {
      // API server
      command: 'DATABASE_PATH=test_client.db SECRET_KEY=test-secret python3 -m server.app',
      port: 8501,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: '8501',
        FLASK_DEBUG: 'false',
      },
    },
  ],
});
