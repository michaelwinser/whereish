# Design Document: Authentication & Identity

**Version:** 1.1 (Draft)
**Date:** December 14, 2025
**Status:** Draft
**Related PRD:** PRD_AUTH_IDENTITY.md
**Related Issues:** #2, #64

---

## 1. Overview

This document describes the technical implementation of Google OAuth authentication, PIN-protected identity management, and multi-device support for Whereish.

### 1.1 Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (PWA) - Device A                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Google OAuth   │  │  Identity PIN   │  │  Identity Store     │  │
│  │  (who are you?) │  │  (key derivation)│  │  (IndexedDB)        │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                    │                      │              │
│           ▼                    ▼                      ▼              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    Identity Manager                              ││
│  │  - Generate keypair (NaCl)                                       ││
│  │  - Encrypt with PIN-derived key (AES-256-GCM)                    ││
│  │  - Export/Import encrypted file                                  ││
│  │  - Transfer to other devices                                     ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Server (Flask)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  OAuth Verify   │  │  User Account   │  │  Encrypted Backup   │  │
│  │  (Google token) │  │  (email, name)  │  │  (optional blob)    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐                           │
│  │  Device Registry│  │  Transfer Relay │                           │
│  │  (active/backup)│  │  (WebSocket)    │                           │
│  └─────────────────┘  └─────────────────┘                           │
│                                                                      │
│  Server NEVER receives: private key, identity PIN (plaintext)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Google OAuth Implementation

### 2.1 OAuth Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client  │     │  Google  │     │  Server  │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │ 1. Click "Sign in with Google"  │
     │───────────────>│                │
     │                │                │
     │ 2. OAuth popup │                │
     │<───────────────│                │
     │                │                │
     │ 3. User consents                │
     │───────────────>│                │
     │                │                │
     │ 4. ID token    │                │
     │<───────────────│                │
     │                │                │
     │ 5. POST /api/auth/google        │
     │────────────────────────────────>│
     │                │                │
     │                │ 6. Verify token│
     │                │<───────────────│
     │                │                │
     │ 7. JWT + user info + device state
     │<────────────────────────────────│
```

### 2.2 Server Endpoint: Google Auth

**POST /api/auth/google**

```python
@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    """
    Authenticate via Google OAuth.

    Request:
        {
            "id_token": "eyJ...",
            "device_info": {
                "name": "iPhone 15 Pro",
                "platform": "iOS"
            }
        }

    Response (success):
        {
            "token": "session_jwt...",
            "user": {
                "id": "uuid",
                "email": "user@gmail.com",
                "name": "User Name",
                "is_new": true/false,
                "has_public_key": true/false,
                "has_server_backup": true/false
            },
            "device": {
                "id": "device_uuid",
                "is_active": true/false
            },
            "other_devices_online": ["device_uuid_2"]
        }
    """
```

**Implementation:**

```python
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')

@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    data = request.get_json()
    token = data.get('id_token')
    device_info = data.get('device_info', {})

    if not token:
        return jsonify({'error': 'Missing id_token'}), 400

    try:
        # Verify the token with Google
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )

        email = idinfo['email']
        name = idinfo.get('name', email.split('@')[0])
        google_id = idinfo['sub']

        # Find or create user
        user = get_user_by_email(email)
        is_new = False

        if not user:
            user = create_user(email=email, name=name, google_id=google_id)
            is_new = True
        elif not user.get('google_id'):
            # Link Google ID to existing account
            update_user(user['id'], google_id=google_id)

        # Register device
        device = register_device(
            user_id=user['id'],
            name=device_info.get('name', 'Unknown Device'),
            platform=device_info.get('platform', 'Unknown')
        )

        # Get online devices for transfer option
        other_devices = get_online_devices(user['id'], exclude=device['id'])

        # Generate session token
        session_token = generate_token(user['id'], device['id'])

        return jsonify({
            'token': session_token,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'is_new': is_new,
                'has_public_key': user.get('public_key') is not None,
                'has_server_backup': user.get('encrypted_identity') is not None
            },
            'device': {
                'id': device['id'],
                'is_active': device['is_active']
            },
            'other_devices_online': [d['id'] for d in other_devices]
        })

    except ValueError:
        return jsonify({'error': 'Invalid token'}), 401
```

---

## 3. Device Management

### 3.1 Database Schema

```sql
-- Devices table
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    platform TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, id)
);

-- Only one active device per user
CREATE UNIQUE INDEX one_active_device ON devices(user_id) WHERE is_active = TRUE;

-- Add to users table
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN encrypted_identity TEXT;  -- Server backup blob
```

### 3.2 Device Registration

```python
def register_device(user_id, name, platform):
    device_id = str(uuid.uuid4())

    # Check if user has any devices
    existing = get_devices(user_id)
    is_active = len(existing) == 0  # First device is active by default

    db.execute('''
        INSERT INTO devices (id, user_id, name, platform, is_active, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (device_id, user_id, name, platform, is_active, datetime.utcnow()))

    return {
        'id': device_id,
        'name': name,
        'platform': platform,
        'is_active': is_active
    }
```

### 3.3 Switch Active Device

**POST /api/devices/activate**

```python
@app.route('/api/devices/activate', methods=['POST'])
@require_auth
def activate_device():
    """Make the current device the active device."""
    user_id = g.user_id
    device_id = g.device_id

    # Deactivate all other devices
    db.execute('''
        UPDATE devices SET is_active = FALSE WHERE user_id = ?
    ''', (user_id,))

    # Activate this device
    db.execute('''
        UPDATE devices SET is_active = TRUE WHERE id = ? AND user_id = ?
    ''', (device_id, user_id))

    return jsonify({'success': True, 'is_active': True})
```

---

## 4. Identity Transfer (Device-to-Device)

### 4.1 Transfer Flow

```
New Device              Server                  Old Device
    │                      │                        │
    │ 1. OAuth login       │                        │
    │─────────────────────>│                        │
    │                      │                        │
    │ 2. Response includes │                        │
    │    other_devices_online                       │
    │<─────────────────────│                        │
    │                      │                        │
    │ 3. Request transfer  │                        │
    │─────────────────────>│                        │
    │                      │                        │
    │                      │ 4. Push notification   │
    │                      │───────────────────────>│
    │                      │                        │
    │                      │ 5. User approves       │
    │                      │<───────────────────────│
    │                      │                        │
    │                      │ 6. Old device sends    │
    │                      │    encrypted identity  │
    │                      │<───────────────────────│
    │                      │                        │
    │ 7. Relay encrypted   │                        │
    │    identity blob     │                        │
    │<─────────────────────│                        │
    │                      │                        │
    │ 8. Prompt for PIN    │                        │
    │    (client-side)     │                        │
    │                      │                        │
    │ 9. Decrypt & install │                        │
```

### 4.2 WebSocket for Real-Time Transfer

```python
# Server-side WebSocket handler (using flask-socketio)
from flask_socketio import SocketIO, emit, join_room

socketio = SocketIO(app)

@socketio.on('connect')
def handle_connect():
    # Authenticate WebSocket connection
    token = request.args.get('token')
    user_id, device_id = verify_token(token)
    if not user_id:
        return False

    # Join user's room for notifications
    join_room(f'user_{user_id}')
    join_room(f'device_{device_id}')

    # Mark device as online
    update_device_last_seen(device_id)

@socketio.on('request_transfer')
def handle_transfer_request(data):
    """New device requests identity transfer."""
    target_device_id = data['target_device_id']

    # Notify target device
    emit('transfer_request', {
        'from_device': g.device_id,
        'from_device_name': get_device_name(g.device_id)
    }, room=f'device_{target_device_id}')

@socketio.on('approve_transfer')
def handle_transfer_approval(data):
    """Old device approves and sends encrypted identity."""
    requesting_device_id = data['requesting_device_id']
    encrypted_identity = data['encrypted_identity']

    # Relay to requesting device
    emit('transfer_complete', {
        'encrypted_identity': encrypted_identity
    }, room=f'device_{requesting_device_id}')

@socketio.on('deny_transfer')
def handle_transfer_denial(data):
    requesting_device_id = data['requesting_device_id']

    emit('transfer_denied', {}, room=f'device_{requesting_device_id}')
```

### 4.3 Client-Side Transfer Handler

```javascript
// New device requesting transfer
async function requestTransferFromDevice(targetDeviceId) {
    return new Promise((resolve, reject) => {
        socket.emit('request_transfer', { target_device_id: targetDeviceId });

        socket.once('transfer_complete', async (data) => {
            try {
                // Prompt for PIN
                const pin = await showPINEntry();

                // Decrypt identity
                const { identity } = await decryptIdentity(
                    data.encrypted_identity,
                    pin
                );

                // Save to IndexedDB
                await Identity.save(identity);

                resolve(identity);
            } catch (e) {
                reject(new Error('Failed to decrypt. Wrong PIN?'));
            }
        });

        socket.once('transfer_denied', () => {
            reject(new Error('Transfer denied by other device'));
        });

        // Timeout after 2 minutes
        setTimeout(() => reject(new Error('Transfer timed out')), 120000);
    });
}

// Old device handling transfer request
socket.on('transfer_request', async (data) => {
    const approved = await showTransferApprovalPrompt(data.from_device_name);

    if (approved) {
        // Get current identity and encrypt for transfer
        const identity = Identity.getCurrent();
        const pin = await showPINEntry('Enter PIN to authorize transfer');

        const encrypted = await encryptIdentity(
            identity,
            { email: currentUser.email, name: currentUser.name },
            pin
        );

        socket.emit('approve_transfer', {
            requesting_device_id: data.from_device,
            encrypted_identity: encrypted
        });
    } else {
        socket.emit('deny_transfer', {
            requesting_device_id: data.from_device
        });
    }
});
```

---

## 5. Server Backup

### 5.1 Store Encrypted Backup

**POST /api/identity/backup**

```python
@app.route('/api/identity/backup', methods=['POST'])
@require_auth
def store_backup():
    """
    Store encrypted identity backup on server.

    Request:
        {
            "encrypted_identity": "base64..."
        }

    Note: Server cannot decrypt this - it's encrypted with user's PIN.
    """
    data = request.get_json()
    encrypted = data.get('encrypted_identity')

    if not encrypted:
        return jsonify({'error': 'Missing encrypted_identity'}), 400

    # Just store the blob - we can't read it
    db.execute('''
        UPDATE users SET encrypted_identity = ? WHERE id = ?
    ''', (encrypted, g.user_id))

    return jsonify({'success': True})
```

### 5.2 Retrieve Encrypted Backup

**GET /api/identity/backup**

```python
@app.route('/api/identity/backup', methods=['GET'])
@require_auth
def get_backup():
    """
    Retrieve encrypted identity backup.
    Client must decrypt with PIN.
    """
    user = get_user(g.user_id)

    if not user.get('encrypted_identity'):
        return jsonify({'error': 'No backup found'}), 404

    return jsonify({
        'encrypted_identity': user['encrypted_identity']
    })
```

### 5.3 Delete Backup

**DELETE /api/identity/backup**

```python
@app.route('/api/identity/backup', methods=['DELETE'])
@require_auth
def delete_backup():
    """Remove server backup (user disabling the feature)."""
    db.execute('''
        UPDATE users SET encrypted_identity = NULL WHERE id = ?
    ''', (g.user_id,))

    return jsonify({'success': True})
```

---

## 6. PIN Encryption

### 6.1 Key Derivation

```javascript
/**
 * Derive encryption key from PIN using PBKDF2
 */
async function deriveKeyFromPIN(pin, salt) {
    const encoder = new TextEncoder();
    const pinData = encoder.encode(pin);

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        pinData,
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}
```

### 6.2 Encrypted Identity Format

```javascript
{
    "version": 2,
    "type": "whereish-identity-encrypted",
    "created": "2025-12-14T...",
    "encryption": {
        "algorithm": "AES-256-GCM",
        "kdf": "PBKDF2",
        "iterations": 100000,
        "salt": "base64...",
        "iv": "base64..."
    },
    "payload": "base64...",  // Encrypted identity + metadata
    "account": {
        "email": "user@gmail.com"  // In clear for identification
    }
}
```

### 6.3 Encrypt/Decrypt Functions

```javascript
async function encryptIdentity(identity, account, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyFromPIN(pin, salt);

    const payload = {
        identity: {
            privateKey: nacl.util.encodeBase64(identity.privateKey),
            publicKey: nacl.util.encodeBase64(identity.publicKey)
        },
        account: account
    };

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        new TextEncoder().encode(JSON.stringify(payload))
    );

    return JSON.stringify({
        version: 2,
        type: 'whereish-identity-encrypted',
        created: new Date().toISOString(),
        encryption: {
            algorithm: 'AES-256-GCM',
            kdf: 'PBKDF2',
            iterations: 100000,
            salt: nacl.util.encodeBase64(salt),
            iv: nacl.util.encodeBase64(iv)
        },
        payload: nacl.util.encodeBase64(new Uint8Array(encrypted)),
        account: { email: account.email }
    }, null, 2);
}

async function decryptIdentity(fileJson, pin) {
    const file = JSON.parse(fileJson);

    if (file.version !== 2) {
        throw new Error('Unsupported identity file version');
    }

    const salt = nacl.util.decodeBase64(file.encryption.salt);
    const iv = nacl.util.decodeBase64(file.encryption.iv);
    const encrypted = nacl.util.decodeBase64(file.payload);
    const key = await deriveKeyFromPIN(pin, salt);

    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );

        const payload = JSON.parse(new TextDecoder().decode(decrypted));

        return {
            identity: {
                privateKey: nacl.util.decodeBase64(payload.identity.privateKey),
                publicKey: nacl.util.decodeBase64(payload.identity.publicKey)
            },
            account: payload.account
        };
    } catch (e) {
        throw new Error('Incorrect PIN or corrupted file');
    }
}
```

---

## 7. Signal-Style PIN Verification

### 7.1 PIN Check Schedule

```javascript
const PIN_CHECK_CONFIG = {
    // Days between PIN checks
    intervalDays: 14,

    // Store last check time
    storageKey: 'whereish_last_pin_check'
};

async function shouldPromptForPIN() {
    const lastCheck = localStorage.getItem(PIN_CHECK_CONFIG.storageKey);

    if (!lastCheck) {
        return true;  // Never checked
    }

    const daysSinceCheck = (Date.now() - parseInt(lastCheck)) / (1000 * 60 * 60 * 24);
    return daysSinceCheck >= PIN_CHECK_CONFIG.intervalDays;
}

async function performPINCheck() {
    if (!await shouldPromptForPIN()) {
        return true;  // Not time yet
    }

    const pin = await showPINVerification();

    if (pin === null) {
        // User dismissed - show warning but allow continue
        showPINWarning();
        return true;
    }

    // Verify PIN by trying to decrypt a known value
    const verified = await verifyPIN(pin);

    if (verified) {
        localStorage.setItem(PIN_CHECK_CONFIG.storageKey, Date.now().toString());
        return true;
    } else {
        showPINIncorrectWarning();
        return true;  // Still allow use, just warn
    }
}

async function verifyPIN(pin) {
    // We store a small encrypted test value to verify PIN
    const testData = localStorage.getItem('whereish_pin_test');

    if (!testData) {
        return true;  // No test data, assume valid (legacy)
    }

    try {
        await decryptTestData(testData, pin);
        return true;
    } catch {
        return false;
    }
}
```

### 7.2 PIN Test Value (Set at Signup)

```javascript
async function storePINTestValue(pin) {
    // Encrypt a known value to verify PIN later
    const testValue = 'whereish-pin-test-' + Date.now();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyFromPIN(pin, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        new TextEncoder().encode(testValue)
    );

    const testData = JSON.stringify({
        salt: nacl.util.encodeBase64(salt),
        iv: nacl.util.encodeBase64(iv),
        data: nacl.util.encodeBase64(new Uint8Array(encrypted))
    });

    localStorage.setItem('whereish_pin_test', testData);
}
```

---

## 8. API Summary

### 8.1 New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/google` | POST | Google OAuth authentication |
| `/api/identity/backup` | POST | Store encrypted backup |
| `/api/identity/backup` | GET | Retrieve encrypted backup |
| `/api/identity/backup` | DELETE | Remove server backup |
| `/api/devices` | GET | List user's devices |
| `/api/devices/activate` | POST | Make current device active |
| `/api/devices/:id` | DELETE | Remove a device |

### 8.2 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `request_transfer` | Client → Server | Request identity from another device |
| `transfer_request` | Server → Client | Notify device of transfer request |
| `approve_transfer` | Client → Server | Send encrypted identity |
| `deny_transfer` | Client → Server | Deny transfer request |
| `transfer_complete` | Server → Client | Deliver encrypted identity |
| `transfer_denied` | Server → Client | Notify of denial |

### 8.3 Database Changes

| Table | Change |
|-------|--------|
| `users` | Add `google_id`, `encrypted_identity` |
| `devices` | New table for device registry |

---

## 9. Security Checklist

- [ ] Google token verified server-side with Google's API
- [ ] PIN never transmitted to server in plaintext
- [ ] PIN never stored (only used transiently for key derivation)
- [ ] PBKDF2 with 100k iterations for key derivation
- [ ] Random salt per encryption
- [ ] Random IV per encryption
- [ ] AES-GCM provides authenticated encryption
- [ ] Server backup is encrypted blob (server cannot decrypt)
- [ ] Device-to-device transfer uses same encryption
- [ ] WebSocket connections authenticated

---

## 10. Dependencies

### 10.1 Client

| Dependency | Purpose |
|------------|---------|
| Google Identity Services | OAuth flow |
| Web Crypto API | AES encryption, PBKDF2 |
| Socket.IO client | Real-time device transfer |
| nacl.js | Existing keypair generation |

### 10.2 Server

| Dependency | Purpose |
|------------|---------|
| `google-auth-library` | Verify Google tokens |
| `flask-socketio` | WebSocket support |
| `eventlet` or `gevent` | Async WebSocket backend |

```bash
pip install google-auth flask-socketio eventlet
```

---

## 11. Configuration

### 11.1 Environment Variables

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 11.2 Google Cloud Console Setup

1. Create OAuth 2.0 Client ID (Web application)
2. Authorized JavaScript origins:
   - `http://localhost:8080` (dev)
   - `https://whereish.app` (production)

---

*End of Design Document - Draft v1.1*
