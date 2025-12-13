/**
 * Whereish In-Client Testing Module
 *
 * Provides a lightweight testing framework for development mode.
 * Run tests directly in the browser without Playwright overhead.
 *
 * Usage:
 *   Open browser console and run: Testing.runAll()
 *   Or run specific suite: Testing.runSuite('Model Pure Functions')
 *
 * Note: This file should only be loaded in development mode.
 */

/* global requestAnimationFrame, Model, Events, ViewManager */

const Testing = (function() {
    'use strict';

    const results = [];
    const suites = [];

    // =====================
    // Test Runner
    // =====================

    /**
     * Define a test case
     * @param {string} name - Test name
     * @param {Function} fn - Test function (can be async)
     */
    async function test(name, fn) {
        try {
            await fn();
            results.push({ name, passed: true });
            console.log(`  ✓ ${name}`);
        } catch (error) {
            results.push({ name, passed: false, error: error.message });
            console.error(`  ✗ ${name}: ${error.message}`);
        }
    }

    /**
     * Define a test suite
     * @param {string} name - Suite name
     * @param {Function} fn - Suite function containing tests
     */
    function describe(name, fn) {
        suites.push({ name, fn });
    }

    /**
     * Run all registered test suites
     * @returns {Promise<Array>} Test results
     */
    async function runAll() {
        results.length = 0;
        console.log('%c=== Whereish In-Client Tests ===', 'font-weight: bold; font-size: 14px;');
        console.log('');

        for (const suite of suites) {
            console.group(suite.name);
            await suite.fn();
            console.groupEnd();
        }

        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;

        console.log('');
        if (failed === 0) {
            console.log(`%c✓ ${passed}/${results.length} tests passed`, 'color: green; font-weight: bold;');
        } else {
            console.log(`%c✗ ${passed}/${results.length} tests passed (${failed} failed)`, 'color: red; font-weight: bold;');
        }

        return results;
    }

    /**
     * Run a specific test suite by name
     * @param {string} name - Suite name to run
     * @returns {Promise<Array>} Test results
     */
    async function runSuite(name) {
        results.length = 0;
        const suite = suites.find(s => s.name === name);
        if (!suite) {
            console.error(`Suite not found: ${name}`);
            console.log('Available suites:', suites.map(s => s.name));
            return [];
        }

        console.group(suite.name);
        await suite.fn();
        console.groupEnd();

        const passed = results.filter(r => r.passed).length;
        console.log(`\n${passed}/${results.length} tests passed`);
        return results;
    }

    // =====================
    // Assertions
    // =====================

    /**
     * Create an expectation object for assertions
     * @param {*} actual - The actual value to test
     * @returns {Object} Assertion methods
     */
    function expect(actual) {
        return {
            toBe(expected) {
                if (actual !== expected) {
                    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            },
            toEqual(expected) {
                if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
                }
            },
            toBeTruthy() {
                if (!actual) {
                    throw new Error(`Expected truthy, got ${actual}`);
                }
            },
            toBeFalsy() {
                if (actual) {
                    throw new Error(`Expected falsy, got ${actual}`);
                }
            },
            toContain(item) {
                if (Array.isArray(actual)) {
                    if (!actual.includes(item)) {
                        throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
                    }
                } else if (typeof actual === 'string') {
                    if (!actual.includes(item)) {
                        throw new Error(`Expected string to contain "${item}"`);
                    }
                } else {
                    throw new Error('toContain only works with arrays and strings');
                }
            },
            toBeGreaterThan(expected) {
                if (actual <= expected) {
                    throw new Error(`Expected ${actual} to be greater than ${expected}`);
                }
            },
            toBeLessThan(expected) {
                if (actual >= expected) {
                    throw new Error(`Expected ${actual} to be less than ${expected}`);
                }
            },
            toBeNull() {
                if (actual !== null) {
                    throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
                }
            },
            toBeUndefined() {
                if (actual !== undefined) {
                    throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
                }
            },
            toBeDefined() {
                if (actual === undefined) {
                    throw new Error('Expected value to be defined');
                }
            },
            toHaveProperty(key, value) {
                if (!(key in actual)) {
                    throw new Error(`Expected object to have property "${key}"`);
                }
                if (value !== undefined && actual[key] !== value) {
                    throw new Error(`Expected property "${key}" to be ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
                }
            },
            toThrow() {
                if (typeof actual !== 'function') {
                    throw new Error('toThrow expects a function');
                }
                let threw = false;
                try {
                    actual();
                } catch {
                    threw = true;
                }
                if (!threw) {
                    throw new Error('Expected function to throw');
                }
            }
        };
    }

    // =====================
    // DOM Helpers
    // =====================

    /**
     * Click an element
     * @param {string} selector - CSS selector
     */
    function click(selector) {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        el.click();
    }

    /**
     * Type text into an input element
     * @param {string} selector - CSS selector
     * @param {string} text - Text to type
     */
    function type(selector, text) {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /**
     * Check if an element is visible
     * @param {string} selector - CSS selector
     * @returns {boolean}
     */
    function visible(selector) {
        const el = document.querySelector(selector);
        if (!el) return false;
        return !el.classList.contains('hidden') && el.offsetParent !== null;
    }

    /**
     * Get text content of an element
     * @param {string} selector - CSS selector
     * @returns {string}
     */
    function getText(selector) {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Element not found: ${selector}`);
        return el.textContent.trim();
    }

    /**
     * Wait for an element to appear
     * @param {string} selector - CSS selector
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<Element>}
     */
    function waitFor(selector, timeout = 1000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const el = document.querySelector(selector);
                if (el) {
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    reject(new Error(`Timeout waiting for ${selector}`));
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    }

    /**
     * Wait for a condition to be true
     * @param {Function} condition - Function returning boolean
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<void>}
     */
    function waitUntil(condition, timeout = 1000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (condition()) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject(new Error('Timeout waiting for condition'));
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        });
    }

    /**
     * Wait for a specified duration
     * @param {number} ms - Duration in milliseconds
     * @returns {Promise<void>}
     */
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // =====================
    // Public API
    // =====================

    return {
        // Test runner
        test,
        describe,
        runAll,
        runSuite,

        // Assertions
        expect,

        // DOM helpers
        click,
        type,
        visible,
        getText,
        waitFor,
        waitUntil,
        wait,

        // Results access
        getResults: () => [...results],
        getSuites: () => suites.map(s => s.name)
    };
})();

// =====================
// Built-in Test Suites
// =====================

// Model Pure Functions
Testing.describe('Model Pure Functions', async () => {
    await Testing.test('buildHierarchy creates continent from country', () => {
        const hierarchy = Model.buildHierarchy({ country: 'United States', city: 'Seattle' });
        Testing.expect(hierarchy.continent).toBe('North America');
        Testing.expect(hierarchy.city).toBe('Seattle');
    });

    await Testing.test('buildHierarchy handles missing fields gracefully', () => {
        const hierarchy = Model.buildHierarchy({});
        Testing.expect(hierarchy).toEqual({});
    });

    await Testing.test('findMostSpecificLevel returns most specific available level', () => {
        const hierarchy = { continent: 'NA', country: 'US', state: 'WA', city: 'Seattle' };
        const level = Model.findMostSpecificLevel(hierarchy);
        Testing.expect(level).toBe('city');
    });

    await Testing.test('formatTimeAgo returns "Just now" for recent times', () => {
        const now = new Date().toISOString();
        const result = Model.formatTimeAgo(now);
        Testing.expect(result).toBe('Just now');
    });

    await Testing.test('formatTimeAgo returns minutes for times within an hour', () => {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const result = Model.formatTimeAgo(fiveMinAgo);
        Testing.expect(result).toBe('5m ago');
    });

    await Testing.test('escapeHtml prevents XSS', () => {
        const escaped = Model.escapeHtml('<script>alert("xss")</script>');
        Testing.expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    await Testing.test('getVisibilityIndicator returns correct icon for private', () => {
        const result = Model.getVisibilityIndicator('private');
        Testing.expect(result.icon).toBe('🔒');
    });

    await Testing.test('getPermissionLabel returns human-readable labels', () => {
        Testing.expect(Model.getPermissionLabel('city')).toBe('City');
        Testing.expect(Model.getPermissionLabel('address')).toBe('Address');
    });
});

// Model State Management
Testing.describe('Model State Management', async () => {
    await Testing.test('setLocation and getLocation work correctly', () => {
        const testCoords = { latitude: 47.6, longitude: -122.3 };
        const testHierarchy = { city: 'Seattle' };
        Model.setLocation(testCoords, testHierarchy);
        const location = Model.getLocation();
        Testing.expect(location.coordinates.latitude).toBe(47.6);
        Testing.expect(location.hierarchy.city).toBe('Seattle');
    });

    await Testing.test('setServerConnected and isServerConnected work correctly', () => {
        Model.setServerConnected(true);
        Testing.expect(Model.isServerConnected()).toBe(true);
        Model.setServerConnected(false);
        Testing.expect(Model.isServerConnected()).toBe(false);
    });
});

// Model Constants
Testing.describe('Model Constants', async () => {
    await Testing.test('HIERARCHY_LEVELS is defined and ordered', () => {
        Testing.expect(Model.HIERARCHY_LEVELS).toBeDefined();
        Testing.expect(Array.isArray(Model.HIERARCHY_LEVELS)).toBe(true);
        Testing.expect(Model.HIERARCHY_LEVELS.length).toBeGreaterThan(0);
    });

    await Testing.test('COUNTRY_TO_CONTINENT has common countries', () => {
        Testing.expect(Model.COUNTRY_TO_CONTINENT['United States']).toBe('North America');
        Testing.expect(Model.COUNTRY_TO_CONTINENT['United Kingdom']).toBe('Europe');
        Testing.expect(Model.COUNTRY_TO_CONTINENT['Japan']).toBe('Asia');
    });

    await Testing.test('CONFIG has required intervals', () => {
        Testing.expect(Model.CONFIG).toBeDefined();
        Testing.expect(Model.CONFIG.LOCATION_REFRESH_INTERVAL).toBeGreaterThan(0);
    });
});

// Event System
Testing.describe('Event System', async () => {
    await Testing.test('Events.on registers callback', () => {
        let called = false;
        const unsubscribe = Events.on('test-event', () => { called = true; });
        Events.emit('test-event');
        Testing.expect(called).toBe(true);
        unsubscribe();
    });

    await Testing.test('Events.off removes callback', () => {
        let count = 0;
        const handler = () => { count++; };
        Events.on('test-count', handler);
        Events.emit('test-count');
        Events.off('test-count', handler);
        Events.emit('test-count');
        Testing.expect(count).toBe(1);
    });

    await Testing.test('Events passes data to handlers', () => {
        let receivedData = null;
        const unsubscribe = Events.on('test-data', (data) => { receivedData = data; });
        Events.emit('test-data', { value: 42 });
        Testing.expect(receivedData.value).toBe(42);
        unsubscribe();
    });
});

// UI State (when app is loaded)
Testing.describe('UI State', async () => {
    await Testing.test('ViewManager exists and has navigate function', () => {
        Testing.expect(typeof ViewManager).toBe('object');
        Testing.expect(typeof ViewManager.navigate).toBe('function');
    });

    await Testing.test('Current view is accessible', () => {
        const currentView = ViewManager.getCurrentView();
        Testing.expect(currentView).toBeDefined();
    });
});

// Print help message
console.log('%c[Testing] In-client testing module loaded.', 'color: #888;');
console.log('%c[Testing] Run Testing.runAll() to execute all tests, or Testing.getSuites() to list available suites.', 'color: #888;');
