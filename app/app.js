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
    let permissionLevels = [];
    let contactsRefreshTimer = null;
    let locationPublishTimer = null;
    let currentView = 'main';  // Track current view for navigation

    // ===================
    // DOM Elements
    // ===================

    const elements = {
        // Status and location display
        status: document.getElementById('status'),
        statusIcon: document.querySelector('.status-icon'),
        statusText: document.querySelector('.status-text'),
        hierarchy: document.getElementById('location-hierarchy'),
        error: document.getElementById('error-message'),
        errorText: document.querySelector('.error-text'),

        // Named location match display
        namedMatch: document.getElementById('named-location-match'),
        namedMatchLabel: document.querySelector('.named-match-label'),

        // Buttons
        refreshBtn: document.getElementById('refresh-btn'),
        retryBtn: document.getElementById('retry-btn'),
        saveLocationBtn: document.getElementById('save-location-btn'),

        // Named locations list
        namedLocationsList: document.getElementById('named-locations-list'),
        placesCount: document.getElementById('places-count'),

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

        // Auth controls
        authControls: document.getElementById('auth-controls'),
        loggedOutControls: document.getElementById('logged-out-controls'),
        loggedInControls: document.getElementById('logged-in-controls'),
        showLoginBtn: document.getElementById('show-login-btn'),
        showRegisterBtn: document.getElementById('show-register-btn'),
        logoutBtn: document.getElementById('logout-btn'),
        currentUserName: document.getElementById('current-user-name'),

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
        elements.status.classList.remove('located');
        elements.statusIcon.textContent = '📍';
        elements.statusText.textContent = 'Locating...';
        elements.hierarchy.classList.add('hidden');
        elements.error.classList.add('hidden');
        elements.namedMatch.classList.add('hidden');
        elements.refreshBtn.disabled = true;
        elements.saveLocationBtn.disabled = true;
    }

    function showError(message) {
        elements.status.classList.remove('located');
        elements.statusIcon.textContent = '❌';
        elements.statusText.textContent = 'Location unavailable';
        elements.hierarchy.classList.add('hidden');
        elements.error.classList.remove('hidden');
        elements.namedMatch.classList.add('hidden');
        elements.errorText.textContent = message;
        elements.refreshBtn.disabled = false;
        elements.saveLocationBtn.disabled = true;
    }

    function displayLocation(hierarchy, match) {
        elements.status.classList.add('located');
        elements.statusIcon.textContent = '✓';
        elements.error.classList.add('hidden');

        if (match) {
            elements.namedMatch.classList.remove('hidden');
            elements.namedMatchLabel.textContent = match.label;
            elements.statusText.textContent = match.label;
        } else {
            elements.namedMatch.classList.add('hidden');
            const mostSpecific = findMostSpecificLevel(hierarchy);
            elements.statusText.textContent = mostSpecific || 'Planet Earth';
        }

        elements.hierarchy.innerHTML = '';
        const levelsToShow = HIERARCHY_LEVELS.filter(level => hierarchy[level.key]);

        levelsToShow.forEach((level, index) => {
            const value = hierarchy[level.key];
            if (!value) return;

            const levelElement = document.createElement('div');
            levelElement.className = 'hierarchy-level';

            if (index === 0 && !match) {
                levelElement.classList.add('primary');
            }

            levelElement.innerHTML = `
                <span class="hierarchy-label">${level.label}</span>
                <span class="hierarchy-value">${escapeHtml(value)}</span>
            `;

            elements.hierarchy.appendChild(levelElement);
        });

        elements.hierarchy.classList.remove('hidden');
        elements.refreshBtn.disabled = false;
        elements.saveLocationBtn.disabled = false;
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
            elements.loggedOutControls.classList.add('hidden');
            elements.loggedInControls.classList.remove('hidden');
            elements.contactsSection.classList.remove('hidden');
        } else {
            elements.loggedOutControls.classList.remove('hidden');
            elements.loggedInControls.classList.add('hidden');
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

            if (contact.location && contact.location.data) {
                const data = contact.location.data;
                // Get the most specific level from their filtered hierarchy
                locationText = data.namedLocation || findMostSpecificLevel(data.hierarchy) || 'Planet Earth';
                locationClass = contact.location.stale ? 'stale' : '';

                if (contact.location.updated_at) {
                    timeText = formatTimeAgo(new Date(contact.location.updated_at));
                }
            }

            // Permission they've granted to me (what I can see)
            const receivedLabel = formatPermissionLabel(contact.permissionReceived || 'planet');
            // Permission I've granted to them (what they can see of me)
            const grantedLevel = contact.permissionGranted || 'planet';

            // Build permission selector options
            const permissionOptions = permissionLevels.map(level => {
                const selected = level === grantedLevel ? 'selected' : '';
                return `<option value="${level}" ${selected}>${formatPermissionLabel(level)}</option>`;
            }).join('');

            return `
                <div class="contact-item" data-id="${contact.id}">
                    <div class="contact-avatar">${initial}</div>
                    <div class="contact-info">
                        <div class="contact-name">${escapeHtml(contact.name)}</div>
                        <div class="contact-location ${locationClass}">${escapeHtml(locationText)}</div>
                        <div class="contact-permission-info">
                            <span class="permission-received">Can see: ${receivedLabel}</span>
                        </div>
                    </div>
                    <div class="contact-controls">
                        ${timeText ? `<div class="contact-time">${timeText}</div>` : ''}
                        <div class="permission-control">
                            <label class="permission-label">Share:</label>
                            <select class="permission-select" data-contact-id="${contact.id}">
                                ${permissionOptions}
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners to permission selects
        elements.contactsList.querySelectorAll('.permission-select').forEach(select => {
            select.addEventListener('change', handlePermissionChange);
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
    // Named Locations UI
    // ===================

    function renderNamedLocationsList() {
        elements.placesCount.textContent = namedLocations.length;

        if (namedLocations.length === 0) {
            elements.namedLocationsList.innerHTML = `
                <p class="empty-state">No saved places yet. Save your current location to get started.</p>
            `;
            return;
        }

        elements.namedLocationsList.innerHTML = namedLocations.map(location => {
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

        elements.namedLocationsList.querySelectorAll('.delete-location-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteLocation);
        });
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

        // Auth buttons
        elements.showLoginBtn.addEventListener('click', () => openAuthModal(true));
        elements.showRegisterBtn.addEventListener('click', () => openAuthModal(false));
        elements.logoutBtn.addEventListener('click', handleLogout);

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
        setupEventListeners();
        registerServiceWorker();

        // Check server connection (this will load user data if authenticated)
        await checkServerConnection();

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
