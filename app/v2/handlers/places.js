/**
 * Places Event Handlers
 *
 * Controller functions that handle user interactions with named locations.
 * These translate user actions into Model operations.
 */

/* global Model, Storage */
/* exported handleSavePlace, handleEditPlace, handleDeletePlace, handlePlaceClick */

/**
 * Handle saving a new named location
 * @param {Object} placeData - Place data
 * @param {string} placeData.label - Place name
 * @param {number} placeData.latitude - Latitude
 * @param {number} placeData.longitude - Longitude
 * @param {number} placeData.radiusMeters - Radius in meters
 * @param {Object} placeData.visibility - Visibility settings
 */
async function handleSavePlace(placeData) {
    try {
        const place = {
            id: crypto.randomUUID(),
            userId: Model.getCurrentUserId(),
            label: placeData.label,
            latitude: placeData.latitude,
            longitude: placeData.longitude,
            radiusMeters: placeData.radiusMeters,
            visibility: placeData.visibility || { mode: 'private', contactIds: [] },
            createdAt: new Date().toISOString()
        };

        await Storage.saveNamedLocation(place);
        // Refresh places list from storage
        const places = await Storage.getNamedLocations(place.userId);
        Model.setPlaces(places);

        return { success: true, place };
    } catch (e) {
        console.error('[Handlers] Failed to save place:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle editing an existing place
 * @param {string} placeId - Place ID
 * @param {Object} updates - Fields to update
 */
async function handleEditPlace(placeId, updates) {
    try {
        const places = Model.getPlaces();
        const place = places.find(p => p.id === placeId);
        if (!place) {
            throw new Error('Place not found');
        }

        const updatedPlace = { ...place, ...updates };
        await Storage.saveNamedLocation(updatedPlace);

        // Refresh places list
        const refreshedPlaces = await Storage.getNamedLocations(Model.getCurrentUserId());
        Model.setPlaces(refreshedPlaces);

        return { success: true };
    } catch (e) {
        console.error('[Handlers] Failed to edit place:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle deleting a place
 * @param {string} placeId - Place ID
 */
async function handleDeletePlace(placeId) {
    try {
        await Storage.deleteNamedLocation(placeId);

        // Refresh places list
        const places = await Storage.getNamedLocations(Model.getCurrentUserId());
        Model.setPlaces(places);

        return { success: true };
    } catch (e) {
        console.error('[Handlers] Failed to delete place:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle click on a place item
 * @param {string} placeId - Place ID
 */
function handlePlaceClick(placeId) {
    const places = Model.getPlaces();
    const place = places.find(p => p.id === placeId);
    if (place) {
        // Open edit modal or navigate to detail
        console.log('[Handlers] Place clicked:', place.label);
    }
}
