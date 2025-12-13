// ESLint configuration for Whereish
// ESLint 9+ flat config format

export default [
  // Main app files
  {
    files: ["app/*.js"],
    ignores: ["app/sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        localStorage: "readonly",
        indexedDB: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        location: "readonly",
        URL: "readonly",
        Response: "readonly",
        caches: "readonly",
        IDBKeyRange: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        alert: "readonly",
        confirm: "readonly",
        Event: "readonly",
        HTMLElement: "readonly",

        // App globals (IIFE modules)
        Events: "writable",
        Model: "writable",
        ViewManager: "writable",
        API: "writable",
        Storage: "writable",
        Geofence: "writable",
        BUILD_INFO: "readonly",
      }
    },
    rules: {
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^(Events|Model|ViewManager|API|Storage|Geofence)$"
      }],
      "no-console": "off",
      "no-undef": "error",
    }
  },
  // Service worker
  {
    files: ["app/sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        console: "readonly",
        Response: "readonly",
        URL: "readonly",
      }
    },
    rules: {
      "no-console": "off",
      "no-undef": "error",
    }
  }
];
