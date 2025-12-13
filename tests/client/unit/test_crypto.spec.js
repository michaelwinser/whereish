// @ts-check
const { test, expect, setupMinimalMocks } = require('../fixtures/test-helpers');

/**
 * Crypto Module Tests
 *
 * Tests for end-to-end encryption using NaCl box.
 * Tests key generation, encryption, and decryption operations.
 */

test.describe('Crypto Module', () => {

    test.beforeEach(async ({ page }) => {
        await setupMinimalMocks(page);
    });

    test.describe('Module Availability', () => {

        test('Crypto module is available', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const isAvailable = await page.evaluate(() => {
                return typeof Crypto !== 'undefined' && typeof Crypto.generateIdentity === 'function';
            });

            expect(isAvailable).toBe(true);
        });

        test('tweetnacl is loaded', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof nacl !== 'undefined');

            const isAvailable = await page.evaluate(() => {
                return Crypto.isAvailable();
            });

            expect(isAvailable).toBe(true);
        });

    });

    test.describe('Identity Generation', () => {

        test('generates valid key pair', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const identity = Crypto.generateIdentity();
                return {
                    hasPrivateKey: identity.privateKey instanceof Uint8Array,
                    hasPublicKey: identity.publicKey instanceof Uint8Array,
                    privateKeyLength: identity.privateKey.length,
                    publicKeyLength: identity.publicKey.length
                };
            });

            expect(result.hasPrivateKey).toBe(true);
            expect(result.hasPublicKey).toBe(true);
            expect(result.privateKeyLength).toBe(32);  // X25519 key size
            expect(result.publicKeyLength).toBe(32);
        });

        test('generates unique keys each time', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const id1 = Crypto.generateIdentity();
                const id2 = Crypto.generateIdentity();

                // Convert to base64 for comparison
                const pk1 = nacl.util.encodeBase64(id1.publicKey);
                const pk2 = nacl.util.encodeBase64(id2.publicKey);

                return pk1 !== pk2;
            });

            expect(result).toBe(true);
        });

    });

    test.describe('Encryption/Decryption', () => {

        test('encrypt and decrypt round trip', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const alice = Crypto.generateIdentity();
                const bob = Crypto.generateIdentity();
                const data = { city: 'Seattle', state: 'Washington' };

                const encrypted = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);
                const decrypted = Crypto.decryptFromContact(encrypted, alice.publicKey, bob.privateKey);

                return JSON.stringify(decrypted) === JSON.stringify(data);
            });

            expect(result).toBe(true);
        });

        test('encrypted blob has correct format', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const alice = Crypto.generateIdentity();
                const bob = Crypto.generateIdentity();
                const data = { test: 'value' };

                const encrypted = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);

                return {
                    hasVersion: encrypted.v === 1,
                    hasNonce: typeof encrypted.n === 'string',
                    hasCiphertext: typeof encrypted.c === 'string',
                    nonceLength: nacl.util.decodeBase64(encrypted.n).length,
                };
            });

            expect(result.hasVersion).toBe(true);
            expect(result.hasNonce).toBe(true);
            expect(result.hasCiphertext).toBe(true);
            expect(result.nonceLength).toBe(24);  // NaCl nonce size
        });

        test('wrong key fails to decrypt', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const alice = Crypto.generateIdentity();
                const bob = Crypto.generateIdentity();
                const eve = Crypto.generateIdentity();  // Wrong person

                const encrypted = Crypto.encryptForContact(
                    { city: 'Seattle' },
                    bob.publicKey,
                    alice.privateKey
                );

                try {
                    // Eve tries to decrypt with her key - should fail
                    Crypto.decryptFromContact(encrypted, alice.publicKey, eve.privateKey);
                    return false;  // Should have thrown
                } catch (e) {
                    return e.message.includes('Decryption failed');
                }
            });

            expect(result).toBe(true);
        });

        test('different nonces for same data', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const alice = Crypto.generateIdentity();
                const bob = Crypto.generateIdentity();
                const data = { city: 'Seattle' };

                const encrypted1 = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);
                const encrypted2 = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);

                // Nonces should be different (random each time)
                return encrypted1.n !== encrypted2.n;
            });

            expect(result).toBe(true);
        });

        test('handles complex data structures', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const alice = Crypto.generateIdentity();
                const bob = Crypto.generateIdentity();

                const data = {
                    version: 1,
                    timestamp: '2025-12-13T18:00:00Z',
                    location: {
                        city: 'Seattle',
                        state: 'Washington',
                        country: 'United States',
                        hierarchy: {
                            continent: 'North America',
                            nested: { deep: { value: 42 } }
                        }
                    },
                    place: {
                        name: 'Home',
                        visible: true
                    },
                    nullValue: null,
                    array: [1, 2, 3, 'four']
                };

                const encrypted = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);
                const decrypted = Crypto.decryptFromContact(encrypted, alice.publicKey, bob.privateKey);

                return JSON.stringify(decrypted) === JSON.stringify(data);
            });

            expect(result).toBe(true);
        });

        test('handles unicode content', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const alice = Crypto.generateIdentity();
                const bob = Crypto.generateIdentity();

                const data = {
                    city: 'München',
                    country: '日本',
                    emoji: '📍🌍'
                };

                const encrypted = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);
                const decrypted = Crypto.decryptFromContact(encrypted, alice.publicKey, bob.privateKey);

                return JSON.stringify(decrypted) === JSON.stringify(data);
            });

            expect(result).toBe(true);
        });

    });

    test.describe('Base64 Utilities', () => {

        test('encodeBase64 and decodeBase64 round trip', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Crypto !== 'undefined');

            const result = await page.evaluate(() => {
                const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
                const encoded = Crypto.encodeBase64(original);
                const decoded = Crypto.decodeBase64(encoded);

                return original.every((byte, i) => byte === decoded[i]);
            });

            expect(result).toBe(true);
        });

    });

});

test.describe('Identity Module', () => {

    test.beforeEach(async ({ page }) => {
        await setupMinimalMocks(page);
    });

    test.describe('Module Availability', () => {

        test('Identity module is available', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const isAvailable = await page.evaluate(() => {
                return typeof Identity !== 'undefined' &&
                       typeof Identity.create === 'function' &&
                       typeof Identity.load === 'function';
            });

            expect(isAvailable).toBe(true);
        });

    });

    test.describe('Identity Creation', () => {

        test('creates and stores identity', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const result = await page.evaluate(async () => {
                // Clear any existing identity
                await Identity.clear();

                // Create new identity
                const created = await Identity.create();

                // Verify it's stored
                const loaded = await Identity.load();

                return {
                    createdHasKeys: created.privateKey instanceof Uint8Array && created.publicKey instanceof Uint8Array,
                    loadedHasKeys: loaded && loaded.privateKey instanceof Uint8Array,
                    keysMatch: created.publicKey.every((byte, i) => byte === loaded.publicKey[i])
                };
            });

            expect(result.createdHasKeys).toBe(true);
            expect(result.loadedHasKeys).toBe(true);
            expect(result.keysMatch).toBe(true);
        });

        test('hasIdentity returns correct state', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const result = await page.evaluate(async () => {
                await Identity.clear();
                const beforeCreate = Identity.hasIdentity();

                await Identity.create();
                const afterCreate = Identity.hasIdentity();

                await Identity.clear();
                const afterClear = Identity.hasIdentity();

                return { beforeCreate, afterCreate, afterClear };
            });

            expect(result.beforeCreate).toBe(false);
            expect(result.afterCreate).toBe(true);
            expect(result.afterClear).toBe(false);
        });

    });

    test.describe('Identity Export/Import', () => {

        test('exports private identity as JSON', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const result = await page.evaluate(async () => {
                await Identity.clear();
                await Identity.create();

                const exported = Identity.exportPrivate({ email: 'test@example.com', name: 'Test User' });
                const parsed = JSON.parse(exported);

                return {
                    hasVersion: parsed.version === 1,
                    hasType: parsed.type === 'whereish-private-identity',
                    hasPrivateKey: typeof parsed.identity.privateKey === 'string',
                    hasPublicKey: typeof parsed.identity.publicKey === 'string',
                    hasAccount: parsed.account.email === 'test@example.com',
                    hasWarning: typeof parsed.warning === 'string'
                };
            });

            expect(result.hasVersion).toBe(true);
            expect(result.hasType).toBe(true);
            expect(result.hasPrivateKey).toBe(true);
            expect(result.hasPublicKey).toBe(true);
            expect(result.hasAccount).toBe(true);
            expect(result.hasWarning).toBe(true);
        });

        test('exports public identity as JSON', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const result = await page.evaluate(async () => {
                await Identity.clear();
                await Identity.create();

                const exported = Identity.exportPublic('Test User');
                const parsed = JSON.parse(exported);

                return {
                    hasVersion: parsed.version === 1,
                    hasType: parsed.type === 'whereish-public-identity',
                    hasPublicKey: typeof parsed.publicKey === 'string',
                    noPrivateKey: !parsed.privateKey && !parsed.identity,
                    hasName: parsed.name === 'Test User'
                };
            });

            expect(result.hasVersion).toBe(true);
            expect(result.hasType).toBe(true);
            expect(result.hasPublicKey).toBe(true);
            expect(result.noPrivateKey).toBe(true);
            expect(result.hasName).toBe(true);
        });

        test('imports private identity', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const result = await page.evaluate(async () => {
                // Create and export identity
                await Identity.clear();
                await Identity.create();
                const originalPublicKey = Identity.getPublicKeyBase64();
                const exported = Identity.exportPrivate({ email: 'alice@example.com', name: 'Alice' });

                // Clear and import
                await Identity.clear();
                const account = await Identity.importPrivate(exported);
                const importedPublicKey = Identity.getPublicKeyBase64();

                return {
                    accountEmail: account.email,
                    accountName: account.name,
                    keysMatch: originalPublicKey === importedPublicKey
                };
            });

            expect(result.accountEmail).toBe('alice@example.com');
            expect(result.accountName).toBe('Alice');
            expect(result.keysMatch).toBe(true);
        });

        test('rejects invalid identity file', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            const result = await page.evaluate(async () => {
                await Identity.clear();

                try {
                    await Identity.importPrivate(JSON.stringify({ type: 'wrong-type' }));
                    return false;
                } catch (e) {
                    return e.message.includes('Invalid identity file');
                }
            });

            expect(result).toBe(true);
        });

    });

    test.describe('Identity Persistence', () => {

        test('identity persists across page reloads', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            // Create identity
            const originalKey = await page.evaluate(async () => {
                await Identity.clear();
                await Identity.create();
                return Identity.getPublicKeyBase64();
            });

            // Reload page
            await page.reload();
            await page.waitForFunction(() => typeof Identity !== 'undefined');

            // Load identity
            const loadedKey = await page.evaluate(async () => {
                await Identity.load();
                return Identity.getPublicKeyBase64();
            });

            expect(loadedKey).toBe(originalKey);
        });

    });

    test.describe('Cross-Module Integration', () => {

        test('Identity works with Crypto for encryption', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Identity !== 'undefined' && typeof Crypto !== 'undefined');

            const result = await page.evaluate(async () => {
                // Create Alice's identity
                await Identity.clear();
                const aliceIdentity = await Identity.create();
                const alicePublicKey = Identity.getPublicKeyBase64();

                // Create Bob's identity (simulated)
                const bobIdentity = Crypto.generateIdentity();

                // Alice encrypts for Bob
                const location = { city: 'Seattle', state: 'Washington' };
                const encrypted = Crypto.encryptForContact(
                    location,
                    bobIdentity.publicKey,
                    aliceIdentity.privateKey
                );

                // Bob decrypts using Alice's public key
                const alicePubKeyBytes = Crypto.decodeBase64(alicePublicKey);
                const decrypted = Crypto.decryptFromContact(
                    encrypted,
                    alicePubKeyBytes,
                    bobIdentity.privateKey
                );

                return JSON.stringify(decrypted) === JSON.stringify(location);
            });

            expect(result).toBe(true);
        });

    });

});
