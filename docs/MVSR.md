# Mission, Vision, Strategy, Roadmap & Principles

**Version:** 1.0
**Date:** December 11, 2025

---

## Mission

**Why we exist:**

> Enable people to share their presence with trusted contacts without sacrificing privacy.

---

## Vision

**Where we're headed:**

> The only location sharing app that lets you share meaningful information about where you are - privately and safely. Location sharing that people actually feel good about using.

---

## Strategy

**How we win:**

> Privacy by design, not privacy by policy. Build the technical architecture so over-sharing is impossible by default. Start with families who want awareness without surveillance, then expand to friend groups and communities. Grow through word-of-mouth from users who trust the app enough to recommend it.

**Key strategic elements:**
1. **Technical privacy** - Architecture enforces privacy, not just policy promises
2. **Family-first** - Start with the use case where trust matters most
3. **Trust-driven growth** - Users recommend because they genuinely trust the product

---

## Roadmap

**What we build, in what order:**

| Phase | Focus | Goal |
|-------|-------|------|
| 1 | PWA Prototype | Validate core UX with family/friends |
| 2 | Android Production | Real-world usage, background location |
| 3 | iOS + Polish | Expand platform reach |
| 4 | Groups & Communities | Beyond family to friend groups, teams |
| 5 | Advanced Features | Shared locations, inferred states, integrations |

*Per-phase milestones to be defined at the start of each phase.*

---

## Principles

**How we make decisions:**

These principles guide design tradeoffs. When principles conflict, use judgment - but the tension itself is informative.

### 1. Privacy by default, sharing by choice

Default is "Planet Earth" - revealing anything meaningful requires explicit action. Users opt-in to sharing, never opt-out of tracking.

**Example:** New contacts see nothing until you configure what to share with them.

### 2. No surprises

Users always know what they're sharing and with whom. The answer to "What does [Contact] see?" should never be mysterious or require technical knowledge to understand.

**Example:** Preview feature shows exactly what each contact sees.

### 3. Presence, not tracking

We share where someone is, not where they've been or where they're going. No history, no breadcrumbs, no movement patterns. This is presence sharing, not surveillance.

**Example:** No location history stored. Current state only.

### 4. Semantic over precise

Human-readable labels are the product; GPS coordinates are an implementation detail that never leaves the device. "Downtown Boston" is what we share, not "42.3601, -71.0589".

**Example:** Even at maximum precision, users see "123 Main Street" not coordinates.

### 5. Simple until it needs to be complex

Easy things should be easy (share city-level with family). Complex things should be possible (per-contact overrides, named locations). Don't expose complexity users don't need.

**Example:** Quick setup for common cases, advanced settings available but not required.

### 6. Battery is sacred

Minimal background drain. Presence doesn't require real-time precision - knowing someone is "in Boston" doesn't need per-second GPS updates. Optimize aggressively for battery life.

**Example:** 5+ minute update intervals, significant-location-change APIs.

### 7. Fun

We want users to actually enjoy sharing their location and knowing where the important people in their lives are. This isn't a security product with a friendly UI - it's a delightful product with strong security.

**Example:** "Planet Earth" as the default (playful, not paranoid). Celebrating nearby friends, not just protecting from strangers.

---

## Applying the Principles

When facing a design decision, ask:

1. **What do the principles suggest?**
2. **Which principles are in tension?**
3. **Which principle should win in this context?**

**Example tradeoff:** Family wants "notify me when child leaves school" (useful, fun) but it conflicts with "presence, not tracking" (monitoring departures is tracking-adjacent). Resolution might involve: explicit bilateral consent, limiting to named locations, or accepting this specific exception because safety > purity for parent-child relationships.

The principles don't eliminate judgment - they make the tradeoffs explicit.

---

*End of MVSR + Principles*
