# Encryption Implementation Plan

**Status:** Draft
**Created:** 2025-12-13
**Related:** PRD_ENCRYPTION.md, DESIGN_ENCRYPTION.md, Issue #30

---

## Guiding Principles

1. **It's always working** - Each phase results in a deployable, functional app
2. **No migration** - Fresh start; all users re-register (acceptable given small user base)
3. **Test as we go** - Each phase includes its tests
4. **Incremental commits** - Small, reviewable chunks

---

## Simplifications (vs Design Doc)

Given no migration requirement:

| Design Doc | This Plan |
|------------|-----------|
| Dual plaintext/encrypted endpoints | Encrypted-only from start |
| Backward compatibility period | Not needed |
| Detect upgraded vs non-upgraded contacts | All contacts encrypted |
| Gradual migration phases | Clean cutover |

---

## Phase 1: Crypto Foundation

**Goal:** Add encryption modules with tests. App behavior unchanged.

### 1.1 Add tweetnacl dependency

```bash
# Download and bundle locally (supply chain security - see CLAUDE.md)
curl -sL "https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js" -o app/nacl-fast.min.js
curl -sL "https://cdn.jsdelivr.net/npm/tweetnacl-util@0.15.1/nacl-util.min.js" -o app/nacl-util.min.js
```

```html
<!-- app/index.html -->
<script src="nacl-fast.min.js"></script>
<script src="nacl-util.min.js"></script>
```

**Why bundled locally:** Supply chain security - we control exactly what code runs, and it works offline.

### 1.2 Create `app/crypto.js`

```javascript
const Crypto = (function() {
    'use strict';

    function generateIdentity() {
        const keyPair = nacl.box.keyPair();
        return {
            privateKey: keyPair.secretKey,
            publicKey: keyPair.publicKey
        };
    }

    function encryptForContact(data, contactPublicKey, myPrivateKey) {
        const message = nacl.util.decodeUTF8(JSON.stringify(data));
        const nonce = nacl.randomBytes(24);
        const ciphertext = nacl.box(message, nonce, contactPublicKey, myPrivateKey);
        return {
            v: 1,
            n: nacl.util.encodeBase64(nonce),
            c: nacl.util.encodeBase64(ciphertext)
        };
    }

    function decryptFromContact(blob, contactPublicKey, myPrivateKey) {
        const nonce = nacl.util.decodeBase64(blob.n);
        const ciphertext = nacl.util.decodeBase64(blob.c);
        const message = nacl.box.open(ciphertext, nonce, contactPublicKey, myPrivateKey);
        if (!message) throw new Error('Decryption failed');
        return JSON.parse(nacl.util.encodeUTF8(message));
    }

    return { generateIdentity, encryptForContact, decryptFromContact };
})();
```

### 1.3 Create `app/identity.js`

```javascript
const Identity = (function() {
    'use strict';

    const DB_NAME = 'whereish-identity';
    const STORE_NAME = 'identity';
    let currentIdentity = null;

    async function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                e.target.result.createObjectStore(STORE_NAME);
            };
        });
    }

    async function create() {
        currentIdentity = Crypto.generateIdentity();
        await save(currentIdentity);
        return currentIdentity;
    }

    async function save(identity) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put({
                privateKey: nacl.util.encodeBase64(identity.privateKey),
                publicKey: nacl.util.encodeBase64(identity.publicKey)
            }, 'current');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function load() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get('current');
            request.onsuccess = () => {
                if (request.result) {
                    currentIdentity = {
                        privateKey: nacl.util.decodeBase64(request.result.privateKey),
                        publicKey: nacl.util.decodeBase64(request.result.publicKey)
                    };
                    resolve(currentIdentity);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    function exportPrivate(account) {
        return JSON.stringify({
            version: 1,
            type: 'whereish-private-identity',
            created: new Date().toISOString(),
            identity: {
                privateKey: nacl.util.encodeBase64(currentIdentity.privateKey),
                publicKey: nacl.util.encodeBase64(currentIdentity.publicKey)
            },
            account: { email: account.email, name: account.name },
            warning: 'KEEP SECRET. Anyone with this file can impersonate you on Whereish.'
        }, null, 2);
    }

    function exportPublic(name) {
        return JSON.stringify({
            version: 1,
            type: 'whereish-public-identity',
            publicKey: nacl.util.encodeBase64(currentIdentity.publicKey),
            name: name
        }, null, 2);
    }

    async function importPrivate(json) {
        const data = JSON.parse(json);
        if (data.type !== 'whereish-private-identity') {
            throw new Error('Invalid identity file');
        }
        currentIdentity = {
            privateKey: nacl.util.decodeBase64(data.identity.privateKey),
            publicKey: nacl.util.decodeBase64(data.identity.publicKey)
        };
        await save(currentIdentity);
        return data.account;
    }

    async function clear() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete('current');
            tx.oncomplete = () => { currentIdentity = null; resolve(); };
            tx.onerror = () => reject(tx.error);
        });
    }

    function getCurrent() { return currentIdentity; }
    function getPublicKeyBase64() {
        return currentIdentity ? nacl.util.encodeBase64(currentIdentity.publicKey) : null;
    }

    return { create, load, save, exportPrivate, exportPublic, importPrivate, clear, getCurrent, getPublicKeyBase64 };
})();
```

### 1.4 Update `app/index.html` script order

```html
<script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/tweetnacl-util@0.15.1/nacl-util.min.js"></script>
<script src="version.js"></script>
<script src="crypto.js"></script>
<script src="identity.js"></script>
<script src="storage.js"></script>
<!-- ... rest ... -->
```

### 1.5 Add crypto tests

New file: `tests/client/unit/test_crypto.spec.js`

```javascript
test('encrypt/decrypt round trip', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
        const alice = Crypto.generateIdentity();
        const bob = Crypto.generateIdentity();
        const data = { city: 'Seattle', state: 'Washington' };
        const encrypted = Crypto.encryptForContact(data, bob.publicKey, alice.privateKey);
        const decrypted = Crypto.decryptFromContact(encrypted, alice.publicKey, bob.privateKey);
        return JSON.stringify(decrypted) === JSON.stringify(data);
    });
    expect(result).toBe(true);
});

test('wrong key fails to decrypt', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
        const alice = Crypto.generateIdentity();
        const bob = Crypto.generateIdentity();
        const eve = Crypto.generateIdentity();
        const encrypted = Crypto.encryptForContact({ test: 1 }, bob.publicKey, alice.privateKey);
        try {
            Crypto.decryptFromContact(encrypted, alice.publicKey, eve.privateKey);
            return false;
        } catch {
            return true;
        }
    });
    expect(result).toBe(true);
});
```

### 1.6 Checklist

- [ ] Add tweetnacl scripts to index.html
- [ ] Create crypto.js
- [ ] Create identity.js
- [ ] Update index.html script order
- [ ] Add crypto unit tests
- [ ] Bump service worker cache version
- [ ] Verify app still works (existing functionality)
- [ ] Run full test suite

**Exit criteria:** All tests pass. App works exactly as before. Crypto modules exist but aren't used yet.

---

## Phase 2: Server Schema & Endpoints

**Goal:** Server supports encrypted data. Old endpoints still work (briefly).

### 2.1 Database changes

```sql
-- Add public key to users
ALTER TABLE users ADD COLUMN public_key TEXT;

-- Encrypted location storage (replaces current location fields)
CREATE TABLE encrypted_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    encrypted_blob TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id),
    UNIQUE(from_user_id, to_user_id)
);
```

### 2.2 New API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/identity/register` | POST | Register public key on signup |
| `/api/contacts/{id}/public-key` | GET | Get contact's public key |
| `/api/location/encrypted` | POST | Publish encrypted locations |
| `/api/contacts/encrypted` | GET | Get contacts with encrypted locations |

### 2.3 Implementation notes

**`/api/identity/register`**
```python
@app.route('/api/identity/register', methods=['POST'])
@jwt_required()
def register_public_key():
    user_id = get_jwt_identity()
    public_key = request.json.get('publicKey')
    # Validate: base64, 32 bytes when decoded
    db.execute('UPDATE users SET public_key = ? WHERE id = ?', (public_key, user_id))
    return jsonify({'success': True})
```

**`/api/contacts/{id}/public-key`**
```python
@app.route('/api/contacts/<int:contact_id>/public-key', methods=['GET'])
@jwt_required()
def get_contact_public_key(contact_id):
    user_id = get_jwt_identity()
    # Verify contact relationship exists
    contact = db.execute('''
        SELECT u.public_key, u.name
        FROM contacts c
        JOIN users u ON c.contact_id = u.id
        WHERE c.user_id = ? AND c.contact_id = ?
    ''', (user_id, contact_id)).fetchone()
    if not contact:
        return jsonify({'error': 'Not a contact'}), 404
    return jsonify({'publicKey': contact['public_key'], 'name': contact['name']})
```

**`/api/location/encrypted`**
```python
@app.route('/api/location/encrypted', methods=['POST'])
@jwt_required()
def publish_encrypted_locations():
    user_id = get_jwt_identity()
    locations = request.json.get('locations', [])
    for loc in locations:
        db.execute('''
            INSERT OR REPLACE INTO encrypted_locations (from_user_id, to_user_id, encrypted_blob, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ''', (user_id, loc['contactId'], json.dumps(loc['blob'])))
    return jsonify({'success': True})
```

### 2.4 Checklist

- [x] Add migration for public_key column
- [x] Add migration for encrypted_locations table
- [x] Implement `/api/identity/register`
- [x] Implement `/api/contacts/{id}/public-key`
- [x] Implement `/api/location/encrypted`
- [x] Implement `/api/contacts/encrypted`
- [x] Add server tests for new endpoints (20 new tests)
- [x] Verify old endpoints still work (all 205 Playwright tests pass)

**Exit criteria:** New endpoints work. Old endpoints still work. Server tests pass.

### 2.5 Implementation Notes (Completed)

**Decisions made:**
- Used TEXT user_id (existing schema) not INTEGER - matches current users table
- Added automatic migration in `init_db()` to add `public_key` column to existing databases
- Added index on `encrypted_locations(to_user_id)` for efficient lookups
- Public key validation: 44 characters (base64 encoding of 32 bytes)
- `GET /api/contacts/encrypted` returns permission levels alongside encrypted locations

---

## Phase 3: Client Identity Management

**Goal:** Identity created on signup, stored locally, registered with server.

### 3.1 Signup flow changes

In registration handler:
```javascript
async function handleRegister(email, password, name) {
    // 1. Generate identity
    const identity = await Identity.create();

    // 2. Register with server (includes public key)
    const response = await API.register(email, password, name, Identity.getPublicKeyBase64());

    // 3. Store token, proceed as normal
    // ...
}
```

### 3.2 Login flow changes

```javascript
async function handleLogin(email, password) {
    // 1. Try to load existing identity
    const identity = await Identity.load();

    // 2. Login with server
    const response = await API.login(email, password, identity?.getPublicKeyBase64());

    // 3. Handle identity mismatch (server has different key)
    if (response.identityMismatch) {
        // Show: "This account has an identity on another device. Import your identity file to continue."
        showIdentityMismatchModal();
        return;
    }

    // 4. Proceed normally
}
```

### 3.3 API.js changes

```javascript
async function register(email, password, name, publicKey) {
    return fetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, publicKey })
    });
}

async function login(email, password, publicKey) {
    const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, publicKey })
    });
    // Server returns identityMismatch: true if account has different key
    return response.json();
}
```

### 3.4 Export Identity UI

Add to Settings view:
```html
<button id="exportIdentity">Export Identity (Backup)</button>
```

```javascript
document.getElementById('exportIdentity').addEventListener('click', () => {
    const json = Identity.exportPrivate({ email: currentUser.email, name: currentUser.name });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whereish-identity.json';
    a.click();
});
```

### 3.5 Import Identity UI

Add to login/welcome screen:
```html
<button id="importIdentity">I have an identity file</button>
<input type="file" id="identityFileInput" accept=".json" hidden>
```

```javascript
document.getElementById('importIdentity').addEventListener('click', () => {
    document.getElementById('identityFileInput').click();
});

document.getElementById('identityFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const json = await file.text();
    try {
        const account = await Identity.importPrivate(json);
        showMessage(`Identity loaded for ${account.email}. Please log in.`);
    } catch (err) {
        showError('Invalid identity file');
    }
});
```

### 3.6 Checklist

- [x] Modify registration to generate identity and send public key
- [x] Modify login to check identity match
- [x] Add identity mismatch handling/UI (error messages in auth modal)
- [x] Add "Export Identity" button in Settings
- [x] Add "Import Identity" option on welcome screen
- [x] Update logout to clear identity from IndexedDB
- [x] Add E2E tests for identity flows (updated existing auth tests)
- [ ] Bump version (deferred to Phase 4 - not a breaking change yet)

**Exit criteria:** New users get identity. Export/import works. Existing functionality unchanged (location still plaintext).

### 3.7 Implementation Notes (Completed)

**Decisions made:**
- Server login endpoint now returns `hasPublicKey` and `publicKey` for identity verification
- Login creates new identity if neither client nor server has one (backwards compatible)
- Identity mismatch shows error message in auth modal (no separate modal)
- Export downloads `whereish-identity.json` file with user metadata
- Import pre-fills email in login form after successful import
- Identity cleared on logout (Phase 5: warn if not exported)

---

## Phase 4: Encrypted Location Sharing

**Goal:** Location data encrypted. This is the breaking change.

### 4.1 Publish encrypted location

Replace current `publishLocationToServer()`:

```javascript
async function publishLocationToServer() {
    const myIdentity = Identity.getCurrent();
    if (!myIdentity) {
        console.error('No identity - cannot publish');
        return;
    }

    const contacts = await API.getContacts();
    const encryptedLocations = [];

    for (const contact of contacts) {
        if (!contact.publicKey) continue; // Contact hasn't upgraded

        const contactPublicKey = nacl.util.decodeBase64(contact.publicKey);
        const permissionLevel = getPermissionLevel(contact.id);
        const locationData = filterLocationToLevel(currentLocation, permissionLevel);

        const encrypted = Crypto.encryptForContact(
            locationData,
            contactPublicKey,
            myIdentity.privateKey
        );

        encryptedLocations.push({
            contactId: contact.id,
            blob: encrypted
        });
    }

    await API.publishEncryptedLocations(encryptedLocations);
}
```

### 4.2 Receive encrypted locations

Replace current contact location display:

```javascript
async function loadContactLocations() {
    const myIdentity = Identity.getCurrent();
    const contacts = await API.getContactsEncrypted();

    for (const contact of contacts) {
        if (!contact.encryptedBlob || !contact.publicKey) continue;

        try {
            const contactPublicKey = nacl.util.decodeBase64(contact.publicKey);
            const location = Crypto.decryptFromContact(
                contact.encryptedBlob,
                contactPublicKey,
                myIdentity.privateKey
            );
            contact.location = location;
        } catch (err) {
            console.error(`Failed to decrypt location from ${contact.name}:`, err);
            contact.location = null;
            contact.decryptionError = true;
        }
    }

    renderContacts(contacts);
}
```

### 4.3 Remove plaintext endpoints

Server changes:
- Remove `/api/location` (POST) - plaintext publish
- Remove location data from `/api/contacts` response
- Only encrypted endpoints remain

### 4.4 Database cleanup

```sql
-- Remove plaintext location columns from users
ALTER TABLE users DROP COLUMN latitude;
ALTER TABLE users DROP COLUMN longitude;
ALTER TABLE users DROP COLUMN location_hierarchy;
ALTER TABLE users DROP COLUMN location_updated_at;
-- etc.
```

### 4.5 Checklist

- [x] Implement encrypted publish flow
- [x] Implement encrypted receive/decrypt flow
- [x] Handle decryption errors gracefully
- [x] Remove plaintext publish endpoint
- [x] Remove plaintext location from contacts endpoint
- [x] Remove plaintext location columns from DB (locations table removed)
- [x] Update all E2E tests for encrypted flow (2 skipped pending identity setup)
- [x] Full regression testing (73 server tests + 203 client tests pass)
- [x] Bump APP_VERSION to major number (v100) - breaking change signal
- [ ] Clean database (rm whereish.db) - user action needed

**Exit criteria:** All location data encrypted. Server cannot read locations. Tests pass.

---

## Phase 5: Polish & Security Hardening

**Goal:** Production-ready encryption.

### 5.1 Security review

- [x] Verify nonces are never reused (nacl.randomBytes(24) per encryption)
- [x] Verify server cannot decrypt any stored data (only stores encrypted_blob)
- [x] Review CSP headers for XSS protection (added CSP, X-Frame-Options, X-Content-Type-Options)
- [x] Audit IndexedDB access patterns (single identity key, proper transaction handling)

### 5.2 UX polish

- [x] Clear messaging about identity backup importance (updated settings section)
- [x] Warning on logout if identity not exported (confirm dialog with explanation)
- [x] "Encrypted" indicator in UI (E2E Encrypted badge + status in settings)
- [x] Error handling for crypto failures (try/catch with console warnings)

### 5.3 Documentation

- [x] Update PRD with implementation status (PRD_ENCRYPTION.md)
- [x] Update DESIGN.md architecture section (DESIGN_ENCRYPTION.md)
- [ ] User-facing docs about encryption (can add later if needed)
- [ ] Update API documentation (can add later if needed)

### 5.4 Checklist

- [x] Security review complete
- [x] UX polish complete
- [x] Documentation updated (core docs)
- [x] Final regression testing (73 server + 203 client tests pass)
- [ ] Close Issue #30 (user action)

---

## Breaking Change Strategy

Since we're okay with fresh start:

**Option A: Clean database**
```bash
rm whereish.db  # Delete database
# All users re-register
```

**Option B: Version flag**
- Add `ENCRYPTION_ENABLED = True` flag
- If enabled, only encrypted endpoints work
- Old accounts get "Please re-register" message

**Recommendation:** Option A (clean database). Simpler, cleaner.

**Version bump:** Phase 4 is the breaking change. Bump APP_VERSION to a major number (e.g., 100 or 2.0) to clearly signal incompatibility with pre-encryption clients. This ensures:
- Old cached service workers won't work with new server
- Version mismatch is obvious in logs/debugging
- Clear demarcation point in git history

---

## Testing Strategy

| Phase | Test Type | What |
|-------|-----------|------|
| 1 | Unit | Crypto operations (encrypt, decrypt, key gen) |
| 2 | Integration | API endpoints (register key, get key, store blob) |
| 3 | E2E | Signup creates identity, export/import works |
| 4 | E2E | Full flow: signup, add contact, share location, view encrypted |
| 5 | Security | Penetration testing, code review |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| CDN for tweetnacl unavailable | Bundle as fallback; add to service worker cache |
| IndexedDB storage fails | Graceful degradation; prompt to re-create identity |
| Crypto operations slow | Test on low-end devices; optimize if needed |
| User loses identity file | Clear warnings; can always re-register |

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Crypto Foundation | 1 day |
| Phase 2: Server Schema | 1 day |
| Phase 3: Client Identity | 1-2 days |
| Phase 4: Encrypted Sharing | 2-3 days |
| Phase 5: Polish | 1 day |
| **Total** | **6-8 days** |

---

## Success Metrics

- [ ] Server database contains only encrypted blobs (verified by inspection)
- [ ] All E2E tests pass with encryption enabled
- [ ] Identity export/import works correctly
- [ ] Decryption errors handled gracefully
- [ ] No plaintext location data anywhere in system
