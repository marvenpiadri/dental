# Dontalist — decisions awaiting your approval (before Phase 2)

Companion to `docs/architecture-proposal-d1.md` §17. **Nothing here is implemented.** Order: the ones that block everything first.

Cost figures come from Cloudflare's published pricing pages checked on 2026-11-14 (D1, R2, Workers). Figures marked *estimate* are mine, based on your target of 10 clinics and about 100 visits a day each (~1,000 visits/day). Cloudflare Access/Zero Trust pricing was **not** verified; confirm it before relying on it.

Reference prices: Workers Paid is $5/month minimum (10M requests included). D1 paid includes 25B rows read and 50M rows written per month, storage 5 GB included then $0.75/GB-month, max 10 GB per database, point-in-time restore 30 days (7 on Free). D1 free: 5M rows read and 100k rows written per day, 500 MB per database. R2: $0.015/GB-month, 10 GB free, no egress fee.

*Estimate for your size:* ~1,000 visits/day at ~100 rows written each is about 3M writes a month, far inside the paid allowance. Realistic infrastructure cost is the $5 Workers Paid minimum plus pennies of storage. The Free plan would be too tight (100k writes/day, 500 MB).

---

## D1 — How staff sign in (blocks everything)

**Meaning.** Today a PIN in the browser only hides screens; anyone with developer tools can read all data. Once data lives on a server, the server must know who is calling and which clinic they belong to, otherwise clinic separation is only cosmetic.

**Options**
| Option | What it is |
|---|---|
| A. Own login in D1 | Email + password (or PIN + device) per staff member, server-side sessions, passwords hashed with a slow hash |
| B. Cloudflare Access | Cloudflare handles login (email one-time codes or Google/Microsoft) in front of the app |
| C. Third-party identity (Clerk, Auth0, Firebase Auth) | A hosted login service issues tokens the Worker verifies |

**Recommendation.** A, with the existing role model kept, plus optional email one-time codes later. Keep the PIN only as a quick "unlock this tablet" step after a full sign-in.

**Pros / cons.** A: no extra vendor, roles and clinic membership live in your own tables, works for tablets at the front desk; but you own password reset, lockout and brute-force protection (more code to get right). B: very little code and strong, but ties you to Cloudflare for identity, is awkward for shared reception tablets, and per-user cost beyond a free tier is unverified. C: fastest and well-tested, but a monthly bill per active user and another vendor holding staff identities.

**Cost.** A: $0 beyond the Workers plan. B: unverified. C: typically tens of dollars a month at 10 clinics (not verified here).

**Security / isolation.** In every option the Worker must take `clinic_id` and `staff_id` from the verified session, never from the request body. A needs careful work (hashing, rate limiting, session expiry, password reset). Healthcare data raises the bar: mandatory sign-out on idle, audit of every sign-in.

**Hard to change later?** **Yes, moderately.** Staff accounts, session format and password hashes would need migrating; the role rules themselves do not change.

---

## D12 — One database for all clinics, or one per clinic (new, blocks Phase 2)

**Meaning.** Whether all clinics share one D1 database separated by `clinic_id`, or each clinic gets its own D1 database.

**Options.** (A) Shared database, `clinic_id` in every key (what the proposal draws). (B) One database per clinic.

**Recommendation.** A for V1 (10 clinics, simple), with the schema keeping `clinic_id` everywhere so B stays possible.

**Pros / cons.** A: one migration to run, easy cross-clinic reports for the owner of a chain, but one bug in a query can leak across clinics and one 10 GB cap applies to all. B: strong physical separation, easy per-clinic backup/export/delete, but every migration runs N times and cross-clinic reporting is hard.

**Cost.** D1 paid allows 100,000 databases; extra databases beyond that cost $0.10/month. Either option is cheap at your size.

**Security / isolation.** B is the safer default for patient data. A depends entirely on every query being clinic-scoped; composite foreign keys (in the proposal) protect rows from being attached to the wrong clinic but not a query that forgets the filter.

**Hard to change later?** **Yes, hard.** Moving from A to B (or back) means re-partitioning all data.

---

## D11 — Is offline use required? (new, blocks Phase 2)

**Meaning.** The app today works with no internet because everything is in the browser. A server-based app stops when the connection drops.

**Options.** (A) Online only. (B) Online first, with a read-only cache of today's agenda and patient basics. (C) Full offline with later sync.

**Recommendation.** A for V1, B as a follow-up if clinics report outages.

**Pros / cons.** A: simplest and safest for clinical data (one source of truth). B: keeps the day running but only for reading. C: the most convenient and by far the most complex (conflicting edits to charts, payments and appointments), and it fights your integrity rules.

**Cost.** A: none. B: modest extra work. C: a large project on its own.

**Security / isolation.** Anything cached on a tablet is patient data at rest on that device, so B and C need encryption and a remote-wipe story.

**Hard to change later?** **Yes** from A to C (design assumptions change throughout); B can be added later.

---

## D2 — Legacy examiner names

**Meaning.** Old examinations store the examiner as free text ("Dr Alami"), the new model needs a staff member id.

**Options.** (A) Match exactly, otherwise flag as ambiguous for a person to resolve. (B) Auto-match loosely (same surname). (C) Store the text as-is in a "legacy examiner" column.

**Recommendation.** A for the match, and C as the fallback for anything unresolved, so no history is lost.

**Pros / cons.** A: never attributes a clinical record to the wrong doctor, but needs a person to resolve some rows. B: faster, but a wrong attribution on a medical record is a real risk. C alone: keeps the text, loses the link.

**Cost.** None beyond a small review screen.

**Security / isolation.** Attribution is part of the audit trail; wrong attribution is worse than a visible gap.

**Hard to change later?** Easy before migration, **hard after** (corrections need amended records).

---

## D3 — The working chart becomes a draft examination

**Meaning.** Today there is a live "current odontogram" plus saved examinations. Proposed: the working chart is simply an unsigned draft examination, and the "current" state is derived from the latest signed examination plus the open draft.

**Options.** (A) Draft exam (proposal). (B) Keep a separate mutable "current chart" table.

**Recommendation.** A.

**Pros / cons.** A: one concept, history can't be altered by editing, simpler audit. B: matches today's code, but two copies can disagree, and edits can overwrite what examinations are supposed to preserve.

**Cost.** Slightly more query work for "current state".

**Security / isolation.** A gives a structurally immutable history (signed exams are frozen by the database).

**Hard to change later?** **Yes** after data is loaded.

---

## D4 — The planned-treatment layer on the chart

**Meaning.** The chart has a "planned" layer (what a tooth should look like after treatment). Migration cannot know which planned states were a clinician's decision.

**Options.** (A) Do not convert them into findings; use them to pre-fill a draft treatment plan the clinician confirms. (B) Convert directly into plan items. (C) Drop them.

**Recommendation.** A.

**Pros / cons.** A: nothing becomes a completed or accepted plan by accident, costs one confirmation step per patient with a plan. B: automatic but could create priced items nobody agreed. C: loses clinical intent.

**Cost.** None. **Security.** No data risk; avoids falsely creating billable items.

**Hard to change later?** Easy now, awkward after plans are billed.

---

## D5 — Where original raw data is kept during recovery and migration

**Meaning.** The recovery rules require keeping the original, unreadable data untouched.

**Options.** (A) Files in R2 (object storage) with a hash recorded in the database. (B) A text column in a quarantine table in D1.

**Recommendation.** A.

**Pros / cons.** A: keeps raw data out of business tables (your "no JSON in persistence" rule), cheap, big payloads fine; adds a second storage system. B: one system, simple to query, but raw JSON then lives in the database, and rows over 2 MB won't fit.

**Cost.** A: R2 is $0.015/GB-month, 10 GB free, no egress fee; negligible. B: D1 storage $0.75/GB-month over 5 GB.

**Security / isolation.** Both need clinic-scoped keys. R2 objects must never be publicly listable.

**Hard to change later?** Moderate.

---

## D6 — Open Dental names unverified

**Meaning.** The comparison table's Open Dental table and column names come from my own knowledge; your data-dictionary link returned a 404.

**Options.** (A) You attach the dictionary or confirm a version, I verify the table. (B) Accept the table as an unverified reference.

**Recommendation.** A. The design does not depend on exact column names, but the table should not be presented as verified until it is.

**Cost.** None. **Security.** None. **Hard to change later?** Easy.

---

## D9 — How the tooth record is shaped in the database

**Meaning.** A tooth has about 45 simple fields plus per-surface findings. Fully "one row per fact" is the most flexible; typed columns are easiest to query and validate.

**Options.** (A) Typed core columns for the single-valued fields, separate rows for surface findings, flags and perio sites (proposal). (B) Everything as rows (finding kind + value). (C) One wide table with every field as a column.

**Recommendation.** A.

**Pros / cons.** A: the database rejects invalid values for the core fields and keeps repeating parts independent. B: easiest to extend with new finding types but weaker constraints and slower charts. C: simplest, but ~45+ columns, awkward for per-surface data, and every new finding type is a migration.

**Cost.** None beyond design effort. **Security.** A gives the strongest value-level validation.

**Hard to change later?** **Yes, hard** once clinical data is stored; get it right in the review.

---

## D10 — Moroccan insurer list

**Meaning.** The 23-entry catalogue contains names I could not fully confirm: MCAP, MUCAP (acronym-only) and the FAR entry.

**Options.** (A) You review and correct the list. (B) Ship it flagged "to be confirmed".

**Recommendation.** A before launch; customers can already add their own insurers.

**Cost / security.** None. **Hard to change later?** Easy.

---

## Already decided

- **D7** Neon and PostgreSQL dropped (you decided on 2026-11-13). Work archived in `db/postgres-superseded/`.
- **D8** Chart safety fixes done in the frontend (damaged charts locked with a recovery step, tooth-type changes confirmed, tests added).

## What happens next

When you answer D1, D12 and D11 (and ideally D3, D5, D9), I can start Phase 2: sign-in and a Worker skeleton, FlaresID, and an empty D1 schema, without touching the existing frontend. Nothing in Phase 2 is destructive to your current browser data.
