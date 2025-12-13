# Scenarios and UX Design: Admin View

**Version:** 1.0 (Draft)
**Date:** December 13, 2025
**Status:** Awaiting Review
**Related:** PRD_ADMIN.md, DESIGN_ADMIN.md, Issue #20

---

## 1. Overview

This document defines the key admin scenarios and proposes a UX design for the Whereish admin interface. The admin view is integrated into the existing app, appearing as an additional tab visible only to admin users.

**Design Philosophy:**
- Admin UI should feel like a natural extension of the app
- Dangerous actions require clear confirmation
- Privacy-first: show metadata, never location data
- Audit trail visible to reinforce accountability

---

## 2. Core Admin Scenarios

### Scenario A: "Is the system healthy?"
**Frequency:** Daily check
**User goal:** Quickly verify system status

**Flow:**
1. Admin opens app
2. Taps Admin tab
3. Sees dashboard with key metrics
4. Done

**Design implications:**
- Dashboard is the admin landing page
- Key metrics visible at a glance
- No clicks needed for basic health check

---

### Scenario B: "Find and disable a problem user"
**Frequency:** Rare but critical
**User goal:** Quickly respond to abuse report

**Flow:**
1. Admin opens app → Admin tab
2. Taps "Users"
3. Searches for user by email
4. Taps user → sees detail
5. Taps "Disable Account"
6. Confirms action
7. User is disabled

**Design implications:**
- Search must be fast and prominent
- Disable action needs confirmation but not excessive friction
- Result should be immediately visible

---

### Scenario C: "Promote someone to admin"
**Frequency:** Very rare
**User goal:** Grant admin access to trusted user

**Flow:**
1. Admin finds user (as above)
2. Taps "Promote to Admin"
3. Enters own password (re-auth)
4. Confirms action
5. User is now admin

**Design implications:**
- Promote action requires password confirmation
- Clear warning about what this grants
- Action is logged

---

### Scenario D: "What happened last week?"
**Frequency:** Occasional (debugging, auditing)
**User goal:** Review admin activity

**Flow:**
1. Admin opens Admin tab
2. Taps "Audit Log"
3. Filters by date range
4. Reviews actions
5. Optionally exports

**Design implications:**
- Audit log needs good filtering
- Readable format (not raw JSON)
- Export for external analysis

---

### Scenario E: "Help user who forgot password"
**Frequency:** Occasional
**User goal:** Reset user's password

**Flow:**
1. Admin finds user
2. Taps "Reset Password"
3. Confirms
4. System generates temporary password
5. Admin shares with user out-of-band

**Design implications:**
- Clear feedback showing new temp password
- Guidance to share securely
- Logged in audit trail

---

## 3. Information Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Tab Bar                                  │
│  [Contacts]  [Places]  [Circles]  [Admin*]                   │
│                                     ↑                         │
│                            Only visible to admins             │
└─────────────────────────────────────────────────────────────┘

* Admin tab appears only when user.is_admin = true
```

### Admin Tab Structure

```
Admin (Tab)
├── Dashboard (default view)
│   └── Metrics cards
├── Users
│   ├── User List (search, filter)
│   └── User Detail
│       ├── Info section
│       └── Actions section
└── Audit Log
    ├── Log list (filter, search)
    └── Export option
```

---

## 4. Screen Designs

### 4.1 Admin Dashboard

**Purpose:** Quick system health overview

```
┌────────────────────────────────────────┐
│ ← Back                Admin            │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────┐  ┌──────────────┐   │
│  │     150      │  │      45      │   │
│  │ Total Users  │  │ Active (24h) │   │
│  └──────────────┘  └──────────────┘   │
│                                        │
│  ┌──────────────┐  ┌──────────────┐   │
│  │     320      │  │      12      │   │
│  │  Contacts    │  │   Pending    │   │
│  └──────────────┘  └──────────────┘   │
│                                        │
│  ┌──────────────┐  ┌──────────────┐   │
│  │    1,250     │  │     5 MB     │   │
│  │ Updates (24h)│  │   Database   │   │
│  └──────────────┘  └──────────────┘   │
│                                        │
├────────────────────────────────────────┤
│  Quick Actions                         │
│  ┌──────────────────────────────────┐ │
│  │ 👥  Manage Users                 → │ │
│  ├──────────────────────────────────┤ │
│  │ 📋  View Audit Log               → │ │
│  └──────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

### 4.2 User List

**Purpose:** Find and manage users

```
┌────────────────────────────────────────┐
│ ← Back                Users            │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ 🔍 Search by email or name...      │ │
│ └────────────────────────────────────┘ │
│                                        │
│ Filter: [All ▼]  Sort: [Recent ▼]     │
│                                        │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ JD  john@example.com               │ │
│ │     John Doe                       │ │
│ │     Active 2h ago • 5 contacts     │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ JS  jane@example.com          🛡️  │ │  ← Admin badge
│ │     Jane Smith                     │ │
│ │     Active 1d ago • 12 contacts    │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ BU  bad@example.com           ⛔  │ │  ← Disabled badge
│ │     Bad User                       │ │
│ │     Disabled • 0 contacts          │ │
│ └────────────────────────────────────┘ │
│                                        │
│         Page 1 of 8  [< >]            │
│                                        │
└────────────────────────────────────────┘
```

### 4.3 User Detail

**Purpose:** View user info and take actions

```
┌────────────────────────────────────────┐
│ ← Back              User Detail        │
├────────────────────────────────────────┤
│                                        │
│              ┌────┐                    │
│              │ JD │                    │
│              └────┘                    │
│           John Doe                     │
│        john@example.com                │
│                                        │
├────────────────────────────────────────┤
│ ACCOUNT INFO                           │
│                                        │
│ User ID         abc123def456           │
│ Status          ● Active               │
│ Role            Regular User           │
│ Created         Dec 1, 2025            │
│ Last Active     2 hours ago            │
│ Contacts        5                      │
│ Last Location   3 hours ago            │
│ Update          (timestamp only)       │
│                                        │
├────────────────────────────────────────┤
│ ACTIONS                                │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │      Reset Password              │  │
│ └──────────────────────────────────┘  │
│ ┌──────────────────────────────────┐  │
│ │      Disable Account             │  │
│ └──────────────────────────────────┘  │
│ ┌──────────────────────────────────┐  │
│ │      Promote to Admin      🔒   │  │  ← Lock = needs re-auth
│ └──────────────────────────────────┘  │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │   ⚠️  Delete Account       🔒   │  │  ← Danger styling
│ └──────────────────────────────────┘  │
│                                        │
└────────────────────────────────────────┘
```

### 4.4 Disable User Confirmation

**Purpose:** Confirm account disable action

```
┌────────────────────────────────────────┐
│                                        │
│         Disable Account?               │
│                                        │
│   This will prevent john@example.com   │
│   from logging in. Their data will     │
│   be preserved.                        │
│                                        │
│   You can re-enable later.             │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │           Cancel                 │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │      Disable Account             │ │  ← Primary/danger
│  └──────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

### 4.5 Promote Admin Confirmation (with Re-auth)

**Purpose:** Confirm admin promotion with password

```
┌────────────────────────────────────────┐
│                                        │
│         Promote to Admin?              │
│                                        │
│   john@example.com will gain full      │
│   admin access to:                     │
│   • View all users                     │
│   • Disable/enable accounts            │
│   • Promote other admins               │
│   • View audit logs                    │
│                                        │
│   Enter your password to confirm:      │
│                                        │
│   ┌────────────────────────────────┐  │
│   │ ••••••••                       │  │
│   └────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │           Cancel                 │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │       Promote to Admin           │ │
│  └──────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

### 4.6 Audit Log

**Purpose:** Review admin activity history

```
┌────────────────────────────────────────┐
│ ← Back              Audit Log          │
├────────────────────────────────────────┤
│                                        │
│ Filter: [All Events ▼]                 │
│ Date:   [Last 7 days ▼]                │
│                                        │
│                        [Export ↓]      │
│                                        │
├────────────────────────────────────────┤
│                                        │
│ Today                                  │
│ ┌──────────────────────────────────┐  │
│ │ 10:30 AM                         │  │
│ │ user.disabled                    │  │
│ │ admin@example.com disabled       │  │
│ │ baduser@example.com              │  │
│ └──────────────────────────────────┘  │
│ ┌──────────────────────────────────┐  │
│ │ 9:15 AM                          │  │
│ │ admin.login                      │  │
│ │ admin@example.com                │  │
│ │ accessed admin panel             │  │
│ └──────────────────────────────────┘  │
│                                        │
│ Yesterday                              │
│ ┌──────────────────────────────────┐  │
│ │ 4:00 PM                          │  │
│ │ user.password_reset              │  │
│ │ admin@example.com reset          │  │
│ │ password for user@example.com    │  │
│ └──────────────────────────────────┘  │
│                                        │
│         Load More...                   │
│                                        │
└────────────────────────────────────────┘
```

### 4.7 Password Reset Result

**Purpose:** Show temporary password after reset

```
┌────────────────────────────────────────┐
│                                        │
│         Password Reset                 │
│                                        │
│   ✓ Password reset for                │
│     john@example.com                   │
│                                        │
│   Temporary password:                  │
│   ┌────────────────────────────────┐  │
│   │  xK9#mP2$vL5n                  │  │  ← Copyable
│   └────────────────────────────────┘  │
│                [Copy]                  │
│                                        │
│   ⚠️  Share this securely with the   │
│      user. It won't be shown again.   │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │            Done                  │ │
│  └──────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

---

## 5. Design Principles Applied

| Principle | Application |
|-----------|-------------|
| **Minimal access** | Admins see user metadata, never location data |
| **Clear consequences** | Dangerous actions explain what will happen |
| **Re-auth for sensitive ops** | Promote/delete require password entry |
| **Audit visibility** | All actions logged, log is viewable |
| **Integrated UX** | Admin tab feels like part of the app |
| **Fast common tasks** | Search and disable flow is quick |

---

## 6. Visual Design Notes

### 6.1 Admin Tab Icon
- Shield icon (🛡️) to indicate protection/authority
- Or gear icon (⚙️) for settings feel
- Badge on icon if there are items needing attention (optional)

### 6.2 Status Badges
| Badge | Meaning | Color |
|-------|---------|-------|
| 🛡️ | Admin user | Blue |
| ⛔ | Disabled | Red |
| ● Active | Recently active | Green |
| ○ Inactive | Not recently active | Gray |

### 6.3 Action Button Styling
| Action Type | Style |
|-------------|-------|
| Normal | Default button |
| Dangerous | Red/warning color |
| Requires re-auth | Lock icon (🔒) suffix |

### 6.4 Metric Cards
- Large number, small label
- 2x2 grid on mobile
- Subtle background color
- Tap to see detail (future)

---

## 7. Responsive Considerations

### Mobile (Primary)
- Single column layout
- Full-width cards and buttons
- Bottom sheet for confirmations

### Tablet/Desktop
- Two-column layout for dashboard
- User list as sidebar, detail as main area
- Modal dialogs for confirmations

---

## 8. Accessibility

- All actions keyboard accessible
- Screen reader labels for icons
- Sufficient color contrast for badges
- Focus management in modals
- Error messages associated with inputs

---

## 9. Implementation Priority

### Phase 1: Core Admin
1. Admin tab (visible to admins only)
2. Dashboard with metrics
3. User list with search
4. User detail view
5. Disable/enable actions

### Phase 2: Advanced Actions
1. Password reset flow
2. Promote/demote admin
3. Delete user (with confirmations)

### Phase 3: Audit
1. Audit log view
2. Filtering and search
3. Export functionality

---

*End of Admin UX Design Document - Awaiting Review*
