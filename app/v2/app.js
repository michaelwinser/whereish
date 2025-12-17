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

/* global Model, Events, API, Bind, ViewManager, Storage, Identity, Crypto, Geofence, Toast, ConfirmModal, BUILD_INFO */
/* global renderContactsList, renderIncomingRequests, renderOutgoingRequests, renderPlacesList */
/* global handleContactClick, handleAcceptRequest, handleDeclineRequest, handleAddContact, handleRemoveContact, handlePermissionChange */

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

        // Initialize Google Sign-In
        initGoogleSignIn();

        console.log('[v2] Initialized with', Bind.getBindingCount(), 'bindings');
    }

    // ===================
    // Google Sign-In
    // ===================

    // Track pending OAuth user for PIN setup
    let pendingOAuthUser = null;

    /**
     * Initialize Google Identity Services
     */
    function initGoogleSignIn() {
        // Check if GIS is loaded
        if (typeof google === 'undefined' || !google.accounts) {
            console.log('[v2] Google Identity Services not loaded - offline or blocked');
            return;
        }

        // Get client ID from meta tag
        const clientId = document.querySelector('meta[name="google-client-id"]')?.content;
        if (!clientId) {
            console.log('[v2] Google Client ID not configured');
            return;
        }

        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCallback,
            auto_select: false,
            use_fedcm_for_prompt: true
        });

        // Render the Google Sign-In button
        const buttonContainer = document.getElementById('google-signin-container');
        if (buttonContainer) {
            google.accounts.id.renderButton(buttonContainer, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                width: 280
            });
            // Hide fallback button if Google's button was rendered
            requestAnimationFrame(() => {
                const fallbackBtn = document.getElementById('google-signin-btn');
                if (buttonContainer.children.length > 0 && fallbackBtn) {
                    fallbackBtn.style.display = 'none';
                }
            });
        }

        console.log('[v2] Google Sign-In initialized');
    }

    /**
     * Handle Google Sign-In button click (fallback)
     */
    function handleGoogleSignIn() {
        if (typeof google === 'undefined' || !google.accounts) {
            Toast.error('Google Sign-In not available');
            return;
        }
        google.accounts.id.prompt();
    }

    /**
     * Handle Google OAuth callback
     */
    async function handleGoogleCallback(response) {
        try {
            const idToken = response.credential;
            if (!idToken) {
                throw new Error('No credential received from Google');
            }

            Toast.info('Signing in...');

            const result = await API.authGoogle(idToken);

            if (result.isNew) {
                // New user - need to set up PIN
                pendingOAuthUser = {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name
                };
                showPinSetupModal();
            } else if (result.needsPin) {
                // Existing user with encrypted identity - need PIN
                pendingOAuthUser = {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name,
                    encryptedIdentity: result.encryptedIdentity
                };
                showPinEntryModal();
            } else {
                // Returning user with local identity
                await completeLogin(result.user);
            }
        } catch (e) {
            console.error('[v2] Google auth failed:', e);
            Toast.error('Sign in failed: ' + e.message);
        }
    }

    /**
     * Complete login after authentication
     */
    async function completeLogin(user) {
        Model.setCurrentUserId(user.id);
        Toast.success(`Welcome, ${user.name || user.email}!`);
        ViewManager.navigate('main');
        await refreshAllData();
    }

    /**
     * Show PIN setup modal (placeholder - uses v1 modal)
     */
    function showPinSetupModal() {
        const modal = document.getElementById('pin-setup-modal');
        if (modal) {
            modal.classList.remove('hidden');
        } else {
            console.warn('[v2] PIN setup modal not found');
            Toast.warning('PIN setup required but modal not available');
        }
    }

    /**
     * Show PIN entry modal (placeholder - uses v1 modal)
     */
    function showPinEntryModal() {
        const modal = document.getElementById('pin-entry-modal');
        if (modal) {
            modal.classList.remove('hidden');
        } else {
            console.warn('[v2] PIN entry modal not found');
            Toast.warning('PIN entry required but modal not available');
        }
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
        // Check server health first
        await checkServerHealth();

        if (API.isAuthenticated()) {
            ViewManager.navigate('main', {}, false);
            // Trigger location refresh for authenticated users
            handleRefreshLocation();
        } else {
            ViewManager.navigate('welcome', {}, false);
            // Still try to get location for welcome screen
            handleRefreshLocation();
        }
    }

    /**
     * Check server health and update status indicator
     */
    async function checkServerHealth() {
        try {
            const healthy = await API.checkHealth();
            updateServerStatus(healthy);
        } catch (e) {
            console.error('[v2] Health check failed:', e);
            updateServerStatus(false);
        }
    }

    /**
     * Update server status UI
     */
    function updateServerStatus(connected) {
        Model.setServerConnected(connected);

        const statusEl = document.getElementById('server-status');
        const iconEl = statusEl?.querySelector('.server-status-icon');
        const textEl = statusEl?.querySelector('.server-status-text');
        const contactsSection = document.getElementById('contacts-section');

        if (!statusEl) return;

        if (connected) {
            statusEl.classList.add('connected');
            statusEl.classList.add('hidden');
            if (iconEl) iconEl.textContent = '✓';
            if (textEl) textEl.textContent = 'Connected to server';

            // Show contacts section when connected AND authenticated
            if (API.isAuthenticated() && contactsSection) {
                contactsSection.classList.remove('hidden');
            }
        } else {
            statusEl.classList.remove('connected');
            statusEl.classList.remove('hidden');
            if (iconEl) iconEl.textContent = '⚠️';
            if (textEl) textEl.textContent = 'Backend server not connected';

            // Hide contacts section when server not connected
            contactsSection?.classList.add('hidden');
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

        // Location error binding (uses #error-message element)
        Bind.visible('#error-message',
            () => {
                const loc = Model.getLocation();
                return loc?.error ? true : false;
            },
            ['location:error', 'location:changed']
        );

        Bind.text('#error-message .error-text',
            () => {
                const loc = Model.getLocation();
                return loc?.error || '';
            },
            ['location:error']
        );

        // --- Welcome screen location binding (class selector) ---
        Bind.text('.welcome-location',
            () => {
                const loc = Model.getLocation();
                if (!loc?.hierarchy) return '';
                return Model.getLocationText(loc.hierarchy);
            },
            ['location:changed']
        );

        // --- Contacts list binding ---
        Bind.html('#contacts-list',
            () => renderContactsList(),
            ['contacts:changed', 'location:changed']
        );

        // --- Contact requests bindings ---
        Bind.html('#incoming-requests',
            () => renderIncomingRequests(),
            ['contacts:requests:changed']
        );

        Bind.html('#outgoing-requests',
            () => renderOutgoingRequests(),
            ['contacts:requests:changed']
        );

        // Show pending requests section when there are requests
        Bind.visible('#pending-requests',
            () => {
                const requests = Model.getContactRequests();
                return (requests?.incoming?.length > 0) || (requests?.outgoing?.length > 0);
            },
            ['contacts:requests:changed']
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
    // Render functions are in v2/render/*.js modules

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

        // Google Sign-In fallback button
        document.getElementById('google-signin-btn')?.addEventListener('click', handleGoogleSignIn);

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

        // Settings buttons
        document.getElementById('export-identity-btn')?.addEventListener('click', handleExportIdentity);
        document.getElementById('delete-account-btn')?.addEventListener('click', () => {
            ViewManager.navigate('delete-account');
        });
        document.getElementById('delete-account-form')?.addEventListener('submit', handleDeleteAccountSubmit);

        // Transfer device button
        document.getElementById('transfer-device-btn')?.addEventListener('click', handleTransferDevice);

        // Contact item clicks (delegated)
        elements.contactsList?.addEventListener('click', (e) => {
            const contactItem = e.target.closest('.contact-item');
            if (contactItem) {
                const contactId = contactItem.dataset.id;
                handleContactClick(contactId);
            }
        });

        // Contact request buttons (delegated)
        document.getElementById('incoming-requests')?.addEventListener('click', async (e) => {
            const acceptBtn = e.target.closest('.accept-request-btn');
            const declineBtn = e.target.closest('.decline-request-btn');

            if (acceptBtn) {
                const requestId = acceptBtn.dataset.id;
                acceptBtn.disabled = true;
                await handleAcceptRequest(requestId);
            } else if (declineBtn) {
                const requestId = declineBtn.dataset.id;
                declineBtn.disabled = true;
                await handleDeclineRequest(requestId);
            }
        });

        document.getElementById('outgoing-requests')?.addEventListener('click', async (e) => {
            const cancelBtn = e.target.closest('.cancel-request-btn');
            if (cancelBtn) {
                const requestId = cancelBtn.dataset.id;
                cancelBtn.disabled = true;
                await handleCancelRequest(requestId);
            }
        });

        // Add contact button and modal
        document.getElementById('add-contact-btn')?.addEventListener('click', () => {
            showAddContactModal();
        });

        document.getElementById('add-contact-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('contact-email');
            const email = emailInput?.value?.trim();
            if (email) {
                const result = await handleAddContact(email);
                if (result.success) {
                    closeAddContactModal();
                    Toast.success('Contact request sent');
                } else {
                    const errorEl = document.getElementById('add-contact-error');
                    if (errorEl) {
                        errorEl.textContent = result.error || 'Failed to send request';
                        errorEl.classList.remove('hidden');
                    }
                }
            }
        });

        document.getElementById('add-contact-close-btn')?.addEventListener('click', closeAddContactModal);
        document.getElementById('add-contact-cancel-btn')?.addEventListener('click', closeAddContactModal);
        document.getElementById('add-contact-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeAddContactModal);

        // Permission change in contact detail
        document.getElementById('detail-permission-select')?.addEventListener('change', async (e) => {
            const contact = Model.getSelectedContact();
            if (contact) {
                await handlePermissionChange(contact.id, e.target.value);
            }
        });

        // Remove contact button
        document.getElementById('remove-contact-btn')?.addEventListener('click', async () => {
            const contact = Model.getSelectedContact();
            if (contact) {
                const confirmed = await ConfirmModal.show({
                    title: 'Remove Contact',
                    message: `Remove ${contact.name} from your contacts?`,
                    confirmText: 'Remove',
                    danger: true
                });
                if (confirmed) {
                    await handleRemoveContact(contact.id);
                    ViewManager.goBack();
                }
            }
        });

        // Refresh location button
        document.getElementById('refresh-location-btn')?.addEventListener('click', handleRefreshLocation);

        // Save location button and modal
        document.getElementById('save-location-btn')?.addEventListener('click', showSaveLocationModal);
        document.getElementById('save-location-form')?.addEventListener('submit', handleSaveLocation);
        document.getElementById('modal-close-btn')?.addEventListener('click', closeSaveLocationModal);
        document.getElementById('modal-cancel-btn')?.addEventListener('click', closeSaveLocationModal);
        document.getElementById('save-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeSaveLocationModal);

        // Places list clicks (delegated)
        document.getElementById('places-list')?.addEventListener('click', (e) => {
            const placeItem = e.target.closest('.named-location-item');
            if (placeItem) {
                const placeId = placeItem.dataset.id;
                handlePlaceClick(placeId);
            }
        });

        // Edit place modal
        document.getElementById('edit-place-form')?.addEventListener('submit', handleEditPlaceSubmit);
        document.getElementById('edit-place-close-btn')?.addEventListener('click', closeEditPlaceModal);
        document.getElementById('edit-place-cancel-btn')?.addEventListener('click', closeEditPlaceModal);
        document.getElementById('edit-place-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeEditPlaceModal);
        document.getElementById('delete-place-btn')?.addEventListener('click', handleDeletePlace);

        // Visibility radio change in edit place modal
        document.getElementById('edit-place-form')?.querySelectorAll('input[name="visibility"]').forEach(radio => {
            radio.addEventListener('change', updateVisibilityContactSelector);
        });

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
     * Handle export identity button click
     */
    function handleExportIdentity() {
        try {
            if (!Identity.hasIdentity()) {
                Toast.warning('No identity to export. Please log in first.');
                return;
            }

            const email = API.getUserEmail?.() || 'unknown';
            const json = Identity.exportPrivate({ email: email, name: '' });

            // Create download
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'whereish-identity.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            Toast.success('Identity exported');
        } catch (e) {
            console.error('[v2] Export identity failed:', e);
            Toast.error('Failed to export identity');
        }
    }

    /**
     * Handle delete account form submission
     */
    async function handleDeleteAccountSubmit(e) {
        e.preventDefault();

        const passwordInput = document.getElementById('delete-account-password');
        const errorDiv = document.getElementById('delete-account-error');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        const password = passwordInput?.value;
        if (!password) {
            if (errorDiv) {
                errorDiv.textContent = 'Please enter your password';
                errorDiv.classList.remove('hidden');
            }
            return;
        }

        // Disable submit button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Deleting...';
        }
        errorDiv?.classList.add('hidden');

        try {
            await API.deleteAccount(password);
            await API.logout();
            Identity.clear();
            Toast.success('Account deleted');
            ViewManager.navigate('welcome');
        } catch (err) {
            console.error('[v2] Delete account failed:', err);
            if (errorDiv) {
                errorDiv.textContent = err.message || 'Failed to delete account';
                errorDiv.classList.remove('hidden');
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Delete Account';
            }
        }
    }

    /**
     * Handle transfer device button click
     */
    function handleTransferDevice() {
        // Transfer uses the transfer modal from v1
        const modal = document.getElementById('transfer-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // Generate transfer code
            initiateTransfer();
        } else {
            Toast.warning('Transfer feature not available');
        }
    }

    /**
     * Initiate transfer - generate code
     */
    async function initiateTransfer() {
        try {
            const codeEl = document.getElementById('transfer-code');
            const statusEl = document.getElementById('transfer-status');

            if (codeEl) codeEl.textContent = 'Generating...';
            if (statusEl) statusEl.textContent = 'Preparing transfer...';

            // Use API to generate transfer code
            const result = await API.initiateTransfer();
            if (result && result.code) {
                if (codeEl) codeEl.textContent = result.code;
                if (statusEl) statusEl.textContent = 'Share this code with your other device';
            }
        } catch (e) {
            console.error('[v2] Transfer initiation failed:', e);
            Toast.error('Failed to initiate transfer');
            document.getElementById('transfer-modal')?.classList.add('hidden');
        }
    }

    /**
     * Handle canceling an outgoing contact request
     */
    async function handleCancelRequest(requestId) {
        try {
            await API.cancelContactRequest(requestId);
            await API.getContactRequests();
        } catch (e) {
            console.error('[v2] Failed to cancel request:', e);
            Toast.error('Failed to cancel request');
        }
    }

    /**
     * Show the add contact modal
     */
    function showAddContactModal() {
        const modal = document.getElementById('add-contact-modal');
        const emailInput = document.getElementById('contact-email');
        const errorEl = document.getElementById('add-contact-error');

        if (modal) {
            modal.classList.remove('hidden');
            emailInput?.focus();
            if (errorEl) errorEl.classList.add('hidden');
        }
    }

    /**
     * Close the add contact modal
     */
    function closeAddContactModal() {
        const modal = document.getElementById('add-contact-modal');
        const form = document.getElementById('add-contact-form');

        if (modal) {
            modal.classList.add('hidden');
            form?.reset();
        }
    }

    // ===================
    // Places Modal Handlers
    // ===================

    // Track which place is being edited
    let editingPlace = null;

    /**
     * Show the save location modal
     */
    function showSaveLocationModal() {
        const modal = document.getElementById('save-modal');
        const loc = Model.getLocation();

        if (!loc || !loc.hierarchy) {
            Toast.warning('No location available. Please refresh your location first.');
            return;
        }

        if (modal) {
            // Update modal with current location
            const locText = document.getElementById('modal-current-location');
            if (locText) {
                locText.textContent = Model.getLocationText(loc.hierarchy);
            }
            modal.classList.remove('hidden');
            document.getElementById('location-label')?.focus();
        }
    }

    /**
     * Close the save location modal
     */
    function closeSaveLocationModal() {
        const modal = document.getElementById('save-modal');
        const form = document.getElementById('save-location-form');
        if (modal) {
            modal.classList.add('hidden');
            form?.reset();
        }
    }

    /**
     * Handle save location form submit
     */
    async function handleSaveLocation(e) {
        e.preventDefault();

        const loc = Model.getLocation();
        if (!loc) {
            Toast.warning('No location available.');
            return;
        }

        const userId = API.getUserId?.() || Model.getCurrentUserId();
        if (!userId) {
            Toast.warning('Please log in to save locations.');
            return;
        }

        const label = document.getElementById('location-label')?.value?.trim();
        const radius = parseInt(document.getElementById('location-radius')?.value || '100', 10);

        if (!label) {
            Toast.warning('Please enter a name for this location.');
            return;
        }

        try {
            const newPlace = await Storage.saveNamedLocation({
                userId,
                label,
                latitude: loc.latitude,
                longitude: loc.longitude,
                radiusMeters: radius,
                visibility: { mode: 'private', contactIds: [] }
            });

            Model.addPlace(newPlace);

            // Update current match
            const match = Geofence.findMatchingPlace(loc.latitude, loc.longitude, Model.getPlaces());
            Model.setCurrentMatch(match);

            closeSaveLocationModal();
            Toast.success(`Saved "${label}"`);
        } catch (err) {
            console.error('[v2] Failed to save location:', err);
            Toast.error('Failed to save location');
        }
    }

    /**
     * Handle click on a place item - open edit modal
     */
    function handlePlaceClick(placeId) {
        const places = Model.getPlaces();
        const place = places.find(p => p.id === placeId);
        if (place) {
            openEditPlaceModal(place);
        }
    }

    /**
     * Open the edit place modal
     */
    function openEditPlaceModal(place) {
        editingPlace = place;
        const modal = document.getElementById('edit-place-modal');

        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('edit-place-error')?.classList.add('hidden');

            // Populate form
            const labelInput = document.getElementById('edit-place-label');
            const radiusSelect = document.getElementById('edit-place-radius');

            if (labelInput) labelInput.value = place.label;
            if (radiusSelect) radiusSelect.value = place.radiusMeters.toString();

            // Set visibility radio
            const visibility = place.visibility || { mode: 'private', contactIds: [] };
            const radio = document.querySelector(`#edit-place-form input[name="visibility"][value="${visibility.mode}"]`);
            if (radio) radio.checked = true;

            // Update contact selector
            renderVisibilityContacts(visibility.contactIds || []);
            updateVisibilityContactSelector();

            labelInput?.focus();
        }
    }

    /**
     * Close the edit place modal
     */
    function closeEditPlaceModal() {
        const modal = document.getElementById('edit-place-modal');
        const form = document.getElementById('edit-place-form');
        if (modal) {
            modal.classList.add('hidden');
            form?.reset();
            editingPlace = null;
        }
    }

    /**
     * Handle edit place form submit
     */
    async function handleEditPlaceSubmit(e) {
        e.preventDefault();

        if (!editingPlace) {
            closeEditPlaceModal();
            return;
        }

        const label = document.getElementById('edit-place-label')?.value?.trim();
        const radius = parseInt(document.getElementById('edit-place-radius')?.value || '100', 10);
        const visibility = getVisibilityFromForm();

        if (!label) {
            const errorEl = document.getElementById('edit-place-error');
            if (errorEl) {
                errorEl.textContent = 'Please enter a name for this place.';
                errorEl.classList.remove('hidden');
            }
            return;
        }

        try {
            const updatedPlace = await Storage.saveNamedLocation({
                ...editingPlace,
                label,
                radiusMeters: radius,
                visibility
            });

            Model.updatePlace(editingPlace.id, updatedPlace);

            // Update current match if editing the matched place
            const match = Model.getCurrentMatch();
            if (match && match.id === editingPlace.id) {
                Model.setCurrentMatch(updatedPlace);
            }

            closeEditPlaceModal();
            Toast.success('Place updated');
        } catch (err) {
            console.error('[v2] Failed to update place:', err);
            Toast.error('Failed to update place');
        }
    }

    /**
     * Handle delete place button
     */
    async function handleDeletePlace() {
        if (!editingPlace) return;

        const confirmed = await ConfirmModal.show({
            title: 'Delete Place',
            message: `Delete "${editingPlace.label}"?`,
            confirmText: 'Delete',
            danger: true
        });

        if (confirmed) {
            try {
                await Storage.deleteNamedLocation(editingPlace.id);
                Model.removePlace(editingPlace.id);

                // Clear match if deleting the matched place
                const match = Model.getCurrentMatch();
                if (match && match.id === editingPlace.id) {
                    Model.setCurrentMatch(null);
                }

                closeEditPlaceModal();
                Toast.success('Place deleted');
            } catch (err) {
                console.error('[v2] Failed to delete place:', err);
                Toast.error('Failed to delete place');
            }
        }
    }

    /**
     * Get visibility settings from edit form
     */
    function getVisibilityFromForm() {
        const form = document.getElementById('edit-place-form');
        const mode = form?.querySelector('input[name="visibility"]:checked')?.value || 'private';
        const contactIds = [];

        if (mode === 'selected') {
            form?.querySelectorAll('#visibility-contact-selector input:checked').forEach(cb => {
                contactIds.push(cb.value);
            });
        }

        return { mode, contactIds };
    }

    /**
     * Render contact checkboxes for visibility selector
     */
    function renderVisibilityContacts(selectedIds) {
        const container = document.getElementById('visibility-contact-selector');
        if (!container) return;

        const contacts = Model.getContacts();
        if (!contacts || contacts.length === 0) {
            container.innerHTML = '<p class="empty-state">No contacts to select</p>';
            return;
        }

        container.innerHTML = contacts.map(contact => {
            const contactId = contact.contactId || contact.id;
            const isChecked = selectedIds.includes(contactId);
            return `
                <label class="contact-checkbox">
                    <input type="checkbox" value="${contactId}" ${isChecked ? 'checked' : ''}>
                    ${Model.escapeHtml(contact.name)}
                </label>
            `;
        }).join('');
    }

    /**
     * Show/hide contact selector based on visibility mode
     */
    function updateVisibilityContactSelector() {
        const form = document.getElementById('edit-place-form');
        const container = document.getElementById('visibility-contact-selector');
        if (!form || !container) return;

        const mode = form.querySelector('input[name="visibility"]:checked')?.value;
        container.style.display = mode === 'selected' ? 'block' : 'none';
    }

    // ===================
    // Location Refresh
    // ===================

    /**
     * Reverse geocode coordinates to address using Nominatim
     */
    async function reverseGeocode(lat, lon) {
        const url = new URL(Model.CONFIG.geocodeUrl);
        url.searchParams.set('lat', lat);
        url.searchParams.set('lon', lon);
        url.searchParams.set('format', 'json');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('zoom', '18');

        const response = await fetch(url, {
            headers: { 'User-Agent': Model.CONFIG.userAgent }
        });

        if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(`Geocoding error: ${data.error}`);
        }

        return data.address || {};
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

            // Reverse geocode to get address
            const addressComponents = await reverseGeocode(lat, lon);

            // Build hierarchy from address
            const hierarchy = Model.buildHierarchy(addressComponents);

            // Update location in Model (coordinates, hierarchy)
            Model.setLocation(
                { latitude: lat, longitude: lon },
                hierarchy
            );

            // Check for named location match
            const places = Model.getPlaces();
            const match = Geofence.findBestMatch(lat, lon, places);
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
