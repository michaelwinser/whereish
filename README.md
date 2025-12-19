# Whereish

A privacy-first location sharing app that shares **semantic labels** rather than raw coordinates. Control exactly what each contact sees—from "Planet Earth" to "Coffee Shop."

**Core Philosophy:** Share presence, not coordinates. No tracking, no history, no surprises.

## Features

- **Semantic Location Sharing** - Share human-readable locations (city, neighborhood, street) instead of GPS coordinates
- **Per-Contact Permissions** - Set different visibility levels for each contact (from "Planet Earth" to "Address")
- **Named Places** - Define custom locations ("Home", "Work", "Soccer Field") with independent visibility controls
- **Privacy by Design** - Coordinates processed on-device, only semantic labels shared
- **End-to-End Encryption** - Location data encrypted client-side before transmission
- **PWA** - Installable progressive web app works on any device

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/michaelwinser/whereish.git
cd whereish

# Run with docker-compose
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com docker compose up -d
```

Visit http://localhost:8080

### Development

```bash
# Install Node dependencies (for client tooling)
npm install

# Run the Go server
cd server && go run ./cmd/server

# Or build and run
make build
./server/bin/whereish-server
```

Visit http://localhost:8080

## Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements |
| [Design](docs/DESIGN.md) | Technical architecture |
| [UX Design](docs/UX_DESIGN.md) | Screen designs and flows |
| [Docker](docs/DOCKER.md) | Self-hosting guide |
| [Developer](docs/DEVELOPER.md) | Development setup |
| [Testing](docs/TESTING.md) | Test strategy and running tests |

## Tech Stack

- **Frontend:** Vanilla JavaScript PWA with custom reactive binding system
- **Backend:** Go REST API with OpenAPI specification
- **Database:** SQLite (Postgres and Firestore planned)
- **Geocoding:** Nominatim (OpenStreetMap)
- **Encryption:** NaCl (TweetNaCl) for E2E encryption

## Project Structure

```
whereish/
├── app/              # PWA client (vanilla JS)
├── server/           # Go server
│   ├── api/          # OpenAPI specification
│   ├── cmd/          # Server and CLI binaries
│   ├── internal/     # Private packages
│   └── pkg/          # Public packages (client lib)
├── client-ts/        # TypeScript API client
├── tests/client/     # Playwright client tests
└── docs/             # Documentation
```

## Testing

```bash
# Run lints (quick check)
make test

# Run Go server tests
make test-server

# Run client tests (Playwright)
make test-client

# Run all tests
make test-all
```

## License

See [LICENSE](LICENSE) for details. Commercial use requires permission.
