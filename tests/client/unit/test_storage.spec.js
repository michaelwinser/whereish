// @ts-check
const { test, expect, NAMED_LOCATIONS } = require('../fixtures/test-helpers');

/**
 * Storage Module Tests
 *
 * Tests for IndexedDB operations - named locations and settings.
 * Requires real browser for IndexedDB support.
 */

test.describe('Storage Module', () => {

    // Clear database before each test
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => {
            return new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase('whereish');
                req.onsuccess = () => resolve(undefined);
                req.onerror = () => reject(req.error);
            });
        });
        await page.reload();
        await page.waitForFunction(() => typeof window.Storage !== 'undefined');
    });

    test.describe('Database Initialization', () => {

        test('initializes database successfully', async ({ page }) => {
            const result = await page.evaluate(async () => {
                await Storage.init();
                return true;
            });

            expect(result).toBe(true);
        });

        test('creates namedLocations object store', async ({ page }) => {
            const hasStore = await page.evaluate(async () => {
                await Storage.init();
                const dbs = await indexedDB.databases();
                const db = await new Promise((resolve, reject) => {
                    const req = indexedDB.open('whereish');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                const hasStore = db.objectStoreNames.contains('namedLocations');
                db.close();
                return hasStore;
            });

            expect(hasStore).toBe(true);
        });

        test('creates settings object store', async ({ page }) => {
            const hasStore = await page.evaluate(async () => {
                await Storage.init();
                const db = await new Promise((resolve, reject) => {
                    const req = indexedDB.open('whereish');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                const hasStore = db.objectStoreNames.contains('settings');
                db.close();
                return hasStore;
            });

            expect(hasStore).toBe(true);
        });

    });

    test.describe('Named Locations - CRUD', () => {

        test('saves named location with all fields', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                const location = {
                    userId: 'user123',
                    label: 'Home',
                    latitude: 47.6062,
                    longitude: -122.3321,
                    radiusMeters: 100,
                    visibility: { mode: 'private', contactIds: [] }
                };
                return await Storage.saveNamedLocation(location);
            });

            expect(saved.label).toBe('Home');
            expect(saved.latitude).toBe(47.6062);
            expect(saved.longitude).toBe(-122.3321);
            expect(saved.radiusMeters).toBe(100);
            expect(saved.userId).toBe('user123');
            expect(saved.visibility.mode).toBe('private');
        });

        test('generates ID when not provided', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                const location = {
                    userId: 'user123',
                    label: 'New Place',
                    latitude: 47.6062,
                    longitude: -122.3321
                };
                return await Storage.saveNamedLocation(location);
            });

            expect(saved.id).toBeDefined();
            expect(saved.id.length).toBeGreaterThan(0);
        });

        test('uses provided ID when given', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                const location = {
                    id: 'custom-id-123',
                    userId: 'user123',
                    label: 'Custom ID Place',
                    latitude: 47.6062,
                    longitude: -122.3321
                };
                return await Storage.saveNamedLocation(location);
            });

            expect(saved.id).toBe('custom-id-123');
        });

        test('requires userId', async ({ page }) => {
            const error = await page.evaluate(async () => {
                try {
                    await Storage.saveNamedLocation({
                        label: 'No User',
                        latitude: 47.6062,
                        longitude: -122.3321
                    });
                    return null;
                } catch (e) {
                    return e.message;
                }
            });

            expect(error).toContain('userId');
        });

        test('defaults radiusMeters to 100', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                const location = {
                    userId: 'user123',
                    label: 'Default Radius',
                    latitude: 47.6062,
                    longitude: -122.3321
                };
                return await Storage.saveNamedLocation(location);
            });

            expect(saved.radiusMeters).toBe(100);
        });

        test('gets all locations for a user', async ({ page }) => {
            const locations = await page.evaluate(async () => {
                // Save multiple locations
                await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Place A',
                    latitude: 47.6062,
                    longitude: -122.3321
                });
                await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Place B',
                    latitude: 47.6100,
                    longitude: -122.3400
                });
                // Different user
                await Storage.saveNamedLocation({
                    userId: 'otheruser',
                    label: 'Other Place',
                    latitude: 47.7000,
                    longitude: -122.4000
                });

                return await Storage.getAllNamedLocations('user123');
            });

            expect(locations.length).toBe(2);
            expect(locations.map(l => l.label)).toContain('Place A');
            expect(locations.map(l => l.label)).toContain('Place B');
            expect(locations.map(l => l.label)).not.toContain('Other Place');
        });

        test('returns empty array for user with no locations', async ({ page }) => {
            const locations = await page.evaluate(async () => {
                return await Storage.getAllNamedLocations('nonexistent-user');
            });

            expect(locations).toEqual([]);
        });

        test('returns empty array when userId is null', async ({ page }) => {
            const locations = await page.evaluate(async () => {
                return await Storage.getAllNamedLocations(null);
            });

            expect(locations).toEqual([]);
        });

        test('gets specific location by ID', async ({ page }) => {
            const location = await page.evaluate(async () => {
                const saved = await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Specific Place',
                    latitude: 47.6062,
                    longitude: -122.3321
                });
                return await Storage.getNamedLocation(saved.id);
            });

            expect(location.label).toBe('Specific Place');
        });

        test('returns null for non-existent location', async ({ page }) => {
            const location = await page.evaluate(async () => {
                return await Storage.getNamedLocation('non-existent-id');
            });

            expect(location).toBeNull();
        });

        test('deletes named location', async ({ page }) => {
            const result = await page.evaluate(async () => {
                const saved = await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'To Delete',
                    latitude: 47.6062,
                    longitude: -122.3321
                });

                await Storage.deleteNamedLocation(saved.id);

                return await Storage.getNamedLocation(saved.id);
            });

            expect(result).toBeNull();
        });

        test('updates existing location', async ({ page }) => {
            const updated = await page.evaluate(async () => {
                const saved = await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Original',
                    latitude: 47.6062,
                    longitude: -122.3321
                });

                // Update with same ID
                return await Storage.saveNamedLocation({
                    ...saved,
                    label: 'Updated'
                });
            });

            expect(updated.label).toBe('Updated');
        });

    });

    test.describe('Named Locations - Visibility', () => {

        test('defaults visibility to private', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                return await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Default Visibility',
                    latitude: 47.6062,
                    longitude: -122.3321
                });
            });

            expect(saved.visibility).toBeDefined();
            expect(saved.visibility.mode).toBe('private');
            expect(saved.visibility.contactIds).toEqual([]);
        });

        test('saves visibility mode all', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                return await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Public Place',
                    latitude: 47.6062,
                    longitude: -122.3321,
                    visibility: { mode: 'all', contactIds: [] }
                });
            });

            expect(saved.visibility.mode).toBe('all');
        });

        test('saves visibility with selected contacts', async ({ page }) => {
            const saved = await page.evaluate(async () => {
                return await Storage.saveNamedLocation({
                    userId: 'user123',
                    label: 'Selected Place',
                    latitude: 47.6062,
                    longitude: -122.3321,
                    visibility: { mode: 'selected', contactIds: ['contact1', 'contact2'] }
                });
            });

            expect(saved.visibility.mode).toBe('selected');
            expect(saved.visibility.contactIds).toEqual(['contact1', 'contact2']);
        });

        test('migrates old records without visibility', async ({ page }) => {
            // Simulate old record by manually inserting
            const location = await page.evaluate(async () => {
                await Storage.init();

                // Manually insert old-style record
                const db = await new Promise((resolve, reject) => {
                    const req = indexedDB.open('whereish');
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });

                await new Promise((resolve, reject) => {
                    const tx = db.transaction(['namedLocations'], 'readwrite');
                    const store = tx.objectStore('namedLocations');
                    const req = store.put({
                        id: 'old-record',
                        userId: 'user123',
                        label: 'Old Place',
                        latitude: 47.6062,
                        longitude: -122.3321,
                        radiusMeters: 100
                        // No visibility field!
                    });
                    req.onsuccess = () => resolve(undefined);
                    req.onerror = () => reject(req.error);
                });

                db.close();

                // Now retrieve through Storage (should migrate)
                return await Storage.getNamedLocation('old-record');
            });

            expect(location.visibility).toBeDefined();
            expect(location.visibility.mode).toBe('private');
            expect(location.visibility.contactIds).toEqual([]);
        });

    });

    test.describe('Settings', () => {

        test('saves and retrieves setting', async ({ page }) => {
            const value = await page.evaluate(async () => {
                await Storage.saveSetting('testKey', 'testValue');
                return await Storage.getSetting('testKey');
            });

            expect(value).toBe('testValue');
        });

        test('returns default for non-existent setting', async ({ page }) => {
            const value = await page.evaluate(async () => {
                return await Storage.getSetting('nonexistent', 'defaultVal');
            });

            expect(value).toBe('defaultVal');
        });

        test('returns null as default when not specified', async ({ page }) => {
            const value = await page.evaluate(async () => {
                return await Storage.getSetting('nonexistent');
            });

            expect(value).toBeNull();
        });

        test('updates existing setting', async ({ page }) => {
            const value = await page.evaluate(async () => {
                await Storage.saveSetting('updateKey', 'original');
                await Storage.saveSetting('updateKey', 'updated');
                return await Storage.getSetting('updateKey');
            });

            expect(value).toBe('updated');
        });

        test('stores complex objects', async ({ page }) => {
            const value = await page.evaluate(async () => {
                const obj = { nested: { value: 123 }, array: [1, 2, 3] };
                await Storage.saveSetting('complexKey', obj);
                return await Storage.getSetting('complexKey');
            });

            expect(value).toEqual({ nested: { value: 123 }, array: [1, 2, 3] });
        });

    });

});
