import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { Appointment, PrescriptionLine, VisitNote } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { typeKey } from '../utils/appointment-labels';
import { MEDICATIONS } from './medications';
import { prescriptionHtml } from './prescription-html';
import { noteContent } from './visit-rules';

const emptyLine = (): PrescriptionLine => ({ drug: '', dosage: '', duration: '' });

/** What was found and done at each visit, and the prescription handed over. Starts from an appointment or on its own. */
@Component({
  selector: 'den-visit-notes',
  templateUrl: './visit-notes.component.html',
  styleUrl: './visit-notes.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitNotesComponent {
  readonly patientName = input('');
  readonly notes = input<VisitNote[]>([]);
  /** This patient's appointments, to link a note to one. */
  readonly appointments = input<Appointment[]>([]);
  /** An appointment to start a note for (from the calendar link). */
  readonly startFor = input<string | null>(null);
  readonly edit = output<(notes: VisitNote[]) => VisitNote[]>();

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly typeKey = typeKey;
  protected readonly medications = MEDICATIONS;
  protected readonly dentists = this.store.dentists;

  protected readonly open = signal(false);
  protected readonly appointmentId = signal('');
  protected readonly dentistId = signal('');
  protected readonly complaint = signal('');
  protected readonly findings = signal('');
  protected readonly care = signal('');
  protected readonly lines = signal<PrescriptionLine[]>([emptyLine()]);
  protected readonly empty = signal(false);

  protected readonly newestFirst = computed(() => [...this.notes()].sort((a, b) => b.at.localeCompare(a.at)));
  protected readonly recentAppointments = computed(() => [...this.appointments()].sort((a, b) => b.start.getTime() - a.start.getTime()));

  constructor() {
    effect(() => {
      const id = this.startFor();
      if (id) untracked(() => this.begin(id));
    });
  }

  protected begin(appointmentId = ''): void {
    const appointment = this.appointments().find((a) => a.id === appointmentId);
    this.appointmentId.set(appointment?.id ?? '');
    this.dentistId.set(appointment?.dentistId ?? this.dentists()[0]?.id ?? '');
    this.open.set(true);
  }

  protected pickAppointment(id: string): void {
    this.appointmentId.set(id);
    const appointment = this.appointments().find((a) => a.id === id);
    if (appointment) this.dentistId.set(appointment.dentistId);
  }

  protected setLine(index: number, field: keyof PrescriptionLine, value: string): void {
    this.lines.update((lines) => lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  protected addLine(): void {
    this.lines.update((lines) => [...lines, emptyLine()]);
  }

  protected removeLine(index: number): void {
    this.lines.update((lines) => (lines.length > 1 ? lines.filter((_, i) => i !== index) : [emptyLine()]));
  }

  protected save(): void {
    const content = noteContent({ complaint: this.complaint(), findings: this.findings(), care: this.care(), lines: this.lines() });
    if (!content) { this.empty.set(true); return; }
    const note: VisitNote = { id: crypto.randomUUID(), at: new Date().toISOString(), ...content };
    if (this.appointmentId()) note.appointmentId = this.appointmentId();
    if (this.dentistId()) note.dentistId = this.dentistId();
    this.edit.emit((notes) => [...notes, note]);
    this.reset();
  }

  protected reset(): void {
    this.open.set(false);
    this.empty.set(false);
    this.appointmentId.set('');
    this.complaint.set('');
    this.findings.set('');
    this.care.set('');
    this.lines.set([emptyLine()]);
  }

  protected remove(note: VisitNote): void {
    this.edit.emit((notes) => notes.filter((n) => n.id !== note.id));
  }

  protected dentistName(note: VisitNote): string {
    return (note.dentistId && this.store.dentistMap().get(note.dentistId)?.name) || '';
  }

  protected appointmentOf(note: VisitNote): Appointment | undefined {
    return note.appointmentId ? this.appointments().find((a) => a.id === note.appointmentId) : undefined;
  }

  protected day(iso: string): string {
    return this.i18n.date(new Date(iso), { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected appointmentLabel(a: Appointment): string {
    return `${this.i18n.date(a.start, { day: 'numeric', month: 'short' })} ${this.i18n.time(a.start)} · ${this.t(typeKey(a.type))}`;
  }

  /** Opens the prescription in a new window and prints it. A blocked pop-up simply does nothing: the browser shows its own notice. */
  protected print(note: VisitNote): void {
    const t = this.t;
    const html = prescriptionHtml({
      clinic: this.store.locations()[0]?.name ?? 'Dentaleus',
      dentist: this.dentistName(note),
      patient: this.patientName(),
      date: this.day(note.at),
      lines: note.prescription ?? [],
      labels: { title: t('rx.title'), patient: t('receipt.patient'), date: t('receipt.date'), dentist: t('rx.dentist'), signature: t('rx.signature') },
      lang: this.i18n.lang(),
    });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}
