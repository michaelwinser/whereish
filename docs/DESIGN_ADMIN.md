# System Design Document: Admin View

**Version:** 1.0 (Draft)
**Date:** December 13, 2025
**Status:** Awaiting Review
**Related:** PRD_ADMIN.md, Issue #20

---

## 1. Overview

This document describes the technical architecture for the Whereish admin interface. The design prioritizes:

1. **Security:** Admin access is strictly controlled and fully audited
2. **Privacy:** Admins can manage users without accessing their location data
3. **Simplicity:** Minimal additional complexity to the existing system
4. **Integration:** Admin UI is part of the existing app, not a separate application

---

## 2. Architecture Principles

### 2.1 Principle of Least Privilege

Admins have access only to what they need:
- User metadata (email, name, status) - YES
- User location data - NO
- Contact relationships - Counts only, not details
- System metrics - Aggregates only

### 2.2 Defense in Depth

Multiple layers of protection:
- Authentication (valid JWT)
- Authorization (is_admin flag)
- Re-authentication (sensitive operations)
- Audit logging (all actions recorded)
- Rate limiting (abuse prevention)

### 2.3 Integrated, Not Separate

The admin interface is integrated into the existing PWA:
- Same codebase, same deployment
- Reuses existing auth, styling, components
- Admin tab visible only to admin users
- No separate admin application to maintain

---

## 3. Security Model

### 3.1 Admin Identification

```
┌─────────────────────────────────────────────────────────────┐
│                      Authentication Flow                      │
├─────────────────────────────────────────────────────────────┤
│  1. User logs in (email/password)                            │
│  2. Server validates credentials                              │
│  3. Server checks is_admin flag                               │
│  4. Token includes admin claim: { sub: id, admin: true }     │
│  5. Client shows admin UI if token.admin === true            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Authorization Layers

| Layer | Check | Failure Response |
|-------|-------|------------------|
| Authentication | Valid JWT token | 401 Unauthorized |
| Admin flag | `is_admin = true` | 403 Forbidden |
| Re-auth | Password verified (sensitive ops) | 403 + re-auth prompt |
| Rate limit | < N requests/minute | 429 Too Many Requests |

### 3.3 Sensitive Operations

Operations requiring password re-entry:
- Promote user to admin
- Demote admin to user
- Delete user account
- View/export audit logs

### 3.4 Session Management

| Setting | Regular User | Admin User |
|---------|--------------|------------|
| Token expiry | 30 days | 4 hours |
| Refresh allowed | Yes | Yes (with activity) |
| Inactive timeout | None | 30 minutes |

---

## 4. Data Model

### 4.1 User Table Extension

```sql
-- Add to existing users table
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMP;
ALTER TABLE users ADD COLUMN disabled_by TEXT;  -- Admin who disabled
```

### 4.2 Audit Log Table

```sql
CREATE TABLE admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,      -- e.g., 'user.disabled', 'admin.promoted'
    actor_id TEXT NOT NULL,        -- Admin who performed action
    target_id TEXT,                -- User affected (if applicable)
    details TEXT,                  -- JSON with additional context
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (actor_id) REFERENCES users(id),
    FOREIGN KEY (target_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_event ON admin_audit_log(event_type);
CREATE INDEX idx_audit_log_actor ON admin_audit_log(actor_id);
CREATE INDEX idx_audit_log_target ON admin_audit_log(target_id);
```

### 4.3 Event Types

| Event Type | Description | Target |
|------------|-------------|--------|
| `user.registered` | New user signed up | User ID |
| `user.login` | User logged in | User ID |
| `user.login_failed` | Failed login attempt | Email (not user ID) |
| `user.disabled` | Account disabled by admin | User ID |
| `user.enabled` | Account re-enabled by admin | User ID |
| `user.deleted` | Account deleted by admin | User ID |
| `user.password_reset` | Password reset by admin | User ID |
| `admin.promoted` | User promoted to admin | User ID |
| `admin.demoted` | Admin demoted to user | User ID |
| `admin.login` | Admin accessed admin panel | Admin ID |
| `config.changed` | System config modified | Setting name |

---

## 5. API Design

### 5.1 Admin Endpoints

All admin endpoints require:
- Valid JWT with `is_admin = true`
- Prefix: `/api/admin/`

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin API Endpoints                        │
├─────────────────────────────────────────────────────────────┤
│ Dashboard                                                     │
│   GET  /api/admin/dashboard         → System metrics          │
│                                                               │
│ Users                                                         │
│   GET  /api/admin/users             → List users (paginated)  │
│   GET  /api/admin/users/:id         → User detail             │
│   POST /api/admin/users/:id/disable → Disable account         │
│   POST /api/admin/users/:id/enable  → Enable account          │
│   POST /api/admin/users/:id/reset   → Reset password          │
│   POST /api/admin/users/:id/promote → Promote to admin        │
│   POST /api/admin/users/:id/demote  → Demote from admin       │
│   DELETE /api/admin/users/:id       → Delete user             │
│                                                               │
│ Audit                                                         │
│   GET  /api/admin/logs              → Audit logs (paginated)  │
│   GET  /api/admin/logs/export       → Export logs (CSV/JSON)  │
│                                                               │
│ Config                                                        │
│   GET  /api/admin/config            → System configuration    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Response Formats

#### Dashboard Response
```json
{
  "metrics": {
    "users": {
      "total": 150,
      "active_24h": 45,
      "active_7d": 98,
      "admins": 2,
      "disabled": 3
    },
    "contacts": {
      "total": 320,
      "pending_requests": 12
    },
    "locations": {
      "updates_24h": 1250,
      "updates_7d": 8430
    },
    "system": {
      "uptime_seconds": 86400,
      "database_size_bytes": 5242880,
      "version": "1.0.0"
    }
  },
  "generated_at": "2025-12-13T10:30:00Z"
}
```

#### User List Response
```json
{
  "users": [
    {
      "id": "abc123",
      "email": "user@example.com",
      "name": "John Doe",
      "is_admin": false,
      "is_disabled": false,
      "created_at": "2025-12-01T10:00:00Z",
      "last_active": "2025-12-13T09:15:00Z",
      "contact_count": 5
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

#### Audit Log Response
```json
{
  "logs": [
    {
      "id": 1234,
      "event_type": "user.disabled",
      "actor": {
        "id": "admin123",
        "email": "admin@example.com"
      },
      "target": {
        "id": "user456",
        "email": "baduser@example.com"
      },
      "details": {
        "reason": "Abuse report"
      },
      "ip_address": "192.168.1.1",
      "created_at": "2025-12-13T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 1250
  }
}
```

### 5.3 Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Not an admin |
| 403 | `reauth_required` | Sensitive op needs password |
| 404 | `user_not_found` | User ID doesn't exist |
| 409 | `already_admin` | User is already admin |
| 429 | `rate_limited` | Too many requests |

---

## 6. Component Architecture

### 6.1 Server Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend (server/app.py)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Admin Middleware                          │ │
│  │  - require_admin decorator                                │ │
│  │  - Rate limiting                                          │ │
│  │  - Audit logging                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Admin Route Handlers                         │ │
│  │  - dashboard_handler                                      │ │
│  │  - users_handler                                          │ │
│  │  - audit_handler                                          │ │
│  │  - config_handler                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Admin Service Layer                          │ │
│  │  - get_dashboard_metrics()                                │ │
│  │  - list_users()                                           │ │
│  │  - disable_user()                                         │ │
│  │  - log_admin_action()                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Client Components

```
┌─────────────────────────────────────────────────────────────┐
│                    PWA Client (app/)                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  Admin API Client                         │ │
│  │  (app/admin-api.js)                                       │ │
│  │  - getDashboard()                                         │ │
│  │  - getUsers()                                             │ │
│  │  - disableUser()                                          │ │
│  │  - getAuditLogs()                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Admin UI Views                            │ │
│  │  (integrated in index.html)                               │ │
│  │  - Admin Dashboard View                                   │ │
│  │  - User List View                                         │ │
│  │  - User Detail View                                       │ │
│  │  - Audit Log View                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           │                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Admin Tab (Tab Bar)                          │ │
│  │  - Visible only if user.is_admin                          │ │
│  │  - Shield/gear icon                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Security Implementation

### 7.1 Admin Decorator

```python
def require_admin(f):
    """Decorator requiring admin access."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'error': 'Unauthorized'}), 401
        if not user.get('is_admin'):
            log_admin_action('admin.access_denied', user['id'], None, {})
            return jsonify({'error': 'Admin access required'}), 403
        g.current_admin = user
        return f(*args, **kwargs)
    return decorated
```

### 7.2 Re-authentication

```python
def require_reauth(f):
    """Decorator requiring password confirmation."""
    @wraps(f)
    def decorated(*args, **kwargs):
        password = request.json.get('password')
        if not password:
            return jsonify({'error': 'Password required', 'code': 'reauth_required'}), 403

        user = get_user_by_id(g.current_admin['id'])
        if not check_password_hash(user['password_hash'], password):
            log_admin_action('admin.reauth_failed', g.current_admin['id'], None, {})
            return jsonify({'error': 'Invalid password'}), 403

        return f(*args, **kwargs)
    return decorated
```

### 7.3 Audit Logging

```python
def log_admin_action(event_type, actor_id, target_id, details):
    """Log an admin action to the audit trail."""
    db = get_db()
    db.execute('''
        INSERT INTO admin_audit_log
        (event_type, actor_id, target_id, details, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        event_type,
        actor_id,
        target_id,
        json.dumps(details),
        request.remote_addr,
        request.headers.get('User-Agent', ''),
        datetime.utcnow()
    ))
    db.commit()
```

### 7.4 Rate Limiting

```python
# Simple in-memory rate limiting for admin endpoints
admin_rate_limits = {}  # { ip: [(timestamp, count)] }

def check_admin_rate_limit():
    """Check if admin request is within rate limits."""
    ip = request.remote_addr
    now = time.time()
    window = 60  # 1 minute window
    max_requests = 60  # 60 requests per minute

    # Clean old entries
    if ip in admin_rate_limits:
        admin_rate_limits[ip] = [
            (ts, c) for ts, c in admin_rate_limits[ip]
            if now - ts < window
        ]

    # Count requests in window
    count = sum(c for ts, c in admin_rate_limits.get(ip, []))

    if count >= max_requests:
        return False

    # Record this request
    admin_rate_limits.setdefault(ip, []).append((now, 1))
    return True
```

---

## 8. First Admin Setup

### 8.1 CLI Command

```python
# server/create_admin.py
"""Create an admin user from the command line."""

import sys
from app import app, get_db, generate_password_hash

def create_admin(email):
    with app.app_context():
        db = get_db()

        # Check if user exists
        user = db.execute(
            'SELECT id, is_admin FROM users WHERE email = ?',
            (email.lower(),)
        ).fetchone()

        if user:
            if user['is_admin']:
                print(f"User {email} is already an admin.")
                return
            # Promote existing user
            db.execute(
                'UPDATE users SET is_admin = TRUE WHERE id = ?',
                (user['id'],)
            )
            db.commit()
            print(f"Promoted {email} to admin.")
        else:
            print(f"User {email} not found. They must register first.")
            sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python -m server.create_admin <email>")
        sys.exit(1)
    create_admin(sys.argv[1])
```

### 8.2 Usage

```bash
# Promote existing user to admin
python -m server.create_admin admin@example.com
```

---

## 9. File Structure

```
server/
├── app.py              # Main app (add admin routes)
├── admin.py            # Admin route handlers (new)
├── create_admin.py     # CLI for creating admins (new)
└── ...

app/
├── index.html          # Add admin views
├── app.js              # Add admin UI logic
├── admin-api.js        # Admin API client (new)
├── style.css           # Add admin styles
└── ...
```

---

## 10. Migration Plan

### 10.1 Database Migration

```sql
-- Migration: Add admin support
-- Run once before deploying admin feature

-- Add admin columns to users
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMP;
ALTER TABLE users ADD COLUMN disabled_by TEXT;

-- Create audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON admin_audit_log(event_type);
```

### 10.2 Deployment Steps

1. Deploy database migration
2. Deploy backend with admin endpoints
3. Deploy frontend with admin UI
4. Create first admin via CLI
5. Verify admin access works
6. Monitor audit logs for issues

---

*End of Admin Design Document - Awaiting Review*
