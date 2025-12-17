/**
 * Authentication Event Handlers
 *
 * Controller functions that handle authentication-related user interactions.
 */

/* global API, Identity, Model */
/* exported handleLogin, handleLogout, handleGoogleSignIn */

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        await API.logout();
        // Clear identity
        Identity.clear();
        // Clear auth state in Model
        Model.setCurrentUserId(null);
        return { success: true };
    } catch (e) {
        console.error('[Handlers] Logout failed:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle Google Sign-In callback
 * @param {Object} response - Google OAuth response
 */
async function handleGoogleSignIn(response) {
    try {
        // Exchange Google token for our auth token
        const result = await API.googleSignIn(response.credential);

        if (result.user) {
            Model.setCurrentUserId(result.user.id);
            // Set up identity if needed
            if (!result.hasPublicKey) {
                await Identity.generate();
            }
            return { success: true, user: result.user };
        }
        return { success: false, error: 'No user in response' };
    } catch (e) {
        console.error('[Handlers] Google sign-in failed:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Handle email/password login (legacy)
 * @param {string} email - Email address
 * @param {string} password - Password
 */
async function handleLogin(email, password) {
    try {
        const result = await API.login(email, password);

        if (result.user) {
            Model.setCurrentUserId(result.user.id);
            return { success: true, user: result.user };
        }
        return { success: false, error: 'Invalid credentials' };
    } catch (e) {
        console.error('[Handlers] Login failed:', e);
        return { success: false, error: e.message };
    }
}
