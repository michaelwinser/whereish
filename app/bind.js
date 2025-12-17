/**
 * Reactive Binding System
 *
 * A minimal (~200 lines) reactive layer that automatically updates
 * DOM elements when Model state changes.
 *
 * Design goals:
 * - Declarative bindings: define what to render, not when
 * - Automatic updates: Model change → DOM update
 * - Debuggable: log all updates in debug mode
 * - Simple: one file, no dependencies, easy to understand
 *
 * Copied from poc/custom-binding/bind.js for production use.
 */

/* global queueMicrotask */
/* exported Bind */
const Bind = (function() {
  // Registry of all bindings
  const bindings = [];

  // Debug mode
  let debug = false;

  // Batch update state
  let updateScheduled = false;
  let pendingBindings = new Set();

  /**
   * Schedule a binding update (batched via microtask)
   */
  function scheduleUpdate(binding) {
    pendingBindings.add(binding);
    if (!updateScheduled) {
      updateScheduled = true;
      queueMicrotask(flushUpdates);
    }
  }

  /**
   * Flush all pending updates
   */
  function flushUpdates() {
    const toUpdate = Array.from(pendingBindings);
    pendingBindings.clear();
    updateScheduled = false;

    toUpdate.forEach(binding => {
      try {
        binding.update();
      } catch (e) {
        console.error('[Bind] Update error:', e, binding);
      }
    });
  }

  /**
   * Create a binding that updates on model events
   */
  function createBinding(type, selector, renderFn, events) {
    const element = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!element) {
      console.warn(`[Bind] Element not found: ${selector}`);
      return null;
    }

    const binding = {
      type,
      selector,
      element,
      renderFn,
      events,
      lastValue: undefined,

      update() {
        const newValue = renderFn();

        // Skip if value unchanged (for simple types)
        if (type !== 'html' && newValue === this.lastValue) {
          return;
        }

        this.lastValue = newValue;

        if (debug) {
          console.log(`[Bind] ${type}(${selector}):`, newValue);
        }

        switch (type) {
          case 'html':
            element.innerHTML = newValue;
            break;
          case 'text':
            element.textContent = newValue;
            break;
          case 'visible':
            element.classList.toggle('hidden', !newValue);
            break;
          case 'class':
            // renderFn returns { className, condition }
            element.classList.toggle(newValue.className, newValue.condition);
            break;
          case 'attr':
            // renderFn returns { attr, value }
            if (newValue.value === null || newValue.value === false) {
              element.removeAttribute(newValue.attr);
            } else {
              element.setAttribute(newValue.attr, newValue.value);
            }
            break;
        }
      }
    };

    bindings.push(binding);
    return binding;
  }

  /**
   * Connect bindings to a Model's events
   */
  function connectToModel(model) {
    // Subscribe to all relevant events
    const eventTypes = new Set();
    bindings.forEach(b => b.events.forEach(e => eventTypes.add(e)));

    eventTypes.forEach(eventType => {
      model.on(eventType, () => {
        // Find all bindings that care about this event
        bindings
          .filter(b => b.events.includes(eventType) || b.events.includes('*'))
          .forEach(b => scheduleUpdate(b));
      });
    });

    // Also subscribe to generic 'change' event
    model.on('change', () => {
      bindings
        .filter(b => b.events.includes('*'))
        .forEach(b => scheduleUpdate(b));
    });

    if (debug) {
      console.log(`[Bind] Connected to model, listening for:`, Array.from(eventTypes));
    }
  }

  // Public API
  return {
    /**
     * Bind innerHTML of element to a render function
     * @param {string} selector - CSS selector
     * @param {function} renderFn - Returns HTML string
     * @param {string[]} events - Model events to listen for
     */
    html(selector, renderFn, events = ['*']) {
      const binding = createBinding('html', selector, renderFn, events);
      if (binding) binding.update(); // Initial render
      return binding;
    },

    /**
     * Bind textContent of element to a render function
     * @param {string} selector - CSS selector
     * @param {function} renderFn - Returns string
     * @param {string[]} events - Model events to listen for
     */
    text(selector, renderFn, events = ['*']) {
      const binding = createBinding('text', selector, renderFn, events);
      if (binding) binding.update();
      return binding;
    },

    /**
     * Bind visibility of element (adds/removes 'hidden' class)
     * @param {string} selector - CSS selector
     * @param {function} renderFn - Returns boolean
     * @param {string[]} events - Model events to listen for
     */
    visible(selector, renderFn, events = ['*']) {
      const binding = createBinding('visible', selector, renderFn, events);
      if (binding) binding.update();
      return binding;
    },

    /**
     * Bind a CSS class on element
     * @param {string} selector - CSS selector
     * @param {string} className - Class to toggle
     * @param {function} conditionFn - Returns boolean
     * @param {string[]} events - Model events to listen for
     */
    class(selector, className, conditionFn, events = ['*']) {
      const binding = createBinding('class', selector, () => ({
        className,
        condition: conditionFn()
      }), events);
      if (binding) binding.update();
      return binding;
    },

    /**
     * Bind an attribute on element
     * @param {string} selector - CSS selector
     * @param {string} attr - Attribute name
     * @param {function} valueFn - Returns attribute value (null to remove)
     * @param {string[]} events - Model events to listen for
     */
    attr(selector, attr, valueFn, events = ['*']) {
      const binding = createBinding('attr', selector, () => ({
        attr,
        value: valueFn()
      }), events);
      if (binding) binding.update();
      return binding;
    },

    /**
     * Connect all bindings to a Model
     */
    connect(model) {
      connectToModel(model);
    },

    /**
     * Force update all bindings
     */
    updateAll() {
      bindings.forEach(b => b.update());
    },

    /**
     * Enable/disable debug logging
     */
    setDebug(enabled) {
      debug = enabled;
      console.log(`[Bind] Debug mode: ${enabled}`);
    },

    /**
     * Get binding count (for testing)
     */
    getBindingCount() {
      return bindings.length;
    },

    /**
     * Clear all bindings (for testing)
     */
    clear() {
      bindings.length = 0;
      pendingBindings.clear();
    }
  };
})();
