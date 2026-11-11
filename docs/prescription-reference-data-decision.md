# Prescription reference data: current architecture and source decision

Status: proposal for approval. Nothing in this document has been implemented. No drug, allergen or safety record has been created.
Written 2026-11-11. Every external claim below was read on the source page on that date unless marked **unverified**.

## 1. Current architecture (what exists today)

| Piece | Where | State |
|---|---|---|
| Patient allergies and medications | `Patient.medical.allergies`, `Patient.medical.medications` (`models/dental.models.ts`) | Two free-text strings typed in the patient form (200 chars). Conditions are a ticked list of 10 codes. Shown on the profile and in `hasAlert`. |
| Clinic medication list | setting `medications` (`rx/rx-library.service.ts`) | `Medication {name, brand?, generic?, strength?, form?, route?, instructions?, aliases?, reviewConditions?, archivedAt?}`. Free text, one flat list, starts empty. Brand and generic are just strings on the same row. |
| Allergy matching | `rx/rx-rules.ts` `rxWarnings` | Splits text into words, drops a stop list, matches equal words or a 6-letter prefix. Family matching exists only through the typed `aliases`. This is the "manual alias" mechanism you rejected. |
| Condition alerts | `Medication.reviewConditions` | Dentist picks conditions per drug. This is the same idea as Open Dental's template-configured alerts and is kept. |
| Templates | setting `rxTemplates` | `RxTemplate {name, description?, items[], updatedAt}`; items copy the drug fields. Independent of patient data. |
| Prescriptions | `Patient.prescriptions` | Draft, issued (numbered, frozen items and clinic/dentist/patient snapshot), superseded, voided, correction link, void reason. Immutable after issue. |
| Printing | `rx/rx-html.ts` | A4, black and white, built only from the frozen snapshot. |
| Backup | `SETTING_KEYS` in `services/backup.ts`; patients travel whole | `medications` and `rxTemplates` are backed up; prescriptions travel inside patients. |
| Tests | `rx-rules.spec.ts` (14), `rx-html.spec.ts` (2) | Cover the text matcher and lifecycle. |
| Old code | `patients/medications.ts` (16 names), visit-note prescription lines | Legacy; not used by the new flow. |

Not audited: audit-history for patient medical records (none exists today) and any use of `medical.*` outside the files grep found (patient form, profile, appointment editor, store tidy, `hasAlert`).

### Reuse versus replace
- **Keep:** prescription lifecycle, numbering, snapshots, correction and void, A4 print, templates (extended with references), `reviewConditions`, backup mechanism, item editor UI.
- **Replace:** the flat `Medication` list as the source of drug identity; the text-word allergy matcher as the primary mechanism; the two free-text medical strings as the only record.
- **Demote, not delete:** `Medication.aliases` (kept for old data, no longer used for matching), the clinic medication list (becomes "clinic favourites and local products" pointing at the shared reference).

## 2. How Open Dental actually does it (from its manual, v24.4)

- **Medication master list** (`medicationmaster`): generic and brand are separate entries. A generic must exist before a brand; a brand is added under a selected generic and inherits the generic name. Notes live on the generic only. Each entry can link to one **RxNorm**. Open Dental says all entries need an RxNorm for reconciliation, decision support and its interaction alerts to work. Medications are imported only from another Open Dental export, so the list is still built by the clinic.
- **RxNorms** (`rxnorms`): a separate imported code-system table. Drug names include ingredient, strength and form.
- **Allergy master list** (`allergiesmaster`): separate list. An allergen is either a **UNII** (ingredient or non-drug, e.g. latex, peanuts) or a **medication**, never both. Duplicates must be merged by hand. An allergy in use cannot be deleted, only hidden.
- **Patient allergies / medications** are separate patient records pointing at those lists.
- **Prescription templates** (`rxsetup`): drug, sig, dispense, refills, RxNorm, internal notes, patient instructions, alerts. Deleting a template never changes issued prescriptions.
- **Alerts** (`rxinteractionchecks`): the built-in alerts only fire for problems, medications or allergies the clinic configured on the template. Comprehensive drug-drug and drug-allergy checking is a separate paid service (Ensora eRx).

Where Open Dental is weak and we should improve: the medication list is hand-built, generic/brand is a two-level tree rather than an ingredient graph, combination products have no ingredient list of their own, allergen to medication is one link, and duplicates are merged manually.

## 3. Source decision

### 3.1 Identity spine: RxNorm "Current Prescribable Content" subset
- What it is: NLM's normalized drug names. Concept types we need: ingredient (IN), multi-ingredient (MIN), precise ingredient (PIN), clinical drug component (SCDC), clinical drug (SCD), brand name (BN), branded drug (SBD), dose form (DF). Relationships tie a branded drug to its clinical drug and every product to its ingredients. The RxNorm FAQ shows retrieving ingredients of any product by RXCUI (types IN, MIN, PIN).
- Licence: the full release needs a free UMLS licence and account, and proprietary source data inside it may need extra licences. **The Current Prescribable Content subset contains only the RXNORM and MTHSPL sources and needs no licence to download** (RxNorm overview and technical documentation, section 11.6). NLM does not charge. RxNav terms ask apps that use NLM data to carry a fixed attribution sentence and forbid using the NLM name or logo.
- Updates: monthly release (first Monday), weekly updates (Wednesday). Concepts can be merged or retired, so we store the RXCUI plus source version and resolve merges from the history files.
- **Limitation, stated by NLM:** RxNorm is U.S.-centric and contains few, if any, non-U.S. drugs. So it gives correct ingredient and clinical-drug identities worldwide, but it will **not** contain most Moroccan brand products.
- Not in this subset: drug interaction or contraindication content. Whether UNIIs are reachable through MTHSPL atoms in this subset is **unverified**; it is the first thing the import prototype must prove.

### 3.2 Ingredient and allergen identifiers: FDA UNII (GSRS)
- Open Dental uses UNII for allergens, so we match its model. FDA provides downloadable substance lists (names, codes, attributes) and mappings to CAS, ATC, MeSH and RxNorm codes; GSRS software is Apache 2.0 and the FDA article states US-government works are public domain in the US. **Exact redistribution terms of the downloadable data files: unverified**, to be confirmed on the download page before bundling.
- Use: non-drug allergens (latex, etc.) and cross-walk ingredient to UNII.

### 3.3 Classification: ATC (WHO Collaborating Centre)
- Useful as a code on ingredients and for browsing. The WHO page lists a "Permissions and licensing" section that I did not read; I know of no confirmed licence permitting bundling in a commercial product. **Treat as restricted until read.** Not needed for the first release.
- Important: an ATC class is a therapeutic grouping, not proof of allergic cross-reactivity. It will not drive allergy matching.

### 3.4 Regional products (Morocco)
- The Moroccan register is the AMMPS "Liste des médicaments" database. I could not load the AMMPS site from this environment, so **I cannot confirm that it is downloadable, in what format, or under what licence.** data.gov.ma lists health datasets but the one surfaced is a CNOPS medical-device list, not the medicines register. Pharmacy or price websites are excluded by your instruction.
- Decision: build a **regional extension layer** with a defined import format and mapper (product name, labeler, ingredients by INN, strength, form, source, version). It stays empty until the owner confirms access and licence. Until then, a dentist can add a **local product** that must point to one reference ingredient or be flagged "unmatched".
- Other national datasets exist (EMA SPOR/IDMP, France's public medicines database, Health Canada DPD). They are candidates for later regional packs, not needed now. IDMP/SPOR registration and licence were not read: **unverified**.

### 3.5 Interaction and contraindication data
- No free, authoritative, structured source was identified that I can bundle. RxNorm does not carry it. DrugBank, First Databank, Medi-Span, Lexicomp and Ensora are commercial or restricted: **licence terms not reviewed**.
- Decision: define a **provider interface** (input: patient ingredient list, conditions; output: findings with source, version, severity, evidence). Ship it **disconnected**. The UI says so. No interaction or contraindication rule is written by us.

## 4. Proposed model (separate concepts, referenced by id)

```
Source        {id, name, version, releasedAt, licence, attribution}
Substance     {id, name, kind: drug|nonDrug, externalIds[]}                 // ingredient; UNII, RXCUI(IN/PIN)
ClinicalDrug  {id, ingredients:[{substanceId, strength?}], form, route?, externalIds[]}   // "amoxicillin 500 mg capsule"
Product       {id, clinicalDrugId?, brandName, labeler?, region, availability?, externalIds[], sourceId}  // marketed brand
Synonym       {ownerId, text, lang, sourceId}
Allergen      {id, kind: substance|product|class|nonDrug, targetId, externalIds[], sourceId, verified}
PatientAllergy      {id, allergenId|null, legacyText?, type, reaction, severity?, onset?, active, verification, notes, history[]}
PatientMedication   {id, productId|clinicalDrugId|null, legacyText?, dose?, start?, stop?, current, origin: prescribed|imported|reported|manual, notes, history[]}
RxTemplate          {…existing fields, items reference clinicalDrugId/productId + free text}
PrescriptionItem    {…frozen copy + the ids it was chosen from}               // issued ones never re-resolve
```

Rules that follow from this:
- A **Product** is traced to ingredients only through its ClinicalDrug or its own ingredient list. Two products are the same only when they share an external id or the same ingredients, strength and form; **never by name similarity**.
- **Matching an allergy** resolves the allergen to substances, resolves the prescribed item to substances, and compares substance ids. Results are three states: *confirmed* (same substance by id), *possible* (only through a class or a salt/precise-ingredient relationship that the source states), *unknown* (free-text or unmatched, shown as such). The warning text names the exact substance and the path (for example "allergy: Augmentin; Augmentin contains amoxicillin; this item contains amoxicillin").
- **Class and family matches** are off until an authoritative cross-reactivity source is chosen. We will not treat "penicillin class" as clinically equivalent.
- Unmatched entries are first-class: stored with the original text, no invented identity.

## 5. Import process
1. A build-time tool (not at runtime, no patient data leaves the browser) reads the RxNorm Current Prescribable files and the UNII list, writes versioned JSON shards with a Source record.
2. The app loads shards into a separate IndexedDB store on first use; search is local and works offline.
3. A new release is a new shard set. Records are keyed by RXCUI/UNII, so an update never duplicates an identity. Merged or retired RXCUIs are remapped, and patient or template references keep the old id plus a redirect.
4. Size and search performance of the full subset are **not yet measured**; a dental-relevant filter would be a choice for you, not something I will invent.
5. Required attribution text from the RxNav terms goes in the UI footer of the library screen.

## 6. Migration of existing data (planned, not run)
- `medical.allergies` and `medical.medications` are kept verbatim as `legacyText` on a first PatientAllergy/PatientMedication record each. Nothing is discarded or auto-assigned.
- The UI offers "match to reference" with suggestions only from exact normalized name or synonym; the dentist confirms.
- Clinic medications created in the current version become local products marked unmatched, with the same suggest-and-confirm step. Their `aliases` stay as legacy and stop driving matches.
- Issued prescriptions and snapshots are not touched. Backups from before and after the change must both import (new fields optional; version tag added).

## 7. What I need from you before implementing
1. Confirm the spine: RxNorm Current Prescribable subset plus UNII, with the NLM attribution. This gives correct ingredients and generics worldwide but **not Moroccan brands**.
2. Moroccan brands: can you get written confirmation of access and licence for the AMMPS medicines list (or another official file)? Without it, brands in Morocco are local products linked to an ingredient.
3. Interaction checking: is a paid clinical provider acceptable? If not, Dontalist will say plainly that interaction checking is not connected.
4. Do you want class-level allergy matching at all, given no authoritative cross-reactivity source has been identified?

## Sources read
- https://www.opendental.com/manual/medicationmaster.html, rxnorms.html, allergiesmaster.html, rxsetup.html, rxinteractionchecks.html
- https://www.nlm.nih.gov/research/umls/rxnorm/faq.html (licensing, international use, release cadence, ingredient lookup)
- https://www.nlm.nih.gov/research/umls/rxnorm/overview.html and docs/techdoc.html (Current Prescribable Content needs no licence; SAB=RXNORM and MTHSPL)
- https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html (attribution, rate limits)
- https://precision.fda.gov/uniisearch and the FDA GSRS page (UNII downloads, mappings)
- https://www.who.int/tools/atc-ddd-toolkit/methodology (ATC description; licensing section not read)
