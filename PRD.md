# Product Requirements Document: Semantic Location Sharing

**Version:** 1.0 (Draft)
**Date:** December 11, 2025
**Status:** Awaiting Review

---

## 1. Executive Summary

A privacy-first location sharing application that shares **semantic labels** (human-readable locations) rather than raw coordinates. Users control exactly what each contact can see—from "Planet Earth" to a specific named location like "Soccer Field"—enabling meaningful presence sharing without surveillance.

**Core Philosophy:** Share presence, not coordinates. No tracking, no history, no surprises.

---

## 2. Problem Statement

Existing location sharing apps (Find My, Life360, Google Maps) operate on an all-or-nothing model: either share your precise, real-time GPS coordinates or share nothing. This creates problems:

- **Over-sharing:** Users uncomfortable sharing exact location with casual contacts
- **Under-sharing:** Users share nothing because they can't control granularity
- **Surveillance feel:** Continuous precise tracking feels invasive, even among family
- **Missed connections:** Friends don't know when you're in their city for a potential meetup

**Opportunity:** A location sharing app where users feel comfortable sharing because they control exactly what each person sees.

---

## 3. Target Users

**Primary (MVP):** Individuals and families who want to share presence with trusted contacts without feeling tracked.

**Use Cases:**
- Family members who want general awareness without surveillance
- Friends in different cities who want to know when someone's in town
- Activity groups (sports teams, clubs) who want to coordinate at shared locations
- Privacy-conscious users who reject current location sharing apps

---

## 4. Core Concepts

### 4.1 Semantic Labels (Never Raw Coordinates)

Location is always expressed as human-readable labels:
- Geographic hierarchy: Continent → Country → State → County → City → Zip → Street → Address
- Named locations: User-defined places ("Home", "Work", "Soccer Field", "Mom's House")

**Raw GPS coordinates never leave the device.** All geocoding happens locally.

### 4.2 Geographic Hierarchy

A tiered system of location granularity:

| Level | Example |
|-------|---------|
| Planet | Planet Earth |
| Continent | North America |
| Country | United States |
| State | Massachusetts |
| County | Middlesex County |
| City | Boston |
| Zip | 02139 |
| Street | 123 Main Street |
| Address | 123 Main Street, Apt 4B |

Each contact has a **baseline** geographic level—they see your location at that granularity or coarser.

### 4.3 Named Locations

User-defined semantic places that can **exceed** geographic baseline permissions:

- You define "Soccer Field" and share it with your Soccer Team group
- Team members normally see City-level, but when you're at Soccer Field, they see "Soccer Field"
- Named locations are explicit grants—bonuses on top of geographic baseline
- **Named locations are per-user:** Each user creates and manages their own named locations
- Named location coordinates are stored locally on the user's device (never sent to server)

### 4.4 Asymmetric, Opt-In Sharing

- Each direction of sharing is configured independently
- You control what you share with Mary; Mary controls what she shares with you
- Default sharing level: **Planet Earth** (effectively nothing)
- All sharing requires explicit configuration—no accidental over-sharing

### 4.5 Mutual Consent

- Sharing requires acceptance by the recipient
- If you share with Mary, Mary must accept to see your location
- If Mary shares back, you must accept to see hers
- Accepting does not obligate reciprocal sharing

---

## 5. Feature Requirements

### 5.1 MVP (Must Have)

#### Account & Identity
- [ ] Account creation with email or phone as unique identifier
- [ ] Authentication via username/password or Google OAuth
- [ ] Contact discovery via invite link/code or email/phone lookup (Signal-like model)

#### Contacts & Groups
- [ ] Add contacts with mutual acceptance flow
- [ ] Create groups/circles (e.g., "Family", "Soccer Team", "NYC Friends")
- [ ] Contacts can belong to multiple groups
- [ ] Individual permission overrides on top of group defaults

#### Sharing Permissions
- [ ] Set geographic baseline per contact/group (Planet → Address)
- [ ] Named locations with explicit visibility grants to contacts/groups
- [ ] Permission inheritance: contacts inherit group settings, individual overrides take precedence
- [ ] When contact belongs to multiple groups: configurable resolution (TBD - most permissive vs most restrictive)

#### Named Locations
- [ ] Create named locations by dropping pin or using current location
- [ ] Define geofence radius for named location
- [ ] Grant visibility to specific contacts/groups
- [ ] Named locations upgrade visibility (can show more detail than baseline)
- [ ] Named locations are **per-user** (each user has their own set, stored on their device)

#### Location Sharing
- [ ] On-device reverse geocoding (coordinates → semantic label)
- [ ] Server only receives/stores encrypted semantic labels
- [ ] Location updates at 5+ minute intervals
- [ ] Contacts see your location at their permitted granularity

#### Privacy Controls
- [ ] Go Dark / Visibility Ceiling: Temporary cap on maximum detail anyone can see
  - Example: "Cap at City" means even Family only sees City, named locations hidden
  - Levels: Planet Earth (complete ghost) through normal operation
- [ ] Block contacts: Removes all visibility AND prevents future share requests

#### Notifications
- [ ] Subscription-based: Users subscribe to location events they care about
- [ ] "Notify me when [Contact] is in [Location/Region]"
- [ ] **Proximity constraint (default):** Notifications only fire when subscriber is in the same geographic area
  - Example: Paul (in Seattle) subscribes to "notify when Michael is in Seattle"
  - Paul gets notified when Michael arrives in Seattle
  - Paul does NOT get notified when Michael arrives in Portland (Paul not in Portland)
  - Paul CAN still open app and see Michael is in Portland (passive viewing unaffected)
- [ ] Push notifications for subscribed events (subject to proximity constraint)
- [ ] Goal: Enable serendipitous meetups, prevent tracking/surveillance feel

#### Core UI
- [ ] **List view as primary interface** (semantic-first, not map-first)
  - Contacts grouped by circles (Family, Friends, etc.)
  - Sorted by geographic proximity within groups (nearest first)
  - Each entry: Name + semantic location label ("Sarah - Downtown Boston")
  - Visual indicator for nearby vs distant contacts
- [ ] **Open in Maps link**: When location is precise enough (city, zip, or finer), provide link to open in external mapping app
  - Enables navigation/meetup without building a map into the app
  - Keeps app semantic-focused; hands off to dedicated map apps
  - Respects platform conventions (Apple Maps, Google Maps, etc.)
- [ ] Map view: **deferred** - conflicts with semantic philosophy
  - Consider later only for short-term precision mode (explicit meetup coordination)
- [ ] Settings for managing permissions, groups, named locations
- [ ] Incoming/outgoing share request management
- [ ] "What does [Contact] see?" preview to support no-surprises principle

### 5.2 Fast Follow (Should Have)

#### Short-Term Precision Mode
- [ ] Temporarily share more precise location with selected contacts/groups
- [ ] Configurable duration (15 min / 30 min / 1 hour / until cancelled)
- [ ] Use case: "I'm at 5th and Main, come find me"
- [ ] Auto-expires, returns to normal sharing level

#### Emergency Share
- [ ] One-tap "share precise location with [designated group] for [duration]"
- [ ] Quick access from main UI
- [ ] Pre-configured emergency group (likely Family)
- [ ] Auto-expiry for safety

#### Enhanced Blocking
- [ ] Explicit block UI (psychologically reassuring beyond just "Planet Earth")
- [ ] Block list management
- [ ] Blocked users cannot send share requests

### 5.3 Deferred (Future Versions)

#### Circle-Owned Shared Locations (Not in Current Scope)
- [ ] Groups can have common named locations ("Soccer Field" owned by Soccer Team)
- [ ] All members can see when other members are at shared locations
- [ ] Subscribe to notifications for group location activity
- **Note:** Currently, named locations are per-user only. This feature would add group-shared locations that all members can reference.

#### Commuting / Inferred States
- [ ] Detect patterns: "On the way home", "On the way to work"
- [ ] Requires user to define Home, Work first
- [ ] Pattern learning from historical movement (with explicit consent)

#### Multi-Device Support (Open Issue)
- [ ] Handle user with phone, watch, tablet
- [ ] Determine which device's location is authoritative
- [ ] Options: most recent update, user-designated primary, device priority

---

## 6. Privacy & Security Requirements

### 6.1 Core Privacy Principles

1. **Coordinates never leave device:** All geocoding local, only semantic labels transmitted
2. **No location history:** Current location only, no historical tracking
3. **Explicit consent:** Every share relationship requires acceptance
4. **No surprises:** User always knows what's being shared with whom
5. **Default to nothing:** New contacts see "Planet Earth" until explicitly configured

### 6.2 Security Requirements

| Requirement | Priority |
|-------------|----------|
| TLS for all data in transit | Must Have |
| Encryption at rest for stored data | Must Have |
| Location data encrypted client-side | Must Have |
| Zero-knowledge server (cannot read location data) | Aspirational |
| End-to-end encryption (only intended recipients can decrypt) | Aspirational |

### 6.3 Zero-Knowledge Architecture (Aspirational)

Goal: Server facilitates sharing but literally cannot know where anyone is.

- User's location encrypted with keys only approved contacts possess
- Server stores and relays encrypted blobs
- Even in a breach, attacker gets meaningless encrypted data

*Architectural feasibility to be explored in Design Document.*

### 6.4 Compliance (Deferred)

To be addressed in future iteration:
- GDPR (EU users)
- CCPA (California users)
- COPPA (if allowing users under 13)

---

## 7. Technical Requirements

### 7.1 Update Frequency

- Location updates: 5+ minute intervals (configurable potentially)
- Priority: Minimal battery usage over real-time precision
- Background updates: Significant location change + periodic polling

### 7.2 Platform Requirements

| Platform | Capability |
|----------|------------|
| PWA (Prototype) | Core features, location when app open |
| Android PWA Wrapper | Background location, push notifications |
| iOS/Android Native | Full background location, all platform features |
| Web View | Location viewing, settings management (no location sharing) |

### 7.3 Battery Constraints

- **Hard requirement:** Minimal battery impact
- Approach: Significant location changes API + geofencing for named locations
- Avoid continuous GPS polling
- 5+ minute update interval supports this goal

---

## 8. Platform Roadmap

| Phase | Platform | Purpose |
|-------|----------|---------|
| 1 | PWA (all browsers) | Prototype, validate core UX |
| 2 | Android PWA Wrapper | Production pilot, background location |
| 3 | Android Native | Full production, optimal battery/location |
| 4 | iOS Native | Expand to iOS users |
| 5 | Web Dashboard | Desktop viewing and management |

---

## 9. Open Issues

### 9.1 Named Location Visibility Downgrade

**Question:** Can named locations restrict visibility (not just enhance)?

**Scenario:** User is at "Therapist Office" (a named location not shared with anyone). Contact has street-level access. What do they see?

**Options:**
1. Named locations only upgrade, never downgrade → Contact sees street address
2. Unshared named locations can hide → Contact sees City (or lower)
3. Named locations can be marked "private" explicitly

**Guiding Principle:** No surprises. User should always know what's shared.

**Resolution:** TBD - explore in design phase, possibly solve with UX ("preview what Mary sees")

### 9.2 Multi-Device Handling

**Question:** User has phone, watch, tablet. Which location is authoritative?

**Options:**
1. Most recent update wins
2. User designates primary device
3. Device type priority (phone > watch > tablet)
4. Show all devices to user, user chooses what to share

**Resolution:** TBD - explore in design phase

### 9.3 Multiple Group Membership Resolution

**Question:** Contact belongs to "Family" (street-level) and "Book Club" (city-level). Which permission applies?

**Options:**
1. Most permissive wins (street-level)
2. Most restrictive wins (city-level)
3. Most recently assigned group wins
4. Explicit conflict resolution UI required

**Resolution:** TBD - likely "most permissive" for simplicity, but explore implications

### 9.4 Notification Proximity Definition

**Question:** What defines "same geographic area" for proximity-constrained notifications?

**Options:**
1. Same city
2. Same metro area / region
3. Within configurable radius (e.g., 50 miles)
4. Matches subscriber's access level (if Paul has city-level, same city triggers notification)

**Resolution:** TBD - option 4 is elegant but may be confusing

### 9.5 Notification Exceptions for Family

**Question:** Should close family be able to opt-out of proximity constraint for notifications?

**Scenario:** Parent wants "notify me when child leaves school" even when parent is at work across town.

**Options:**
1. No exceptions - anti-stalking principle applies universally
2. User-configurable per relationship (default proximity-constrained, can opt-out)
3. Specific "Family" tier with different rules

**Resolution:** TBD - tension between safety use cases and anti-tracking philosophy

---

## 10. Success Metrics

### 10.1 Prototype Phase
- Functional PWA with core sharing flow
- User testing with 5-10 family/friends
- Validate core UX: permission model understandable?

### 10.2 Production Phase
- User retention: Do users keep sharing over time?
- Permission diversity: Are users using granular controls or just binary?
- Battery complaints: Acceptable background usage?
- Trust metric: Do users feel comfortable with what's shared?

---

## 11. Name Suggestions

Working title options (fun, memorable, privacy-evocative):

| Name | Rationale |
|------|-----------|
| **Whereish** | Captures the approximate/semantic nature |
| **Vaguely** | Privacy-first, not-precise sharing |
| **Vicinity** | You're in someone's vicinity, not at their GPS pin |
| **Hearabouts** | "Hereabouts" - general area, playful spelling |
| **Pinch** | A "pinch" of location - just enough |
| **Fuzzy** | Fuzzy location sharing |
| **Orbit** | You're in someone's orbit, not tracking them |
| **Marco** | From Marco Polo - "where are you?" without exact answer |

---

## 12. Appendix: User Stories

### Story 1: NYC Friend Notification
> As a user with friends in NYC, I want to be notified when my friend arrives in NYC, so I can reach out to meet up.

**Flow:**
1. Friend sets me to "City" level visibility
2. I subscribe to "Notify when [Friend] is in New York City"
3. Friend travels from Seattle to NYC, location updates
4. Because I am also in NYC, I receive push notification (proximity constraint satisfied)
5. I reach out via separate channel to arrange meetup

**Note:** If I were in Boston when Friend arrived in NYC, I would NOT receive a notification—but I could still open the app and see Friend is in NYC. This prevents tracking behavior while enabling serendipitous meetups.

### Story 2: Soccer Practice
> As a soccer parent, I want my teammates to know when I'm at the soccer field, without them tracking me everywhere.

**Flow:**
1. I create named location "Soccer Field"
2. I share "Soccer Field" with "Soccer Team" group
3. Group's geographic baseline remains "City"
4. When I arrive at field, teammates see "Soccer Field"
5. When I leave, teammates see "[City Name]" (or Planet Earth)

### Story 3: Going Dark
> As a user needing privacy, I want to temporarily hide my location from everyone without reconfiguring all my permissions.

**Flow:**
1. I enable "Go Dark" and set ceiling to "Country"
2. All contacts, regardless of their normal access, now see at most "United States"
3. My Family (normally street-level) sees "United States"
4. My named locations are hidden
5. Later, I disable "Go Dark"
6. All permissions return to normal without reconfiguration

### Story 4: New Contact Request
> As a privacy-conscious user, I want full control over who can see my location and what they see.

**Flow:**
1. Friend sends me a share request (wants to share her location with me)
2. I receive notification of incoming request
3. I accept → I can now see her location at whatever level she configured
4. I decide to share back → I configure her to "City" level
5. She receives my share request
6. She accepts → She can now see my city
7. Neither of us sees more than the other explicitly granted

---

*End of PRD - Awaiting Review*
