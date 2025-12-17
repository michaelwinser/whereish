/**
 * Whereish v2 Application Controller
 *
 * Re-implementation using the custom binding pattern for cleaner MVC separation.
 * This file orchestrates:
 * - Initialization and module loading
 * - Declarative UI bindings (View layer)
 * - Event handler setup (Controller layer)
 *
 * Key principle: NO manual DOM updates here. All rendering is declarative via Bind.
 *
 * Dependencies (loaded before this file):
 * - Model (app/model.js)
 * - Events (app/events.js)
 * - API (app/api.js)
 * - Bind (app/v2/bind.js)
 * - Render modules (app/v2/render/*.js)
 * - Handler modules (app/v2/handlers/*.js)
 */

/* global Model, Events, API, Bind, ViewManager, Storage, Identity, Crypto, Geofence, Toast */

(function() {
    'use strict';

    // ===================
    // State
    // ===================

    // Track current view for navigation
    let currentView = 'welcome';

    // Cache for DOM elements
    const elements = {};

    // ===================
    // Initialization
    // ===================

    /**
     * Initialize the v2 application
     */
    async function init() {
        console.log('[v2] Initializing...');

        // Cache DOM elements
        cacheElements();

        // Enable debug logging during development
        Bind.setDebug(true);

        // Set up declarative bindings (View layer)
        setupBindings();

        // Connect bindings to Events (the reactive backbone)
        Bind.connect(Events);

        // Set up event handlers (Controller layer)
        setupEventHandlers();

        // Initial app state check
        await checkInitialState();

        console.log('[v2] Initialized with', Bind.getBindingCount(), 'bindings');
    }

    /**
     * Cache frequently used DOM elements
     */
    function cacheElements() {
        elements.welcomeView = document.querySelector('[data-view="welcome"]');
        elements.mainView = document.querySelector('[data-view="main"]');
        elements.settingsView = document.querySelector('[data-view="settings"]');
        elements.placesView = document.querySelector('[data-view="places"]');
        elements.contactDetailView = document.querySelector('[data-view="contact-detail"]');
        elements.tabBar = document.getElementById('tab-bar');
        elements.contactsList = document.getElementById('contacts-list');
        elements.placesList = document.getElementById('places-list');
        elements.locationBarPrimary = document.getElementById('location-bar-primary');
        elements.locationBarSecondary = document.getElementById('location-bar-secondary');
    }

    /**
     * Check initial authentication state and show appropriate view
     */
    async function checkInitialState() {
        if (API.isAuthenticated()) {
            showView('main');
            // Refresh data
            await refreshAllData();
        } else {
            showView('welcome');
        }
    }

    /**
     * Refresh all data from server
     */
    async function refreshAllData() {
        try {
            // These will trigger events that update bindings
            await API.getContactsEncrypted();
            await API.getContactRequests();
        } catch (e) {
            console.error('[v2] Failed to refresh data:', e);
        }
    }

    // ===================
    // View Layer: Bindings
    // ===================

    /**
     * Set up declarative bindings
     *
     * This is where we define WHAT to render, not WHEN.
     * Bindings automatically update when Events emits relevant events.
     */
    function setupBindings() {
        // --- View visibility bindings ---
        Bind.visible('[data-view="welcome"]',
            () => currentView === 'welcome',
            ['auth:changed']
        );

        Bind.visible('[data-view="main"]',
            () => currentView === 'main',
            ['auth:changed']
        );

        Bind.visible('#tab-bar',
            () => currentView === 'main' || currentView === 'places',
            ['auth:changed']
        );

        // --- Location bar bindings ---
        Bind.text('#location-bar-primary',
            () => {
                const loc = Model.getLocation();
                if (!loc || !loc.hierarchy) return 'Locating...';
                return loc.hierarchy.neighborhood || loc.hierarchy.city || loc.hierarchy.state || 'Unknown';
            },
            ['location:changed', 'location:loading']
        );

        Bind.text('#location-bar-secondary',
            () => {
                const loc = Model.getLocation();
                if (!loc || !loc.hierarchy) return '';
                const parts = [];
                if (loc.hierarchy.city) parts.push(loc.hierarchy.city);
                if (loc.hierarchy.state) parts.push(loc.hierarchy.state);
                return parts.join(', ');
            },
            ['location:changed']
        );

        // --- Contacts list binding ---
        // Note: renderContactsList is defined in render/contacts.js
        // For now, use a simple placeholder
        Bind.html('#contacts-list',
            () => renderContactsList(),
            ['contacts:changed']
        );

        // --- Places list binding ---
        Bind.html('#places-list',
            () => renderPlacesList(),
            ['places:changed']
        );

        // --- Server status binding ---
        Bind.class('#server-status', 'connected',
            () => Model.isServerConnected(),
            ['server:status:changed']
        );

        Bind.class('#server-status', 'hidden',
            () => Model.isServerConnected(),
            ['server:status:changed']
        );
    }

    // ===================
    // Render Functions
    // ===================

    /**
     * Render the contacts list
     * TODO: Move to render/contacts.js
     */
    function renderContactsList() {
        const contacts = Model.getContacts();

        if (!contacts || contacts.length === 0) {
            return '<p class="empty-state">No contacts yet</p>';
        }

        return contacts.map(contact => {
            const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?';
            const locationText = Model.getContactLocationText ? Model.getContactLocationText(contact) : 'Unknown';

            return `
                <div class="contact-item contact-item-simple" data-id="${escapeHtml(contact.id)}">
                    <div class="contact-avatar">${escapeHtml(initial)}</div>
                    <div class="contact-info">
                        <div class="contact-name">${escapeHtml(contact.name)}</div>
                        <div class="contact-location">${escapeHtml(locationText)}</div>
                    </div>
                    <div class="contact-chevron">&rsaquo;</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Render the places list
     * TODO: Move to render/places.js
     */
    function renderPlacesList() {
        const places = Model.getPlaces();

        if (!places || places.length === 0) {
            return '<p class="empty-state">No named locations yet</p>';
        }

        return places.map(place => {
            const isActive = false; // TODO: check against current location

            return `
                <div class="named-location-item ${isActive ? 'active' : ''}" data-id="${escapeHtml(place.id)}">
                    <div class="named-location-name">${escapeHtml(place.label)}</div>
                    <div class="named-location-radius">${place.radiusMeters}m radius</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ===================
    // Controller Layer: Event Handlers
    // ===================

    /**
     * Set up event handlers
     *
     * These handle user interactions and translate them to Model operations.
     * NO direct DOM manipulation here - just Model updates.
     */
    function setupEventHandlers() {
        // Tab navigation
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                const viewName = tab.dataset.tab;
                showView(viewName);
            });
        });

        // Settings button
        document.getElementById('settings-btn')?.addEventListener('click', () => {
            showView('settings');
        });

        // Back buttons
        document.getElementById('settings-back-btn')?.addEventListener('click', () => {
            showView('main');
        });

        // Logout button
        document.getElementById('settings-logout-btn')?.addEventListener('click', handleLogout);

        // Contact item clicks (delegated)
        elements.contactsList?.addEventListener('click', (e) => {
            const contactItem = e.target.closest('.contact-item');
            if (contactItem) {
                const contactId = contactItem.dataset.id;
                handleContactClick(contactId);
            }
        });

        // Refresh location button
        document.getElementById('refresh-location-btn')?.addEventListener('click', handleRefreshLocation);
    }

    // ===================
    // Controller Actions
    // ===================

    /**
     * Show a view by name
     */
    function showView(viewName) {
        currentView = viewName;

        // Hide all views
        document.querySelectorAll('[data-view]').forEach(view => {
            view.classList.add('hidden');
        });

        // Show target view
        const targetView = document.querySelector(`[data-view="${viewName}"]`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }

        // Update tab bar visibility
        const showTabBar = ['main', 'places'].includes(viewName);
        elements.tabBar?.classList.toggle('hidden', !showTabBar);

        // Update active tab
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === viewName);
        });

        // Trigger binding updates
        Events.emit('auth:changed', {});
    }

    /**
     * Handle contact click
     */
    function handleContactClick(contactId) {
        const contacts = Model.getContacts();
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
            Model.setSelectedContact(contact);
            showView('contact-detail');
        }
    }

    /**
     * Handle logout
     */
    async function handleLogout() {
        try {
            await API.logout();
            showView('welcome');
        } catch (e) {
            console.error('[v2] Logout failed:', e);
        }
    }

    /**
     * Handle location refresh
     */
    async function handleRefreshLocation() {
        Model.setLocationLoading(true);
        try {
            // Get current position
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000
                });
            });

            // Geocode coordinates
            const hierarchy = await Geofence.geocodeLocation(
                position.coords.latitude,
                position.coords.longitude
            );

            Model.setLocation({
                hierarchy,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            console.error('[v2] Location refresh failed:', e);
            Model.setLocationError(e.message);
        }
    }

    // ===================
    // Bootstrap
    // ===================

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging
    window.V2App = {
        showView,
        refreshAllData,
        getBindingCount: () => Bind.getBindingCount()
    };

})();
