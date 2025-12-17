# New Server Architecture

This document describes the proposed new architecture for Whereish, where the server becomes the authoritative source of truth for all data, with client-side encryption protecting sensitive content.

## Design Goals

1. **Server as single source of truth** - All data lives on the server; clients sync from it
2. **End-to-end encryption** - Server stores encrypted blobs it cannot read
3. **Simple multi-device** - Login + PIN = full data restore on any device
4. **Privacy preservation** - Server knows minimal metadata; content is encrypted
5. **Simpler implementation** - One authoritative copy eliminates sync complexity

## Data Model

### Server-Visible Data

Data the server can read (needed for routing, authentication, or consent flows):

```
Users:
  id                    TEXT PRIMARY KEY    -- Unique user identifier
  email                 TEXT UNIQUE         -- Login identifier
  google_id             TEXT UNIQUE         -- OAuth subject ID (nullable)
  name                  TEXT                -- Display name
  public_key            TEXT                -- Base64 X25519 public key (others encrypt to this)
  created_at            TIMESTAMP

Contacts:
  id                    INTEGER PRIMARY KEY
  requester_id          TEXT REFERENCES users(id)
  recipient_id          TEXT REFERENCES users(id)
  status                TEXT                -- 'pending', 'accepted', 'declined'
  created_at            TIMESTAMP
  accepted_at           TIMESTAMP           -- When accepted (nullable)
  UNIQUE(requester_id, recipient_id)

Devices:
  id                    TEXT PRIMARY KEY    -- Server-issued device token
  user_id               TEXT REFERENCES users(id)
  name                  TEXT                -- User-friendly name
  platform              TEXT                -- 'ios', 'android', 'web', 'cli'
  created_at            TIMESTAMP
  last_seen             TIMESTAMP
  revoked_at            TIMESTAMP           -- Null if active, set when revoked
```

### Encrypted Data (Server Stores, Cannot Read)

#### Identity Backup

Stored in users table, encrypted with PIN-derived key:

```
encrypted_identity:
  encryption:
    algorithm           AES-256-GCM
    kdf                 PBKDF2-SHA256
    iterations          100000
    salt                Base64 (16 bytes)
    iv                  Base64 (12 bytes)
  payload               Base64 ciphertext of:
    {
      privateKey: Base64 (32 bytes),
      publicKey: Base64 (32 bytes)
    }
```

#### User Data Blob

Stored in users table, encrypted with user's identity keys (encrypt-to-self):

```
encrypted_user_data:
  version               INTEGER             -- For optimistic concurrency
  updated_at            TIMESTAMP
  blob                  Base64 ciphertext of:
    {
      namedLocations: [
        {
          id: UUID,
          label: string,
          latitude: number,
          longitude: number,
          radiusMeters: number,
          visibility: {
            mode: 'private' | 'all' | 'selected',
            contactIds: string[]
          },
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      contactPermissions: {
        [contactId]: {
          level: 'planet' | 'continent' | ... | 'address',
          updatedAt: timestamp
        }
      },
      preferences: {
        // Future: app preferences
      }
    }
```

**Encryption method:** NaCl box to self (user's public key + user's private key). This allows decryption with just the identity.

#### Encrypted Locations

Per-contact location sharing, stored in dedicated table:

```
EncryptedLocations:
  from_user_id          TEXT REFERENCES users(id)
  to_user_id            TEXT REFERENCES users(id)
  encrypted_blob        TEXT                -- NaCl box ciphertext
  updated_at            TIMESTAMP
  PRIMARY KEY (from_user_id, to_user_id)
```

**Encryption method:** NaCl box (sender's private key + recipient's public key). Provides:
- Confidentiality: Only recipient can decrypt
- Authentication: Only sender could have created it (implicit in NaCl box)

**Blob contents (before encryption):**
```json
{
  "hierarchy": {
    "planet": "Earth",
    "continent": "North America",
    "country": "United States",
    "state": "Washington",
    "city": "Seattle"
    // Truncated based on permission level
  },
  "namedLocation": "Coffee Shop",  // If at a named location visible to this contact
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Encryption Architecture

### Key Hierarchy

```
PIN (user memorized)
  │
  ├─► PBKDF2 (100k iterations) ─► AES key
  │                                  │
  │                                  └─► Encrypts: Identity (keypair)
  │
Identity Keypair (X25519)
  │
  ├─► Public Key ─► Stored on server (plaintext)
  │                 Used by contacts to encrypt locations TO this user
  │
  ├─► Private Key ─► Stored encrypted (by PIN)
  │                  Used to decrypt:
  │                    - Locations FROM contacts
  │                    - User data blob (encrypted to self)
  │
  └─► Public + Private ─► Used to encrypt:
                           - User data blob (to self)
                           - Locations TO contacts
```

### What the Server Knows

| Data | Server Visibility |
|------|-------------------|
| User exists, email, name | ✅ Full |
| User's public key | ✅ Full (needed for encryption) |
| Who is contacts with whom | ✅ Full (needed for routing) |
| Contact request status | ✅ Full (needed for consent flow) |
| Device list | ✅ Full (needed for revocation) |
| Permission levels | ❌ Encrypted in user data blob |
| Named locations | ❌ Encrypted in user data blob |
| Location shared with contact | ❌ Encrypted in location blob |
| Identity private key | ❌ Encrypted with PIN |

## Synchronization

### Client Startup Flow

```
1. User opens app
2. If no local identity cached:
   a. Prompt for PIN
   b. GET /api/identity/backup
   c. Decrypt identity with PIN
   d. Cache identity in memory (or secure storage)
3. GET /api/me (validates session, returns user info)
4. GET /api/user-data (returns encrypted_user_data blob)
5. Decrypt user data with identity
6. GET /api/contacts (returns contact list + their public keys)
7. GET /api/locations (returns encrypted location blobs from contacts)
8. Decrypt each location with identity + sender's public key
9. App is now fully synced
```

### Update Flows

**Updating user data (named locations, permissions, preferences):**
```
1. Client modifies local state
2. Serialize to JSON
3. Encrypt with identity (to self)
4. PUT /api/user-data { version: N, blob: "..." }
5. Server checks version matches current
   - If match: update, increment version, return success
   - If mismatch: return conflict with current version
6. On conflict: client fetches current, prompts user to resolve
```

**Sharing location:**
```
1. Client gets current position + geocodes to hierarchy
2. For each contact:
   a. Look up permission level (from decrypted user data)
   b. Truncate hierarchy to permitted level
   c. Check named location visibility
   d. Encrypt with (my private key, contact's public key)
3. POST /api/locations { locations: [{contactId, blob}, ...] }
```

### Conflict Resolution

**Optimistic concurrency** with version numbers:
- Each encrypted blob has a `version` field
- Updates must specify expected version
- Server rejects if version mismatch
- Client handles conflict:
  - For minor conflicts: auto-merge if possible
  - For major conflicts: prompt user ("Another device made changes...")

**Offline behavior:**
- Read-only initially (simplest)
- Future: queue writes, resolve conflicts on reconnect

## Device Management

### Device Registration

```
POST /api/devices
{
  name: "My iPhone",
  platform: "ios"
}
Response: {
  deviceId: "abc123",
  deviceToken: "xyz789"  // Used for subsequent auth
}
```

### Device Revocation

```
DELETE /api/devices/{deviceId}
```

- Server sets `revoked_at` timestamp
- Revoked device's token rejected on subsequent requests
- Device can no longer fetch new data

**Limitations:**
- Revoked device retains locally cached data
- Full protection requires identity key rotation (future feature)

### Device Tokens

- Server-issued on device registration
- Included in auth header for API calls
- Format: `Authorization: Bearer {userToken}:{deviceToken}` (or combined)
- Server validates both user and device are valid and not revoked

## Account Recovery

### PIN Recovery: Not Possible

By design, there is no PIN recovery. The PIN encrypts the identity, and the server never sees it.

### Account Reset

If user loses PIN:
1. User requests account reset
2. Server deletes: encrypted_identity, encrypted_user_data, encrypted_locations (from this user)
3. Server preserves: email, contacts (relationships), devices
4. User creates new identity (new keypair)
5. User must re-share public key with contacts (or contacts re-add)

**Trade-off:** Data loss vs. security. For a privacy-focused app, this is acceptable.

## API Overview

### Authentication Endpoints
- `POST /api/auth/google` - OAuth login
- `POST /api/auth/logout` - End session
- `DELETE /api/auth/account` - Delete account

### Identity Endpoints
- `GET /api/identity/backup` - Fetch encrypted identity
- `PUT /api/identity/backup` - Store encrypted identity
- `POST /api/identity/public-key` - Register public key

### User Data Endpoints
- `GET /api/user-data` - Fetch encrypted user data blob
- `PUT /api/user-data` - Update encrypted user data blob (with version)

### Contact Endpoints
- `GET /api/contacts` - List contacts with public keys
- `POST /api/contacts/request` - Send contact request
- `GET /api/contacts/requests` - List pending requests
- `POST /api/contacts/requests/{id}/accept` - Accept request
- `POST /api/contacts/requests/{id}/decline` - Decline request
- `DELETE /api/contacts/{id}` - Remove contact

### Location Endpoints
- `GET /api/locations` - Fetch encrypted locations from contacts
- `POST /api/locations` - Publish encrypted locations to contacts

### Device Endpoints
- `GET /api/devices` - List devices
- `POST /api/devices` - Register device
- `DELETE /api/devices/{id}` - Revoke device

## Migration from Current Architecture

**Not required.** Current system has no active users. Clean implementation preferred.

Key differences from current:
- Permission levels move from server table to encrypted blob
- Named locations move from client IndexedDB to encrypted blob
- Single `encrypted_user_data` blob replaces multiple storage locations
- Devices get explicit tokens for revocation support

## Security Properties

| Property | How Achieved |
|----------|--------------|
| Location privacy from server | E2E encryption (NaCl box) |
| Location authenticity | NaCl box provides implicit signing |
| Identity protection | PIN + PBKDF2 + AES-256-GCM |
| Device revocation | Server-issued tokens |
| Forward secrecy | Not provided (would require key rotation) |
| Metadata privacy | Partial (server sees who contacts whom, not content) |

## Future Considerations

1. **Key rotation** - Allow users to generate new keypair, re-encrypt data, notify contacts
2. **Offline writes** - Queue changes locally, sync with conflict resolution on reconnect
3. **User-signed device certificates** - Remove server from device trust model
4. **Granular blobs** - Split user data into separate blobs if update patterns warrant
5. **Location history** - Optional encrypted history (currently only latest)
