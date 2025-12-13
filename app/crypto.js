/**
 * Whereish Cryptography Module
 *
 * Provides end-to-end encryption for location sharing using NaCl box.
 * Uses tweetnacl-js (loaded from CDN) for cryptographic operations.
 *
 * @see docs/DESIGN_ENCRYPTION.md for architecture details
 */

/* global nacl */
/* exported Crypto */

const Crypto = (function() {
    'use strict';

    /**
     * Generate a new identity (X25519 key pair)
     * @returns {{privateKey: Uint8Array, publicKey: Uint8Array}}
     */
    function generateIdentity() {
        if (typeof nacl === 'undefined') {
            throw new Error('tweetnacl not loaded');
        }
        const keyPair = nacl.box.keyPair();
        return {
            privateKey: keyPair.secretKey,
            publicKey: keyPair.publicKey
        };
    }

    /**
     * Encrypt data for a specific contact
     * @param {Object} data - The data to encrypt (will be JSON stringified)
     * @param {Uint8Array} contactPublicKey - Contact's public key
     * @param {Uint8Array} myPrivateKey - Sender's private key
     * @returns {{v: number, n: string, c: string}} - Encrypted blob with version, nonce, ciphertext
     */
    function encryptForContact(data, contactPublicKey, myPrivateKey) {
        if (typeof nacl === 'undefined') {
            throw new Error('tweetnacl not loaded');
        }

        const message = nacl.util.decodeUTF8(JSON.stringify(data));
        const nonce = nacl.randomBytes(24);
        const ciphertext = nacl.box(message, nonce, contactPublicKey, myPrivateKey);

        if (!ciphertext) {
            throw new Error('Encryption failed');
        }

        return {
            v: 1,  // Format version
            n: nacl.util.encodeBase64(nonce),
            c: nacl.util.encodeBase64(ciphertext)
        };
    }

    /**
     * Decrypt data from a contact
     * @param {{v: number, n: string, c: string}} blob - Encrypted blob
     * @param {Uint8Array} contactPublicKey - Contact's public key
     * @param {Uint8Array} myPrivateKey - Recipient's private key
     * @returns {Object} - Decrypted data
     * @throws {Error} If decryption fails (wrong key, corrupted data, etc.)
     */
    function decryptFromContact(blob, contactPublicKey, myPrivateKey) {
        if (typeof nacl === 'undefined') {
            throw new Error('tweetnacl not loaded');
        }

        if (blob.v !== 1) {
            throw new Error(`Unsupported encryption version: ${blob.v}`);
        }

        const nonce = nacl.util.decodeBase64(blob.n);
        const ciphertext = nacl.util.decodeBase64(blob.c);
        const message = nacl.box.open(ciphertext, nonce, contactPublicKey, myPrivateKey);

        if (!message) {
            throw new Error('Decryption failed - wrong key or corrupted data');
        }

        return JSON.parse(nacl.util.encodeUTF8(message));
    }

    /**
     * Encode a Uint8Array as base64
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    function encodeBase64(bytes) {
        if (typeof nacl === 'undefined') {
            throw new Error('tweetnacl not loaded');
        }
        return nacl.util.encodeBase64(bytes);
    }

    /**
     * Decode a base64 string to Uint8Array
     * @param {string} base64
     * @returns {Uint8Array}
     */
    function decodeBase64(base64) {
        if (typeof nacl === 'undefined') {
            throw new Error('tweetnacl not loaded');
        }
        return nacl.util.decodeBase64(base64);
    }

    /**
     * Check if tweetnacl is loaded and available
     * @returns {boolean}
     */
    function isAvailable() {
        return typeof nacl !== 'undefined' &&
               typeof nacl.box !== 'undefined' &&
               typeof nacl.util !== 'undefined';
    }

    return {
        generateIdentity,
        encryptForContact,
        decryptFromContact,
        encodeBase64,
        decodeBase64,
        isAvailable
    };
})();
