# Dental engine — reconnaissance & architecture

Source studied: ZoliQua/Angular-Advanced-Odontogram v2.7.0 (MIT, © 2026 Zoltán Dul; port of React-Advanced-Odontogram). Payload version 2.22.
Licence notice: `src/app/denteus/odontogram/engine/vendor/LICENSE.odontogram`. Tooth SVGs are the author's own work, also MIT.

## Coupling map (why the shell was rejected)
| Layer | Source | Coupling | Decision |
|---|---|---|---|
| Registry axes, restorations matrix, validate, uiOptions, svgLayers | `core/registry/*` | pure | **vendored verbatim** (`engine/vendor/registry`) |
| Tooth record `defaultState` / `serializeState` / `hydrateState` + VALID_* sets, legacy migration | `core/state/payload.ts` | pure | **vendored** |
| Diagnoses derive / refine / packs / codes | `core/dx/*` | pure | **vendored** |
| FHIR R4 export/import, code systems | `core/fhir/*` | pure | **vendored** (needs `@types/fhir`) |
| Perio classification (2018 stage/grade) | `core/perioClassification.ts` | pure | **vendored** |
| Perio exam comparison | `core/state/examCompare.ts` | pure | **vendored** |
| Anatomy topology (FDI order, template/rot/mirror) | `core/anatomy/profiles.ts` | pure part only | **trimmed**; `measured` profile (4 MB art) not vendored |
| Chart/plan stores, caseMeta, perio setters, pulp setters | `core/state/{chart,caseMeta,perio,pulpApical}.ts` | module singletons + i18n | **re-implemented** per instance |
| Mutation rules, ds1 plan gating, rendering (`applyStateToSvgSingle`) | `core/odontogram.ts` (8.7k lines) | DOM + singletons | **re-implemented** as pure functions (rules read from source) |
| Shell UI, popups, CSS (62 KB global selectors) | `core/*.css`, components | DOM/global | **not used** — CRM-native UI |

## Architecture
- `engine/vendor/**` — MIT source, unmodified except strict-TS fixes (`['x']` index access) and a trimmed anatomy file.
- `engine/chart.ts` — pure: per-patient chart read/validate/write. No module state.
- `engine/exam.ts` — pure: explicit examination records, history, comparison.
- `engine/render.ts` — pure layer computation + SVG painting; owns no clinical truth.
- `engine/session.ts` — one instance per open chart; status/plan kept distinct.
- Angular components under `odontogram/` use the CRM design system and persist through `DentalStore`.

## Known source behaviours to preserve / flag
- Status vs plan: a status edit on a plan-edited tooth must confirm (ds1); unplanned teeth mirror status→plan.
- Caries on a filled surface is a *recurrent* (CARS) score, never primary ICDAS; hydrate infers CARS 3 only for legacy (<2.3) payloads.
- Derived diagnoses are suggestions (`dx` overrides add/suppress); never stored as confirmed.
- Unknown enum values fall back to defaults in `hydrateState` silently — the CRM wrapper reports them as import issues instead.

## Additions on top of the source behaviour (CRM-side, not in the library)
- **Planned** is derived (plan ≠ status per tooth), not a runtime-only "plan-edited" set, so plan protection survives a reload. Deviation from the source.
- `engine/numbering.ts`: FDI / Universal / Palmer are display only; stored data is always FDI. Primary teeth keep their permanent *position* (as in the source) and are labelled 51–85 on screen.
- `engine/perio.ts` `indexSummary`: O'Leary %, mean Silness-Löe PI and Löe-Silness GI (mean over teeth with at least one graded surface; the format cannot tell "scored 0" from "not scored").
- `chart-report.ts`: printable report; findings, plan ("planned, not performed") and suggested diagnoses ("not confirmed") are separate sections.
- `perio-graph.component.ts`: read-only probing picture; only charted sites get bars.
- Display options write `globals` (wisdom teeth, healthy pulp, base). A wisdom tooth with anything recorded is never hidden (`isBlankTooth`).
- Files tagged to a tooth (`PatientDocument.tooth`) are shown read-only in the tooth editor.

## Tests and old data
- 22 pure-logic test files were ported from the original library (`engine/vendor/**/__tests__`, MIT, `@ts-nocheck` as in the source). UI/DOM tests of the original shell were not ported: that shell is not used.
- Charts saved by the old embedded shell are `getStatusChart()` payloads (`{version, globals, teeth, case?, plan?}`); a spec builds that exact shape and checks it loads without issues and writes back identical teeth, plan, case data and globals. A chart from a real browser has not been loaded by hand.

## Not done
- The top view (premolars and molars; front teeth have no top drawing and keep the front one) is a per-browser display toggle, not the source's `occlusalVisible` global. Measured anatomy (4 MB of art) is not vendored.
