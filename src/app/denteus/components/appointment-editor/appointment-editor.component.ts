import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CalIconComponent } from '../../../calendar/components/cal-icon/cal-icon.component';
import { DateTimeFieldComponent } from '../../../calendar/components/datetime-field/datetime-field.component';
import { formatDateTimeInput, formatTime, addMinutes } from '../../../calendar/utils/date.utils';
import {
  APPOINTMENT_TYPES,
  AppointmentDraft,
  AppointmentStatus,
  AppointmentTypeId,
  STATUS_META,
} from '../../models/dental.models';
import { isMovable } from '../../rules/scheduling-rules';
import { DentalStore } from '../../services/dental-store.service';
import { PatientPickerComponent } from '../patient-picker/patient-picker.component';

export interface EditorProblem {
  title: string;
  details: string[];
}

const DURATIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 15); // 15 min .. 3 h

/**
 * Booking form for one appointment. It never saves by itself: it emits the draft, the parent sends it
 * to the data layer and passes any refusal back in `problem`, so nothing the user typed is lost.
 */
@Component({
  selector: 'den-appointment-editor',
  imports: [CalIconComponent, DateTimeFieldComponent, PatientPickerComponent],
  templateUrl: './appointment-editor.component.html',
  styleUrl: './appointment-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'cancel.emit()' },
})
export class AppointmentEditorComponent implements OnInit {
  readonly draft = input.required<AppointmentDraft>();
  readonly mode = input<'create' | 'edit'>('create');
  /** Set by the parent when the server refused the last save. */
  readonly problem = input<EditorProblem | null>(null);
  readonly saving = input(false);

  readonly save = output<AppointmentDraft>();
  readonly cancel = output<void>();

  protected readonly store = inject(DentalStore);

  protected readonly types = APPOINTMENT_TYPES;
  protected readonly statusMeta = STATUS_META;
  protected readonly createStatuses: AppointmentStatus[] = ['scheduled', 'confirmed'];

  protected readonly patientId = signal<string | null>(null);
  protected readonly start = signal(new Date());
  protected readonly duration = signal(30);
  protected readonly dentistId = signal('');
  protected readonly chairId = signal('');
  protected readonly type = signal<AppointmentTypeId>('consultation');
  protected readonly status = signal<AppointmentStatus>('scheduled');
  protected readonly reason = signal('');
  protected readonly note = signal('');
  private durationTouched = false;

  /** Visits that already started or ended keep their schedule; only notes can change. */
  protected readonly scheduleLocked = computed(() => this.mode() === 'edit' && !isMovable(this.status()));

  protected readonly durations = computed(() => (DURATIONS.includes(this.duration()) ? DURATIONS : [...DURATIONS, this.duration()].sort((a, b) => a - b)));
  protected readonly endLabel = computed(() => formatTime(addMinutes(this.start(), this.duration())));
  protected readonly startLabel = computed(() => formatDateTimeInput(this.start()));

  /** Instant feedback only; the server decides when saving. */
  protected readonly warnings = computed(() => {
    if (this.scheduleLocked() || !this.patientId()) return [] as string[];
    return this.store.previewConflicts({
      id: this.draft().id,
      patientId: this.patientId() ?? '',
      dentistId: this.dentistId(),
      chairId: this.chairId(),
      start: this.start(),
      end: addMinutes(this.start(), this.duration()),
    });
  });

  protected readonly canSave = computed(() => !!this.patientId() && !!this.dentistId() && !!this.chairId() && !this.saving());

  constructor() {
    afterNextRender(() => document.getElementById('patient-search')?.focus());
  }

  ngOnInit(): void {
    const d = this.draft();
    this.patientId.set(d.patientId);
    this.start.set(new Date(d.start));
    this.duration.set(d.durationMin);
    this.dentistId.set(d.dentistId);
    this.chairId.set(d.chairId);
    this.type.set(d.type);
    this.status.set(d.status);
    this.reason.set(d.reason);
    this.note.set(d.note);
    this.durationTouched = this.mode() === 'edit' || d.durationMin !== 30;
  }

  protected onType(id: AppointmentTypeId): void {
    this.type.set(id);
    if (!this.durationTouched) {
      this.duration.set(this.types.find((t) => t.id === id)?.minutes ?? 30);
    }
  }

  protected onDuration(minutes: number): void {
    this.durationTouched = true;
    this.duration.set(minutes);
  }

  protected onCreatePatient(input: { fullName: string; phone: string }): void {
    this.patientId.set(this.store.addPatient(input).id);
  }

  protected submit(): void {
    if (!this.canSave()) return;
    this.save.emit({
      id: this.draft().id,
      patientId: this.patientId(),
      dentistId: this.dentistId(),
      chairId: this.chairId(),
      type: this.type(),
      status: this.status(),
      start: this.start(),
      durationMin: this.duration(),
      reason: this.reason(),
      note: this.note(),
    });
  }
}
