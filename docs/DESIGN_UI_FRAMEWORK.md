# Design Document: UI Framework Evaluation

**Version:** 1.0 (Draft)
**Date:** December 14, 2025
**Status:** Under Discussion
**Issue:** #67

---

## 1. Overview

This document evaluates whether to adopt a UI framework for the Whereish client application. The current vanilla JavaScript implementation has experienced bugs and regressions related to state-to-DOM synchronization, prompting this evaluation.

### 1.1 Current Architecture

The client uses vanilla JavaScript with a manual Model-View separation:

| Module | Lines | Responsibility |
|--------|-------|----------------|
| `app.js` | 2,232 | Main UI controller, event handling, DOM manipulation |
| `model.js` | 610 | Application state, business logic |
| `views.js` | 174 | View navigation management |
| `events.js` | 90 | Pub/sub event system |
| `ui.js` | 358 | Toast and modal components |

**Current metrics:**
- 202 DOM manipulation calls (innerHTML, textContent, classList, etc.)
- 73 event listeners (58 in app.js alone)
- No build step required
- Zero external UI dependencies

### 1.2 Problem Statement

The application experiences bugs where UI state becomes inconsistent with model state:

1. **Missed updates:** State changes but UI doesn't reflect them
2. **Stale displays:** Cached or old data shown after operations complete
3. **Manual synchronization burden:** Each state change requires explicit DOM updates in multiple places

**Root cause:** Manual state-to-DOM synchronization requires developers to remember every DOM element affected by each state change. Missing one creates a bug.

---

## 2. Decision Criteria

### 2.1 Must Have

- **Offline-first PWA support:** Must work without network after initial load
- **Local bundling:** No CDN dependencies (supply chain security)
- **Small bundle size:** Target <50KB additional JavaScript
- **No build step required:** Or minimal, optional build step

### 2.2 Should Have

- **Incremental adoption:** Can migrate piece by piece, not all-or-nothing
- **Low learning curve:** Team can be productive quickly
- **Good debugging:** Clear error messages, inspectable state

### 2.3 Nice to Have

- **TypeScript support:** For future type safety
- **Active ecosystem:** Community, documentation, longevity
- **Testing utilities:** Component testing support

---

## 3. Options Analysis

### 3.1 Option A: React

| Attribute | Assessment |
|-----------|------------|
| Bundle size | ~40KB gzipped (react + react-dom) |
| Learning curve | Medium - JSX, hooks, component lifecycle |
| Migration effort | **High** - Complete rewrite required |
| Reactivity | Virtual DOM diffing, one-way data flow |
| Build requirement | Yes (JSX transformation) |

**Pros:**
- Most popular, extensive ecosystem
- Well-understood patterns
- Excellent DevTools

**Cons:**
- Requires build step (JSX)
- Large bundle for a simple PWA
- All-or-nothing migration
- Overkill for current app complexity

### 3.2 Option B: Vue

| Attribute | Assessment |
|-----------|------------|
| Bundle size | ~33KB gzipped |
| Learning curve | Low-Medium - Template syntax familiar |
| Migration effort | **High** - Complete rewrite required |
| Reactivity | Proxy-based reactive system |
| Build requirement | Recommended (SFC), but optional |

**Pros:**
- Gentler learning curve than React
- Can use without build step (template strings)
- Good documentation

**Cons:**
- Still significant bundle size
- Migration is substantial effort
- Another abstraction layer to debug

### 3.3 Option C: Svelte

| Attribute | Assessment |
|-----------|------------|
| Bundle size | ~2KB runtime (compiles away) |
| Learning curve | Low - Close to vanilla HTML/JS |
| Migration effort | **High** - Complete rewrite required |
| Reactivity | Compile-time, assignment-based |
| Build requirement | **Yes** (compiler required) |

**Pros:**
- Smallest runtime footprint
- Very fast performance
- Clean, readable syntax

**Cons:**
- **Requires build step** - Major change to current workflow
- Smaller ecosystem than React/Vue
- All-or-nothing migration

### 3.4 Option D: Alpine.js

| Attribute | Assessment |
|-----------|------------|
| Bundle size | ~15KB gzipped |
| Learning curve | **Very low** - Declarative HTML attributes |
| Migration effort | **Low-Medium** - Incremental adoption possible |
| Reactivity | Proxy-based, scoped to components |
| Build requirement | **No** |

**Pros:**
- Can adopt incrementally (one component at a time)
- Works with existing HTML structure
- No build step
- Designed for "sprinkles of interactivity"

**Cons:**
- Less structure for large apps
- Smaller ecosystem
- Logic in HTML attributes (can be messy)

**Example migration:**
```html
<!-- Before (vanilla) -->
<div id="contacts-section">
  <div id="contacts-list"></div>
</div>
<script>
  function renderContacts(contacts) {
    document.getElementById('contacts-list').innerHTML =
      contacts.map(c => `<div>${c.name}</div>`).join('');
  }
</script>

<!-- After (Alpine) -->
<div id="contacts-section" x-data="{ contacts: [] }">
  <template x-for="contact in contacts">
    <div x-text="contact.name"></div>
  </template>
</div>
```

### 3.5 Option E: Custom Minimal Reactive Layer

| Attribute | Assessment |
|-----------|------------|
| Bundle size | ~1-3KB |
| Learning curve | **None** - We design it |
| Migration effort | **Medium** - Refactor existing code |
| Reactivity | Custom (likely proxy-based) |
| Build requirement | **No** |

**Concept:** Build a thin reactive wrapper around the existing Model that automatically updates registered DOM elements when state changes.

**Example API:**
```javascript
// Define reactive bindings
Reactive.bind('contacts', '#contacts-list', (contacts) => {
  return contacts.map(c => `<div class="contact">${c.name}</div>`).join('');
});

// Updates automatically trigger re-render
Model.setContacts(newContacts); // DOM updates automatically
```

**Pros:**
- Exactly fits our needs, no bloat
- No external dependency
- Full control over behavior
- Can evolve incrementally

**Cons:**
- We maintain it
- May reinvent existing solutions
- Less battle-tested

### 3.6 Option F: Formalize Current Pattern

| Attribute | Assessment |
|-----------|------------|
| Bundle size | 0KB additional |
| Learning curve | None |
| Migration effort | **Low** - Audit and refactor |
| Reactivity | Manual but systematic |
| Build requirement | No |

**Approach:** Keep vanilla JS but establish strict conventions:

1. All state lives in Model
2. Model emits events on every state change
3. Each view subscribes to relevant events
4. No direct DOM manipulation outside render functions
5. Audit all existing code to follow pattern

**Pros:**
- No new dependencies
- Lowest risk
- Builds on existing architecture

**Cons:**
- Doesn't prevent future violations
- Still manual synchronization
- Relies on discipline, not enforcement

---

## 4. Prioritization Signals

This section defines signals that would indicate the UI framework work should be prioritized. Future reviews should check for these indicators.

### 4.1 High Priority Signals (Act Soon)

| Signal | Threshold | Current State |
|--------|-----------|---------------|
| UI sync bugs in past month | >3 bugs | ~2 (invitation caching, toast regression) |
| app.js line count | >3,000 lines | 2,232 lines |
| DOM manipulation calls | >300 calls | 202 calls |
| Time spent debugging UI sync issues | >20% of bug time | Unknown |
| New features blocked by UI complexity | Any | None currently |

### 4.2 Medium Priority Signals (Plan for Future)

| Signal | Threshold | Current State |
|--------|-----------|---------------|
| app.js line count | >2,500 lines | 2,232 lines |
| Event listener count | >100 | 73 |
| Contributors unfamiliar with codebase | >2 active | 1 |
| Feature velocity decreasing | Noticeable trend | Not observed |

### 4.3 Low Priority Signals (Monitor)

| Signal | Threshold | Current State |
|--------|-----------|---------------|
| Codebase size growth | >50% in 3 months | N/A (new project) |
| Test coverage of UI code | <50% | Unknown |
| Render performance issues | User-reported | None |

### 4.4 Review Checklist

When conducting code reviews or architectural assessments, check:

- [ ] Any new UI sync bugs since last review?
- [ ] Has app.js grown significantly?
- [ ] Are render functions becoming complex?
- [ ] Is the event subscription pattern being followed consistently?
- [ ] Are there "refresh to fix" bugs being reported?
- [ ] Is debugging UI state taking excessive time?

---

## 5. Recommendation

### 5.1 Current Recommendation: Option F (Formalize Current Pattern)

**Rationale:**
1. Current bug rate doesn't justify migration effort
2. Existing architecture is sound, just inconsistently applied
3. No build step is a genuine advantage for this project
4. Team is small and can enforce conventions

**Immediate actions:**
1. Audit app.js for state-to-DOM sync violations
2. Document the Model → Event → View pattern
3. Add console logging (as done in #61) to trace state flow
4. Consider adding debug mode that warns on direct DOM manipulation

### 5.2 Future Consideration: Option D (Alpine.js)

If signals reach "High Priority" thresholds, Alpine.js is the recommended framework because:
1. Incremental adoption (migrate one component at a time)
2. No build step required
3. Small bundle size
4. Works with existing HTML structure

### 5.3 Not Recommended

- **React/Vue:** Overkill for current app complexity, requires build step
- **Svelte:** Requires build step, all-or-nothing migration
- **Custom framework:** Reinventing the wheel when Alpine exists

---

## 6. Migration Path (If Needed)

If Alpine.js adoption is triggered:

### Phase 1: Setup (1-2 days)
- Add Alpine.js to app/ (bundled locally)
- Add to service worker cache
- Update ESLint config for Alpine directives

### Phase 2: Pilot Component (2-3 days)
- Migrate contacts list to Alpine
- Validate approach, measure bundle impact
- Document patterns

### Phase 3: Incremental Migration (ongoing)
- Migrate remaining components one at a time
- Prioritize components with most sync bugs
- Old and new can coexist indefinitely

### Phase 4: Cleanup (when complete)
- Remove manual render functions
- Simplify event system
- Update documentation

---

## 7. References

- Issue #67: Evaluate using a UI framework
- Issue #61: Replace native dialogs (example of UI sync debugging)
- Alpine.js: https://alpinejs.dev/
- Current architecture: `docs/DESIGN.md` §4.1
