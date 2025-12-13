# System Design Document: Semantic Location Sharing

**Version:** 1.0 (Draft)
**Date:** December 11, 2025
**Status:** Awaiting Review

---

## 1. Overview

This document describes the technical architecture for a privacy-first semantic location sharing application. The design prioritizes:

1. **Zero-knowledge architecture:** Server cannot see user location data
2. **Minimal dependencies:** Supply chain security through simplicity
3. **Incremental development:** Always-working app with layered functionality
4. **Transport abstraction:** Simple REST for prototype, Matrix for production

---

## 2. Architecture Principles

### 2.1 Privacy by Architecture

The system is designed so that even a compromised server reveals no location data:

- Location data encrypted client-side before transmission
- Server stores and routes opaque blobs
- Decryption keys only held by authorized contacts
- Server handles control plane (permissions), not data plane (locations)

### 2.2 Minimal Dependencies

- **Frontend:** Vanilla JS, no framework, no build step
- **Backend:** Python stdlib + Flask only
- **No npm:** Eliminates JavaScript supply chain risk
- **Explicit dependencies:** Every dependency justified and audited

### 2.3 Transport Abstraction

Clean separation allows transport swap without rewriting app logic:

```
┌─────────────────────────────────────────────────────────┐
│                    Application Logic                     │
├─────────────────────────────────────────────────────────┤
│                  Transport Interface                     │
├───────────────────────┬─────────────────────────────────┤
│   REST (Prototype)    │       Matrix (Production)       │
└───────────────────────┴─────────────────────────────────┘
```

---

## 3. Privacy Classification

### 3.1 Zero-Knowledge (Server Never Sees)

| Data | Notes |
|------|-------|
| Current location | Encrypted payload, server sees blob only |
| Location coordinates | Never leave device; geocoded locally |
| Named location coordinates | Stored on device only |
| Location history | Not stored anywhere (by design) |

### 3.2 Server-Visible (When Backend Exists)

| Data | Notes |
|------|-------|
| User identity | Google OAuth token, email |
| Contact relationships | Who has connected with whom |
| Permission levels | What granularity is granted (but not actual locations) |
| Named location labels | "Soccer Field" (but not its coordinates) - TBD |
| Encrypted blobs | Ciphertext only, no plaintext |

### 3.3 Client-Only

| Data | Notes |
|------|-------|
| User settings/preferences | Stored locally |
| Named location definitions | Label + coordinates + geofence |
| Decryption keys | For contacts' location data |
| Own location history | Not stored (design decision) |

### 3.4 Named Location Labels

Should the server know named location labels ("Soccer Field") or only encrypted references?

- **Labels visible:** Enables server-side features (search, suggestions)
- **Labels hidden:** Maximum privacy, but limits functionality

**Current decision:** Labels are included in the location payload (currently plaintext, eventually encrypted). The server performs visibility filtering based on `visible_to` metadata, but ideally should not read the labels themselves. See Issue #30 for zero-knowledge architecture plans.

**Key privacy note:** Named location visibility is controlled separately from geographic permissions. A contact with street-level geographic access does NOT automatically see named location labels. See §5.5 for details.

---

## 4. Component Architecture

### 4.1 High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         PWA Client                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Geolocation │  │  Geocoder   │  │  UI (Vanilla JS)        │  │
│  │  Service     │  │  (Local)    │  │  - Contact List         │  │
│  └──────┬──────┘  └──────┬──────┘  │  - Permissions           │  │
│         │                │         │  - Settings              │  │
│         ▼                ▼         └─────────────────────────┘  │
│  ┌─────────────────────────────┐                                │
│  │     Location Manager        │                                │
│  │  - Coordinate → Semantic    │                                │
│  │  - Named Location Matching  │                                │
│  │  - Hierarchy Resolution     │                                │
│  └──────────────┬──────────────┘                                │
│                 ▼                                                │
│  ┌─────────────────────────────┐                                │
│  │   Encryption Layer (Stub)   │  ← Passthrough now, E2E later  │
│  └──────────────┬──────────────┘                                │
│                 ▼                                                │
│  ┌─────────────────────────────┐                                │
│  │   Transport Interface       │                                │
│  └──────────────┬──────────────┘                                │
└─────────────────┼───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Prototype)                           │
│  ┌─────────────────────────────┐  ┌─────────────────────────┐   │
│  │   REST API (Flask)          │  │   Storage               │   │
│  │   - POST /location          │  │   - Postgres/Firestore  │   │
│  │   - GET /contacts/{id}      │  │   - Encrypted blobs     │   │
│  │   - POST /permissions       │  │   - Permission metadata │   │
│  └─────────────────────────────┘  └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Client Components

#### Geolocation Service
- Wraps browser Geolocation API
- Configurable update interval (default: 5 minutes)
- Battery-conscious polling strategy
- Falls back gracefully when permission denied

#### Local Geocoder
- Converts coordinates to semantic hierarchy
- **Critical:** Coordinates never leave this component
- Options for implementation:
  - Offline geocoding database (large but private)
  - On-device API call with coordinate fuzzing
  - Hybrid: coarse local, precise via API when needed
- Outputs: { continent, country, state, county, city, zip, street, address }

#### Location Manager
- Determines current semantic location
- Checks against named locations (geofence matching)
- Resolves what label to show based on matches
- Applies permission filters per contact

#### Encryption Layer
- **Prototype:** Passthrough (no-op)
- **Production:** E2E encryption using Matrix Olm/Megolm
- Interface remains constant; implementation swaps

#### Transport Interface
```python
class LocationTransport(Protocol):
    def publish_location(self, encrypted_payload: bytes) -> None: ...
    def get_contact_location(self, contact_id: str) -> bytes | None: ...
    def subscribe_to_updates(self, contact_id: str) -> AsyncIterator[bytes]: ...
```

### 4.3 Backend Components (Prototype)

#### REST API
- Flask with minimal dependencies
- Endpoints for location publish/retrieve, permissions, contacts
- Treats location payloads as opaque blobs
- No parsing or inspection of location data

#### Storage Layer
- Abstract repository pattern
- Implementations: Postgres, Firestore
- Schema designed for encrypted blobs
- Permission metadata in separate tables

---

## 5. Data Model

### 5.1 User
```
User {
    id: UUID
    email: String (unique)
    phone: String? (unique if present)
    created_at: Timestamp
    auth_provider: Enum (google, email)
}
```

### 5.2 Contact Relationship
```
ContactRelationship {
    id: UUID
    requester_id: UUID (FK User)
    recipient_id: UUID (FK User)
    status: Enum (pending, accepted, blocked)
    created_at: Timestamp
    accepted_at: Timestamp?
}
```

Note: Asymmetric - two separate relationships for bidirectional sharing.

### 5.3 Permission Grant
```
PermissionGrant {
    id: UUID
    granter_id: UUID (FK User)
    grantee_id: UUID (FK User)
    geographic_level: Enum (planet, continent, country, state, county, city, zip, street, address)
    created_at: Timestamp
    updated_at: Timestamp
}
```

### 5.4 Circle (Group)
```
Circle {
    id: UUID
    owner_id: UUID (FK User)
    name: String
    default_geographic_level: Enum
    created_at: Timestamp
}

CircleMembership {
    circle_id: UUID (FK Circle)
    user_id: UUID (FK User)
    added_at: Timestamp
}
```

### 5.5 Named Location (Client-Side, Per-User)
```
NamedLocation {
    id: UUID
    user_id: UUID              // Owner of this named location
    label: String
    coordinates: { lat: Float, lng: Float }  // Never sent to server
    radius_meters: Float
    visibility: {
        mode: Enum (private, all, selected)
        contact_ids: List<UUID>  // Only used when mode is "selected"
    }
    created_at: Timestamp
}
```

**Storage:** Named locations are stored in IndexedDB on the client, scoped by user_id. Each user has their own set of named locations. Circle-owned shared locations are a deferred feature (see PRD §5.3).

#### Key Principle: Orthogonal Permission Systems

**Named location visibility is completely independent of geographic permissions.**

| Permission Type | Controls | Default | Stored |
|----------------|----------|---------|--------|
| Geographic baseline | Address hierarchy level (city, street, etc.) | Planet Earth | Server |
| Named location visibility | Whether semantic labels are shown | Private | Client |

This means:
- A contact with "planet" geographic permission can still see "Soccer Field" if granted visibility
- A contact with "street" geographic permission will NOT see "Cancer Treatment Facility" unless granted visibility
- The two permission systems never interact—they control different data

### 5.6 Location Update (Encrypted Blob)
```
LocationUpdate {
    user_id: UUID
    encrypted_payload: Bytes  // Server cannot read
    timestamp: Timestamp
    expires_at: Timestamp
}
```

The encrypted payload, when decrypted, contains:
```
DecryptedLocation {
    hierarchy: {
        continent: String?,
        country: String?,
        state: String?,
        county: String?,
        city: String?,
        zip: String?,
        street: String?,
        address: String?
    }
    named_location: {
        label: String           // "Soccer Field", "Home", etc.
        visible_to: "private" | "all" | List<UUID>  // Who can see this label
    }?
    precision_mode: Boolean  // Temporary precision sharing active
    timestamp: Timestamp
}
```

#### Filtering Logic

When a contact requests location, the server applies **two independent filters**:

1. **Geographic filter:** Based on `PermissionGrant.geographic_level`, include only hierarchy fields at or above that level

2. **Named location filter:** Based on `named_location.visible_to`:
   - `"private"` → never include named_location
   - `"all"` → include named_location for all contacts
   - `[list of UUIDs]` → include only if requesting contact's ID is in the list

These filters operate independently. A contact may see the street address but not the named location label, or vice versa.

---

## 6. API Design (Prototype)

### 6.1 Authentication
```
POST /auth/google
    Request: { id_token: String }
    Response: { session_token: String, user: User }
```

### 6.2 Location
```
POST /location
    Headers: { Authorization: Bearer <session_token> }
    Request: { encrypted_payload: Base64String }
    Response: { success: Boolean }

GET /location/{user_id}
    Headers: { Authorization: Bearer <session_token> }
    Response: { encrypted_payload: Base64String?, timestamp: ISO8601? }
    Note: Only returns data if requester has accepted share from user_id
```

### 6.3 Contacts
```
GET /contacts
    Response: { contacts: List<Contact> }

POST /contacts/request
    Request: { email_or_phone: String }
    Response: { request_id: UUID, status: "pending" }

POST /contacts/request/{request_id}/accept
    Response: { contact: Contact }

POST /contacts/request/{request_id}/decline
    Response: { success: Boolean }

POST /contacts/{contact_id}/block
    Response: { success: Boolean }
```

### 6.4 Permissions
```
GET /permissions/{contact_id}
    Response: { geographic_level: String, named_locations: List<UUID> }

PUT /permissions/{contact_id}
    Request: { geographic_level: String, named_locations: List<UUID> }
    Response: { success: Boolean }
```

### 6.5 Circles
```
GET /circles
    Response: { circles: List<Circle> }

POST /circles
    Request: { name: String, default_geographic_level: String }
    Response: { circle: Circle }

POST /circles/{circle_id}/members
    Request: { contact_id: UUID }
    Response: { success: Boolean }

PUT /circles/{circle_id}/permissions
    Request: { default_geographic_level: String }
    Response: { success: Boolean }
```

---

## 7. Technology Stack

### 7.1 Frontend
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Vanilla JavaScript | No build step, no npm, minimal supply chain |
| UI | HTML + CSS | No framework dependencies |
| Storage | IndexedDB / localStorage | Client-side persistence |
| PWA | Service Worker | Offline capability, installable |
| Geolocation | Browser API | Standard, no dependencies |

### 7.2 Backend (Prototype)
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Python 3.11+ | Familiar, good stdlib, quick iteration |
| Framework | Flask | Minimal dependencies, simple REST |
| Database | Postgres or Firestore | Abstracted via repository pattern |
| Auth | Google OAuth | No password management, trusted provider |
| Hosting | Cloud Run | Serverless, scales to zero, Docker-based |
| Container | Docker | Portable, minimal platform lock-in |

### 7.3 Production Additions
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Transport | Matrix (Dendrite) | E2E encryption, self-hostable, Go-based |
| Encryption | Matrix Olm/Megolm | Battle-tested, Signal-protocol-based |

---

## 8. Geocoding Strategy

### 8.1 Requirements
- Coordinates must not leave device (privacy requirement)
- Need to resolve: coordinates → full geographic hierarchy
- Named location matching (point-in-geofence)

### 8.2 Options Evaluated

| Option | Privacy | Accuracy | Size | Complexity |
|--------|---------|----------|------|------------|
| Offline DB (full) | Excellent | High | 1-10GB | Medium |
| Offline DB (coarse) | Excellent | Medium | 50-200MB | Medium |
| Fuzzy API call | Good | High | None | Low |
| Tile-based hybrid | Excellent | High | Variable | High |

### 8.3 Recommended Approach (Prototype)

**Browser reverse geocoding with privacy consideration:**

For prototype, use browser/OS geocoding if available, or a reverse geocoding API with understanding that coordinates are exposed to that service. Document this as a known prototype limitation.

**Production approach:**
- Offline database for country/state/city (covers 90% of cases)
- Optional: coarse coordinate fuzzing for API calls (±0.5km)
- Named location matching always local (geofence check)

### 8.4 Open Question: Geocoding Service

Need to select a geocoding provider or offline database:
- **Nominatim (OpenStreetMap):** Free, self-hostable, but running it locally is complex
- **Offline extract:** Country/state/city boundaries as GeoJSON (~100MB)
- **API with fuzzing:** Google/Mapbox with coordinates rounded to reduce precision

**Decision:** Defer to implementation. Start with API for prototype; optimize for privacy in production.

---

## 9. Matrix Integration (Production)

### 9.1 Why Matrix
- E2E encryption built-in (Olm/Megolm)
- Open protocol, self-hostable
- Key management handled by protocol
- Designed for exactly this kind of application

### 9.2 Architecture with Matrix

```
┌─────────────────┐         ┌─────────────────┐
│   Your Device   │         │  Contact Device │
│  ┌───────────┐  │         │  ┌───────────┐  │
│  │ Location  │  │         │  │ Location  │  │
│  │ Manager   │  │         │  │ Display   │  │
│  └─────┬─────┘  │         │  └─────▲─────┘  │
│        │        │         │        │        │
│  ┌─────▼─────┐  │         │  ┌─────┴─────┐  │
│  │ Matrix    │  │ E2E     │  │ Matrix    │  │
│  │ Client    │◄─┼─────────┼─►│ Client    │  │
│  └─────┬─────┘  │         │  └─────┬─────┘  │
└────────┼────────┘         └────────┼────────┘
         │                           │
         ▼                           ▼
    ┌─────────────────────────────────────┐
    │         Matrix Homeserver           │
    │   (Dendrite - self-hosted)          │
    │   - Routes encrypted messages       │
    │   - Cannot read content             │
    │   - Manages room membership         │
    └─────────────────────────────────────┘
```

### 9.3 Room Topology

**Recommended: One room per sharing direction**

- You create a room for your location broadcasts
- You invite contacts who should see your location
- Their membership = their decryption access
- Revoking access = removing from room

**Permission levels via room hierarchy:**
- Different rooms for different precision levels
- Contact joins room matching their permission level
- Changing permission = moving to different room

### 9.4 Control Plane Server

Even with Matrix, a lightweight backend may be useful for:
- Google OAuth → Matrix ID mapping
- Contact discovery by email/phone
- Permission metadata (what level each contact should have)
- Named location label storage (if not fully client-side)

This server never sees location data - Matrix handles that.

---

## 10. Milestone Plan

### Phase 1: Foundation (Milestones 1-3)

#### Milestone 1: Self Location Display
**Goal:** User sees their own semantic location

**Deliverables:**
- PWA shell (HTML/CSS/JS, installable)
- Browser geolocation integration
- Reverse geocoding (API-based for prototype)
- Display geographic hierarchy (City, State, Country, etc.)
- Local storage for preferences

**Demo:** Open app → see "You are in: Seattle, Washington, United States"

**Decisions validated:**
- Geolocation API works in PWA context
- Geocoding produces useful hierarchy
- Basic UX for semantic display

---

#### Milestone 2: Named Locations
**Goal:** User can define and see named locations

**Deliverables:**
- Create named location (label + current position + radius)
- Store named locations in IndexedDB
- Geofence matching (am I at a named location?)
- Display named location when matched

**Demo:** Define "Home" → leave → come back → see "You are at: Home"

**Decisions validated:**
- Geofence detection works
- Named location UX is intuitive
- Local storage model is sufficient

---

#### Milestone 3: Simple Backend
**Goal:** Basic server for location storage/retrieval

**Deliverables:**
- Flask app with REST endpoints
- Docker container, deployable to Cloud Run
- Postgres/Firestore storage (pick one for prototype)
- POST location, GET location endpoints
- Hardcoded test users (no auth yet)

**Demo:** Two browser windows → each sees other's location

**Decisions validated:**
- REST transport works
- Server correctly treats payloads as opaque
- Cloud Run deployment works

---

### Phase 2: Sharing Model (Milestones 4-6)

#### Milestone 4: Authentication
**Goal:** Real user accounts via Google OAuth

**Deliverables:**
- Google OAuth integration
- Session management
- User creation on first login

**Demo:** Sign in with Google → see your location → sign out → sign back in

---

#### Milestone 5: Contacts & Permissions
**Goal:** Add contacts, set geographic permission levels

**Deliverables:**
- Send/accept contact requests (by email)
- Set geographic level per contact
- Filter location display based on permission
- Contact list UI

**Demo:** Add friend → set them to "city" → they see your city, not street

---

#### Milestone 6: Circles
**Goal:** Group contacts with shared permissions

**Deliverables:**
- Create/manage circles
- Add contacts to circles
- Circle-level default permissions
- Individual overrides

**Demo:** Create "Family" circle → set to "street" → add members → they all see street-level

---

### Phase 3: Privacy & Polish (Milestones 7-9)

#### Milestone 7: Go Dark / Visibility Ceiling
**Goal:** Temporarily cap all sharing

**Deliverables:**
- Go Dark UI (set maximum visibility)
- Override logic in location filtering
- Visual indicator when Go Dark active

**Demo:** Enable "Go Dark: City" → all contacts see at most city, even Family

---

#### Milestone 8: Named Location Sharing
**Goal:** Share named locations with specific contacts/circles

**Deliverables:**
- Configure visibility per named location
- Named location grants exceed geographic baseline
- "What does X see?" preview

**Demo:** Share "Soccer Field" with team → they see "Soccer Field" when you're there

---

#### Milestone 9: Notifications (Basic)
**Goal:** Subscribe to contact location events

**Deliverables:**
- Subscribe to "contact in region" events
- Proximity constraint (same area only)
- Push notification integration

**Demo:** Subscribe to "friend in Seattle" → get notified when they arrive (while you're in Seattle)

---

### Phase 4: Production Readiness (Milestones 10-12)

#### Milestone 10: Matrix Integration
**Goal:** Swap transport to Matrix for E2E encryption

**Deliverables:**
- Matrix client integration (JS SDK)
- Dendrite homeserver deployment
- Room-based location sharing
- Key management via Matrix

**Demo:** Same functionality, but server cannot read location data

---

#### Milestone 11: Background Location (Android)
**Goal:** Location updates when app not active

**Deliverables:**
- Android PWA wrapper (TWA or Capacitor)
- Background geolocation
- Battery optimization

**Demo:** Close app → move → open app → location was updated

---

#### Milestone 12: Polish & Hardening
**Goal:** Production-ready application

**Deliverables:**
- Error handling throughout
- Offline resilience
- Performance optimization
- Security audit
- Privacy policy / terms

---

## 11. Open Issues

### 11.1 From PRD
1. Named location visibility downgrade behavior
2. Multi-device handling
3. Multiple group membership resolution
4. Notification proximity definition
5. Notification exceptions for family

### 11.2 Technical
6. Geocoding provider/approach for production
7. Named location labels: server-visible or encrypted?
8. Matrix room topology for permission levels
9. Offline-first sync strategy

---

## 12. Security Considerations

### 12.1 Prototype Limitations (Documented)
- Geocoding API sees coordinates (to be replaced with offline in production)
- Encryption is passthrough (not real E2E)
- Hardcoded users initially (no real auth)

### 12.2 Production Requirements
- All location data E2E encrypted via Matrix
- Coordinates never leave device
- Server stores only encrypted blobs
- Regular dependency audits (minimal deps helps)
- No analytics or tracking of user behavior

### 12.3 Supply Chain
- Minimal dependencies audited and pinned
- No npm for frontend
- Backend: Flask + stdlib primarily
- Matrix SDK is largest dependency (justified for crypto)

---

## 13. Future Considerations (Not in Scope)

- Commuting/inferred location states
- Circle-owned shared locations (currently named locations are per-user only)
- Multi-device sync
- Federation (multiple Matrix homeservers)
- iOS native app
- Monetization features

---

*End of Design Document - Awaiting Review*
