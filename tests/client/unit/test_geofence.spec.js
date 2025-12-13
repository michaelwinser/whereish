// @ts-check
const { test, expect, TEST_LOCATIONS, NAMED_LOCATIONS, setupMinimalMocks } = require('../fixtures/test-helpers');

/**
 * Geofence Module Tests
 *
 * Tests for distance calculation and geofence matching.
 * These are pure function tests - no browser APIs needed beyond loading the module.
 */

test.describe('Geofence Module', () => {

    // Set up mocks before each test
    test.beforeEach(async ({ page }) => {
        await setupMinimalMocks(page);
    });

    test.describe('Distance Calculation', () => {

        test('calculates distance between two points using Haversine formula', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const distance = await page.evaluate(() => {
                // Seattle to NYC - known distance ~3866 km
                return Geofence.calculateDistance(47.6062, -122.3321, 40.7128, -74.0060);
            });

            // Should be approximately 3866 km (allow 1% error)
            expect(distance).toBeGreaterThan(3800000);
            expect(distance).toBeLessThan(3900000);
        });

        test('returns zero distance for same point', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const distance = await page.evaluate(() => {
                return Geofence.calculateDistance(47.6062, -122.3321, 47.6062, -122.3321);
            });

            expect(distance).toBe(0);
        });

        test('calculates known distance accurately (Seattle to Portland ~234km)', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const distance = await page.evaluate(() => {
                // Seattle to Portland
                return Geofence.calculateDistance(47.6062, -122.3321, 45.5152, -122.6784);
            });

            // Should be approximately 234 km (actual distance)
            expect(distance).toBeGreaterThan(230000);
            expect(distance).toBeLessThan(240000);
        });

        test('handles international distances (Seattle to London)', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const distance = await page.evaluate(() => {
                // Seattle to London - known distance ~7730 km
                return Geofence.calculateDistance(47.6062, -122.3321, 51.5074, -0.1278);
            });

            // Should be approximately 7730 km
            expect(distance).toBeGreaterThan(7600000);
            expect(distance).toBeLessThan(7900000);
        });

        test('handles negative coordinates correctly', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const distance = await page.evaluate(() => {
                // NYC to Buenos Aires (southern hemisphere)
                return Geofence.calculateDistance(40.7128, -74.0060, -34.6037, -58.3816);
            });

            // Should be approximately 8500 km
            expect(distance).toBeGreaterThan(8400000);
            expect(distance).toBeLessThan(8700000);
        });

    });

    test.describe('Geofence Matching', () => {

        test('point inside geofence returns true', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const result = await page.evaluate(() => {
                const location = {
                    latitude: 47.6062,
                    longitude: -122.3321,
                    radiusMeters: 100
                };
                // Same point
                return Geofence.isWithinGeofence(47.6062, -122.3321, location);
            });

            expect(result).toBe(true);
        });

        test('point outside geofence returns false', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const result = await page.evaluate(() => {
                const location = {
                    latitude: 47.6062,
                    longitude: -122.3321,
                    radiusMeters: 100
                };
                // Point 10km away
                return Geofence.isWithinGeofence(47.7, -122.3321, location);
            });

            expect(result).toBe(false);
        });

        test('point well inside boundary returns true', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const result = await page.evaluate(() => {
                const location = {
                    latitude: 47.6062,
                    longitude: -122.3321,
                    radiusMeters: 1000
                };
                // Point 500m away should be inside 1000m radius
                const pointLat = 47.6062 + 0.0045; // ~500m
                return Geofence.isWithinGeofence(pointLat, -122.3321, location);
            });

            expect(result).toBe(true);
        });

        test('point just outside boundary is outside', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const result = await page.evaluate(() => {
                const location = {
                    latitude: 47.6062,
                    longitude: -122.3321,
                    radiusMeters: 1000
                };
                // Point just over 1km away
                const pointLat = 47.6062 + 0.0095;
                return Geofence.isWithinGeofence(pointLat, -122.3321, location);
            });

            expect(result).toBe(false);
        });

    });

    test.describe('Find Matching Locations', () => {

        test('finds all matching locations', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const matches = await page.evaluate(() => {
                const locations = [
                    { id: '1', label: 'Location A', latitude: 47.6062, longitude: -122.3321, radiusMeters: 100 },
                    { id: '2', label: 'Location B', latitude: 47.6062, longitude: -122.3321, radiusMeters: 500 },
                    { id: '3', label: 'Location C', latitude: 47.7, longitude: -122.3321, radiusMeters: 100 }
                ];
                // Point at Location A and B, but not C
                return Geofence.findMatchingLocations(47.6062, -122.3321, locations);
            });

            expect(matches.length).toBe(2);
            expect(matches.map(m => m.id)).toContain('1');
            expect(matches.map(m => m.id)).toContain('2');
        });

        test('returns empty array when no matches', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const matches = await page.evaluate(() => {
                const locations = [
                    { id: '1', label: 'Location A', latitude: 47.6062, longitude: -122.3321, radiusMeters: 100 }
                ];
                // Point far away
                return Geofence.findMatchingLocations(40.7128, -74.0060, locations);
            });

            expect(matches.length).toBe(0);
        });

        test('returns empty array for empty locations list', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const matches = await page.evaluate(() => {
                return Geofence.findMatchingLocations(47.6062, -122.3321, []);
            });

            expect(matches.length).toBe(0);
        });

        test('includes distance in results', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const matches = await page.evaluate(() => {
                const locations = [
                    { id: '1', label: 'Location A', latitude: 47.6062, longitude: -122.3321, radiusMeters: 100 }
                ];
                return Geofence.findMatchingLocations(47.6062, -122.3321, locations);
            });

            expect(matches[0]).toHaveProperty('distance');
            expect(matches[0].distance).toBe(0);
        });

        test('sorts results by distance (closest first)', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const matches = await page.evaluate(() => {
                const locations = [
                    { id: 'far', label: 'Far', latitude: 47.607, longitude: -122.3321, radiusMeters: 500 },
                    { id: 'close', label: 'Close', latitude: 47.6063, longitude: -122.3321, radiusMeters: 500 }
                ];
                return Geofence.findMatchingLocations(47.6062, -122.3321, locations);
            });

            expect(matches[0].id).toBe('close');
            expect(matches[1].id).toBe('far');
        });

    });

    test.describe('Find Best Match', () => {

        test('returns smallest geofence when multiple match', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const best = await page.evaluate(() => {
                const locations = [
                    { id: 'large', label: 'Large Area', latitude: 47.6062, longitude: -122.3321, radiusMeters: 1000 },
                    { id: 'small', label: 'Small Area', latitude: 47.6062, longitude: -122.3321, radiusMeters: 50 },
                    { id: 'medium', label: 'Medium Area', latitude: 47.6062, longitude: -122.3321, radiusMeters: 200 }
                ];
                return Geofence.findBestMatch(47.6062, -122.3321, locations);
            });

            expect(best.id).toBe('small');
        });

        test('returns null when no matches', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const best = await page.evaluate(() => {
                const locations = [
                    { id: '1', label: 'Location A', latitude: 47.6062, longitude: -122.3321, radiusMeters: 100 }
                ];
                return Geofence.findBestMatch(40.7128, -74.0060, locations);
            });

            expect(best).toBeNull();
        });

        test('returns null for empty locations', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const best = await page.evaluate(() => {
                return Geofence.findBestMatch(47.6062, -122.3321, []);
            });

            expect(best).toBeNull();
        });

        test('prefers closest when same radius', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const best = await page.evaluate(() => {
                const locations = [
                    { id: 'far', label: 'Far', latitude: 47.607, longitude: -122.3321, radiusMeters: 200 },
                    { id: 'close', label: 'Close', latitude: 47.6063, longitude: -122.3321, radiusMeters: 200 }
                ];
                return Geofence.findBestMatch(47.6062, -122.3321, locations);
            });

            expect(best.id).toBe('close');
        });

    });

    test.describe('Formatting Helpers', () => {

        test('formats distance in meters', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const formatted = await page.evaluate(() => {
                return Geofence.formatDistance(500);
            });

            expect(formatted).toBe('500 m');
        });

        test('formats distance in kilometers', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const formatted = await page.evaluate(() => {
                return Geofence.formatDistance(2500);
            });

            expect(formatted).toBe('2.5 km');
        });

        test('rounds meters to whole number', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const formatted = await page.evaluate(() => {
                return Geofence.formatDistance(123.7);
            });

            expect(formatted).toBe('124 m');
        });

        test('returns radius options array', async ({ page }) => {
            await page.goto('/');
            await page.waitForFunction(() => typeof Geofence !== 'undefined');

            const options = await page.evaluate(() => {
                return Geofence.getRadiusOptions();
            });

            expect(Array.isArray(options)).toBe(true);
            expect(options.length).toBeGreaterThan(0);
            expect(options[0]).toHaveProperty('value');
            expect(options[0]).toHaveProperty('label');
        });

    });

});
