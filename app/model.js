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
        PERMISSION_LEVELS_LOADED: 'permissions:loaded'
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
    // State (will be populated in later phases)
    // ===================

    // eslint-disable-next-line no-unused-vars
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
        permissionLevels: []
    };

    // ===================
    // Pure Business Logic Functions
    // ===================

    /**
     * Build a location hierarchy from Nominatim address components
     * @param {Object} addressComponents - Nominatim address response
     * @returns {Object} Hierarchy object with keys: address, street, neighborhood, city, county, state, country, continent
     */
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

        if (!hierarchy.continent) {
            hierarchy.continent = 'Planet Earth';
        }

        return hierarchy;
    }

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
     * @param {string} permissionLevel - Permission level key (e.g., 'city', 'street')
     * @returns {Object} Filtered hierarchy containing only allowed levels
     */
    function getFilteredHierarchy(hierarchy, permissionLevel) {
        if (!hierarchy) return { continent: 'Planet Earth' };

        const levelIndex = HIERARCHY_LEVELS.findIndex(function(l) {
            return l.key === permissionLevel;
        });

        if (levelIndex === -1) {
            // Unknown level - show planet only
            return { continent: 'Planet Earth' };
        }

        const filtered = {};
        for (let i = levelIndex; i < HIERARCHY_LEVELS.length; i++) {
            const key = HIERARCHY_LEVELS[i].key;
            if (hierarchy[key]) {
                filtered[key] = hierarchy[key];
            }
        }

        // Ensure at least continent is set
        if (Object.keys(filtered).length === 0) {
            filtered.continent = 'Planet Earth';
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

        // Pure functions
        buildHierarchy: buildHierarchy,
        findMostSpecificLevel: findMostSpecificLevel,
        formatTimeAgo: formatTimeAgo,
        escapeHtml: escapeHtml,
        getVisibilityIndicator: getVisibilityIndicator,
        getFilteredHierarchy: getFilteredHierarchy,
        getPermissionLabel: getPermissionLabel
    };
})();
