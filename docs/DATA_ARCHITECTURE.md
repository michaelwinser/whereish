# Data Architecture

This document describes the data entities in Whereish, their storage, encryption, organization, backup/recovery, and synchronization patterns.

## Table of Contents

1. [Entity Overview](#entity-overview)
2. [Server-Side Entities](#server-side-entities)
3. [Client-Side Storage](#client-side-storage)
4. [Encryption](#encryption)
5. [Data Organization](#data-organization)
6. [Backup and Recovery](#backup-and-recovery)
7. [Synchronization Patterns](#synchronization-patterns)
8. [Code References](#code-references)

---

## Entity Overview

| Entity | Storage Location | Encrypted | Per-User | Sync Direction |
|--------|-----------------|-----------|----------|----------------|
| User Account | Server DB | No | Yes | Server → Client |
| Identity (Key Pair) | Client IndexedDB | No (at rest) | Yes | Client only (export/import) |
| Identity Backup | Server DB | AES-256-GCM (PIN) | Yes | Client → Server |
| Contacts | Server DB | No | Yes | Server ↔ Client |
| Permissions | Server DB | No | Yes (per-pair) | Client → Server |
| Encrypted Locations | Server DB | NaCl box (E2E) | Yes (per-pair) | Client → Server → Client |
| Named Locations | Client IndexedDB | No | Yes | Client only |
| Devices | Server DB | No | Yes | Server ↔ Client |
| Transfers | Server DB | Partial | Yes | Server ↔ Client |
| Session Token | Client localStorage | No | Yes | Client → Server |

---

## Server-Side Entities

The server uses SQLite with the following schema (defined in `server/app.py:184-295`).

### Users

Stores user accounts and their public encryption keys.

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | 16-char hex (8 random bytes) |
| `email` | TEXT UNIQUE | Lowercase, indexed |
| `password_hash` | TEXT | Werkzeug hash or `oauth:{google_id}` for OAuth users |
| `name` | TEXT | Display name |
| `public_key` | TEXT | Base64 X25519 public key (32 bytes) |
| `google_id` | TEXT | Google OAuth subject ID (unique where not null) |
| `encrypted_identity` | TEXT | PIN-encrypted identity backup (opaque to server) |
| `created_at` | TIMESTAMP | Account creation time |

**Encryption:** None at rest. The `encrypted_identity` field contains client-encrypted data.

**Indexes:** `idx_users_email`, `idx_users_google_id`

---

### Contacts

Tracks contact relationships between users.

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `requester_id` | TEXT FK | User who sent request |
| `recipient_id` | TEXT FK | User who received request |
| `status` | TEXT | `pending`, `accepted`, or `declined` |
| `created_at` | TIMESTAMP | Request creation time |
| `accepted_at` | TIMESTAMP | When accepted (if applicable) |

**Constraints:** `UNIQUE(requester_id, recipient_id)` - one request per direction per pair.

**Relationship Model:** Bidirectional. For A and B to be mutual contacts:
- A requests B → contacts row (A→B)
- B accepts → status = 'accepted'
- B requests A → contacts row (B→A)
- A accepts → status = 'accepted'

Both must accept for full mutual contact status.

---

### Permissions

Stores asymmetric location visibility permissions.

| Field | Type | Description |
|-------|------|-------------|
| `granter_id` | TEXT FK | User granting permission |
| `grantee_id` | TEXT FK | User receiving permission |
| `permission_level` | TEXT | Granularity level (see below) |
| `updated_at` | TIMESTAMP | Last modification time |

**Primary Key:** `(granter_id, grantee_id)`

**Permission Levels** (ordered least to most specific):

| Level | Index | Description |
|-------|-------|-------------|
| `planet` | 0 | "Planet Earth" - effectively hidden |
| `continent` | 1 | Continental region |
| `country` | 2 | Country |
| `state` | 3 | State/province |
| `county` | 4 | County/district |
| `city` | 5 | City |
| `neighborhood` | 6 | Neighborhood/suburb |
| `street` | 7 | Street level |
| `address` | 8 | Exact address |

**Two-Permission System:** Alice can grant Bob `city` level (what Bob sees of Alice) while Bob grants Alice `neighborhood` (what Alice sees of Bob). These are independent.

---

### Encrypted Locations

Stores E2E encrypted location data between user pairs.

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `from_user_id` | TEXT FK | Location sender |
| `to_user_id` | TEXT FK | Location recipient |
| `encrypted_blob` | TEXT | JSON-encoded NaCl box ciphertext |
| `updated_at` | TIMESTAMP | Last update time |

**Constraints:** `UNIQUE(from_user_id, to_user_id)` - one location per sender-recipient pair (upserted).

**Encryption:** NaCl box (X25519 + XSalsa20-Poly1305). Server cannot decrypt.

**Blob Format:**
```json
{
  "v": 1,
  "n": "<base64 nonce, 24 bytes>",
  "c": "<base64 ciphertext>"
}
```

**Staleness:** Locations older than 30 minutes are marked stale (`LOCATION_EXPIRY_MINUTES`).

---

### Devices

Tracks user devices for multi-device support.

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | 32-char hex (16 random bytes) |
| `user_id` | TEXT FK | Device owner |
| `name` | TEXT | User-friendly name |
| `platform` | TEXT | `ios`, `android`, `web`, etc. |
| `is_active` | BOOLEAN | Whether device is sharing location |
| `last_seen` | TIMESTAMP | Last activity |
| `created_at` | TIMESTAMP | Registration time |

**Constraint:** Only one active device per user at a time (enforced in code).

---

### Transfers

Manages identity transfer between devices.

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | 32-char hex |
| `code` | TEXT UNIQUE | 6-digit claim code |
| `source_user_id` | TEXT FK | User initiating transfer |
| `source_device_id` | TEXT FK | Source device |
| `target_device_id` | TEXT | Target device (set when claimed) |
| `target_device_name` | TEXT | Target device name |
| `status` | TEXT | `pending` → `claimed` → `approved` → `completed` |
| `encrypted_identity` | TEXT | PIN-encrypted identity (set on approval) |
| `expires_at` | TIMESTAMP | Expiry (10 minutes from creation) |
| `created_at` | TIMESTAMP | Creation time |

---

## Client-Side Storage

### IndexedDB: `whereish` Database

**Version:** 2
**File:** `app/storage.js`

#### Named Locations Store

Stores user-defined semantic locations (Home, Work, etc.).

```javascript
ObjectStore: 'namedLocations'
KeyPath: 'id'

Schema: {
  id: string,           // UUID
  userId: string,       // Owner user ID
  label: string,        // Display name
  latitude: number,
  longitude: number,
  radiusMeters: number, // Default 100
  visibility: {
    mode: 'private' | 'custom',
    contactIds: string[]  // Who can see when user is here
  },
  createdAt: timestamp,
  updatedAt: timestamp
}

Indexes: 'label', 'createdAt', 'userId'
```

**Default Visibility:** `{ mode: 'private', contactIds: [] }` - nobody sees by default.

#### Settings Store

Key-value storage for app settings.

```javascript
ObjectStore: 'settings'
KeyPath: 'key'

Schema: {
  key: string,
  value: any,
  updatedAt: timestamp
}
```

---

### IndexedDB: `whereish-identity` Database

**Version:** 1
**File:** `app/identity.js`

Stores the user's cryptographic identity (key pair).

```javascript
ObjectStore: 'identity'
Key: 'current'

Schema: {
  privateKey: string,  // Base64-encoded 32 bytes (X25519 secret key)
  publicKey: string,   // Base64-encoded 32 bytes (X25519 public key)
  createdAt: string    // ISO8601 timestamp
}
```

**Security Note:** IndexedDB is not encrypted at rest on most devices. The key pair is stored in plaintext in the browser's storage.

---

### localStorage

**File:** `app/api.js`

| Key | Value | Purpose |
|-----|-------|---------|
| `whereish_auth_token` | string | Session JWT for API authentication |

**Token Format:** `{user_id}:{random_hex}:{timestamp_hex}:{hmac_signature}`

---

### In-Memory Caches

| Variable | Location | Contents |
|----------|----------|----------|
| `authToken` | `app/api.js` | Current session token |
| `currentUser` | `app/api.js` | `{ id, email, name }` |
| `currentIdentity` | `app/identity.js` | `{ privateKey, publicKey }` as Uint8Arrays |

Cleared on logout.

---

## Encryption

### E2E Location Encryption (NaCl Box)

**File:** `app/crypto.js`
**Algorithm:** X25519 key exchange + XSalsa20-Poly1305 authenticated encryption
**Library:** tweetnacl-js v1.0.3 (bundled at `app/nacl-fast.min.js`)

**Key Generation:**
```javascript
const keyPair = nacl.box.keyPair();
// keyPair.secretKey: Uint8Array(32) - private key
// keyPair.publicKey: Uint8Array(32) - public key
```

**Encryption (sender → recipient):**
```javascript
// Uses sender's private key + recipient's public key
const nonce = nacl.randomBytes(24);
const ciphertext = nacl.box(message, nonce, recipientPublicKey, senderPrivateKey);
```

**Decryption (recipient):**
```javascript
// Uses recipient's private key + sender's public key
const plaintext = nacl.box.open(ciphertext, nonce, senderPublicKey, recipientPrivateKey);
```

**Properties:**
- Server cannot decrypt (lacks private keys)
- Sender authentication implicit (requires sender's private key)
- Random nonce per message (critical for security)

---

### Identity Backup Encryption (AES-256-GCM)

**File:** `app/pin-crypto.js`
**Key Derivation:** PBKDF2-SHA256, 100,000 iterations
**Encryption:** AES-256-GCM (Web Crypto API)

**Parameters:**
```javascript
PBKDF2_ITERATIONS = 100000
SALT_LENGTH = 16 bytes
IV_LENGTH = 12 bytes
KEY_LENGTH = 256 bits
```

**Encrypted File Format (v2):**
```json
{
  "version": 2,
  "type": "whereish-identity-encrypted",
  "encryption": {
    "algorithm": "AES-256-GCM",
    "kdf": "PBKDF2-SHA256",
    "iterations": 100000,
    "salt": "<base64>",
    "iv": "<base64>"
  },
  "payload": "<base64 ciphertext>",
  "account": {
    "email": "user@example.com"
  },
  "warning": "..."
}
```

**Plaintext Payload (before encryption):**
```json
{
  "identity": {
    "privateKey": "<base64>",
    "publicKey": "<base64>"
  },
  "name": "User Name",
  "created": "2024-01-01T00:00:00Z"
}
```

**Security:**
- PIN never sent to server
- PBKDF2 with 100k iterations prevents brute force
- GCM provides authenticated encryption
- Random salt and IV per encryption

---

## Data Organization

### Per-User Data

| Data | Key Field | Isolation |
|------|-----------|-----------|
| Users | `id` | One row per user |
| Contacts | `requester_id`, `recipient_id` | Per user-pair |
| Permissions | `granter_id`, `grantee_id` | Per user-pair |
| Encrypted Locations | `from_user_id`, `to_user_id` | Per user-pair |
| Devices | `user_id` | Per user |
| Named Locations | `userId` (IndexedDB) | Per user (client-side) |
| Identity | Single entry | Per browser/device |

### Data Lifecycle

```
User Registration
       │
       ▼
┌──────────────┐
│ Create User  │ ─── Server: users table
└──────────────┘
       │
       ▼
┌──────────────┐
│ Generate     │ ─── Client: IndexedDB whereish-identity
│ Key Pair     │
└──────────────┘
       │
       ▼
┌──────────────┐
│ Register     │ ─── Server: users.public_key
│ Public Key   │
└──────────────┘
       │
       ▼
┌──────────────┐
│ Add Contacts │ ─── Server: contacts, permissions tables
└──────────────┘
       │
       ▼
┌──────────────┐
│ Share        │ ─── Server: encrypted_locations table
│ Locations    │     (E2E encrypted, per-contact)
└──────────────┘
```

---

## Backup and Recovery

### Identity Backup

The user's cryptographic identity (key pair) is critical. Without it, encrypted locations cannot be decrypted.

**Backup Options:**

1. **Server Backup (Recommended)**
   - PIN-encrypted identity stored in `users.encrypted_identity`
   - Encrypted on client before upload
   - Server cannot decrypt (lacks PIN)
   - Recovery: Re-enter PIN on any device

2. **File Export**
   - PIN-encrypted JSON file (v2 format)
   - User stores file securely
   - Recovery: Import file + enter PIN

**Backup Flow:**
```
Identity (client IndexedDB)
       │
       ▼ PinCrypto.encryptIdentity(identity, pin)
       │
┌──────────────────────┐
│ Encrypted blob       │
│ (AES-256-GCM)        │
└──────────────────────┘
       │
       ├──► POST /api/identity/backup (server storage)
       │
       └──► File download (local storage)
```

**Recovery Flow:**
```
Server backup (GET /api/identity/backup)
   or
File import
       │
       ▼
┌──────────────────────┐
│ Encrypted blob       │
└──────────────────────┘
       │
       ▼ PinCrypto.decryptIdentity(blob, pin)
       │
Identity restored to IndexedDB
```

### Named Locations

**No automatic backup.** Named locations are stored only in client IndexedDB.

**Recovery:**
- Lost if browser data is cleared
- Must be manually recreated
- Future: Could add server-side encrypted backup

### Session Data

- **Auth token:** Stored in localStorage, regenerated on login
- **User data:** Fetched from server on login
- **Contacts/Permissions:** Fetched from server, authoritative copy on server

---

## Synchronization Patterns

### Server ↔ Client (Same User)

**Pull-Based:** Client fetches latest state from server.

| Data | Endpoint | Trigger |
|------|----------|---------|
| User profile | `GET /api/me` | App init, after login |
| Contacts | `GET /api/contacts/encrypted` | App init, manual refresh, polling |
| Contact requests | `GET /api/contacts/requests` | App init, manual refresh |
| Devices | `GET /api/devices` | Settings view |
| Identity backup | `GET /api/identity/backup` | New device setup |

**Push-Based:** Client sends updates to server.

| Data | Endpoint | Trigger |
|------|----------|---------|
| Location | `POST /api/location/encrypted` | Periodic (when active) |
| Permissions | `PUT /api/contacts/{id}/permission` | User action |
| Contact requests | `POST /api/contacts/request` | User action |
| Identity backup | `POST /api/identity/backup` | User action |

**Conflict Resolution:** Server is authoritative for contacts, permissions. Last-write-wins for locations.

---

### Client ↔ Client (Same User, Different Devices)

Identity must be transferred to enable E2E encryption on new devices.

**Transfer Flow:**

```
Device A (source)                    Device B (target)
      │                                    │
      │ POST /api/transfers                │
      │ ← { code: "123456" }               │
      │                                    │
      │         Display code to user       │
      │         ─────────────────────►     │
      │                                    │
      │                    POST /api/transfers/claim
      │                    { code: "123456" }
      │                                    │
      │ ← Notification: "Device B wants identity"
      │                                    │
      │ User approves on Device A          │
      │ POST /api/transfers/{id}/approve   │
      │ { encryptedIdentity }              │
      │                                    │
      │                    GET /api/transfers/{id}/receive
      │                    ← { encryptedIdentity }
      │                                    │
      │                    User enters PIN
      │                    Identity decrypted & stored
      │                                    │
      ▼                                    ▼
Both devices have same identity (key pair)
```

**After Transfer:**
- Both devices share the same key pair
- Either can decrypt locations from contacts
- Either can encrypt locations for contacts

---

### Client ↔ Client (Different Users)

Location sharing between contacts uses E2E encryption.

**Location Sharing Flow:**

```
Alice (sender)                          Bob (recipient)
      │                                      │
      │ Get Bob's public key                 │
      │ (from contacts response)             │
      │                                      │
      │ Encrypt location with:               │
      │ - Alice's private key                │
      │ - Bob's public key                   │
      │                                      │
      │ POST /api/location/encrypted         │
      │ { locations: [{ contactId: bob,      │
      │    blob: { v, n, c } }] }            │
      │                                      │
      │         Server stores blob           │
      │         ─────────────────────►       │
      │                                      │
      │                      GET /api/contacts/encrypted
      │                      ← { contacts: [{
      │                           publicKey: alice,
      │                           encryptedLocation: { blob }
      │                         }] }
      │                                      │
      │                      Decrypt with:
      │                      - Bob's private key
      │                      - Alice's public key
      │                                      │
      ▼                                      ▼
Alice's location visible to Bob (at permitted granularity)
```

**Security Properties:**
- Server only sees encrypted blobs
- Each contact gets separately encrypted copy
- Permission level applied before encryption (truncated hierarchy)
- Decryption requires both parties' keys

---

## Code References

### Server

| Component | File | Key Functions/Lines |
|-----------|------|---------------------|
| Database Schema | `server/app.py` | `init_db()` (184-295) |
| Auth Endpoints | `server/app.py` | Routes (696-920) |
| Contact Endpoints | `server/app.py` | Routes (922-1125) |
| Location Endpoints | `server/app.py` | Routes (1127-1210) |
| Device Endpoints | `server/app.py` | Routes (1212-1380) |
| Transfer Endpoints | `server/app.py` | Routes (1382-1580) |
| Identity Endpoints | `server/app.py` | Routes (1582-1700) |

### Client

| Component | File | Key Functions |
|-----------|------|---------------|
| API Client | `app/api.js` | All HTTP requests, auth management |
| E2E Crypto | `app/crypto.js` | `encryptForContact()`, `decryptFromContact()` |
| PIN Crypto | `app/pin-crypto.js` | `encryptIdentity()`, `decryptIdentity()` |
| Identity | `app/identity.js` | `create()`, `save()`, `load()`, `export*()`, `import*()` |
| Storage | `app/storage.js` | IndexedDB for named locations |
| Model | `app/model.js` | In-memory state, event emission |
| App Controller | `app/app.js` | Data flow orchestration |

### Data Flow Orchestration

| Flow | Entry Point | Files Involved |
|------|-------------|----------------|
| Login | `handleGoogleCallback()` | `app.js` → `api.js` → `identity.js` |
| Load Contacts | `initializeAuthenticatedState()` | `app.js` → `api.js` → `crypto.js` → `model.js` |
| Share Location | `handleRefreshLocation()` | `app.js` → `api.js` → `crypto.js` |
| Save Named Location | `handleSaveLocation()` | `app.js` → `storage.js` → `model.js` |
| Identity Transfer | Transfer handlers | `app.js` → `api.js` → `pin-crypto.js` → `identity.js` |

---

## Security Summary

| Threat | Mitigation |
|--------|------------|
| Server reads location | E2E encryption (NaCl box) |
| Brute force PIN | PBKDF2 with 100k iterations |
| Session hijacking | HMAC-signed tokens, 30-day expiry |
| Man-in-the-middle | HTTPS required, HSTS |
| Identity theft | Private key never leaves client (except encrypted backup) |
| Contact enumeration | Contacts require mutual acceptance |
| Location history | Only latest location stored per contact pair |

---

## Future Considerations

1. **Named Location Backup:** Currently client-only; could add encrypted server backup
2. **Key Rotation:** No current mechanism for rotating key pairs
3. **Audit Log:** No history of permission changes or access
4. **Offline Support:** Location sharing requires connectivity
5. **Group Encryption:** Current design is 1:1; groups would need different approach
