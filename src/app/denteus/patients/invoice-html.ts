import { DEFAULT_TEMPLATE, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';

export interface InvoiceData {
  clinic: string; patient: string; number: string; date: string; title: string;
  /** Shown under the title of a credit note: which invoice it cancels. */
  cancels?: string;
  lines: { where: string; name: string; price: string }[];
  /** Business name, tax number, bank details and note set in Settings; empty lines are skipped. */
  legal: string[];
  total: string; paid: string; remaining: string; lang: string;
  labels: { patient: string; date: string; where: string; act: string; price: string; total: string; paid: string; remaining: string };
}

/** One printable page. Payments are not processed here, only recorded. */
export function invoiceDoc(d: InvoiceData): DocContent {
  const l = d.labels;
  return {
    kind: 'invoice', lang: d.lang, dir: 'ltr', clinic: d.clinic, sender: [], title: d.title, number: d.number, subtitle: d.cancels ? [d.cancels] : [],
    facts: [{ label: l.patient, value: d.patient }, { label: l.date, value: d.date }],
    blocks: [
      { type: 'table', head: [l.where, l.act, l.price], rows: d.lines.map((x) => [x.where, x.name, x.price]), right: [2] },
      { type: 'rows', rows: [{ label: l.total, value: d.total, strong: true }, { label: l.paid, value: d.paid }, { label: l.remaining, value: d.remaining }] },
    ],
    notes: d.legal,
  };
}
export const invoiceHtml = (d: InvoiceData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(invoiceDoc(d), tpl, { chart });
