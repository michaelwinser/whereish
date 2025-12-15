# Implementation Plan: Authentication & Identity

**Related Docs:** PRD_AUTH_IDENTITY.md, DESIGN_AUTH_IDENTITY.md
**Related Issues:** #2, #64
**Status:** Ready for implementation

---

## Overview

This plan breaks the OAuth + Identity implementation into 9 phases. Each phase is designed to be:
- Self-contained and testable
- Committed separately (no push until all phases complete)
- Buildable on the previous phase

**Estimated total:** ~2000 lines of code across client and server

---

## Phase 1: Google OAuth (Server)

**Goal:** Server can authenticate users via Google OAuth tokens

### Tasks

1. **Add dependencies**
   ```bash
   pip install google-auth google-auth-oauthlib
   ```
   Update `requirements.txt`

2. **Database migration**
   - Add `google_id TEXT UNIQUE` column to `users` table
   - Make `password_hash` nullable (for OAuth-only users)

3. **New endpoint: POST /api/auth/google**
   - Accept `{ id_token: "..." }`
   - Verify token with Google's API
   - Find or create user by email
   - Link Google ID to account
   - Return JWT session token + user info

4. **Environment configuration**
   - Add `GOOGLE_CLIENT_ID` to environment
   - Document in DOCKER.md

### Files Changed

| File | Changes |
|------|---------|
| `requirements.txt` | Add google-auth |
| `server/app.py` | Add `/api/auth/google` endpoint |
| `server/schema.sql` | Add google_id column |
| `docs/DOCKER.md` | Document GOOGLE_CLIENT_ID |

### Tests

- [ ] Valid Google token creates/returns user
- [ ] Invalid token returns 401
- [ ] Existing user linked to Google ID
- [ ] New user created with Google ID

### Commit Message
```
Phase 1: Add Google OAuth server endpoint (#2)

- Add google-auth dependency
- Add google_id column to users table
- Implement POST /api/auth/google endpoint
- Verify tokens server-side with Google API
```

---

## Phase 2: PIN Encryption (Client)

**Goal:** Client can encrypt/decrypt identity with a PIN

### Tasks

1. **Create `app/pin-crypto.js`**
   - `deriveKeyFromPIN(pin, salt)` - PBKDF2 key derivation
   - `encryptIdentity(identity, account, pin)` - AES-256-GCM
   - `decryptIdentity(encryptedJson, pin)` - AES-256-GCM
   - `encryptTestValue(pin)` - For PIN verification
   - `verifyPIN(testData, pin)` - Check if PIN is correct

2. **Define v2 identity file format**
   ```javascript
   {
     version: 2,
     type: "whereish-identity-encrypted",
     encryption: { algorithm, kdf, iterations, salt, iv },
     payload: "base64...",
     account: { email }
   }
   ```

3. **Update `app/identity.js`**
   - Add `exportEncrypted(account, pin)` method
   - Add `importEncrypted(json, pin)` method
   - Keep backward compatibility with v1 format

4. **Add to service worker cache**
   - Add `pin-crypto.js` to `sw.js`

### Files Changed

| File | Changes |
|------|---------|
| `app/pin-crypto.js` | New file - encryption utilities |
| `app/identity.js` | Add encrypted export/import |
| `app/index.html` | Add script tag for pin-crypto.js |
| `app/sw.js` | Add to cache list, bump version |

### Tests

- [ ] Encrypt/decrypt round-trip works
- [ ] Wrong PIN throws error
- [ ] v1 file import still works (backward compat)
- [ ] Key derivation is deterministic (same PIN + salt = same key)

### Commit Message
```
Phase 2: Add PIN-encrypted identity support (#64)

- Add pin-crypto.js with PBKDF2 + AES-256-GCM
- Define v2 encrypted identity file format
- Update Identity module with encrypted export/import
- Maintain backward compatibility with v1 unencrypted files
```

---

## Phase 3: OAuth + Signup UI (Client)

**Goal:** Users can sign in with Google and complete new user setup

### Tasks

1. **Add Google Identity Services**
   - Add GIS script to index.html
   - Initialize with client ID

2. **Create auth UI components**
   - Google Sign-In button
   - PIN setup form (with confirmation)
   - Backup options screen

3. **New signup flow**
   ```
   OAuth → Name entry → PIN setup → Backup choice → Main app
   ```

4. **File download trigger**
   - `downloadIdentityFile(content, email)` function
   - Trigger on user request

5. **Update `app/api.js`**
   - Add `authGoogle(idToken)` method
   - Handle new response format

6. **Update login view**
   - Replace email/password form with Google button
   - Keep link to email/password (temporary, for migration)

### Files Changed

| File | Changes |
|------|---------|
| `app/index.html` | Add GIS script, new signup views |
| `app/style.css` | Styles for PIN entry, signup flow |
| `app/app.js` | Signup flow logic, Google callback |
| `app/api.js` | Add authGoogle method |

### Tests

- [ ] Google button renders
- [ ] OAuth flow reaches server
- [ ] PIN setup validates matching PINs
- [ ] File download triggers
- [ ] New user reaches main app

### Commit Message
```
Phase 3: Implement Google OAuth signup UI (#2, #64)

- Add Google Identity Services integration
- Create PIN setup flow with confirmation
- Add backup options screen (download file)
- Replace login form with Google Sign-In button
```

---

## Phase 4: Server Backup

**Goal:** Users can store/retrieve encrypted identity on server

### Tasks

1. **Database migration**
   - Add `encrypted_identity TEXT` column to users table

2. **New endpoints**
   - `POST /api/identity/backup` - Store encrypted blob
   - `GET /api/identity/backup` - Retrieve encrypted blob
   - `DELETE /api/identity/backup` - Remove backup

3. **Update auth response**
   - Include `has_server_backup: true/false` in user info

4. **Client integration**
   - Add server backup toggle to signup flow
   - Add to settings

### Files Changed

| File | Changes |
|------|---------|
| `server/app.py` | Add backup endpoints |
| `server/schema.sql` | Add encrypted_identity column |
| `app/api.js` | Add backup methods |
| `app/app.js` | Integrate backup option |

### Tests

- [ ] Store backup returns success
- [ ] Retrieve backup returns stored blob
- [ ] Delete backup removes blob
- [ ] Auth response includes has_server_backup flag

### Commit Message
```
Phase 4: Add server-side encrypted backup storage (#64)

- Add encrypted_identity column to users table
- Implement backup endpoints (POST/GET/DELETE)
- Server stores encrypted blob without ability to decrypt
- Include has_server_backup in auth response
```

---

## Phase 5: Device Registry (Server)

**Goal:** Server tracks user devices with active/backup status

### Tasks

1. **Create devices table**
   ```sql
   CREATE TABLE devices (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     name TEXT NOT NULL,
     platform TEXT,
     is_active BOOLEAN DEFAULT FALSE,
     last_seen TIMESTAMP,
     created_at TIMESTAMP
   );
   ```

2. **Device registration at login**
   - Register device on OAuth login
   - First device is active by default
   - Return device info in auth response

3. **New endpoints**
   - `GET /api/devices` - List user's devices
   - `POST /api/devices/activate` - Make current device active
   - `DELETE /api/devices/:id` - Remove a device

4. **Update JWT to include device_id**

### Files Changed

| File | Changes |
|------|---------|
| `server/app.py` | Device registration, endpoints |
| `server/schema.sql` | Add devices table |

### Tests

- [ ] Device registered on login
- [ ] First device is active
- [ ] Activate endpoint switches active device
- [ ] List returns all user devices
- [ ] Delete removes device

### Commit Message
```
Phase 5: Add device registry and management (#64)

- Create devices table with active/backup status
- Register device on OAuth login
- Add device management endpoints
- Include device info in JWT and auth response
```

---

## Phase 6: Client Device UI

**Goal:** Users can see device status and switch active device

### Tasks

1. **Main screen indicator**
   - Show "Not reporting location" banner on backup devices
   - Add "Make this my active device" button

2. **Settings - Identity & Devices**
   - Show current device status
   - List all devices
   - Toggle server backup
   - Download backup file button
   - Change PIN (future - stub for now)

3. **API integration**
   - Fetch device list
   - Activate device
   - Remove device

### Files Changed

| File | Changes |
|------|---------|
| `app/index.html` | Device status banner, settings section |
| `app/style.css` | Styles for device UI |
| `app/app.js` | Device status logic, settings handlers |
| `app/api.js` | Device API methods |

### Tests

- [ ] Backup device shows banner
- [ ] Active device shows no banner
- [ ] Switch to active works
- [ ] Settings shows device list

### Commit Message
```
Phase 6: Add client device status UI (#64)

- Show backup device indicator on main screen
- Add "Make this active device" button
- Create Identity & Devices settings section
- Display device list with status
```

---

## Phase 7: Device-to-Device Transfer

**Goal:** Transfer identity from one device to another in real-time

### Tasks

1. **Server: Add WebSocket support**
   - Install flask-socketio, eventlet
   - Add socket handlers for transfer flow
   - Authenticate WebSocket connections

2. **Transfer events**
   - `request_transfer` - New device requests
   - `transfer_request` - Notify old device
   - `approve_transfer` - Send encrypted identity
   - `transfer_complete` - Relay to new device
   - `deny_transfer` / `transfer_denied`

3. **Client: Socket.IO integration**
   - Connect on app start
   - Handle transfer request notification
   - Transfer approval UI

4. **New device recovery flow**
   - Show "Transfer from another device" option
   - Request transfer, wait for approval
   - Receive and decrypt identity

### Files Changed

| File | Changes |
|------|---------|
| `requirements.txt` | Add flask-socketio, eventlet |
| `server/app.py` | WebSocket handlers |
| `app/index.html` | Transfer UI elements |
| `app/app.js` | Socket.IO client, transfer logic |
| `app/sw.js` | Add socket.io client to cache |

### Tests

- [ ] WebSocket connects with auth
- [ ] Transfer request reaches target device
- [ ] Approval sends encrypted identity
- [ ] New device receives and decrypts
- [ ] Denial notifies requester

### Commit Message
```
Phase 7: Implement device-to-device identity transfer (#64)

- Add flask-socketio for real-time transfer
- Implement transfer request/approval flow
- Old device encrypts and sends identity via relay
- New device decrypts with PIN
```

---

## Phase 8: PIN Verification (Signal-Style)

**Goal:** Periodic PIN checks to ensure users remember their PIN

### Tasks

1. **Store PIN test value at signup**
   - Encrypt known value with PIN
   - Store in localStorage

2. **Check schedule**
   - Track last verification time
   - Prompt every 14 days (configurable)

3. **Verification UI**
   - PIN entry modal
   - Success: update last check time
   - Failure: show warning, allow continue
   - Dismiss: show warning about recovery risk

4. **Check on app load**
   - If time for check, prompt before main UI

### Files Changed

| File | Changes |
|------|---------|
| `app/app.js` | PIN check logic, schedule |
| `app/index.html` | PIN verification modal |
| `app/style.css` | Modal styles |
| `app/pin-crypto.js` | Test value encrypt/verify |

### Tests

- [ ] Test value stored at signup
- [ ] Check triggers after interval
- [ ] Correct PIN updates last check
- [ ] Incorrect PIN shows warning
- [ ] Dismiss shows warning

### Commit Message
```
Phase 8: Add Signal-style periodic PIN verification (#64)

- Store encrypted test value at signup
- Check PIN every 14 days
- Allow continue on failure with warning
- Ensure users don't forget recovery PIN
```

---

## Phase 9: Migration & Polish

**Goal:** Existing users can migrate; legacy files supported; cleanup

### Tasks

1. **Existing user migration**
   - Detect email/password user on OAuth login (same email)
   - Link accounts
   - Prompt for PIN setup
   - Encrypt existing identity

2. **Legacy identity file support**
   - Detect v1 format on import
   - Import without PIN
   - Prompt to set PIN
   - Re-encrypt as v2

3. **Remove old auth (or deprecate)**
   - Option A: Remove email/password endpoints
   - Option B: Keep but hide UI, log deprecation warning
   - Decision: Option B for safety

4. **Error handling polish**
   - Network errors during transfer
   - OAuth popup blocked
   - File picker cancelled

5. **Update tests**
   - Migration flow tests
   - Legacy import tests

### Files Changed

| File | Changes |
|------|---------|
| `app/app.js` | Migration logic, error handling |
| `app/identity.js` | Legacy format detection |
| `server/app.py` | Deprecation warnings on old endpoints |

### Tests

- [ ] Email/password user migrated on OAuth
- [ ] Legacy v1 file imports correctly
- [ ] Migration prompts for PIN
- [ ] Deprecation warning logged

### Commit Message
```
Phase 9: Add migration support and polish (#2, #64)

- Migrate existing users on OAuth login
- Support legacy v1 identity file import
- Add deprecation warnings to old auth endpoints
- Improve error handling throughout
```

---

## Execution Checklist

Before starting:
- [x] Review and approve this plan
- [x] Ensure `.claude/settings.local.json` has permissions
- [x] Have Google Cloud project with OAuth client ID ready

Per phase:
- [x] Implement changes
- [x] Run `make test`
- [x] Manual smoke test if applicable
- [x] Commit (no push)
- [x] Update this plan with actual decisions/deviations

After all phases:
- [ ] Full regression test
- [ ] Review all commits
- [ ] Squash if desired
- [ ] Push to GitHub

## Implementation Notes

**Completed December 2025**

Key design decisions made during implementation:

1. **Phase 7 - Polling vs WebSocket**: Used polling instead of WebSocket to avoid adding flask-socketio/eventlet dependencies. Transfer uses 6-digit codes with 10-minute expiry and 2-second polling intervals.

2. **Phase 8 - PIN Check Interval**: Default is 14 days (configurable). Wrong PIN shows warning but allows continue (no lockout). Skip option shows warning toast.

3. **Phase 9 - Migration Detection**: Migration triggers when identity exists but no PIN test data. Works for both OAuth and email/password login paths.

---

## Dependencies to Install

**Server:**
```bash
pip install google-auth google-auth-oauthlib flask-socketio eventlet
```

**Client:**
- Google Identity Services (CDN script)
- Socket.IO client (bundle locally per supply chain policy)

---

## Configuration Required

| Variable | Where | Example |
|----------|-------|---------|
| `GOOGLE_CLIENT_ID` | Server env, Client config | `xxx.apps.googleusercontent.com` |

---

## Rollback Plan

If issues discovered after implementation:

1. **Before push:** Reset to pre-implementation commit
2. **After push:** Revert commits, re-enable old auth

Old auth endpoints remain functional (deprecated, not removed) so users aren't locked out.

---

*End of Implementation Plan*
