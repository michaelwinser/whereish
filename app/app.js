/**
 * Whereish - Semantic Location Sharing
 * Milestone 3: Backend Integration
 *
 * This module handles:
 * - Browser geolocation
 * - Reverse geocoding via OpenStreetMap Nominatim
 * - Geographic hierarchy display
 * - Named locations (create, store, match)
 * - Backend integration (publish location, fetch contacts)
 */

(function() {
    'use strict';

    // ===================
    // Configuration
    // ===================

    // ===================
    // Configuration and Constants from Model
    // ===================
    // CONFIG, HIERARCHY_LEVELS, COUNTRY_TO_CONTINENT are now in Model
    // Access via Model.CONFIG, Model.HIERARCHY_LEVELS, Model.COUNTRY_TO_CONTINENT

    // ===================
    // State (synced with Model)
    // ===================

    // Note: All state is cached here for convenience but Model is the source of truth.
    // Use Model.getLocation(), Model.getPlaces(), Model.getContacts(), Model.getCurrentUserId(), etc.
    let currentCoordinates = null;
    let currentHierarchy = null;
    let namedLocations = [];
    let currentMatch = null;
    let serverConnected = false;
    let currentUserId = null;
    let contacts = [];
    let selectedContact = null;  // Currently viewed contact in detail screen
    let permissionLevels = [];
    let contactsRefreshTimer = null;
    let locationPublishTimer = null;

    // ===================
    // DOM Elements
    // ===================

    const elements = {
        // Location error display
        error: document.getElementById('error-message'),
        errorText: document.querySelector('.error-text'),

        // Buttons
        refreshBtn: document.getElementById('refresh-btn'),
        retryBtn: document.getElementById('retry-btn'),
        saveLocationBtn: document.getElementById('save-location-btn'),

        // Named locations list (now in places view)
        placesList: document.getElementById('places-list'),

        // Modal
        modal: document.getElementById('save-modal'),
        modalForm: document.getElementById('save-location-form'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        modalCurrentLocation: document.getElementById('modal-current-location'),
        locationLabelInput: document.getElementById('location-label'),
        locationRadiusSelect: document.getElementById('location-radius'),

        // Server status
        serverStatus: document.getElementById('server-status'),
        serverStatusIcon: document.querySelector('.server-status-icon'),
        serverStatusText: document.querySelector('.server-status-text'),

        // Settings
        settingsBtn: document.getElementById('settings-btn'),
        settingsUserEmail: document.getElementById('settings-user-email'),
        settingsLogoutBtn: document.getElementById('settings-logout-btn'),
        forceRefreshBtn: document.getElementById('force-refresh-btn'),
        exportIdentityBtn: document.getElementById('export-identity-btn'),
        deleteIdentityBtn: document.getElementById('delete-identity-btn'),
        deleteAccountBtn: document.getElementById('delete-account-btn'),

        // Identity import (welcome screen)
        importIdentityBtn: document.getElementById('import-identity-btn'),
        identityFileInput: document.getElementById('identity-file-input'),

        // Auth modal
        authModal: document.getElementById('auth-modal'),
        authModalTitle: document.getElementById('auth-modal-title'),
        authModalCloseBtn: document.getElementById('auth-modal-close-btn'),
        authForm: document.getElementById('auth-form'),
        authNameGroup: document.getElementById('auth-name-group'),
        authNameInput: document.getElementById('auth-name'),
        authEmailInput: document.getElementById('auth-email'),
        authPasswordInput: document.getElementById('auth-password'),
        authConfirmGroup: document.getElementById('auth-confirm-group'),
        authConfirmInput: document.getElementById('auth-confirm-password'),
        authShowPassword: document.getElementById('auth-show-password'),
        authError: document.getElementById('auth-error'),
        authImportSection: document.getElementById('auth-import-section'),
        authImportBtn: document.getElementById('auth-import-btn'),
        authIdentityFile: document.getElementById('auth-identity-file'),
        authSubmitBtn: document.getElementById('auth-submit-btn'),
        authSwitch: document.getElementById('auth-switch'),
        authSwitchLink: document.getElementById('auth-switch-link'),

        // Google Sign-In
        googleSignInBtn: document.getElementById('google-signin-btn'),

        // PIN Setup modal
        pinSetupModal: document.getElementById('pin-setup-modal'),
        pinSetupForm: document.getElementById('pin-setup-form'),
        pinSetupPin: document.getElementById('pin-setup-pin'),
        pinSetupConfirm: document.getElementById('pin-setup-confirm'),
        pinSetupShow: document.getElementById('pin-setup-show'),
        pinSetupError: document.getElementById('pin-setup-error'),
        pinBackupDownload: document.getElementById('pin-backup-download'),
        pinBackupServer: document.getElementById('pin-backup-server'),
        pinSetupBtn: document.getElementById('pin-setup-btn'),

        // PIN Entry modal
        pinEntryModal: document.getElementById('pin-entry-modal'),
        pinEntryForm: document.getElementById('pin-entry-form'),
        pinEntryPin: document.getElementById('pin-entry-pin'),
        pinEntryShow: document.getElementById('pin-entry-show'),
        pinEntryError: document.getElementById('pin-entry-error'),
        pinEntryCloseBtn: document.getElementById('pin-entry-close-btn'),
        pinEntryCancelBtn: document.getElementById('pin-entry-cancel-btn'),
        pinEntryBtn: document.getElementById('pin-entry-btn'),

        // PIN Verification modal (periodic check)
        pinVerifyModal: document.getElementById('pin-verify-modal'),
        pinVerifyForm: document.getElementById('pin-verify-form'),
        pinVerifyPin: document.getElementById('pin-verify-pin'),
        pinVerifyShow: document.getElementById('pin-verify-show'),
        pinVerifyError: document.getElementById('pin-verify-error'),
        pinVerifySuccess: document.getElementById('pin-verify-success'),
        pinVerifySkipBtn: document.getElementById('pin-verify-skip-btn'),
        pinVerifyBtn: document.getElementById('pin-verify-btn'),

        // Contacts
        contactsSection: document.getElementById('contacts-section'),
        contactsList: document.getElementById('contacts-list'),
        pendingRequests: document.getElementById('pending-requests'),
        incomingRequests: document.getElementById('incoming-requests'),
        outgoingRequests: document.getElementById('outgoing-requests'),
        addContactBtn: document.getElementById('add-contact-btn'),
        refreshContactsBtn: document.getElementById('refresh-contacts-btn'),

        // Add contact modal
        addContactModal: document.getElementById('add-contact-modal'),
        addContactForm: document.getElementById('add-contact-form'),
        addContactCloseBtn: document.getElementById('add-contact-close-btn'),
        addContactCancelBtn: document.getElementById('add-contact-cancel-btn'),
        contactEmailInput: document.getElementById('contact-email'),
        addContactError: document.getElementById('add-contact-error'),

        // Edit place modal
        editPlaceModal: document.getElementById('edit-place-modal'),
        editPlaceForm: document.getElementById('edit-place-form'),
        editPlaceCloseBtn: document.getElementById('edit-place-close-btn'),
        editPlaceCancelBtn: document.getElementById('edit-place-cancel-btn'),
        editPlaceLabelInput: document.getElementById('edit-place-label'),
        editPlaceRadiusSelect: document.getElementById('edit-place-radius'),
        editPlaceError: document.getElementById('edit-place-error'),
        visibilityContactSelector: document.getElementById('visibility-contact-selector')
    };

    // Auth state
    let isLoginMode = true;

    // OAuth/PIN state
    let pendingOAuthUser = null;  // User info from OAuth for PIN setup
    let pendingIdentityJson = null;  // Encrypted identity JSON awaiting PIN

    // Edit place state
    let editingPlace = null;

    // ===================
    // Geolocation Service
    // ===================

    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                (error) => {
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            reject(new Error('Location permission denied. Please enable location access in your browser settings.'));
                            break;
                        case error.POSITION_UNAVAILABLE:
                            reject(new Error('Location information unavailable. Please try again.'));
                            break;
                        case error.TIMEOUT:
                            reject(new Error('Location request timed out. Please try again.'));
                            break;
                        default:
                            reject(new Error('An unknown error occurred while getting location.'));
                    }
                },
                Model.CONFIG.geolocation
            );
        });
    }

    // ===================
    // Geocoding Service
    // ===================

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

    // buildHierarchy moved to Model.buildHierarchy

    // ===================
    // UI Updates
    // ===================

    function showLoading() {
        // Update location bar to loading state
        const primaryEl = document.getElementById('location-bar-primary');
        const secondaryEl = document.getElementById('location-bar-secondary');
        if (primaryEl) primaryEl.textContent = 'Locating...';
        if (secondaryEl) secondaryEl.classList.add('hidden');

        elements.error.classList.add('hidden');
        elements.refreshBtn.disabled = true;
        elements.saveLocationBtn.disabled = true;
    }

    function showError(message) {
        // Update location bar to show error state
        const primaryEl = document.getElementById('location-bar-primary');
        const secondaryEl = document.getElementById('location-bar-secondary');
        if (primaryEl) primaryEl.textContent = 'Location unavailable';
        if (secondaryEl) secondaryEl.classList.add('hidden');

        elements.error.classList.remove('hidden');
        elements.errorText.textContent = message;
        elements.refreshBtn.disabled = false;
        elements.saveLocationBtn.disabled = true;
    }

    function displayLocation(hierarchy, match) {
        elements.error.classList.add('hidden');

        // Update compact location bar
        updateLocationBar(hierarchy, match);

        elements.refreshBtn.disabled = false;
        elements.saveLocationBtn.disabled = false;
    }

    /**
     * Update the compact location bar on the main screen
     */
    function updateLocationBar(hierarchy, match) {
        const primaryEl = document.getElementById('location-bar-primary');
        const secondaryEl = document.getElementById('location-bar-secondary');

        if (!primaryEl) return;

        if (!hierarchy) {
            primaryEl.textContent = 'Locating...';
            secondaryEl?.classList.add('hidden');
            return;
        }

        if (match) {
            // Show named location as primary, actual location as secondary
            primaryEl.textContent = match.label;
            if (secondaryEl) {
                secondaryEl.textContent = Model.getLocationText(hierarchy);
                secondaryEl.classList.remove('hidden');
            }
        } else {
            // Show most specific location as primary, no secondary
            primaryEl.textContent = Model.getLocationText(hierarchy);
            secondaryEl?.classList.add('hidden');
        }
    }

    // findMostSpecificLevel, escapeHtml, formatTimeAgo moved to Model

    /**
     * Render the full location hierarchy on the welcome screen
     */
    function renderWelcomeHierarchy() {
        const container = document.getElementById('welcome-hierarchy');
        if (!container) return;

        if (!currentHierarchy) {
            container.innerHTML = `
                <div class="welcome-hierarchy-level">
                    <span class="welcome-hierarchy-icon">📍</span>
                    <span class="welcome-hierarchy-text">Locating...</span>
                </div>
            `;
            return;
        }

        // Build hierarchy from most specific to least specific, ending with Planet
        const levels = [];

        // Add all hierarchy levels that have values (planet is always present as minimum)
        for (const level of Model.HIERARCHY_LEVELS) {
            if (currentHierarchy[level.key]) {
                levels.push({
                    icon: level.key === 'planet' ? '🌍' : '📍',
                    text: currentHierarchy[level.key],
                    primary: levels.length === 0  // First one is most specific
                });
            }
        }

        container.innerHTML = levels.map((level, _index) => `
            <div class="welcome-hierarchy-level${level.primary ? ' primary' : ''}">
                <span class="welcome-hierarchy-icon">${level.icon}</span>
                <span class="welcome-hierarchy-text">${Model.escapeHtml(level.text)}</span>
            </div>
        `).join('');
    }

    // ===================
    // Server Status UI
    // ===================

    function updateServerStatus(connected) {
        serverConnected = connected;
        Model.setServerConnected(connected);

        if (connected) {
            elements.serverStatus.classList.add('connected');
            elements.serverStatusIcon.textContent = '✓';
            elements.serverStatusText.textContent = 'Connected to server';
            // Hide the banner when connected (less visual noise)
            elements.serverStatus.classList.add('hidden');
        } else {
            elements.serverStatus.classList.remove('connected');
            elements.serverStatus.classList.remove('hidden');
            elements.serverStatusIcon.textContent = '⚠️';
            elements.serverStatusText.textContent = 'Backend server not connected. Run: python server/run.py';

            // Hide contacts section when server not connected
            elements.contactsSection.classList.add('hidden');
        }
    }

    // ===================
    // Authentication UI
    // ===================

    function updateAuthUI() {
        if (API.isAuthenticated()) {
            elements.contactsSection.classList.remove('hidden');
            // Update settings email display
            const userEmail = API.getUserEmail?.() || '--';
            if (elements.settingsUserEmail) {
                elements.settingsUserEmail.textContent = userEmail;
            }
        } else {
            elements.contactsSection.classList.add('hidden');
        }
    }

    function openAuthModal(loginMode) {
        isLoginMode = loginMode;
        elements.authModal.classList.remove('hidden');
        elements.authError.classList.add('hidden');
        elements.authImportSection?.classList.add('hidden');
        elements.authForm.reset();

        if (loginMode) {
            elements.authModalTitle.textContent = 'Log In';
            elements.authNameGroup.classList.add('hidden');
            elements.authConfirmGroup.classList.add('hidden');
            elements.authNameInput.required = false;
            elements.authConfirmInput.required = false;
            elements.authPasswordInput.autocomplete = 'current-password';
            elements.authSubmitBtn.textContent = 'Log In';
            elements.authSwitch.innerHTML = 'Don\'t have an account? <a href="#" id="auth-switch-link">Sign up</a>';
        } else {
            elements.authModalTitle.textContent = 'Sign Up';
            elements.authNameGroup.classList.remove('hidden');
            elements.authConfirmGroup.classList.remove('hidden');
            elements.authNameInput.required = true;
            elements.authConfirmInput.required = true;
            elements.authPasswordInput.autocomplete = 'new-password';
            elements.authSubmitBtn.textContent = 'Create Account';
            elements.authSwitch.innerHTML = 'Already have an account? <a href="#" id="auth-switch-link">Log in</a>';
        }

        // Re-attach switch link handler
        document.getElementById('auth-switch-link').addEventListener('click', (e) => {
            e.preventDefault();
            openAuthModal(!isLoginMode);
        });

        elements.authEmailInput.focus();
    }

    function closeAuthModal() {
        elements.authModal.classList.add('hidden');
        elements.authForm.reset();
        elements.authError.classList.add('hidden');
    }

    async function handleAuthSubmit(event) {
        event.preventDefault();
        elements.authError.classList.add('hidden');
        elements.authSubmitBtn.disabled = true;

        const email = elements.authEmailInput.value.trim();
        const password = elements.authPasswordInput.value;
        const name = elements.authNameInput.value.trim();

        try {
            if (isLoginMode) {
                // Login flow with identity management
                await handleLoginWithIdentity(email, password);
            } else {
                // Registration: verify passwords match
                const confirmPassword = elements.authConfirmInput.value;
                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match');
                }
                // Registration flow with identity creation
                await handleRegistrationWithIdentity(email, password, name);
            }

            // Success - update UI
            const user = await API.getCurrentUser();
            currentUserId = user.id;
            Model.setCurrentUserId(user.id);
            updateAuthUI();
            closeAuthModal();

            // Navigate to main view
            ViewManager.navigate('main');

            // Load user's data
            await loadNamedLocations();
            renderNamedLocationsList();
            await refreshContacts();
            await loadContactRequests();
            await publishLocationToServer();

            // Check if existing user needs PIN setup (migration from legacy file)
            const hasIdentity = Identity.hasIdentity();
            const hasPinTestData = localStorage.getItem('whereish_pin_test');
            if (hasIdentity && !hasPinTestData) {
                // Migration case: prompt user to set up PIN for their existing identity
                pendingOAuthUser = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    isMigration: true
                };
                Toast.info('Please set up a PIN to protect your identity');
                openPinSetupModal();
            }

        } catch (error) {
            elements.authError.textContent = error.message;
            elements.authError.classList.remove('hidden');

            // Show import section if this is an identity mismatch error
            const isIdentityError = error.message.includes('identity') ||
                error.message.includes('another device');
            if (isIdentityError) {
                elements.authImportSection?.classList.remove('hidden');
            }
        } finally {
            elements.authSubmitBtn.disabled = false;
        }
    }

    /**
     * Handle registration with identity creation
     */
    async function handleRegistrationWithIdentity(email, password, name) {
        // 1. Create a new identity
        await Identity.create();
        const publicKey = Identity.getPublicKeyBase64();

        // 2. Register with server
        await API.register(email, password, name);

        // 3. Register public key with server
        await API.registerPublicKey(publicKey);

        console.log('Registration complete with identity');
    }

    /**
     * Handle login with identity verification
     */
    async function handleLoginWithIdentity(email, password) {
        // 1. Try to load existing identity
        await Identity.load();
        const localPublicKey = Identity.getPublicKeyBase64();

        // 2. Login to server
        const response = await API.login(email, password);

        // 3. Check for identity mismatch
        if (response.hasPublicKey && response.publicKey) {
            if (!localPublicKey) {
                // Server has key but we don't - need to import identity
                throw new Error('This account has an identity on another device. Please import your identity file to continue, or log out on your other device first.');
            }

            if (localPublicKey !== response.publicKey) {
                // Keys don't match - different identity
                throw new Error('Identity mismatch: Your local identity does not match this account. Please import the correct identity file.');
            }
        } else {
            // Server has no key - register ours if we have one
            if (localPublicKey) {
                await API.registerPublicKey(localPublicKey);
                console.log('Registered existing identity with server');
            } else {
                // Neither has identity - create one
                await Identity.create();
                await API.registerPublicKey(Identity.getPublicKeyBase64());
                console.log('Created new identity for existing account');
            }
        }
    }

    async function handleLogout() {
        API.logout();
        currentUserId = null;

        // Clear user-specific data (but preserve identity for re-login)
        contacts = [];
        namedLocations = [];
        currentMatch = null;

        // Sync with Model
        Model.setCurrentUserId(null);
        Model.setContacts([]);
        Model.setPlaces([]);
        Model.setCurrentMatch(null);

        // Force refresh to ensure fresh assets and clean state
        forceRefresh();
    }

    // ===================
    // Google OAuth
    // ===================

    /**
     * Initialize Google Identity Services
     */
    function initGoogleSignIn() {
        // Check if GIS is loaded
        if (typeof google === 'undefined' || !google.accounts) {
            console.log('Google Identity Services not loaded - offline or blocked');
            return;
        }

        // Initialize with client ID from meta tag or config
        const clientId = document.querySelector('meta[name="google-client-id"]')?.content;
        if (!clientId) {
            console.log('Google Client ID not configured');
            return;
        }

        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCallback,
            auto_select: false,
            use_fedcm_for_prompt: true  // Opt-in to FedCM
        });

        // Render the Google Sign-In button in the container
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
            // Only hide custom button if Google's button was actually rendered
            // Use requestAnimationFrame to check after DOM update
            requestAnimationFrame(() => {
                if (buttonContainer.children.length > 0 && elements.googleSignInBtn) {
                    elements.googleSignInBtn.style.display = 'none';
                }
            });
        }

        console.log('Google Sign-In initialized');
    }

    /**
     * Handle Google Sign-In button click (fallback if rendered button not available)
     */
    function handleGoogleSignIn() {
        if (typeof google === 'undefined' || !google.accounts) {
            Toast.error('Google Sign-In not available');
            return;
        }

        // Use the prompt API as fallback (with FedCM enabled in initialize)
        google.accounts.id.prompt();
    }

    /**
     * Handle Google OAuth callback
     */
    async function handleGoogleCallback(response) {
        try {
            // response.credential is the ID token
            const idToken = response.credential;
            if (!idToken) {
                throw new Error('No credential received from Google');
            }

            Toast.info('Signing in...');

            // Authenticate with our server
            const result = await API.authGoogle(idToken);

            if (result.isNew) {
                // New user - need to set up PIN and identity
                pendingOAuthUser = {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name
                };
                openPinSetupModal();
            } else if (!result.hasPublicKey) {
                // Existing user without identity on this device
                // They need to import their identity or create new one
                Toast.warning('Please import your identity file to continue');
                ViewManager.navigate('welcome');
            } else {
                // Existing user with identity - normal login
                await completeLogin(result.user);
            }
        } catch (error) {
            console.error('Google auth failed:', error);
            Toast.error('Sign-in failed: ' + error.message);
        }
    }

    /**
     * Complete login after successful auth
     */
    async function completeLogin(user) {
        currentUserId = user.id;
        Model.setCurrentUserId(user.id);
        updateAuthUI();

        ViewManager.navigate('main');

        // Register this device if needed
        await loadDevices();
        await registerCurrentDevice();

        // Load user's data
        await loadNamedLocations();
        renderNamedLocationsList();
        await refreshContacts();
        await loadContactRequests();
        await publishLocationToServer();

        // Check if existing user needs PIN setup (migration from email/password)
        // They have identity but never went through PIN setup
        const hasIdentity = Identity.hasIdentity();
        const hasPinTestData = localStorage.getItem('whereish_pin_test');
        if (hasIdentity && !hasPinTestData) {
            // Migration case: prompt user to set up PIN for their existing identity
            pendingOAuthUser = {
                id: user.id,
                email: user.email,
                name: user.name,
                isMigration: true  // Flag to skip identity creation
            };
            Toast.info('Please set up a PIN to secure your identity');
            openPinSetupModal();
            return;  // Don't show "Welcome back" yet
        }

        Toast.success('Welcome back!');
    }

    // ===================
    // PIN Setup Modal
    // ===================

    function openPinSetupModal() {
        elements.pinSetupModal.classList.remove('hidden');
        elements.pinSetupForm.reset();
        elements.pinSetupError.classList.add('hidden');
        elements.pinSetupPin.focus();
    }

    function closePinSetupModal() {
        elements.pinSetupModal.classList.add('hidden');
        elements.pinSetupForm.reset();
        elements.pinSetupError.classList.add('hidden');
        pendingOAuthUser = null;
    }

    async function handlePinSetup(event) {
        event.preventDefault();

        const pin = elements.pinSetupPin.value;
        const confirmPin = elements.pinSetupConfirm.value;
        const downloadBackup = elements.pinBackupDownload.checked;
        const serverBackup = elements.pinBackupServer.checked;
        const isMigration = pendingOAuthUser?.isMigration;

        // Validate
        if (pin.length < 6) {
            elements.pinSetupError.textContent = 'PIN must be at least 6 characters';
            elements.pinSetupError.classList.remove('hidden');
            return;
        }

        if (pin !== confirmPin) {
            elements.pinSetupError.textContent = 'PINs do not match';
            elements.pinSetupError.classList.remove('hidden');
            return;
        }

        if (!downloadBackup && !serverBackup) {
            elements.pinSetupError.textContent = 'Please select at least one backup option';
            elements.pinSetupError.classList.remove('hidden');
            return;
        }

        elements.pinSetupBtn.disabled = true;

        try {
            // For migration, use existing identity; for new users, create one
            if (!isMigration) {
                // 1. Create new identity
                await Identity.create();
                const publicKey = Identity.getPublicKeyBase64();

                // 2. Register public key with server
                await API.registerPublicKey(publicKey);
            }

            // 3. Store PIN test value for later verification
            const pinTest = await PinCrypto.encryptTestValue(pin);
            localStorage.setItem('whereish_pin_test', JSON.stringify(pinTest));
            localStorage.setItem('whereish_pin_last_check', Date.now().toString());

            // 4. Generate encrypted backup (for download and/or server)
            let encryptedJson = null;
            if (downloadBackup || serverBackup) {
                encryptedJson = await Identity.exportEncrypted({
                    email: pendingOAuthUser.email,
                    name: pendingOAuthUser.name
                }, pin);
            }

            // 5. Trigger download if requested
            if (downloadBackup) {
                downloadIdentityFile(encryptedJson, pendingOAuthUser.email);
                localStorage.setItem('whereish_identity_exported', 'true');
            }

            // 6. Server backup if requested
            if (serverBackup) {
                await API.storeIdentityBackup(encryptedJson);
                console.log('Server backup stored successfully');
            }

            // Save user before closing modal (which clears pendingOAuthUser)
            const user = pendingOAuthUser;
            closePinSetupModal();

            if (isMigration) {
                // Migration complete - show success and stay on main view
                Toast.success('PIN setup complete! Your identity is now protected.');
            } else {
                // Complete login for new users
                await completeLogin(user);
                Toast.success('Account created successfully!');
            }

        } catch (error) {
            console.error('PIN setup failed:', error);
            elements.pinSetupError.textContent = error.message;
            elements.pinSetupError.classList.remove('hidden');
        } finally {
            elements.pinSetupBtn.disabled = false;
        }
    }

    /**
     * Download identity file
     */
    function downloadIdentityFile(jsonContent, email) {
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whereish-identity-${email.split('@')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===================
    // PIN Entry Modal
    // ===================

    function openPinEntryModal() {
        elements.pinEntryModal.classList.remove('hidden');
        elements.pinEntryForm.reset();
        elements.pinEntryError.classList.add('hidden');
        elements.pinEntryPin.focus();
    }

    function closePinEntryModal() {
        elements.pinEntryModal.classList.add('hidden');
        elements.pinEntryForm.reset();
        elements.pinEntryError.classList.add('hidden');
        pendingIdentityJson = null;
    }

    async function handlePinEntry(event) {
        event.preventDefault();

        const pin = elements.pinEntryPin.value;

        if (!pendingIdentityJson) {
            closePinEntryModal();
            return;
        }

        elements.pinEntryBtn.disabled = true;

        try {
            // Decrypt and import identity
            await Identity.importEncrypted(pendingIdentityJson, pin);

            closePinEntryModal();

            // Store PIN test value for this PIN
            const pinTest = await PinCrypto.encryptTestValue(pin);
            localStorage.setItem('whereish_pin_test', JSON.stringify(pinTest));
            localStorage.setItem('whereish_pin_last_check', Date.now().toString());

            Toast.success('Identity imported successfully!');

            // If not logged in, show login
            if (!API.isAuthenticated()) {
                openAuthModal(true);
            }
        } catch (error) {
            console.error('PIN entry failed:', error);
            elements.pinEntryError.textContent = 'Incorrect PIN or corrupted file';
            elements.pinEntryError.classList.remove('hidden');
        } finally {
            elements.pinEntryBtn.disabled = false;
        }
    }

    /**
     * Handle delete identity - completely wipes cryptographic identity from device
     */
    async function handleDeleteIdentity() {
        const identityExported = localStorage.getItem('whereish_identity_exported');

        let message = 'This will permanently delete your cryptographic identity from this device.\n\n';
        if (!identityExported) {
            message += 'You have NOT exported your identity backup!\n\n';
        }
        message += 'Without your identity:\n' +
            '• You cannot decrypt location data from contacts\n' +
            '• You cannot log in to this account on any device\n' +
            '• Your contacts will not be able to see your location\n\n' +
            'This cannot be undone.';

        const confirmed = await ConfirmModal.show({
            title: 'Clear Local Identity',
            message: message,
            confirmText: 'Continue',
            cancelText: 'Cancel',
            danger: true
        });

        if (!confirmed) {
            return;
        }

        // Final confirmation with typed input
        const typed = await InputModal.show({
            title: 'Final Confirmation',
            message: 'Type "delete" to confirm identity deletion:',
            placeholder: 'delete',
            confirmText: 'Delete Identity',
            cancelText: 'Cancel'
        });

        if (typed?.toLowerCase() !== 'delete') {
            Toast.info('Identity deletion cancelled.');
            return;
        }

        // Clear everything
        await Identity.clear();
        localStorage.removeItem('whereish_identity_exported');
        API.logout();

        Toast.success('Local identity cleared. You will now be logged out.');
        setTimeout(() => forceRefresh(), 1500);
    }

    /**
     * Handle delete account button - navigate to delete account view
     */
    function handleDeleteAccount() {
        ViewManager.navigate('delete-account');
    }

    /**
     * Handle delete account form submission
     */
    async function handleDeleteAccountSubmit(event) {
        event.preventDefault();

        const passwordInput = document.getElementById('delete-account-password');
        const errorDiv = document.getElementById('delete-account-error');
        const submitBtn = event.target.querySelector('button[type="submit"]');

        const password = passwordInput.value;
        if (!password) {
            errorDiv.textContent = 'Please enter your password';
            errorDiv.classList.remove('hidden');
            return;
        }

        // Disable submit button
        submitBtn.disabled = true;
        submitBtn.textContent = 'Deleting...';
        errorDiv.classList.add('hidden');

        try {
            await API.deleteAccount(password);

            // Clear local identity too
            await Identity.clear();
            localStorage.removeItem('whereish_identity_exported');

            // Show success and refresh
            Toast.success('Your account has been deleted.');
            setTimeout(() => forceRefresh(), 1500);
        } catch (error) {
            errorDiv.textContent = error.message || 'Failed to delete account';
            errorDiv.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Permanently Delete My Account';
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

            const email = API.getUserEmail() || 'unknown';
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

            // Mark identity as exported (disables logout warning)
            localStorage.setItem('whereish_identity_exported', 'true');

            console.log('Identity exported successfully');
            Toast.success('Identity backup saved. Keep this file secure!');
        } catch (error) {
            console.error('Failed to export identity:', error);
            Toast.error('Failed to export identity: ' + error.message);
        }
    }

    /**
     * Handle import identity file selection
     */
    async function handleImportIdentity(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const json = await file.text();

            // Detect file format
            const format = PinCrypto.detectFormat(json);

            if (format === 'encrypted') {
                // Store for PIN entry
                pendingIdentityJson = json;
                openPinEntryModal();
            } else if (format === 'unencrypted') {
                // Import directly (legacy v1 file)
                const account = await Identity.importPrivate(json);
                Toast.success(`Identity loaded for ${account.email || 'unknown account'}. Please log in to continue.`);

                // Pre-fill email if available
                if (account.email) {
                    elements.authEmailInput.value = account.email;
                }

                // Open login modal
                openAuthModal(true);
            } else {
                throw new Error('Invalid identity file format');
            }

        } catch (error) {
            console.error('Failed to import identity:', error);
            Toast.error('Failed to import identity: ' + error.message);
        } finally {
            // Clear file input so same file can be selected again
            event.target.value = '';
        }
    }

    /**
     * Handle import identity from auth modal (during login mismatch)
     */
    async function handleAuthImportIdentity(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const json = await file.text();

            // Detect file format
            const format = PinCrypto.detectFormat(json);

            if (format === 'encrypted') {
                // Store for PIN entry
                pendingIdentityJson = json;
                closeAuthModal();
                openPinEntryModal();
                return;
            }

            // Import unencrypted file directly
            const account = await Identity.importPrivate(json);

            // Hide error and import section
            elements.authError.classList.add('hidden');
            elements.authImportSection?.classList.add('hidden');

            // Pre-fill email if available and different from current
            if (account.email && !elements.authEmailInput.value) {
                elements.authEmailInput.value = account.email;
            }

            Toast.success('Identity imported successfully! Please enter your password and try again.');

        } catch (error) {
            console.error('Failed to import identity:', error);
            Toast.error('Failed to import identity: ' + error.message);
        } finally {
            // Clear file input so same file can be selected again
            event.target.value = '';
        }
    }

    // ===================
    // Device Management
    // ===================

    const DEVICE_ID_KEY = 'whereish_device_id';

    /**
     * Get device name from user agent
     */
    function getDeviceName() {
        const ua = navigator.userAgent;

        // Try to detect device type and browser
        if (/iPhone/.test(ua)) return 'iPhone';
        if (/iPad/.test(ua)) return 'iPad';
        if (/Android/.test(ua)) {
            if (/Mobile/.test(ua)) return 'Android Phone';
            return 'Android Tablet';
        }
        if (/Macintosh/.test(ua)) return 'Mac';
        if (/Windows/.test(ua)) return 'Windows PC';
        if (/Linux/.test(ua)) return 'Linux PC';

        return 'Web Browser';
    }

    /**
     * Get device platform from user agent
     */
    function getDevicePlatform() {
        const ua = navigator.userAgent;

        if (/iPhone|iPad/.test(ua)) return 'ios';
        if (/Android/.test(ua)) return 'android';
        if (/Macintosh/.test(ua)) return 'macos';
        if (/Windows/.test(ua)) return 'windows';
        if (/Linux/.test(ua)) return 'linux';

        return 'web';
    }

    /**
     * Get stored device ID
     */
    function getStoredDeviceId() {
        return localStorage.getItem(DEVICE_ID_KEY);
    }

    /**
     * Store device ID
     */
    function setStoredDeviceId(deviceId) {
        if (deviceId) {
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
            Model.setCurrentDeviceId(deviceId);
        } else {
            localStorage.removeItem(DEVICE_ID_KEY);
            Model.setCurrentDeviceId(null);
        }
    }

    /**
     * Load devices from server
     */
    async function loadDevices() {
        if (!API.isAuthenticated()) {
            Model.setDevices([]);
            return;
        }

        try {
            const devices = await API.getDevices();
            Model.setDevices(devices);

            // Check if our stored device ID is in the list
            const storedId = getStoredDeviceId();
            if (storedId) {
                const found = devices.find(d => d.id === storedId);
                if (!found) {
                    // Our device ID is no longer valid
                    setStoredDeviceId(null);
                }
            }
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    /**
     * Register this device with the server
     */
    async function registerCurrentDevice() {
        if (!API.isAuthenticated()) return;

        // Check if we already have a device ID
        const existingId = getStoredDeviceId();
        if (existingId) {
            // Verify it still exists on server
            const devices = Model.getDevices();
            if (devices.find(d => d.id === existingId)) {
                return; // Already registered
            }
        }

        try {
            const name = getDeviceName();
            const platform = getDevicePlatform();
            const device = await API.addDevice(name, platform);
            setStoredDeviceId(device.id);
            await loadDevices(); // Refresh device list
            console.log('Device registered:', device.name);
        } catch (error) {
            console.error('Failed to register device:', error);
        }
    }

    /**
     * Render devices list in settings
     */
    function renderDevicesList() {
        const listEl = document.getElementById('devices-list');
        const loadingEl = document.getElementById('devices-loading');
        const emptyEl = document.getElementById('devices-empty');

        if (!listEl) return;

        const devices = Model.getDevices();
        const currentDeviceId = getStoredDeviceId();

        // Hide loading
        if (loadingEl) loadingEl.classList.add('hidden');

        // Show empty state or list
        if (devices.length === 0) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }

        if (emptyEl) emptyEl.classList.add('hidden');

        listEl.innerHTML = devices.map(device => {
            const isCurrent = device.id === currentDeviceId;
            const isActive = device.isActive;
            const classes = ['device-item'];
            if (isCurrent) classes.push('current-device');
            if (isActive) classes.push('active-device');

            // Format last seen
            const lastSeen = device.lastSeen ? Model.formatTimeAgo(device.lastSeen) : '';

            // Build badges
            let badges = '';
            if (isActive) badges += '<span class="device-badge device-badge-active">Active</span>';
            if (isCurrent) badges += '<span class="device-badge device-badge-current">This device</span>';

            // Build actions
            let actions = '';
            if (!isActive) {
                actions += `<button class="device-btn device-btn-activate" data-device-id="${device.id}">Activate</button>`;
            }
            if (!isCurrent) {
                actions += `<button class="device-btn device-btn-delete" data-device-id="${device.id}">Remove</button>`;
            }

            return `
                <div class="${classes.join(' ')}" data-device-id="${device.id}">
                    <div class="device-info">
                        <div class="device-name">
                            ${Model.escapeHtml(device.name)}
                            ${badges}
                        </div>
                        <div class="device-meta">
                            ${device.platform ? Model.escapeHtml(device.platform) : 'Unknown platform'}
                            ${lastSeen ? ` · ${lastSeen}` : ''}
                        </div>
                    </div>
                    <div class="device-actions">
                        ${actions}
                    </div>
                </div>
            `;
        }).join('');

        // Attach event handlers
        listEl.querySelectorAll('.device-btn-activate').forEach(btn => {
            btn.addEventListener('click', handleActivateDevice);
        });
        listEl.querySelectorAll('.device-btn-delete').forEach(btn => {
            btn.addEventListener('click', handleDeleteDevice);
        });
    }

    /**
     * Handle activate device button click
     */
    async function handleActivateDevice(event) {
        const deviceId = event.target.dataset.deviceId;
        if (!deviceId) return;

        event.target.disabled = true;
        event.target.textContent = 'Activating...';

        try {
            await API.activateDevice(deviceId);
            await loadDevices();
            renderDevicesList();
            Toast.success('Device activated');
        } catch (error) {
            console.error('Failed to activate device:', error);
            Toast.error('Failed to activate device');
            event.target.disabled = false;
            event.target.textContent = 'Activate';
        }
    }

    /**
     * Handle delete device button click
     */
    async function handleDeleteDevice(event) {
        const deviceId = event.target.dataset.deviceId;
        if (!deviceId) return;

        const confirmed = await ConfirmModal.show({
            title: 'Remove Device',
            message: 'Remove this device from your account? You can re-add it later by signing in on that device.',
            confirmText: 'Remove',
            cancelText: 'Cancel',
            danger: true
        });

        if (!confirmed) return;

        event.target.disabled = true;
        event.target.textContent = 'Removing...';

        try {
            await API.deleteDevice(deviceId);
            await loadDevices();
            renderDevicesList();
            Toast.success('Device removed');
        } catch (error) {
            console.error('Failed to remove device:', error);
            Toast.error('Failed to remove device');
            event.target.disabled = false;
            event.target.textContent = 'Remove';
        }
    }

    // ===================
    // Identity Transfer (Source Device)
    // ===================

    let activeTransfer = null;
    let transferPollInterval = null;

    function openTransferSourceModal() {
        const modal = document.getElementById('transfer-source-modal');
        const pendingState = document.getElementById('transfer-source-pending');
        const claimedState = document.getElementById('transfer-source-claimed');
        const completeState = document.getElementById('transfer-source-complete');
        const footer = document.getElementById('transfer-source-footer');

        // Reset to pending state
        pendingState.classList.remove('hidden');
        claimedState.classList.add('hidden');
        completeState.classList.add('hidden');
        footer.classList.remove('hidden');

        modal.classList.remove('hidden');
        initTransfer();
    }

    function closeTransferSourceModal() {
        const modal = document.getElementById('transfer-source-modal');
        modal.classList.add('hidden');

        // Stop polling
        if (transferPollInterval) {
            clearInterval(transferPollInterval);
            transferPollInterval = null;
        }
        activeTransfer = null;
    }

    async function initTransfer() {
        const deviceId = getStoredDeviceId();
        if (!deviceId) {
            Toast.error('No device registered');
            closeTransferSourceModal();
            return;
        }

        try {
            const transfer = await API.createTransfer(deviceId);
            activeTransfer = transfer;

            // Update UI
            document.getElementById('transfer-code').textContent = transfer.code;

            // Calculate minutes remaining
            const expiresAt = new Date(transfer.expiresAt);
            const minutes = Math.ceil((expiresAt - Date.now()) / 60000);
            document.getElementById('transfer-expires').textContent = minutes;

            // Start polling for claim
            startTransferPolling();
        } catch (error) {
            console.error('Failed to create transfer:', error);
            Toast.error('Failed to create transfer');
            closeTransferSourceModal();
        }
    }

    function startTransferPolling() {
        if (transferPollInterval) clearInterval(transferPollInterval);

        transferPollInterval = setInterval(async () => {
            if (!activeTransfer) {
                clearInterval(transferPollInterval);
                return;
            }

            try {
                const status = await API.getTransferStatus(activeTransfer.id);
                activeTransfer = { ...activeTransfer, ...status };

                if (status.status === 'claimed') {
                    // Device claimed - show approval UI
                    showTransferClaimed(status.targetDevice);
                    clearInterval(transferPollInterval);
                    transferPollInterval = null;
                } else if (status.status === 'approved' || status.status === 'completed') {
                    showTransferComplete();
                    clearInterval(transferPollInterval);
                    transferPollInterval = null;
                }
            } catch (error) {
                if (error.message.includes('expired') || error.message.includes('410')) {
                    Toast.warning('Transfer expired');
                    closeTransferSourceModal();
                }
            }
        }, 2000); // Poll every 2 seconds
    }

    function showTransferClaimed(targetDevice) {
        document.getElementById('transfer-source-pending').classList.add('hidden');
        document.getElementById('transfer-source-claimed').classList.remove('hidden');
        document.getElementById('transfer-target-device').textContent = targetDevice?.name || 'Unknown Device';
        document.getElementById('transfer-pin').value = '';
        document.getElementById('transfer-source-error').classList.add('hidden');
    }

    function showTransferComplete() {
        document.getElementById('transfer-source-pending').classList.add('hidden');
        document.getElementById('transfer-source-claimed').classList.add('hidden');
        document.getElementById('transfer-source-complete').classList.remove('hidden');
        document.getElementById('transfer-source-footer').classList.add('hidden');
    }

    async function handleTransferApprove() {
        if (!activeTransfer) return;

        const pin = document.getElementById('transfer-pin').value;
        if (!pin) {
            document.getElementById('transfer-source-error').textContent = 'Please enter your PIN';
            document.getElementById('transfer-source-error').classList.remove('hidden');
            return;
        }

        const approveBtn = document.getElementById('transfer-approve-btn');
        approveBtn.disabled = true;
        approveBtn.textContent = 'Approving...';

        try {
            // Export encrypted identity with PIN
            const email = API.getUserEmail() || '';
            const encryptedJson = await Identity.exportEncrypted({ email, name: '' }, pin);

            // Send to server
            await API.approveTransfer(activeTransfer.id, encryptedJson);

            showTransferComplete();
            Toast.success('Transfer approved');
        } catch (error) {
            console.error('Failed to approve transfer:', error);
            document.getElementById('transfer-source-error').textContent = 'Failed to approve: ' + error.message;
            document.getElementById('transfer-source-error').classList.remove('hidden');
        } finally {
            approveBtn.disabled = false;
            approveBtn.textContent = 'Approve Transfer';
        }
    }

    async function handleTransferDeny() {
        if (!activeTransfer) return;

        try {
            await API.cancelTransfer(activeTransfer.id);
        } catch {
            // Ignore errors on cancel
        }
        closeTransferSourceModal();
        Toast.info('Transfer denied');
    }

    async function handleTransferCancel() {
        if (activeTransfer) {
            try {
                await API.cancelTransfer(activeTransfer.id);
            } catch {
                // Ignore errors on cancel
            }
        }
        closeTransferSourceModal();
    }

    // ===================
    // Identity Transfer (Receive Device)
    // ===================

    let receiveTransfer = null;
    let receivePollInterval = null;

    function openTransferReceiveModal() {
        const modal = document.getElementById('transfer-receive-modal');
        const enterState = document.getElementById('transfer-receive-enter');
        const waitingState = document.getElementById('transfer-receive-waiting');
        const pinState = document.getElementById('transfer-receive-pin');
        const completeState = document.getElementById('transfer-receive-complete');

        // Reset to enter state
        enterState.classList.remove('hidden');
        waitingState.classList.add('hidden');
        pinState.classList.add('hidden');
        completeState.classList.add('hidden');

        document.getElementById('transfer-receive-code').value = '';
        document.getElementById('transfer-receive-error').classList.add('hidden');

        modal.classList.remove('hidden');
        document.getElementById('transfer-receive-code').focus();
    }

    function closeTransferReceiveModal() {
        const modal = document.getElementById('transfer-receive-modal');
        modal.classList.add('hidden');

        if (receivePollInterval) {
            clearInterval(receivePollInterval);
            receivePollInterval = null;
        }
        receiveTransfer = null;
    }

    async function handleTransferReceiveSubmit() {
        const code = document.getElementById('transfer-receive-code').value.trim();
        const errorEl = document.getElementById('transfer-receive-error');

        if (!code || code.length !== 6) {
            errorEl.textContent = 'Please enter a 6-digit code';
            errorEl.classList.remove('hidden');
            return;
        }

        const submitBtn = document.getElementById('transfer-receive-submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting...';
        errorEl.classList.add('hidden');

        try {
            const result = await API.claimTransfer(code, getDeviceName(), getDevicePlatform());
            receiveTransfer = result;

            // Show waiting state
            document.getElementById('transfer-receive-enter').classList.add('hidden');
            document.getElementById('transfer-receive-waiting').classList.remove('hidden');
            document.getElementById('transfer-source-user').textContent = result.sourceUser;
            document.getElementById('transfer-source-device').textContent = result.sourceDevice;

            // Start polling for identity
            startReceivePolling();
        } catch (error) {
            console.error('Failed to claim transfer:', error);
            errorEl.textContent = error.message || 'Invalid or expired code';
            errorEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Connect';
        }
    }

    function startReceivePolling() {
        if (receivePollInterval) clearInterval(receivePollInterval);

        receivePollInterval = setInterval(async () => {
            if (!receiveTransfer) {
                clearInterval(receivePollInterval);
                return;
            }

            try {
                const result = await API.receiveTransferIdentity(receiveTransfer.transferId);

                if (result.status === 'approved' && result.encryptedIdentity) {
                    clearInterval(receivePollInterval);
                    receivePollInterval = null;
                    receiveTransfer.encryptedIdentity = result.encryptedIdentity;
                    showReceivePinState();
                }
            } catch (error) {
                if (error.message.includes('expired') || error.message.includes('410')) {
                    Toast.warning('Transfer expired or cancelled');
                    closeTransferReceiveModal();
                    clearInterval(receivePollInterval);
                }
            }
        }, 2000); // Poll every 2 seconds
    }

    function showReceivePinState() {
        document.getElementById('transfer-receive-waiting').classList.add('hidden');
        document.getElementById('transfer-receive-pin').classList.remove('hidden');
        document.getElementById('transfer-receive-pin-input').value = '';
        document.getElementById('transfer-receive-pin-error').classList.add('hidden');
        document.getElementById('transfer-receive-pin-input').focus();
    }

    async function handleReceiveImportIdentity() {
        if (!receiveTransfer || !receiveTransfer.encryptedIdentity) return;

        const pin = document.getElementById('transfer-receive-pin-input').value;
        const errorEl = document.getElementById('transfer-receive-pin-error');

        if (!pin) {
            errorEl.textContent = 'Please enter your PIN';
            errorEl.classList.remove('hidden');
            return;
        }

        const importBtn = document.getElementById('transfer-receive-pin-btn');
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
        errorEl.classList.add('hidden');

        try {
            // Import the identity
            await Identity.importEncrypted(receiveTransfer.encryptedIdentity, pin);

            // Store PIN test value
            const pinTest = await PinCrypto.encryptTestValue(pin);
            localStorage.setItem('whereish_pin_test', JSON.stringify(pinTest));
            localStorage.setItem('whereish_pin_last_check', Date.now().toString());

            // Show complete state
            document.getElementById('transfer-receive-pin').classList.add('hidden');
            document.getElementById('transfer-receive-complete').classList.remove('hidden');

            Toast.success('Identity imported successfully!');
        } catch (error) {
            console.error('Failed to import identity:', error);
            errorEl.textContent = 'Incorrect PIN or corrupted data';
            errorEl.classList.remove('hidden');
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = 'Import Identity';
        }
    }

    function handleReceiveComplete() {
        closeTransferReceiveModal();
        // Redirect to login
        openAuthModal(true);
    }

    // ===================
    // PIN Verification (Signal-style periodic check)
    // ===================

    // Configuration for periodic PIN checks
    const PIN_CHECK_CONFIG = {
        intervalDays: 14,  // Check every 14 days
        storageKeyTest: 'whereish_pin_test',
        storageKeyLastCheck: 'whereish_pin_last_check'
    };

    /**
     * Check if user should be prompted for PIN verification
     * @returns {boolean} True if PIN check is needed
     */
    function shouldPromptForPIN() {
        // Only check if user is authenticated and has PIN test data
        if (!API.isAuthenticated()) return false;

        const testData = localStorage.getItem(PIN_CHECK_CONFIG.storageKeyTest);
        if (!testData) return false;  // No PIN test data means legacy user or new signup

        const lastCheck = localStorage.getItem(PIN_CHECK_CONFIG.storageKeyLastCheck);
        if (!lastCheck) return true;  // Never checked before

        const daysSinceCheck = (Date.now() - parseInt(lastCheck, 10)) / (1000 * 60 * 60 * 24);
        return daysSinceCheck >= PIN_CHECK_CONFIG.intervalDays;
    }

    /**
     * Open the PIN verification modal
     */
    function openPinVerifyModal() {
        elements.pinVerifyModal.classList.remove('hidden');
        elements.pinVerifyForm.reset();
        elements.pinVerifyError.classList.add('hidden');
        elements.pinVerifySuccess.classList.add('hidden');
        elements.pinVerifyBtn.disabled = false;
        elements.pinVerifySkipBtn.disabled = false;
        elements.pinVerifyPin.focus();
    }

    /**
     * Close the PIN verification modal
     */
    function closePinVerifyModal() {
        elements.pinVerifyModal.classList.add('hidden');
        elements.pinVerifyForm.reset();
    }

    /**
     * Handle PIN verification form submission
     * @param {Event} event - Form submit event
     */
    async function handlePinVerifySubmit(event) {
        event.preventDefault();

        const pin = elements.pinVerifyPin.value;
        if (!pin) return;

        elements.pinVerifyBtn.disabled = true;
        elements.pinVerifyError.classList.add('hidden');
        elements.pinVerifySuccess.classList.add('hidden');

        try {
            const testDataJson = localStorage.getItem(PIN_CHECK_CONFIG.storageKeyTest);
            if (!testDataJson) {
                throw new Error('No PIN test data found');
            }

            const testData = JSON.parse(testDataJson);
            const isValid = await PinCrypto.verifyPIN(testData, pin);

            if (isValid) {
                // Success - update last check time
                localStorage.setItem(PIN_CHECK_CONFIG.storageKeyLastCheck, Date.now().toString());
                elements.pinVerifySuccess.classList.remove('hidden');

                // Close modal after a short delay
                setTimeout(() => {
                    closePinVerifyModal();
                }, 1500);
            } else {
                // Wrong PIN - show warning but allow continue
                elements.pinVerifyError.textContent = 'Incorrect PIN. If you\'ve forgotten your PIN, you may lose access to your account on new devices.';
                elements.pinVerifyError.classList.remove('hidden');
                elements.pinVerifyBtn.disabled = false;
            }
        } catch (error) {
            console.error('PIN verification error:', error);
            elements.pinVerifyError.textContent = 'Error verifying PIN. Please try again.';
            elements.pinVerifyError.classList.remove('hidden');
            elements.pinVerifyBtn.disabled = false;
        }
    }

    /**
     * Handle skip button click on PIN verification
     */
    function handlePinVerifySkip() {
        // Show warning toast about skipping
        Toast.warning('Remember: you\'ll need your PIN to recover your account on a new device.');
        closePinVerifyModal();
    }

    /**
     * Perform the periodic PIN check if needed
     * This should be called on app startup after authentication
     */
    function performPINCheckIfNeeded() {
        if (shouldPromptForPIN()) {
            // Small delay to let the UI settle
            setTimeout(() => {
                openPinVerifyModal();
            }, 500);
        }
    }

    // ===================
    // Contacts
    // ===================

    async function refreshContacts() {
        if (!API.isAuthenticated()) {
            contacts = [];
            Model.setContacts([]);
            renderContactsList();
            return;
        }

        try {
            // Get contacts with encrypted locations
            const rawContacts = await API.getContactsEncrypted();
            const identity = Identity.getCurrent();

            // Process each contact, decrypting their location if available
            contacts = rawContacts.map(contact => {
                const processed = {
                    id: contact.id,
                    contactId: contact.id,
                    name: contact.name,
                    publicKey: contact.publicKey,
                    permissionGranted: contact.permissionGranted,
                    permissionReceived: contact.permissionReceived,
                    location: null
                };

                // Try to decrypt location if we have identity and contact has encrypted location
                if (identity && contact.publicKey && contact.encryptedLocation && contact.encryptedLocation.blob) {
                    try {
                        const contactPublicKey = Crypto.decodeBase64(contact.publicKey);
                        const decrypted = Crypto.decryptFromContact(
                            contact.encryptedLocation.blob,
                            contactPublicKey,
                            identity.privateKey
                        );

                        processed.location = {
                            data: {
                                hierarchy: decrypted.hierarchy,
                                namedLocation: decrypted.namedLocation
                            },
                            updated_at: contact.encryptedLocation.updated_at,
                            stale: contact.encryptedLocation.stale
                        };
                    } catch (err) {
                        console.warn('Failed to decrypt location from', contact.name, ':', err.message);
                        processed.decryptionError = true;
                    }
                }

                return processed;
            });

            Model.setContacts(contacts);
            renderContactsList();
        } catch (error) {
            console.error('Failed to refresh contacts:', error);
        }
    }

    function renderContactsList() {
        if (!API.isAuthenticated()) {
            elements.contactsList.innerHTML = '<p class="empty-state">Select a user to see contacts</p>';
            return;
        }

        if (contacts.length === 0) {
            elements.contactsList.innerHTML = '<p class="empty-state">No contacts yet</p>';
            return;
        }

        elements.contactsList.innerHTML = contacts.map(contact => {
            const initial = contact.name.charAt(0).toUpperCase();
            const locationText = Model.getContactLocationText(contact);
            let locationClass = '';
            let timeText = '';
            let distanceText = '';

            if (contact.location) {
                locationClass = contact.location.stale ? 'stale' : '';

                if (contact.location.updated_at) {
                    timeText = Model.formatTimeAgo(contact.location.updated_at);
                }

                // Calculate distance if we have coordinates
                if (currentCoordinates && contact.latitude && contact.longitude) {
                    const distance = Geofence.calculateDistance(
                        currentCoordinates.latitude,
                        currentCoordinates.longitude,
                        contact.latitude,
                        contact.longitude
                    );
                    distanceText = Geofence.formatDistance(distance);
                }
            }

            return `
                <div class="contact-item contact-item-simple" data-id="${contact.id}">
                    <div class="contact-avatar">${initial}</div>
                    <div class="contact-info">
                        <div class="contact-name">${Model.escapeHtml(contact.name)}</div>
                        <div class="contact-location ${locationClass}">${Model.escapeHtml(locationText)}</div>
                    </div>
                    <div class="contact-meta">
                        ${distanceText ? `<div class="contact-distance-simple">${distanceText}</div>` : ''}
                        ${timeText ? `<div class="contact-time">${timeText}</div>` : ''}
                    </div>
                    <div class="contact-chevron">&rsaquo;</div>
                </div>
            `;
        }).join('');

        // Add click handlers to contact items
        elements.contactsList.querySelectorAll('.contact-item').forEach(item => {
            item.addEventListener('click', () => {
                const contactId = item.dataset.id;
                const contact = contacts.find(c => c.id === contactId || c.contactId === contactId);
                if (contact) {
                    // Ensure contactId is set for API calls
                    contact.contactId = contact.contactId || contact.id;
                    openContactDetail(contact);
                }
            });
            item.style.cursor = 'pointer';
        });
    }

    // ===================
    // Contact Requests
    // ===================

    async function loadContactRequests() {
        console.log('[loadContactRequests] Called, authenticated:', API.isAuthenticated());
        if (!API.isAuthenticated()) return;

        try {
            console.log('[loadContactRequests] Fetching requests from API');
            const requests = await API.getContactRequests();
            const incoming = requests.incoming || [];
            const outgoing = requests.outgoing || [];
            console.log('[loadContactRequests] Got requests - incoming:', incoming.length, 'outgoing:', outgoing.length);

            // Sync with Model
            Model.setContactRequests({ incoming: incoming, outgoing: outgoing });

            renderIncomingRequests(incoming);
            renderOutgoingRequests(outgoing);
            updatePendingRequestsVisibility(incoming.length > 0 || outgoing.length > 0);
            console.log('[loadContactRequests] Done');
        } catch (error) {
            console.error('[loadContactRequests] Error:', error);
        }
    }

    function updatePendingRequestsVisibility(hasRequests) {
        elements.pendingRequests.classList.toggle('hidden', !hasRequests);
    }

    function renderIncomingRequests(incoming) {
        if (incoming.length === 0) {
            elements.incomingRequests.innerHTML = '';
            return;
        }

        elements.incomingRequests.innerHTML = `
            <div class="requests-section-header">Incoming Requests</div>
            ${incoming.map(req => `
                <div class="request-item" data-request-id="${req.requestId}">
                    <div class="request-info">
                        <div class="request-avatar">${(req.name || req.email || '?')[0].toUpperCase()}</div>
                        <div>
                            <div class="request-name">${Model.escapeHtml(req.name || req.email)}</div>
                            ${req.name ? `<div class="request-email">${Model.escapeHtml(req.email)}</div>` : ''}
                            ${req.createdAt ? `<div class="request-time">${Model.formatTimeAgo(req.createdAt)}</div>` : ''}
                        </div>
                    </div>
                    <div class="request-actions">
                        <button class="btn btn-small btn-primary accept-request-btn" data-id="${req.requestId}">Accept</button>
                        <button class="btn btn-small decline-request-btn" data-id="${req.requestId}">Decline</button>
                    </div>
                </div>
            `).join('')}
        `;

        // Attach handlers
        elements.incomingRequests.querySelectorAll('.accept-request-btn').forEach(btn => {
            btn.addEventListener('click', handleAcceptRequest);
        });
        elements.incomingRequests.querySelectorAll('.decline-request-btn').forEach(btn => {
            btn.addEventListener('click', handleDeclineRequest);
        });
    }

    function renderOutgoingRequests(outgoing) {
        if (outgoing.length === 0) {
            elements.outgoingRequests.innerHTML = '';
            return;
        }

        elements.outgoingRequests.innerHTML = `
            <div class="requests-section-header">Sent Requests</div>
            ${outgoing.map(req => `
                <div class="request-item request-item-outgoing" data-request-id="${req.requestId}">
                    <div class="request-info">
                        <span class="request-icon">📤</span>
                        <div>
                            <div class="request-email">${Model.escapeHtml(req.email)}</div>
                            <div class="request-time">${Model.formatTimeAgo(req.createdAt)}</div>
                        </div>
                    </div>
                    <button class="btn btn-small btn-secondary cancel-request-btn" data-id="${req.requestId}">Cancel</button>
                </div>
            `).join('')}
        `;

        // Attach handlers
        elements.outgoingRequests.querySelectorAll('.cancel-request-btn').forEach(btn => {
            btn.addEventListener('click', handleCancelRequest);
        });
    }

    async function handleAcceptRequest(event) {
        const requestId = event.target.dataset.id;
        event.target.disabled = true;

        try {
            await API.acceptContactRequest(requestId);
            await refreshContacts();
            await loadContactRequests();
        } catch (error) {
            console.error('Failed to accept request:', error);
            Toast.error('Failed to accept request. Please try again.');
            event.target.disabled = false;
        }
    }

    async function handleDeclineRequest(event) {
        const requestId = event.target.dataset.id;
        event.target.disabled = true;

        try {
            await API.declineContactRequest(requestId);
            await loadContactRequests();
        } catch (error) {
            console.error('Failed to decline request:', error);
            Toast.error('Failed to decline request. Please try again.');
            event.target.disabled = false;
        }
    }

    async function handleCancelRequest(event) {
        const requestId = event.target.dataset.id;
        event.target.disabled = true;

        try {
            await API.cancelContactRequest(requestId);
            await loadContactRequests();
        } catch (error) {
            console.error('Failed to cancel request:', error);
            Toast.error('Failed to cancel request. Please try again.');
            event.target.disabled = false;
        }
    }

    function openAddContactModal() {
        elements.addContactModal.classList.remove('hidden');
        elements.addContactError.classList.add('hidden');
        elements.addContactForm.reset();
        elements.contactEmailInput.focus();
    }

    function closeAddContactModal() {
        elements.addContactModal.classList.add('hidden');
        elements.addContactForm.reset();
        elements.addContactError.classList.add('hidden');
    }

    async function handleAddContact(event) {
        event.preventDefault();
        elements.addContactError.classList.add('hidden');

        const email = elements.contactEmailInput.value.trim();

        try {
            console.log('[handleAddContact] Sending request to:', email);
            await API.sendContactRequest(email);
            console.log('[handleAddContact] Request sent, closing modal');
            closeAddContactModal();
            console.log('[handleAddContact] Modal closed, showing toast');
            Toast.success('Contact request sent!');
            console.log('[handleAddContact] Toast shown, refreshing requests');
            // Refresh the requests list so the outgoing request appears immediately
            await loadContactRequests();
            console.log('[handleAddContact] Requests refreshed');
        } catch (error) {
            console.error('[handleAddContact] Error:', error);
            elements.addContactError.textContent = error.message;
            elements.addContactError.classList.remove('hidden');
        }
    }

    // ===================
    // Contact Detail UI
    // ===================

    function openContactDetail(contact) {
        selectedContact = contact;
        Model.setSelectedContact(contact);
        ViewManager.navigate('contact-detail', { contactId: contact.contactId });
    }

    function renderContactDetail() {
        if (!selectedContact) return;

        const contact = selectedContact;
        const firstName = contact.name.split(' ')[0];

        // Update header
        document.getElementById('contact-detail-name').textContent = contact.name;

        // Update contact info
        document.getElementById('contact-avatar-large').textContent =
            contact.name.charAt(0).toUpperCase();
        document.getElementById('contact-detail-fullname').textContent = contact.name;
        document.getElementById('contact-detail-email').textContent = contact.email;

        // Update first name placeholders
        document.querySelectorAll('.contact-first-name').forEach(el => {
            el.textContent = firstName;
        });

        // Update their location (model provides default for contacts without data)
        const locationDisplay = document.getElementById('contact-location-display');
        const distanceEl = document.getElementById('contact-distance');
        const lastUpdatedEl = document.getElementById('contact-last-updated');
        const openMapsLink = document.getElementById('open-in-maps-link');

        const locationText = Model.getContactLocationText(contact);
        locationDisplay.innerHTML = `<span class="location-text">${Model.escapeHtml(locationText)}</span>`;

        // Calculate distance if we have coordinates
        if (currentCoordinates && contact.latitude && contact.longitude) {
            const distance = Geofence.calculateDistance(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                contact.latitude,
                contact.longitude
            );
            distanceEl.textContent = Geofence.formatDistance(distance) + ' away';
        } else {
            distanceEl.textContent = '';
        }

        // Show last updated
        if (contact.location && contact.location.updated_at) {
            lastUpdatedEl.textContent = 'Last updated ' + Model.formatTimeAgo(contact.location.updated_at);
        } else {
            lastUpdatedEl.textContent = '';
        }

        // Show "Open in Maps" link when coordinates are available
        if (contact.latitude && contact.longitude) {
            openMapsLink.href = `https://www.google.com/maps?q=${contact.latitude},${contact.longitude}`;
            openMapsLink.classList.remove('hidden');
        } else {
            openMapsLink.classList.add('hidden');
        }

        // Update permission dropdown
        const permissionSelect = document.getElementById('detail-permission-select');
        permissionSelect.innerHTML = permissionLevels.map(level => `
            <option value="${level}" ${contact.permissionGranted === level ? 'selected' : ''}>
                ${level.charAt(0).toUpperCase() + level.slice(1)}
            </option>
        `).join('');

        // Update permission preview
        updatePermissionPreview(contact.permissionGranted);

        // Update received permission level
        document.getElementById('received-permission-level').textContent =
            contact.permissionReceived ?
                contact.permissionReceived.charAt(0).toUpperCase() + contact.permissionReceived.slice(1) :
                'Not shared';
    }

    function updatePermissionPreview(level) {
        const previewEl = document.getElementById('permission-preview-value');
        if (!currentHierarchy) {
            previewEl.textContent = '--';
            return;
        }

        // Show what the contact would see at this permission level
        const filteredHierarchy = Model.getFilteredHierarchy(currentHierarchy, level);
        previewEl.textContent = Model.getLocationText(filteredHierarchy);
    }

    async function handleDetailPermissionChange(event) {
        if (!selectedContact) return;

        const newLevel = event.target.value;
        const select = event.target;

        select.disabled = true;
        try {
            await API.updateContactPermission(selectedContact.contactId, newLevel);
            selectedContact.permissionGranted = newLevel;
            updatePermissionPreview(newLevel);

            // Republish location so the change takes effect immediately
            await publishLocationToServer();

            // Also update the contact in the main list
            const contactIndex = contacts.findIndex(c => c.contactId === selectedContact.contactId);
            if (contactIndex !== -1) {
                contacts[contactIndex].permissionGranted = newLevel;
            }

            // Visual feedback
            select.classList.add('updated');
            setTimeout(() => select.classList.remove('updated'), 1000);
        } catch (error) {
            console.error('Failed to update permission:', error);
            Toast.error('Failed to update permission. Please try again.');
            // Revert selection
            select.value = selectedContact.permissionGranted;
        }
        select.disabled = false;
    }

    async function handleRemoveContact() {
        if (!selectedContact) return;

        const confirmed = await ConfirmModal.show({
            title: 'Remove Contact',
            message: `Remove ${selectedContact.name} from your contacts?`,
            confirmText: 'Remove',
            cancelText: 'Cancel',
            danger: true
        });

        if (confirmed) {
            try {
                await API.removeContact(selectedContact.contactId);
                contacts = contacts.filter(c => c.contactId !== selectedContact.contactId);
                Model.setContacts(contacts);
                selectedContact = null;
                Model.setSelectedContact(null);
                ViewManager.goBack();
                renderContactsList();
            } catch (error) {
                console.error('Failed to remove contact:', error);
                Toast.error('Failed to remove contact. Please try again.');
            }
        }
    }

    // ===================
    // Named Locations UI
    // ===================

    // getVisibilityIndicator moved to Model.getVisibilityIndicator

    function renderPlacesList() {
        if (!elements.placesList) return;

        if (namedLocations.length === 0) {
            elements.placesList.innerHTML = `
                <p class="empty-state">No saved places yet. Save your current location to get started.</p>
            `;
            return;
        }

        elements.placesList.innerHTML = namedLocations.map(location => {
            const isActive = currentMatch && currentMatch.id === location.id;
            const distance = currentCoordinates
                ? Geofence.calculateDistance(
                    currentCoordinates.latitude,
                    currentCoordinates.longitude,
                    location.latitude,
                    location.longitude
                )
                : null;

            const distanceText = distance !== null
                ? Geofence.formatDistance(distance)
                : '';

            const visibilityInfo = Model.getVisibilityIndicator(location.visibility);

            return `
                <div class="named-location-item ${isActive ? 'active' : ''}" data-id="${location.id}">
                    <span class="location-item-icon">${isActive ? '📍' : '🏠'}</span>
                    <div class="location-item-content">
                        <div class="location-item-label">${Model.escapeHtml(location.label)}</div>
                        <div class="location-item-meta">
                            ${location.radiusMeters}m radius${distanceText ? ` • ${distanceText} away` : ''}
                        </div>
                    </div>
                    <div class="location-item-visibility" title="${visibilityInfo.tooltip}">
                        ${visibilityInfo.icon}
                    </div>
                    <div class="location-item-actions">
                        <button class="btn btn-small edit-location-btn" data-id="${location.id}" title="Edit">
                            ✏️
                        </button>
                        <button class="btn btn-danger delete-location-btn" data-id="${location.id}" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        elements.placesList.querySelectorAll('.delete-location-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteLocation);
        });

        elements.placesList.querySelectorAll('.edit-location-btn').forEach(btn => {
            btn.addEventListener('click', handleEditLocation);
        });
    }

    // Keep alias for backward compatibility in init
    function renderNamedLocationsList() {
        renderPlacesList();
    }

    async function handleDeleteLocation(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const location = namedLocations.find(loc => loc.id === id);

        if (!location) return;

        const confirmed = await ConfirmModal.show({
            title: 'Delete Place',
            message: `Delete "${location.label}"?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true
        });

        if (confirmed) {
            try {
                await Storage.deleteNamedLocation(id);
                namedLocations = namedLocations.filter(loc => loc.id !== id);

                // Sync with Model
                Model.removePlace(id);

                if (currentCoordinates) {
                    currentMatch = Geofence.findBestMatch(
                        currentCoordinates.latitude,
                        currentCoordinates.longitude,
                        namedLocations
                    );
                    Model.setCurrentMatch(currentMatch);
                }

                renderNamedLocationsList();
                displayLocation(currentHierarchy, currentMatch);
            } catch (error) {
                console.error('Failed to delete location:', error);
                Toast.error('Failed to delete location. Please try again.');
            }
        }
    }

    // ===================
    // Edit Place Modal
    // ===================

    function handleEditLocation(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const location = namedLocations.find(loc => loc.id === id);

        if (location) {
            openEditPlaceModal(location);
        }
    }

    function openEditPlaceModal(place) {
        editingPlace = place;
        elements.editPlaceModal.classList.remove('hidden');
        elements.editPlaceError.classList.add('hidden');

        // Populate form fields
        elements.editPlaceLabelInput.value = place.label;
        elements.editPlaceRadiusSelect.value = place.radiusMeters.toString();

        // Set visibility radio
        const visibility = place.visibility || { mode: 'private', contactIds: [] };
        const radioValue = visibility.mode;
        const radio = elements.editPlaceForm.querySelector(`input[name="visibility"][value="${radioValue}"]`);
        if (radio) radio.checked = true;

        // Populate contact selector
        renderVisibilityContactSelector(visibility.contactIds || []);
        updateContactSelectorVisibility();

        elements.editPlaceLabelInput.focus();
    }

    function closeEditPlaceModal() {
        elements.editPlaceModal.classList.add('hidden');
        elements.editPlaceForm.reset();
        elements.editPlaceError.classList.add('hidden');
        editingPlace = null;
    }

    function renderVisibilityContactSelector(selectedContactIds) {
        if (contacts.length === 0) {
            elements.visibilityContactSelector.innerHTML = '<p class="empty-state">No contacts to select</p>';
            return;
        }

        elements.visibilityContactSelector.innerHTML = contacts.map(contact => {
            const contactId = contact.contactId || contact.id;
            const isChecked = selectedContactIds.includes(contactId);
            return `
                <label class="contact-checkbox">
                    <input type="checkbox" value="${contactId}" ${isChecked ? 'checked' : ''}>
                    <span>${Model.escapeHtml(contact.name)}</span>
                </label>
            `;
        }).join('');
    }

    function updateContactSelectorVisibility() {
        const selectedMode = elements.editPlaceForm.querySelector('input[name="visibility"]:checked')?.value;
        elements.visibilityContactSelector.classList.toggle('hidden', selectedMode !== 'selected');
    }

    function getVisibilityFromForm() {
        const mode = elements.editPlaceForm.querySelector('input[name="visibility"]:checked')?.value || 'private';

        if (mode === 'selected') {
            const checkboxes = elements.visibilityContactSelector.querySelectorAll('input[type="checkbox"]:checked');
            const contactIds = Array.from(checkboxes).map(cb => cb.value);
            return { mode: 'selected', contactIds };
        }

        return { mode, contactIds: [] };
    }

    async function handleEditPlaceSubmit(event) {
        event.preventDefault();

        if (!editingPlace) {
            closeEditPlaceModal();
            return;
        }

        const label = elements.editPlaceLabelInput.value.trim();
        const radius = parseInt(elements.editPlaceRadiusSelect.value, 10);
        const visibility = getVisibilityFromForm();

        if (!label) {
            elements.editPlaceError.textContent = 'Please enter a name for this place.';
            elements.editPlaceError.classList.remove('hidden');
            return;
        }

        try {
            const updatedPlace = await Storage.saveNamedLocation({
                ...editingPlace,
                label,
                radiusMeters: radius,
                visibility
            });

            // Update in local array
            const index = namedLocations.findIndex(loc => loc.id === editingPlace.id);
            if (index !== -1) {
                namedLocations[index] = updatedPlace;
            }

            // Sync with Model
            Model.updatePlace(editingPlace.id, updatedPlace);

            // Update currentMatch if editing the currently matched place
            if (currentMatch && currentMatch.id === editingPlace.id) {
                currentMatch = updatedPlace;
                Model.setCurrentMatch(currentMatch);
            }

            closeEditPlaceModal();
            renderNamedLocationsList();
            displayLocation(currentHierarchy, currentMatch);

            // Republish location to update visibility
            await publishLocationToServer();

        } catch (error) {
            console.error('Failed to update place:', error);
            elements.editPlaceError.textContent = 'Failed to save changes. Please try again.';
            elements.editPlaceError.classList.remove('hidden');
        }
    }

    // ===================
    // Modal Handling
    // ===================

    function openModal() {
        elements.modal.classList.remove('hidden');
        elements.locationLabelInput.value = '';
        elements.locationLabelInput.focus();

        if (currentHierarchy) {
            const locationText = Model.findMostSpecificLevel(currentHierarchy) || 'Current location';
            elements.modalCurrentLocation.textContent = locationText;
        }
    }

    function closeModal() {
        elements.modal.classList.add('hidden');
        elements.modalForm.reset();
    }

    async function handleSaveLocation(event) {
        event.preventDefault();

        if (!currentCoordinates) {
            Toast.warning('No location available. Please refresh your location first.');
            return;
        }

        if (!currentUserId) {
            Toast.warning('Please log in to save locations.');
            return;
        }

        const label = elements.locationLabelInput.value.trim();
        const radius = parseInt(elements.locationRadiusSelect.value, 10);

        if (!label) {
            Toast.warning('Please enter a name for this location.');
            return;
        }

        try {
            const newLocation = await Storage.saveNamedLocation({
                userId: currentUserId,
                label,
                latitude: currentCoordinates.latitude,
                longitude: currentCoordinates.longitude,
                radiusMeters: radius
            });

            namedLocations.push(newLocation);

            // Sync with Model
            Model.addPlace(newLocation);

            currentMatch = Geofence.findBestMatch(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                namedLocations
            );
            Model.setCurrentMatch(currentMatch);

            closeModal();
            renderNamedLocationsList();
            displayLocation(currentHierarchy, currentMatch);

            // Publish updated location to server
            await publishLocationToServer();

        } catch (error) {
            console.error('Failed to save location:', error);
            Toast.error('Failed to save location. Please try again.');
        }
    }

    // ===================
    // Location Publishing
    // ===================

    async function publishLocationToServer() {
        if (!serverConnected || !API.isAuthenticated()) {
            return;
        }

        if (!currentHierarchy) {
            return;
        }

        // Require identity for E2E encryption
        const identity = Identity.getCurrent();
        if (!identity) {
            // Expected during setup (after auth but before PIN/identity creation)
            console.debug('No identity yet - skipping location publish');
            return;
        }

        try {
            // Get contacts with their public keys and permission levels
            const contactsWithKeys = await API.getContactsEncrypted();
            const encryptedLocations = [];

            for (const contact of contactsWithKeys) {
                // Skip contacts without public keys (haven't upgraded to E2E)
                if (!contact.publicKey) {
                    continue;
                }

                // Get permission level I've granted to this contact
                const permissionLevel = contact.permissionGranted || 'city';

                // Filter hierarchy based on permission level
                const filteredHierarchy = Model.getFilteredHierarchy(currentHierarchy, permissionLevel);

                // Build named location if visible to this contact
                let namedLocation = null;
                if (currentMatch) {
                    const visibility = currentMatch.visibility || { mode: 'private', contactIds: [] };
                    const contactIdStr = String(contact.id);

                    if (visibility.mode === 'all') {
                        namedLocation = currentMatch.label;
                    } else if (visibility.mode === 'selected') {
                        // Check if this contact is in the selected list
                        const selectedIds = (visibility.contactIds || []).map(String);
                        if (selectedIds.includes(contactIdStr)) {
                            namedLocation = currentMatch.label;
                        }
                    }
                    // 'private' mode: namedLocation stays null
                }

                // Build the location data for this contact
                const locationData = {
                    hierarchy: filteredHierarchy,
                    namedLocation: namedLocation,
                    timestamp: Date.now()
                };

                // Encrypt for this contact
                const contactPublicKey = Crypto.decodeBase64(contact.publicKey);
                const encryptedBlob = Crypto.encryptForContact(
                    locationData,
                    contactPublicKey,
                    identity.privateKey
                );

                encryptedLocations.push({
                    contactId: contact.id,
                    blob: encryptedBlob
                });
            }

            if (encryptedLocations.length > 0) {
                await API.publishEncryptedLocations(encryptedLocations);
                console.log('Encrypted location published to', encryptedLocations.length, 'contacts');
            } else {
                console.log('No contacts with public keys to publish to');
            }
        } catch (error) {
            console.error('Failed to publish encrypted location:', error);
        }
    }

    // ===================
    // Main Location Flow
    // ===================

    async function updateLocation() {
        Model.setLocationLoading();
        showLoading();

        try {
            const position = await getCurrentPosition();
            currentCoordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            // Update location bar to show geocoding progress
            const primaryEl = document.getElementById('location-bar-primary');
            if (primaryEl) primaryEl.textContent = 'Getting location name...';

            const addressComponents = await reverseGeocode(
                currentCoordinates.latitude,
                currentCoordinates.longitude
            );

            currentHierarchy = Model.buildHierarchy(addressComponents);

            // Update Model state (emits LOCATION_CHANGED event)
            Model.setLocation(currentCoordinates, currentHierarchy);

            currentMatch = Geofence.findBestMatch(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                namedLocations
            );
            Model.setCurrentMatch(currentMatch);

            displayLocation(currentHierarchy, currentMatch);
            renderWelcomeHierarchy();  // Also update welcome screen
            renderNamedLocationsList();
            saveLastLocation();

            // Publish to server
            await publishLocationToServer();

        } catch (error) {
            console.error('Location error:', error);
            Model.setLocationError(error.message);
            showError(error.message);
        }
    }

    // ===================
    // Persistence
    // ===================

    function saveLastLocation() {
        try {
            const location = Model.getLocation();
            localStorage.setItem('whereish_lastLocation', JSON.stringify({
                coordinates: location.coordinates,
                hierarchy: location.hierarchy,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('Could not save location to localStorage:', e);
        }
    }

    function loadLastLocation() {
        try {
            const stored = localStorage.getItem('whereish_lastLocation');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Could not load location from localStorage:', e);
        }
        return null;
    }

    async function loadNamedLocations() {
        try {
            namedLocations = await Storage.getAllNamedLocations(currentUserId);
            Model.setPlaces(namedLocations);
        } catch (error) {
            console.error('Failed to load named locations:', error);
            namedLocations = [];
            Model.setPlaces([]);
        }
    }

    // ===================
    // Timers
    // ===================

    function startContactsRefreshTimer() {
        if (contactsRefreshTimer) {
            clearInterval(contactsRefreshTimer);
        }
        contactsRefreshTimer = setInterval(async () => {
            await refreshContacts();
            await loadContactRequests();
        }, Model.CONFIG.contactsRefreshInterval);
    }

    function startLocationPublishTimer() {
        if (locationPublishTimer) {
            clearInterval(locationPublishTimer);
        }
        locationPublishTimer = setInterval(async () => {
            await updateLocation();
        }, Model.CONFIG.locationPublishInterval);
    }

    // ===================
    // Event Handlers
    // ===================

    function setupEventListeners() {
        // Location buttons
        elements.refreshBtn.addEventListener('click', updateLocation);
        elements.retryBtn.addEventListener('click', updateLocation);
        elements.saveLocationBtn.addEventListener('click', openModal);

        // Save location modal
        elements.modalCloseBtn.addEventListener('click', closeModal);
        elements.modalCancelBtn.addEventListener('click', closeModal);
        elements.modalForm.addEventListener('submit', handleSaveLocation);
        elements.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

        // Settings button
        elements.settingsBtn?.addEventListener('click', () => ViewManager.navigate('settings'));
        document.getElementById('settings-back-btn')?.addEventListener('click', () => ViewManager.goBack());
        elements.settingsLogoutBtn?.addEventListener('click', handleLogout);
        elements.forceRefreshBtn?.addEventListener('click', forceRefresh);
        elements.exportIdentityBtn?.addEventListener('click', handleExportIdentity);
        elements.deleteIdentityBtn?.addEventListener('click', handleDeleteIdentity);
        elements.deleteAccountBtn?.addEventListener('click', handleDeleteAccount);

        // Delete account view
        document.getElementById('delete-account-form')?.addEventListener('submit', handleDeleteAccountSubmit);
        document.getElementById('delete-account-back-btn')?.addEventListener('click', () => ViewManager.goBack());
        document.getElementById('delete-account-cancel-btn')?.addEventListener('click', () => ViewManager.goBack());

        // Welcome screen buttons
        document.getElementById('welcome-login-btn')?.addEventListener('click', () => openAuthModal(true));

        // Identity import (welcome screen)
        elements.importIdentityBtn?.addEventListener('click', () => elements.identityFileInput?.click());
        elements.identityFileInput?.addEventListener('change', handleImportIdentity);

        // Identity import (auth modal - for login mismatch)
        elements.authImportBtn?.addEventListener('click', () => elements.authIdentityFile?.click());
        elements.authIdentityFile?.addEventListener('change', handleAuthImportIdentity);

        // Tab bar
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                if (tabName && !tab.disabled) {
                    ViewManager.navigate(tabName);
                }
            });
        });

        // Auth modal
        elements.authModalCloseBtn.addEventListener('click', closeAuthModal);
        elements.authForm.addEventListener('submit', handleAuthSubmit);
        elements.authModal.querySelector('.modal-backdrop').addEventListener('click', closeAuthModal);
        elements.authShowPassword.addEventListener('change', () => {
            const type = elements.authShowPassword.checked ? 'text' : 'password';
            elements.authPasswordInput.type = type;
            elements.authConfirmInput.type = type;
        });

        // Google Sign-In
        elements.googleSignInBtn?.addEventListener('click', handleGoogleSignIn);

        // PIN Setup modal
        elements.pinSetupForm?.addEventListener('submit', handlePinSetup);
        elements.pinSetupModal?.querySelector('.modal-backdrop')?.addEventListener('click', closePinSetupModal);
        elements.pinSetupShow?.addEventListener('change', () => {
            const type = elements.pinSetupShow.checked ? 'text' : 'password';
            elements.pinSetupPin.type = type;
            elements.pinSetupConfirm.type = type;
        });

        // PIN Entry modal
        elements.pinEntryForm?.addEventListener('submit', handlePinEntry);
        elements.pinEntryCloseBtn?.addEventListener('click', closePinEntryModal);
        elements.pinEntryCancelBtn?.addEventListener('click', closePinEntryModal);
        elements.pinEntryModal?.querySelector('.modal-backdrop')?.addEventListener('click', closePinEntryModal);
        elements.pinEntryShow?.addEventListener('change', () => {
            const type = elements.pinEntryShow.checked ? 'text' : 'password';
            elements.pinEntryPin.type = type;
        });

        // PIN Verification modal (periodic check)
        elements.pinVerifyForm?.addEventListener('submit', handlePinVerifySubmit);
        elements.pinVerifySkipBtn?.addEventListener('click', handlePinVerifySkip);
        elements.pinVerifyModal?.querySelector('.modal-backdrop')?.addEventListener('click', handlePinVerifySkip);
        elements.pinVerifyShow?.addEventListener('change', () => {
            const type = elements.pinVerifyShow.checked ? 'text' : 'password';
            elements.pinVerifyPin.type = type;
        });

        // Transfer Source modal (initiate transfer)
        document.getElementById('transfer-to-device-btn')?.addEventListener('click', openTransferSourceModal);
        document.getElementById('transfer-source-close-btn')?.addEventListener('click', closeTransferSourceModal);
        document.getElementById('transfer-source-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeTransferSourceModal);
        document.getElementById('transfer-approve-btn')?.addEventListener('click', handleTransferApprove);
        document.getElementById('transfer-deny-btn')?.addEventListener('click', handleTransferDeny);
        document.getElementById('transfer-cancel-btn')?.addEventListener('click', handleTransferCancel);
        document.getElementById('transfer-done-btn')?.addEventListener('click', closeTransferSourceModal);

        // Transfer Receive modal (enter code from another device)
        document.getElementById('welcome-transfer-btn')?.addEventListener('click', openTransferReceiveModal);
        document.getElementById('transfer-receive-close-btn')?.addEventListener('click', closeTransferReceiveModal);
        document.getElementById('transfer-receive-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeTransferReceiveModal);
        document.getElementById('transfer-receive-cancel-btn')?.addEventListener('click', closeTransferReceiveModal);
        document.getElementById('transfer-receive-submit-btn')?.addEventListener('click', handleTransferReceiveSubmit);
        document.getElementById('transfer-receive-pin-btn')?.addEventListener('click', handleReceiveImportIdentity);
        document.getElementById('transfer-receive-done-btn')?.addEventListener('click', handleReceiveComplete);

        // Add contact
        elements.addContactBtn.addEventListener('click', openAddContactModal);
        elements.addContactCloseBtn.addEventListener('click', closeAddContactModal);
        elements.addContactCancelBtn.addEventListener('click', closeAddContactModal);
        elements.addContactForm.addEventListener('submit', handleAddContact);
        elements.addContactModal.querySelector('.modal-backdrop').addEventListener('click', closeAddContactModal);

        // Contacts
        elements.refreshContactsBtn.addEventListener('click', refreshContacts);

        // Edit place modal
        elements.editPlaceCloseBtn?.addEventListener('click', closeEditPlaceModal);
        elements.editPlaceCancelBtn?.addEventListener('click', closeEditPlaceModal);
        elements.editPlaceForm?.addEventListener('submit', handleEditPlaceSubmit);
        elements.editPlaceModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeEditPlaceModal);

        // Visibility radio change - show/hide contact selector
        elements.editPlaceForm?.querySelectorAll('input[name="visibility"]').forEach(radio => {
            radio.addEventListener('change', updateContactSelectorVisibility);
        });

        // Contact detail
        document.getElementById('contact-detail-back-btn')?.addEventListener('click', () => ViewManager.goBack());
        document.getElementById('detail-permission-select')?.addEventListener('change', handleDetailPermissionChange);
        document.getElementById('remove-contact-btn')?.addEventListener('click', handleRemoveContact);

        // Escape key: close modals first, then navigate back
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                // First, try to close any open modal
                if (!elements.modal.classList.contains('hidden')) {
                    closeModal();
                    return;
                }
                if (!elements.authModal.classList.contains('hidden')) {
                    closeAuthModal();
                    return;
                }
                if (!elements.addContactModal.classList.contains('hidden')) {
                    closeAddContactModal();
                    return;
                }
                if (!elements.editPlaceModal.classList.contains('hidden')) {
                    closeEditPlaceModal();
                    return;
                }
                // No modal open - navigate back if possible
                if (ViewManager.canGoBack()) {
                    ViewManager.goBack();
                }
            }
        });
    }

    // ===================
    // Service Worker
    // ===================

    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('ServiceWorker registered:', registration.scope);
            } catch (error) {
                console.warn('ServiceWorker registration failed:', error);
            }
        }
    }

    /**
     * Force refresh: clear all caches and reload the app
     * Used for manual refresh button and after logout
     */
    async function forceRefresh() {
        try {
            // Unregister all service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(r => r.unregister()));
            }

            // Clear all caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }

            // Hard reload (bypass cache)
            window.location.reload(true);
        } catch (error) {
            console.error('Force refresh failed:', error);
            // Fall back to regular reload
            window.location.reload();
        }
    }

    // ===================
    // PWA Install Prompt
    // ===================

    let deferredInstallPrompt = null;

    function isRunningStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function shouldShowInstallPrompt() {
        // Don't show if already installed
        if (isRunningStandalone()) {
            return false;
        }

        // Check if user dismissed recently (within 7 days)
        const dismissedAt = localStorage.getItem('installPromptDismissed');
        if (dismissedAt) {
            const daysSinceDismissed = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
            if (daysSinceDismissed < 7) {
                return false;
            }
        }

        return true;
    }

    function showInstallBanner() {
        if (!shouldShowInstallPrompt()) {
            return;
        }

        const banner = document.getElementById('install-banner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }

    function hideInstallBanner() {
        const banner = document.getElementById('install-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }

    function dismissInstallPrompt() {
        localStorage.setItem('installPromptDismissed', Date.now().toString());
        hideInstallBanner();
    }

    async function handleInstallClick() {
        if (!deferredInstallPrompt) {
            return;
        }

        // Show the browser's install prompt
        deferredInstallPrompt.prompt();

        // Wait for user response
        const { outcome } = await deferredInstallPrompt.userChoice;
        console.log('Install prompt outcome:', outcome);

        // Clear the deferred prompt
        deferredInstallPrompt = null;
        hideInstallBanner();
    }

    function showIOSInstallInstructions() {
        if (!shouldShowInstallPrompt()) {
            return;
        }

        const modal = document.getElementById('ios-install-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    function hideIOSInstallModal() {
        const modal = document.getElementById('ios-install-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Mark as dismissed so we don't show again for a while
        localStorage.setItem('installPromptDismissed', Date.now().toString());
    }

    function setupInstallPrompt() {
        // Listen for the beforeinstallprompt event (Chrome/Android)
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing
            e.preventDefault();
            // Save the event for later
            deferredInstallPrompt = e;
            // Show our custom install banner
            showInstallBanner();
        });

        // Listen for successful install
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            hideInstallBanner();
            deferredInstallPrompt = null;
        });

        // Set up button handlers
        const installBtn = document.getElementById('install-btn');
        const dismissBtn = document.getElementById('install-dismiss-btn');

        if (installBtn) {
            installBtn.addEventListener('click', handleInstallClick);
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', dismissInstallPrompt);
        }

        // iOS-specific handlers
        const iosCloseBtn = document.getElementById('ios-install-close-btn');
        const iosDoneBtn = document.getElementById('ios-install-done-btn');
        const iosModal = document.getElementById('ios-install-modal');

        if (iosCloseBtn) {
            iosCloseBtn.addEventListener('click', hideIOSInstallModal);
        }

        if (iosDoneBtn) {
            iosDoneBtn.addEventListener('click', hideIOSInstallModal);
        }

        if (iosModal) {
            iosModal.querySelector('.modal-backdrop')?.addEventListener('click', hideIOSInstallModal);
        }

        // For iOS, show instructions after a brief delay (if not already installed)
        if (isIOS() && !isRunningStandalone() && shouldShowInstallPrompt()) {
            // Show iOS prompt after 3 seconds
            setTimeout(() => {
                showIOSInstallInstructions();
            }, 3000);
        }
    }

    // ===================
    // Server Connection
    // ===================

    async function checkServerConnection() {
        try {
            const healthy = await API.checkHealth();
            updateServerStatus(healthy);

            if (healthy) {
                // Load permission levels
                await loadPermissionLevels();

                // If already have a token, validate and load data
                if (API.isAuthenticated()) {
                    try {
                        // Load identity from IndexedDB first (needed for encryption)
                        await Identity.load();

                        const user = await API.getCurrentUser();
                        currentUserId = user.id;
                        Model.setCurrentUserId(user.id);
                        await loadNamedLocations();
                        renderNamedLocationsList();
                        await refreshContacts();
                        await loadContactRequests();
                    } catch {
                        // Token invalid, already logged out by API
                        console.warn('Session expired');
                        currentUserId = null;
                        Model.setCurrentUserId(null);
                    }
                }

                updateAuthUI();
            }
        } catch (error) {
            console.warn('Server connection check failed:', error);
            updateServerStatus(false);
        }
    }

    async function loadPermissionLevels() {
        try {
            const data = await API.getPermissionLevels();
            permissionLevels = data.levels || [];
            Model.setPermissionLevels(permissionLevels);
        } catch (error) {
            console.warn('Could not load permission levels:', error);
            // Fallback to default levels
            permissionLevels = ['planet', 'continent', 'country', 'state', 'county', 'city', 'neighborhood', 'street', 'address'];
            Model.setPermissionLevels(permissionLevels);
        }
    }

    // ===================
    // Initialization
    // ===================

    async function init() {
        // Register views with ViewManager
        ViewManager.register('welcome', {
            onEnter: () => {
                // Update welcome screen with current location
                renderWelcomeHierarchy();
            },
            onExit: () => {}
        });

        ViewManager.register('main', {
            onEnter: () => {
                // Main view entered - refresh data if needed
                if (API.isAuthenticated()) {
                    refreshContacts();
                }
            },
            onExit: () => {
                // Cleanup if needed
            }
        });

        ViewManager.register('places', {
            onEnter: () => {
                // Render places list when entering
                renderPlacesList();
            },
            onExit: () => {}
        });

        ViewManager.register('contact-detail', {
            onEnter: () => {
                renderContactDetail();
            },
            onExit: () => {
                // Clear selected contact when leaving
            }
        });

        ViewManager.register('settings', {
            onEnter: async () => {
                // Update settings email on enter
                const userEmail = API.getUserEmail?.() || '--';
                if (elements.settingsUserEmail) {
                    elements.settingsUserEmail.textContent = userEmail;
                }
                // Update version and build info
                const versionEl = document.getElementById('settings-version');
                const buildEl = document.getElementById('settings-build');
                if (typeof BUILD_INFO !== 'undefined') {
                    if (versionEl) versionEl.textContent = `v${BUILD_INFO.version}`;
                    if (buildEl) {
                        const buildDate = new Date(BUILD_INFO.buildTime);
                        const dateStr = buildDate.toLocaleDateString();
                        buildEl.textContent = `${BUILD_INFO.gitCommit} (${dateStr})`;
                    }
                }
                // Load and render devices
                await loadDevices();
                renderDevicesList();
            },
            onExit: () => {}
        });

        ViewManager.register('delete-account', {
            onEnter: () => {
                // Clear the password field and error when entering
                const passwordInput = document.getElementById('delete-account-password');
                const errorDiv = document.getElementById('delete-account-error');
                if (passwordInput) passwordInput.value = '';
                if (errorDiv) errorDiv.classList.add('hidden');
            },
            onExit: () => {}
        });

        setupEventListeners();
        setupInstallPrompt();

        // Initialize Google Sign-In when available
        initGoogleSignIn();

        // Initialize current device ID from localStorage
        const storedDeviceId = getStoredDeviceId();
        if (storedDeviceId) {
            Model.setCurrentDeviceId(storedDeviceId);
        }

        // Check server connection (this will load user data if authenticated)
        await checkServerConnection();

        // Determine initial view based on auth state
        if (API.isAuthenticated()) {
            ViewManager.navigate('main', {}, false);
            // Check if periodic PIN verification is needed
            performPINCheckIfNeeded();
        } else {
            ViewManager.navigate('welcome', {}, false);
        }

        // Show empty named locations list if not logged in
        renderNamedLocationsList();

        // Check for last known location
        const lastLocation = loadLastLocation();
        if (lastLocation && lastLocation.hierarchy) {
            currentCoordinates = lastLocation.coordinates;
            currentHierarchy = lastLocation.hierarchy;

            // Sync with Model
            if (currentCoordinates && currentHierarchy) {
                Model.setLocation(currentCoordinates, currentHierarchy);
            }

            if (currentCoordinates) {
                currentMatch = Geofence.findBestMatch(
                    currentCoordinates.latitude,
                    currentCoordinates.longitude,
                    namedLocations
                );
                Model.setCurrentMatch(currentMatch);
            }

            displayLocation(currentHierarchy, currentMatch);
            renderWelcomeHierarchy();  // Also update welcome screen
        }

        // Get fresh location
        await updateLocation();

        // Register service worker AFTER initial render to avoid race conditions
        registerServiceWorker();

        // Start refresh timers
        startContactsRefreshTimer();
        startLocationPublishTimer();
    }

    // Start the app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
