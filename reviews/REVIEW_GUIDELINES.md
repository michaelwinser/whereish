# Review Guidelines

This document describes the review processes and practices for the Whereish project. Reviews serve as checkpoints to ensure code quality, security, and alignment with project goals.

## Philosophy

Reviews in this project serve two audiences:

1. **LLM-based coding tools** (primary) - Reviews provide context for future work sessions, helping the LLM understand project state, outstanding issues, and areas of concern without re-reading the entire codebase.

2. **Human developers** (secondary) - Reviews help the human-in-the-loop understand what the LLM has done, validate decisions, and identify areas needing human judgment.

### Design Principles

- **Structured output**: Use tables, checklists, and clear sections for easy parsing
- **Actionable findings**: Every issue identified should have a clear recommendation
- **Cross-referenced**: Link to issues, files, and line numbers where relevant
- **Dated and versioned**: Always include review date and relevant version/commit
- **Cumulative knowledge**: Reviews build on each other; reference previous reviews

---

## Review Types

### 1. Ad Hoc Reviews

Triggered by specific events or concerns. Short, focused, and actionable.

| Review Type | Trigger | Scope | Output |
|-------------|---------|-------|--------|
| **Code Quality** | Major feature complete | Changed files only | Issues, refactoring suggestions |
| **Security** | Auth/sensitive code changes | Security-relevant code | Vulnerabilities, recommendations |
| **Performance** | User reports or suspicion | Specific flow/component | Bottlenecks, optimization plan |
| **API** | API changes | Endpoints affected | Breaking changes, documentation gaps |
| **UX/UI** | UI changes | Affected screens | Usability issues, accessibility |
| **Bug Investigation** | Bug reported | Related code | Root cause, fix recommendation |

### 2. Periodic Reviews

Scheduled reviews for ongoing health monitoring.

| Review Type | Frequency | Scope | Output |
|-------------|-----------|-------|--------|
| **Issue Tracker Hygiene** | Weekly | All open issues | Close stale, update priorities |
| **Dependency Audit** | Monthly | package.json, requirements.txt | Risk assessment across all dimensions |
| **Test Coverage** | Before release | All tests | Gaps, flaky tests, new test needs |
| **Documentation** | Before release | All docs | Outdated content, missing docs |

### 3. Major Release Reviews

Comprehensive reviews before significant releases.

| Review Type | Scope | Output |
|-------------|-------|--------|
| **Full Codebase** | Entire project | Status report, recommendations |
| **PRD Compliance** | PRD vs implementation | Feature gaps, deviations |
| **Architecture** | System design | Technical debt, scaling concerns |
| **Security Audit** | Full security review | Threat model, mitigations |

---

## Review Templates

### Ad Hoc Review Template

```markdown
# [Review Type] Review: [Topic]

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Model]
**Trigger:** [What prompted this review]
**Scope:** [Files/features reviewed]
**Commit:** [Git commit hash if relevant]

## Summary

[2-3 sentence overview of findings]

## Findings

| ID | Severity | Finding | Location | Recommendation |
|----|----------|---------|----------|----------------|
| 1  | High/Med/Low | [Issue] | file:line | [Action] |

## Detailed Analysis

### Finding 1: [Title]

[Detailed description, code snippets if relevant]

**Recommendation:** [Specific action to take]

## Action Items

- [ ] [Specific task 1]
- [ ] [Specific task 2]

## Related

- Issues: #X, #Y
- Previous reviews: [link]
```

### Major Review Template

```markdown
# [Type] Review

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Model]
**Scope:** [Full codebase / specific area]
**Version:** [Version number or commit]
**Last Review:** [Date of previous major review]

## Executive Summary

[Key findings and overall assessment]

### Overall Status

| Area | Status | Notes |
|------|--------|-------|
| [Area 1] | ✅/🟡/❌ | [Brief note] |

## Detailed Sections

[Organized by area/component]

## Recommendations

### Immediate (This Week)
1. [Action item]

### Short-Term (Next Month)
1. [Action item]

### Long-Term (Future)
1. [Action item]

## Appendix

- Test results
- Performance metrics
- Issue references
```

---

## Dependency Audit: Risk Dimensions

A dependency audit is more than checking for known vulnerabilities. It assesses risk across multiple dimensions:

### Risk Assessment Matrix

| Dimension | Questions to Ask | Risk Indicators |
|-----------|------------------|-----------------|
| **Security** | Known CVEs? Unpatched issues? Security track record? | CVE database hits, slow security response |
| **Maintenance** | Last update? Issue response time? Active development? | No updates in 12+ months, ignored issues |
| **Licensing** | Compatible license? Viral clauses (GPL)? Attribution requirements? | GPL in MIT project, unclear licensing |
| **Supply Chain** | How many transitive deps? Trusted sources? Typosquatting risk? | Deep dependency trees, unknown maintainers |
| **Bus Factor** | Single maintainer? Corporate backing? Community size? | Solo maintainer, no succession plan |
| **Version Currency** | How far behind? Breaking changes pending? Deprecation warnings? | 3+ major versions behind, deprecated APIs |
| **Size/Bloat** | Bundle impact? Tree-shakeable? Unnecessary features? | Large bundle for small feature use |
| **Stability** | Frequent breaking changes? Semver compliance? | Major version bumps monthly |

### Dependency Audit Template

```markdown
# Dependency Audit

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Model]

## Summary

| Risk Level | Count | Action Required |
|------------|-------|-----------------|
| Critical   | X     | Immediate replacement/update |
| High       | X     | Plan migration this quarter |
| Medium     | X     | Monitor, update when convenient |
| Low        | X     | No action needed |

## JavaScript Dependencies (package.json)

| Package | Version | Latest | Risk | Notes |
|---------|---------|--------|------|-------|
| [name]  | X.Y.Z   | A.B.C  | Low/Med/High | [Assessment] |

### High-Risk Dependencies

#### [Package Name]
- **Current:** X.Y.Z
- **Risk:** [Level]
- **Concerns:** [Specific issues]
- **Recommendation:** [Action to take]

## Python Dependencies (requirements.txt)

[Same format as above]

## Transitive Dependency Concerns

[Notable risks in indirect dependencies]

## Action Items

- [ ] [Specific action]
```

### Risk Level Definitions

| Level | Definition | Examples |
|-------|------------|----------|
| **Critical** | Active exploitation, unmaintained with vulnerabilities, license violation | Known CVE being exploited, abandoned package with security bugs |
| **High** | Known vulnerabilities (unpatched), very outdated, problematic license | 2+ years without updates, GPL dependency in commercial project |
| **Medium** | Minor vulnerabilities, moderately outdated, single maintainer | Minor CVE, 1 year old, bus factor = 1 |
| **Low** | Current, well-maintained, permissive license, large community | Active development, MIT/Apache, corporate backing |

---

## Documentation Review: Detecting and Resolving Drift

Documentation drift occurs when the implementation diverges from what's described in PRDs, design docs, and open issues. This is inevitable in active development but must be managed.

### Types of Drift

| Type | Description | Example |
|------|-------------|---------|
| **Feature drift** | Implementation differs from PRD spec | PRD says "Google OAuth" but only email auth exists |
| **Design drift** | Architecture differs from design docs | DESIGN.md describes encryption layer that wasn't built |
| **Issue drift** | Open issues describe already-implemented features | Issue #22 "Add pending requests UI" but UI exists |
| **Terminology drift** | Code uses different terms than docs | Docs say "circles", code says "groups" |

### Documentation Review Process

1. **Inventory all docs** in `docs/` directory
2. **For each doc**, compare claims against actual implementation
3. **Categorize each discrepancy**:
   - Implementation is correct, doc is outdated → Update doc
   - Doc is correct, implementation is wrong → File bug
   - Intentional deviation → Document the decision
   - Unclear which is right → Flag for user decision
4. **Check open issues** for features that may already be implemented
5. **Check closed issues** to ensure fixes are reflected in docs

### Drift Resolution Decision Tree

```
Drift detected between doc and implementation
    │
    ├─► Implementation matches user intent?
    │       │
    │       ├─► Yes → Update doc to match implementation
    │       │
    │       └─► No → File bug to fix implementation
    │
    └─► Unclear which is correct?
            │
            └─► ASK USER before making changes
                - Present both versions
                - Explain trade-offs
                - Get explicit decision
```

### Documentation Review Template

```markdown
# Documentation Review

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Model]
**Docs Reviewed:** [List of files]

## Drift Summary

| Document | Drifts Found | Resolution |
|----------|--------------|------------|
| PRD.md   | X items      | Y updated, Z flagged |

## Detailed Findings

### [Document Name]

| Section | Claim | Reality | Resolution |
|---------|-------|---------|------------|
| §5.1 | "Google OAuth supported" | Not implemented | Update doc: "Deferred" |
| §6.2 | "Zero-knowledge server" | Plaintext storage | Flag for user: intentional? |

## Issues to Close (Already Implemented)

| Issue | Title | Evidence |
|-------|-------|----------|
| #22   | Pending requests UI | UI exists in app.js:1200 |

## Issues to Create (Doc Says, Code Doesn't)

| Title | Source | Priority |
|-------|--------|----------|
| "Add Google OAuth" | PRD §5.1 | User decision needed |

## Questions for User

1. [Specific question about ambiguous drift]
2. [Another question]
```

### Key Principle: Always Ask

When drift resolution is ambiguous, **do not assume**. Present the discrepancy to the user with:
- What the doc says
- What the code does
- Your recommendation
- Request for explicit direction

This prevents well-intentioned "fixes" that actually break intended behavior or revert deliberate decisions.

---

## Lessons Learned Review

Periodically review exported conversation logs and other artifacts to extract patterns worth codifying. This turns implicit working preferences into explicit guidance for future sessions.

### When to Conduct

- After completing a significant feature or milestone
- When a session involved notable course corrections
- Periodically (e.g., weekly) if conversations are frequent

### Sources to Review

- Exported conversation logs (`conversations/`)
- Git commit history and PR discussions
- Issue comments where approach changed
- Any "we should remember this" moments

### What to Look For

| Category | Examples |
|----------|----------|
| **Working style** | User preferences for communication, output format, autonomy level |
| **Process** | Steps that worked well, checkpoints that should be standard |
| **Anti-patterns** | Approaches that didn't work, corrections that were needed |
| **Domain knowledge** | Project-specific context that aids future work |
| **Tool usage** | Effective patterns for using available tools |

### Lessons Learned Template

```markdown
# Lessons Learned Review

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Model]
**Sources Reviewed:** [List of conversation logs, date ranges]

## Summary

[Brief overview: X lessons extracted, Y added to CLAUDE.md, Z added to guidelines]

## Findings

### For CLAUDE.md - Working Style

| Finding | Evidence | Proposed Addition |
|---------|----------|-------------------|
| [Pattern observed] | [Quote or reference] | [Suggested text] |

### For CLAUDE.md - Process

| Finding | Evidence | Proposed Addition |
|---------|----------|-------------------|
| [Pattern observed] | [Quote or reference] | [Suggested text] |

### For REVIEW_GUIDELINES.md

| Finding | Evidence | Proposed Addition |
|---------|----------|-------------------|
| [Pattern observed] | [Quote or reference] | [Suggested text] |

### Not Worth Codifying

[Patterns that are too situational or already implicit]

## Questions for User

1. [Do these capture the right lessons?]
2. [Any I'm missing or overfitting?]

## Actions Taken

- [ ] Updated CLAUDE.md with approved additions
- [ ] Updated REVIEW_GUIDELINES.md with approved additions
- [ ] Filed issues for process improvements
```

### Key Principles

**Be selective.** Not everything is a lesson. Look for patterns that repeat or corrections that reveal gaps in guidance.

**Categorize appropriately.** Working style goes in CLAUDE.md. Review-specific lessons go in REVIEW_GUIDELINES.md. One-off context probably doesn't need to be captured.

**Get user approval.** Present findings for review before updating guidance documents. The user may have context about why something was situational vs general.

**Avoid overfitting.** A single correction doesn't make a rule. Look for patterns across conversations.

---

## Review Process

### For LLM Reviewers

1. **Read previous reviews first** - Check `reviews/` for context
2. **Use consistent structure** - Follow templates above
3. **Be specific** - Include file paths, line numbers, issue numbers
4. **Prioritize findings** - Use severity levels consistently
5. **Create issues** - For anything requiring follow-up work
6. **Update CLAUDE.md** - If review reveals important context
7. **Voice disagreement** - If you think a design decision, PRD requirement, or user instruction is suboptimal, say so. Even if we proceed anyway, the discussion reveals insights or gaps in specs. Don't just comply to be agreeable.

### For Human Reviewers

1. **Validate LLM findings** - Spot-check critical issues
2. **Add business context** - LLM may miss product priorities
3. **Approve/reject recommendations** - Final decision authority
4. **Request clarification** - Ask LLM to investigate further if needed

### Severity Levels

| Level | Definition | Response |
|-------|------------|----------|
| **Critical** | Security vulnerability, data loss risk, blocks users | Fix immediately |
| **High** | Major functionality broken, significant UX issue | Fix this sprint |
| **Medium** | Minor functionality issue, code quality concern | Fix soon |
| **Low** | Nice to have, minor improvement | Backlog |
| **Info** | Observation, no action required | Note for future |

---

## Review Naming Convention

Reviews are stored in `reviews/` with the following naming:

```
reviews/
├── REVIEW_GUIDELINES.md          # This file
├── CLAUDE_REVIEW.md              # Major codebase reviews (append date in content)
├── TESTING_REVIEW.md             # Testing architecture reviews
├── SECURITY_REVIEW_YYYY-MM.md    # Monthly security reviews
├── RELEASE_REVIEW_vX.Y.md        # Release reviews
└── [TOPIC]_REVIEW.md             # Topic-specific reviews
```

---

## Existing Reviews

| Review | Last Updated | Purpose |
|--------|--------------|---------|
| [CLAUDE_REVIEW.md](CLAUDE_REVIEW.md) | 2025-12-13 | Full codebase review against PRDs |
| [TESTING_REVIEW.md](TESTING_REVIEW.md) | 2025-12-13 | Testing architecture evaluation |

---

## Suggested Initial Reviews

Based on the current project state, the following reviews would be valuable:

### High Priority

| Review | Rationale | Estimated Effort |
|--------|-----------|------------------|
| **Security Review** | No formal security audit done yet; handles auth and location data | 2-3 hours |
| **API Review** | Document all endpoints, ensure consistency, check for gaps | 1-2 hours |
| **Issue Tracker Hygiene** | Many issues may be stale or already implemented | 30 minutes |

### Medium Priority

| Review | Rationale | Estimated Effort |
|--------|-----------|------------------|
| **Dependency Audit** | Assess risk across security, maintenance, licensing, supply chain | 1 hour |
| **Accessibility Review** | PWA should be accessible; no formal review done | 1-2 hours |
| **Error Handling Review** | Ensure all error paths are handled gracefully | 1 hour |

### Before Next Release

| Review | Rationale | Estimated Effort |
|--------|-----------|------------------|
| **PRD Compliance Update** | Update CLAUDE_REVIEW.md with current status | 1 hour |
| **Documentation Review** | Ensure all docs are current | 1 hour |
| **Performance Baseline** | Establish metrics before adding features | 1 hour |

---

## Review Checklist for LLMs

When conducting any review, ensure you:

- [ ] Checked previous reviews in `reviews/` directory
- [ ] Reviewed relevant issues in GitHub
- [ ] Read related design documents in `docs/`
- [ ] Used appropriate template from this guide
- [ ] Included specific file:line references
- [ ] Assigned severity to all findings
- [ ] Created issues for High/Critical findings
- [ ] Updated related documentation if needed
- [ ] Summarized key points for human review

---

## Human-in-the-Loop Considerations

When most work is done by an LLM, the human's role shifts to:

### Decision Points Requiring Human Input

1. **Architecture decisions** - Major structural changes
2. **Security trade-offs** - Risk acceptance decisions
3. **UX priorities** - Product direction choices
4. **External integrations** - Third-party service choices
5. **Release approval** - Go/no-go decisions

### Review Verification for Humans

After an LLM review, humans should:

1. **Skim the summary** - Does it match your understanding?
2. **Spot-check High findings** - Are they real issues?
3. **Review recommendations** - Do they align with priorities?
4. **Approve issue creation** - Should these be tracked?
5. **Add context** - Any business reasons the LLM missed?

### Red Flags to Watch For

- LLM marking many things as "implemented" without verification
- Recommendations that conflict with project philosophy
- Missing obvious issues (suggests incomplete review)
- Over-engineering recommendations
- Security issues dismissed as low priority

---

*Last updated: 2025-12-13*
