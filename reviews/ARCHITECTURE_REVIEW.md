# Architecture Review: Full Codebase

**Date:** 2025-12-13
**Reviewer:** Claude Opus 4.5
**Mode:** Baseline (Initial architecture review)
**Scope:** Full client-side codebase (`app/` directory)
**Commit:** 500b968

## Executive Summary

The codebase has good foundational separation with a clean Model layer and event system. However, there are boundary violations that complicate testing and maintenance: the API module manipulates DOM directly, and app.js conflates view rendering with orchestration logic. A Controller/Presenter layer would clarify responsibilities and improve testability.

**Overall Health:** Good foundation, needs targeted refactoring

**Key Recommendations:**
1. Extract DOM manipulation from api.js (P1)
2. Consider Controller layer to separate orchestration from view rendering (P2)
3. Formalize event payload contracts (P2)

---

## Module Inventory

| Module | LOC | Responsibility | Key Dependencies |
|--------|-----|----------------|------------------|
| `events.js` | 90 | Pub/sub event system | None |
| `model.js` | 610 | State management, pure business logic | Events |
| `views.js` | 174 | Navigation state machine | DOM (expected) |
| `api.js` | 472 | HTTP communication with server | fetch, localStorage, **DOM (violation)** |
| `storage.js` | 282 | IndexedDB wrapper for local data | indexedDB |
| `geofence.js` | 167 | Distance calculations, geofence matching | None (pure) |
| `crypto.js` | 128 | NaCl box encryption | nacl (global) |
| `identity.js` | 277 | Cryptographic identity management | Crypto, nacl, indexedDB |
| `app.js` | 2190 | View rendering + orchestration | All modules, DOM |
| `sw.js` | 116 | Service worker caching | Cache API |
| `version.js` | 13 | Build info constants | None |

---

## Dependency Analysis

### Explicit Dependencies

```
                    ┌──────────────┐
                    │   app.js     │ (View + Orchestration)
                    │   2190 LOC   │
                    └──────┬───────┘
                           │
       ┌───────────────────┼───────────────────┬─────────────────┐
       │                   │                   │                 │
       ▼                   ▼                   ▼                 ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐   ┌──────────┐
│  model.js   │     │   api.js    │     │ storage.js  │   │ views.js │
│   610 LOC   │     │   472 LOC   │     │   282 LOC   │   │ 174 LOC  │
└──────┬──────┘     └─────────────┘     └─────────────┘   └──────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  events.js  │     │ geofence.js │     │ identity.js │
│    90 LOC   │     │   167 LOC   │     │   277 LOC   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  crypto.js  │
                                        │   128 LOC   │
                                        └─────────────┘
```

### Implicit Dependencies

| Module | Assumes | Type | Priority |
|--------|---------|------|----------|
| `api.js:108-118` | `document.body` exists for update banner | DOM structure | **P1** |
| `api.js:412-422` | `navigator.serviceWorker` for SW messages | Browser API | P2 |
| `api.js:23` | `localStorage` for token storage | Browser API | OK |
| `crypto.js` | `nacl` global is loaded | Global variable | P2 |
| `identity.js` | `nacl` global is loaded | Global variable | P2 |
| `identity.js` | `Crypto` module is loaded first | Load order | P2 |
| `app.js:30-40` | Duplicates Model state locally | State sync | P2 |
| All modules | IIFE pattern - correct script load order in HTML | Load order | OK (documented) |

### Third-Party Call Graph

| Module | External Calls | Notes |
|--------|----------------|-------|
| `api.js` | `fetch`, `localStorage` | Standard browser APIs |
| `storage.js` | `indexedDB` | Standard browser API |
| `identity.js` | `indexedDB`, `nacl.util.*` | Browser + bundled lib |
| `crypto.js` | `nacl.box.*`, `nacl.util.*`, `nacl.randomBytes` | Bundled lib (tweetnacl) |
| `app.js` | `navigator.geolocation`, `fetch` (Nominatim) | Browser + external service |
| `views.js` | `window.history` | Standard browser API |

---

## Architectural Dimensions

### 1. Module Boundaries

| Finding | Location | Assessment |
|---------|----------|------------|
| Model is DOM-free with clear responsibility | model.js | **Good** |
| Events module is minimal and focused | events.js | **Good** |
| Geofence is pure functions, highly testable | geofence.js | **Good** |
| API module handles HTTP + DOM + localStorage | api.js:108-118 | **Violation** |
| app.js mixes view rendering with orchestration | app.js | **Concern** |
| ViewManager cleanly separates navigation logic | views.js | **Good** |

### 2. Coupling

| Modules | Coupling Type | Priority |
|---------|---------------|----------|
| api.js ↔ DOM | Implicit: creates/modifies DOM elements | **P1** |
| app.js ↔ Model | Duplicate state (lines 30-40 mirror Model) | P2 |
| crypto.js ↔ nacl | Implicit global dependency | P2 |
| app.js ↔ all modules | Expected - it's the composition root | OK |

**The api.js → DOM coupling is the most significant issue.** The API module should:
- Return error/status information
- Let a higher-level component decide how to display it

Current violation (api.js:108-118):
```javascript
function showForcedUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    // ... DOM manipulation
    document.body.prepend(banner);
}
```

### 3. Cohesion

| Module | Assessment | Notes |
|--------|------------|-------|
| `events.js` | **High** | Single purpose: pub/sub |
| `model.js` | **High** | State + pure functions, no side effects |
| `geofence.js` | **High** | Pure distance/matching calculations |
| `storage.js` | **High** | IndexedDB CRUD only |
| `crypto.js` | **High** | Encryption operations only |
| `identity.js` | **High** | Key management only |
| `views.js` | **High** | Navigation state machine only |
| `api.js` | **Medium** | HTTP + some UI concerns (update banner) |
| `app.js` | **Low** | View rendering + orchestration + event handling |

### 4. Abstraction Levels

| Abstraction | Assessment | Notes |
|-------------|------------|-------|
| Model/View separation | Right level | Clear boundary, events for communication |
| Events as pub/sub | Right level | Simple, sufficient for current needs |
| Storage wrapper | Right level | Hides IndexedDB complexity |
| API client | Leaky | Exposes UI concerns (update banner) |
| ViewManager | Right level | Clean navigation abstraction |

### 5. Dependency Direction

**Ideal:**
```
┌─────────┐
│  View   │ ◄── Renders state, handles user input
└────┬────┘
     │ calls
     ▼
┌─────────┐
│Controller│ ◄── Orchestrates, handles events
└────┬────┘
     │ calls
     ▼
┌─────────┐
│  Model  │ ◄── State, business logic
└────┬────┘
     │ calls
     ▼
┌─────────┐
│   API   │ ◄── HTTP only
└─────────┘
```

**Actual:**
```
┌─────────┐
│  View   │ (app.js - rendering functions)
└────┬────┘
     │
     │◄──────── Mixed together
     │
┌────┴────┐
│Orchestr.│ (app.js - init, timers, event handlers)
└────┬────┘
     │
     ▼
┌─────────┐     ┌─────────┐
│  Model  │     │   API   │──────► DOM  ← VIOLATION
└─────────┘     └─────────┘
```

### 6. Abstraction Opportunities

| Opportunity | Evidence | Priority | Notes |
|-------------|----------|----------|-------|
| **Controller/Presenter layer** | app.js mixes orchestration with view rendering; api.js reaches into DOM | **P1** | Would clarify responsibilities, enable testing |
| **Notification/Toast abstraction** | api.js:108-118 creates update banner; similar patterns likely elsewhere | P2 | Centralize UI feedback |
| **Event payload types** | Model.EVENTS defines names but not payload shapes | P2 | Would catch contract violations |
| **API response handler** | Repeated error handling patterns in app.js | P2 | Pattern emerging |

**Controller Layer Rationale:**

Currently, app.js does two jobs:
1. **View**: `renderContactsList()`, `displayLocation()`, `updateServerStatus()`
2. **Controller**: `publishLocationToServer()`, `refreshContacts()`, `handleAuthSubmit()`

A Controller would:
- Subscribe to Model events
- Call API methods
- Update Model state
- Tell View to re-render (but not do the rendering)

This would allow:
- Testing orchestration logic without DOM
- api.js to be pure HTTP (return data/errors, not show UI)
- View to be pure rendering (given state, produce DOM)

### 7. Interface Design

| Module | Public API Size | Assessment |
|--------|-----------------|------------|
| `Events` | 5 functions | Minimal |
| `Model` | 30+ functions | Acceptable (state getters/setters + pure functions) |
| `API` | 18 functions | Acceptable |
| `Storage` | 7 functions | Minimal |
| `Geofence` | 6 functions | Minimal |
| `ViewManager` | 7 functions | Minimal |
| `Crypto` | 6 functions | Minimal |
| `Identity` | 10 functions | Acceptable |

### 8. Extension Points

| Capability | Current Extensibility | Notes |
|------------|----------------------|-------|
| Adding permission levels | Good | Data-driven via `HIERARCHY_LEVELS` |
| Adding new views | Medium | Requires `ViewManager.register()` + HTML + app.js handlers |
| Adding API endpoints | Good | Add function to `api.js`, call from app.js |
| Changing storage backend | Poor | IndexedDB hardcoded, no adapter pattern |
| Alternative transports | Poor | fetch hardcoded, no transport abstraction |

---

## Architectural Questions Raised

### 1. Should we introduce a Controller/Presenter layer?

**Evidence for:**
- api.js DOM manipulation violates separation
- app.js (2190 LOC) conflates view + orchestration
- Testing orchestration logic requires DOM mocking
- `publishLocationToServer()` is pure orchestration but lives with view code

**Evidence against:**
- Codebase is relatively small
- Adding a layer increases complexity
- Current architecture "works"

**Recommendation:** Yes, but incrementally. Start by:
1. Moving update banner logic out of api.js into a callback/event
2. Extracting orchestration functions from app.js into a separate file
3. See if patterns emerge that warrant a formal Controller

### 2. Should we formalize event payload contracts?

**Evidence for:**
- Model.EVENTS only defines event names, not payloads
- Easy to emit wrong payload shape
- TypeScript would catch this, but we're vanilla JS

**Evidence against:**
- Current codebase is small enough to grep
- Adding JSDoc contracts is manual overhead

**Recommendation:** Add JSDoc `@typedef` for event payloads near `Model.EVENTS`. Low effort, documents intent.

---

## Comparison to Design Docs

| Design Doc Claim | Reality | Drift Type |
|------------------|---------|------------|
| "API layer handles HTTP communication" (implied) | api.js also creates DOM elements | Implementation drift |
| "Model has no DOM dependencies" (model.js:8) | True | Aligned |
| DESIGN.md mentions "Transport Interface" | Not abstracted - fetch is hardcoded | Intentional simplification |

---

## Recommendations

### P0 - Fix Now

*None - no critical issues blocking development*

### P1 - Create Issue

| Finding | Impact | Suggested Issue Title |
|---------|--------|----------------------|
| api.js creates DOM elements directly | Violates separation, complicates testing | "Extract update banner display from api.js" |

**Details for P1 issue:**

The `showForcedUpdateBanner()` function in api.js (lines 108-118) and service worker message handler (lines 412-422) directly manipulate the DOM. This should be refactored to:

Option A: Emit an event that app.js listens to
```javascript
// api.js
Events.emit('api:update-required', { forced: true, version: serverVersion });

// app.js
Events.on('api:update-required', ({ forced }) => {
    if (forced) showForcedUpdateBanner();
});
```

Option B: Accept a callback during initialization
```javascript
// api.js
let onUpdateRequired = null;
function setUpdateHandler(handler) { onUpdateRequired = handler; }

// In checkVersionHeader:
if (onUpdateRequired) onUpdateRequired({ forced: true });
```

### P2 - Comment for Future

| Finding | Location | Comment to Add |
|---------|----------|----------------|
| Duplicate state in app.js | app.js:30-40 | `// ARCH: Consider removing local state copies - Model is source of truth` |
| nacl global dependency | crypto.js:21, identity.js:76 | `// ARCH: nacl loaded as global from nacl-fast.min.js` |
| Orchestration mixed with view | app.js:1497 | `// ARCH: publishLocationToServer is orchestration - consider extracting to controller` |

### Deferred (Intentionally)

| Finding | Reason for Deferral | Revisit When |
|---------|--------------------| -------------|
| Full Controller layer | Codebase is manageable size; extracting api.js DOM may be sufficient | After P1 fix, if app.js continues to grow |
| Transport abstraction | Only one transport (fetch) needed currently | If Matrix integration begins |
| Storage adapter pattern | Only one storage (IndexedDB) needed | If offline-first sync is added |

---

## Action Items

- [ ] P1: Create issue "Extract update banner display from api.js"
- [ ] P2: Add `// ARCH:` comments at noted locations
- [ ] P2: Add JSDoc `@typedef` for Model event payloads
- [ ] Decision needed: Confirm Controller layer is deferred (not needed yet)

---

## Appendix: Positive Patterns to Preserve

These patterns are working well and should be maintained:

1. **Model as single source of truth** with event-driven updates
2. **Pure functions in Model** (`buildHierarchy`, `formatTimeAgo`, etc.) - easily testable
3. **ViewManager as navigation state machine** - clean abstraction
4. **Geofence as pure module** - no dependencies, highly testable
5. **IIFE module pattern** - consistent, works without build tools
6. **Events module** - simple, sufficient pub/sub

---

*Review conducted as initial baseline*
*Next architecture review recommended: After multi-phase feature work or after P1 fix is implemented*
