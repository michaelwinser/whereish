# Developer Guide

Quick reference for working on Whereish.

## Prerequisites

- Go 1.21+ (for server)
- Node.js 18+ (for client tooling)
- SQLite3

## Setup

```bash
# Clone and install Node dependencies
git clone https://github.com/michaelwinser/whereish.git
cd whereish
npm install

# Install git hooks
make install-hooks
```

## Common Commands

```bash
make run           # Run dev server on :8080
make test          # Run lints
make test-server   # Run Go tests
make test-client   # Run Playwright tests
make test-all      # Run all tests
make build         # Build Go binaries
make help          # Show all available targets
```

## Pre-commit Hook

A git pre-commit hook runs tests before each commit. If tests fail, the commit is aborted.

```bash
make install-hooks  # Install hooks
```

To bypass (use sparingly):
```bash
git commit --no-verify
```

The hook source is tracked in `scripts/hooks/pre-commit`.

## Project Structure

```
├── app/                  # PWA client (vanilla JS)
│   ├── index.html
│   ├── app.js           # Main controller
│   ├── bind.js          # Reactive binding system
│   ├── model.js         # Application state
│   ├── api.js           # API client module
│   ├── render/          # Render functions
│   ├── handlers/        # Event handlers
│   ├── views.js         # ViewManager for navigation
│   ├── storage.js       # IndexedDB wrapper
│   ├── style.css
│   └── sw.js            # Service worker
│
├── server/              # Go API server
│   ├── api/
│   │   └── openapi.yaml # API specification
│   ├── cmd/
│   │   ├── server/      # Server binary
│   │   └── cli/         # CLI binary
│   ├── internal/
│   │   ├── api/         # HTTP handlers
│   │   ├── auth/        # Authentication
│   │   ├── config/      # Configuration
│   │   └── store/       # Database layer
│   └── pkg/
│       ├── client/      # Go client library
│       └── crypto/      # Encryption utilities
│
├── client-ts/           # TypeScript API client
│
├── tests/client/        # Playwright tests
│
├── Makefile
├── eslint.config.mjs    # ESLint config
└── .markdownlint.json   # Markdownlint config
```

## Testing

### Go Server Tests

```bash
make test-server
# or directly:
cd server && go test ./...
```

### Client Tests (Playwright)

```bash
make test-client
# or directly:
npx playwright test
```

### All Tests

```bash
make test-all
```

## Linting

### JavaScript (eslint)

```bash
make lint-js
```

- Checks: eslint recommended rules
- Config: `eslint.config.mjs`

### Go (go vet)

```bash
make lint-go
```

### Markdown (markdownlint)

```bash
make lint-md
```

- Config: `.markdownlint.json`

## Development Server

```bash
make run
# Opens http://localhost:8080
# Press Ctrl+C to stop
```

This runs the Go server which serves both API and PWA static files.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8080 |
| `DATABASE_URL` | SQLite database path | whereish.db |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | (required for auth) |
| `DEV_MODE` | Enable dev endpoints | false |
| `STATIC_DIR` | Static files directory | ../app |

### Dev Mode

Set `DEV_MODE=1` to enable:
- `/api/dev/login` endpoint for testing without Google OAuth

```bash
DEV_MODE=1 make run
```

## Code Generation

The server uses OpenAPI code generation:

```bash
make generate          # Regenerate all code
make generate-server   # Server code only
make generate-client   # Go client only
make generate-types    # TypeScript types only
```

## Service Worker Cache

When modifying client files, bump the cache version in `app/sw.js`:

```javascript
const CACHE_NAME = 'whereish-v28';  // Increment this
```

## Code Style

- **Go**: Standard gofmt formatting
- **JavaScript**: Browser globals, IIFE module pattern
- **No unnecessary comments**: Code should be self-documenting
- **No emojis in code**: Unless explicitly requested

## Cleanup

```bash
make clean         # Remove build artifacts
make clean-db      # Clear local database
```
