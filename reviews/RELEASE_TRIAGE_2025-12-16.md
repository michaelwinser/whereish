# Release Triage Review

**Date:** 2025-12-16
**Reviewer:** Claude Opus 4.5
**Target Release:** v1.0 (First Public Release)
**Release Theme:** OAuth login, identity management polish, core bug fixes
**Issues Reviewed:** 48
**Previous Review:** ISSUE_TRACKER_REVIEW_2025-12-14.md

---

## Executive Summary

48 open issues triaged. The clear release theme emerging from recent PRD work is **OAuth authentication + identity management** (#71, #2, #64). This review recommends **10 issues for inclusion** in the release (5 must-fix, 5 should-fix) with **33 issues deferred** to future releases.

Key findings:
- The OAuth/identity work (#71, #64) is foundational and should be the release focus
- Several bugs (#60, #69, #74) should be fixed before public release
- Code cleanup (#73) aligns with the auth changes
- Large feature requests (circles, link sharing, etc.) should be explicitly deferred

### Summary Counts

| Category | Count |
|----------|-------|
| Must Fix | 5 |
| Should Fix | 5 |
| Nice to Have | 5 |
| Defer | 33 |
| Needs Discussion | 0 |

---

## Release Scope

### Target Themes

1. **OAuth Authentication**: Replace email/password with Google OAuth (#71, #2) per PRD_AUTH_IDENTITY.md
2. **Identity UX Improvement**: Simplify the identity/key management experience (#64)
3. **Core Bug Fixes**: Fix user-facing issues before public release (#60, #69, #74)
4. **Code Cleanup**: Remove deprecated auth code (#73)

### Out of Scope

- Large new features (circles, link sharing, guest mode)
- Advanced identity features (key rotation, device revocation)
- Marketing website and developer tooling
- UI framework migration

---

## Triage Results

### Must Fix (5 issues)

Issues that block release or cause significant user harm.

| Issue | Title | Rationale | Effort |
|-------|-------|-----------|--------|
| #71 | Switch to Google signin | Core release theme - eliminates unimplemented password recovery, simplifies auth | L |
| #64 | The current identity experience is cumbersome | Core release theme - current UX is confusing, especially on mobile | L |
| #69 | Client should go to login page when getting a 401 | Security/UX issue - users see broken state instead of proper redirect | S |
| #60 | Planet level sharing shows as "Location not shared" | Misleading UI - users can't tell if sharing is working | S |
| #74 | Refresh contacts button does nothing or no feedback | Core UX issue - users can't tell if the app is working | S |

**Notes:**
- #71 and #64 are linked and should be implemented together (per PRD_AUTH_IDENTITY.md)
- #69, #60, #74 are quick wins that significantly improve user experience

### Should Fix (5 issues)

Important issues that improve quality if time permits.

| Issue | Title | Rationale | Effort |
|-------|-------|-----------|--------|
| #73 | Remove account migration code | Cleanup - dead code that's confusing; aligns with auth rewrite | S |
| #75 | Email address of contact is not shown | UX issue - can't distinguish contacts with same name | S |
| #61 | Replace alert/confirm/prompt with toasts and modals | Polish - native dialogs are jarring | M |
| #52 | Refresh app banner shows up twice | Bug - cosmetic but unprofessional | S |
| #19 | Sign up form focus is on email instead of name | Minor UX - will likely change with OAuth anyway | S |

**Notes:**
- #73 becomes necessary after #71/#64 are complete (removes now-unused code)
- #19 may be obviated by OAuth changes - evaluate after #71

### Nice to Have (5 issues)

Low priority improvements for this release.

| Issue | Title | Rationale | Effort |
|-------|-------|-----------|--------|
| #62 | Extract update banner display from api.js | Architecture cleanup - good but not urgent | S |
| #65 | Refresh after database clean shows console message | Minor bug - dev-facing, not user-facing | S |
| #68 | Revisit some of the toasts in the UI | Polish - related to #61 but lower priority | S |
| #42 | Adding contact should allow choosing permission | Enhancement - default is safe, improvement can wait | M |
| #37 | Allow editing name of contact | Enhancement - useful but not critical | M |

**Notes:**
- These could be addressed if the core work finishes early
- #62 was identified in Architecture Review but is not blocking

### Defer to Future Release (33 issues)

Explicitly out of scope for this release.

#### Authentication & Identity - Future (5 issues)

| Issue | Title | Rationale | Revisit When |
|-------|-------|-----------|--------------|
| #2 | Implement major OAuth provider login | Superseded by #71 for this release; other providers later | After Google OAuth works |
| #70 | Identity key rotation and device invalidation | Complex security feature; needs design | v1.1 or security milestone |
| #56 | Allow users to revoke a device remotely | Related to #70; complex | After #70 |
| #54 | Dummy login for password manager identity | Research/UX experiment; OAuth may change approach | After OAuth settled |
| #72 | Support other login providers | Explicit non-goal in PRD_AUTH_IDENTITY | v1.1 or later |

#### Multi-Device (3 issues)

| Issue | Title | Rationale | Revisit When |
|-------|-------|-----------|--------------|
| #26 | Handle user logged in on multiple devices | Complex; PRD_AUTH_IDENTITY defines model | After OAuth/identity |
| #32 | Minimizing confusing updates from multiple devices | Related to #26 | After #26 |
| #58 | Backup all contact settings | Enhancement; core backup works | v1.1 |

#### Major Features (8 issues)

| Issue | Title | Rationale | Revisit When |
|-------|-------|-----------|--------------|
| #6 | Circles feature | Large feature; designed but not prioritized | v2.0 |
| #7 | Go Dark feature | Large feature; designed but not prioritized | v2.0 |
| #8 | Sharing Summary | Large feature; privacy enhancement | v2.0 |
| #21 | Per-place sharing settings | Large feature; complex permissions | v2.0 |
| #1 | Link sharing for anonymous viewers | Large feature; depends on #4 | v2.0 |
| #4 | Guest mode with link sharing | Large feature | v2.0 |
| #25 | Invite non-registered users via email | Large feature; email infrastructure | v2.0 |
| #44 | Pre-defined place names | Enhancement; low priority | Future |

#### UX Enhancements (4 issues)

| Issue | Title | Rationale | Revisit When |
|-------|-------|-----------|--------------|
| #3 | Show distances in human terms | Nice to have; not core | v1.1 |
| #76 | Avatar images for contacts | Nice to have; could integrate with Google Contacts | v1.1 with Google integration |
| #41 | Different time granularities | Complex; needs justification | Future |
| #46 | Marketing website | Important but separate workstream | Before public launch |

#### Infrastructure & Tooling (9 issues)

| Issue | Title | Rationale | Revisit When |
|-------|-------|-----------|--------------|
| #67 | Evaluate using a UI framework | Major architecture decision; high risk mid-release | v2.0 consideration |
| #63 | Evaluate static analysis tools | Developer tooling; not user-facing | Ongoing |
| #66 | Integration test for bump-version | Nice to have; low priority | When needed |
| #39 | Unit Tests | In progress; continue but not blocking | Ongoing |
| #40 | Integration Tests | In progress; continue but not blocking | Ongoing |
| #38 | CLI client for testing | Developer tooling | When needed |
| #36 | OpenAPI-based API explorer | Developer tooling | When needed |
| #24 | Developer live reload | Developer experience | When needed |
| #27 | Debug mode: log client errors | Developer tooling | When needed |

#### Administrative (4 issues)

| Issue | Title | Rationale | Revisit When |
|-------|-------|-----------|--------------|
| #20 | Admin View | Admin features exist; enhancements later | v1.1 |
| #47 | Determine licensing strategy | Important but separate decision | Before public launch |
| #33 | Create privacy threat model | Should do; not blocking v1.0 | Before security audit |
| #53 | Use Playwright for screenshots | Marketing/docs; separate workstream | With #46 |

#### Partially Complete / Monitor (0 issues)

| Issue | Title | Status | Notes |
|-------|-------|--------|-------|
| #15 | Implement Makefile | Partially done | Check if remaining items block release |

---

## Issue Groups

Related issues that should be addressed together or in sequence.

| Group | Issues | Notes |
|-------|--------|-------|
| **OAuth + Identity** | #71, #64, #73 | Core release work; #73 cleanup after #71 complete |
| **Multi-Device** | #26, #32, #70, #56 | All deferred; tackle as a group post-release |
| **Link Sharing** | #1, #4 | Deferred; #4 depends on #1 |
| **UI Polish** | #61, #68 | Related; toast/modal improvements |
| **Update Banner** | #52, #62 | Related; #62 may fix #52 |
| **Testing** | #39, #40, #66, #38 | Ongoing infrastructure; not release-blocking |

---

## Release Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth integration complexity | Medium | High | Start early; have fallback plan |
| Identity migration for existing users | Low | High | Database already reset; no legacy users |
| Breaking contact relationships | Low | High | Test thoroughly; contacts use public keys |
| Scope creep | Medium | Medium | Stick to triage decisions; defer aggressively |

---

## Recommended Release Order

If time runs short, address issues in this order:

### 1. Critical path (must ship)
1. #71 - Google OAuth (authentication foundation)
2. #64 - Identity UX improvement (completes auth story)
3. #69 - 401 redirect (prevents broken states)
4. #60 - Planet sharing display fix (prevents user confusion)
5. #74 - Refresh button feedback (prevents user confusion)

### 2. High value (strongly recommended)
6. #73 - Remove migration code (cleanup, reduces confusion)
7. #75 - Show contact email (disambiguation)
8. #61 - Replace native dialogs (polish)

### 3. Polish (if time permits)
9. #52 - Double banner fix
10. #19 - Form focus (may be obviated by OAuth)

---

## Questions for User (Resolved)

1. **OAuth provider priority**: Google-only for v1.0. Apple Sign-In deferred to future release.

2. **Identity migration**: Yes, we can break the identity JSON format cleanly. No legacy users to support.

3. **Marketing website (#46)**: Not blocking public release. Can launch v1.0 without it.

4. **Licensing (#47)**: Not blocking public release. Can be resolved in parallel.

---

## Action Items

- [x] User to approve/adjust triage decisions
- [x] Create "v1.0" milestone in GitHub
- [x] Tag Must Fix issues with milestone (#71, #64, #69, #60, #74)
- [x] Tag Should Fix issues with milestone (#73, #75, #61, #52, #19)
- [ ] Close #2 as duplicate/superseded by #71 (or link them)
- [ ] Begin work on #71 (OAuth) and #64 (Identity UX) as the release foundation
- [ ] Schedule quick wins (#69, #60, #74) for implementation

---

*Next triage review recommended: After OAuth/identity work is complete, or if significant scope changes occur*
