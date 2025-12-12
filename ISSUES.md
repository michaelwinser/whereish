# Issues

## Open

### 1. Link sharing for anonymous viewers
Add support for shareable links that create a contact-like entity with assigned permissions. Anyone with the link can view the user's location at the permission level set for that link. This enables sharing location with people who aren't contacts (e.g., "here's where I am for the next hour" scenarios).

### 2. Implement major OAuth provider login
Add authentication via major OAuth providers (Google, Apple, etc.) to replace the prototype's simple email-based registration. This provides better security and user convenience.

### 6. Primary UI is too busy
The current single-pane UI crams too much information together. Proposed cleaner design:

**Your Location (compact)**
- Show user's current semantic location (they already know where they are)
- Show any named places matching current location

**Contacts List (clean)**
- List contacts for whom location information is available
- Sort options: distance to me, alphabetical, recently changed
- Tapping a contact opens a separate detail/edit view for managing that contact

**TBD: Show what they see?**
- Should the contact list show what each contact can see of YOUR location?
- Examples: "Can see that you're in NYC" or "Knows you're at Soccer Field"
- This might be useful but adds visual complexity

**Also noted:**
- "Can see: Planet" label is ambiguous - unclear if it means what you see of them or what they see of you
- Permission info might belong only in the contact detail view, not the list

### 7. Show distances in human terms (low priority)
Just as we show relative times in human terms ("a few minutes ago" vs "340 seconds"), distances should be expressed meaningfully. Examples: "5 min walk" or "3 hour drive" rather than "2,400 miles". Don't show distances above a certain threshold where they become meaningless. This aligns with the semantic philosophy of the app.

### 8. Guest mode with link sharing (future consideration)
Think of link sharing (Issue #1) as a circle - all those who have the link are in that circle. Guest mode would allow someone with a shared link to participate without full registration:
- Guest provides only a nickname and permission level for the circle
- No email/password required
- Enables lightweight participation for casual sharing scenarios
- Could enable use cases like "track the pizza delivery" or "see where our group is during the event"

This builds on Issue #1 and has real potential for lowering friction in casual sharing scenarios.

## Closed

### 5. Inconsistent naming between sharing scopes and radius sizes
The permission levels and radius options used inconsistent terminology. **Fixed:** Unified scope system - removed 'zip' (inconsistent sizing), added 'neighborhood', updated radius options to Street (150m), Neighborhood (750m), City (10km). See LOCATION_SCOPES.md for full design.

### 4. Named location radius options too small
The radius choices when creating a named location should range from city block to larger scopes, consistent with the semantic location hierarchy. **Fixed:** Updated to Street (150m), Neighborhood (750m), City (10km).

### 3. Named locations not scoped to user
Saved places (named locations) are stored in IndexedDB without user association. They persist after logout and appear shared across users on the same device. **Fixed:** Added userId field to IndexedDB, scoped storage by user ID, cleared locations on logout.
