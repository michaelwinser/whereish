# Pre-Commit Check System

This document describes the pre-commit hook system that automatically selects the
appropriate test level based on the nature of changes being committed.

## Overview

The pre-commit hook analyzes staged changes and decides whether to run:

- **`make test`** - Fast checks (~10 seconds): smoke tests + linting
- **`make test-all`** - Full checks (~2+ minutes): server tests + client tests

The decision is based on a point-based risk scoring system that considers file
types, change scope, content patterns, and edit velocity.

## Quick Reference

```bash
# Normal commit - hook runs automatically
git commit -m "message"

# See why a test level was chosen
scripts/select-test-level.sh --verbose

# Skip hooks entirely (use sparingly)
git commit --no-verify -m "message"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     git commit                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              .git/hooks/pre-commit                          │
│  Calls: scripts/select-test-level.sh                        │
│  Runs:  make $TEST_LEVEL                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│            scripts/select-test-level.sh                      │
│  - Analyzes staged changes                                   │
│  - Computes risk score                                       │
│  - Returns "test" or "test-all"                             │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│     make test        │    │    make test-all     │
│  - Smoke tests       │    │  - Server tests      │
│  - JS syntax check   │    │  - Client tests      │
│  - All linters       │    │  - (includes test)   │
└──────────────────────┘    └──────────────────────┘
```

## Risk Scoring System

The script computes a risk score by analyzing staged changes. If the score meets
or exceeds the threshold (default: 10), it triggers `test-all`.

### Score Factors

#### Scale Factors

| Condition | Points | Rationale |
|-----------|--------|-----------|
| Files changed > 10 | +5 | Very broad changes |
| Files changed > 5 | +3 | Broad changes |
| Lines changed > 500 | +5 | Major rewrite |
| Lines changed > 100 | +2 | Substantial diff |

#### Edit Velocity

Edit duration is calculated from the oldest modified time among staged files to
the current time. Fast edits suggest quick fixes that may need more validation.

| Condition | Points | Rationale |
|-----------|--------|-----------|
| Duration < 2 minutes | +5 | Very fast, higher risk |
| Duration < 5 minutes | +3 | Fast edit session |

#### High-Risk File Patterns

These patterns in changed filenames increase the risk score:

| Pattern | Points | Rationale |
|---------|--------|-----------|
| `schema.sql`, `migrations/` | +10 | Database schema is critical |
| `requirements.txt`, `package.json` | +8 | Dependency changes |
| `app.py` (server entry) | +5 | Core server changes |
| `api.js`, routes in `/api/` | +5 | API contract changes |
| `Makefile`, `*.config.*` | +5 | Build/config changes |
| Multiple top-level directories | +3 | Cross-cutting changes |

#### High-Risk Content Patterns

These patterns in the diff content increase the risk score:

| Pattern | Points | Rationale |
|---------|--------|-----------|
| `CREATE TABLE`, `ALTER TABLE` | +10 | Schema DDL |
| `@app.route` added/removed | +5 | API endpoint change |
| Removed lines >> added lines | +3 | Deletions are riskier |

#### Low-Risk Adjustments

These patterns reduce the risk score (but cannot go below 0):

| Condition | Points | Rationale |
|-----------|--------|-----------|
| Only `.md` files changed | -10 | Documentation only |
| Only `.css` files changed | -5 | Styling only |
| Only test files changed | -5 | Tests are self-validating |

#### Always Full Test

Some files are critical enough that any change triggers `test-all` regardless of
score. These are configured in `scripts/test-level.conf`:

- `server/schema.sql`
- `migrations/*`
- `requirements.txt`
- `package.json`
- `package-lock.json`

## Configuration

### scripts/test-level.conf

```bash
# Test level selection configuration

# Points threshold for triggering test-all (default: 10)
THRESHOLD=10

# Files that ALWAYS trigger test-all (grep -E patterns, one per line)
# Changes to these files skip scoring and go directly to test-all
ALWAYS_FULL_TEST="
server/schema.sql
migrations/
requirements.txt
package.json
package-lock.json
"

# Patterns for low-risk-only changes (reduce score)
LOW_RISK_PATTERNS="
\.md$
\.css$
"

# Patterns for test-only changes (reduce score)
TEST_FILE_PATTERNS="
^tests/
\.test\.js$
\.spec\.js$
_test\.py$
test_.*\.py$
"
```

### Tuning the Threshold

- **Lower threshold (e.g., 5)**: More conservative, runs full tests more often
- **Higher threshold (e.g., 15)**: More permissive, faster commits but higher risk

To find the right threshold for your workflow:

```bash
# Test different thresholds against recent commits
for threshold in 5 10 15 20; do
    echo "=== Threshold: $threshold ==="
    THRESHOLD=$threshold scripts/select-test-level.sh --verbose
done
```

## Output

### Normal Output (single line)

```
test-level: test-all (18 pts: api.js +5, >5 files +3, schema.sql +10)
```

### Verbose Output (`--verbose` or `-v`)

```
=== Test Level Analysis ===
Files changed: 7
Lines added: 234
Lines removed: 45
Edit duration: 3m 22s

Score breakdown:
  +5  api.js modified (API changes)
  +3  >5 files changed (scale)
  +10 schema.sql modified (always full test)
  +2  >100 lines changed (scale)
  -2  includes test files only

Total: 18 points (threshold: 10)
Decision: test-all
```

## Files

| File | Purpose |
|------|---------|
| `scripts/hooks/pre-commit` | Git hook that invokes the test level selector |
| `scripts/select-test-level.sh` | Analyzes changes and returns test level |
| `scripts/test-level.conf` | Configuration for thresholds and patterns |
| `docs/PRE_COMMIT_CHECKS.md` | This documentation |

## Implementation Notes

### Edit Duration Calculation

The script determines edit duration by:

1. Finding the oldest `mtime` among all staged files
2. Comparing to the current time
3. This approximates "how long the developer spent on these changes"

Limitations:
- Files edited days ago but just now staged will show long duration
- Multiple editing sessions aren't distinguished
- Rebases/merges may skew times

Despite these limitations, edit velocity is a useful heuristic: very quick
changes (< 2 min) are often one-liners or typo fixes that warrant extra scrutiny.

### Why No LLM Analysis?

This script runs locally without network access or LLM support because:

1. **Speed**: Pre-commit hooks must be fast (< 1 second for analysis)
2. **Reliability**: No dependency on external services
3. **Privacy**: No code sent to external APIs
4. **Offline**: Works without internet connection

The heuristic-based approach catches most high-risk scenarios. For edge cases,
developers can always run `make test-all` manually.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Analysis successful, test level printed to stdout |
| 1 | Error in analysis (falls back to `test-all`) |

## Extending the System

### Adding New Risk Patterns

Edit `scripts/test-level.conf` to add patterns to `ALWAYS_FULL_TEST` or modify
`scripts/select-test-level.sh` to add new scoring rules.

### Custom Scoring Rules

To add a new scoring rule, edit `scripts/select-test-level.sh`:

```bash
# Example: Changes to authentication code
if git diff --cached --name-only | grep -qE 'auth|login|session'; then
    add_points 5 "auth code modified"
fi
```

### Integration with CI

The same script can be used in CI to determine test scope:

```yaml
# .github/workflows/test.yml
- name: Determine test level
  id: test-level
  run: echo "level=$(scripts/select-test-level.sh)" >> $GITHUB_OUTPUT

- name: Run tests
  run: make ${{ steps.test-level.outputs.level }}
```

## Troubleshooting

### Hook not running

```bash
# Reinstall hooks
make install-hooks

# Verify hook is executable
ls -la .git/hooks/pre-commit
```

### Wrong test level selected

```bash
# See detailed reasoning
scripts/select-test-level.sh --verbose

# Check what files are staged
git diff --cached --name-only
```

### Tests failing but want to commit anyway

```bash
# Skip hooks (use sparingly, document why)
git commit --no-verify -m "WIP: debugging, tests intentionally skipped"
```

## Changelog

- **v1.0** (2024-12): Initial implementation with point-based scoring system
