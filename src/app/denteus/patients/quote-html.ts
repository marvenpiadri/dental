import { DEFAULT_TEMPLATE, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';

export interface QuoteData {
  clinic: string;
  patient: string;
  date: string;
  lines: { tooth: string; name: string; price: string }[];
  total: string;
  labels: { title: string; patient: string; date: string; tooth: string; act: string; price: string; total: string; note: string };
  lang: string;
}

/** A printable quote (devis) for the planned work. */
export function quoteDoc(q: QuoteData): DocContent {
  const l = q.labels;
  return {
    kind: 'quote', lang: q.lang, dir: 'ltr', clinic: q.clinic, sender: [], title: l.title, subtitle: [],
    facts: [{ label: l.patient, value: q.patient }, { label: l.date, value: q.date }],
    blocks: [{ type: 'table', head: [l.tooth, l.act, l.price], rows: q.lines.map((x) => [x.tooth, x.name, x.price]), right: [2], foot: [['', l.total, q.total]] }],
    notes: [l.note],
  };
}
export const quoteHtml = (q: QuoteData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(quoteDoc(q), tpl, { chart });
