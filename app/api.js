/**
 * Whereish - API Client Module
 * Milestone 3: Backend Integration
 *
 * Handles communication with the backend server.
 */

const API = (function() {
    'use strict';

    // ===================
    // Configuration
    // ===================

    // API uses same-origin (relative URLs) - works for both dev and production
    const BASE_URL = '';

    // App version - must match server's APP_VERSION for compatibility
    // This should match the service worker CACHE_NAME version number
    const APP_VERSION = 54;

    // Current auth token
    let authToken = localStorage.getItem('whereish_auth_token') || null;
    let currentUser = null;
    let updatePending = false;

    // ===================
    // HTTP Helpers
    // ===================

    /**
     * Make an authenticated API request
     * @param {string} endpoint - API endpoint (e.g., '/api/location')
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        // Check for version mismatch
        checkVersionHeader(response);

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            return null;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        return data;
    }

    /**
     * Check version header and auto-update if needed
     * @param {Response} response - Fetch response
     */
    function checkVersionHeader(response) {
        if (updatePending) return;

        const serverVersion = parseInt(response.headers.get('X-App-Version'), 10);
        const minVersion = parseInt(response.headers.get('X-Min-App-Version'), 10);

        if (!serverVersion || isNaN(serverVersion)) return;

        // Check if client is below minimum supported version (forced update)
        if (minVersion && !isNaN(minVersion) && APP_VERSION < minVersion) {
            updatePending = true;
            showForcedUpdateBanner();
            // Auto-reload after 3 seconds
            setTimeout(() => window.location.reload(true), 3000);
            return;
        }

        // Check if newer version is available (auto-update)
        if (serverVersion > APP_VERSION) {
            updatePending = true;
            // Reload automatically - no banner needed
            // Small delay to let current request complete
            setTimeout(() => window.location.reload(true), 100);
        }
    }

    /**
     * Show forced update banner (cannot be dismissed)
     */
    function showForcedUpdateBanner() {
        // Check if banner already exists
        if (document.getElementById('update-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.className = 'update-banner update-banner-forced';
        banner.innerHTML = `
            <span>Update required - refreshing...</span>
        `;
        document.body.prepend(banner);
    }

    // ===================
    // Authentication
    // ===================

    /**
     * Register a new user
     * @param {string} email
     * @param {string} password
     * @param {string} name
     * @returns {Promise<Object>} { user, token }
     */
    async function register(email, password, name) {
        const data = await request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name })
        });
        if (data.token) {
            setAuthToken(data.token);
            currentUser = data.user;
        }
        return data;
    }

    /**
     * Login with email and password
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>} { user, token }
     */
    async function login(email, password) {
        const data = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (data.token) {
            setAuthToken(data.token);
            currentUser = data.user;
        }
        return data;
    }

    /**
     * Set the current auth token
     * @param {string} token
     */
    function setAuthToken(token) {
        authToken = token;
        if (token) {
            localStorage.setItem('whereish_auth_token', token);
        } else {
            localStorage.removeItem('whereish_auth_token');
        }
    }

    /**
     * Get current auth token
     * @returns {string|null}
     */
    function getAuthToken() {
        return authToken;
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    function isAuthenticated() {
        return !!authToken;
    }

    /**
     * Logout current user
     */
    function logout() {
        authToken = null;
        currentUser = null;
        localStorage.removeItem('whereish_auth_token');
    }

    /**
     * Get current user info
     * @returns {Promise<Object>}
     */
    async function getCurrentUser() {
        if (!authToken) {
            return null;
        }

        try {
            const data = await request('/api/me');
            currentUser = data;
            return data;
        } catch (error) {
            // Token might be invalid
            logout();
            throw error;
        }
    }

    // ===================
    // Contact Requests
    // ===================

    /**
     * Send a contact request by email
     * @param {string} email
     * @returns {Promise<Object>}
     */
    async function sendContactRequest(email) {
        return request('/api/contacts/request', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    /**
     * Get pending contact requests
     * @returns {Promise<Object>} { incoming: [], outgoing: [] }
     */
    async function getContactRequests() {
        return request('/api/contacts/requests');
    }

    /**
     * Accept a contact request
     * @param {number} requestId
     * @returns {Promise<Object>}
     */
    async function acceptContactRequest(requestId) {
        return request(`/api/contacts/requests/${requestId}/accept`, {
            method: 'POST'
        });
    }

    /**
     * Decline a contact request
     * @param {number} requestId
     * @returns {Promise<Object>}
     */
    async function declineContactRequest(requestId) {
        return request(`/api/contacts/requests/${requestId}/decline`, {
            method: 'POST'
        });
    }

    /**
     * Cancel an outgoing contact request
     * @param {number} requestId
     * @returns {Promise<Object>}
     */
    async function cancelContactRequest(requestId) {
        return request(`/api/contacts/requests/${requestId}/cancel`, {
            method: 'POST'
        });
    }

    /**
     * Remove a contact
     * @param {string} contactId
     * @returns {Promise<Object>}
     */
    async function removeContact(contactId) {
        return request(`/api/contacts/${contactId}`, {
            method: 'DELETE'
        });
    }

    // ===================
    // Location
    // ===================

    /**
     * Publish current location to server
     * @param {Object} locationData - Location data to publish
     * @returns {Promise<Object>}
     */
    async function publishLocation(locationData) {
        // Serialize location data as JSON string (the "payload")
        // In production, this would be encrypted
        const payload = JSON.stringify(locationData);

        return request('/api/location', {
            method: 'POST',
            body: JSON.stringify({ payload })
        });
    }

    /**
     * Get current user's stored location
     * @returns {Promise<Object|null>}
     */
    async function getMyLocation() {
        const data = await request('/api/location');
        if (data.location && data.location.payload) {
            try {
                data.location.data = JSON.parse(data.location.payload);
            } catch (e) {
                console.warn('Failed to parse location payload:', e);
            }
        }
        return data.location;
    }

    // ===================
    // Contacts
    // ===================

    /**
     * Get list of contacts
     * @returns {Promise<Array>}
     */
    async function getContacts() {
        const data = await request('/api/contacts');
        return data.contacts || [];
    }

    /**
     * Get a specific contact's location
     * @param {string} contactId
     * @returns {Promise<Object|null>}
     */
    async function getContactLocation(contactId) {
        const data = await request(`/api/contacts/${contactId}/location`);
        if (data.location && data.location.payload) {
            try {
                data.location.data = JSON.parse(data.location.payload);
            } catch (e) {
                console.warn('Failed to parse contact location payload:', e);
            }
        }
        return data.location;
    }

    /**
     * Get all contacts with their locations
     * @returns {Promise<Array>}
     */
    async function getContactsWithLocations() {
        const data = await request('/api/contacts/locations');
        const contacts = data.contacts || [];

        // Note: Server now returns pre-filtered location.data (no payload parsing needed)
        // The response includes permissionGranted and permissionReceived for each contact

        return contacts;
    }

    // ===================
    // Permissions
    // ===================

    /**
     * Get available permission levels
     * @returns {Promise<Object>} { levels: string[], default: string }
     */
    async function getPermissionLevels() {
        return request('/api/permission-levels');
    }

    /**
     * Get permission level for a specific contact
     * @param {string} contactId
     * @returns {Promise<Object>} { contactId, permissionGranted, permissionReceived }
     */
    async function getContactPermission(contactId) {
        return request(`/api/contacts/${contactId}/permission`);
    }

    /**
     * Update permission level for a contact (what they can see of my location)
     * @param {string} contactId
     * @param {string} level - Permission level (e.g., 'city', 'state', 'planet')
     * @returns {Promise<Object>}
     */
    async function updateContactPermission(contactId, level) {
        return request(`/api/contacts/${contactId}/permission`, {
            method: 'PUT',
            body: JSON.stringify({ level })
        });
    }

    // ===================
    // Server Health
    // ===================

    /**
     * Check if server is healthy
     * @returns {Promise<boolean>}
     */
    async function checkHealth() {
        try {
            await request('/api/health');
            return true;
        } catch {
            return false;
        }
    }

    // ===================
    // Service Worker Updates
    // ===================

    /**
     * Listen for service worker update notifications
     * When SW activates a new version, reload the page
     */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                console.log('Service worker updated to version', event.data.version);
                // Reload to get new version
                if (!updatePending) {
                    updatePending = true;
                    window.location.reload(true);
                }
            }
        });
    }

    // ===================
    // Public API
    // ===================

    /**
     * Get cached user email (synchronous)
     * @returns {string|null}
     */
    function getUserEmail() {
        return currentUser?.email || null;
    }

    return {
        // Auth
        register,
        login,
        setAuthToken,
        getAuthToken,
        isAuthenticated,
        logout,
        getCurrentUser,
        getUserEmail,

        // Location
        publishLocation,
        getMyLocation,

        // Contacts
        getContacts,
        getContactLocation,
        getContactsWithLocations,
        sendContactRequest,
        getContactRequests,
        acceptContactRequest,
        declineContactRequest,
        cancelContactRequest,
        removeContact,

        // Permissions
        getPermissionLevels,
        getContactPermission,
        updateContactPermission,

        // Utility
        checkHealth
    };

})();
