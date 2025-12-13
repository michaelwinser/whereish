# Developer Guide

Quick reference for working on Whereish.

## Setup

```bash
# Clone and set up (one time)
make install-dev
```

This creates a Python virtual environment (`.venv/`) and installs all dependencies including dev tools.

## Common Commands

```bash
make pre-commit    # Run before committing (smoke + lint)
make test          # Run all tests (smoke + lint)
make test-smoke    # Fast smoke tests only (~7 sec)
make run           # Run server (:8500) and client (:8080)
make lint          # Run all linters
make help          # Show all available targets
```

## Pre-commit Hook

A git pre-commit hook runs `make pre-commit` before each commit. If tests fail, the commit is aborted.

The hook is automatically installed by `make install-dev`. For new clones:
```bash
make install-dev    # Installs deps + hooks
# or just hooks:
make install-hooks
```

To bypass (use sparingly):
```bash
git commit --no-verify
```

The hook source is tracked in `scripts/hooks/pre-commit`.

## How the Makefile Works

### Automatic venv Detection

The Makefile automatically uses `.venv/bin/python3` if it exists, otherwise falls back to system `python3`. You don't need to activate the venv manually when using Make.

```bash
# These all use the venv automatically
make test
make run-server
make lint-python
```

Manual activation is only needed for running Python directly:

```bash
source .venv/bin/activate
python3 some_script.py
```

## Project Structure

```
├── app/                  # PWA client (static files)
│   ├── index.html
│   ├── app.js           # Main application logic
│   ├── api.js           # API client module
│   ├── views.js         # ViewManager for navigation
│   ├── storage.js       # IndexedDB wrapper
│   ├── geofence.js      # Location matching
│   ├── style.css
│   └── sw.js            # Service worker
│
├── server/              # Flask API server
│   ├── app.py           # Main server code
│   ├── run.py           # Dev server runner
│   ├── requirements.txt
│   └── requirements-dev.txt
│
├── smoke_test.py        # Server smoke tests
├── Makefile
├── pyproject.toml       # Ruff (Python linter) config
├── eslint.config.mjs    # ESLint config
└── .markdownlint.json   # Markdownlint config
```

## Testing

### Smoke Tests (Fast)

```bash
make test-smoke
```

Runs in ~7 seconds:
- Server API endpoint tests (health, auth, location, contacts)
- JavaScript syntax validation

### Full Test Suite

```bash
make test
```

Runs smoke tests + all linters.

## Linting

### Python (ruff)

```bash
make lint-python
```

- Checks: pyflakes, pycodestyle, import sorting
- Config: `pyproject.toml`

### JavaScript (eslint)

```bash
make lint-js
```

- Checks: eslint recommended rules
- Config: `eslint.config.mjs`

### Markdown (markdownlint)

```bash
make lint-md
```

- Checks: markdownlint rules (relaxed for existing docs)
- Config: `.markdownlint.json`

### Fix Python Formatting

```bash
.venv/bin/python3 -m ruff format server/ smoke_test.py
```

## Development Servers

### Both Together

```bash
make run
# Server: http://localhost:8500
# Client: http://localhost:8080
# Press Ctrl+C to stop both
```

### Separately

```bash
# Terminal 1
make run-server    # API on :8500

# Terminal 2
make run-client    # PWA on :8080
```

## Service Worker Cache

When modifying client files, bump the cache version in `app/sw.js`:

```javascript
const CACHE_NAME = 'whereish-v28';  // Increment this
```

## Code Style

- **Python**: Single quotes, 100 char lines, sorted imports (enforced by ruff)
- **JavaScript**: Browser globals, IIFE module pattern
- **No unnecessary comments**: Code should be self-documenting
- **No emojis in code**: Unless explicitly requested

## Cleanup

```bash
make clean         # Remove __pycache__, .pyc, etc.
make clean-all     # Also remove .venv
```
