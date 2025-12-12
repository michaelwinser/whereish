# Scenarios and UX Design

**Version:** 1.0 (Draft)
**Date:** December 12, 2025
**Status:** Awaiting Review

---

## 1. Overview

This document defines the key user scenarios for Whereish and proposes a UX design that supports them clearly. The goal is to create a simple, focused interface that makes common tasks easy while keeping advanced features accessible.

**Design Philosophy:**
- Primary UI optimized for the most common scenario (checking on contacts)
- Your own location is secondary (you know where you are)
- Permission management is important but infrequent - don't clutter the main view
- Progressive disclosure: simple list → detailed contact view → settings

---

## 2. Core Scenarios

### Scenario A: "Where is everyone?"
**Frequency:** Most common (daily use)
**User goal:** Quickly see where my contacts are

**Flow:**
1. Open app
2. See contact list with their current locations
3. Done

**Design implications:**
- Contact list should be the primary, most prominent element
- Each contact shows: name + their location (at whatever level I can see)
- No friction to see this information

---

### Scenario B: "I want to know when Sarah arrives"
**Frequency:** Occasional
**User goal:** Get notified when a specific contact reaches a location

**Flow:**
1. Open app
2. Tap on Sarah's contact
3. Set up notification subscription
4. Close app, wait for notification

**Design implications:**
- Notification setup lives in contact detail view
- Not cluttering the main list

---

### Scenario C: "I need to update what Bob can see of me"
**Frequency:** Rare (setup, then occasional adjustments)
**User goal:** Change sharing permission for a contact

**Flow:**
1. Open app
2. Tap on Bob's contact
3. Adjust "Share with Bob" permission level
4. Save

**Design implications:**
- Permission controls in contact detail view
- Clear distinction between "what I see of them" vs "what they see of me"

---

### Scenario D: "I'm at a new place I want to save"
**Frequency:** Rare
**User goal:** Create a named location

**Flow:**
1. Open app (see current location displayed)
2. Tap "Save this place"
3. Name it, set radius
4. Saved

**Design implications:**
- Current location needs to be visible (but compact)
- Save action should be accessible but not prominent

---

### Scenario E: "I need privacy right now"
**Frequency:** Rare but important
**User goal:** Quickly limit what everyone can see

**Flow:**
1. Open app
2. Activate "Go Dark" mode
3. Select ceiling level
4. Done - all contacts now see limited info

**Design implications:**
- Go Dark needs quick access (settings or main UI)
- Visual indicator when active

---

### Scenario F: "Who can see what about me?"
**Frequency:** Occasional (peace of mind check)
**User goal:** Understand my current sharing state

**Flow:**
1. Open app
2. View summary of what I'm sharing
3. Optionally drill into specific contacts

**Design implications:**
- "What I'm sharing" summary should be accessible
- Could be a dedicated view or part of settings

---

## 3. Information Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Main Screen                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Your Location (compact bar)                      │  │
│  │  "Downtown Seattle" or "Home"                     │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Contact List                                     │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ Sarah          "Boston, MA"           2,400mi│  │  │
│  │  ├─────────────────────────────────────────────┤  │  │
│  │  │ Mike           "Soccer Field"           0.3mi│  │  │
│  │  ├─────────────────────────────────────────────┤  │  │
│  │  │ Mom            "United States"              │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [+] Add Contact                                  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │
         │ tap contact
         ▼
┌─────────────────────────────────────────────────────────┐
│                   Contact Detail                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Sarah                                            │  │
│  │  sarah@example.com                                │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Their Location                                   │  │
│  │  "Boston, Massachusetts"                          │  │
│  │  ~2,400 miles away                                │  │
│  │  Updated 5 minutes ago                            │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  What Sarah sees of you                           │  │
│  │  [City          ▼]                                │  │
│  │  Sarah sees: "Seattle, WA"                        │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  What you see of Sarah                            │  │
│  │  City level (set by Sarah)                        │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Notifications                                    │  │
│  │  [ ] Notify me when Sarah is in Seattle           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Screen Designs

### 4.0 Welcome / Login Screen

**Purpose:** Entry point for logged-out users; showcases the app's value proposition

**When shown:** User is not logged in

**Layout:**
```
┌────────────────────────────────────┐
│                                    │
│           Whereish                 │
│                                    │
│     Privacy-first location         │
│          sharing                   │
│                                    │
├────────────────────────────────────┤
│                                    │
│   You are at:                      │
│                                    │
│   📍 123 Main Street               │
│      Downtown                      │
│      Seattle                       │
│      Washington                    │
│      United States                 │
│      North America                 │
│      Planet Earth                  │
│                                    │
├────────────────────────────────────┤
│                                    │
│   Share as much or as little       │
│   as you want with each contact.   │
│                                    │
├────────────────────────────────────┤
│                                    │
│      [    Log In    ]              │
│                                    │
│      [   Sign Up    ]              │
│                                    │
└────────────────────────────────────┘
```

**Key decisions:**

1. **Full location hierarchy displayed**
   - Shows the complete semantic breakdown from address to planet
   - Demonstrates the app's core value proposition immediately
   - User sees what they could share at each level

2. **No functionality until logged in**
   - Welcome screen is informational only
   - Encourages sign-up by showing what's possible

3. **Clean, focused design**
   - Logo and tagline
   - Location demo
   - Clear call-to-action buttons

---

### 4.1 Main Screen

**Purpose:** Quick overview of contacts and their locations (logged-in users)

**Layout:**
```
┌────────────────────────────────────┐
│ Whereish                    [⚙️]   │  ← Header with settings
├────────────────────────────────────┤
│ 📍 Downtown Seattle               │  ← Your location (compact)
│    at "Coffee Shop"               │  ← Named location if matched
├────────────────────────────────────┤
│ CONTACTS                    [+][↻]│  ← Section header
├────────────────────────────────────┤
│ ┌────────────────────────────────┐│
│ │👤 Sarah                        ││
│ │   Boston, MA              2.4k mi││  ← Location + distance
│ └────────────────────────────────┘│
│ ┌────────────────────────────────┐│
│ │👤 Mike                         ││
│ │   Soccer Field             0.3 mi││
│ └────────────────────────────────┘│
│ ┌────────────────────────────────┐│
│ │👤 Mom                          ││
│ │   United States                ││  ← No distance (too coarse)
│ └────────────────────────────────┘│
│ ┌────────────────────────────────┐│
│ │👤 Dad                          ││
│ │   Planet Earth            ⚫    ││  ← Minimal sharing indicator
│ └────────────────────────────────┘│
├────────────────────────────────────┤
│           Pending Requests (2)     │  ← Only if requests exist
└────────────────────────────────────┘
```

**Key decisions:**

1. **Your location is a compact bar**, not a full card
   - You know where you are; this is just confirmation
   - Shows named location match if applicable

2. **Contact list is the focus**
   - Name + their location + distance (when calculable)
   - No permission info cluttering the list
   - Distance gives context without needing precision

3. **"Planet Earth" contacts**
   - Show them but with minimal emphasis
   - Small indicator that sharing is minimal
   - User can tap to see details and adjust their own sharing

4. **No "Can see: X" on the list**
   - This was confusing (your view of them? their view of you?)
   - Permission details belong in the contact detail view

5. **Sort options** (accessible via header)
   - Distance (nearest first) - default
   - Alphabetical
   - Recently updated

---

### 4.2 Contact Detail Screen

**Purpose:** Full information about one contact, including permission management

**Layout:**
```
┌────────────────────────────────────┐
│ ← Back                             │
├────────────────────────────────────┤
│         👤                         │
│       Sarah                        │
│   sarah@example.com                │
├────────────────────────────────────┤
│ THEIR LOCATION                     │
│ ┌────────────────────────────────┐ │
│ │ Boston, Massachusetts          │ │
│ │ ~2,400 miles away              │ │
│ │ Updated 5 min ago              │ │
│ │                    [Open Maps] │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ WHAT SARAH SEES OF YOU             │
│ ┌────────────────────────────────┐ │
│ │ Permission: [City         ▼]  │ │
│ │                                │ │
│ │ Sarah currently sees:          │ │
│ │ "Seattle, Washington"          │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ WHAT YOU SEE OF SARAH              │
│ ┌────────────────────────────────┐ │
│ │ Permission: City               │ │
│ │ (Set by Sarah)                 │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ CIRCLES                            │
│ ┌────────────────────────────────┐ │
│ │ ☑ Family                       │ │
│ │ ☐ Soccer Team                  │ │
│ │ ☐ Work                         │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ NOTIFICATIONS                      │
│ ┌────────────────────────────────┐ │
│ │ ○ Notify when Sarah is nearby  │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │         Remove Contact         │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

**Key decisions:**

1. **Clear separation of "their view of you" vs "your view of them"**
   - Explicit section headers eliminate ambiguity
   - "What Sarah sees of you" = what YOU control
   - "What you see of Sarah" = what SARAH controls

2. **Live preview of what they see**
   - When you adjust permission, immediately show the result
   - "Sarah currently sees: Seattle, Washington"
   - No surprises - principle #2

3. **Open in Maps link**
   - When location is precise enough, offer to open external maps
   - Enables navigation without building maps into the app

4. **Notifications in context**
   - Set up location alerts for this specific contact
   - Not cluttering the main list

5. **Circles management in contact**
   - Quick checkboxes to add/remove from circles
   - Bidirectional with Circles screen (changes sync both ways)

---

### 4.3 Settings Screen

**Purpose:** App-wide settings and account management

**Layout:**
```
┌────────────────────────────────────┐
│ ← Back              Settings       │
├────────────────────────────────────┤
│ ACCOUNT                            │
│ ┌────────────────────────────────┐ │
│ │ Logged in as                   │ │
│ │ you@example.com                │ │
│ │                      [Log Out] │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ PRIVACY                            │
│ ┌────────────────────────────────┐ │
│ │ Go Dark Mode              [OFF]│ │
│ │ Temporarily limit sharing      │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ Sharing Summary            [→] │ │
│ │ See what each contact sees     │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ ABOUT                              │
│ ┌────────────────────────────────┐ │
│ │ How Whereish Works         [→] │ │
│ │ Privacy Policy             [→] │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

**Key decisions:**

1. **Logout lives in Settings**
   - Account section shows current user email
   - Log Out button returns to Welcome screen
   - Clears local session but preserves app installation

2. **My Places and Circles are NOT settings**
   - They have their own dedicated screens in main navigation
   - Settings is for account and app configuration only

---

### 4.4 Go Dark Screen

**Purpose:** Quickly limit what everyone can see

**Layout:**
```
┌────────────────────────────────────┐
│ ← Back              Go Dark        │
├────────────────────────────────────┤
│                                    │
│        🌑                          │
│                                    │
│   Go Dark temporarily limits       │
│   what ALL contacts can see,       │
│   regardless of their normal       │
│   permission level.                │
│                                    │
├────────────────────────────────────┤
│ Maximum visibility:                │
│                                    │
│   ○ Planet Earth (invisible)       │
│   ○ Country                        │
│   ● City                           │
│   ○ Normal (Go Dark off)           │
│                                    │
├────────────────────────────────────┤
│                                    │
│   Currently active:                │
│   Everyone sees at most: City      │
│                                    │
│   [  Disable Go Dark  ]            │
│                                    │
└────────────────────────────────────┘
```

---

### 4.5 Sharing Summary Screen

**Purpose:** Peace of mind - see what everyone can see

**Layout:**
```
┌────────────────────────────────────┐
│ ← Back         Sharing Summary     │
├────────────────────────────────────┤
│                                    │
│   What your contacts see:          │
│                                    │
├────────────────────────────────────┤
│ SEES YOUR STREET                   │
│ ┌────────────────────────────────┐ │
│ │ Mom      → "123 Main St"       │ │
│ │ Dad      → "123 Main St"       │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ SEES YOUR CITY                     │
│ ┌────────────────────────────────┐ │
│ │ Sarah    → "Seattle, WA"       │ │
│ │ Mike     → "Seattle, WA"       │ │
│ │ Alex     → "Seattle, WA"       │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ SEES YOUR COUNTRY                  │
│ ┌────────────────────────────────┐ │
│ │ Coworker → "United States"     │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ SEES NOTHING (PLANET)              │
│ ┌────────────────────────────────┐ │
│ │ Bob      → "Planet Earth"      │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

---

### 4.6 My Places Screen

**Purpose:** Manage named locations (a primary entity, not a setting)

**Layout:**
```
┌────────────────────────────────────┐
│ ← Back              My Places      │
├────────────────────────────────────┤
│                                    │
│   Your saved places appear when    │
│   you're nearby, letting contacts  │
│   see meaningful names like "Home" │
│   instead of just addresses.       │
│                                    │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 🏠 Home                        │ │
│ │    Street radius (~150m)       │ │
│ │    123 Main Street, Seattle    │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ 💼 Office                      │ │
│ │    Neighborhood radius (~750m) │ │
│ │    Downtown Seattle            │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ⚽ Soccer Field                │ │
│ │    Street radius (~150m)       │ │
│ │    Greenwood Park              │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│      [ + Add New Place ]           │
└────────────────────────────────────┘
```

**Tap a place to edit:**
```
┌────────────────────────────────────┐
│ ← Back            Edit Place       │
├────────────────────────────────────┤
│ NAME                               │
│ ┌────────────────────────────────┐ │
│ │ Home                           │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ RADIUS                             │
│ ┌────────────────────────────────┐ │
│ │ [Street ▼]  (~150m)            │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ LOCATION                           │
│ ┌────────────────────────────────┐ │
│ │ 123 Main Street                │ │
│ │ Seattle, Washington            │ │
│ │            [Use Current Location]│
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│                                    │
│   [ Save ]         [ Delete ]      │
│                                    │
└────────────────────────────────────┘
```

---

### 4.7 Circles Screen

**Purpose:** Manage contact groups with shared default permissions

**Layout:**
```
┌────────────────────────────────────┐
│ ← Back              Circles        │
├────────────────────────────────────┤
│                                    │
│   Circles let you group contacts   │
│   and set default permissions for  │
│   the whole group at once.         │
│                                    │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ 👨‍👩‍👧‍👦 Family                      │ │
│ │    Default: Street             │ │
│ │    4 members                   │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ 🏃 Soccer Team                 │ │
│ │    Default: City               │ │
│ │    12 members                  │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ 👥 Work                        │ │
│ │    Default: Country            │ │
│ │    8 members                   │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│      [ + Create Circle ]           │
└────────────────────────────────────┘
```

**Tap a circle to edit:**
```
┌────────────────────────────────────┐
│ ← Back            Edit Circle      │
├────────────────────────────────────┤
│ NAME                               │
│ ┌────────────────────────────────┐ │
│ │ Family                         │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ DEFAULT PERMISSION                 │
│ ┌────────────────────────────────┐ │
│ │ [Street ▼]                     │ │
│ │ Members see your street unless │ │
│ │ you set individual overrides   │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ MEMBERS                            │
│ ┌────────────────────────────────┐ │
│ │ Mom              [Street]  [×] │ │
│ │ Dad              [Street]  [×] │ │
│ │ Sister           [City] *  [×] │ │
│ │ Brother          [Street]  [×] │ │
│ │                                │ │
│ │      [ + Add Member ]          │ │
│ └────────────────────────────────┘ │
│ * = individual override            │
├────────────────────────────────────┤
│                                    │
│   [ Save ]         [ Delete ]      │
│                                    │
└────────────────────────────────────┘
```

**Key decisions:**

1. **Bidirectional management**
   - From Circles: add/remove contacts, see who's in each circle
   - From Contact Detail: add/remove from circles (add a CIRCLES section)

2. **Default + override model**
   - Circle sets default permission for all members
   - Individual contacts can have overrides (shown with indicator)
   - Contact Detail shows effective permission with source

---

## 5. Design Principles Applied

| Principle | How it's applied |
|-----------|------------------|
| **Privacy by default** | New contacts see "Planet Earth" until you configure sharing |
| **No surprises** | Contact detail shows exactly what they see with live preview |
| **Presence, not tracking** | Only current location shown, no history, no breadcrumbs |
| **Semantic over precise** | Labels like "Downtown Seattle" not coordinates |
| **Simple until complex** | Main list is clean; details on tap; settings for advanced |

---

## 6. Current UI Problems (Issue #6) → Solutions

| Problem | Solution |
|---------|----------|
| Single-pane UI too busy | Split into Main (list) + Contact Detail screens |
| "Can see: Planet" ambiguous | Move to Contact Detail with clear labels |
| Too much info on contact list | Show only: name, location, distance |
| Permission info clutters list | Permission controls only in Contact Detail |
| Named locations section prominent | Move to dedicated My Places screen; show match in location bar |

---

## 7. Navigation Flow

```
┌─────────────┐
│   Welcome   │  ← Logged-out entry point
│   Screen    │
└──────┬──────┘
       │ Login/Sign Up
       ▼
┌─────────────┐
│   Main      │  ← Logged-in entry point
│  (Contacts) │
└──────┬──────┘
       │
    ┌──┴───────────────┬───────────────┬───────────┐
    │                  │               │           │
    ▼                  ▼               ▼           ▼
┌────────┐      ┌─────────────┐   ┌────────┐ ┌────────┐
│Contact │      │  Settings   │   │  Add   │ │ Tab    │
│ Detail │      │             │   │Contact │ │  Nav   │
└────────┘      └──────┬──────┘   └────────┘ └────┬───┘
    │                  │                          │
    │          ┌───────┴───────┐          ┌───────┴───────┐
    │          │               │          │               │
    │          ▼               ▼          ▼               ▼
    │    ┌───────────┐  ┌───────────┐  ┌────────┐  ┌────────┐
    │    │  Go Dark  │  │  Sharing  │  │  My    │  │Circles │
    │    │           │  │  Summary  │  │ Places │  │        │
    │    └───────────┘  └───────────┘  └────────┘  └────────┘
    │
    └──────► Can navigate to Circles to add/remove this contact


Settings → Log Out → Welcome Screen
```

**Auth flow:**
- Logged out → Welcome Screen (with full location demo)
- Login/Sign Up → Main Screen
- Log Out (in Settings) → Welcome Screen

**Primary entities (accessible from main nav):**
- Contacts (the main list)
- My Places (secondary entity via tab)
- Circles (secondary entity via tab)
- Settings (app configuration via header icon)

---

## 8. Mobile Considerations

- **Touch targets:** Minimum 44x44 points for all interactive elements
- **Swipe navigation:** Back gesture to return to previous screen
- **Pull to refresh:** On contact list to update locations
- **Bottom sheet:** For quick actions (sort options, add contact)

---

## 9. Design Decisions (Resolved)

| Question | Decision |
|----------|----------|
| **My Places location** | Separate screen (secondary entity, not a setting) |
| **Stale location indicator** | Text "Last updated X ago" in Contact Detail |
| **Blocked contacts** | Section on contacts list OR separate list accessible from contacts page |
| **Circles UI** | Dedicated Circles screen (secondary entity); bidirectional management with contacts |

---

## 10. Implementation Priority

1. **Phase 1: Core restructure**
   - Welcome/Login screen with full location hierarchy
   - Separate Contact Detail screen
   - Simplify main contact list (name, location, distance only)
   - Move permissions to detail view
   - Add "Last updated" text for stale data
   - Logout in Settings returns to Welcome screen

2. **Phase 2: Secondary entities**
   - Bottom tab navigation (Contacts, Places, Circles)
   - My Places screen (move from main, make it a tab)
   - Circles screen with bidirectional contact management

3. **Phase 3: Privacy features**
   - Go Dark screen
   - Sharing Summary screen

4. **Phase 4: Enhanced features**
   - Notification subscriptions in contact detail
   - Blocked contacts section

---

## 11. Main Screen Navigation

The main screen needs navigation to access the secondary entities. Options:

**Option A: Bottom tab bar**
```
┌────────────────────────────────────┐
│ Whereish                    [⚙️]   │
├────────────────────────────────────┤
│                                    │
│         (Contact List)             │
│                                    │
├────────────────────────────────────┤
│  [Contacts]  [Places]  [Circles]   │
└────────────────────────────────────┘
```

**Option B: Header icons**
```
┌────────────────────────────────────┐
│ Whereish    [📍] [👥] [⚙️]         │
├────────────────────────────────────┤
│                                    │
│         (Contact List)             │
│                                    │
└────────────────────────────────────┘
```

**Recommendation:** Bottom tab bar for primary navigation (Contacts, Places, Circles), settings icon in header.

---

*End of UX Design Document - Awaiting Review*
