#!/bin/bash
# lint-poc.sh - Check MVC separation patterns in custom-binding POC
#
# This script checks that the POC follows proper Model-View-Controller patterns:
# - DOM manipulation only in bind.js, not app.js
# - State changes go through Model methods
# - Bindings specify explicit events
# - Render functions return values (pure functions)
#
# Usage: ./scripts/lint-poc.sh [poc-dir] [--verbose]
#        ./scripts/lint-poc.sh --all [--verbose]
#
# Exit codes:
#   0 - No issues found
#   1 - Warnings found (review recommended)
#   2 - Errors found (MVC violations)

set -e

VERBOSE=false
CHECK_ALL=false
POC_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose)
            VERBOSE=true
            shift
            ;;
        --all)
            CHECK_ALL=true
            shift
            ;;
        *)
            POC_DIR="$1"
            shift
            ;;
    esac
done

WARNINGS=0
ERRORS=0

# Colors for output (if terminal supports it)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    YELLOW='\033[0;33m'
    GREEN='\033[0;32m'
    NC='\033[0m' # No Color
else
    RED=''
    YELLOW=''
    GREEN=''
    NC=''
fi

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------

log_ok() {
    echo -e "  ${GREEN}OK${NC} - $1"
}

log_warning() {
    echo -e "  ${YELLOW}WARNING${NC}: $1"
    WARNINGS=$((WARNINGS + 1))
}

log_error() {
    echo -e "  ${RED}ERROR${NC}: $1"
    ERRORS=$((ERRORS + 1))
}

log_info() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "  INFO: $1"
    fi
}

# -----------------------------------------------------------------------------
# Custom Binding Checks
# -----------------------------------------------------------------------------

check_custom_binding() {
    local dir="$1"
    local app_js="$dir/app.js"
    local bind_js="$dir/bind.js"

    if [[ ! -f "$app_js" ]] || [[ ! -f "$bind_js" ]]; then
        log_error "Missing required files (app.js or bind.js) in $dir"
        return
    fi

    echo ""
    echo "Check CB-1: DOM manipulation only in bind.js"
    echo "---------------------------------------------"

    # Check app.js for direct DOM manipulation (should be zero)
    # Exclude: return statements (template strings), comments
    local dom_ops
    dom_ops=$(grep -n "\.innerHTML\s*=\|\.textContent\s*=\|\.appendChild\|\.removeChild\|\.insertBefore" "$app_js" 2>/dev/null | grep -v "return\s\|//\|^\s*\*" || true)

    if [[ -n "$dom_ops" ]]; then
        log_error "Direct DOM manipulation found in app.js (should only be in bind.js):"
        echo "$dom_ops" | while IFS= read -r line; do
            echo "    $line"
        done
    else
        log_ok "No direct DOM manipulation in app.js"
    fi

    # classList is allowed for navigation (showView)
    local classList_ops
    classList_ops=$(grep -n "\.classList\." "$app_js" 2>/dev/null | grep -v "showView\|//\|toggle.*active" || true)

    if [[ -n "$classList_ops" ]]; then
        log_warning "classList usage outside navigation:"
        echo "$classList_ops" | while IFS= read -r line; do
            echo "    $line"
        done
    fi

    echo ""
    echo "Check CB-2: Bindings specify events (avoid wildcard)"
    echo "-----------------------------------------------------"

    # Check for wildcard event usage
    local wildcard_bindings
    wildcard_bindings=$(grep -n "Bind\.\w\+.*\['\*'\]" "$app_js" 2>/dev/null || true)

    if [[ -n "$wildcard_bindings" ]]; then
        local count
        count=$(echo "$wildcard_bindings" | wc -l | tr -d ' ')
        log_warning "$count binding(s) use wildcard '*' events (prefer specific events):"
        echo "$wildcard_bindings" | while IFS= read -r line; do
            echo "    $line"
        done
    else
        log_ok "All bindings specify explicit events"
    fi

    echo ""
    echo "Check CB-3: State changes via Model"
    echo "------------------------------------"

    # Check for direct state variable assignment (outside Model)
    # Allow: currentView (UI-only state), loop variables, const declarations
    local direct_state
    direct_state=$(grep -n "^\s*\(contacts\|location\|places\|invites\|serverConnected\)\s*=" "$app_js" 2>/dev/null | grep -v "Model\.\|const\|let\|function\|=>" || true)

    if [[ -n "$direct_state" ]]; then
        log_error "Direct state assignment (should use Model methods):"
        echo "$direct_state" | while IFS= read -r line; do
            echo "    $line"
        done
    else
        log_ok "State changes go through Model"
    fi

    echo ""
    echo "Check CB-4: Render functions return strings (pure)"
    echo "---------------------------------------------------"

    # Check that render* functions don't do DOM manipulation
    local render_funcs
    render_funcs=$(grep -n "^function render\|^const render" "$app_js" 2>/dev/null || true)

    if [[ -n "$render_funcs" ]]; then
        local func_count
        func_count=$(echo "$render_funcs" | wc -l | tr -d ' ')
        log_info "Found $func_count render function(s)"

        # For each render function, check it has a return statement
        local has_return=true
        echo "$render_funcs" | while IFS= read -r line; do
            local line_num
            line_num=$(echo "$line" | cut -d: -f1)
            local func_name
            func_name=$(echo "$line" | grep -o "render[A-Za-z]*")

            # Check next 30 lines for return statement
            if ! sed -n "${line_num},$((line_num + 30))p" "$app_js" | grep -q "return\s"; then
                log_warning "Render function $func_name may not return a value"
                has_return=false
            fi
        done

        if [[ "$has_return" == "true" ]]; then
            log_ok "Render functions appear to return values"
        fi
    else
        log_info "No render functions found (may use inline arrow functions)"
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

lint_poc() {
    local dir="$1"
    local dir_name
    dir_name=$(basename "$dir")

    # Capture counters before this POC
    local WARNINGS_BEFORE=$WARNINGS
    local ERRORS_BEFORE=$ERRORS

    echo "========================================"
    echo "POC MVC Pattern Lint: $dir_name"
    echo "========================================"
    echo "Detected type: custom-binding"

    check_custom_binding "$dir"

    # Calculate per-POC counts
    local POC_WARNINGS=$((WARNINGS - WARNINGS_BEFORE))
    local POC_ERRORS=$((ERRORS - ERRORS_BEFORE))

    echo ""
    echo "----------------------------------------"
    echo "Summary: $POC_WARNINGS warning(s), $POC_ERRORS error(s)"
    echo "----------------------------------------"
    echo ""
}

# Main execution
if [[ "$CHECK_ALL" == "true" ]]; then
    # Find custom-binding POC directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    POC_BASE="$(dirname "$SCRIPT_DIR")/poc"

    if [[ ! -d "$POC_BASE/custom-binding" ]]; then
        echo "ERROR: POC directory not found at $POC_BASE/custom-binding"
        exit 2
    fi

    lint_poc "$POC_BASE/custom-binding"
elif [[ -n "$POC_DIR" ]]; then
    if [[ ! -d "$POC_DIR" ]]; then
        echo "ERROR: Directory not found: $POC_DIR"
        exit 2
    fi
    lint_poc "$POC_DIR"
else
    echo "Usage: $0 [poc-dir] [--verbose]"
    echo "       $0 --all [--verbose]"
    echo ""
    echo "Examples:"
    echo "  $0 poc/custom-binding"
    echo "  $0 poc/custom-binding --verbose"
    echo "  $0 --all"
    exit 1
fi

# Exit with appropriate code
if [[ $ERRORS -gt 0 ]]; then
    echo "RESULT: ERRORS FOUND - MVC violations detected"
    exit 2
elif [[ $WARNINGS -gt 0 ]]; then
    echo "RESULT: WARNINGS - Review recommended"
    exit 1
else
    echo "RESULT: OK - All MVC patterns followed"
    exit 0
fi
