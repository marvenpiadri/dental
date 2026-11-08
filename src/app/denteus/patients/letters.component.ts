import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Letter } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { Documents } from '../documents/documents.service';
import { letterHtml } from './letter-html';

/** Medical certificates and referral letters. Written once, printed as often as needed, never edited. */
@Component({
  selector: 'den-letters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="add" novalidate (submit)="$event.preventDefault(); save()">
      <label class="field"><span class="label">{{ t('letter.kind') }}</span>
        <select class="input" (change)="setKind($any($event.target).value)">
          <option value="certificate" [selected]="kind() === 'certificate'">{{ t('letter.certificate') }}</option>
          <option value="referral" [selected]="kind() === 'referral'">{{ t('letter.referral') }}</option>
        </select></label>
      @if (kind() === 'referral') {
        <label class="field"><span class="label">{{ t('letter.to') }}</span><input class="input" [value]="to()" maxlength="120" (input)="to.set($any($event.target).value)" /></label>
      } @else {
        <label class="field narrow"><span class="label">{{ t('letter.rest') }}</span><input class="input" inputmode="numeric" [value]="rest()" (input)="rest.set($any($event.target).value)" /></label>
      }
      <label class="field wide"><span class="label">{{ t('letter.text') }}</span>
        <textarea class="input" rows="4" maxlength="1500" [value]="text()" (input)="text.set($any($event.target).value)" [attr.aria-invalid]="invalid() ? 'true' : null"></textarea></label>
      <button class="btn btn--primary" type="submit"><i class="fa-solid fa-file-signature" aria-hidden="true"></i>{{ t('letter.save') }}</button>
    </form>
    @if (invalid()) { <p class="error" role="alert">{{ t('letter.error') }}</p> }
    @if (rows().length) {
      <ul class="items">
        @for (l of rows(); track l.id) {
          <li><span class="when">{{ day(l.at) }} · {{ t(l.kind === 'referral' ? 'letter.referral' : 'letter.certificate') }}@if (l.to) { → {{ l.to }} }@if (l.restDays) { · {{ t('letter.days', { n: l.restDays }) }} }</span>
            <button type="button" class="btn btn--icon" [attr.aria-label]="t('letter.print')" (click)="print(l)"><i class="fa-solid fa-print" aria-hidden="true"></i></button></li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; padding: 16px; }
    .add { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
    .field { display: flex; flex-direction: column; gap: 4px; } .field.wide { flex: 1 1 100%; } .narrow { width: 140px; }
    .label { font-size: 12px; color: var(--app-muted); font-weight: 600; }
    .error { color: var(--app-danger); font-size: 13px; margin: 8px 0 0; }
    .items { list-style: none; margin: 16px 0 0; padding: 0; }
    .items li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--app-line); } .when { flex: 1; color: var(--app-muted); }
  `,
})
export class LettersComponent {
  readonly patientName = input('');
  readonly letters = input<Letter[]>([]);
  readonly edit = output<(letters: Letter[]) => Letter[]>();
  private readonly store = inject(DentalStore);
  private readonly i18n = inject(I18n);
  private readonly docs = inject(Documents);
  readonly chart = input<unknown>();
  protected readonly t = this.i18n.t;

  protected readonly kind = signal<Letter['kind']>('certificate');
  protected readonly to = signal('');
  protected readonly rest = signal('');
  protected readonly text = signal('');
  protected readonly invalid = signal(false);
  protected readonly rows = computed(() => [...this.letters()].sort((a, b) => b.at.localeCompare(a.at)));

  protected setKind(k: string): void { this.kind.set(k as Letter['kind']); }
  protected day(iso: string): string { return this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }); }

  protected save(): void {
    const text = this.text().trim();
    const days = this.rest().trim() === '' ? undefined : Number(this.rest());
    if (!text || (this.kind() === 'referral' && !this.to().trim()) || (days !== undefined && !(Number.isInteger(days) && days > 0 && days <= 365))) { this.invalid.set(true); return; }
    const letter: Letter = { id: crypto.randomUUID(), at: new Date().toISOString(), kind: this.kind(), dentistId: this.store.dentists()[0]?.id, text,
      ...(this.kind() === 'referral' ? { to: this.to().trim() } : days ? { restDays: days } : {}) };
    this.edit.emit((list) => [...list, letter]);
    this.text.set(''); this.to.set(''); this.rest.set(''); this.invalid.set(false);
  }

  protected print(l: Letter): void {
    const t = this.t;
    const tpl = this.docs.templateFor('letter');
    const html = letterHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dontalist', dentist: this.store.dentists().find((d) => d.id === l.dentistId)?.name ?? '', patient: this.patientName(),
      date: this.day(l.at), lang: this.i18n.lang(), title: t(l.kind === 'referral' ? 'letter.referral' : 'letter.certificate'),
      details: [...(l.to ? [`${t('letter.to')}: ${l.to}`] : []), ...(l.restDays ? [t('letter.days', { n: l.restDays })] : [])], text: l.text,
      labels: { patient: t('receipt.patient'), date: t('receipt.date'), signature: t('rx.signature') },
    }, tpl, this.docs.chartFor('letter', tpl, this.chart(), 'status'));
    this.docs.print(html);
  }
}
