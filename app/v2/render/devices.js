/**
 * Device Rendering Functions
 *
 * Pure functions that return HTML strings for device management UI.
 * Used by Bind for declarative rendering.
 */

/* global Model */
/* exported renderDevicesList, renderDeviceItem */

/**
 * Render the full devices list
 * @returns {string} HTML string
 */
function renderDevicesList() {
    const devices = Model.getDevices();

    if (!devices || devices.length === 0) {
        return '<p class="empty-state">No devices registered</p>';
    }

    return devices.map(renderDeviceItem).join('');
}

/**
 * Render a single device item
 * @param {Object} device - Device object
 * @returns {string} HTML string
 */
function renderDeviceItem(device) {
    const currentDeviceId = Model.getCurrentDeviceId();
    const isCurrent = device.id === currentDeviceId;
    const lastSeenText = device.lastSeen ? formatLastSeen(device.lastSeen) : 'Unknown';
    const platformIcon = getPlatformIcon(device.platform);

    return `
        <div class="device-item ${isCurrent ? 'current' : ''}" data-id="${escapeHtml(device.id)}">
            <div class="device-icon">${platformIcon}</div>
            <div class="device-info">
                <div class="device-name">
                    ${escapeHtml(device.name)}
                    ${isCurrent ? '<span class="device-badge">This device</span>' : ''}
                </div>
                <div class="device-last-seen">Last active: ${escapeHtml(lastSeenText)}</div>
            </div>
            ${!isCurrent ? '<button class="btn btn-sm btn-danger device-remove-btn">Remove</button>' : ''}
        </div>
    `;
}

/**
 * Get platform icon
 * @param {string} platform - Platform identifier
 * @returns {string} Emoji icon
 */
function getPlatformIcon(platform) {
    switch (platform) {
        case 'web':
            return '🌐';
        case 'ios':
            return '📱';
        case 'android':
            return '📱';
        case 'desktop':
            return '💻';
        default:
            return '📱';
    }
}

/**
 * Format last seen timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Human-readable string
 */
function formatLastSeen(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
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
