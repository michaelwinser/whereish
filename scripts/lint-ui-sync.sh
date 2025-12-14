#!/bin/bash
# lint-ui-sync.sh - Detect UI synchronization pattern violations
#
# This script checks for violations of the Model → Event → View pattern:
# 1. DOM manipulation should happen inside render/display functions
# 2. State changes should go through Model, not direct variable assignment
# 3. Render functions should be called via event handlers, not directly
#
# Usage: ./scripts/lint-ui-sync.sh [--verbose]
#
# Exit codes:
#   0 - No issues found
#   1 - Warnings found (review recommended)
#   2 - Errors found (likely bugs)

set -e

VERBOSE=false
if [[ "$1" == "--verbose" ]]; then
    VERBOSE=true
fi

WARNINGS=0
ERRORS=0

echo "========================================"
echo "UI Sync Pattern Lint"
echo "========================================"
echo ""

# -----------------------------------------------------------------------------
# Check 1: DOM manipulation outside render/display functions
# -----------------------------------------------------------------------------
echo "Check 1: DOM manipulation outside render functions"
echo "---------------------------------------------------"

# Get line numbers of render/display function definitions
RENDER_FUNCS=$(grep -n "function render\|function display\|async function render\|async function display" app/app.js | cut -d: -f1 | tr '\n' '|' | sed 's/|$//')

# Find all DOM manipulations
DOM_OPS=$(grep -n "\.innerHTML\|\.textContent\|\.classList\.\|\.appendChild\|\.removeChild\|\.insertBefore" app/app.js | grep -v "// lint-ignore" || true)

if [[ -n "$DOM_OPS" ]]; then
    # For each DOM operation, check if it's inside a render function
    # This is a heuristic - we check if there's a render function definition before this line
    # and no closing brace pattern that would indicate we've left the function

    OUTSIDE_RENDER=""
    while IFS= read -r line; do
        LINE_NUM=$(echo "$line" | cut -d: -f1)
        LINE_CONTENT=$(echo "$line" | cut -d: -f2-)

        # Skip if in elements initialization block (lines ~48-130)
        if [[ $LINE_NUM -lt 150 ]]; then
            continue
        fi

        # Skip comments
        if echo "$LINE_CONTENT" | grep -q "^\s*//"; then
            continue
        fi

        # Check if this looks like it's in a valid UI update context
        # Look backwards for the function name
        CONTEXT=$(sed -n "1,${LINE_NUM}p" app/app.js | tail -50 | grep -o "function [a-zA-Z]*" | tail -1 || echo "unknown")
        FUNC_NAME=$(echo "$CONTEXT" | sed 's/function //')

        # Valid UI function patterns: render*, display*, show*, hide*, update*, open*, close*, handle*
        if ! echo "$FUNC_NAME" | grep -qiE "^(render|display|show|hide|update|open|close|handle|init)"; then
            OUTSIDE_RENDER="${OUTSIDE_RENDER}  Line $LINE_NUM: $LINE_CONTENT (in: $FUNC_NAME)\n"
            ((WARNINGS++))
        elif [[ "$VERBOSE" == "true" ]]; then
            echo "  OK: Line $LINE_NUM in $FUNC_NAME"
        fi
    done <<< "$DOM_OPS"

    if [[ -n "$OUTSIDE_RENDER" ]]; then
        echo "WARNING: DOM manipulation outside render/display functions:"
        echo -e "$OUTSIDE_RENDER"
    else
        echo "  OK - All DOM manipulations appear to be in render functions"
    fi
else
    echo "  OK - No DOM manipulations found (unexpected)"
fi
echo ""

# -----------------------------------------------------------------------------
# Check 2: Direct state variable assignment (bypassing Model)
# -----------------------------------------------------------------------------
echo "Check 2: Direct state variable assignment"
echo "------------------------------------------"

# These are the state variables that should only be modified via Model
STATE_VARS="currentCoordinates|currentHierarchy|namedLocations|currentMatch|serverConnected|currentUserId|contacts|selectedContact|permissionLevels"

# Find direct assignments (not inside Model.js)
DIRECT_ASSIGNS=$(grep -n "^\s*\(${STATE_VARS}\)\s*=" app/app.js | grep -v "// lint-ignore\|= null\|= \[\]\|= false" || true)

if [[ -n "$DIRECT_ASSIGNS" ]]; then
    echo "INFO: Direct state variable assignments found:"
    echo "  (These may be OK for initialization, but updates should use Model.set*)"
    echo "$DIRECT_ASSIGNS" | while read -r line; do
        echo "  $line"
    done
    echo ""
    echo "  Consider using Model.setContacts(), Model.setCurrentMatch(), etc."
else
    echo "  OK - No suspicious direct state assignments"
fi
echo ""

# -----------------------------------------------------------------------------
# Check 3: Model.set* calls that might be missing UI updates
# -----------------------------------------------------------------------------
echo "Check 3: Model state changes and event coverage"
echo "------------------------------------------------"

# Find all Model.set* calls in app.js
MODEL_SETS=$(grep -oh "Model\.set[A-Za-z]*" app/app.js | sort -u || true)
# Find all event subscriptions
EVENT_SUBS=$(grep -oh "Events\.on('[A-Z_]*'" app/app.js | sort -u || true)
# Find all event emissions in model.js
EVENT_EMITS=$(grep -oh "Events\.emit('[A-Z_]*'" app/model.js | sort -u || true)

echo "Model.set* calls found in app.js:"
echo "$MODEL_SETS" | while read -r setter; do
    if [[ -n "$setter" ]]; then
        COUNT=$(grep -c "$setter" app/app.js || echo "0")
        echo "  $setter ($COUNT calls)"
    fi
done
echo ""

echo "Event subscriptions in app.js:"
echo "$EVENT_SUBS" | while read -r sub; do
    if [[ -n "$sub" ]]; then
        echo "  $sub"
    fi
done
echo ""

echo "Event emissions in model.js:"
echo "$EVENT_EMITS" | while read -r emit; do
    if [[ -n "$emit" ]]; then
        echo "  $emit"
    fi
done
echo ""

# -----------------------------------------------------------------------------
# Check 4: Render function calls outside event handlers
# -----------------------------------------------------------------------------
echo "Check 4: Render function call patterns"
echo "---------------------------------------"

# Find render function calls
RENDER_CALLS=$(grep -n "render[A-Za-z]*(" app/app.js | grep -v "function render\|// lint-ignore" || true)

echo "Render function calls found:"
if [[ -n "$RENDER_CALLS" ]]; then
    echo "$RENDER_CALLS" | head -20 | while read -r line; do
        echo "  $line"
    done
    TOTAL=$(echo "$RENDER_CALLS" | wc -l | tr -d ' ')
    if [[ $TOTAL -gt 20 ]]; then
        echo "  ... and $((TOTAL - 20)) more"
    fi
    echo ""
    echo "  Review these to ensure they're called from event handlers or other render functions"
else
    echo "  None found"
fi
echo ""

# -----------------------------------------------------------------------------
# Check 5: Console.log statements (debugging left in)
# -----------------------------------------------------------------------------
echo "Check 5: Debug logging statements"
echo "----------------------------------"

DEBUG_LOGS=$(grep -c "console\.log\|console\.debug" app/app.js || echo "0")
echo "  Found $DEBUG_LOGS console.log/debug statements"
if [[ $DEBUG_LOGS -gt 20 ]]; then
    echo "  WARNING: High number of debug statements - review before release"
    ((WARNINGS++))
fi
echo ""

# -----------------------------------------------------------------------------
# Check 6: Inline event handlers (should use addEventListener)
# -----------------------------------------------------------------------------
echo "Check 6: Event handler patterns"
echo "--------------------------------"

INLINE_HANDLERS=$(grep -c -E "onclick=|onchange=|onsubmit=" app/index.html 2>/dev/null || true)
INLINE_HANDLERS=${INLINE_HANDLERS:-0}
echo "  Inline event handlers in HTML: $INLINE_HANDLERS"
if [[ "$INLINE_HANDLERS" -gt 0 ]]; then
    echo "  WARNING: Prefer addEventListener for consistency"
    ((WARNINGS++))
fi

ADDEVENTLISTENER=$(grep -c "addEventListener" app/app.js || echo "0")
echo "  addEventListener calls in app.js: $ADDEVENTLISTENER"
echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "========================================"
echo "Summary"
echo "========================================"
echo "Warnings: $WARNINGS"
echo "Errors: $ERRORS"
echo ""

if [[ $ERRORS -gt 0 ]]; then
    echo "RESULT: ERRORS FOUND - Review required"
    exit 2
elif [[ $WARNINGS -gt 0 ]]; then
    echo "RESULT: WARNINGS - Review recommended"
    exit 1
else
    echo "RESULT: OK"
    exit 0
fi
