# Dontalist website: launch checks (26 Nov 2026)

Status of the open items from the refinement brief. Nothing here is a business or legal decision; items marked **Owner** need yours.

| Item | Finding | Status |
|---|---|---|
| Naming a first clinic | Removed from the home page on 27 Nov 2026 at the owner's request: the site no longer names or links any clinic. | Resolved. Revisit only if the owner wants a named reference later, with that clinic's consent. |
| Inquiry form destination | The partnership form opens WhatsApp click-to-chat to `212695083880` (`WHATSAPP` in `site/src/app/core/site.ts`) with the message prefilled. Nothing is stored on a server. | **Done** (owner decision). Revisit if inquiries should land in an inbox/API instead. |
| Clinics directory | `/clinics` lists entries from `site/src/app/core/clinics.ts`, currently empty (empty state shown). Each card opens its `url`. | **Open**: add real subscribed clinics, only with their consent. Dr Sabrine Tament (Dentisto) not added: not confirmed as a Dontalist subscriber. |
| Clinic photography | None in the repo (`site/public` holds icons, logo, models and app screenshots only). | **Open**: real clinic photos, with consent, if the owner wants them. |
| Implant, abutment, screw (3 STLs) | You state they are free-to-use models whose author published them for free use; there is no licence file. The site credits them as such (About page, Attributions). | Deferred by the owner (27 Nov 2026): no author names needed for now. |
| Tooth anatomy | ToothFairy3 case F_026, CC BY-SA 4.0. Credit and licence link are on the About page (Attributions), which the footer links to. | Deferred by the owner (27 Nov 2026): dataset author names later. |
| Franchise and partnership terms | The Partnership page lists the offers discussed (co-branding, franchise levels 1 to 3, affiliates) and the royalties 3% / 6% / 8%. It states no inclusions, fees, territories, guarantees or income claims; those are set out in conversation. | Deferred by the owner: a Moroccan lawyer is brought in when a prospect asks for a contract. |
| Royalties (3% / 6% / 8%) | Shown on the Partnership page exactly as given (levels 1, 2, 3), with no other term attached. | Resolved. |

## Claims verified against the code

- Six roles, permission defaults, owner-only permissions: `dental-api/src/auth/permissions.ts`; contract test `tests/permissions.contract.unit.test.ts`.
- Server-side enforcement and clinic isolation: real-PostgreSQL tests (`tests/appointments.pg.test.ts` "never lets one clinic reference or touch another clinic's rows"; `auth`, `team`, `patients`). Not yet verified on a deployed environment.
- Invoices: gap-free numbering, immutability triggers, credit notes, payments, refunds: `tests/billing.pg.test.ts`. App side: `patients/billing.component.ts`, `invoice-html.ts`.
- Odontogram facts: `docs/odontogram-engine.md` (FDI storage, FDI/Universal/Palmer display, status vs plan, 50-step undo, tooth overlay with 3D model, options, history and files).

## Not claimed on the site

Implants as four-part stacks inside the app's chart (Phase 1B, pending), quotes and prescription workflows (partly built), CNSS/CNOPS, X-ray, AI.
