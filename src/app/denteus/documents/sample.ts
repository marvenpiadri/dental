import type { Key } from '../../core/i18n/i18n.service';
import { newChart, writeChart } from '../odontogram/engine/chart';
import { applyEdit, type ToothEdit } from '../odontogram/engine/edits';
import { reportDoc } from '../odontogram/chart-report';
import { invoiceDoc } from '../patients/invoice-html';
import { letterDoc } from '../patients/letter-html';
import { prescriptionDoc } from '../patients/prescription-html';
import { quoteDoc } from '../patients/quote-html';
import { receiptDoc } from '../patients/receipt-html';
import { DocContent, DocKind } from './doc-engine';

type T = (key: Key, params?: Record<string, string | number>) => string;

/** A small chart with a few findings, only for the designer's preview. */
export function sampleChart(): unknown {
  const c = newChart();
  const edit = (n: number, e: ToothEdit) => applyEdit(c.status.get(n)!, n, e);
  edit(16, { kind: 'caries', surface: 'occlusal', on: true });
  edit(26, { kind: 'fillingMaterial', value: 'composite' }); edit(26, { kind: 'fillingSurface', surface: 'mesial', on: true });
  edit(36, { kind: 'restoration', value: 'crown|emax' });
  edit(46, { kind: 'selection', value: 'none' });
  edit(11, { kind: 'endo', value: 'endo-filling' });
  return writeChart(c);
}

/** Sample content built by the real document builders, so the preview is exactly what will print. */
export function sampleDoc(kind: DocKind, t: T, clinic: string, lang: string, money: (n: number) => string): DocContent {
  const patient = t('doc.sample.patient'), date = new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [{ where: '36', name: t('doc.sample.act1'), price: money(600) }, { where: '16', name: t('doc.sample.act2'), price: money(300) }];
  const common = { clinic, patient, date, lang };
  switch (kind) {
    case 'invoice': return invoiceDoc({ ...common, number: '2026-0042', title: t('inv.invoice'), lines, legal: [clinic, t('doc.sample.legal')], total: money(900), paid: money(500), remaining: money(400),
      labels: { patient: t('receipt.patient'), date: t('receipt.date'), where: t('plan.tooth'), act: t('plan.procedure'), price: t('plan.price'), total: t('inv.total'), paid: t('bill.paid'), remaining: t('bill.due') } });
    case 'quote': return quoteDoc({ ...common, lines: lines.map((l) => ({ tooth: l.where, name: l.name, price: l.price })), total: money(900),
      labels: { title: t('quote.title'), patient: t('receipt.patient'), date: t('receipt.date'), tooth: t('plan.tooth'), act: t('plan.procedure'), price: t('plan.price'), total: t('quote.total'), note: t('quote.note') } });
    case 'receipt': return receiptDoc({ ...common, number: 'R-0042', method: t('pay.cash'), amount: money(500), charged: money(900), paid: money(500), due: money(400), dir: 'ltr',
      labels: { title: t('receipt.title'), patient: t('receipt.patient'), date: t('receipt.date'), method: t('bill.method'), amount: t('receipt.amount'), charged: t('bill.charged'), paid: t('bill.paid'), due: t('bill.due'), thanks: t('receipt.thanks') } });
    case 'prescription': return prescriptionDoc({ ...common, dentist: t('doc.sample.dentist'), lines: [{ drug: 'Amoxicillin 1 g', dosage: '1 + 1 + 1', duration: t('doc.sample.days') }],
      labels: { title: t('rx.title'), patient: t('receipt.patient'), date: t('receipt.date'), dentist: t('rx.dentist'), signature: t('rx.signature') } } as Parameters<typeof prescriptionDoc>[0]);
    case 'letter': return letterDoc({ ...common, dentist: t('doc.sample.dentist'), title: t('letter.referral'), details: [`${t('letter.to')}: Dr Benjelloun`], text: t('doc.sample.letter'),
      labels: { patient: t('receipt.patient'), date: t('receipt.date'), signature: t('rx.signature') } });
    case 'report': return reportDoc({ ...common, dir: 'ltr', findings: [{ tooth: '16', items: [t('doc.sample.act2')] }, { tooth: '36', items: [t('doc.sample.act1')] }], planned: [], suggested: [], summary: [],
      labels: { title: t('dc.report.title'), patient: t('dc.report.patient'), date: t('dc.report.date'), findings: t('dc.report.findings'), planned: t('dc.report.planned'), plannedNote: t('dc.report.plannedNote'), suggested: t('dc.report.suggested'), suggestedNote: t('dc.report.suggestedNote'), summary: t('dc.report.summary'), none: t('dc.report.none') } });
  }
}
