# Whereish

A privacy-first location sharing app that shares **semantic labels** rather than raw coordinates. Control exactly what each contact sees—from "Planet Earth" to "Coffee Shop."

**Core Philosophy:** Share presence, not coordinates. No tracking, no history, no surprises.

## Features

- **Semantic Location Sharing** - Share human-readable locations (city, neighborhood, street) instead of GPS coordinates
- **Per-Contact Permissions** - Set different visibility levels for each contact (from "Planet Earth" to "Address")
- **Named Places** - Define custom locations ("Home", "Work", "Soccer Field") with independent visibility controls
- **Privacy by Design** - Coordinates processed on-device, only semantic labels shared
- **PWA** - Installable progressive web app works on any device

## Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/michaelwinser/whereish.git
cd whereish

# Run with docker-compose
SECRET_KEY=$(openssl rand -hex 32) docker compose up -d
```

Visit http://localhost:8080

### Development

```bash
# Install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install

# Run the server
python server/app.py

# In another terminal, serve the PWA
cd app && python3 -m http.server 8081
```

Visit http://localhost:8081

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

- **Frontend:** Vanilla JavaScript PWA with IndexedDB
- **Backend:** Python/Flask REST API
- **Database:** SQLite
- **Geocoding:** Nominatim (OpenStreetMap)

## Testing

```bash
# Run all tests
make test-all

# Server tests only (pytest)
make test-server

# Client tests only (Playwright)
make test-client
```

## License

See [LICENSE](LICENSE) for details. Commercial use requires permission.
