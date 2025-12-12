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

    // API base URL - defaults to localhost for development
    // In production, this would be the Cloud Run URL
    const BASE_URL = localStorage.getItem('whereish_api_url') || 'http://localhost:8500';

    // Current auth token
    let authToken = localStorage.getItem('whereish_auth_token') || null;
    let currentUser = null;

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
        } catch (error) {
            return false;
        }
    }

    /**
     * Set API base URL
     * @param {string} url
     */
    function setBaseUrl(url) {
        localStorage.setItem('whereish_api_url', url);
        // Note: Requires page reload to take effect
    }

    /**
     * Get current API base URL
     * @returns {string}
     */
    function getBaseUrl() {
        return BASE_URL;
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
        removeContact,

        // Permissions
        getPermissionLevels,
        getContactPermission,
        updateContactPermission,

        // Utility
        checkHealth,
        setBaseUrl,
        getBaseUrl
    };

})();
