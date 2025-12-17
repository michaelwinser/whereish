/**
 * Authentication Rendering Functions
 *
 * Pure functions that return HTML strings for auth-related UI.
 * Used by Bind for declarative rendering.
 */

/* global Model */
/* exported renderWelcomeScreen, renderAuthModal */

/**
 * Render welcome screen content
 * @returns {string} HTML string
 */
function renderWelcomeScreen() {
    const locationText = Model.getLocation()?.hierarchy?.city || 'Locating...';

    return `
        <div class="welcome-content">
            <h1>Whereish</h1>
            <p class="welcome-tagline">Privacy-first location sharing</p>
            <div class="welcome-location">
                <p class="welcome-label">You are at:</p>
                <p class="welcome-hierarchy">${escapeHtml(locationText)}</p>
            </div>
        </div>
    `;
}

/**
 * Render authentication modal content
 * @param {boolean} isLogin - True for login mode, false for signup
 * @returns {string} HTML string
 */
function renderAuthModal(isLogin) {
    const title = isLogin ? 'Log In' : 'Sign Up';
    const submitText = isLogin ? 'Log In' : 'Sign Up';
    const switchText = isLogin
        ? 'Don\'t have an account? <a href="#" class="auth-switch">Sign up</a>'
        : 'Already have an account? <a href="#" class="auth-switch">Log in</a>';

    return `
        <div class="auth-modal-content">
            <h2>${title}</h2>
            <form id="auth-form" class="auth-form">
                <div class="form-group">
                    <label for="auth-email">Email</label>
                    <input type="email" id="auth-email" name="email" required autocomplete="email">
                </div>
                <div class="form-group">
                    <label for="auth-password">Password</label>
                    <input type="password" id="auth-password" name="password" required minlength="6">
                </div>
                <div id="auth-error" class="form-error hidden"></div>
                <button type="submit" class="btn btn-primary">${submitText}</button>
            </form>
            <p class="auth-switch-text">${switchText}</p>
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
