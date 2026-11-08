# Document system

One content model (`DocContent`) and one renderer (`documents/doc-engine.ts`) serve every printed document: invoice, quote, receipt, care statement, prescription, tooth chart report, letters and referrals.
A clinic controls the look through templates (Settings > Documents): style (Modern, Minimal, Bold), accent, typeface, paper, logo, header and footer notes, section order and visibility, and which documents show the tooth chart.
Templates and per-kind defaults are stored in IndexedDB (`docTemplates`, `docDefaults`). The designer preview is the same HTML that prints.

- Tooth chart: `documents/chart-svg.ts` draws a vector SVG from the patient's recorded chart (FDI numbers, letter codes, hatching, legend; black and white only, readable in grayscale).
- PDF: browser print-to-PDF (no server, no new dependency). A server renderer would be a backend task.
- Reference: x-facture.com (Modern/Classic/Bold, header with logo and sender opposite metadata). Classic maps to Minimal.
- Data model: records are never changed by templates; only presentation is stored.

## Tooth chart artwork
The printed chart draws two arches seen from the biting side. Each tooth is a grey picture of the real 3D tooth from our library (`tooth-images.ts`, drawn through `ToothSnap`, seen from the biting side) on its flat crown outline, which comes from the same library (`public/models/teeth`, CC BY-SA 4.0), flattened by `tools/tooth-lib/outlines.py` into `documents/tooth-outlines.ts` (re-run it if the library changes).
Teeth are empty by default, with a striped band around the silhouette. Only recorded findings are drawn (hatching for caries, solid for fillings, letter codes, thick outline for crowns), in black and white.
The 3D pictures are drawn in the browser in the background the first time a chart is needed; until then, or without WebGL, the teeth print as plain outlines. No third-party artwork is used.
