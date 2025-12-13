# Product Requirements Document: Admin View

**Version:** 1.0 (Draft)
**Date:** December 13, 2025
**Status:** Awaiting Review
**Related Issue:** #20

---

## 1. Executive Summary

An administrative interface for Whereish that enables system monitoring, user management, and operational oversight. The admin view is designed for a small number of trusted operators managing a self-hosted or small-scale deployment.

**Design Philosophy:** Minimal, auditable, and secure. Only include features that are genuinely needed for operation.

---

## 2. Problem Statement

As Whereish grows from prototype to production, operators need visibility into system health and the ability to respond to user issues:

- **No visibility:** Can't see how many users are active or if the system is healthy
- **User support:** No way to help users with account issues (locked out, need reset)
- **Abuse response:** No tools to handle bad actors or compromised accounts
- **Debugging:** Can't investigate reported issues without direct database access

**Opportunity:** A lightweight admin interface that provides essential operational capabilities without over-engineering.

---

## 3. Target Users

**Primary:** Self-hosting operators and small-scale deployment administrators.

**User Profiles:**

| Role | Description | Access Level |
|------|-------------|--------------|
| **Super Admin** | Full system access, can create other admins | All features |
| **Admin** | Standard admin access | User management, metrics, logs |
| **Support** | Limited access for user assistance | View-only user info, password reset |

**Note:** For MVP, only Super Admin role is needed. Role hierarchy can be added later.

---

## 4. Core Requirements

### 4.1 Access Control

#### Admin Identification
- **Flag-based:** Add `is_admin` boolean to users table
- **First admin:** Created via CLI command or environment variable on first run
- **Additional admins:** Promoted by existing Super Admin

#### Authentication
- **Same login flow** as regular users (email/password)
- Admin flag checked after authentication
- Admin UI only accessible if `is_admin = true`

#### Security Requirements
| Requirement | Priority |
|-------------|----------|
| Admin actions require re-authentication for sensitive ops | Should Have |
| Admin sessions have shorter expiry (4 hours vs 30 days) | Should Have |
| All admin actions logged with timestamp and actor | Must Have |
| Rate limiting on admin endpoints | Must Have |

### 4.2 Dashboard (Home)

Overview screen showing system health at a glance:

| Metric | Description |
|--------|-------------|
| Total users | Count of registered accounts |
| Active users (24h) | Users with location update in last 24 hours |
| Active users (7d) | Users with location update in last 7 days |
| Total contacts | Count of accepted contact relationships |
| Pending requests | Count of pending contact requests |
| Location updates (24h) | Number of location publishes in last 24 hours |
| Server uptime | Time since last restart |
| Database size | SQLite file size |

### 4.3 User Management

#### User List
- Paginated list of all users
- Search by email or name
- Sort by: created date, last active, name
- Filter by: active/inactive, admin/regular

#### User Detail
View user information (read-only by default):
- User ID, email, name
- Created date, last login
- Admin status
- Contact count
- Last location update timestamp (NOT the location itself)

#### User Actions
| Action | Description | Confirmation |
|--------|-------------|--------------|
| Disable account | Prevents login, preserves data | Yes |
| Enable account | Re-enables disabled account | No |
| Reset password | Sends reset email (if email configured) OR generates temp password | Yes |
| Promote to admin | Grants admin access | Yes + re-auth |
| Demote from admin | Removes admin access | Yes + re-auth |
| Delete account | Permanently removes user and all data | Yes + re-auth + type confirmation |

**Privacy Note:** Admins cannot view user locations or contact lists. Only metadata is visible.

### 4.4 Audit Log

Record of all significant system events:

| Event Type | Data Logged |
|------------|-------------|
| User registered | User ID, email, timestamp |
| User logged in | User ID, timestamp, IP (if available) |
| User disabled/enabled | User ID, admin actor, timestamp |
| Admin promoted/demoted | User ID, admin actor, timestamp |
| Password reset initiated | User ID, admin actor, timestamp |
| Account deleted | User ID, admin actor, timestamp |

#### Log Retention
- Default: 90 days
- Configurable via environment variable
- Older logs automatically purged

#### Log Access
- View logs in admin UI (paginated, searchable)
- Filter by event type, date range, user, actor
- Export to JSON/CSV for external analysis

### 4.5 System Configuration

View (and optionally edit) system settings:

| Setting | Editable | Description |
|---------|----------|-------------|
| Location expiry (minutes) | Yes | How long before location is stale |
| Token expiry (days) | Yes | JWT token lifetime |
| App version | View only | Current deployed version |
| Database path | View only | SQLite file location |

**Note:** Most settings require server restart to take effect.

---

## 5. Non-Requirements (Out of Scope)

The following are explicitly NOT included in MVP:

| Feature | Reason |
|---------|--------|
| View user locations | Privacy - admins should not see location data |
| View user contacts | Privacy - relationship data is private |
| Impersonate users | Security risk, privacy violation |
| Bulk user operations | Complexity, rarely needed |
| Real-time metrics | Complexity, polling is sufficient |
| Email/notification management | Separate feature, not admin-specific |
| API rate limit configuration | Environment variable is sufficient |
| Multi-tenant support | Out of scope for current architecture |

---

## 6. Security Requirements

### 6.1 Authentication & Authorization

- Admin endpoints require valid JWT with `is_admin = true`
- Sensitive operations require password re-entry
- Failed admin login attempts logged
- Account lockout after 5 failed attempts (15 min cooldown)

### 6.2 Audit Trail

- Every admin action creates audit log entry
- Logs include: action, actor, target, timestamp, IP
- Logs are append-only (no deletion via UI)
- Log tampering detectable via checksums (future)

### 6.3 Data Access

- Admins see user metadata only, never location data
- No bulk data export of user information
- Database backups exclude location payloads (or encrypt separately)

### 6.4 Network Security

- Admin endpoints rate limited (stricter than user endpoints)
- Optional: IP allowlist for admin access
- All admin traffic over HTTPS (enforced)

---

## 7. Technical Requirements

### 7.1 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Dashboard metrics |
| GET | `/api/admin/users` | List users (paginated) |
| GET | `/api/admin/users/:id` | User detail |
| POST | `/api/admin/users/:id/disable` | Disable user |
| POST | `/api/admin/users/:id/enable` | Enable user |
| POST | `/api/admin/users/:id/reset-password` | Reset password |
| POST | `/api/admin/users/:id/promote` | Promote to admin |
| POST | `/api/admin/users/:id/demote` | Demote from admin |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/logs` | Audit logs (paginated) |
| GET | `/api/admin/config` | System configuration |

### 7.2 Database Changes

```sql
-- Add admin flag to users table
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

-- Create audit log table
CREATE TABLE admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor_id TEXT,  -- Admin who performed action
    target_id TEXT, -- User affected (if applicable)
    details TEXT,   -- JSON with additional context
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_created ON admin_audit_log(created_at);
CREATE INDEX idx_audit_event ON admin_audit_log(event_type);
CREATE INDEX idx_audit_actor ON admin_audit_log(actor_id);
```

### 7.3 UI Approach

**Integrated admin view** within existing app:
- New "Admin" tab visible only to admins
- Reuses existing UI components and styling
- No separate admin application to maintain

**Alternative considered:** Separate admin app
- Rejected: Increases maintenance burden, overkill for small deployments

---

## 8. Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Add `is_admin` column to users table
- [ ] Create first admin via CLI
- [ ] Admin dashboard with basic metrics
- [ ] User list with search
- [ ] Disable/enable user accounts
- [ ] Basic audit logging

### Phase 2: User Management
- [ ] User detail view
- [ ] Password reset functionality
- [ ] Promote/demote admin
- [ ] Account deletion with confirmation

### Phase 3: Audit & Security
- [ ] Full audit log UI
- [ ] Log filtering and export
- [ ] Re-authentication for sensitive ops
- [ ] Session timeout for admin sessions

### Phase 4: Polish
- [ ] System configuration view
- [ ] Admin role hierarchy (Super Admin, Admin, Support)
- [ ] IP allowlist option
- [ ] Log retention management

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Admin can check system health | < 5 seconds to load dashboard |
| Admin can find a user | < 10 seconds with search |
| Admin can disable a bad actor | < 30 seconds end-to-end |
| All admin actions are logged | 100% coverage |
| Admin cannot access user locations | Verified by code review |

---

## 10. Open Questions

### 10.1 First Admin Creation

**Question:** How is the first admin account created?

**Options:**
1. CLI command: `python -m server.create_admin email@example.com`
2. Environment variable: `ADMIN_EMAIL=email@example.com` on first run
3. First registered user is automatically admin
4. Setup wizard on first access

**Recommendation:** Option 1 (CLI command) - explicit, secure, no magic

### 10.2 Password Reset Mechanism

**Question:** How does password reset work without email infrastructure?

**Options:**
1. Admin generates temporary password, shares out-of-band
2. Integrate email sending (adds complexity)
3. Magic link via configured SMTP
4. No password reset - user must re-register

**Recommendation:** Option 1 for MVP, Option 3 as enhancement

### 10.3 Admin Notification of Critical Events

**Question:** Should admins be notified of critical events (many failed logins, etc.)?

**Options:**
1. No notifications - admin checks dashboard periodically
2. Email alerts for critical events
3. Webhook integration for external alerting

**Recommendation:** Option 1 for MVP, revisit based on operational needs

---

*End of Admin PRD - Awaiting Review*
