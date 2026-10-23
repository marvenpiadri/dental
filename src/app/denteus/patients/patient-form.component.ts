import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { PatientInput } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { PatientProblem, validatePatient } from './patient-rules';

type Values = Record<'fullName' | 'phone' | 'email' | 'birthDate' | 'sex' | 'city' | 'alert' | 'notes', string>;
type Field = keyof Values;

const EMPTY: Values = { fullName: '', phone: '', email: '', birthDate: '', sex: '', city: '', alert: '', notes: '' };

/** Creates a patient, or edits one when the route carries an `id` (bound from the URL). */
@Component({
  selector: 'den-patient-form',
  imports: [RouterLink],
  templateUrl: './patient-form.component.html',
  styleUrl: './patient-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PatientFormComponent {
  readonly id = input<string>();

  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly values = signal<Values>({ ...EMPTY });
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveFailed = signal(false);
  private loadedFor: string | null = null;

  protected readonly editing = computed(() => !!this.id());
  protected readonly existing = computed(() => (this.id() ? this.store.patientMap().get(this.id()!) ?? null : null));
  protected readonly missing = computed(() => this.editing() && this.store.loaded() && !this.existing());

  protected readonly problems = computed(() => {
    if (!this.submitted()) return {};
    return validatePatient(this.toInput(), this.store.patients(), new Date(), this.id());
  });
  protected readonly hasProblems = computed(() => Object.keys(this.problems()).length > 0);

  constructor() {
    // Fill the form once the record has loaded; never again, so the user's typing isn't overwritten.
    effect(() => {
      const patient = this.existing();
      if (!patient || this.loadedFor === patient.id) return;
      untracked(() => {
        this.loadedFor = patient.id;
        this.values.set({
          fullName: patient.fullName,
          phone: patient.phone,
          email: patient.email ?? '',
          birthDate: patient.birthDate ?? '',
          sex: patient.sex ?? '',
          city: patient.city ?? '',
          alert: patient.alert ?? '',
          notes: patient.notes ?? '',
        });
      });
    });
  }

  protected set(field: Field, value: string): void {
    this.values.update((v) => ({ ...v, [field]: value }));
  }

  protected errorKey(field: Field): Key | null {
    const problem = (this.problems() as Partial<Record<Field, PatientProblem>>)[field];
    return problem ? (`form.error.${problem}` as Key) : null;
  }

  protected backLink(): string[] {
    return this.id() ? ['/patients', this.id()!] : ['/patients'];
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    this.saveFailed.set(false);

    if (this.hasProblems()) {
      // wait for the error state to render, then put the cursor on the first field to fix
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
      return;
    }

    this.saving.set(true);
    try {
      const input = this.toInput();
      const saved = this.id() ? this.store.updatePatient(this.id()!, input) : this.store.addPatient(input);
      await this.store.flushPersistence();
      if (saved) await this.router.navigate(['/patients', saved.id]);
    } catch {
      this.saveFailed.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  private toInput(): PatientInput {
    const v = this.values();
    return {
      fullName: v.fullName,
      phone: v.phone,
      email: v.email,
      birthDate: v.birthDate,
      sex: v.sex === 'female' || v.sex === 'male' ? v.sex : undefined,
      city: v.city,
      alert: v.alert,
      notes: v.notes,
    };
  }
}
