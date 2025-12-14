# Issue Tracker Hygiene Review

**Date:** 2025-12-14
**Reviewer:** Claude Opus 4.5
**Scope:** All open issues (40 total)
**Previous Review:** N/A (first issue tracker review)

---

## Executive Summary

The issue tracker has 40 open issues. Several are already implemented and should be closed. One clear duplicate exists. Several issues are related and could benefit from cross-referencing. The tracker is generally well-organized with good issue descriptions.

### Summary

| Category | Count | Action |
|----------|-------|--------|
| Should Close (Implemented) | 2 | Close immediately |
| Duplicate | 1 | Close as duplicate |
| Related Issues (need linking) | 4 groups | Add cross-references |
| Active Bugs | 4 | Prioritize |
| Feature Backlog | ~25 | No action needed |
| Infrastructure | ~8 | In progress |

---

## 1. Issues to Close (Already Implemented)

These issues are marked as "Implemented" in their body but remain open:

| Issue | Title | Evidence | Recommendation |
|-------|-------|----------|----------------|
| #17 | Implement linting for all code | Body says "Status: Implemented" - linting works via `make lint` | **Close** |
| #16 | Implement Python environment management | Body says "Status: Implemented" - venv targets in Makefile work | **Close** |

### Note on #15 (Makefile)

Issue #15 is marked "Partially Implemented" with clear outstanding work tracked in its body. This should remain open until Docker setup completes.

---

## 2. Duplicate Issues

| Original | Duplicate | Title | Recommendation |
|----------|-----------|-------|----------------|
| #23 | #61 | Replace alert/confirm/prompt | Close #23, keep #61 (more comprehensive) |

**Rationale:** Issue #61 "Replace JavaScript alert/confirm/prompt with toasts and modals" is more comprehensive than #23 "Replace alert() popups with toast notifications". Issue #61 covers all three dialog types and proposes a more complete solution.

---

## 3. Related Issues (Need Cross-Referencing)

These issue groups are related and should reference each other for context:

### Group A: Multi-Device Handling
| Issue | Title | Relationship |
|-------|-------|--------------|
| #26 | Handle user logged in on multiple devices | Auth/session concern |
| #32 | Minimizing confusing updates from multiple devices | Location update concern |
| #56 | Allow users to revoke a device remotely | Device management concern |

**Action:** Add note to each issue referencing the others. These may eventually become a single "Multi-Device Support" epic.

### Group B: Link Sharing
| Issue | Title | Relationship |
|-------|-------|--------------|
| #1 | Link sharing for anonymous viewers | Base feature |
| #4 | Guest mode with link sharing | Depends on #1 |

**Status:** Already documented - #4 notes it depends on #1.

### Group C: Update Banner
| Issue | Title | Relationship |
|-------|-------|--------------|
| #52 | Refresh app banner shows up twice | Bug |
| #62 | Extract update banner display from api.js | Refactoring |

**Note:** Fixing #62 (architecture) may resolve #52 (bug). Add cross-reference.

### Group D: Named Locations
| Issue | Title | Relationship |
|-------|-------|--------------|
| #21 | Per-place sharing settings for named locations | Core feature |
| #44 | Pre-defined place names like "home" and "work" | Enhancement |

**Note:** #44 builds on #21. Add dependency reference.

---

## 4. Active Bugs (Priority Attention)

These bugs affect current functionality:

| Issue | Title | Severity | Notes |
|-------|-------|----------|-------|
| #50 | Invitations showing up and then failing when you try to accept | High | User-facing, intermittent |
| #60 | Planet level sharing shows as "Location not shared" | Medium | Display issue |
| #52 | Refresh app banner shows up twice | Low | Cosmetic |
| #19 | Sign up form focus is on email instead of name field | Low | Minor UX |

**Recommendation:** #50 should be prioritized as it affects core contact functionality. Related to closed #48.

---

## 5. Issue Categories Overview

### Infrastructure (8 issues)
| Issue | Title | Status |
|-------|-------|--------|
| #15 | Implement Makefile | Partially done |
| #16 | Python environment management | **Done - close** |
| #17 | Implement linting | **Done - close** |
| #24 | Developer live reload for Docker | Open |
| #27 | Debug mode: log client errors to server | Open |
| #38 | Command line client for testing | Open |
| #39 | Unit Tests | In progress |
| #40 | Integration Tests | In progress |

### Security/Privacy (6 issues)
| Issue | Title | Priority |
|-------|-------|----------|
| #2 | Major OAuth provider login | Deferred |
| #7 | Go Dark feature | Deferred |
| #8 | Sharing Summary | Deferred |
| #33 | Create a privacy threat model | Should do |
| #47 | Determine project licensing strategy | Should do |
| #54 | Trick password managers to remember identity | Research |

### Features - Deferred (10+ issues)
Large features intentionally deferred per PRD:
- #1, #4: Link/guest sharing
- #6: Circles
- #21: Per-place sharing settings (has implementation plan)
- #25: Email invites for non-users
- And others...

### UX Improvements (7 issues)
| Issue | Title | Priority |
|-------|-------|----------|
| #61 | Replace alert/confirm/prompt | Medium |
| #37 | Allow editing names | Medium |
| #42 | Choose permission when adding contact | Medium |
| #64 | Improve identity experience on mobile | Medium |
| #46 | Marketing website | Low |
| #53 | Playwright screenshots | Low |
| #63 | Static analysis tools evaluation | Low |

---

## 6. Stale Issues Assessment

All issues were created within the last 3 days (project is new). No issues are stale. The oldest open issues (#1-8) are intentionally deferred features from the original planning phase.

---

## 7. Recommendations

### Immediate Actions

1. **Close #17** - Linting is implemented
2. **Close #16** - Python venv is implemented
3. **Close #23 as duplicate of #61** - Toast/modal issue

### Short-Term Actions

1. **Prioritize #50** - Contact invitation failures impact core UX
2. **Add cross-references** between related issue groups (see Section 3)
3. **Create labels** for better categorization:
   - `bug` - existing bugs
   - `ux` - UX improvements
   - `deferred` - intentionally deferred features
   - `security` - security-related

### Questions for User

1. Should #52 (banner shows twice) be investigated now, or deferred until #62 (extract banner) is implemented?
2. Is #50 (invitation failures) blocking enough to warrant immediate attention?
3. Should we add milestone markers to group related features (e.g., "M2 - Multi-device", "M3 - Link Sharing")?

---

## 8. Issue Health Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| Total Open | 40 | Reasonable for project scope |
| Bugs | 4 | Low - good |
| Implemented but Open | 2 | **Should close** |
| Duplicates | 1 | **Should close** |
| With Labels | 8 | Could improve |
| With Assignees | 0 | Expected (solo project) |
| Average Age | <3 days | Fresh (new project) |

---

## Action Items

- [ ] Close #17 (linting implemented)
- [ ] Close #16 (venv implemented)
- [ ] Close #23 as duplicate of #61
- [ ] Add cross-reference notes to related issues (Groups A, C, D)
- [ ] Prioritize investigation of #50
- [ ] Consider adding labels for better organization

---

*Next review recommended: 1 week or after major milestone*
