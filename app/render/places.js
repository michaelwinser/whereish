/**
 * Places Rendering Functions
 *
 * Pure functions that return HTML strings for named locations UI.
 * Used by Bind for declarative rendering.
 */

/* global Model */
/* exported renderPlacesList, renderPlaceItem */

/**
 * Render the full places list
 * @returns {string} HTML string
 */
function renderPlacesList() {
    const places = Model.getPlaces();

    if (!places || places.length === 0) {
        return '<p class="empty-state">No named locations yet</p>';
    }

    const currentMatch = Model.getCurrentMatch ? Model.getCurrentMatch() : null;

    return places.map(place => renderPlaceItem(place, currentMatch)).join('');
}

/**
 * Render a single place item
 * @param {Object} place - Named location object
 * @param {Object|null} currentMatch - Current place match
 * @returns {string} HTML string
 */
function renderPlaceItem(place, currentMatch) {
    const isActive = currentMatch && currentMatch.id === place.id;
    const visibilityText = getVisibilityText(place.visibility);

    return `
        <div class="named-location-item ${isActive ? 'active' : ''}" data-id="${escapeHtml(place.id)}">
            <div class="named-location-name">${escapeHtml(place.label)}</div>
            <div class="named-location-radius">${place.radiusMeters}m radius</div>
            <div class="named-location-visibility">${escapeHtml(visibilityText)}</div>
            ${isActive ? '<div class="named-location-badge">You are here</div>' : ''}
        </div>
    `;
}

/**
 * Get human-readable visibility text
 * @param {Object} visibility - Visibility config
 * @returns {string} Description
 */
function getVisibilityText(visibility) {
    if (!visibility) return 'Private';

    switch (visibility.mode) {
        case 'all':
            return 'Visible to all contacts';
        case 'selected':
            return `Visible to ${visibility.contactIds?.length || 0} contacts`;
        case 'private':
        default:
            return 'Private';
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
