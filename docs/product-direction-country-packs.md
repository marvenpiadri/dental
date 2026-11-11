# Dontalist product direction: universal core, Morocco-first

**Decision date:** 10 November 2026  
**Status:** Product direction agreed; implementation deferred until the frontend scope is accepted.

## Product strategy

Dontalist is international by architecture, but Morocco-first in product delivery.

Do not create separate CRM codebases for each country. Maintain one universal dental CRM and add country-specific capability packs. A clinic receives the pack associated with its operating country; future packs are researched and activated only when there is real customer demand.

## Three configuration layers

1. **Universal CRM core** — patients, appointments, calendar, clinical records, odontogram and periodontogram, dental acts, treatment plans, quotes, invoices, offline/manual payment records, staff, documents and reporting.
2. **Country configuration** — jurisdiction-specific legal fields, document formats, terminology, tax/invoice rules, prescription conventions and reference data, only where verified and supported. This is not an insurance-claims or reimbursement module.
3. **Clinic configuration** — clinic identity, services and prices, appointment durations, enabled payment methods, staff access, templates, preferences and branding.

Country-specific rules must not be scattered through universal components as ad hoc checks. Keep them behind a country configuration/feature boundary.

## Clinic country and geographic reference data

- Every clinic has one operating country, identified by an ISO 3166-1 alpha-2 code (for example, MA).
- The country belongs to the clinic/location record, not to an individual dentist's personal profile.
- The initial account model remains one clinic/location per account.
- Country, language, currency and time zone are separate settings. A Moroccan clinic may use French as its interface language while operating in MAD.
- Use a locally stored/imported geographic reference dataset for country and administrative-location selectors; clinic setup must not depend on a third-party API being online.
- Support variable administrative levels. Do not assume every country has the same hierarchy or force every clinic to select a province/city subdivision that does not apply.
- The geographic dataset source mentioned by the product owner as "2piclock" has not yet been identified or licence-checked. Do not select or import a dataset until its exact source URL, data freshness and reuse terms are confirmed.
- Preserve source attribution and licence obligations for any imported country/region/city dataset.

## Morocco-specific configuration

Morocco is the first supported market. Dontalist may use verified Moroccan business, language, currency, document and regulatory configuration where it is genuinely needed.

**CNSS, CNOPS and insurer reimbursement workflows are permanently out of scope unless the product owner explicitly reverses this decision.** Do not build or retain insurer-specific forms, PDF templates, claim workflows, reimbursement tracking, insurer-specific chart annotations, or dedicated insurer fields and settings. Do not create a placeholder country module for them.

This does not remove ordinary clinic billing: treatment plans, invoices, credit notes, receipts and manually recorded patient payments remain part of the universal CRM. Those are not insurance claims.

## Future country packs

- Do not build a collection of speculative country packs now.
- Add a country when customer demand justifies research and implementation.
- Each pack needs a documented scope, source/authority references, supported workflows, last-verified date and known limitations.
- A clinic selecting a country must not be led to believe that every local legal or insurance workflow is supported automatically.
- Country selection controls availability; it is not, by itself, a compliance certification.

## Product boundaries that remain in force

- Desktop and tablet are the V1 targets; a separate phone app can come later.
- One clinic/location per account.
- Core chart modules remain odontogram and periodontogram only.
- Routine dental acts must remain recordable without requiring chart or tooth selection.
- Payments remain offline/manual; no online payment processing.
- No full pharmacy/dispensing ERP or automatic prescribing engine.
- Backend/database/authentication and production migration remain deferred until the frontend is accepted.

## Implementation ownership

**Good preparation work before backend:** product requirements, country-pack boundaries, field definitions, source/licence research, document inventories, test scenarios and documentation.

**Reserve for complex implementation and verification:** country-configuration runtime architecture, tenant isolation, backend authorization, migrations, import/synchronisation jobs, local browser validation, production builds and regression debugging.

## Open inputs

1. Exact URL for the geographic dataset referred to as "2piclock".
2. Any future country-specific requirement must be justified by a real clinic workflow and separately approved before implementation.
