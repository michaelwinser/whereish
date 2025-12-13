# Encryption PRD: Zero-Knowledge Location Sharing

**Status:** Draft
**Created:** 2025-12-13
**Related:** Issue #30, DESIGN.md §Encryption Layer

---

## 1. Purpose

This document defines the user-facing promises and principles for encrypting location data in Whereish. The goal is to enable true zero-knowledge location sharing: **the server cannot read users' location data**.

This PRD focuses on *what* we promise to users. The companion design document (DESIGN_ENCRYPTION.md) will explore *how* to implement these promises.

---

## 2. User Promises

### What We Promise

| Promise | Meaning |
|---------|---------|
| **Your location is encrypted** | Location data (coordinates, hierarchy, place names) is encrypted before leaving your device |
| **Only your contacts can read it** | Each contact's view of your location is encrypted specifically for them |
| **We cannot see your location** | Server stores only encrypted blobs; we cannot decrypt them |
| **Contacts see only what you allow** | Permission levels (city, street, etc.) are enforced cryptographically, not just by server logic |

### What We Do NOT Promise (v1)

| Limitation | Explanation |
|------------|-------------|
| **Metadata is visible** | Server knows *when* you update location, *who* your contacts are, *how often* they query |
| **Contact graph is visible** | Server knows Alice and Bob are contacts (but not what they share) |
| **Account info is visible** | Email, name, auth tokens are not encrypted |
| **Traffic analysis possible** | Patterns of updates/queries could reveal information |

These limitations are common to most E2E encrypted systems and may be addressed in future versions.

---

## 3. Threat Model

### Guiding Principle

**We are not protecting a CA root key.** This is always a compromise between security and convenience. We lean towards good user experience, especially at rough corners like key exchange and recovery.

**Simplified boundary:** If the attacker has physical access to a user's device, or has compromised another communication channel between two users, there's not much we can do at the application level.

### In Scope (Protected Against)

| Threat | How Protected |
|--------|---------------|
| **Curious operator** | Server admin cannot read location data in database |
| **Database breach** | Stolen database contains only encrypted blobs |
| **Server compromise** | Attacker with server access cannot read location data |
| **Legal compulsion** | Cannot be compelled to produce data we cannot decrypt |
| **Malicious contact** | Contact only sees the permission level you granted |

### Out of Scope (Not Protected Against)

| Threat | Why Not Protected |
|--------|-------------------|
| **Compromised device** | If attacker has your device, they have your keys |
| **Compromised side-channel** | If attacker controls how you communicate with contacts, key exchange is compromised |
| **Malicious client app** | Modified app could exfiltrate data before encryption |
| **Traffic analysis** | Timing/frequency of updates reveals information |
| **Social engineering** | User could be tricked into sharing more than intended |

---

## 4. Principles

### 4.0 Use Vetted Solutions

**Of all the things to DIY, encryption is not the one.**

We should adopt existing, audited encryption implementations rather than building our own. The design doc will evaluate options (Signal protocol, Matrix Olm/Megolm, libsodium, etc.). This PRD intentionally focuses on scenarios, promises, and requirements—leaving room to adopt a solution that may not match our exact model but provides strong, proven security.

If we must implement cryptographic operations directly, we use well-established libraries (libsodium, Web Crypto API) with standard algorithms—never custom cryptography.

### 4.1 End-to-End Encryption

Location data is encrypted on the sender's device and decrypted only on the recipient's device. The server is a "dumb pipe" that stores and relays encrypted data.

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Alice   │         │  Server  │         │   Bob    │
│ (sender) │         │ (relay)  │         │(contact) │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ encrypt(location,  │                    │
     │   bob_public_key)  │                    │
     │ ──────────────────>│                    │
     │                    │ store encrypted    │
     │                    │ blob               │
     │                    │                    │
     │                    │<───────────────────│
     │                    │   query alice      │
     │                    │───────────────────>│
     │                    │   encrypted blob   │
     │                    │                    │
     │                    │         decrypt(blob, bob_private_key)
     │                    │                    │
```

### 4.2 Per-Contact Encryption

Each contact relationship has its own encryption. When Alice updates her location:
- She encrypts a city-level view for Bob (who has city permission)
- She encrypts a street-level view for Carol (who has street permission)
- Server stores both blobs, delivers appropriate one to each contact

### 4.3 Permission Levels Are Cryptographic

Currently, permission levels are enforced by server logic filtering data. With encryption:
- Alice encrypts *only* the data Bob is allowed to see
- Even if Bob intercepts Carol's blob, he cannot decrypt it
- Server cannot "upgrade" Bob to see more than Alice intended

### 4.4 Keys Stay on Device

Private keys never leave the user's device. This means:
- Server cannot decrypt data (good)
- Lost device = lost keys (problem to solve)
- Multi-device requires key sync (complexity)

---

## 5. Identity and Trust

*Note: This section uses user-facing language. "Keys," "encryption," and other implementation details belong in the design doc. What users experience is identity and trust.*

### The Core Problem

The hard problem isn't cryptography—that's solved. The hard problems are:

1. **Identity**: How does Bob know Alice is really Alice?
2. **Continuity**: How does Alice prove she's the same Alice from yesterday?
3. **Recovery**: How does Alice reclaim her identity if she loses her device?

Cryptographic keys are just the *mechanism* for proving "I am the same entity you trusted before." They don't solve "I am who I claim to be initially."

### Strategic Partitioning

| Phase | Problem | Approach |
|-------|---------|----------|
| **Phase 1** | Continuity | Identity created on device; trust via side-channel |
| **Phase 2** | Encryption | E2E encryption using established identities |
| **Phase 3** | Identity & recovery | Research-driven; learn from other apps |

### 5.1 Creating a Whereish Identity

When you create an account, you establish a **Whereish identity**. This identity has two parts:

**Private Identity** (keep secret):
- This *is* you on Whereish
- Stored on your device
- Can be exported as a recovery file or QR code
- User guidance: "Keep this in a safe place (like a password manager). If someone else gets this, they can take over your account."

**Public Identity** (shareable):
- How others find and recognize you on Whereish
- Can be shared via any channel you already use (text, social media, QR code in person)
- Doesn't create a connection—others still have to request that
- User guidance: "Share this with people you want to connect with. It's how they'll find you on Whereish."

*Implementation note: Under the covers, this is a cryptographic key pair. But users experience it as "my private identity" and "my public identity."*

**Why this works:** The user understands intuitively that their private identity must stay private (like a password) and their public identity can be shared (like a username or profile link). No cryptography knowledge required.

### 5.2 Establishing Trust with Contacts

When Alice adds Bob as a contact:
1. Alice sends Bob an invite (via text, email, in person—any channel)
2. Bob accepts, establishing a trusted connection
3. They can now share encrypted location data

**Trust model:** Trust is established through whatever channel you use to share the invite. If you text someone your invite link, you're trusting that your text reached the right person. This is "trust on first use" (TOFU)—we assume the first connection is legitimate.

**The channel matters:** If Alice shares her invite link on a public website, anyone could claim to be her contact. If she texts it to Bob's known phone number, trust is stronger. The security of the connection depends on the security of the channel used to establish it.

### 5.3 Identity Recovery

**The simple solution:** If you exported your private identity file (section 5.1), you can restore your Whereish identity on a new device. Import the file, and you're back—same identity, same contacts, everything works.

**If you didn't export it:** You lose your Whereish identity and must start over. Create a new account, re-establish all contact relationships.

**Phase 1 approach:**
- Strongly encourage (but don't require) identity export during account creation
- Provide clear guidance: "Save this to your password manager"
- Accept that some users won't do this and will lose their identity

**Why this is simpler than it sounds:** The "recovery paradox" (how do you prove you're you without your identity?) is solved by possession of the private identity file. If you have it, you're you. This is the same model as password managers, cryptocurrency wallets, and PGP keys—well-understood by security-conscious users, and explainable to others as "it's like having a backup of your account."

### 5.4 Identity Discovery (Why We're Different from Signal)

**Signal's problem:** Users have large contact networks. They need to find "which of my phone contacts are on Signal?" This requires a centralized lookup: phone number → Signal identity.

**Our situation is different:** Whereish users typically have small, intentional networks. You don't need to find "which of my 500 contacts are on Whereish?"—you're sharing location with family and close friends. Maybe 5-20 people.

**This changes the design:**
- We don't need phone-number-based discovery
- We don't need email-based discovery
- Users can share their public identity through channels they already use

**How discovery works:**
1. Alice shares her public identity (link, QR code) via text, email, social media, in person
2. Bob uses it to find Alice on Whereish and request a connection
3. Alice accepts (or not)

**What this means for email:** Email might just be a username for the server—not an identity anchor. The public identity file *is* how people find you. Email verification becomes optional, not essential.

| Anchor | Signal's Need | Our Need |
|--------|---------------|----------|
| Phone number | Essential (contact lookup) | Not needed |
| Email (verified) | N/A | Optional (account recovery fallback?) |
| Public identity sharing | N/A | Primary discovery method |
| In-person QR code | Safety numbers | Connection establishment |

### 5.5 Identity Portability (Multi-Device - Deferred)

Your Whereish identity lives on one device. Supporting multiple devices means moving or copying identity—which requires solving:
- How do you prove the second device is really yours?
- How do you securely transfer identity between devices?

**Simple solution (from 5.3):** Import your private identity file on the new device. Same identity, works everywhere.

**Phase 1 behavior:** If you log in on a second device without importing identity:
- Warning: "Your Whereish identity is on your other device. You won't be able to use Whereish on this device."
- Option: Import your private identity file
- Option: Create a new identity (loses all contact relationships)

### 5.6 Future: Link-Based Group Sharing

A different sharing model for temporary, bounded groups:

**Scenario:** A family at Disney World wants to share precise locations within the resort for one day. They don't need persistent contacts—just "where is everyone right now?"

**Concept:**
- Someone creates a sharing link with parameters (location bounds, time limit)
- Share the link with the group (text, AirDrop, etc.)
- Anyone with the link can see others' locations within the bounds
- Link expires after the time limit
- No persistent contact relationships created

**Why this is separate from identity:**
- Doesn't use your Whereish identity (could be anonymous)
- Doesn't create ongoing relationships
- Solves the "large group" problem without complicating the core UX
- Different trust model (link possession = access)

**Encryption implications:**
- Group key derived from link
- Server still can't read locations
- But: anyone with link can read all locations in group

This is a future feature but worth noting because it shows how the core identity/encryption model can extend to different use cases.

---

## 6. User Experience

### 6.1 Transparency

Users should understand what's protected:

> **Your location is end-to-end encrypted.** Only your contacts can see where you are. Whereish cannot read your location data.

### 6.2 Key Moments

| Moment | User Experience |
|--------|-----------------|
| **Creating account** | "Welcome to Whereish" - identity created invisibly |
| **Adding contact** | Share invite link; trust established automatically |
| **Viewing contact** | Location appears; encryption invisible |
| **Lost device** | (Phase 1: Create new account, re-add contacts) |
| **Suspected compromise** | (Needs design - see below) |

### 6.3 Suspected Compromise

If a user suspects their identity has been compromised (e.g., stolen device, shared credentials), what can they do?

This scenario needs fleshing out in the context of:
- Proper threat model
- Implementation capabilities of our chosen solution

**Desirable property:** Forward secrecy—even if an attacker gets your identity today, they can't read past or future location data. Signal achieves this; whether we can depends on our solution choice.

**Implementation note:** Whatever security mechanisms exist (key rotation, ratcheting) should be transparent to users—not something they manage.

### 6.4 No Degraded Mode

If encryption fails, the operation fails. We do not fall back to unencrypted transmission. This prevents accidental data exposure.

---

## 7. Scope

### Phase 1: Foundation (This Release)

- [ ] Key generation on device (invisible to user)
- [ ] Simple key exchange via server (TOFU)
- [ ] Location data encrypted end-to-end
- [ ] Per-contact encryption with permission levels
- [ ] Single device only
- [ ] Lost keys = lost access (no recovery)

**Explicitly not in Phase 1:** Key recovery, email verification, multi-device, forward secrecy

### Phase 2: Identity & Trust (Future)

- [ ] Research: How do Signal/WhatsApp/Matrix handle identity and recovery?
- [ ] Decide: Email verification vs side-band trust establishment
- [ ] Key verification option (safety numbers)
- [ ] Key recovery mechanism

### Phase 3: Advanced (Future)

- [ ] Multi-device support
- [ ] Key rotation
- [ ] Forward secrecy
- [ ] Metadata protection (hide contact graph)

---

## 8. Research Needed

Before Phase 2, we should understand how established apps handle these problems:

| App | Research Questions |
|-----|-------------------|
| **Signal** | How does key recovery work? Safety numbers UX? Multi-device? |
| **WhatsApp** | Cloud backup encryption? Key change notifications? |
| **Matrix/Element** | Cross-signing? Key backup? Device verification? |
| **Keybase** | Social proof of identity? Key management UX? |
| **iMessage** | Transparent key management? Contact key verification? |

**Goal:** Understand what user expectations have been set by these apps. Users who've used Signal may expect safety numbers. Users who've only used iMessage may expect everything to "just work."

This research should inform Phase 2 decisions about identity and recovery.

---

## 9. Non-Goals

| Non-Goal | Reason |
|----------|--------|
| Hide contact relationships | Significantly harder; contacts must be able to find each other |
| Encrypt account data | Email needed for auth; name needed for contact discovery |
| Protect against device compromise | Out of scope for app-level encryption |
| Custom encryption algorithms | Use proven, audited cryptographic libraries |

---

## 10. Desirable Technical Properties

These are properties we'd like our encryption solution to have. They inform solution selection but are not hard requirements—we may accept trade-offs based on what vetted solutions offer.

| Property | Description | Priority |
|----------|-------------|----------|
| **Forward secrecy** | Compromised key doesn't reveal past data | High (if achievable) |
| **Future secrecy** | Compromised key doesn't reveal future data | High (if achievable) |
| **Deniability** | Cannot prove Alice sent a message to Bob | Low |
| **Works offline** | Can encrypt without server round-trip | Medium |
| **Small message size** | Encrypted blobs aren't much larger than plaintext | Medium |
| **Browser-compatible** | Works in Web Crypto API / JavaScript | Required |
| **Audited implementation** | Library has had security audits | Required |
| **Active maintenance** | Library is actively maintained | Required |

This list will grow as we learn more from the design process and competitive research.

---

## 11. Success Criteria (Phase 1)

| Criterion | Measure |
|-----------|---------|
| Server cannot read locations | Database inspection shows only encrypted blobs |
| Contacts see correct data | Bob sees city, Carol sees street (per permissions) |
| UX is not degraded | Encryption is invisible in normal operation |
| Key exchange works | Adding a contact establishes encryption seamlessly |

**Deferred criteria (Phase 2+):** Key recovery, identity verification, security audit

---

## 12. Open Questions for Design Doc

**Solution selection:**
- Which existing encryption solution best fits our requirements?
- What trade-offs does each solution impose on our model?
- Can we adopt Matrix/Signal protocols, or do we need lower-level libraries?

**Phase 1 implementation:**
- How do we store keys on device securely?
- How do we handle permission level changes? (Re-encrypt?)
- What's the data format for encrypted location blobs?
- How do we detect "second device" login to warn users?

**Deferred but worth understanding:**
- How does Signal achieve forward/future secrecy?
- What would adopting Matrix protocol mean for our architecture?
- What identity verification approaches exist and what UX do they require?

---

## 13. References

- [Signal Protocol Documentation](https://signal.org/docs/)
- [Matrix Encryption (Olm/Megolm)](https://matrix.org/docs/guides/end-to-end-encryption-implementation-guide)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Keybase Saltpack](https://saltpack.org/)
- Issue #30: Zero-knowledge architecture
- Issue #32: Multi-device updates

---

*This PRD defines what we promise users. See DESIGN_ENCRYPTION.md for implementation options.*
