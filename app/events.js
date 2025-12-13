/**
 * Simple Event Emitter for Model-View communication
 * Works in both browser and Node.js (no DOM dependencies)
 */
const Events = (function() {
    'use strict';

    const listeners = {};

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    function on(event, callback) {
        if (!listeners[event]) {
            listeners[event] = [];
        }
        listeners[event].push(callback);

        // Return unsubscribe function
        return function() {
            off(event, callback);
        };
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler to remove
     */
    function off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(function(cb) {
            return cb !== callback;
        });
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Data to pass to handlers
     */
    function emit(event, data) {
        if (!listeners[event]) return;
        listeners[event].forEach(function(callback) {
            try {
                callback(data);
            } catch (error) {
                console.error('Event handler error for ' + event + ':', error);
            }
        });
    }

    /**
     * Subscribe to an event once (auto-unsubscribes after first call)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    function once(event, callback) {
        var wrapper = function(data) {
            off(event, wrapper);
            callback(data);
        };
        on(event, wrapper);
    }

    /**
     * Remove all listeners for an event (or all events if no event specified)
     * @param {string} [event] - Event name (optional)
     */
    function clear(event) {
        if (event) {
            delete listeners[event];
        } else {
            Object.keys(listeners).forEach(function(key) {
                delete listeners[key];
            });
        }
    }

    return {
        on: on,
        off: off,
        emit: emit,
        once: once,
        clear: clear
    };
})();
