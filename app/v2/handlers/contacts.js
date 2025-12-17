/**
 * Contact Event Handlers
 *
 * Controller functions that handle user interactions with contacts.
 * These translate user actions into Model operations.
 */

/* global Model, API, Events */
/* exported handleContactClick, handleAcceptRequest, handleDeclineRequest, handleAddContact, handleRemoveContact, handlePermissionChange */

/**
 * Handle click on a contact item
 * @param {string} contactId - Contact ID
 */
function handleContactClick(contactId) {
    const contacts = Model.getContacts();
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
        Model.setSelectedContact(contact);
        // Navigation handled by main app controller
    }
}

/**
 * Handle accepting a contact request
 * @param {string} requestId - Request ID
 */
async function handleAcceptRequest(requestId) {
    try {
        await API.acceptContactRequest(requestId);
        // Refresh contacts list
        await API.getContactsEncrypted();
        await API.getContactRequests();
    } catch (e) {
        console.error('[Handlers] Failed to accept request:', e);
    }
}

/**
 * Handle declining a contact request
 * @param {string} requestId - Request ID
 */
async function handleDeclineRequest(requestId) {
    try {
        await API.declineContactRequest(requestId);
        await API.getContactRequests();
    } catch (e) {
        console.error('[Handlers] Failed to decline request:', e);
    }
}

/**
 * Handle adding a new contact by email
 * @param {string} email - Email address
 */
async function handleAddContact(email) {
    try {
        await API.sendContactRequest(email);
        await API.getContactRequests();
        return { success: true };
    } catch (e) {
        console.error('[Handlers] Failed to send request:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle removing a contact
 * @param {string} contactId - Contact ID
 */
async function handleRemoveContact(contactId) {
    try {
        await API.removeContact(contactId);
        await API.getContactsEncrypted();
        Model.setSelectedContact(null);
    } catch (e) {
        console.error('[Handlers] Failed to remove contact:', e);
    }
}

/**
 * Handle changing permission level for a contact
 * @param {string} contactId - Contact ID
 * @param {string} level - Permission level
 */
async function handlePermissionChange(contactId, level) {
    try {
        await API.updateContactPermission(contactId, level);
        await API.getContactsEncrypted();
    } catch (e) {
        console.error('[Handlers] Failed to update permission:', e);
    }
}
