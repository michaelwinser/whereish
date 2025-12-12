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
     * Get available test users (development only)
     * @returns {Promise<Array>} List of test users with tokens
     */
    async function getTestUsers() {
        const data = await request('/api/auth/test-tokens');
        return data.users || [];
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
     * Login as a test user
     * @param {string} userId - Test user ID
     * @param {string} token - Test user token
     * @returns {Promise<Object>} User info
     */
    async function loginAsTestUser(userId, token) {
        setAuthToken(token);
        const data = await request('/api/me');
        currentUser = data;
        return data;
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

        // Parse location payloads
        for (const contact of contacts) {
            if (contact.location && contact.location.payload) {
                try {
                    contact.location.data = JSON.parse(contact.location.payload);
                } catch (e) {
                    console.warn(`Failed to parse location for ${contact.id}:`, e);
                }
            }
        }

        return contacts;
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

    return {
        // Auth
        getTestUsers,
        setAuthToken,
        getAuthToken,
        isAuthenticated,
        loginAsTestUser,
        logout,
        getCurrentUser,

        // Location
        publishLocation,
        getMyLocation,

        // Contacts
        getContacts,
        getContactLocation,
        getContactsWithLocations,

        // Utility
        checkHealth,
        setBaseUrl,
        getBaseUrl
    };

})();
