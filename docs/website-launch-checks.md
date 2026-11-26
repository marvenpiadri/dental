# Dontalist website: launch checks (26 Nov 2026)

Status of the open items from the refinement brief. Nothing here is a business or legal decision; items marked **Owner** need yours.

| Item | Finding | Status |
|---|---|---|
| Centre Dentaire Dali as "first Dontalist clinic" | Confirmed by the owner in conversation (26 Nov 2026): it is the first clinic and the owner built its website. The site says "the first clinic to run on Dontalist" and links to centredentairedali.com. | Resolved. **Owner**: confirm the clinic itself is happy to be named publicly. |
| Inquiry form destination | `INQUIRY_ENDPOINT` in `site/src/app/core/site.ts` is empty. The forms say they cannot send yet instead of pretending. No API route exists for it. | **Open**: decide where inquiries go (API route + inbox, or email). |
| Clinic photography | None in the repo (`site/public` holds icons, logo, models and app screenshots only). | **Open**: needs real photos of Centre Dentaire Dali, with consent. |
| Implant, abutment, screw (3 STLs) | You state they are free-to-use models whose author published them for free use; there is no licence file. The site credits them as such (About page, Attributions). | **Owner**: record the author's name and source URL so the credit can name them. |
| Tooth anatomy | ToothFairy3 case F_026, CC BY-SA 4.0. Credit and licence link now on the About page (Attributions), which the footer links to. | Credit added. **Owner**: add the dataset authors' names/URL. ShareAlike applies to adaptations of the models. |
| Franchise and partnership advertising in Morocco | Not researched and not legal advice. The site contains no royalty figures, discounts, guarantees or income claims (checked: pages/franchise, partnership, services, about). | **Open**: needs a Moroccan lawyer before any terms are advertised. |
| Royalties (3% / 6% / 8%) | Not on the site at all, by design, until you approve the wording. | **Owner** |

## Claims verified against the code

- Six roles, permission defaults, owner-only permissions: `dental-api/src/auth/permissions.ts`; contract test `tests/permissions.contract.unit.test.ts`.
- Server-side enforcement and clinic isolation: real-PostgreSQL tests (`tests/appointments.pg.test.ts` "never lets one clinic reference or touch another clinic's rows"; `auth`, `team`, `patients`). Not yet verified on a deployed environment.
- Invoices: gap-free numbering, immutability triggers, credit notes, payments, refunds: `tests/billing.pg.test.ts`. App side: `patients/billing.component.ts`, `invoice-html.ts`.
- Odontogram facts: `docs/odontogram-engine.md` (FDI storage, FDI/Universal/Palmer display, status vs plan, 50-step undo, tooth overlay with 3D model, options, history and files).

## Not claimed on the site

Implants as four-part stacks inside the app's chart (Phase 1B, pending), quotes and prescription workflows (partly built), CNSS/CNOPS, X-ray, AI.
