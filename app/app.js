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

    const CONFIG = {
        geocodeUrl: 'https://nominatim.openstreetmap.org/reverse',
        geolocation: {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000
        },
        userAgent: 'Whereish/1.0 (semantic-location-prototype)',
        // How often to refresh contacts (ms)
        contactsRefreshInterval: 60000,  // 1 minute
        // How often to publish location (ms)
        locationPublishInterval: 300000   // 5 minutes
    };

    // ===================
    // Geographic Hierarchy Definition
    // ===================

    const HIERARCHY_LEVELS = [
        { key: 'address', label: 'Address', nominatimKeys: ['house_number', 'road'] },
        { key: 'street', label: 'Street', nominatimKeys: ['road'] },
        { key: 'neighborhood', label: 'Neighborhood', nominatimKeys: ['neighbourhood', 'suburb', 'hamlet'] },
        { key: 'city', label: 'City', nominatimKeys: ['city', 'town', 'village', 'municipality'] },
        { key: 'county', label: 'County', nominatimKeys: ['county'] },
        { key: 'state', label: 'State', nominatimKeys: ['state'] },
        { key: 'country', label: 'Country', nominatimKeys: ['country'] },
        { key: 'continent', label: 'Continent', nominatimKeys: [] }
    ];

    const COUNTRY_TO_CONTINENT = {
        'United States': 'North America',
        'Canada': 'North America',
        'Mexico': 'North America',
        'United Kingdom': 'Europe',
        'France': 'Europe',
        'Germany': 'Europe',
        'Italy': 'Europe',
        'Spain': 'Europe',
        'Netherlands': 'Europe',
        'Belgium': 'Europe',
        'Switzerland': 'Europe',
        'Austria': 'Europe',
        'Poland': 'Europe',
        'Sweden': 'Europe',
        'Norway': 'Europe',
        'Denmark': 'Europe',
        'Finland': 'Europe',
        'Ireland': 'Europe',
        'Portugal': 'Europe',
        'Greece': 'Europe',
        'Japan': 'Asia',
        'China': 'Asia',
        'South Korea': 'Asia',
        'India': 'Asia',
        'Singapore': 'Asia',
        'Thailand': 'Asia',
        'Vietnam': 'Asia',
        'Indonesia': 'Asia',
        'Malaysia': 'Asia',
        'Philippines': 'Asia',
        'Australia': 'Oceania',
        'New Zealand': 'Oceania',
        'Brazil': 'South America',
        'Argentina': 'South America',
        'Chile': 'South America',
        'Colombia': 'South America',
        'Peru': 'South America',
        'South Africa': 'Africa',
        'Egypt': 'Africa',
        'Nigeria': 'Africa',
        'Kenya': 'Africa',
        'Morocco': 'Africa'
    };

    // ===================
    // State
    // ===================

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
    let currentView = 'main';  // Track current view for navigation

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
        addContactBtn: document.getElementById('add-contact-btn'),
        refreshContactsBtn: document.getElementById('refresh-contacts-btn'),

        // Add contact modal
        addContactModal: document.getElementById('add-contact-modal'),
        addContactForm: document.getElementById('add-contact-form'),
        addContactCloseBtn: document.getElementById('add-contact-close-btn'),
        addContactCancelBtn: document.getElementById('add-contact-cancel-btn'),
        contactEmailInput: document.getElementById('contact-email'),
        addContactError: document.getElementById('add-contact-error')
    };

    // Auth state
    let isLoginMode = true;

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
                CONFIG.geolocation
            );
        });
    }

    // ===================
    // Geocoding Service
    // ===================

    async function reverseGeocode(lat, lon) {
        const url = new URL(CONFIG.geocodeUrl);
        url.searchParams.set('lat', lat);
        url.searchParams.set('lon', lon);
        url.searchParams.set('format', 'json');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('zoom', '18');

        const response = await fetch(url, {
            headers: { 'User-Agent': CONFIG.userAgent }
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

    function buildHierarchy(addressComponents) {
        const hierarchy = {};

        for (const level of HIERARCHY_LEVELS) {
            if (level.key === 'continent') {
                const country = hierarchy.country;
                hierarchy.continent = country ? (COUNTRY_TO_CONTINENT[country] || 'Planet Earth') : 'Planet Earth';
                continue;
            }

            if (level.key === 'address') {
                const houseNumber = addressComponents.house_number;
                const road = addressComponents.road;
                if (houseNumber && road) {
                    hierarchy.address = `${houseNumber} ${road}`;
                }
                continue;
            }

            for (const nominatimKey of level.nominatimKeys) {
                if (addressComponents[nominatimKey]) {
                    hierarchy[level.key] = addressComponents[nominatimKey];
                    break;
                }
            }
        }

        if (!hierarchy.continent) {
            hierarchy.continent = 'Planet Earth';
        }

        return hierarchy;
    }

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

        const mostSpecific = findMostSpecificLevel(hierarchy);

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

    function findMostSpecificLevel(hierarchy) {
        for (const level of HIERARCHY_LEVELS) {
            if (hierarchy[level.key]) {
                return hierarchy[level.key];
            }
        }
        return null;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
        for (const level of HIERARCHY_LEVELS) {
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

        container.innerHTML = levels.map((level, index) => `
            <div class="welcome-hierarchy-level${level.primary ? ' primary' : ''}">
                <span class="welcome-hierarchy-icon">${level.icon}</span>
                <span class="welcome-hierarchy-text">${escapeHtml(level.text)}</span>
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
            // Show auth controls
            elements.authControls.classList.remove('hidden');
        } else {
            elements.serverStatus.classList.remove('connected');
            elements.serverStatus.classList.remove('hidden');
            elements.serverStatusIcon.textContent = '⚠️';
            elements.serverStatusText.textContent = 'Backend server not connected. Run: python server/run.py';

            // Hide auth controls when server not connected
            elements.authControls.classList.add('hidden');
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
            elements.currentUserName.textContent = user.name;
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
        elements.currentUserName.textContent = '';

        // Clear user-specific data
        contacts = [];
        namedLocations = [];
        currentMatch = null;

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
                locationText = data.namedLocation || findMostSpecificLevel(data.hierarchy) || 'Planet Earth';
                locationClass = contact.location.stale ? 'stale' : '';

                if (contact.location.updated_at) {
                    timeText = formatTimeAgo(new Date(contact.location.updated_at));
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
                        <div class="contact-name">${escapeHtml(contact.name)}</div>
                        <div class="contact-location ${locationClass}">${escapeHtml(locationText)}</div>
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

    /**
     * Format permission level for display
     */
    function formatPermissionLabel(level) {
        const labels = {
            'planet': 'Planet',
            'continent': 'Continent',
            'country': 'Country',
            'state': 'State',
            'county': 'County',
            'city': 'City',
            'neighborhood': 'Neighborhood',
            'street': 'Street',
            'address': 'Address'
        };
        return labels[level] || level;
    }

    /**
     * Handle permission level change
     */
    async function handlePermissionChange(event) {
        const select = event.target;
        const contactId = select.dataset.contactId;
        const newLevel = select.value;

        // Disable select during update
        select.disabled = true;

        try {
            await API.updateContactPermission(contactId, newLevel);

            // Update local state
            const contact = contacts.find(c => c.id === contactId);
            if (contact) {
                contact.permissionGranted = newLevel;
            }

            // Show brief feedback
            select.classList.add('updated');
            setTimeout(() => select.classList.remove('updated'), 1000);
        } catch (error) {
            console.error('Failed to update permission:', error);
            // Revert to previous value
            const contact = contacts.find(c => c.id === contactId);
            if (contact) {
                select.value = contact.permissionGranted || 'planet';
            }
            alert('Failed to update permission. Please try again.');
        } finally {
            select.disabled = false;
        }
    }

    // ===================
    // Contact Requests
    // ===================

    async function loadContactRequests() {
        if (!API.isAuthenticated()) return;

        try {
            const requests = await API.getContactRequests();
            renderIncomingRequests(requests.incoming || []);
        } catch (error) {
            console.error('Failed to load contact requests:', error);
        }
    }

    function renderIncomingRequests(incoming) {
        if (incoming.length === 0) {
            elements.pendingRequests.classList.add('hidden');
            return;
        }

        elements.pendingRequests.classList.remove('hidden');
        elements.incomingRequests.innerHTML = incoming.map(req => `
            <div class="request-item" data-request-id="${req.requestId}">
                <div class="request-info">
                    <strong>${escapeHtml(req.name)}</strong> wants to connect
                </div>
                <div class="request-actions">
                    <button class="btn btn-small btn-primary accept-request-btn" data-id="${req.requestId}">Accept</button>
                    <button class="btn btn-small decline-request-btn" data-id="${req.requestId}">Decline</button>
                </div>
            </div>
        `).join('');

        // Attach handlers
        elements.incomingRequests.querySelectorAll('.accept-request-btn').forEach(btn => {
            btn.addEventListener('click', handleAcceptRequest);
        });
        elements.incomingRequests.querySelectorAll('.decline-request-btn').forEach(btn => {
            btn.addEventListener('click', handleDeclineRequest);
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

    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
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

        if (contact.location) {
            locationDisplay.innerHTML = `<span class="location-text">${escapeHtml(contact.location)}</span>`;

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
            if (contact.locationUpdatedAt) {
                const lastUpdate = new Date(contact.locationUpdatedAt);
                lastUpdatedEl.textContent = 'Last updated ' + formatTimeAgo(lastUpdate);
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
        const levelIndex = HIERARCHY_LEVELS.findIndex(l => l.key === level);
        if (levelIndex === -1) {
            previewEl.textContent = 'Planet Earth';
            return;
        }

        // Find the first available level from the granted level up
        for (let i = levelIndex; i < HIERARCHY_LEVELS.length; i++) {
            const key = HIERARCHY_LEVELS[i].key;
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

            return `
                <div class="named-location-item ${isActive ? 'active' : ''}" data-id="${location.id}">
                    <span class="location-item-icon">${isActive ? '📍' : '🏠'}</span>
                    <div class="location-item-content">
                        <div class="location-item-label">${escapeHtml(location.label)}</div>
                        <div class="location-item-meta">
                            ${location.radiusMeters}m radius${distanceText ? ` • ${distanceText} away` : ''}
                        </div>
                    </div>
                    <div class="location-item-actions">
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

                if (currentCoordinates) {
                    currentMatch = Geofence.findBestMatch(
                        currentCoordinates.latitude,
                        currentCoordinates.longitude,
                        namedLocations
                    );
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
    // Modal Handling
    // ===================

    function openModal() {
        elements.modal.classList.remove('hidden');
        elements.locationLabelInput.value = '';
        elements.locationLabelInput.focus();

        if (currentHierarchy) {
            const locationText = findMostSpecificLevel(currentHierarchy) || 'Current location';
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

            currentMatch = Geofence.findBestMatch(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                namedLocations
            );

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
            const payload = {
                hierarchy: currentHierarchy,
                namedLocation: currentMatch ? currentMatch.label : null,
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
        showLoading();

        try {
            const position = await getCurrentPosition();
            currentCoordinates = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            elements.statusText.textContent = 'Getting location name...';

            const addressComponents = await reverseGeocode(
                currentCoordinates.latitude,
                currentCoordinates.longitude
            );

            currentHierarchy = buildHierarchy(addressComponents);

            currentMatch = Geofence.findBestMatch(
                currentCoordinates.latitude,
                currentCoordinates.longitude,
                namedLocations
            );

            displayLocation(currentHierarchy, currentMatch);
            renderNamedLocationsList();
            saveLastLocation();

            // Publish to server
            await publishLocationToServer();

        } catch (error) {
            console.error('Location error:', error);
            showError(error.message);
        }
    }

    // ===================
    // Persistence
    // ===================

    function saveLastLocation() {
        try {
            localStorage.setItem('whereish_lastLocation', JSON.stringify({
                coordinates: currentCoordinates,
                hierarchy: currentHierarchy,
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
        } catch (error) {
            console.error('Failed to load named locations:', error);
            namedLocations = [];
        }
    }

    // ===================
    // Timers
    // ===================

    function startContactsRefreshTimer() {
        if (contactsRefreshTimer) {
            clearInterval(contactsRefreshTimer);
        }
        contactsRefreshTimer = setInterval(refreshContacts, CONFIG.contactsRefreshInterval);
    }

    function startLocationPublishTimer() {
        if (locationPublishTimer) {
            clearInterval(locationPublishTimer);
        }
        locationPublishTimer = setInterval(async () => {
            await updateLocation();
        }, CONFIG.locationPublishInterval);
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

        // Contact detail
        document.getElementById('contact-detail-back-btn')?.addEventListener('click', () => ViewManager.goBack());
        document.getElementById('detail-permission-select')?.addEventListener('change', handleDetailPermissionChange);
        document.getElementById('remove-contact-btn')?.addEventListener('click', handleRemoveContact);

        // Escape key for modals
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!elements.modal.classList.contains('hidden')) closeModal();
                if (!elements.authModal.classList.contains('hidden')) closeAuthModal();
                if (!elements.addContactModal.classList.contains('hidden')) closeAddContactModal();
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
                        elements.currentUserName.textContent = user.name;
                        await loadNamedLocations();
                        renderNamedLocationsList();
                        await refreshContacts();
                        await loadContactRequests();
                    } catch (error) {
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
                    loadContacts();
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
        registerServiceWorker();

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

            if (currentCoordinates) {
                currentMatch = Geofence.findBestMatch(
                    currentCoordinates.latitude,
                    currentCoordinates.longitude,
                    namedLocations
                );
            }

            displayLocation(currentHierarchy, currentMatch);
            renderWelcomeHierarchy();  // Also update welcome screen
            elements.statusText.textContent += ' (updating...)';
        }

        // Get fresh location
        await updateLocation();

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
