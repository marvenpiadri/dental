import { DEFAULT_TEMPLATE, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';

export interface LetterData {
  clinic: string; dentist: string; patient: string; date: string; title: string; lang: string;
  /** Lines shown under the title: who the letter goes to, days of rest. */
  details: string[];
  text: string;
  labels: { patient: string; date: string; signature: string };
}

/** A certificate or referral letter the browser prints; line breaks are kept. */
export function letterDoc(l: LetterData): DocContent {
  return {
    kind: 'letter', lang: l.lang, dir: 'ltr', clinic: l.clinic, sender: [l.dentist], title: l.title, subtitle: l.details,
    facts: [{ label: l.labels.patient, value: l.patient }, { label: l.labels.date, value: l.date }],
    blocks: [{ type: 'text', text: l.text }], notes: [], signature: l.labels.signature,
  };
}
export const letterHtml = (l: LetterData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(letterDoc(l), tpl, { chart });
