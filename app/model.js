/**
 * Model Layer for Whereish
 *
 * Responsibilities:
 * - Hold all application state
 * - Provide pure business logic functions
 * - Emit events when state changes
 * - No DOM dependencies (testable in Node.js)
 *
 * Depends on: Events, Geofence, Storage, API
 */
const Model = (function() {
    'use strict';

    // ===================
    // Event Types
    // ===================

    const EVENTS = {
        // Location events
        LOCATION_LOADING: 'location:loading',
        LOCATION_CHANGED: 'location:changed',
        LOCATION_ERROR: 'location:error',

        // Places events
        PLACES_CHANGED: 'places:changed',
        PLACE_MATCH_CHANGED: 'places:match:changed',

        // Contacts events
        CONTACTS_CHANGED: 'contacts:changed',
        CONTACT_SELECTED: 'contact:selected',
        CONTACT_REQUESTS_CHANGED: 'contacts:requests:changed',

        // Auth events
        AUTH_CHANGED: 'auth:changed',
        SERVER_STATUS_CHANGED: 'server:status:changed',

        // Config events
        PERMISSION_LEVELS_LOADED: 'permissions:loaded',

        // Device events
        DEVICES_CHANGED: 'devices:changed'
    };

    // ===================
    // Configuration
    // ===================

    const CONFIG = {
        geocodeUrl: 'https://nominatim.openstreetmap.org/reverse',
        geolocation: {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
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
        { key: 'continent', label: 'Continent', nominatimKeys: [] },
        { key: 'planet', label: 'Planet', nominatimKeys: [] }
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

    let state = {
        // Location state
        currentCoordinates: null,
        currentHierarchy: null,

        // Places state
        namedLocations: [],
        currentMatch: null,

        // Contacts state
        contacts: [],
        selectedContact: null,
        contactRequests: { incoming: [], outgoing: [] },

        // Auth/App state
        currentUserId: null,
        serverConnected: false,

        // Config state
        permissionLevels: [],

        // Device state
        devices: [],
        currentDeviceId: null
    };

    // ===================
    // Pure Business Logic Functions
    // ===================

    /**
     * Build a location hierarchy from Nominatim address components
     * @param {Object} addressComponents - Nominatim address response
     * @returns {Object} Hierarchy object with keys: address, street, neighborhood, city, county, state, country, continent, planet
     */
    function buildHierarchy(addressComponents) {
        const hierarchy = {};

        for (const level of HIERARCHY_LEVELS) {
            if (level.key === 'planet') {
                // Planet is always set - the minimum sharing level for connected contacts
                hierarchy.planet = 'Planet Earth';
                continue;
            }

            if (level.key === 'continent') {
                const country = hierarchy.country;
                if (country && COUNTRY_TO_CONTINENT[country]) {
                    hierarchy.continent = COUNTRY_TO_CONTINENT[country];
                }
                continue;
            }

            if (level.key === 'address') {
                const houseNumber = addressComponents.house_number;
                const road = addressComponents.road;
                if (houseNumber && road) {
                    hierarchy.address = houseNumber + ' ' + road;
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

        // Planet is always present as the minimum level
        if (!hierarchy.planet) {
            hierarchy.planet = 'Planet Earth';
        }

        return hierarchy;
    }

    // Default location text - the minimum sharing level for connected contacts
    const DEFAULT_LOCATION = 'Planet Earth';

    /**
     * Find the most specific level in a hierarchy
     * @param {Object} hierarchy - Location hierarchy object
     * @returns {string|null} Most specific location value or null
     */
    function findMostSpecificLevel(hierarchy) {
        for (const level of HIERARCHY_LEVELS) {
            if (hierarchy[level.key]) {
                return hierarchy[level.key];
            }
        }
        return null;
    }

    /**
     * Get display text for a location hierarchy
     * @param {Object} hierarchy - Location hierarchy object
     * @param {string} [namedLocation] - Optional named location to show instead
     * @returns {string} Location text to display (never null)
     */
    function getLocationText(hierarchy, namedLocation) {
        if (namedLocation) {
            return namedLocation;
        }
        return findMostSpecificLevel(hierarchy) || DEFAULT_LOCATION;
    }

    /**
     * Get display text for a contact's location
     * Connected contacts always share at minimum planet level
     * @param {Object} contact - Contact object with optional location data
     * @returns {string} Location text to display (never null)
     */
    function getContactLocationText(contact) {
        if (contact.location && contact.location.data) {
            const data = contact.location.data;
            return getLocationText(data.hierarchy, data.namedLocation);
        }
        // No location data yet - default to planet level
        return DEFAULT_LOCATION;
    }

    /**
     * Format a date string as relative time (e.g., "5m ago", "2h ago")
     * @param {string} dateString - ISO date string
     * @returns {string} Human-readable relative time
     */
    function formatTimeAgo(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            // Check for invalid date
            if (!(date instanceof Date) || isNaN(date.getTime())) return '';
            const now = new Date();
            const seconds = Math.floor((now - date) / 1000);

            if (seconds < 60) return 'Just now';
            if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
            if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
            if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
            return date.toLocaleDateString();
        } catch {
            return '';
        }
    }

    /**
     * Escape HTML special characters to prevent XSS
     * Pure implementation without DOM dependency
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML string
     */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Get visibility indicator for a place
     * @param {Object} visibility - { mode: 'private'|'all'|'selected', contactIds: [] }
     * @returns {Object} { icon, tooltip }
     */
    function getVisibilityIndicator(visibility) {
        if (!visibility || visibility.mode === 'private') {
            return { icon: '🔒', tooltip: 'Private - no one can see' };
        }
        if (visibility.mode === 'all') {
            return { icon: '👥', tooltip: 'Visible to all contacts' };
        }
        // 'selected' mode
        const count = visibility.contactIds?.length || 0;
        return {
            icon: '👤×' + count,
            tooltip: 'Shared with ' + count + ' contact' + (count !== 1 ? 's' : '')
        };
    }

    /**
     * Filter a hierarchy based on permission level
     * @param {Object} hierarchy - Full location hierarchy
     * @param {string} permissionLevel - Permission level key (e.g., 'city', 'street', 'planet')
     * @returns {Object} Filtered hierarchy containing only allowed levels
     */
    function getFilteredHierarchy(hierarchy, permissionLevel) {
        if (!hierarchy) return { planet: 'Planet Earth' };

        const levelIndex = HIERARCHY_LEVELS.findIndex(function(l) {
            return l.key === permissionLevel;
        });

        if (levelIndex === -1) {
            // Unknown level - default to planet (minimum sharing)
            return { planet: 'Planet Earth' };
        }

        const filtered = {};
        for (let i = levelIndex; i < HIERARCHY_LEVELS.length; i++) {
            const key = HIERARCHY_LEVELS[i].key;
            if (hierarchy[key]) {
                filtered[key] = hierarchy[key];
            }
        }

        // Ensure at least planet is set (should always be present)
        if (Object.keys(filtered).length === 0) {
            filtered.planet = 'Planet Earth';
        }

        return filtered;
    }

    /**
     * Get the label for a permission level
     * @param {string} levelKey - Permission level key
     * @returns {string} Human-readable label
     */
    function getPermissionLabel(levelKey) {
        const level = HIERARCHY_LEVELS.find(function(l) {
            return l.key === levelKey;
        });
        return level ? level.label : levelKey;
    }

    // ===================
    // Location State Management
    // ===================

    /**
     * Get the current location state
     * @returns {Object} { coordinates, hierarchy }
     */
    function getLocation() {
        return {
            coordinates: state.currentCoordinates,
            hierarchy: state.currentHierarchy
        };
    }

    /**
     * Set the current location (called after geocoding)
     * @param {Object} coordinates - { latitude, longitude }
     * @param {Object} hierarchy - Location hierarchy from buildHierarchy
     */
    function setLocation(coordinates, hierarchy) {
        state.currentCoordinates = coordinates;
        state.currentHierarchy = hierarchy;

        Events.emit(EVENTS.LOCATION_CHANGED, {
            coordinates: state.currentCoordinates,
            hierarchy: state.currentHierarchy
        });
    }

    /**
     * Signal that location is being loaded
     */
    function setLocationLoading() {
        Events.emit(EVENTS.LOCATION_LOADING);
    }

    /**
     * Signal a location error
     * @param {string} message - Error message
     */
    function setLocationError(message) {
        Events.emit(EVENTS.LOCATION_ERROR, { message: message });
    }

    // ===================
    // Places State Management
    // ===================

    /**
     * Get all named locations
     * @returns {Array} Named locations array
     */
    function getPlaces() {
        return state.namedLocations;
    }

    /**
     * Set named locations
     * @param {Array} places - Array of named location objects
     */
    function setPlaces(places) {
        state.namedLocations = places || [];
        Events.emit(EVENTS.PLACES_CHANGED, { places: state.namedLocations });
    }

    /**
     * Add a place to the list
     * @param {Object} place - Named location object
     */
    function addPlace(place) {
        state.namedLocations.push(place);
        Events.emit(EVENTS.PLACES_CHANGED, { places: state.namedLocations });
    }

    /**
     * Update a place in the list
     * @param {string} placeId - ID of place to update
     * @param {Object} updatedPlace - Updated place object
     */
    function updatePlace(placeId, updatedPlace) {
        const index = state.namedLocations.findIndex(function(p) {
            return p.id === placeId;
        });
        if (index !== -1) {
            state.namedLocations[index] = updatedPlace;
            Events.emit(EVENTS.PLACES_CHANGED, { places: state.namedLocations });
        }
    }

    /**
     * Remove a place from the list
     * @param {string} placeId - ID of place to remove
     */
    function removePlace(placeId) {
        state.namedLocations = state.namedLocations.filter(function(p) {
            return p.id !== placeId;
        });
        Events.emit(EVENTS.PLACES_CHANGED, { places: state.namedLocations });
    }

    /**
     * Get the current place match
     * @returns {Object|null} Current matched place or null
     */
    function getCurrentMatch() {
        return state.currentMatch;
    }

    /**
     * Set the current place match
     * @param {Object|null} match - Matched place object or null
     */
    function setCurrentMatch(match) {
        state.currentMatch = match;
        Events.emit(EVENTS.PLACE_MATCH_CHANGED, { match: state.currentMatch });
    }

    // ===================
    // Contacts State Management
    // ===================

    /**
     * Get all contacts
     * @returns {Array} Contacts array
     */
    function getContacts() {
        return state.contacts;
    }

    /**
     * Set contacts
     * @param {Array} contacts - Array of contact objects
     */
    function setContacts(contacts) {
        state.contacts = contacts || [];
        Events.emit(EVENTS.CONTACTS_CHANGED, { contacts: state.contacts });
    }

    /**
     * Get the selected contact
     * @returns {Object|null} Selected contact or null
     */
    function getSelectedContact() {
        return state.selectedContact;
    }

    /**
     * Set the selected contact
     * @param {Object|null} contact - Contact object or null
     */
    function setSelectedContact(contact) {
        state.selectedContact = contact;
        Events.emit(EVENTS.CONTACT_SELECTED, { contact: state.selectedContact });
    }

    /**
     * Get contact requests
     * @returns {Object} { incoming: [], outgoing: [] }
     */
    function getContactRequests() {
        return state.contactRequests;
    }

    /**
     * Set contact requests
     * @param {Object} requests - { incoming: [], outgoing: [] }
     */
    function setContactRequests(requests) {
        state.contactRequests = requests || { incoming: [], outgoing: [] };
        Events.emit(EVENTS.CONTACT_REQUESTS_CHANGED, { requests: state.contactRequests });
    }

    // ===================
    // Auth/App State Management
    // ===================

    /**
     * Get current user ID
     * @returns {string|null} User ID or null
     */
    function getCurrentUserId() {
        return state.currentUserId;
    }

    /**
     * Set current user ID
     * @param {string|null} userId - User ID or null
     */
    function setCurrentUserId(userId) {
        state.currentUserId = userId;
        Events.emit(EVENTS.AUTH_CHANGED, { userId: state.currentUserId, authenticated: !!userId });
    }

    /**
     * Get server connected status
     * @returns {boolean} True if connected
     */
    function isServerConnected() {
        return state.serverConnected;
    }

    /**
     * Set server connected status
     * @param {boolean} connected - Connection status
     */
    function setServerConnected(connected) {
        state.serverConnected = connected;
        Events.emit(EVENTS.SERVER_STATUS_CHANGED, { connected: state.serverConnected });
    }

    /**
     * Get permission levels
     * @returns {Array} Array of permission level strings
     */
    function getPermissionLevels() {
        return state.permissionLevels;
    }

    /**
     * Set permission levels
     * @param {Array} levels - Array of permission level strings
     */
    function setPermissionLevels(levels) {
        state.permissionLevels = levels || [];
        Events.emit(EVENTS.PERMISSION_LEVELS_LOADED, { levels: state.permissionLevels });
    }

    // ===================
    // Device State Management
    // ===================

    /**
     * Get all devices
     * @returns {Array} Devices array
     */
    function getDevices() {
        return state.devices;
    }

    /**
     * Set devices
     * @param {Array} devices - Array of device objects
     */
    function setDevices(devices) {
        state.devices = devices || [];
        Events.emit(EVENTS.DEVICES_CHANGED, { devices: state.devices });
    }

    /**
     * Get current device ID
     * @returns {string|null} Current device ID or null
     */
    function getCurrentDeviceId() {
        return state.currentDeviceId;
    }

    /**
     * Set current device ID
     * @param {string|null} deviceId - Device ID or null
     */
    function setCurrentDeviceId(deviceId) {
        state.currentDeviceId = deviceId;
        // Don't emit separate event - devices event covers this
    }

    /**
     * Get the active device
     * @returns {Object|null} Active device or null
     */
    function getActiveDevice() {
        return state.devices.find(d => d.isActive) || null;
    }

    /**
     * Check if current device is the active device
     * @returns {boolean} True if this device is active
     */
    function isCurrentDeviceActive() {
        if (!state.currentDeviceId) return false;
        const device = state.devices.find(d => d.id === state.currentDeviceId);
        return device ? device.isActive : false;
    }

    // ===================
    // State Management
    // ===================

    /**
     * Reset all Model state to initial values.
     * Call this on page load before fetching fresh data to ensure
     * no stale state persists across reloads.
     */
    function reset() {
        state.currentCoordinates = null;
        state.currentHierarchy = null;
        state.namedLocations = [];
        state.currentMatch = null;
        state.contacts = [];
        state.selectedContact = null;
        state.contactRequests = { incoming: [], outgoing: [] };
        state.currentUserId = null;
        state.serverConnected = false;
        state.permissionLevels = [];
        state.devices = [];
        state.currentDeviceId = null;

        // Emit events so any listeners know state was cleared
        Events.emit(EVENTS.LOCATION_CHANGED, { coordinates: null, hierarchy: null });
        Events.emit(EVENTS.PLACES_CHANGED, { places: [] });
        Events.emit(EVENTS.CONTACTS_CHANGED, { contacts: [] });
        Events.emit(EVENTS.CONTACT_REQUESTS_CHANGED, { requests: { incoming: [], outgoing: [] } });
        Events.emit(EVENTS.DEVICES_CHANGED, { devices: [] });
        Events.emit(EVENTS.AUTH_CHANGED, { userId: null, authenticated: false });
    }

    // ===================
    // Event Helpers
    // ===================

    /**
     * Subscribe to a Model event
     */
    function on(event, callback) {
        return Events.on(event, callback);
    }

    /**
     * Unsubscribe from a Model event
     */
    function off(event, callback) {
        Events.off(event, callback);
    }

    // ===================
    // Public API
    // ===================

    return {
        // Event system
        EVENTS: EVENTS,
        on: on,
        off: off,

        // Constants
        CONFIG: CONFIG,
        HIERARCHY_LEVELS: HIERARCHY_LEVELS,
        COUNTRY_TO_CONTINENT: COUNTRY_TO_CONTINENT,
        DEFAULT_LOCATION: DEFAULT_LOCATION,

        // Pure functions
        buildHierarchy: buildHierarchy,
        findMostSpecificLevel: findMostSpecificLevel,
        getLocationText: getLocationText,
        getContactLocationText: getContactLocationText,
        formatTimeAgo: formatTimeAgo,
        escapeHtml: escapeHtml,
        getVisibilityIndicator: getVisibilityIndicator,
        getFilteredHierarchy: getFilteredHierarchy,
        getPermissionLabel: getPermissionLabel,

        // Location state
        getLocation: getLocation,
        setLocation: setLocation,
        setLocationLoading: setLocationLoading,
        setLocationError: setLocationError,

        // Places state
        getPlaces: getPlaces,
        setPlaces: setPlaces,
        addPlace: addPlace,
        updatePlace: updatePlace,
        removePlace: removePlace,
        getCurrentMatch: getCurrentMatch,
        setCurrentMatch: setCurrentMatch,

        // Contacts state
        getContacts: getContacts,
        setContacts: setContacts,
        getSelectedContact: getSelectedContact,
        setSelectedContact: setSelectedContact,
        getContactRequests: getContactRequests,
        setContactRequests: setContactRequests,

        // Auth/App state
        getCurrentUserId: getCurrentUserId,
        setCurrentUserId: setCurrentUserId,
        isServerConnected: isServerConnected,
        setServerConnected: setServerConnected,
        getPermissionLevels: getPermissionLevels,
        setPermissionLevels: setPermissionLevels,

        // Device state
        getDevices: getDevices,
        setDevices: setDevices,
        getCurrentDeviceId: getCurrentDeviceId,
        setCurrentDeviceId: setCurrentDeviceId,
        getActiveDevice: getActiveDevice,
        isCurrentDeviceActive: isCurrentDeviceActive,

        // State management
        reset: reset
    };
})();
