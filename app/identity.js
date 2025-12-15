/**
 * Whereish Identity Module
 *
 * Manages cryptographic identity (key pairs) for end-to-end encryption.
 * Handles creation, storage, export, and import of identities.
 *
 * Identity storage uses IndexedDB for persistence across sessions.
 *
 * @see docs/DESIGN_ENCRYPTION.md for architecture details
 * @see docs/PRD_ENCRYPTION.md for user-facing identity concepts
 */

/* global Crypto, nacl, PinCrypto */
/* exported Identity */

const Identity = (function() {
    'use strict';

    const DB_NAME = 'whereish-identity';
    const DB_VERSION = 1;
    const STORE_NAME = 'identity';
    const IDENTITY_KEY = 'current';

    // In-memory cache of current identity
    let currentIdentity = null;

    /**
     * Open the IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open identity database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    /**
     * Create a new identity (key pair)
     * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>}
     */
    async function create() {
        currentIdentity = Crypto.generateIdentity();
        await save(currentIdentity);
        return currentIdentity;
    }

    /**
     * Save identity to IndexedDB
     * @param {{privateKey: Uint8Array, publicKey: Uint8Array}} identity
     * @returns {Promise<void>}
     */
    async function save(identity) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            // Store as base64 strings for easier serialization
            const data = {
                privateKey: nacl.util.encodeBase64(identity.privateKey),
                publicKey: nacl.util.encodeBase64(identity.publicKey),
                createdAt: new Date().toISOString()
            };

            const request = store.put(data, IDENTITY_KEY);

            request.onerror = () => {
                console.error('Failed to save identity:', request.error);
                reject(request.error);
            };

            tx.oncomplete = () => {
                resolve();
            };

            tx.onerror = () => {
                console.error('Transaction failed:', tx.error);
                reject(tx.error);
            };
        });
    }

    /**
     * Load identity from IndexedDB
     * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}|null>}
     */
    async function load() {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(IDENTITY_KEY);

                request.onerror = () => {
                    console.error('Failed to load identity:', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    if (request.result) {
                        currentIdentity = {
                            privateKey: nacl.util.decodeBase64(request.result.privateKey),
                            publicKey: nacl.util.decodeBase64(request.result.publicKey)
                        };
                        resolve(currentIdentity);
                    } else {
                        currentIdentity = null;
                        resolve(null);
                    }
                };
            });
        } catch (error) {
            console.error('Error loading identity:', error);
            return null;
        }
    }

    /**
     * Export private identity file (for backup/recovery)
     * @param {{email: string, name: string}} account - Account metadata to include
     * @returns {string} JSON string of private identity file
     */
    function exportPrivate(account) {
        if (!currentIdentity) {
            throw new Error('No identity loaded');
        }

        const identityFile = {
            version: 1,
            type: 'whereish-private-identity',
            created: new Date().toISOString(),
            identity: {
                privateKey: nacl.util.encodeBase64(currentIdentity.privateKey),
                publicKey: nacl.util.encodeBase64(currentIdentity.publicKey)
            },
            account: {
                email: account.email,
                name: account.name
            },
            warning: 'KEEP SECRET. Anyone with this file can impersonate you on Whereish.'
        };

        return JSON.stringify(identityFile, null, 2);
    }

    /**
     * Export public identity (for sharing with others)
     * @param {string} name - Display name to include
     * @returns {string} JSON string of public identity
     */
    function exportPublic(name) {
        if (!currentIdentity) {
            throw new Error('No identity loaded');
        }

        const publicIdentity = {
            version: 1,
            type: 'whereish-public-identity',
            publicKey: nacl.util.encodeBase64(currentIdentity.publicKey),
            name: name,
            created: new Date().toISOString()
        };

        return JSON.stringify(publicIdentity, null, 2);
    }

    /**
     * Import a private identity from a backup file (v1 unencrypted format)
     * @param {string} json - JSON string of private identity file
     * @returns {Promise<{email: string, name: string}>} Account metadata from file
     */
    async function importPrivate(json) {
        const data = JSON.parse(json);

        if (data.type !== 'whereish-private-identity') {
            throw new Error('Invalid identity file type');
        }

        if (data.version !== 1) {
            throw new Error(`Unsupported identity file version: ${data.version}`);
        }

        currentIdentity = {
            privateKey: nacl.util.decodeBase64(data.identity.privateKey),
            publicKey: nacl.util.decodeBase64(data.identity.publicKey)
        };

        await save(currentIdentity);

        return data.account || { email: '', name: '' };
    }

    /**
     * Export encrypted identity file (v2 format with PIN protection)
     * @param {{email: string, name: string}} account - Account metadata to include
     * @param {string} pin - PIN to encrypt with
     * @returns {Promise<string>} JSON string of encrypted identity file
     */
    async function exportEncrypted(account, pin) {
        if (!currentIdentity) {
            throw new Error('No identity loaded');
        }

        return PinCrypto.encryptIdentity(currentIdentity, account, pin);
    }

    /**
     * Import an encrypted identity from a backup file (v2 format)
     * @param {string} json - JSON string of encrypted identity file
     * @param {string} pin - PIN to decrypt with
     * @returns {Promise<{email: string, name: string}>} Account metadata from file
     * @throws {Error} If PIN is incorrect or file is corrupted
     */
    async function importEncrypted(json, pin) {
        const result = await PinCrypto.decryptIdentity(json, pin);

        currentIdentity = result.identity;
        await save(currentIdentity);

        return result.account;
    }

    /**
     * Import identity from any format (auto-detects v1 vs v2)
     * @param {string} json - JSON string of identity file
     * @param {string} [pin] - PIN for v2 encrypted files (ignored for v1)
     * @returns {Promise<{email: string, name: string, wasEncrypted: boolean}>}
     */
    async function importAny(json, pin) {
        const format = PinCrypto.detectFormat(json);

        if (format === 'encrypted') {
            if (!pin) {
                throw new Error('PIN required for encrypted identity file');
            }
            const account = await importEncrypted(json, pin);
            return { ...account, wasEncrypted: true };
        }

        if (format === 'unencrypted') {
            const account = await importPrivate(json);
            return { ...account, wasEncrypted: false };
        }

        throw new Error('Unknown identity file format');
    }

    /**
     * Clear the stored identity
     * @returns {Promise<void>}
     */
    async function clear() {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.delete(IDENTITY_KEY);

                request.onerror = () => {
                    console.error('Failed to clear identity:', request.error);
                    reject(request.error);
                };

                tx.oncomplete = () => {
                    currentIdentity = null;
                    resolve();
                };
            });
        } catch (error) {
            console.error('Error clearing identity:', error);
            currentIdentity = null;
        }
    }

    /**
     * Get the current identity (from memory)
     * @returns {{privateKey: Uint8Array, publicKey: Uint8Array}|null}
     */
    function getCurrent() {
        return currentIdentity;
    }

    /**
     * Get the public key as base64 string
     * @returns {string|null}
     */
    function getPublicKeyBase64() {
        if (!currentIdentity) {
            return null;
        }
        return nacl.util.encodeBase64(currentIdentity.publicKey);
    }

    /**
     * Check if an identity is currently loaded
     * @returns {boolean}
     */
    function hasIdentity() {
        return currentIdentity !== null;
    }

    return {
        create,
        load,
        save,
        exportPrivate,
        exportPublic,
        exportEncrypted,
        importPrivate,
        importEncrypted,
        importAny,
        clear,
        getCurrent,
        getPublicKeyBase64,
        hasIdentity
    };
})();
