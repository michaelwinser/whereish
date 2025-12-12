/**
 * Whereish - Storage Module
 * IndexedDB wrapper for named locations and settings
 */

const Storage = (function() {
    'use strict';

    const DB_NAME = 'whereish';
    const DB_VERSION = 1;

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

                // Named locations store
                if (!database.objectStoreNames.contains('namedLocations')) {
                    const store = database.createObjectStore('namedLocations', {
                        keyPath: 'id'
                    });
                    store.createIndex('label', 'label', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
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
     * Save a named location
     * @param {Object} location - { label, latitude, longitude, radiusMeters }
     * @returns {Promise<Object>} The saved location with id
     */
    async function saveNamedLocation(location) {
        await init();

        const record = {
            id: location.id || generateId(),
            label: location.label,
            latitude: location.latitude,
            longitude: location.longitude,
            radiusMeters: location.radiusMeters || 100,
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
     * Get all named locations
     * @returns {Promise<Array>}
     */
    async function getAllNamedLocations() {
        await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['namedLocations'], 'readonly');
            const store = transaction.objectStore('namedLocations');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
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

            request.onsuccess = () => resolve(request.result || null);
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
