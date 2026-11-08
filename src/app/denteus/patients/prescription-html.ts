import { DEFAULT_TEMPLATE, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';
import { PrescriptionLine } from '../models/dental.models';

export interface PrescriptionData {
  clinic: string;
  dentist: string;
  patient: string;
  date: string;
  lines: PrescriptionLine[];
  labels: { title: string; patient: string; date: string; dentist: string; signature: string };
  lang: string;
}

/** A one-page prescription the browser prints. Drug names and doses are typed by staff. */
export function prescriptionDoc(r: PrescriptionData): DocContent {
  return {
    kind: 'prescription', lang: r.lang, dir: 'ltr', clinic: r.clinic, sender: [r.dentist], title: r.labels.title, subtitle: [],
    facts: [{ label: r.labels.patient, value: r.patient }, { label: r.labels.date, value: r.date }],
    blocks: [{ type: 'list', items: r.lines.map((l, i) => `${i + 1}. ${l.drug}${l.dosage ? ` — ${l.dosage}` : ''}${l.duration ? ` · ${l.duration}` : ''}`) }],
    notes: [], signature: r.labels.signature,
  };
}
export const prescriptionHtml = (r: PrescriptionData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(prescriptionDoc(r), tpl, { chart });
