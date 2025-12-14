# UI Sync Pattern Review

**Date:** 2025-12-14
**Reviewer:** Claude
**Scope:** Client-side state-to-DOM synchronization patterns
**Related:** Issue #67, docs/DESIGN_UI_FRAMEWORK.md

---

## Overview

This review establishes a process for detecting violations of the Model → Event → View pattern that cause UI synchronization bugs. These bugs manifest as:

- State changes that don't update the UI
- UI showing stale data after operations
- "Refresh to fix" symptoms

## Automated Checking

Run the UI sync lint script:

```bash
make lint-ui-sync        # As part of full lint
./scripts/lint-ui-sync.sh           # Standalone
./scripts/lint-ui-sync.sh --verbose # With details
```

### What the Script Checks

| Check | Purpose | Severity |
|-------|---------|----------|
| DOM manipulation location | Ensure DOM updates happen in UI functions | Warning |
| Direct state assignment | Catch state changes bypassing Model | Warning |
| Model/Event coverage | Verify state changes emit events | Info |
| Render call patterns | Identify orphan render calls | Info |
| Debug logging | Flag excessive console.log statements | Info |
| Event handler patterns | Prefer addEventListener over inline | Warning |

### Interpreting Results

**Valid UI function prefixes:**
- `render*` - Primary render functions
- `display*` - Display/show functions
- `show*` / `hide*` - Visibility toggles
- `update*` - State-driven updates
- `open*` / `close*` - Modal/panel management
- `handle*` - Event handlers
- `init*` - Initialization

DOM manipulation in functions without these prefixes is flagged as a warning.

---

## Current State Assessment

### Baseline (2025-12-14)

| Metric | Count | Notes |
|--------|-------|-------|
| Total DOM manipulations | 202 | In app/*.js |
| In valid UI functions | ~184 | ~91% compliant |
| Flagged for review | 18 | See details below |
| Event listeners | 73 | 58 in app.js |
| Debug statements | 19 | Recently added for #61 |

### Flagged Items

The following DOM manipulations are outside recognized UI function patterns:

| Location | Context | Assessment |
|----------|---------|------------|
| Line 887 | `loadContactRequests` | **OK** - Data loading with UI side effect |
| Lines 1101-1124 | Anonymous callbacks | **Review** - Should be in named function |
| Lines 1455-1456 | Error handling in closure | **OK** - Error display |
| Lines 1828-1840 | Keyboard handler | **OK** - Modal state checks (reads, not writes) |
| Lines 2152-2169 | Init block | **OK** - One-time initialization |

### Recommendations

1. **Lines 1101-1124:** Extract contact detail rendering into a named `renderContactDetail` function
2. **Consider:** Adding `load*` as a valid prefix since data loading functions often update UI

---

## Manual Review Checklist

When reviewing UI sync patterns manually, check:

### State → Model

- [ ] All state changes go through `Model.set*()` methods
- [ ] No direct assignment to module-level state variables
- [ ] State variables declared at module top are treated as read-only outside Model

### Model → Events

- [ ] Each `Model.set*()` emits a corresponding event
- [ ] Event names follow `UPPER_SNAKE_CASE` convention
- [ ] Events include relevant data for subscribers

### Events → Views

- [ ] UI components subscribe to events they depend on
- [ ] Subscriptions are set up in `init()` or component setup
- [ ] No "orphan" render calls (renders without event trigger)

### DOM Updates

- [ ] DOM manipulation only in render/display/update functions
- [ ] Functions that update DOM are named accordingly
- [ ] No DOM reads used for state (DOM is write-only target)

---

## Common Anti-Patterns

### 1. State Change Without UI Update

```javascript
// BAD: Direct state change, no render
contacts = contacts.filter(c => c.id !== id);

// GOOD: Update through Model, which emits event
Model.setContacts(contacts.filter(c => c.id !== id));
// ... subscriber calls renderContactsList()
```

### 2. Render Without Event Trigger

```javascript
// BAD: Random render call
doSomething();
renderContactsList();  // Why here? What changed?

// GOOD: Render in response to state change
Events.on('CONTACTS_CHANGED', () => {
    renderContactsList();
});
```

### 3. Reading DOM for State

```javascript
// BAD: DOM as source of truth
const isLoggedIn = !elements.authModal.classList.contains('hidden');

// GOOD: Model as source of truth
const isLoggedIn = Model.isAuthenticated();
```

### 4. Mixed Concerns in Handler

```javascript
// BAD: Handler does state + DOM + async
async function handleClick() {
    const data = await API.fetch();
    contacts = data;  // State change
    document.getElementById('list').innerHTML = ...;  // DOM update
}

// GOOD: Separation of concerns
async function handleClick() {
    const data = await API.fetch();
    Model.setContacts(data);  // Model emits event
}
// Elsewhere:
Events.on('CONTACTS_CHANGED', renderContactsList);
```

---

## When to Conduct This Review

| Trigger | Action |
|---------|--------|
| UI sync bug reported | Run lint, check flagged items |
| Before major UI changes | Establish baseline |
| After adding new views/components | Verify pattern compliance |
| Quarterly | Full manual review |
| Issue #67 threshold reached | Evaluate framework adoption |

---

## Escalation to Framework Adoption

If this review consistently shows:

- [ ] Flagged items > 30
- [ ] UI sync bugs > 3/month
- [ ] app.js > 3000 lines
- [ ] Manual fixes not sticking

Then escalate to framework evaluation per `docs/DESIGN_UI_FRAMEWORK.md`.

---

## Action Items

- [x] Create automated lint script (`scripts/lint-ui-sync.sh`)
- [x] Add to Makefile (`make lint-ui-sync`)
- [ ] Extract lines 1101-1124 into named render function
- [ ] Consider adding `load*` prefix to valid patterns
- [ ] Add pre-commit hook option for UI sync lint

---

*Next review recommended: After next UI-heavy feature or if UI sync bug reported*
