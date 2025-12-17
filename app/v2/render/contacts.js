/**
 * Contact Rendering Functions
 *
 * Pure functions that return HTML strings for contact-related UI.
 * Used by Bind for declarative rendering.
 */

/* global Model */
/* exported renderContactsList, renderContactItem, renderContactDetail */

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
    const locationText = Model.getContactLocationText ? Model.getContactLocationText(contact) : 'Unknown';

    return `
        <div class="contact-item contact-item-simple" data-id="${escapeHtml(contact.id)}">
            <div class="contact-avatar">${escapeHtml(initial)}</div>
            <div class="contact-info">
                <div class="contact-name">${escapeHtml(contact.name)}</div>
                <div class="contact-location">${escapeHtml(locationText)}</div>
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

    return `
        <div class="contact-detail-header">
            <div class="contact-avatar-large">${escapeHtml(initial)}</div>
            <div class="contact-detail-info">
                <div class="contact-detail-name">${escapeHtml(contact.name)}</div>
                <div class="contact-detail-email">${escapeHtml(contact.email || '')}</div>
            </div>
        </div>
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
