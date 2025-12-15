# Claude Code Context

This file provides context for Claude Code sessions working on the Whereish project.

## Project Overview

Whereish is a privacy-first semantic location sharing PWA. Users share location at configurable granularity levels (city, neighborhood, etc.) rather than exact coordinates.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `app/` | PWA client (vanilla JS, no framework) |
| `server/` | Flask backend API |
| `docs/` | Design documents, PRDs, architecture |
| `reviews/` | Code reviews, audits, assessments |
| `tests/` | Playwright (client) and pytest (server) tests |
| `scripts/` | Build and utility scripts |

## Before Starting Work

1. **Check `reviews/REVIEW_GUIDELINES.md`** for review processes and templates
2. **Check recent reviews** in `reviews/` for current project state
3. **Check open issues** with `gh issue list`
4. **Run tests** with `make test` to verify baseline

## Working Style

**Push back on bad ideas.** If you think an instruction or approach is suboptimal, say so. Even if we proceed anyway, the discussion often reveals important insights or gaps in the specs. Disagreement is productive—don't just comply to be agreeable.

**For design decisions, present options first.** When multiple valid approaches exist, present them with trade-offs (tables work well) before recommending. Let the user make the final call. For routine coding, just write the code.

**Think in multiple dimensions.** When a concept seems simple, consider whether there are additional dimensions worth exploring. Thorough analysis is valued over quick answers.

**Use structured output.** Prefer tables for comparisons, templates for repeatable processes, and checklists for multi-step tasks. This aids both human review and future LLM sessions.

**Design from requirements, not code.** When architecting changes, start from PRDs and design docs to understand the domain, not just refactoring what exists.

**Pause for review on phased work.** When a task is large enough to warrant a plan with phases, pause for human review before committing the finished work. Interim commits for rollback are fine, but the human should evaluate before the final commit.

**Update plans after each phase.** After completing a phase, provide a summary of what was implemented and any design decisions made. Then update the implementation plan document to reflect actual decisions (not just the original plan). This keeps the plan accurate as a reference and captures the reasoning behind deviations.

**Include design decisions in commit messages.** When committing phased work, the commit message should include both the normal change summary AND a section documenting key design decisions made during implementation. This creates a permanent record in git history of why choices were made, which is valuable for future debugging and code archaeology.

## For Non-Trivial Tasks

Before implementing significant features or changes:

1. **Read relevant design docs** in `docs/` (PRD.md, DESIGN.md, UX_DESIGN.md, etc.)
2. **Check for related issues** that may affect the approach
3. **Update docs as you go** - keep PRD and design docs in sync with implementation
4. **Note any drift** - if implementation diverges from docs, discuss with user whether to update docs or change implementation

## Development Commands

```bash
make run          # Start dev server on :8080
make test         # Run smoke tests + linting
make test-client  # Run Playwright tests
make test-server  # Run pytest tests
make build        # Build Docker image (updates build info)
make bump-version # Bump version across all files
```

## Architecture Notes

- **Model-View separation**: `model.js` handles state/logic, `app.js` handles DOM
- **Event-driven**: Model emits events, views subscribe
- **Two permission systems**: Geographic granularity + named location visibility
- **Version sync**: Client and server versions must match (see `APP_VERSION`)

## Supply Chain Security

**Bundle dependencies locally, not via CDN.** External JavaScript dependencies should be downloaded and committed to the repository rather than loaded from CDNs at runtime. This provides:

- **Auditability**: We control exactly what code runs
- **Reproducibility**: Builds are deterministic regardless of CDN state
- **Offline support**: PWA works without external network access
- **Security**: No runtime dependency on third-party infrastructure

When adding a new dependency:
1. Download the specific version to `app/` (or appropriate directory)
2. Add to ESLint ignores if minified (see `eslint.config.mjs`)
3. Add to service worker cache list (`sw.js`)
4. Document the version and source in a comment or this file

Current bundled dependencies:
- `nacl-fast.min.js` - tweetnacl v1.0.3
- `nacl-util.min.js` - tweetnacl-util v0.15.1

## Current State

See `reviews/CLAUDE_REVIEW.md` for the most recent comprehensive review.
- Commits should reference the issue they are resolve (or working on) and the issue should not be closed before the commit.
