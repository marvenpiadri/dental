import { DEFAULT_TEMPLATE, DocContent, DocTemplate, renderDocument } from '../documents/doc-engine';
export { esc } from '../documents/doc-engine';

export interface ReceiptData {
  clinic: string;
  patient: string;
  number: string;
  date: string;
  method: string;
  reference?: string;
  amount: string;
  charged: string;
  paid: string;
  due: string;
  labels: { title: string; patient: string; date: string; method: string; amount: string; charged: string; paid: string; due: string; thanks: string; reference?: string };
  lang: string;
  dir: 'ltr' | 'rtl';
}

/** A single page the browser prints. Everything typed by staff is escaped by the document engine. */
export function receiptDoc(r: ReceiptData): DocContent {
  return {
    kind: 'receipt', lang: r.lang, dir: r.dir, clinic: r.clinic, sender: [], title: r.labels.title, number: r.number, subtitle: [],
    facts: [{ label: r.labels.patient, value: r.patient }, { label: r.labels.date, value: r.date }, { label: r.labels.method, value: r.method }, { label: r.labels.reference ?? '', value: r.reference ?? '' }],
    blocks: [{ type: 'rows', rows: [{ label: r.labels.amount, value: r.amount, strong: true }, { label: r.labels.charged, value: r.charged }, { label: r.labels.paid, value: r.paid }, { label: r.labels.due, value: r.due }] }],
    notes: [r.labels.thanks],
  };
}
export const receiptHtml = (r: ReceiptData, tpl: DocTemplate = DEFAULT_TEMPLATE, chart?: string): string => renderDocument(receiptDoc(r), tpl, { chart });
