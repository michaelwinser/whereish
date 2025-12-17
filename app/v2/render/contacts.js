/**
 * Contact Rendering Functions
 *
 * Pure functions that return HTML strings for contact-related UI.
 * Used by Bind for declarative rendering.
 */

/* global Model, Geofence */
/* exported renderContactsList, renderContactItem, renderContactDetail, renderIncomingRequests, renderOutgoingRequests */

/**
 * Render the full contacts list
 * @returns {string} HTML string
 */
function renderContactsList() {
    const contacts = Model.getContacts();

    if (!contacts || contacts.length === 0) {
        return '<p class="empty-state">No contacts yet</p>';
    }

    return contacts.map(renderContactItem).join('');
}

/**
 * Render a single contact item for the list
 * @param {Object} contact - Contact object
 * @returns {string} HTML string
 */
function renderContactItem(contact) {
    const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?';
    const locationText = Model.getContactLocationText(contact);
    let locationClass = '';
    let timeText = '';
    let distanceText = '';

    if (contact.location) {
        locationClass = contact.location.stale ? 'stale' : '';

        if (contact.location.updated_at) {
            timeText = Model.formatTimeAgo(contact.location.updated_at);
        }

        // Calculate distance if we have coordinates
        const myLoc = Model.getLocation();
        if (myLoc && contact.latitude && contact.longitude) {
            const distance = Geofence.calculateDistance(
                myLoc.latitude,
                myLoc.longitude,
                contact.latitude,
                contact.longitude
            );
            distanceText = Geofence.formatDistance(distance);
        }
    }

    return `
        <div class="contact-item contact-item-simple" data-id="${escapeHtml(contact.id)}">
            <div class="contact-avatar">${escapeHtml(initial)}</div>
            <div class="contact-info">
                <div class="contact-name">${escapeHtml(contact.name)}</div>
                ${contact.email ? `<div class="contact-email">${escapeHtml(contact.email)}</div>` : ''}
                <div class="contact-location ${locationClass}">${escapeHtml(locationText)}</div>
            </div>
            <div class="contact-meta">
                ${distanceText ? `<div class="contact-distance-simple">${distanceText}</div>` : ''}
                ${timeText ? `<div class="contact-time">${timeText}</div>` : ''}
            </div>
            <div class="contact-chevron">&rsaquo;</div>
        </div>
    `;
}

/**
 * Render contact detail view content
 * @param {Object} contact - Contact object
 * @returns {string} HTML string
 */
function renderContactDetail(contact) {
    if (!contact) {
        return '<p class="empty-state">No contact selected</p>';
    }

    const initial = contact.name ? contact.name.charAt(0).toUpperCase() : '?';
    const locationText = Model.getContactLocationText(contact);

    return `
        <div class="contact-detail-header">
            <div class="contact-avatar-large">${escapeHtml(initial)}</div>
            <div class="contact-detail-info">
                <div class="contact-detail-name">${escapeHtml(contact.name)}</div>
                <div class="contact-detail-email">${escapeHtml(contact.email || '')}</div>
            </div>
        </div>
        <div class="contact-detail-location">${escapeHtml(locationText)}</div>
    `;
}

/**
 * Render incoming contact requests
 * @returns {string} HTML string
 */
function renderIncomingRequests() {
    const requests = Model.getContactRequests();
    const incoming = requests?.incoming || [];

    if (incoming.length === 0) {
        return '';
    }

    return `
        <div class="requests-section-header">Incoming Requests</div>
        ${incoming.map(req => `
            <div class="request-item" data-request-id="${escapeHtml(req.requestId)}">
                <div class="request-info">
                    <div class="request-avatar">${escapeHtml((req.name || req.email || '?')[0].toUpperCase())}</div>
                    <div>
                        <div class="request-name">${escapeHtml(req.name || req.email)}</div>
                        ${req.name ? `<div class="request-email">${escapeHtml(req.email)}</div>` : ''}
                        ${req.createdAt ? `<div class="request-time">${Model.formatTimeAgo(req.createdAt)}</div>` : ''}
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-small btn-primary accept-request-btn" data-id="${escapeHtml(req.requestId)}">Accept</button>
                    <button class="btn btn-small decline-request-btn" data-id="${escapeHtml(req.requestId)}">Decline</button>
                </div>
            </div>
        `).join('')}
    `;
}

/**
 * Render outgoing contact requests
 * @returns {string} HTML string
 */
function renderOutgoingRequests() {
    const requests = Model.getContactRequests();
    const outgoing = requests?.outgoing || [];

    if (outgoing.length === 0) {
        return '';
    }

    return `
        <div class="requests-section-header">Sent Requests</div>
        ${outgoing.map(req => `
            <div class="request-item request-item-outgoing" data-request-id="${escapeHtml(req.requestId)}">
                <div class="request-info">
                    <span class="request-icon">📤</span>
                    <div>
                        <div class="request-email">${escapeHtml(req.email)}</div>
                        ${req.createdAt ? `<div class="request-time">${Model.formatTimeAgo(req.createdAt)}</div>` : ''}
                    </div>
                </div>
                <button class="btn btn-small btn-secondary cancel-request-btn" data-id="${escapeHtml(req.requestId)}">Cancel</button>
            </div>
        `).join('')}
    `;
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
