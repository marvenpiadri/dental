# Morocco insurance form assets

Place the original, blank PDF templates in the matching provider folder:

- `cnss/` — CNSS forms
- `cnops/` — CNOPS forms

These files are served as static public assets by the Angular build. Their production URLs will be:

- `/country-resources/morocco/insurance/cnss/<filename>.pdf`
- `/country-resources/morocco/insurance/cnops/<filename>.pdf`

Keep the source PDFs unchanged. Use descriptive, version-aware filenames where the issuing organisation publishes revisions (for example, `reimbursement-form-2026-01.pdf`). Do not put patient-completed forms here; generated patient copies belong in the patient's Documents.

No form PDFs are included yet; add the official files to these folders when ready.
