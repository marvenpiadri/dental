// Chart import/export. Imports are untrusted: parse errors become a message, content goes through readChart
// (issues reported, unusable payloads rejected) — never a silent empty chart.
import { readChart, writeChart, type Chart, type ReadResult } from './chart';
import { buildFhirBundle } from './vendor/fhir/toFhir';
import { parseFhirBundle } from './vendor/fhir/fromFhir';

export type ImportResult = ReadResult & { error?: string };

export const exportJson = (c: Chart): string => JSON.stringify(writeChart(c), null, 2);
/** FHIR R4 Bundle of the findings (and plan, if different). Diagnoses in it are the derived suggestions, as exported by the library. */
export const exportFhir = (c: Chart): string => JSON.stringify(buildFhirBundle(writeChart(c) as never), null, 2);

function parse(text: string): { value?: unknown; error?: string } {
  try { return { value: JSON.parse(text) }; } catch { return { error: 'not valid JSON' }; }
}

export function importJson(text: string): ImportResult {
  const p = parse(text);
  return p.error ? { chart: null, issues: [], error: p.error } : readChart(p.value);
}

export function importFhir(text: string): ImportResult {
  const p = parse(text);
  if (p.error) return { chart: null, issues: [], error: p.error };
  try { return readChart(parseFhirBundle(p.value)); } catch { return { chart: null, issues: [], error: 'not a FHIR bundle this chart can read' }; }
}
