// ESLint configuration for Whereish
// ESLint 9+ flat config format

export default [
  // Global ignores
  {
    ignores: ["app/nacl-*.min.js"]
  },
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
        sessionStorage: "readonly",
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
        Blob: "readonly",
        requestAnimationFrame: "readonly",

        // External libraries (CDN)
        nacl: "readonly",
        google: "readonly",  // Google Identity Services

        // App globals (IIFE modules)
        Crypto: "writable",
        PinCrypto: "writable",
        Identity: "writable",
        Events: "writable",
        Model: "writable",
        ViewManager: "writable",
        API: "writable",
        Storage: "writable",
        Geofence: "writable",
        Toast: "writable",
        ConfirmModal: "writable",
        InputModal: "writable",
        BUILD_INFO: "readonly",
      }
    },
    rules: {
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^(Crypto|PinCrypto|Identity|Events|Model|ViewManager|API|Storage|Geofence|Toast|ConfirmModal|InputModal)$"
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
