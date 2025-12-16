#!/bin/bash
# select-test-level.sh - Determine whether to run 'test' or 'test-all'
#
# Analyzes staged git changes and computes a risk score to decide
# the appropriate test level for pre-commit checks.
#
# Usage:
#   scripts/select-test-level.sh           # Returns "test" or "test-all"
#   scripts/select-test-level.sh -v        # Verbose output with reasoning
#   scripts/select-test-level.sh --verbose # Same as -v
#
# Exit codes:
#   0 - Success, test level printed to stdout
#   1 - Error (defaults to test-all for safety)
#
# See docs/PRE_COMMIT_CHECKS.md for full documentation.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/test-level.conf"

# Defaults (can be overridden by config or environment)
THRESHOLD="${THRESHOLD:-10}"
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Load configuration
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

# Scoring state
POINTS=0
declare -a REASONS=()

# Add points with reason tracking
add_points() {
    local pts=$1
    local reason=$2
    POINTS=$((POINTS + pts))
    REASONS+=("$(printf "%+d" "$pts")  $reason")
}

# Subtract points (for low-risk patterns)
sub_points() {
    local pts=$1
    local reason=$2
    POINTS=$((POINTS - pts))
    if [[ $POINTS -lt 0 ]]; then
        POINTS=0
    fi
    REASONS+=("-$pts  $reason")
}

# Get list of staged files
get_staged_files() {
    git diff --cached --name-only 2>/dev/null || echo ""
}

# Get diff stats
get_diff_stats() {
    git diff --cached --numstat 2>/dev/null || echo ""
}

# Calculate edit duration from file mtimes
get_edit_duration() {
    local files
    files=$(get_staged_files)

    if [[ -z "$files" ]]; then
        echo "0"
        return
    fi

    local oldest_mtime
    oldest_mtime=$(date +%s)
    local now
    now=$(date +%s)

    while IFS= read -r file; do
        if [[ -f "$file" ]]; then
            local mtime
            # macOS uses -f %m, Linux uses -c %Y
            if [[ "$(uname)" == "Darwin" ]]; then
                mtime=$(stat -f %m "$file" 2>/dev/null || echo "$now")
            else
                mtime=$(stat -c %Y "$file" 2>/dev/null || echo "$now")
            fi
            if [[ $mtime -lt $oldest_mtime ]]; then
                oldest_mtime=$mtime
            fi
        fi
    done <<< "$files"

    echo $((now - oldest_mtime))
}

# Format duration for display
format_duration() {
    local seconds=$1
    if [[ $seconds -lt 60 ]]; then
        echo "${seconds}s"
    elif [[ $seconds -lt 3600 ]]; then
        echo "$((seconds / 60))m $((seconds % 60))s"
    else
        echo "$((seconds / 3600))h $((seconds % 3600 / 60))m"
    fi
}

# Check if any file matches always-full-test patterns
check_always_full_test() {
    local files
    files=$(get_staged_files)

    if [[ -z "$ALWAYS_FULL_TEST" ]]; then
        return 1
    fi

    # Convert multi-line string to grep pattern
    local patterns
    patterns=$(echo "$ALWAYS_FULL_TEST" | grep -v '^#' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')

    if [[ -z "$patterns" ]]; then
        return 1
    fi

    local matched
    matched=$(echo "$files" | grep -E "$patterns" | head -1)

    if [[ -n "$matched" ]]; then
        echo "$matched"
        return 0
    fi

    return 1
}

# Check if ALL files are low-risk (docs/css only)
check_low_risk_only() {
    local files
    files=$(get_staged_files)

    if [[ -z "$files" ]]; then
        return 1
    fi

    if [[ -z "$LOW_RISK_PATTERNS" ]]; then
        return 1
    fi

    local patterns
    patterns=$(echo "$LOW_RISK_PATTERNS" | grep -v '^#' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')

    if [[ -z "$patterns" ]]; then
        return 1
    fi

    # Check if any file does NOT match low-risk patterns
    if echo "$files" | grep -qvE "$patterns"; then
        return 1  # Has non-low-risk files
    fi

    return 0  # All files are low-risk
}

# Check if changes include test files
check_has_test_files() {
    local files
    files=$(get_staged_files)

    if [[ -z "$TEST_FILE_PATTERNS" ]]; then
        return 1
    fi

    local patterns
    patterns=$(echo "$TEST_FILE_PATTERNS" | grep -v '^#' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')

    if [[ -z "$patterns" ]]; then
        return 1
    fi

    if echo "$files" | grep -qE "$patterns"; then
        return 0
    fi

    return 1
}

# Main analysis
analyze_changes() {
    local files
    files=$(get_staged_files)

    if [[ -z "$files" ]]; then
        # No staged changes - will default to test (0 points)
        return
    fi

    local file_count
    file_count=$(echo "$files" | wc -l | tr -d ' ')

    # Get diff stats
    local stats
    stats=$(get_diff_stats)
    local lines_added=0
    local lines_removed=0

    if [[ -n "$stats" ]]; then
        lines_added=$(echo "$stats" | awk '{sum+=$1} END {print sum+0}')
        lines_removed=$(echo "$stats" | awk '{sum+=$2} END {print sum+0}')
    fi

    # Get edit duration
    local duration
    duration=$(get_edit_duration)

    # Store for verbose output
    FILES_CHANGED=$file_count
    LINES_ADDED=$lines_added
    LINES_REMOVED=$lines_removed
    EDIT_DURATION=$duration

    # Check for always-full-test files first
    local always_match
    if always_match=$(check_always_full_test); then
        add_points 100 "$always_match (always full test)"
        return
    fi

    # Scale factors
    if [[ $file_count -gt 10 ]]; then
        add_points 5 ">10 files changed ($file_count files)"
    elif [[ $file_count -gt 5 ]]; then
        add_points 3 ">5 files changed ($file_count files)"
    fi

    if [[ $lines_added -gt 500 ]]; then
        add_points 5 ">500 lines added ($lines_added lines)"
    elif [[ $lines_added -gt 100 ]]; then
        add_points 2 ">100 lines added ($lines_added lines)"
    fi

    # Edit velocity
    if [[ $duration -lt 120 ]]; then
        add_points 5 "very fast edit (<2 min)"
    elif [[ $duration -lt 300 ]]; then
        add_points 3 "fast edit (<5 min)"
    fi

    # High-risk file patterns
    if echo "$files" | grep -qE 'app\.py'; then
        add_points 5 "app.py modified (core server)"
    fi

    if echo "$files" | grep -qE 'api\.js|/api/'; then
        add_points 5 "API code modified"
    fi

    if echo "$files" | grep -qE 'Makefile|\.config\.'; then
        add_points 5 "build/config modified"
    fi

    # Check for cross-cutting changes (multiple top-level directories)
    local top_dirs
    top_dirs=$(echo "$files" | cut -d/ -f1 | sort -u | wc -l | tr -d ' ')
    if [[ $top_dirs -gt 2 ]]; then
        add_points 3 "cross-cutting ($top_dirs directories)"
    fi

    # Content analysis (check diff content in code files only)
    # Use git diff with file filter to avoid matching documentation
    local py_diff
    py_diff=$(git diff --cached -- '*.py' 2>/dev/null || echo "")
    local sql_diff
    sql_diff=$(git diff --cached -- '*.sql' 2>/dev/null || echo "")

    if echo "$py_diff" | grep -qE '^\+.*@app\.route'; then
        add_points 5 "API endpoint added"
    fi

    if echo "$sql_diff" | grep -qE '^\+.*(CREATE TABLE|ALTER TABLE)'; then
        add_points 10 "schema DDL detected"
    fi

    # Check for significant deletions
    if [[ $lines_removed -gt $((lines_added * 2)) ]] && [[ $lines_removed -gt 50 ]]; then
        add_points 3 "significant deletions ($lines_removed removed)"
    fi

    # Low-risk adjustments
    if check_low_risk_only; then
        sub_points 10 "docs/css only"
    fi

    if check_has_test_files; then
        # Only subtract if there are also non-test files
        if ! echo "$files" | grep -qvE "$(echo "$TEST_FILE_PATTERNS" | grep -v '^#' | grep -v '^$' | tr '\n' '|' | sed 's/|$//')"; then
            sub_points 5 "test files only"
        fi
    fi
}

# Output results
output_result() {
    local decision
    if [[ $POINTS -ge $THRESHOLD ]]; then
        decision="test-all"
    else
        decision="test"
    fi

    if [[ "$VERBOSE" == "true" ]]; then
        echo "=== Test Level Analysis ==="
        echo "Files changed: $FILES_CHANGED"
        echo "Lines added: $LINES_ADDED"
        echo "Lines removed: $LINES_REMOVED"
        echo "Edit duration: $(format_duration "$EDIT_DURATION")"
        echo ""
        echo "Score breakdown:"
        for reason in "${REASONS[@]}"; do
            echo "  $reason"
        done
        if [[ ${#REASONS[@]} -eq 0 ]]; then
            echo "  (no risk factors detected)"
        fi
        echo ""
        echo "Total: $POINTS points (threshold: $THRESHOLD)"
        echo "Decision: $decision"
    else
        # Single-line summary
        local summary=""
        local count=0
        for reason in "${REASONS[@]}"; do
            # Extract the points and short description
            local pts
            pts=$(echo "$reason" | grep -oE '^[+-][0-9]+' || echo "")
            local desc
            desc=$(echo "$reason" | sed 's/^[+-][0-9]*  //')
            # Shorten common patterns
            desc=$(echo "$desc" | sed 's/ lines)$/L)/' | sed 's/ files)$/f)/' | sed 's/ directories)/d)/' | cut -c1-25)

            if [[ -n "$summary" ]]; then
                summary="$summary, $desc $pts"
            else
                summary="$desc $pts"
            fi
            ((count++))
            # Limit to 3 reasons for brevity
            if [[ $count -ge 3 ]]; then
                break
            fi
        done

        if [[ -n "$summary" ]]; then
            echo "test-level: $decision ($POINTS pts: $summary)"
        else
            echo "test-level: $decision ($POINTS pts)"
        fi
    fi

    # Always output just the decision as the final line for easy parsing
    # The hook uses: TEST_LEVEL=$(script | tail -1)
    echo "$decision"
}

# Main
main() {
    # Initialize variables for verbose output
    FILES_CHANGED=0
    LINES_ADDED=0
    LINES_REMOVED=0
    EDIT_DURATION=0

    analyze_changes
    output_result
}

main
