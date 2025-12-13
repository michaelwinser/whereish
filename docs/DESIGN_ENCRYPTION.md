# Encryption Design Document

**Status:** Draft
**Created:** 2025-12-13
**PRD:** PRD_ENCRYPTION.md
**Related:** Issue #30, DESIGN.md

---

## 1. Overview

This document explores implementation options for end-to-end encrypted location sharing in Whereish. It evaluates existing solutions against our requirements and proposes an architecture for Phase 1.

**Key constraint from PRD:** "Of all the things to DIY, encryption is not the one." We adopt existing, vetted implementations.

---

## 2. Requirements Summary (from PRD)

### Must Have (Phase 1)
- Location data encrypted end-to-end
- Per-contact encryption (each contact gets data encrypted for them)
- Private/public identity model (exportable files)
- Works in browser (Web Crypto API compatible)
- Uses audited, maintained libraries

### Desirable Properties
| Property | Priority |
|----------|----------|
| Forward secrecy | High (if achievable) |
| Future secrecy | High (if achievable) |
| Works offline | Medium |
| Small message size | Medium |
| Browser-compatible | Required |
| Audited implementation | Required |

### Explicitly Deferred
- Key verification UI (safety numbers)
- Complex recovery flows
- Multi-device sync (beyond file import)
- Forward secrecy (if too complex for Phase 1)

---

## 3. Solution Space

### 3.1 Full Protocol Adoption

| Solution | Description | Fit |
|----------|-------------|-----|
| **Matrix (Olm/Megolm)** | E2E encryption for Matrix protocol | Over-engineered for our use case |
| **Signal Protocol** | Double ratchet, forward secrecy | Complex; designed for messaging |
| **MLS (Message Layer Security)** | IETF standard for group messaging | Emerging; not mature in JS |

**Assessment:** These are designed for real-time messaging with complex session management. Our use case (periodic location updates) is simpler. Adopting a full protocol brings complexity we don't need.

### 3.2 Cryptographic Libraries

| Library | Description | Browser Support | Audited |
|---------|-------------|-----------------|---------|
| **libsodium.js** | Port of libsodium to JS | ✅ Yes | ✅ Yes |
| **tweetnacl-js** | Minimal NaCl implementation | ✅ Yes | ✅ Yes |
| **Web Crypto API** | Browser native | ✅ Yes | ✅ (browser) |
| **noble-ed25519** | Modern JS implementation | ✅ Yes | ✅ Yes |

**Assessment:** These provide cryptographic primitives we can compose. Less complex than full protocols, more flexible, still secure if used correctly.

### 3.3 Recommendation: tweetnacl-js + Web Crypto API

**Why tweetnacl-js:**
- Minimal (< 20KB)
- Audited
- Implements NaCl's proven cryptographic choices
- `box` (public-key encryption) is exactly what we need
- Used by many production applications

**Why Web Crypto API:**
- Native browser performance for key operations
- Secure key storage options
- Hardware-backed where available

**Hybrid approach:**
- Use tweetnacl-js for encryption/decryption (simpler API)
- Use Web Crypto API for key generation and storage where beneficial

---

## 4. Cryptographic Design

### 4.1 Identity (Key Pair)

Each Whereish identity is an **X25519 key pair**:
- **Private key:** 32 bytes, kept secret
- **Public key:** 32 bytes, shareable

```
Identity = {
    privateKey: Uint8Array(32),  // SECRET - never leaves device (except export)
    publicKey: Uint8Array(32)    // Shareable - this is your "public identity"
}
```

**Why X25519:**
- Modern elliptic curve, widely vetted
- Small keys (32 bytes)
- Fast operations
- Supported by tweetnacl (`nacl.box.keyPair()`)

### 4.2 Encrypting Location Data

When Alice shares her location with Bob:

```
1. Alice has: her private key, Bob's public key, location data
2. Generate random nonce (24 bytes)
3. Encrypt: ciphertext = nacl.box(message, nonce, bobPublicKey, alicePrivateKey)
4. Send to server: { nonce, ciphertext, forContact: bob_id }
```

When Bob retrieves Alice's location:

```
1. Bob has: his private key, Alice's public key, { nonce, ciphertext }
2. Decrypt: message = nacl.box.open(ciphertext, nonce, alicePublicKey, bobPrivateKey)
3. Parse location data from message
```

**Properties:**
- Server sees only `{ nonce, ciphertext }` - cannot decrypt
- Only Bob (with his private key) can decrypt
- Alice's signature is implicit (authenticated encryption)

### 4.3 Per-Contact Permission Levels

Alice has different permission levels for different contacts:
- Bob: city level
- Carol: street level

**Implementation:**

```javascript
// Alice publishing location
for (const contact of contacts) {
    const permissionLevel = getPermissionLevel(contact);
    const filteredLocation = filterLocationToLevel(fullLocation, permissionLevel);
    const encrypted = encryptForContact(filteredLocation, contact.publicKey);
    await publishEncryptedLocation(contact.id, encrypted);
}
```

**Result:** Server stores one encrypted blob per contact. Each blob contains only what that contact is allowed to see.

### 4.4 Message Format

```javascript
// Plaintext (before encryption)
{
    version: 1,
    timestamp: "2025-12-13T18:00:00Z",
    location: {
        // Only fields allowed by permission level
        city: "Seattle",
        state: "Washington",
        // ... etc based on permission
    },
    place: {
        // Named location if visible to this contact
        name: "Home",
        // or null if not visible
    }
}

// Encrypted blob (stored on server)
{
    v: 1,                          // Format version
    n: "base64-encoded-nonce",     // 24 bytes
    c: "base64-encoded-ciphertext" // Variable length
}
```

---

## 5. Identity File Formats

### 5.1 Private Identity File

Contains everything needed to restore a Whereish identity:

```javascript
{
    version: 1,
    type: "whereish-private-identity",
    created: "2025-12-13T18:00:00Z",
    identity: {
        privateKey: "base64-encoded-32-bytes",
        publicKey: "base64-encoded-32-bytes"
    },
    // Optional: account metadata for convenience
    account: {
        email: "alice@example.com",
        name: "Alice"
    },
    warning: "KEEP SECRET. Anyone with this file can take over your Whereish account."
}
```

**File extension:** `.whereish-identity` or `.json`

**QR Code:** Same JSON, encoded as QR. May need compression for large QR.

### 5.2 Public Identity File

Contains only what's needed to connect with someone:

```javascript
{
    version: 1,
    type: "whereish-public-identity",
    publicKey: "base64-encoded-32-bytes",
    // Optional: helpful metadata
    name: "Alice",
    created: "2025-12-13T18:00:00Z"
}
```

**Also expressible as:**
- URL: `https://whereish.app/connect/BASE64_PUBLIC_KEY`
- QR Code: The URL or JSON

---

## 6. Key Storage on Device

### 6.1 Options

| Storage | Security | Persistence | Browser Support |
|---------|----------|-------------|-----------------|
| **localStorage** | Low (accessible to JS) | Persistent | ✅ All |
| **IndexedDB** | Low (accessible to JS) | Persistent | ✅ All |
| **Web Crypto (non-extractable)** | High (key in secure enclave) | Session only | ✅ Modern |
| **Web Crypto + IndexedDB** | Medium (encrypted at rest) | Persistent | ✅ Modern |

### 6.2 Recommendation: IndexedDB with Encryption

Store keys in IndexedDB, encrypted with a key derived from user's password:

```javascript
// On account creation
const identity = nacl.box.keyPair();
const storageKey = await deriveKey(password);  // PBKDF2 or similar
const encryptedIdentity = encrypt(identity, storageKey);
await indexedDB.put('identity', encryptedIdentity);

// On login
const encryptedIdentity = await indexedDB.get('identity');
const storageKey = await deriveKey(password);
const identity = decrypt(encryptedIdentity, storageKey);
```

**Trade-off:** If user forgets password, they can't decrypt local identity. But they can import from their exported private identity file.

### 6.3 Alternative: Unencrypted IndexedDB (Simpler)

For Phase 1, we could store keys unencrypted in IndexedDB:

**Pros:**
- Simpler implementation
- No password-based key derivation
- Faster startup

**Cons:**
- Any JS on the page could read keys
- XSS vulnerability would be catastrophic

**Assessment:** Acceptable for Phase 1 if we trust our own code and have strong CSP. Can upgrade to encrypted storage later.

---

## 7. Secure Storage and Biometrics (Analysis)

### 7.1 The Question

Can a PWA take advantage of a phone's secure secrets storage (iOS Keychain, Android Keystore) and biometric unlock (Face ID, Touch ID)?

### 7.2 Current State (2025)

| Capability | PWA Support | Notes |
|------------|-------------|-------|
| Biometric login (passkeys) | ✅ Yes | WebAuthn/passkeys work well |
| Secure enclave for auth | ✅ Yes | Passkey private keys live in secure hardware |
| Arbitrary keys in secure enclave | ❌ No | WebAuthn only stores its own passkeys |
| Biometric unlock for our encryption keys | ❌ No | [Open W3C issue](https://github.com/w3c/webcrypto/issues/352) - not implemented |
| Biometric-gated IndexedDB | ❌ No | No API exists |

### 7.3 The Gap

WebAuthn/Passkeys have a "monopoly" on biometric and secure enclave access in browsers. You can use them to *authenticate* (replace passwords with Face ID), but you cannot use them to *protect arbitrary secrets* like our Whereish encryption keys.

**What passkeys provide:**
- Replace password login with biometrics
- Passkey private key stored in device secure enclave
- Cross-device sync via iCloud Keychain / Google Password Manager

**What passkeys don't provide:**
- Storage for our Whereish encryption keys
- Biometric unlock for our identity file
- Hardware protection for arbitrary secrets

### 7.4 Decision

**Defer passkey and secure storage features until native app.**

Rationale:
- PWA cannot use secure hardware for our keys regardless of passkey adoption
- Adding passkey login improves auth UX but doesn't solve key storage
- Native apps (iOS/Android) can use Keychain/Keystore with biometric protection
- Complexity not justified until we have native app anyway

### 7.5 Phase Roadmap

| Phase | Key Storage | Authentication |
|-------|-------------|----------------|
| **Phase 1 (PWA)** | IndexedDB (unencrypted) | Email/password |
| **Phase 2 (PWA)** | IndexedDB (password-encrypted) | Email/password |
| **Future (Native)** | Keychain/Keystore + biometrics | Passkeys + biometrics |

### 7.6 References

- [Web Crypto Biometrics Issue #352](https://github.com/w3c/webcrypto/issues/352)
- [Secure Enclave in WebAuthn](https://www.corbado.com/glossary/secure-enclave)
- [Keychain vs Secure Enclave](https://medium.com/@amitaswal87/keychain-vs-secure-enclave-a-complete-practical-guide-for-ios-developers-9b2c04ba7a6a)

---

## 8. Server Changes

### 8.1 New Data Model

```sql
-- Store public keys
ALTER TABLE users ADD COLUMN public_key TEXT;

-- Store encrypted location blobs per contact
CREATE TABLE encrypted_locations (
    id INTEGER PRIMARY KEY,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    encrypted_blob TEXT NOT NULL,  -- JSON: {v, n, c}
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id),
    UNIQUE(from_user_id, to_user_id)
);
```

### 8.2 API Changes

**New endpoints:**

```
POST /api/identity/public-key
    Request: { publicKey: "base64..." }
    Response: { success: true }
    Purpose: Register public key on account creation

GET /api/contacts/{id}/public-key
    Response: { publicKey: "base64...", name: "Bob" }
    Purpose: Get contact's public key for encryption

POST /api/location/encrypted
    Request: { locations: [{ contactId, encryptedBlob }] }
    Response: { success: true }
    Purpose: Publish encrypted location for each contact

GET /api/contacts/locations
    Response: { contacts: [{ id, name, encryptedBlob, updatedAt }] }
    Purpose: Get encrypted locations from contacts
```

**Deprecated (after migration):**
- `POST /api/location` (plaintext)
- `GET /api/contacts` with plaintext location data

### 8.3 Server Cannot Read Locations

The server:
- Stores `encrypted_blob` as opaque data
- Never sees plaintext locations
- Cannot determine what permission level was used
- Only knows: "Alice shared something with Bob at time T"

---

## 9. Client Changes

### 9.1 New Modules

```
app/
├── crypto.js        # Encryption/decryption functions
├── identity.js      # Identity management (create, export, import)
└── ... existing files
```

### 9.2 crypto.js

```javascript
const Crypto = (function() {
    'use strict';

    // Generate new identity
    function generateIdentity() {
        const keyPair = nacl.box.keyPair();
        return {
            privateKey: keyPair.secretKey,
            publicKey: keyPair.publicKey
        };
    }

    // Encrypt location for a contact
    function encryptForContact(locationData, contactPublicKey, myPrivateKey) {
        const message = new TextEncoder().encode(JSON.stringify(locationData));
        const nonce = nacl.randomBytes(24);
        const ciphertext = nacl.box(message, nonce, contactPublicKey, myPrivateKey);

        return {
            v: 1,
            n: base64Encode(nonce),
            c: base64Encode(ciphertext)
        };
    }

    // Decrypt location from a contact
    function decryptFromContact(encryptedBlob, contactPublicKey, myPrivateKey) {
        const nonce = base64Decode(encryptedBlob.n);
        const ciphertext = base64Decode(encryptedBlob.c);
        const message = nacl.box.open(ciphertext, nonce, contactPublicKey, myPrivateKey);

        if (!message) {
            throw new Error('Decryption failed');
        }

        return JSON.parse(new TextDecoder().decode(message));
    }

    return { generateIdentity, encryptForContact, decryptFromContact };
})();
```

### 9.3 identity.js

```javascript
const Identity = (function() {
    'use strict';

    let currentIdentity = null;

    // Create new identity
    async function create() {
        currentIdentity = Crypto.generateIdentity();
        await Storage.saveIdentity(currentIdentity);
        return currentIdentity;
    }

    // Load from storage
    async function load() {
        currentIdentity = await Storage.loadIdentity();
        return currentIdentity;
    }

    // Export private identity file
    function exportPrivate(account) {
        return {
            version: 1,
            type: "whereish-private-identity",
            created: new Date().toISOString(),
            identity: {
                privateKey: base64Encode(currentIdentity.privateKey),
                publicKey: base64Encode(currentIdentity.publicKey)
            },
            account: {
                email: account.email,
                name: account.name
            },
            warning: "KEEP SECRET. Anyone with this file can take over your Whereish account."
        };
    }

    // Export public identity
    function exportPublic(name) {
        return {
            version: 1,
            type: "whereish-public-identity",
            publicKey: base64Encode(currentIdentity.publicKey),
            name: name,
            created: new Date().toISOString()
        };
    }

    // Import private identity
    async function importPrivate(fileContent) {
        const data = JSON.parse(fileContent);
        if (data.type !== "whereish-private-identity") {
            throw new Error("Invalid identity file");
        }
        currentIdentity = {
            privateKey: base64Decode(data.identity.privateKey),
            publicKey: base64Decode(data.identity.publicKey)
        };
        await Storage.saveIdentity(currentIdentity);
        return data.account;
    }

    return { create, load, exportPrivate, exportPublic, importPrivate, getCurrent: () => currentIdentity };
})();
```

---

## 10. Migration Strategy

### 10.1 Phases

**Phase A: Add encryption infrastructure**
- Add tweetnacl-js dependency
- Implement crypto.js, identity.js
- Add server endpoints (new, don't break old)
- Add public_key column to users

**Phase B: New accounts use encryption**
- New accounts generate identity on creation
- New accounts prompted to export private identity
- New accounts use encrypted location sharing
- Existing accounts continue using plaintext

**Phase C: Migrate existing accounts**
- On login, existing accounts prompted to upgrade
- Generate identity, export it, register public key
- Start using encrypted endpoints
- Keep plaintext for contacts who haven't upgraded

**Phase D: Remove plaintext**
- All accounts upgraded
- Remove plaintext endpoints
- Remove plaintext location storage

### 10.2 Backward Compatibility

During migration, a user may have:
- Some contacts using encryption
- Some contacts using plaintext (not yet upgraded)

**Solution:** Publish both encrypted and plaintext until all contacts upgrade:

```javascript
// During migration period
for (const contact of contacts) {
    if (contact.hasPublicKey) {
        await publishEncrypted(contact, location);
    } else {
        await publishPlaintext(contact, location);
    }
}
```

---

## 11. Detecting Second Device

### 11.1 Problem

User logs in on Device B but identity is on Device A.

### 11.2 Detection

On login, server checks:
- Does this account have a registered public key?
- Is the client providing that public key?

If account has public key but client doesn't have it:

```
Server: "This account has an existing Whereish identity.
         Do you want to import it, or create a new one (loses contacts)?"
```

### 11.3 Implementation

```javascript
// Client login flow
const storedIdentity = await Storage.loadIdentity();
const loginResponse = await API.login(email, password, storedIdentity?.publicKey);

if (loginResponse.identityMismatch) {
    // Show modal: "Your identity is on another device"
    // Options: Import identity file, Create new identity
}
```

---

## 12. Security Considerations

### 12.1 Threats Mitigated

| Threat | Mitigation |
|--------|------------|
| Server reads locations | Encrypted; server has no keys |
| Database breach | Encrypted blobs worthless without keys |
| MITM on API | HTTPS + encryption; even if TLS broken, data encrypted |
| XSS reads locations | Attacker would need to extract keys too |

### 12.2 Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| XSS extracts keys | High | Strong CSP, encrypted key storage (Phase 2) |
| Compromised device | High | Out of scope (device security) |
| User shares private identity | Medium | Clear warnings in UX |
| Nonce reuse | High | Always use `nacl.randomBytes()` |

### 12.3 What We're NOT Doing (Phase 1)

- Forward secrecy (would need ratcheting)
- Key verification UI (trust on first use)
- Encrypted key storage (keys in IndexedDB)
- Protection against compromised client code

---

## 13. Dependencies

### 13.1 New Dependencies

```json
// package.json
{
    "dependencies": {
        "tweetnacl": "^1.0.3",
        "tweetnacl-util": "^0.15.1"
    }
}
```

**Size impact:** ~20KB minified

### 13.2 Alternative: Load from CDN

```html
<script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js"></script>
```

**Trade-off:** CDN dependency vs bundle size

---

## 14. Testing Strategy

### 14.1 Unit Tests (crypto.js)

```javascript
test('encrypt and decrypt round trip', () => {
    const alice = Crypto.generateIdentity();
    const bob = Crypto.generateIdentity();
    const location = { city: "Seattle" };

    const encrypted = Crypto.encryptForContact(location, bob.publicKey, alice.privateKey);
    const decrypted = Crypto.decryptFromContact(encrypted, alice.publicKey, bob.privateKey);

    expect(decrypted).toEqual(location);
});

test('wrong key fails to decrypt', () => {
    const alice = Crypto.generateIdentity();
    const bob = Crypto.generateIdentity();
    const eve = Crypto.generateIdentity();

    const encrypted = Crypto.encryptForContact({ city: "Seattle" }, bob.publicKey, alice.privateKey);

    expect(() => {
        Crypto.decryptFromContact(encrypted, alice.publicKey, eve.privateKey);
    }).toThrow();
});
```

### 14.2 Integration Tests

- Create account → identity generated
- Export private identity → valid JSON, can reimport
- Add contact → public keys exchanged
- Share location → server receives encrypted blob
- View contact → location decrypted correctly
- Second device → warning shown

### 14.3 Security Tests

- Verify server cannot decrypt stored blobs
- Verify different contacts get different ciphertexts
- Verify nonces are unique per encryption

---

## 15. Open Questions

1. **Bundle or CDN for tweetnacl?**
   - Recommendation: Bundle for reliability

2. **Encrypt keys in IndexedDB?**
   - Recommendation: Phase 1 no, Phase 2 yes

3. **What if contact changes their public key?**
   - Need to re-encrypt next location update
   - Should we notify user? (Phase 2)

4. **QR code size for private identity?**
   - JSON might be too large
   - Could use compressed format

5. **How to handle failed decryption?**
   - Show error? Show "encrypted" placeholder?
   - Recommendation: Show "Unable to decrypt - contact may have changed their identity"

---

## 16. Implementation Plan

### Phase 1A: Foundation (1-2 days)
- [ ] Add tweetnacl dependency
- [ ] Create crypto.js module
- [ ] Create identity.js module
- [ ] Unit tests for crypto operations

### Phase 1B: Server Changes (1-2 days)
- [ ] Add public_key column
- [ ] Add encrypted_locations table
- [ ] New API endpoints
- [ ] Server tests

### Phase 1C: Client Integration (2-3 days)
- [ ] Identity creation on signup
- [ ] Public key registration
- [ ] Export identity UI
- [ ] Import identity UI
- [ ] Encrypted location publishing
- [ ] Encrypted location receiving

### Phase 1D: Migration Support (1-2 days)
- [ ] Detect existing vs new accounts
- [ ] Upgrade flow for existing accounts
- [ ] Dual publish (encrypted + plaintext) during migration
- [ ] Second device detection

### Phase 1E: Testing & Polish (1-2 days)
- [ ] Integration tests
- [ ] Security review
- [ ] UX polish
- [ ] Documentation

**Total estimate:** 6-11 days

---

## 17. References

- [TweetNaCl.js Documentation](https://tweetnacl.js.org/)
- [NaCl: Networking and Cryptography library](https://nacl.cr.yp.to/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Signal Protocol](https://signal.org/docs/) (reference, not used)
- PRD_ENCRYPTION.md (requirements)

---

*This design implements Phase 1 of PRD_ENCRYPTION.md. Forward secrecy, key verification, and advanced recovery are deferred to future phases.*
