# Issues

## Open

### 1. Link sharing for anonymous viewers
Add support for shareable links that create a contact-like entity with assigned permissions. Anyone with the link can view the user's location at the permission level set for that link. This enables sharing location with people who aren't contacts (e.g., "here's where I am for the next hour" scenarios).

### 2. Implement major OAuth provider login
Add authentication via major OAuth providers (Google, Apple, etc.) to replace the prototype's simple email-based registration. This provides better security and user convenience.

### 7. Show distances in human terms (low priority)
Just as we show relative times in human terms ("a few minutes ago" vs "340 seconds"), distances should be expressed meaningfully. Examples: "5 min walk" or "3 hour drive" rather than "2,400 miles". Don't show distances above a certain threshold where they become meaningless. This aligns with the semantic philosophy of the app.

### 8. Guest mode with link sharing (future consideration)
Think of link sharing (Issue #1) as a circle - all those who have the link are in that circle. Guest mode would allow someone with a shared link to participate without full registration:
- Guest provides only a nickname and permission level for the circle
- No email/password required
- Enables lightweight participation for casual sharing scenarios
- Could enable use cases like "track the pizza delivery" or "see where our group is during the event"

This builds on Issue #1 and has real potential for lowering friction in casual sharing scenarios.

### 10. Circles feature
Implement the Circles functionality for group-based location sharing. Currently the Circles tab is disabled as a placeholder.

**Core functionality:**
- Create and manage circles (groups of contacts)
- Assign contacts to one or more circles
- Set permission levels per circle
- View all members of a circle and their locations

**UI requirements:**
- Circles tab in bottom navigation (currently disabled)
- Circle list view
- Circle detail/edit view
- Circle member management

### 11. Go Dark feature
Add a "Go Dark" privacy feature that temporarily stops sharing location with all contacts. This provides a quick way to pause all location sharing without changing individual permission settings.

**Considerations:**
- Toggle on/off from Settings
- Visual indicator when dark mode is active
- Option for automatic duration (go dark for X hours)
- Resume sharing restores previous permission levels

### 12. Sharing Summary
Add a Sharing Summary screen that shows an overview of what location data is being shared with whom. This helps users understand their current privacy posture at a glance.

**Should display:**
- List of contacts grouped by permission level
- Count of contacts at each sharing level
- Any active circles and their permission levels
- Quick actions to adjust sharing

### 13. Docker build and self-hosting
Implement Docker containerization for easy self-hosting deployment. The solution should expose a single URL on a single port, suitable for running behind a reverse proxy (e.g., nginx proxy manager).

**Options to consider:**
- Combine Flask API server and static PWA into a single application (Flask serves static files)
- Or use a lightweight static server with API proxy configuration

**Requirements:**
- Single Dockerfile (or docker-compose if needed)
- Single exposed port
- Environment variable configuration (database path, secrets, etc.)
- Works behind reverse proxy (proper header handling for X-Forwarded-For, etc.)
- Production-ready (no debug mode, proper logging)

**Deliverables:**
- Dockerfile
- docker-compose.yml (optional, for easier configuration)
- Documentation for self-hosting setup
- Example nginx/reverse proxy configuration

### 9. Implement integration unit testing
Add comprehensive testing infrastructure for both client and server components.

**Client-side testing:**
- Use mocks for API calls so client can be tested independently of server
- Test ViewManager navigation and state management
- Test UI rendering functions (contacts list, places list, location bar)
- Test geofencing/location matching logic
- Consider using Jest or similar test framework

**Server-side testing:**
- Explicit API-focused tests for all endpoints
- Test authentication flows (register, login, token validation)
- Test contact request lifecycle (send, accept, decline)
- Test permission management and location filtering
- Test location publishing and retrieval
- Use pytest with test fixtures for database setup/teardown

**Integration considerations:**
- End-to-end tests that exercise full user flows
- Test data isolation between test runs
- CI/CD integration for automated test runs

## Closed

### 6. Primary UI is too busy
The single-pane UI crammed too much information together. **Fixed:** UX restructure implemented multi-screen architecture with ViewManager, bottom tab bar, separate Contact Detail screen, compact location bar, and dedicated Settings screen. Permission controls moved from contacts list to detail view.

### 5. Inconsistent naming between sharing scopes and radius sizes
The permission levels and radius options used inconsistent terminology. **Fixed:** Unified scope system - removed 'zip' (inconsistent sizing), added 'neighborhood', updated radius options to Street (150m), Neighborhood (750m), City (10km). See LOCATION_SCOPES.md for full design.

### 4. Named location radius options too small
The radius choices when creating a named location should range from city block to larger scopes, consistent with the semantic location hierarchy. **Fixed:** Updated to Street (150m), Neighborhood (750m), City (10km).

### 3. Named locations not scoped to user
Saved places (named locations) are stored in IndexedDB without user association. They persist after logout and appear shared across users on the same device. **Fixed:** Added userId field to IndexedDB, scoped storage by user ID, cleared locations on logout.
