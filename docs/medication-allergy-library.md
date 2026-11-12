# Medication and allergy library

Dontalist is universal, so the clinic builds its own libraries. No external drug catalogue (RxNorm, UNII, ATC, AMMPS) is bundled or required.

## What exists
- **Medications**: generic and brand entries. A brand points to an existing generic; names are unique per kind (case and accents ignored). Optional `externalId` per entry, for a code the clinic wants to keep. Entries can be hidden, not deleted, once in use. (`rx/med-library.ts`)
- **Allergies**: a separate clinic list; an allergen may be linked to a medication. Duplicates are merged by the clinic; an allergy in use is hidden, never deleted.
- **Patient records**: patient allergies and medications reference the libraries, carry an audit history, and soft-delete (`removedAt`).
- **Prescriptions**: numbered, immutable snapshots after issue; templates never change issued prescriptions.
- **Alerts**: the dentist chooses `reviewConditions` per medication, and the warning names the exact allergy and path. No interaction or contraindication rules are written by us; interaction checking is not connected.
- **Sharing**: libraries export and import as a versioned JSON package, parsed through a whitelist (`rx/library-io.ts`).

## Principles kept from the earlier research
- Unmatched or free-text entries are first-class; nothing is given an invented identity.
- Two products are the same only by shared id or identical ingredients, strength and form, never by name similarity.
- Class or family allergy matching stays off until an authoritative cross-reactivity source is chosen.
- Open Dental (the reference product) keeps generic and brand as separate master entries, separate allergen list, hides rather than deletes entries in use, and fires alerts only for conditions the clinic configured. Dontalist follows that model.

## Reference-data research (history)
An earlier proposal (RxNorm Current Prescribable subset + FDA UNII, a Morocco AMMPS import layer, a disconnected interaction provider) was dropped when the product direction became clinic-managed libraries. It was never implemented. The AMMPS register's format and licence were never confirmed. If an external catalogue is ever added, it should be an optional import into the same library, not a new data model.

See also `postgres-readiness.md` for the table design of these records.
