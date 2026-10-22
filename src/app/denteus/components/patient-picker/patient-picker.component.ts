import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { CalIconComponent } from '../../../calendar/components/cal-icon/cal-icon.component';
import { Patient } from '../../models/dental.models';

/** Search an existing patient by name or phone, or add a new one without leaving the booking form. */
@Component({
  selector: 'den-patient-picker',
  imports: [CalIconComponent],
  templateUrl: './patient-picker.component.html',
  styleUrl: './patient-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientPickerComponent {
  readonly patients = input.required<Patient[]>();
  readonly patientId = model<string | null>(null);
  /** Emits the details of a patient to create; the parent creates it and selects it. */
  readonly createPatient = output<{ fullName: string; phone: string }>();

  protected readonly query = signal('');
  protected readonly searching = signal(false);
  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newPhone = signal('');

  protected readonly selected = computed(() => this.patients().find((p) => p.id === this.patientId()) ?? null);

  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = this.patients();
    const hits = q
      ? list.filter((p) => p.fullName.toLowerCase().includes(q) || (digits.length >= 3 && p.phone.replace(/\D/g, '').includes(digits)))
      : list;
    return hits.slice(0, 7);
  });

  protected startSearch(): void {
    this.searching.set(true);
    this.creating.set(false);
    this.query.set('');
  }

  protected pick(p: Patient): void {
    this.patientId.set(p.id);
    this.searching.set(false);
  }

  protected startCreate(): void {
    this.newName.set(this.query().trim());
    this.newPhone.set('');
    this.creating.set(true);
  }

  protected confirmCreate(): void {
    const fullName = this.newName().trim();
    if (!fullName) return;
    this.createPatient.emit({ fullName, phone: this.newPhone().trim() });
    this.creating.set(false);
    this.searching.set(false);
  }

  protected onEnter(event: Event): void {
    event.preventDefault();
    const first = this.matches()[0];
    if (first) this.pick(first);
  }
}
