/**
 * Whereish - Storage Module
 * IndexedDB wrapper for named locations and settings
 */

const Storage = (function() {
    'use strict';

    const DB_NAME = 'whereish';
    const DB_VERSION = 2;  // Bumped for userId index

    let db = null;

    // ===================
    // Database Setup
    // ===================

    /**
     * Initialize the database
     * @returns {Promise<IDBDatabase>}
     */
    function init() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                reject(new Error('Failed to open database: ' + request.error));
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                const oldVersion = event.oldVersion;

                // Named locations store
                if (!database.objectStoreNames.contains('namedLocations')) {
                    const store = database.createObjectStore('namedLocations', {
                        keyPath: 'id'
                    });
                    store.createIndex('label', 'label', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('userId', 'userId', { unique: false });
                } else if (oldVersion < 2) {
                    // Upgrade: add userId index to existing store
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore('namedLocations');
                    if (!store.indexNames.contains('userId')) {
                        store.createIndex('userId', 'userId', { unique: false });
                    }
                }

                // Settings store (key-value)
                if (!database.objectStoreNames.contains('settings')) {
                    database.createObjectStore('settings', {
                        keyPath: 'key'
                    });
                }
            };
        });
    }

    // ===================
    // Named Locations
    // ===================

    /**
     * Generate a UUID
     * @returns {string}
     */
    function generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Default visibility for named locations (private - no one sees)
     */
    const DEFAULT_VISIBILITY = { mode: 'private', contactIds: [] };

    /**
     * Ensure location has valid visibility structure
     * @param {Object} location
     * @returns {Object} Location with valid visibility
     */
    function ensureVisibility(location) {
        if (!location.visibility || typeof location.visibility !== 'object') {
            return { ...location, visibility: { ...DEFAULT_VISIBILITY } };
        }
        // Ensure visibility has required fields
        return {
            ...location,
            visibility: {
                mode: location.visibility.mode || 'private',
                contactIds: Array.isArray(location.visibility.contactIds)
                    ? location.visibility.contactIds
                    : []
            }
        };
    }

    /**
     * Save a named location
     * @param {Object} location - { label, latitude, longitude, radiusMeters, userId, visibility? }
     * @returns {Promise<Object>} The saved location with id
     */
    async function saveNamedLocation(location) {
        await init();

        if (!location.userId) {
            throw new Error('userId is required to save a named location');
        }

        // Ensure visibility has valid structure
        const visibility = location.visibility && typeof location.visibility === 'object'
            ? {
                mode: location.visibility.mode || 'private',
                contactIds: Array.isArray(location.visibility.contactIds)
                    ? location.visibility.contactIds
                    : []
            }
            : { ...DEFAULT_VISIBILITY };

        const record = {
            id: location.id || generateId(),
            userId: location.userId,
            label: location.label,
            latitude: location.latitude,
            longitude: location.longitude,
            radiusMeters: location.radiusMeters || 100,
            visibility: visibility,
            createdAt: location.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['namedLocations'], 'readwrite');
            const store = transaction.objectStore('namedLocations');
            const request = store.put(record);

            request.onsuccess = () => resolve(record);
            request.onerror = () => reject(new Error('Failed to save location: ' + request.error));
        });
    }

    /**
     * Get all named locations for a user
     * @param {string} userId - User ID to filter by
     * @returns {Promise<Array>}
     */
    async function getAllNamedLocations(userId) {
        await init();

        if (!userId) {
            return [];  // No user = no locations
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['namedLocations'], 'readonly');
            const store = transaction.objectStore('namedLocations');
            const index = store.index('userId');
            const request = index.getAll(userId);

            request.onsuccess = () => {
                // Migrate existing locations to include visibility
                const locations = request.result || [];
                resolve(locations.map(ensureVisibility));
            };
            request.onerror = () => reject(new Error('Failed to get locations: ' + request.error));
        });
    }

    /**
     * Get a named location by ID
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async function getNamedLocation(id) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['namedLocations'], 'readonly');
            const store = transaction.objectStore('namedLocations');
            const request = store.get(id);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? ensureVisibility(result) : null);
            };
            request.onerror = () => reject(new Error('Failed to get location: ' + request.error));
        });
    }

    /**
     * Delete a named location
     * @param {string} id
     * @returns {Promise<void>}
     */
    async function deleteNamedLocation(id) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['namedLocations'], 'readwrite');
            const store = transaction.objectStore('namedLocations');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Failed to delete location: ' + request.error));
        });
    }

    // ===================
    // Settings
    // ===================

    /**
     * Save a setting
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async function saveSetting(key, value) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value, updatedAt: Date.now() });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('Failed to save setting: ' + request.error));
        });
    }

    /**
     * Get a setting
     * @param {string} key
     * @param {any} defaultValue
     * @returns {Promise<any>}
     */
    async function getSetting(key, defaultValue = null) {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : defaultValue);
            };
            request.onerror = () => reject(new Error('Failed to get setting: ' + request.error));
        });
    }

    // ===================
    // Public API
    // ===================

    return {
        init,
        saveNamedLocation,
        getAllNamedLocations,
        getNamedLocation,
        deleteNamedLocation,
        saveSetting,
        getSetting
    };

})();
