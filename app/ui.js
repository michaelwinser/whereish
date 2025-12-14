/**
 * UI Components - Toast notifications and Modal dialogs
 *
 * Provides:
 * - Toast.show() - for success/error/info messages
 * - ConfirmModal.show() - for confirmation dialogs
 * - InputModal.show() - for input dialogs
 */

(function() {
    'use strict';

    // ===================
    // Toast Notifications
    // ===================

    const Toast = {
        container: null,

        /**
         * Initialize toast container
         */
        init() {
            if (this.container) return;

            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            this.container.setAttribute('aria-live', 'polite');
            this.container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(this.container);
        },

        /**
         * Show a toast notification
         * @param {string} message - The message to display
         * @param {Object} options - Configuration options
         * @param {string} options.type - 'success', 'error', 'info', 'warning' (default: 'info')
         * @param {number} options.duration - Duration in ms (default: 4000, 0 = no auto-dismiss)
         */
        show(message, options = {}) {
            this.init();

            const type = options.type || 'info';
            const duration = options.duration !== undefined ? options.duration : 4000;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role', 'alert');

            const icon = this._getIcon(type);
            toast.innerHTML = `
                <span class="toast-icon">${icon}</span>
                <span class="toast-message">${this._escapeHtml(message)}</span>
                <button class="toast-close" aria-label="Dismiss">&times;</button>
            `;

            // Close button handler
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => this._dismiss(toast));

            this.container.appendChild(toast);

            // Trigger animation
            requestAnimationFrame(() => {
                toast.classList.add('toast-visible');
            });

            // Auto-dismiss
            if (duration > 0) {
                setTimeout(() => this._dismiss(toast), duration);
            }

            return toast;
        },

        /**
         * Show a success toast
         */
        success(message, options = {}) {
            return this.show(message, { ...options, type: 'success' });
        },

        /**
         * Show an error toast
         */
        error(message, options = {}) {
            return this.show(message, { ...options, type: 'error' });
        },

        /**
         * Show an info toast
         */
        info(message, options = {}) {
            return this.show(message, { ...options, type: 'info' });
        },

        /**
         * Show a warning toast
         */
        warning(message, options = {}) {
            return this.show(message, { ...options, type: 'warning' });
        },

        _dismiss(toast) {
            if (!toast || !toast.parentNode) return;

            toast.classList.remove('toast-visible');
            toast.classList.add('toast-hiding');

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        },

        _getIcon(type) {
            const icons = {
                success: '✓',
                error: '✕',
                warning: '⚠',
                info: 'ℹ'
            };
            return icons[type] || icons.info;
        },

        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    // ===================
    // Confirmation Modal
    // ===================

    const ConfirmModal = {
        modal: null,
        resolvePromise: null,

        /**
         * Initialize the confirm modal (creates DOM elements once)
         */
        init() {
            if (this.modal) return;

            this.modal = document.createElement('div');
            this.modal.id = 'confirm-modal';
            this.modal.className = 'modal hidden';
            this.modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content confirm-modal-content">
                    <div class="modal-header">
                        <h2 id="confirm-modal-title">Confirm</h2>
                    </div>
                    <div class="modal-body">
                        <p id="confirm-modal-message" class="confirm-modal-message"></p>
                    </div>
                    <div class="modal-actions confirm-modal-actions">
                        <button id="confirm-modal-cancel" class="btn">Cancel</button>
                        <button id="confirm-modal-confirm" class="btn btn-primary">Confirm</button>
                    </div>
                </div>
            `;

            document.body.appendChild(this.modal);

            // Event handlers
            this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this._resolve(false));
            this.modal.querySelector('#confirm-modal-cancel').addEventListener('click', () => this._resolve(false));
            this.modal.querySelector('#confirm-modal-confirm').addEventListener('click', () => this._resolve(true));

            // Keyboard handler
            this.modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this._resolve(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this._resolve(true);
                }
            });
        },

        /**
         * Show confirmation modal
         * @param {Object} options - Configuration
         * @param {string} options.title - Modal title (default: 'Confirm')
         * @param {string} options.message - The message to display
         * @param {string} options.confirmText - Confirm button text (default: 'Confirm')
         * @param {string} options.cancelText - Cancel button text (default: 'Cancel')
         * @param {boolean} options.danger - Use danger styling for confirm button
         * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
         */
        show(options = {}) {
            this.init();

            const title = options.title || 'Confirm';
            const message = options.message || 'Are you sure?';
            const confirmText = options.confirmText || 'Confirm';
            const cancelText = options.cancelText || 'Cancel';
            const danger = options.danger || false;

            // Set content
            this.modal.querySelector('#confirm-modal-title').textContent = title;
            this.modal.querySelector('#confirm-modal-message').textContent = message;
            this.modal.querySelector('#confirm-modal-cancel').textContent = cancelText;

            const confirmBtn = this.modal.querySelector('#confirm-modal-confirm');
            confirmBtn.textContent = confirmText;
            confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

            // Show modal
            this.modal.classList.remove('hidden');

            // Focus the cancel button (safer default)
            this.modal.querySelector('#confirm-modal-cancel').focus();

            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        },

        _resolve(value) {
            if (!this.resolvePromise) return;

            this.modal.classList.add('hidden');
            this.resolvePromise(value);
            this.resolvePromise = null;
        }
    };

    // ===================
    // Input Modal
    // ===================

    const InputModal = {
        modal: null,
        resolvePromise: null,

        /**
         * Initialize the input modal
         */
        init() {
            if (this.modal) return;

            this.modal = document.createElement('div');
            this.modal.id = 'input-modal';
            this.modal.className = 'modal hidden';
            this.modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content input-modal-content">
                    <div class="modal-header">
                        <h2 id="input-modal-title">Input</h2>
                    </div>
                    <div class="modal-body">
                        <p id="input-modal-message" class="input-modal-message"></p>
                        <div class="form-group">
                            <input type="text" id="input-modal-input" class="input-modal-input">
                        </div>
                    </div>
                    <div class="modal-actions input-modal-actions">
                        <button id="input-modal-cancel" class="btn">Cancel</button>
                        <button id="input-modal-confirm" class="btn btn-primary">OK</button>
                    </div>
                </div>
            `;

            document.body.appendChild(this.modal);

            // Event handlers
            this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this._resolve(null));
            this.modal.querySelector('#input-modal-cancel').addEventListener('click', () => this._resolve(null));
            this.modal.querySelector('#input-modal-confirm').addEventListener('click', () => this._submit());

            const input = this.modal.querySelector('#input-modal-input');
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._submit();
                }
            });

            // Keyboard handler for escape
            this.modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this._resolve(null);
                }
            });
        },

        /**
         * Show input modal
         * @param {Object} options - Configuration
         * @param {string} options.title - Modal title
         * @param {string} options.message - The message/prompt to display
         * @param {string} options.placeholder - Input placeholder
         * @param {string} options.defaultValue - Default input value
         * @param {string} options.confirmText - Confirm button text (default: 'OK')
         * @param {string} options.cancelText - Cancel button text (default: 'Cancel')
         * @returns {Promise<string|null>} - Resolves to input value or null if cancelled
         */
        show(options = {}) {
            this.init();

            const title = options.title || 'Input';
            const message = options.message || '';
            const placeholder = options.placeholder || '';
            const defaultValue = options.defaultValue || '';
            const confirmText = options.confirmText || 'OK';
            const cancelText = options.cancelText || 'Cancel';

            // Set content
            this.modal.querySelector('#input-modal-title').textContent = title;
            this.modal.querySelector('#input-modal-message').textContent = message;
            this.modal.querySelector('#input-modal-cancel').textContent = cancelText;
            this.modal.querySelector('#input-modal-confirm').textContent = confirmText;

            const input = this.modal.querySelector('#input-modal-input');
            input.placeholder = placeholder;
            input.value = defaultValue;

            // Show modal
            this.modal.classList.remove('hidden');

            // Focus and select input
            input.focus();
            input.select();

            return new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        },

        _submit() {
            const value = this.modal.querySelector('#input-modal-input').value;
            this._resolve(value);
        },

        _resolve(value) {
            if (!this.resolvePromise) return;

            this.modal.classList.add('hidden');
            this.resolvePromise(value);
            this.resolvePromise = null;
        }
    };

    // ===================
    // Exports
    // ===================

    window.Toast = Toast;
    window.ConfirmModal = ConfirmModal;
    window.InputModal = InputModal;

})();
