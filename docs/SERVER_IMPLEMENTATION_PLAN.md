# Server Implementation Plan

This document outlines the implementation plan for the new Whereish server architecture as described in `NEW_SERVER_ARCHITECTURE.md`.

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Server language | Go | Developer familiarity, excellent Cloud Run support, reliable AI code generation |
| API specification | OpenAPI 3.x | Contract-first development, code generation for server and clients |
| Database backends | SQLite, Postgres, Firestore | Dev flexibility, self-hosting, managed cloud |
| Go code generation | oapi-codegen | Industry standard, generates server stubs and client |
| TS code generation | openapi-typescript | Type-safe client for browser |
| CLI approach | Thin wrapper around Go client library | Shared code, consistent behavior |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenAPI Spec                              │
│                    (Single Source of Truth)                      │
└─────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Go Server   │    │ Go Client Lib │    │  TS Client    │
│  (oapi-codegen)│    │ (oapi-codegen)│    │  (openapi-ts) │
└───────────────┘    └───────────────┘    └───────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Store Layer  │    │    CLI Tool   │    │   PWA Client  │
│  (interface)  │    │ (thin wrapper)│    │   (browser)   │
└───────────────┘    └───────────────┘    └───────────────┘
        │
        ├─────────────┬─────────────┐
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  SQLite   │  │ Postgres  │  │ Firestore │
│   (dev)   │  │  (self)   │  │  (cloud)  │
└───────────┘  └───────────┘  └───────────┘
```

## Phase 1: OpenAPI Specification

**Goal:** Define the complete API contract.

### Deliverables

1. `api/openapi.yaml` - Full OpenAPI 3.x specification
2. Schema definitions for all request/response types
3. Authentication scheme documentation (Bearer tokens)
4. Error response standardization

### Endpoints to Define

From `NEW_SERVER_ARCHITECTURE.md`:

**Authentication:**
- `POST /api/auth/google` - OAuth login
- `POST /api/auth/logout` - End session
- `DELETE /api/auth/account` - Delete account

**Identity:**
- `GET /api/identity/backup` - Fetch encrypted identity
- `PUT /api/identity/backup` - Store encrypted identity
- `POST /api/identity/public-key` - Register public key

**User Data:**
- `GET /api/user-data` - Fetch encrypted user data blob
- `PUT /api/user-data` - Update encrypted user data blob (with version)

**Contacts:**
- `GET /api/contacts` - List contacts with public keys
- `POST /api/contacts/request` - Send contact request
- `GET /api/contacts/requests` - List pending requests
- `POST /api/contacts/requests/{id}/accept` - Accept request
- `POST /api/contacts/requests/{id}/decline` - Decline request
- `DELETE /api/contacts/{id}` - Remove contact

**Locations:**
- `GET /api/locations` - Fetch encrypted locations from contacts
- `POST /api/locations` - Publish encrypted locations to contacts

**Devices:**
- `GET /api/devices` - List devices
- `POST /api/devices` - Register device
- `DELETE /api/devices/{id}` - Revoke device

**Utility:**
- `GET /api/me` - Current user info (validates session)
- `GET /api/health` - Health check

### Design Considerations

- Use `application/json` for all request/response bodies
- Encrypted blobs transmitted as base64 strings
- Version numbers as integers for optimistic concurrency
- Timestamps as ISO 8601 strings
- Consistent error response format: `{ "error": { "code": "...", "message": "..." } }`

---

## Phase 2: Go Server + Storage Layer

**Goal:** Implement the server with pluggable storage backends.

### 2.1 Project Structure

```
server-go/
├── cmd/
│   ├── server/         # Main server binary
│   │   └── main.go
│   └── cli/            # CLI tool binary
│       └── main.go
├── api/
│   └── openapi.yaml    # OpenAPI spec (from Phase 1)
├── internal/
│   ├── api/            # Generated server code + handlers
│   │   ├── generated.go    # oapi-codegen output
│   │   └── handlers.go     # Handler implementations
│   ├── store/          # Storage abstraction
│   │   ├── store.go        # Interface definitions
│   │   ├── sqlite/         # SQLite implementation
│   │   ├── postgres/       # Postgres implementation
│   │   └── firestore/      # Firestore implementation
│   ├── auth/           # Authentication logic
│   │   ├── google.go       # Google OAuth
│   │   └── tokens.go       # Session/device tokens
│   └── config/         # Configuration
│       └── config.go
├── pkg/
│   └── client/         # Generated + extended client library
│       ├── generated.go    # oapi-codegen client output
│       └── client.go       # Convenience wrappers
├── go.mod
├── go.sum
└── Makefile
```

### 2.2 Storage Interface Design

```go
// store/store.go

type Store interface {
    Users() UserRepository
    Contacts() ContactRepository
    Devices() DeviceRepository
    Locations() LocationRepository

    // Transaction support (no-op for Firestore)
    WithTx(ctx context.Context, fn func(Store) error) error

    Close() error
}

type UserRepository interface {
    Create(ctx context.Context, user *User) error
    GetByID(ctx context.Context, id string) (*User, error)
    GetByEmail(ctx context.Context, email string) (*User, error)
    GetByGoogleID(ctx context.Context, googleID string) (*User, error)
    Update(ctx context.Context, user *User) error
    Delete(ctx context.Context, id string) error

    // Encrypted data operations
    GetIdentityBackup(ctx context.Context, userID string) (*IdentityBackup, error)
    SetIdentityBackup(ctx context.Context, userID string, backup *IdentityBackup) error
    GetUserData(ctx context.Context, userID string) (*UserData, error)
    SetUserData(ctx context.Context, userID string, data *UserData, expectedVersion int) error
}

type ContactRepository interface {
    // Contact relationships
    ListContacts(ctx context.Context, userID string) ([]*Contact, error)
    GetContact(ctx context.Context, userID, contactID string) (*Contact, error)
    RemoveContact(ctx context.Context, userID, contactID string) error

    // Contact requests
    CreateRequest(ctx context.Context, req *ContactRequest) error
    ListIncomingRequests(ctx context.Context, userID string) ([]*ContactRequest, error)
    ListOutgoingRequests(ctx context.Context, userID string) ([]*ContactRequest, error)
    AcceptRequest(ctx context.Context, requestID string) error
    DeclineRequest(ctx context.Context, requestID string) error
    CancelRequest(ctx context.Context, requestID string) error
}

type DeviceRepository interface {
    Create(ctx context.Context, device *Device) error
    List(ctx context.Context, userID string) ([]*Device, error)
    GetByToken(ctx context.Context, token string) (*Device, error)
    UpdateLastSeen(ctx context.Context, deviceID string) error
    Revoke(ctx context.Context, deviceID string) error
}

type LocationRepository interface {
    // Get all locations shared TO a user
    GetLocationsForUser(ctx context.Context, userID string) ([]*EncryptedLocation, error)
    // Get location shared FROM one user TO another
    GetLocation(ctx context.Context, fromUserID, toUserID string) (*EncryptedLocation, error)
    // Set/update locations (batch for efficiency)
    SetLocations(ctx context.Context, fromUserID string, locations []*EncryptedLocation) error
}
```

### 2.3 Implementation Order

1. **Core infrastructure**
   - Configuration loading (env vars, config file)
   - Logging setup
   - HTTP server with middleware (CORS, auth, logging)

2. **SQLite storage implementation**
   - Schema migrations
   - All repository implementations
   - Integration tests

3. **Authentication**
   - Google OAuth token verification
   - Session token generation/validation
   - Device token generation/validation

4. **API handlers** (in dependency order)
   - Health check
   - Auth endpoints (login, logout)
   - User/identity endpoints
   - Contact endpoints
   - Location endpoints
   - Device endpoints

5. **Postgres storage implementation**
   - Reuse SQL queries where possible
   - Connection pooling configuration

6. **Firestore storage implementation**
   - Document structure mapping
   - Batch operations for locations

### 2.4 Testing Strategy

- **Unit tests**: Storage implementations with SQLite in-memory
- **Integration tests**: Full API tests against SQLite
- **Contract tests**: Validate responses match OpenAPI spec

---

## Phase 3: Go Client Library + CLI

**Goal:** Client library generated from OpenAPI spec, with CLI wrapper.

### 3.1 Client Library

Generate base client with `oapi-codegen`, then add:

```go
// pkg/client/client.go

type Client struct {
    api    *generated.ClientWithResponses
    config *Config
}

// High-level operations that combine multiple API calls
func (c *Client) Login(ctx context.Context, googleToken string) (*Session, error)
func (c *Client) RestoreIdentity(ctx context.Context, pin string) (*Identity, error)
func (c *Client) GetContacts(ctx context.Context) ([]*Contact, error)
func (c *Client) ShareLocation(ctx context.Context, location *Location) error
// ... etc
```

### 3.2 CLI Tool

Thin wrapper exposing client library functionality:

```bash
# Authentication
whereish login              # Opens browser for Google OAuth
whereish logout
whereish whoami

# Identity
whereish identity restore   # Prompts for PIN, restores identity
whereish identity backup    # Prompts for PIN, backs up identity
whereish identity reset     # Dangerous: resets identity

# Contacts
whereish contacts list
whereish contacts add <email>
whereish contacts remove <id>
whereish contacts requests list
whereish contacts requests accept <id>
whereish contacts requests decline <id>

# Locations
whereish location get                    # Get contacts' locations
whereish location share <lat> <lon>      # Share location
whereish location share --address "..."  # Geocode and share

# Devices
whereish devices list
whereish devices revoke <id>

# User data (for debugging)
whereish data get           # Fetch and decrypt user data blob
whereish data set --file    # Encrypt and upload (dangerous)
```

### 3.3 Testing with CLI

The CLI enables manual and scripted testing:

```bash
# Full flow test
whereish login
whereish identity backup    # Create identity with PIN
whereish contacts add friend@example.com
# (friend accepts)
whereish location share 47.6062 -122.3321
whereish contacts list      # Should show friend
whereish location get       # Should show friend's location (if shared)
```

---

## Phase 4: TypeScript Client Library

**Goal:** Type-safe client for browser PWA.

### 4.1 Generation

Use `openapi-typescript` to generate types, then create client:

```typescript
// client/src/index.ts

import type { paths, components } from './generated/api';

export type User = components['schemas']['User'];
export type Contact = components['schemas']['Contact'];
// ... etc

export class WhereishClient {
    constructor(private baseUrl: string, private getToken: () => string | null) {}

    async login(googleToken: string): Promise<Session> { ... }
    async getContacts(): Promise<Contact[]> { ... }
    async shareLocation(locations: EncryptedLocation[]): Promise<void> { ... }
    // ... etc
}
```

### 4.2 Encryption Integration

The TypeScript client handles encryption:

```typescript
export class WhereishClient {
    private identity: Identity | null = null;

    async restoreIdentity(pin: string): Promise<void> {
        const backup = await this.api.getIdentityBackup();
        this.identity = decryptIdentity(backup, pin);
    }

    async shareLocation(rawLocation: Location, contacts: Contact[]): Promise<void> {
        const encrypted = contacts.map(contact => ({
            toUserId: contact.id,
            blob: encryptLocation(rawLocation, this.identity, contact.publicKey)
        }));
        await this.api.postLocations(encrypted);
    }
}
```

---

## Phase 5: PWA Updates

**Goal:** Update existing PWA to use new server and TypeScript client.

### 5.1 Changes Required

1. **Replace API module** with TypeScript client
2. **Update Model** to work with new data structures
3. **Add identity management UI** (PIN entry, backup/restore)
4. **Update storage** - remove local-first patterns, use server as source of truth
5. **Simplify sync** - no more conflict resolution, server is authoritative

### 5.2 Migration Considerations

- No data migration needed (clean start per architecture doc)
- Can run new and old servers in parallel during transition
- Feature flag to switch between old and new API

---

## Success Criteria

| Phase | Criteria |
|-------|----------|
| Phase 1 | OpenAPI spec validates, covers all endpoints in architecture doc |
| Phase 2 | Server passes all integration tests, all three backends work |
| Phase 3 | CLI can complete full user journey (login → share → view) |
| Phase 4 | TypeScript client compiles, types match spec |
| Phase 5 | PWA works end-to-end with new server |

## Open Questions

1. **Session token format**: JWT vs opaque tokens?
2. **Rate limiting**: Needed for initial release?
3. **Monitoring/observability**: What metrics to expose?
4. **Deployment automation**: Terraform, Pulumi, or manual?

---

## Appendix: Code Generation Commands

```bash
# Go server and client generation
oapi-codegen -generate types,server,spec -package api api/openapi.yaml > internal/api/generated.go
oapi-codegen -generate types,client -package client api/openapi.yaml > pkg/client/generated.go

# TypeScript types generation
npx openapi-typescript api/openapi.yaml -o client/src/generated/api.ts
```
