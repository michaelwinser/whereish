# Product Requirements Document: Authentication & Identity

**Version:** 1.1 (Draft)
**Date:** December 14, 2025
**Status:** Draft
**Related Issues:** #2, #64

---

## 1. Executive Summary

Replace the current email/password authentication with Google OAuth, and simplify the cryptographic identity management experience. Users authenticate via Google (convenience) and protect their encryption keys with a separate "identity PIN" (security).

**Core changes:**
- OAuth handles "who are you?"
- Identity PIN handles "protect your encryption keys"
- Multi-device model: one **active** device reports location, others are **backups**
- Multiple backup options: other devices, server storage, downloaded file

---

## 2. Problem Statement

### 2.1 Current Authentication Issues

The current email/password system has several drawbacks:

| Issue | Impact |
|-------|--------|
| Password fatigue | Users create weak passwords or reuse existing ones |
| No email verification | We never confirm email ownership |
| Password storage liability | We store password hashes, a security responsibility |
| Account recovery complexity | Password reset requires email verification we don't have |

### 2.2 Current Identity Management Issues

The cryptographic identity system (encryption keys) has a poor user experience:

| Issue | Impact |
|-------|--------|
| JSON file export | Awkward, especially on mobile |
| No encryption of backup | Anyone with the file can impersonate the user |
| Easy to lose | Users may not back up, losing access forever |
| Multi-device confusion | Unclear how to move identity between devices |

---

## 3. Goals

### 3.1 Must Achieve

1. **Eliminate passwords for daily login** - OAuth removes password friction
2. **Verified identity** - OAuth confirms email ownership
3. **Protected identity backup** - Encryption keys protected by user-chosen PIN
4. **Multiple backup options** - Device-to-device, server, or file
5. **Clear device model** - One active device, others are backups
6. **Maintain zero-knowledge principle** - Server never sees unencrypted keys

### 3.2 Non-Goals (This Version)

- Multiple OAuth providers (Apple, GitHub, etc.)
- Passkeys/WebAuthn
- QR code identity transfer
- Automatic device invalidation (explicit removal only)

---

## 4. Core Concepts

### 4.1 Device Roles

| Role | Can Authenticate | Has Identity | Reports Location |
|------|------------------|--------------|------------------|
| **Active device** | Yes | Yes | Yes |
| **Backup device** | Yes | Yes | No (view only) |
| **Server backup** | N/A | Encrypted blob | N/A |
| **Downloaded file** | N/A | Encrypted blob | N/A |

- **One active device at a time** - the device that reports the user's location
- **Multiple backup devices allowed** - logged in, can view contacts, but don't report location
- **Switching is explicit** - user chooses to make a device active
- **All backups protected by same PIN** - unified encryption key

### 4.2 Backup Sources

All backup sources are equivalent - encrypted with the same PIN:

1. **Other devices** - already have identity, can transfer it
2. **Server** - optionally stores encrypted blob
3. **Downloaded file** - offline fallback

User can enable any combination of these.

### 4.3 PIN Memory (Signal-Style)

To prevent users from forgetting their PIN:
- Periodic prompts: "Enter your PIN to continue" (not every launch, but occasionally)
- Failure doesn't lock them out of current device
- Warning shown if PIN forgotten: "You won't be able to recover on a new device"

---

## 5. User Scenarios

### 5.1 First-Time Signup

**Actor:** New user on their phone

**Flow:**
1. User taps "Sign in with Google"
2. Google OAuth flow completes
3. App shows "Welcome! Let's secure your account"
4. User enters display name
5. App prompts: "Create an Identity PIN"
   - Explanation: "This PIN protects your encryption keys. You'll need it to set up new devices."
   - PIN requirements: 6+ characters
6. App generates cryptographic identity (keypair)
7. App offers backup options:
   - "Store backup on server" (checkbox, optional)
   - "Download backup file" (button, optional)
8. User proceeds to main app

**Key points:**
- Identity PIN is required
- Backup download/server storage is optional (but encouraged)
- User can enable backups later in settings

### 5.2 Daily Use (Same Device)

**Actor:** Returning user on their usual phone

**Flow:**
1. User opens app
2. App checks: valid OAuth session? Yes
3. App checks: identity in IndexedDB? Yes
4. User is logged in, no prompts

**Periodic PIN check (Signal-style):**
- Occasionally (weekly/monthly), app prompts: "Enter your PIN"
- If correct: continues normally
- If wrong: warning about recovery risk, but app still works

### 5.3 New Device - Transfer from Existing Device

**Actor:** User got a new phone, old phone still available

**Precondition:** Old device is online and logged in

**Flow:**
1. User taps "Sign in with Google" on new device
2. OAuth completes - server recognizes existing account
3. Server notifies old device: "New device wants to join"
4. Old device shows prompt: "Authorize [New Device]?"
5. User approves on old device
6. Old device sends encrypted identity to new device (via server relay)
7. New device prompts for PIN
8. User enters PIN → identity decrypted and installed
9. New device asks: "Make this your active device?"
   - **Yes** → new device becomes active, old becomes backup
   - **No** → new device is backup, old remains active

**Key points:**
- No file handling required
- Old device must be online for this flow
- Transfer happens immediately when approved

### 5.4 New Device - Restore from Server Backup

**Actor:** User got a new phone, old phone not available, server backup enabled

**Flow:**
1. User taps "Sign in with Google" on new device
2. OAuth completes - server has encrypted identity blob
3. App shows: "Welcome back! Enter your PIN to restore your identity."
4. User enters PIN → server blob decrypted and installed
5. New device becomes active (old device still has identity but can't auth without re-login)

### 5.5 New Device - Restore from File

**Actor:** User got a new phone, no server backup, has downloaded file

**Flow:**
1. User taps "Sign in with Google" on new device
2. OAuth completes - server recognizes account but no backup available
3. App shows recovery options:
   - "Transfer from another device" (if user has one)
   - "Import backup file"
   - "Start fresh (lose contacts)"
4. User chooses "Import backup file"
5. File picker → select file → enter PIN → decrypt → install

### 5.6 Lost Phone - No Backup

**Actor:** User lost phone, never enabled any backup

**Flow:**
1. User signs in on new device
2. No backup available anywhere
3. Only option: "Start fresh"
4. Warning: "This will create a new identity. You'll need to re-add all contacts."
5. User confirms → new identity created → set new PIN

**Key point:** This is the consequence of not enabling backups. Clear messaging.

### 5.7 Switching Active Device

**Actor:** User with multiple devices, wants to change which reports location

**Flow:**
1. User opens app on backup device
2. Main screen shows: "Not reporting location from this device"
3. User taps "Make this my active device"
4. Confirmation prompt
5. This device becomes active, other devices become backups automatically

### 5.8 Forgot PIN

**Actor:** User forgot their PIN

**On current device:**
- App still works (identity is in IndexedDB, PIN not needed for daily use)
- Cannot download new backup
- Cannot transfer to new device
- Warning: "Without your PIN, you cannot recover on a new device"

**On new device:**
- Cannot decrypt any backup
- Must "Start fresh" (lose contacts)

**Rationale:** PIN protects the encryption keys. No bypass = security.

---

## 6. Feature Requirements

### 6.1 Authentication

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Google OAuth login | Must Have | Replace email/password entirely |
| Remove email/password auth | Must Have | Clean break from old system |
| Session persistence | Must Have | Don't require re-auth on every app open |
| Graceful session expiry (#69) | Must Have | Redirect to login, not error |

### 6.2 Identity Management

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Identity PIN setup at signup | Must Have | 6+ characters, required |
| PIN-encrypted identity | Must Have | AES-256-GCM |
| Periodic PIN verification | Should Have | Signal-style memory check |
| Change Identity PIN | Should Have | Requires current PIN |

### 6.3 Backup Options

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Server backup (opt-in) | Must Have | Encrypted blob stored on server |
| Download backup file | Must Have | Manual offline backup |
| Enable/disable server backup | Must Have | In settings |
| Re-download backup file | Should Have | From settings |

### 6.4 Device Management

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Device-to-device transfer | Must Have | Online, immediate, via server relay |
| Active device indicator | Must Have | Clear on main screen |
| Switch active device | Must Have | One-tap from backup device |
| View logged-in devices | Should Have | List in settings |
| Remove identity from device | Should Have | Explicit user action |

### 6.5 Recovery

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Restore from server backup | Must Have | PIN required |
| Restore from file | Must Have | PIN required |
| Transfer from device | Must Have | Old device must be online |
| "Start fresh" option | Must Have | Clear warnings about contact loss |

---

## 7. Security Considerations

### 7.1 Threat Model

| Threat | Mitigation |
|--------|------------|
| Attacker has OAuth access | Cannot decrypt identity without PIN |
| Attacker has backup file | Cannot decrypt without PIN |
| Attacker has server backup blob | Cannot decrypt without PIN |
| Server compromise | Server only has encrypted blob, cannot decrypt |
| Old device stolen | Thief has identity but cannot auth (session expired) |

### 7.2 PIN Security

- PIN never sent to server in plaintext
- PIN derives encryption key via PBKDF2 (100k iterations)
- All backups encrypted client-side before storage/transfer
- No PIN recovery mechanism (by design)

### 7.3 What Server Knows

| Data | Server Knows? |
|------|---------------|
| User's email | Yes (from OAuth) |
| User's name | Yes |
| User's public key | Yes (for contact encryption) |
| User's private key | **No** |
| User's Identity PIN | **No** |
| Encrypted identity blob | Yes (if server backup enabled) - **cannot decrypt** |

---

## 8. UI/UX Requirements

### 8.1 Signup Flow

```
[Sign in with Google button]
         ↓
   Google OAuth popup
         ↓
  "Welcome! Let's secure your account"
  [Name input field]
         ↓
  "Create an Identity PIN"
  "You'll need this to set up new devices."
  [PIN input] [Confirm PIN input]
         ↓
  "How would you like to back up your identity?"
  [ ] Store on Whereish server (recommended)
  [Download backup file] (optional button)
  [Continue without backup] (link, small)
         ↓
  Main app
```

### 8.2 Main Screen - Backup Device

When on a backup device (not active):

```
┌─────────────────────────────────────┐
│  ⓘ Not reporting location           │
│  [Make this my active device]       │
└─────────────────────────────────────┘

[Rest of normal UI - contacts, etc.]
```

### 8.3 New Device - Recovery Options

```
"Welcome back, [Name]!"

Your identity protects your encrypted data.
How would you like to restore it?

┌─────────────────────────────────────┐
│ 📱 Transfer from another device     │
│    (requires other device online)   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ☁️  Restore from server backup      │
│    (you enabled this previously)    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📄 Import backup file               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚠️  Start fresh                     │
│    (you'll lose all contacts)       │
└─────────────────────────────────────┘
```

### 8.4 Transfer Authorization (Old Device)

When new device requests transfer:

```
┌─────────────────────────────────────┐
│  New device wants to join           │
│                                     │
│  [iPhone 15 Pro]                    │
│  Signed in just now                 │
│                                     │
│  [Authorize]  [Deny]                │
└─────────────────────────────────────┘
```

### 8.5 Settings - Identity & Devices

```
Identity & Devices
├── This Device
│   ├── Status: Active / Backup
│   └── [Make Active] (if backup)
├── Backup Options
│   ├── Server backup: [On/Off toggle]
│   └── [Download backup file]
├── Security
│   ├── [Change PIN]
│   └── [Remove identity from this device]
└── Other Devices
    └── [List of logged-in devices]
```

---

## 9. Migration from Current System

### 9.1 Existing Users

1. Next login requires Google OAuth
2. If OAuth email matches existing account → link accounts
3. Detect legacy unencrypted identity in IndexedDB
4. Prompt: "Set up your Identity PIN"
5. Encrypt existing identity with new PIN
6. Offer backup options

### 9.2 Existing Identity Files

Legacy unencrypted files can still be imported:
- Detected by `version: 1` in file
- User prompted to set PIN after import
- Identity re-encrypted with PIN

---

## 10. Open Questions

### 10.1 Resolved

| Question | Resolution |
|----------|------------|
| Server-stored identity? | Yes, opt-in |
| Multiple OAuth providers? | No - Google only for now |
| Multi-device support? | Yes - one active, multiple backups |
| Device-to-device transfer? | Yes - online only, immediate |
| Backup required? | No - optional but encouraged |

### 10.2 Deferred (Issue #70)

| Topic | Notes |
|-------|-------|
| Device invalidation | How to revoke identity on old device remotely |
| Key rotation | What if user believes identity is compromised? |
| Apple OAuth | Required for iOS App Store if any social login offered |

---

## 11. Success Metrics

### 11.1 Adoption

- 100% of new users use OAuth (no alternative)
- 100% of new users set Identity PIN (required)
- >50% enable at least one backup option

### 11.2 Recovery

- Device-to-device transfer success rate: >95%
- Server backup restore success rate: >99%
- "Start fresh" is rare (<5% of new device setups)

### 11.3 Security

- Zero server-side identity key exposure
- Zero PIN transmission to server
- PIN memory checks: >80% pass rate (users remember)

---

*End of PRD - Draft v1.1*
