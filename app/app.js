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

    // Note: Location and places state are cached here for convenience
    // but Model is the source of truth. Use Model.getLocation(), Model.getPlaces(), etc.
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

        // Auth modal
        authModal: document.getElementById('auth-modal'),
        authModalTitle: document.getElementById('auth-modal-title'),
        authModalCloseBtn: document.getElementById('auth-modal-close-btn'),
        authForm: document.getElementById('auth-form'),
        authNameGroup: document.getElementById('auth-name-group'),
        authNameInput: document.getElementById('auth-name'),
        authEmailInput: document.getElementById('auth-email'),
        authPasswordInput: document.getElementById('auth-password'),
        authError: document.getElementById('auth-error'),
        authSubmitBtn: document.getElementById('auth-submit-btn'),
        authSwitch: document.getElementById('auth-switch'),
        authSwitchLink: document.getElementById('auth-switch-link'),

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

        const mostSpecific = Model.findMostSpecificLevel(hierarchy);

        if (match) {
            // Show named location as primary, actual location as secondary
            primaryEl.textContent = match.label;
            if (secondaryEl) {
                secondaryEl.textContent = mostSpecific || 'Planet Earth';
                secondaryEl.classList.remove('hidden');
            }
        } else {
            // Show most specific location as primary, no secondary
            primaryEl.textContent = mostSpecific || 'Planet Earth';
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

        // Build hierarchy from most specific to least specific, ending with Planet Earth
        const levels = [];

        // Add all hierarchy levels that have values
        for (const level of Model.HIERARCHY_LEVELS) {
            if (currentHierarchy[level.key]) {
                levels.push({
                    icon: '📍',
                    text: currentHierarchy[level.key],
                    primary: levels.length === 0  // First one is most specific
                });
            }
        }

        // Always add Planet Earth at the end
        levels.push({
            icon: '🌍',
            text: 'Planet Earth',
            primary: false
        });

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
        elements.authForm.reset();

        if (loginMode) {
            elements.authModalTitle.textContent = 'Log In';
            elements.authNameGroup.classList.add('hidden');
            elements.authNameInput.required = false;
            elements.authSubmitBtn.textContent = 'Log In';
            elements.authSwitch.innerHTML = 'Don\'t have an account? <a href="#" id="auth-switch-link">Sign up</a>';
        } else {
            elements.authModalTitle.textContent = 'Sign Up';
            elements.authNameGroup.classList.remove('hidden');
            elements.authNameInput.required = true;
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
                await API.login(email, password);
            } else {
                await API.register(email, password, name);
            }

            // Success - update UI
            const user = await API.getCurrentUser();
            currentUserId = user.id;
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

        } catch (error) {
            elements.authError.textContent = error.message;
            elements.authError.classList.remove('hidden');
        } finally {
            elements.authSubmitBtn.disabled = false;
        }
    }

    function handleLogout() {
        API.logout();
        currentUserId = null;

        // Clear user-specific data
        contacts = [];
        namedLocations = [];
        currentMatch = null;

        // Sync with Model
        Model.setPlaces([]);
        Model.setCurrentMatch(null);

        renderContactsList();
        renderNamedLocationsList();
        displayLocation(currentHierarchy, null);
        updateAuthUI();

        // Navigate to welcome screen
        ViewManager.navigate('welcome');
    }

    // ===================
    // Contacts
    // ===================

    async function refreshContacts() {
        if (!API.isAuthenticated()) {
            contacts = [];
            renderContactsList();
            return;
        }

        try {
            contacts = await API.getContactsWithLocations();
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
            let locationText = 'Planet Earth';
            let locationClass = 'no-location';
            let timeText = '';
            let distanceText = '';

            if (contact.location && contact.location.data) {
                const data = contact.location.data;
                // Get the most specific level from their filtered hierarchy
                locationText = data.namedLocation || Model.findMostSpecificLevel(data.hierarchy) || 'Planet Earth';
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
        if (!API.isAuthenticated()) return;

        try {
            const requests = await API.getContactRequests();
            const incoming = requests.incoming || [];
            const outgoing = requests.outgoing || [];

            renderIncomingRequests(incoming);
            renderOutgoingRequests(outgoing);

            // Show/hide container based on whether any requests exist
            const hasRequests = incoming.length > 0 || outgoing.length > 0;
            elements.pendingRequests.classList.toggle('hidden', !hasRequests);
        } catch (error) {
            console.error('Failed to load contact requests:', error);
        }
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
            alert('Failed to accept request. Please try again.');
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
            alert('Failed to decline request. Please try again.');
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
            alert('Failed to cancel request. Please try again.');
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
            await API.sendContactRequest(email);
            closeAddContactModal();
            alert('Contact request sent!');
        } catch (error) {
            elements.addContactError.textContent = error.message;
            elements.addContactError.classList.remove('hidden');
        }
    }

    // ===================
    // Contact Detail UI
    // ===================

    function openContactDetail(contact) {
        selectedContact = contact;
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

        // Update their location
        const locationDisplay = document.getElementById('contact-location-display');
        const distanceEl = document.getElementById('contact-distance');
        const lastUpdatedEl = document.getElementById('contact-last-updated');

        if (contact.location && contact.location.data) {
            const data = contact.location.data;
            const locationText = data.namedLocation || Model.findMostSpecificLevel(data.hierarchy) || 'Planet Earth';
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
            if (contact.location.updated_at) {
                lastUpdatedEl.textContent = 'Last updated ' + Model.formatTimeAgo(contact.location.updated_at);
            } else {
                lastUpdatedEl.textContent = '';
            }
        } else {
            locationDisplay.innerHTML = '<span class="location-text">Location not shared</span>';
            distanceEl.textContent = '';
            lastUpdatedEl.textContent = '';
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

        // Get the location text for this permission level
        const levelIndex = Model.HIERARCHY_LEVELS.findIndex(l => l.key === level);
        if (levelIndex === -1) {
            previewEl.textContent = 'Planet Earth';
            return;
        }

        // Find the first available level from the granted level up
        for (let i = levelIndex; i < Model.HIERARCHY_LEVELS.length; i++) {
            const key = Model.HIERARCHY_LEVELS[i].key;
            if (currentHierarchy[key]) {
                previewEl.textContent = currentHierarchy[key];
                return;
            }
        }
        previewEl.textContent = 'Planet Earth';
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
            alert('Failed to update permission. Please try again.');
            // Revert selection
            select.value = selectedContact.permissionGranted;
        }
        select.disabled = false;
    }

    async function handleRemoveContact() {
        if (!selectedContact) return;

        if (confirm(`Remove ${selectedContact.name} from your contacts?`)) {
            try {
                await API.removeContact(selectedContact.contactId);
                contacts = contacts.filter(c => c.contactId !== selectedContact.contactId);
                selectedContact = null;
                ViewManager.goBack();
                renderContactsList();
            } catch (error) {
                console.error('Failed to remove contact:', error);
                alert('Failed to remove contact. Please try again.');
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

        if (location && confirm(`Delete "${location.label}"?`)) {
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
                alert('Failed to delete location. Please try again.');
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
            alert('No location available. Please refresh your location first.');
            return;
        }

        if (!currentUserId) {
            alert('Please log in to save locations.');
            return;
        }

        const label = elements.locationLabelInput.value.trim();
        const radius = parseInt(elements.locationRadiusSelect.value, 10);

        if (!label) {
            alert('Please enter a name for this location.');
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
            alert('Failed to save location. Please try again.');
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

        try {
            // Build named location with visibility metadata
            let namedLocationPayload = null;
            if (currentMatch) {
                const visibility = currentMatch.visibility || { mode: 'private', contactIds: [] };
                let visibleTo;

                if (visibility.mode === 'private') {
                    visibleTo = 'private';
                } else if (visibility.mode === 'all') {
                    visibleTo = 'all';
                } else {
                    // 'selected' mode - include the list of contact IDs
                    visibleTo = visibility.contactIds || [];
                }

                namedLocationPayload = {
                    label: currentMatch.label,
                    visibleTo: visibleTo
                };
            }

            const payload = {
                hierarchy: currentHierarchy,
                namedLocation: namedLocationPayload,
                timestamp: Date.now()
            };

            await API.publishLocation(payload);
            console.log('Location published to server');
        } catch (error) {
            console.error('Failed to publish location:', error);
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
        contactsRefreshTimer = setInterval(refreshContacts, Model.CONFIG.contactsRefreshInterval);
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

        // Welcome screen buttons
        document.getElementById('welcome-login-btn')?.addEventListener('click', () => openAuthModal(true));
        document.getElementById('welcome-signup-btn')?.addEventListener('click', () => openAuthModal(false));

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
                        const user = await API.getCurrentUser();
                        currentUserId = user.id;
                        await loadNamedLocations();
                        renderNamedLocationsList();
                        await refreshContacts();
                        await loadContactRequests();
                    } catch {
                        // Token invalid, already logged out by API
                        console.warn('Session expired');
                        currentUserId = null;
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
        } catch (error) {
            console.warn('Could not load permission levels:', error);
            // Fallback to default levels
            permissionLevels = ['planet', 'continent', 'country', 'state', 'county', 'city', 'neighborhood', 'street', 'address'];
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
            onEnter: () => {
                // Update settings email on enter
                const userEmail = API.getUserEmail?.() || '--';
                if (elements.settingsUserEmail) {
                    elements.settingsUserEmail.textContent = userEmail;
                }
            },
            onExit: () => {}
        });

        setupEventListeners();
        setupInstallPrompt();

        // Check server connection (this will load user data if authenticated)
        await checkServerConnection();

        // Determine initial view based on auth state
        if (API.isAuthenticated()) {
            ViewManager.navigate('main', {}, false);
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
