/**
 * PIN-based Cryptography Module
 *
 * Provides PIN-based encryption for identity files using:
 * - PBKDF2 for key derivation (100,000 iterations)
 * - AES-256-GCM for authenticated encryption
 *
 * Uses the Web Crypto API exclusively - no external dependencies.
 *
 * @see docs/DESIGN_AUTH_IDENTITY.md for security design
 */

/* global crypto, btoa, atob, TextEncoder, TextDecoder */
/* exported PinCrypto */

const PinCrypto = (function() {
    'use strict';

    // PBKDF2 configuration
    const PBKDF2_ITERATIONS = 100000;
    const PBKDF2_HASH = 'SHA-256';
    const KEY_LENGTH = 256; // bits (AES-256)

    // AES-GCM configuration
    const AES_ALGORITHM = 'AES-GCM';
    const IV_LENGTH = 12; // bytes (96 bits, recommended for GCM)
    const TAG_LENGTH = 128; // bits (authentication tag)

    // Salt for PBKDF2
    const SALT_LENGTH = 16; // bytes (128 bits)

    // Test value for PIN verification
    const TEST_PLAINTEXT = 'whereish-pin-test-v1';

    /**
     * Generate cryptographically random bytes
     * @param {number} length - Number of bytes
     * @returns {Uint8Array}
     */
    function randomBytes(length) {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return bytes;
    }

    /**
     * Encode Uint8Array to base64 string
     * @param {Uint8Array} bytes
     * @returns {string}
     */
    function toBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Decode base64 string to Uint8Array
     * @param {string} base64
     * @returns {Uint8Array}
     */
    function fromBase64(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Derive an AES key from a PIN using PBKDF2
     * @param {string} pin - User's PIN
     * @param {Uint8Array} salt - Salt for key derivation
     * @returns {Promise<CryptoKey>}
     */
    async function deriveKeyFromPIN(pin, salt) {
        // Import PIN as key material
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(pin),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive AES key using PBKDF2
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: PBKDF2_HASH
            },
            keyMaterial,
            {
                name: AES_ALGORITHM,
                length: KEY_LENGTH
            },
            false, // not extractable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data using AES-256-GCM
     * @param {Uint8Array} plaintext - Data to encrypt
     * @param {CryptoKey} key - AES key
     * @param {Uint8Array} iv - Initialization vector
     * @returns {Promise<Uint8Array>} Ciphertext (includes auth tag)
     */
    async function encryptAES(plaintext, key, iv) {
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: AES_ALGORITHM,
                iv: iv,
                tagLength: TAG_LENGTH
            },
            key,
            plaintext
        );
        return new Uint8Array(ciphertext);
    }

    /**
     * Decrypt data using AES-256-GCM
     * @param {Uint8Array} ciphertext - Data to decrypt (includes auth tag)
     * @param {CryptoKey} key - AES key
     * @param {Uint8Array} iv - Initialization vector
     * @returns {Promise<Uint8Array>} Plaintext
     * @throws {Error} If decryption fails (wrong key or tampered data)
     */
    async function decryptAES(ciphertext, key, iv) {
        try {
            const plaintext = await crypto.subtle.decrypt(
                {
                    name: AES_ALGORITHM,
                    iv: iv,
                    tagLength: TAG_LENGTH
                },
                key,
                ciphertext
            );
            return new Uint8Array(plaintext);
        } catch {
            // GCM authentication failure means wrong key or tampered data
            throw new Error('Decryption failed - incorrect PIN or corrupted data');
        }
    }

    /**
     * Encrypt identity with PIN for secure backup
     *
     * @param {{privateKey: Uint8Array, publicKey: Uint8Array}} identity - Key pair
     * @param {{email: string, name: string}} account - Account metadata
     * @param {string} pin - User's PIN
     * @returns {Promise<string>} JSON string of encrypted identity file (v2 format)
     */
    async function encryptIdentity(identity, account, pin) {
        // Generate random salt and IV
        const salt = randomBytes(SALT_LENGTH);
        const iv = randomBytes(IV_LENGTH);

        // Derive key from PIN
        const key = await deriveKeyFromPIN(pin, salt);

        // Prepare plaintext payload (same structure as v1 but without wrapper)
        const payload = {
            identity: {
                privateKey: toBase64(identity.privateKey),
                publicKey: toBase64(identity.publicKey)
            },
            name: account.name,
            created: new Date().toISOString()
        };

        // Encrypt payload
        const encoder = new TextEncoder();
        const plaintext = encoder.encode(JSON.stringify(payload));
        const ciphertext = await encryptAES(plaintext, key, iv);

        // Build v2 encrypted identity file
        const encryptedFile = {
            version: 2,
            type: 'whereish-identity-encrypted',
            encryption: {
                algorithm: 'AES-256-GCM',
                kdf: 'PBKDF2-SHA256',
                iterations: PBKDF2_ITERATIONS,
                salt: toBase64(salt),
                iv: toBase64(iv)
            },
            payload: toBase64(ciphertext),
            account: {
                email: account.email
                // Name is inside encrypted payload for privacy
            },
            warning: 'This file is encrypted with your PIN. Keep it safe for account recovery.'
        };

        return JSON.stringify(encryptedFile, null, 2);
    }

    /**
     * Decrypt identity from encrypted backup file
     *
     * @param {string} json - JSON string of encrypted identity file
     * @param {string} pin - User's PIN
     * @returns {Promise<{identity: {privateKey: Uint8Array, publicKey: Uint8Array}, account: {email: string, name: string}}>}
     * @throws {Error} If decryption fails or file format is invalid
     */
    async function decryptIdentity(json, pin) {
        const data = JSON.parse(json);

        // Validate format
        if (data.type !== 'whereish-identity-encrypted') {
            throw new Error('Invalid identity file type');
        }

        if (data.version !== 2) {
            throw new Error(`Unsupported encrypted identity version: ${data.version}`);
        }

        // Extract encryption parameters
        const salt = fromBase64(data.encryption.salt);
        const iv = fromBase64(data.encryption.iv);
        const ciphertext = fromBase64(data.payload);

        // Derive key from PIN
        const key = await deriveKeyFromPIN(pin, salt);

        // Decrypt payload
        const plaintextBytes = await decryptAES(ciphertext, key, iv);
        const decoder = new TextDecoder();
        const payload = JSON.parse(decoder.decode(plaintextBytes));

        // Reconstruct identity and account
        return {
            identity: {
                privateKey: fromBase64(payload.identity.privateKey),
                publicKey: fromBase64(payload.identity.publicKey)
            },
            account: {
                email: data.account.email,
                name: payload.name || ''
            }
        };
    }

    /**
     * Create encrypted test value for PIN verification
     * Used to check if user remembers their PIN without decrypting full identity
     *
     * @param {string} pin - User's PIN
     * @returns {Promise<{salt: string, iv: string, ciphertext: string}>}
     */
    async function encryptTestValue(pin) {
        const salt = randomBytes(SALT_LENGTH);
        const iv = randomBytes(IV_LENGTH);

        const key = await deriveKeyFromPIN(pin, salt);

        const encoder = new TextEncoder();
        const ciphertext = await encryptAES(encoder.encode(TEST_PLAINTEXT), key, iv);

        return {
            salt: toBase64(salt),
            iv: toBase64(iv),
            ciphertext: toBase64(ciphertext)
        };
    }

    /**
     * Verify PIN against stored test value
     *
     * @param {{salt: string, iv: string, ciphertext: string}} testData - Stored test data
     * @param {string} pin - PIN to verify
     * @returns {Promise<boolean>} True if PIN is correct
     */
    async function verifyPIN(testData, pin) {
        try {
            const salt = fromBase64(testData.salt);
            const iv = fromBase64(testData.iv);
            const ciphertext = fromBase64(testData.ciphertext);

            const key = await deriveKeyFromPIN(pin, salt);
            const plaintextBytes = await decryptAES(ciphertext, key, iv);

            const decoder = new TextDecoder();
            const plaintext = decoder.decode(plaintextBytes);

            return plaintext === TEST_PLAINTEXT;
        } catch {
            // Decryption failed = wrong PIN
            return false;
        }
    }

    /**
     * Check if a file is an encrypted identity (v2) or unencrypted (v1)
     *
     * @param {string} json - JSON string of identity file
     * @returns {'encrypted'|'unencrypted'|'unknown'}
     */
    function detectFormat(json) {
        try {
            const data = JSON.parse(json);

            if (data.type === 'whereish-identity-encrypted' && data.version === 2) {
                return 'encrypted';
            }

            if (data.type === 'whereish-private-identity' && data.version === 1) {
                return 'unencrypted';
            }

            return 'unknown';
        } catch {
            return 'unknown';
        }
    }

    return {
        encryptIdentity,
        decryptIdentity,
        encryptTestValue,
        verifyPIN,
        detectFormat,
        // Expose for testing
        deriveKeyFromPIN,
        toBase64,
        fromBase64
    };
})();
