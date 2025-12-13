// @ts-check
const { test, expect, setupMinimalMocks } = require('../fixtures/test-helpers');

/**
 * ViewManager Module Tests
 *
 * Tests for navigation state machine and view management.
 */

test.describe('ViewManager Module', () => {

    test.beforeEach(async ({ page }) => {
        // Set up mocks BEFORE navigating to the page
        await setupMinimalMocks(page);
        await page.goto('/');
        await page.waitForFunction(() => typeof ViewManager !== 'undefined');
    });

    test.describe('View Navigation', () => {

        test('navigate shows target view', async ({ page }) => {
            const result = await page.evaluate(() => {
                ViewManager.navigate('places');
                const placesView = document.querySelector('[data-view="places"]');
                return !placesView.classList.contains('hidden');
            });

            expect(result).toBe(true);
        });

        test('navigate hides current view', async ({ page }) => {
            const result = await page.evaluate(() => {
                // Start at main
                ViewManager.navigate('main');
                // Navigate to places
                ViewManager.navigate('places');

                const mainView = document.querySelector('[data-view="main"]');
                return mainView.classList.contains('hidden');
            });

            expect(result).toBe(true);
        });

        test('navigate calls onExit callback', async ({ page }) => {
            const exitCalled = await page.evaluate(() => {
                let called = false;
                ViewManager.register('main', {
                    onExit: () => { called = true; }
                });

                ViewManager.navigate('main');
                ViewManager.navigate('places');

                return called;
            });

            expect(exitCalled).toBe(true);
        });

        test('navigate calls onEnter callback', async ({ page }) => {
            const enterCalled = await page.evaluate(() => {
                let called = false;
                ViewManager.register('places', {
                    onEnter: () => { called = true; }
                });

                ViewManager.navigate('places');

                return called;
            });

            expect(enterCalled).toBe(true);
        });

        test('onEnter receives params', async ({ page }) => {
            const receivedParams = await page.evaluate(() => {
                let params = null;
                ViewManager.register('settings', {
                    onEnter: (p) => { params = p; }
                });

                ViewManager.navigate('settings', { userId: '123' });

                return params;
            });

            expect(receivedParams).toEqual({ userId: '123' });
        });

        test('getCurrentView returns current view name', async ({ page }) => {
            const viewName = await page.evaluate(() => {
                ViewManager.navigate('places');
                return ViewManager.getCurrentView();
            });

            expect(viewName).toBe('places');
        });

    });

    test.describe('History Management', () => {

        test('tab navigation clears history', async ({ page }) => {
            const canGoBack = await page.evaluate(() => {
                // Navigate to non-tab view first
                ViewManager.navigate('settings');
                // Then to tab view
                ViewManager.navigate('main');

                return ViewManager.canGoBack();
            });

            // Tab views clear history, so can't go back further than main
            // canGoBack returns true because we can go to main from non-main
            // But after navigating to main, history is cleared
            expect(canGoBack).toBe(false);
        });

        test('non-tab navigation adds to history', async ({ page }) => {
            const canGoBack = await page.evaluate(() => {
                ViewManager.navigate('main');
                ViewManager.navigate('settings');

                return ViewManager.canGoBack();
            });

            expect(canGoBack).toBe(true);
        });

        test('goBack returns to previous view', async ({ page }) => {
            const result = await page.evaluate(() => {
                ViewManager.navigate('main');
                ViewManager.navigate('settings');
                ViewManager.goBack();

                return ViewManager.getCurrentView();
            });

            expect(result).toBe('main');
        });

        test('goBack returns true when navigated', async ({ page }) => {
            const result = await page.evaluate(() => {
                ViewManager.navigate('main');
                ViewManager.navigate('settings');
                return ViewManager.goBack();
            });

            expect(result).toBe(true);
        });

        test('goBack to main when no history', async ({ page }) => {
            const result = await page.evaluate(() => {
                ViewManager.navigate('settings');
                // Clear any history that might exist
                ViewManager.navigate('main');
                ViewManager.navigate('settings');
                ViewManager.goBack();  // Goes back to main

                // Now at main with no history
                return {
                    currentView: ViewManager.getCurrentView(),
                    couldGoBack: ViewManager.goBack()
                };
            });

            expect(result.currentView).toBe('main');
            // goBack from main when already at main returns false
            expect(result.couldGoBack).toBe(false);
        });

        test('canGoBack returns correct state', async ({ page }) => {
            const results = await page.evaluate(() => {
                ViewManager.navigate('main');
                const atMain = ViewManager.canGoBack();

                ViewManager.navigate('settings');
                const atSettings = ViewManager.canGoBack();

                return { atMain, atSettings };
            });

            expect(results.atMain).toBe(false);
            expect(results.atSettings).toBe(true);
        });

    });

    test.describe('Tab Bar', () => {

        test('tab bar shows on tab views', async ({ page }) => {
            const visible = await page.evaluate(() => {
                ViewManager.navigate('main');
                const tabBar = document.getElementById('tab-bar');
                return tabBar && !tabBar.classList.contains('hidden');
            });

            expect(visible).toBe(true);
        });

        test('tab bar hidden on non-tab views', async ({ page }) => {
            const hidden = await page.evaluate(() => {
                ViewManager.navigate('settings');
                const tabBar = document.getElementById('tab-bar');
                return tabBar && tabBar.classList.contains('hidden');
            });

            expect(hidden).toBe(true);
        });

        test('active tab state updates', async ({ page }) => {
            const activeTab = await page.evaluate(() => {
                ViewManager.navigate('places');
                const tabBar = document.getElementById('tab-bar');
                if (!tabBar) return null;

                const activeItem = tabBar.querySelector('.tab-item.active');
                return activeItem ? activeItem.dataset.tab : null;
            });

            expect(activeTab).toBe('places');
        });

        test('aria-selected updates for accessibility', async ({ page }) => {
            const ariaSelected = await page.evaluate(() => {
                ViewManager.navigate('places');
                const tabBar = document.getElementById('tab-bar');
                if (!tabBar) return null;

                const placesTab = tabBar.querySelector('[data-tab="places"]');
                return placesTab ? placesTab.getAttribute('aria-selected') : null;
            });

            expect(ariaSelected).toBe('true');
        });

    });

    test.describe('Utility Functions', () => {

        test('isTabView returns true for tab views', async ({ page }) => {
            const results = await page.evaluate(() => {
                return {
                    main: ViewManager.isTabView('main'),
                    places: ViewManager.isTabView('places'),
                    circles: ViewManager.isTabView('circles')
                };
            });

            expect(results.main).toBe(true);
            expect(results.places).toBe(true);
            expect(results.circles).toBe(true);
        });

        test('isTabView returns false for non-tab views', async ({ page }) => {
            const results = await page.evaluate(() => {
                return {
                    settings: ViewManager.isTabView('settings'),
                    login: ViewManager.isTabView('login'),
                    unknown: ViewManager.isTabView('nonexistent')
                };
            });

            expect(results.settings).toBe(false);
            expect(results.login).toBe(false);
            expect(results.unknown).toBe(false);
        });

    });

    test.describe('Edge Cases', () => {

        test('navigate to non-existent view does nothing', async ({ page }) => {
            const result = await page.evaluate(() => {
                ViewManager.navigate('main');
                const before = ViewManager.getCurrentView();

                ViewManager.navigate('nonexistent-view');

                const after = ViewManager.getCurrentView();
                return { before, after };
            });

            expect(result.before).toBe('main');
            expect(result.after).toBe('main');
        });

        test('multiple navigations work correctly', async ({ page }) => {
            const history = await page.evaluate(() => {
                const views = [];

                ViewManager.navigate('main');
                views.push(ViewManager.getCurrentView());

                ViewManager.navigate('places');
                views.push(ViewManager.getCurrentView());

                ViewManager.navigate('settings');
                views.push(ViewManager.getCurrentView());

                ViewManager.goBack();
                views.push(ViewManager.getCurrentView());

                return views;
            });

            expect(history).toEqual(['main', 'places', 'settings', 'places']);
        });

    });

});
