/**
 * Whereish - View Manager Module
 * Handles screen navigation and history
 */
const ViewManager = (function() {
    'use strict';

    // ===================
    // State
    // ===================

    let currentView = null;
    let history = [];
    const views = {};

    // Views that are tab-based (don't add to history when switching between them)
    const TAB_VIEWS = ['main', 'places', 'circles'];

    // ===================
    // Public API
    // ===================

    /**
     * Register a view with optional lifecycle callbacks
     * @param {string} viewName - Unique view identifier matching data-view attribute
     * @param {Object} callbacks - Optional { onEnter: fn(params), onExit: fn() }
     */
    function register(viewName, callbacks) {
        views[viewName] = callbacks || {};
    }

    /**
     * Navigate to a view
     * @param {string} viewName - View to navigate to
     * @param {Object} params - Optional parameters to pass to onEnter
     * @param {boolean} addToHistory - Whether to add current view to history stack
     */
    function navigate(viewName, params = {}, addToHistory = true) {
        const newEl = document.querySelector(`[data-view="${viewName}"]`);
        if (!newEl) {
            console.warn(`ViewManager: View "${viewName}" not found`);
            return;
        }

        // Hide current view
        if (currentView) {
            const oldEl = document.querySelector(`[data-view="${currentView}"]`);
            if (oldEl) {
                oldEl.classList.add('hidden');
            }
            // Call onExit callback
            if (views[currentView]?.onExit) {
                views[currentView].onExit();
            }
        }

        // Add to history if navigating from a non-tab view to another view
        // (Tab switches don't add to history)
        if (addToHistory && currentView && !TAB_VIEWS.includes(viewName)) {
            history.push({ view: currentView, params: {} });
        }

        // Clear history when navigating to a tab view (fresh start)
        if (TAB_VIEWS.includes(viewName)) {
            history = [];
        }

        // Show new view
        newEl.classList.remove('hidden');

        // Call onEnter callback
        if (views[viewName]?.onEnter) {
            views[viewName].onEnter(params);
        }

        currentView = viewName;
        updateTabBar();

        // Update browser history (for back button support)
        if (addToHistory) {
            window.history.pushState({ view: viewName }, '', `#${viewName}`);
        }
    }

    /**
     * Navigate back to previous view
     * @returns {boolean} True if navigated back, false if no history
     */
    function goBack() {
        if (history.length > 0) {
            const prev = history.pop();
            navigate(prev.view, prev.params, false);
            return true;
        }
        // If no history, go to main view
        if (currentView !== 'main') {
            navigate('main', {}, false);
            return true;
        }
        return false;
    }

    /**
     * Update tab bar state (active tab, visibility)
     */
    function updateTabBar() {
        const tabBar = document.getElementById('tab-bar');
        if (!tabBar) return;

        // Show tab bar only on tab views
        if (TAB_VIEWS.includes(currentView)) {
            tabBar.classList.remove('hidden');
        } else {
            tabBar.classList.add('hidden');
        }

        // Update active tab and aria-selected
        tabBar.querySelectorAll('.tab-item').forEach(tab => {
            const isActive = tab.dataset.tab === currentView;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    /**
     * Get current view name
     * @returns {string|null}
     */
    function getCurrentView() {
        return currentView;
    }

    /**
     * Check if can go back
     * @returns {boolean}
     */
    function canGoBack() {
        return history.length > 0 || (currentView !== 'main' && currentView !== null);
    }

    /**
     * Check if a view is a tab view
     * @param {string} viewName
     * @returns {boolean}
     */
    function isTabView(viewName) {
        return TAB_VIEWS.includes(viewName);
    }

    // ===================
    // Browser History Integration
    // ===================

    // Handle browser back button
    window.addEventListener('popstate', (event) => {
        if (event.state?.view) {
            navigate(event.state.view, {}, false);
        }
    });

    // ===================
    // Export Public API
    // ===================

    return {
        register,
        navigate,
        goBack,
        getCurrentView,
        canGoBack,
        isTabView,
        updateTabBar
    };
})();
