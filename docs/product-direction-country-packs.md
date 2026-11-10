# Dontalist product direction: universal core, Morocco-first

**Decision date:** 10 November 2026  
**Status:** Product direction agreed; implementation deferred until the frontend scope is accepted.

## Product strategy

Dontalist is international by architecture, but Morocco-first in product delivery.

Do not create separate CRM codebases for each country. Maintain one universal dental CRM and add country-specific capability packs. A clinic receives the pack associated with its operating country; future packs are researched and activated only when there is real customer demand.

## Three configuration layers

1. **Universal CRM core** — patients, appointments, calendar, clinical records, odontogram and periodontogram, dental acts, treatment plans, quotes, invoices, offline/manual payment records, staff, documents and reporting.
2. **Country pack** — jurisdiction-specific legal fields, document formats, terminology, tax/invoice rules, prescription conventions, insurance workflows and reference datasets, only where verified and supported.
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

## Morocco country pack

Morocco is the first fully supported country pack.

The Moroccan pack is intended to contain country-specific workflows requested by Moroccan clinics, including:
- CNSS-related dental reimbursement administration;
- CNOPS-related dental reimbursement administration;
- FAR-related dental reimbursement administration;
- other relevant Moroccan mutuelles/insurers as their requirements are researched;
- Moroccan clinic, practitioner and document requirements;
- Moroccan reference datasets where official sources and reuse terms permit.

**This supersedes the earlier decision to permanently exclude CNSS/CNOPS/FAR forms.** The new direction is to make relevant insurance workflows available only to Moroccan clinics, not to expose them in the universal CRM or other countries' interfaces.

This decision does not mean every insurer's workflow is already specified or legally validated. Before implementing an insurer-specific form, verify the current form, required fields, act nomenclature, supporting documents, submission process and update/maintenance requirements. Do not claim electronic submission or official integration unless it exists and is authorised.

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

**Reserve for complex implementation and verification:** country-pack runtime architecture, tenant isolation, backend authorization, migrations, import/synchronisation jobs, insurer-specific form generation, local browser validation, production builds and regression debugging.

## Open inputs

1. Exact URL for the geographic dataset referred to as "2piclock".
2. The first Moroccan insurers and exact document workflows to support in V1.
3. Current official forms/specifications and their permitted reuse/update mechanisms.
