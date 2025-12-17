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

/* global Model, Events, API, Bind, ViewManager, Storage, Identity, Crypto, Geofence, Toast, BUILD_INFO */

(function() {
    'use strict';

    // ===================
    // State
    // ===================

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

        // Register views with ViewManager
        registerViews();

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
     * Register views with ViewManager for lifecycle management
     */
    function registerViews() {
        ViewManager.register('welcome', {
            onEnter: () => {
                // Update welcome screen with current location if available
                const loc = Model.getLocation();
                if (loc?.hierarchy) {
                    renderWelcomeHierarchy();
                }
            },
            onExit: () => {}
        });

        ViewManager.register('main', {
            onEnter: () => {
                // Refresh data when entering main view
                if (API.isAuthenticated()) {
                    refreshAllData();
                }
            },
            onExit: () => {}
        });

        ViewManager.register('places', {
            onEnter: () => {
                // Trigger places list update
                Events.emit('places:changed', {});
            },
            onExit: () => {}
        });

        ViewManager.register('contact-detail', {
            onEnter: () => {
                // Render contact detail
                renderContactDetail();
            },
            onExit: () => {
                // Clear selected contact
                Model.setSelectedContact(null);
            }
        });

        ViewManager.register('settings', {
            onEnter: () => {
                // Update settings info
                updateSettingsInfo();
            },
            onExit: () => {}
        });

        ViewManager.register('delete-account', {
            onEnter: () => {
                // Clear form when entering
                const passwordInput = document.getElementById('delete-account-password');
                const errorDiv = document.getElementById('delete-account-error');
                if (passwordInput) passwordInput.value = '';
                if (errorDiv) errorDiv.classList.add('hidden');
            },
            onExit: () => {}
        });
    }

    /**
     * Render welcome screen hierarchy
     */
    function renderWelcomeHierarchy() {
        const loc = Model.getLocation();
        const el = document.getElementById('welcome-location');
        if (el && loc?.hierarchy) {
            const parts = [];
            if (loc.hierarchy.neighborhood) parts.push(loc.hierarchy.neighborhood);
            if (loc.hierarchy.city) parts.push(loc.hierarchy.city);
            if (loc.hierarchy.state) parts.push(loc.hierarchy.state);
            el.textContent = parts.join(', ') || 'Unknown location';
        }
    }

    /**
     * Render contact detail view
     */
    function renderContactDetail() {
        const contact = Model.getSelectedContact();
        if (!contact) return;

        const nameEl = document.getElementById('contact-detail-name');
        const locationEl = document.getElementById('contact-detail-location');
        const permissionEl = document.getElementById('detail-permission-select');

        if (nameEl) nameEl.textContent = contact.name || 'Unknown';
        if (locationEl) {
            const locText = Model.getContactLocationText?.(contact) || 'Location unknown';
            locationEl.textContent = locText;
        }
        if (permissionEl && contact.permission) {
            permissionEl.value = contact.permission;
        }
    }

    /**
     * Update settings view info
     */
    function updateSettingsInfo() {
        const userEmail = API.getUserEmail?.() || '--';
        const emailEl = document.getElementById('settings-user-email');
        if (emailEl) emailEl.textContent = userEmail;

        // Update version info
        if (typeof BUILD_INFO !== 'undefined') {
            const versionEl = document.getElementById('settings-version');
            const buildEl = document.getElementById('settings-build');
            if (versionEl) versionEl.textContent = `v${BUILD_INFO.version}`;
            if (buildEl) {
                const buildDate = new Date(BUILD_INFO.buildTime);
                const dateStr = buildDate.toLocaleDateString();
                buildEl.textContent = `${BUILD_INFO.gitCommit} (${dateStr})`;
            }
        }
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
            ViewManager.navigate('main', {}, false);
        } else {
            ViewManager.navigate('welcome', {}, false);
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
     *
     * Note: View visibility is handled by ViewManager, not bindings.
     */
    function setupBindings() {
        // --- Location bar bindings ---
        // Primary shows: named location label OR most specific location level
        Bind.text('#location-bar-primary',
            () => {
                const loc = Model.getLocation();
                const match = Model.getCurrentMatch();

                // Handle loading state
                if (!loc || !loc.hierarchy) {
                    return 'Locating...';
                }

                // If we have a named location match, show its label
                if (match) {
                    return match.label;
                }

                // Otherwise show the most specific location
                return Model.getLocationText(loc.hierarchy);
            },
            ['location:changed', 'location:loading', 'location:match:changed']
        );

        // Secondary shows: actual location when there's a named match, hidden otherwise
        Bind.text('#location-bar-secondary',
            () => {
                const loc = Model.getLocation();
                const match = Model.getCurrentMatch();

                // Only show secondary when we have a match (to show actual location)
                if (!match || !loc?.hierarchy) {
                    return '';
                }

                return Model.getLocationText(loc.hierarchy);
            },
            ['location:changed', 'location:match:changed']
        );

        // Hide secondary when there's no named location match
        Bind.class('#location-bar-secondary', 'hidden',
            () => {
                const match = Model.getCurrentMatch();
                return !match;
            },
            ['location:match:changed', 'location:changed']
        );

        // Location error binding
        Bind.visible('#location-error',
            () => {
                const loc = Model.getLocation();
                return loc?.error ? true : false;
            },
            ['location:error']
        );

        Bind.text('#location-error-text',
            () => {
                const loc = Model.getLocation();
                return loc?.error || '';
            },
            ['location:error']
        );

        // --- Welcome screen location binding ---
        Bind.text('#welcome-location',
            () => {
                const loc = Model.getLocation();
                if (!loc?.hierarchy) return '';
                return Model.getLocationText(loc.hierarchy);
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
     * Navigation uses ViewManager for proper history management.
     */
    function setupEventHandlers() {
        // Tab navigation
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                const viewName = tab.dataset.tab;
                ViewManager.navigate(viewName);
            });
        });

        // Settings button
        document.getElementById('settings-btn')?.addEventListener('click', () => {
            ViewManager.navigate('settings');
        });

        // Back buttons - use ViewManager.goBack() for proper history
        document.getElementById('settings-back-btn')?.addEventListener('click', () => {
            ViewManager.goBack();
        });

        document.getElementById('contact-detail-back-btn')?.addEventListener('click', () => {
            ViewManager.goBack();
        });

        document.getElementById('delete-account-back-btn')?.addEventListener('click', () => {
            ViewManager.goBack();
        });

        document.getElementById('delete-account-cancel-btn')?.addEventListener('click', () => {
            ViewManager.goBack();
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close modals first, then navigate back
                const openModal = document.querySelector('.modal:not(.hidden)');
                if (openModal) {
                    openModal.classList.add('hidden');
                } else if (ViewManager.canGoBack()) {
                    ViewManager.goBack();
                }
            }
        });
    }

    // ===================
    // Controller Actions
    // ===================

    /**
     * Handle contact click - navigate to contact detail view
     */
    function handleContactClick(contactId) {
        const contacts = Model.getContacts();
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
            Model.setSelectedContact(contact);
            ViewManager.navigate('contact-detail', { contactId });
        }
    }

    /**
     * Handle logout - clear auth and return to welcome
     */
    async function handleLogout() {
        try {
            await API.logout();
            ViewManager.navigate('welcome');
        } catch (e) {
            console.error('[v2] Logout failed:', e);
            Toast.error('Logout failed');
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

            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            // Geocode coordinates
            const hierarchy = await Geofence.geocodeLocation(lat, lon);

            // Update location in Model
            Model.setLocation({
                hierarchy,
                latitude: lat,
                longitude: lon,
                timestamp: new Date().toISOString()
            });

            // Check for named location match
            const places = Model.getPlaces();
            const match = Geofence.findMatchingPlace(lat, lon, places);
            Model.setCurrentMatch(match);

            // Publish location to server if authenticated
            if (API.isAuthenticated()) {
                try {
                    await API.publishLocationEncrypted({
                        hierarchy,
                        latitude: lat,
                        longitude: lon,
                        namedLocation: match?.label || null,
                        timestamp: new Date().toISOString()
                    });
                } catch (pubErr) {
                    console.warn('[v2] Failed to publish location:', pubErr);
                }
            }
        } catch (e) {
            console.error('[v2] Location refresh failed:', e);
            Model.setLocationError(e.message);
            Toast.error('Failed to get location: ' + e.message);
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
        refreshAllData,
        getBindingCount: () => Bind.getBindingCount(),
        navigate: ViewManager.navigate,
        goBack: ViewManager.goBack
    };

})();
