/**
 * Device Management Event Handlers
 *
 * Controller functions that handle device-related user interactions.
 */

/* global API, Model */
/* exported handleDeviceRename, handleDeviceRemove, handleDeviceTransfer */

/**
 * Handle renaming a device
 * @param {string} deviceId - Device ID
 * @param {string} newName - New device name
 */
async function handleDeviceRename(deviceId, newName) {
    try {
        await API.renameDevice(deviceId, newName);
        await API.getDevices();
        return { success: true };
    } catch (e) {
        console.error('[Handlers] Device rename failed:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle removing a device
 * @param {string} deviceId - Device ID
 */
async function handleDeviceRemove(deviceId) {
    try {
        await API.removeDevice(deviceId);
        await API.getDevices();
        return { success: true };
    } catch (e) {
        console.error('[Handlers] Device remove failed:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle initiating device transfer
 * @returns {Object} Transfer code data
 */
async function handleDeviceTransfer() {
    try {
        const result = await API.initiateDeviceTransfer();
        return { success: true, code: result.code, expiresAt: result.expiresAt };
    } catch (e) {
        console.error('[Handlers] Device transfer initiation failed:', e);
        return { success: false, error: e.message };
    }
}
