# Custom Binding POC

This directory contains the custom binding proof-of-concept that was chosen as the implementation approach for the Whereish client UI refactoring.

**Issue:** #81 (evaluation complete), #82 (implementation)

## Background

Three approaches were evaluated in Issue #81:
- Custom Binding (this POC) - Build our own thin reactive layer
- Alpine.js - Declarative HTML attributes
- Svelte - Compile-time reactivity

**Custom Binding won** based on:
- Clearest MVC separation
- Best AI comprehensibility
- Smallest bundle size (~3KB)
- No external dependencies
- Easiest migration path

For the full evaluation with all three POCs, see the `poc-evaluation-archive` branch.

## Running the POC

```bash
# From the poc/ directory, serve with any static server:
python3 -m http.server 8081

# Then open:
# http://localhost:8081/custom-binding/
```

## Architecture

```
poc/
├── README.md                    # This file
├── shared/
│   ├── mock-model.js            # Mock model for POC testing
│   └── styles.css               # Shared styles
└── custom-binding/
    ├── index.html               # HTML shell
    ├── bind.js                  # Reactive binding system (~260 lines)
    └── app.js                   # Controller/bootstrap (~310 lines)
```

### How It Works

1. **Model** (`shared/mock-model.js`) - Single source of truth, emits events on state changes
2. **View** (`index.html`) - HTML structure with IDs for binding targets
3. **Controller** (`app.js`) - Sets up bindings and event handlers

The binding system (`bind.js`) provides:
- `Bind.html(selector, renderFn, events)` - Reactive HTML content
- `Bind.text(selector, valueFn, events)` - Reactive text content
- `Bind.visible(selector, conditionFn, events)` - Show/hide elements
- `Bind.class(selector, classFn, events)` - Dynamic CSS classes
- `Bind.attr(selector, attrName, valueFn, events)` - Dynamic attributes

**Pattern:**
```javascript
// Declarative binding - WHAT to render, not WHEN
Bind.html('#contacts-list', () =>
  Model.getContacts().map(renderContact).join('')
, ['contacts:changed']);

// Model change automatically triggers re-render
Model.addContact(newContact); // UI updates automatically
```

## MVC Pattern Linting

The POC is checked for proper Model-View-Controller separation:

```bash
# Lint the POC
make lint-poc

# Or directly:
./scripts/lint-poc.sh poc/custom-binding --verbose
```

### Rules Checked

| Rule | Description |
|------|-------------|
| CB-1 | DOM manipulation only in bind.js, not app.js |
| CB-2 | Bindings specify explicit events (no wildcards) |
| CB-3 | State changes go through Model methods |
| CB-4 | Render functions return values (pure functions) |

## Next Steps

See Issue #82 for the main app re-implementation using this pattern.

The strategy is:
1. Create acceptance tests from current app behavior
2. Re-implement using custom binding in `app/v2/`
3. Run side-by-side during development
4. Cut over once all tests pass
