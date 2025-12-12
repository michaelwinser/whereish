/**
 * Whereish - Geofence Module
 * Distance calculations and geofence matching
 */

const Geofence = (function() {
    'use strict';

    // Earth's radius in meters
    const EARTH_RADIUS_M = 6371000;

    // ===================
    // Distance Calculation
    // ===================

    /**
     * Convert degrees to radians
     * @param {number} degrees
     * @returns {number}
     */
    function toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Calculate distance between two points using Haversine formula
     * @param {number} lat1 - Latitude of point 1
     * @param {number} lon1 - Longitude of point 1
     * @param {number} lat2 - Latitude of point 2
     * @param {number} lon2 - Longitude of point 2
     * @returns {number} Distance in meters
     */
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS_M * c;
    }

    // ===================
    // Geofence Matching
    // ===================

    /**
     * Check if a point is within a circular geofence
     * @param {number} lat - Current latitude
     * @param {number} lon - Current longitude
     * @param {Object} location - Named location { latitude, longitude, radiusMeters }
     * @returns {boolean}
     */
    function isWithinGeofence(lat, lon, location) {
        const distance = calculateDistance(
            lat, lon,
            location.latitude, location.longitude
        );
        return distance <= location.radiusMeters;
    }

    /**
     * Find all matching named locations for a position
     * @param {number} lat - Current latitude
     * @param {number} lon - Current longitude
     * @param {Array} namedLocations - Array of named location objects
     * @returns {Array} Matching locations, sorted by distance (closest first)
     */
    function findMatchingLocations(lat, lon, namedLocations) {
        const matches = [];

        for (const location of namedLocations) {
            const distance = calculateDistance(
                lat, lon,
                location.latitude, location.longitude
            );

            if (distance <= location.radiusMeters) {
                matches.push({
                    ...location,
                    distance
                });
            }
        }

        // Sort by distance (closest first)
        matches.sort((a, b) => a.distance - b.distance);

        return matches;
    }

    /**
     * Find the best matching named location
     * Returns the smallest geofence that contains the point
     * (most specific match)
     * @param {number} lat - Current latitude
     * @param {number} lon - Current longitude
     * @param {Array} namedLocations - Array of named location objects
     * @returns {Object|null} Best matching location or null
     */
    function findBestMatch(lat, lon, namedLocations) {
        const matches = findMatchingLocations(lat, lon, namedLocations);

        if (matches.length === 0) {
            return null;
        }

        // Return the match with smallest radius (most specific)
        // If same radius, prefer closest
        matches.sort((a, b) => {
            if (a.radiusMeters !== b.radiusMeters) {
                return a.radiusMeters - b.radiusMeters;
            }
            return a.distance - b.distance;
        });

        return matches[0];
    }

    // ===================
    // Formatting Helpers
    // ===================

    /**
     * Format distance for display
     * @param {number} meters
     * @returns {string}
     */
    function formatDistance(meters) {
        if (meters < 1000) {
            return Math.round(meters) + ' m';
        }
        return (meters / 1000).toFixed(1) + ' km';
    }

    /**
     * Format radius options for UI
     * @returns {Array} Array of { value, label } objects
     */
    function getRadiusOptions() {
        return [
            { value: 25, label: '25 m (small room)' },
            { value: 50, label: '50 m (building)' },
            { value: 100, label: '100 m (city block)' },
            { value: 250, label: '250 m (neighborhood)' },
            { value: 500, label: '500 m (large area)' },
            { value: 1000, label: '1 km (district)' }
        ];
    }

    // ===================
    // Public API
    // ===================

    return {
        calculateDistance,
        isWithinGeofence,
        findMatchingLocations,
        findBestMatch,
        formatDistance,
        getRadiusOptions
    };

})();
