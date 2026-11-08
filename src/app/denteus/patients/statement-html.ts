import { DEFAULT_TEMPLATE, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';

export interface StatementData {
  clinic: string; patient: string; insurer: string; number: string; date: string;
  lines: { date: string; tooth: string; name: string; price: string }[];
  total: string; lang: string;
  labels: { title: string; patient: string; insurer: string; number: string; date: string; tooth: string; act: string; price: string; total: string; note: string };
}

/** Care actually done (never planned work) and what was charged. */
export function statementDoc(s: StatementData): DocContent {
  const l = s.labels;
  return {
    kind: 'statement', lang: s.lang, dir: 'ltr', clinic: s.clinic, sender: [], title: l.title, subtitle: [],
    facts: [{ label: l.patient, value: s.patient }, { label: l.insurer, value: s.insurer }, { label: l.number, value: s.number }, { label: l.date, value: s.date }],
    blocks: [{ type: 'table', head: [l.date, l.tooth, l.act, l.price], rows: s.lines.map((x) => [x.date, x.tooth, x.name, x.price]), right: [3], foot: [['', '', l.total, s.total]] }],
    notes: [l.note],
  };
}
export const statementHtml = (s: StatementData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(statementDoc(s), tpl, { chart });
