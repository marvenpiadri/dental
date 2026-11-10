import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { I18n } from '../../core/i18n/i18n.service';
import { Dentist } from '../models/dental.models';
import { initials } from '../patients/patient-rules';
import { procedureName } from '../patients/treatment-rules';
import { doctorStats } from '../rules/doctor-stats';
import { DentalStore } from '../services/dental-store.service';

type Tab = 'overview' | 'patients' | 'acts';

/** `/doctors/:id`: a dentist's profile, laid out like a patient's. Contact and registration details are edited here and later printed on what they sign. */
@Component({
  selector: 'den-doctor-profile',
  imports: [RouterLink],
  templateUrl: './doctor-profile.component.html',
  styleUrl: '../patients/patient-profile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class DoctorProfileComponent {
  readonly id = input.required<string>();
  protected readonly store = inject(DentalStore);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly initials = initials;
  protected readonly tab = signal<Tab>('overview');
  protected readonly editing = signal(false);
  protected readonly tabs: readonly { id: Tab; key: 'dr.tab.overview' | 'dr.tab.patients' | 'dr.tab.acts'; icon: string }[] = [
    { id: 'overview', key: 'dr.tab.overview', icon: 'fa-house' }, { id: 'patients', key: 'dr.tab.patients', icon: 'fa-user-group' }, { id: 'acts', key: 'dr.tab.acts', icon: 'fa-tooth' },
  ];
  private readonly now = new Date();

  protected readonly doctor = computed(() => this.store.dentistMap().get(this.id()) ?? null);
  protected readonly canEdit = computed(() => this.auth.can('team.edit') || this.auth.can('settings.edit'));
  protected readonly stats = computed(() => doctorStats(this.id(), this.store.appointments(), this.store.patients(), this.now, (p, n) => procedureName(this.t, p, n)));
  protected readonly next = computed(() => this.store.appointments().filter((a) => a.dentistId === this.id() && a.start >= this.now && (a.status === 'scheduled' || a.status === 'confirmed')).sort((a, b) => +a.start - +b.start).slice(0, 8));
  /** Patients this dentist has seen or will see, most recent visit first. */
  protected readonly patients = computed(() => {
    const last = new Map<string, Date>();
    for (const a of this.store.appointments()) if (a.dentistId === this.id() && a.status !== 'cancelled' && (!last.has(a.patientId) || a.start > last.get(a.patientId)!)) last.set(a.patientId, a.start);
    return [...last].sort((x, y) => +y[1] - +x[1]).map(([id, when]) => ({ patient: this.store.patientMap().get(id), when })).filter((r) => !!r.patient);
  });
  protected readonly hours = computed(() => { const d = this.doctor(); return d?.hours?.open && d.hours.close ? `${d.hours.open} – ${d.hours.close}` : null; });
  protected name(id: string): string { return this.store.patientMap().get(id)?.fullName ?? ''; }

  protected save(d: Dentist, f: { name: string; specialty: string; phone: string; email: string; registration: string }): void {
    const clean = (v: string) => v.trim() || undefined;
    void this.store.saveResources(this.store.dentists().map((x) => x.id === d.id ? { ...x, name: f.name.trim() || x.name, specialty: f.specialty.trim(), phone: clean(f.phone), email: clean(f.email), registration: clean(f.registration) } : x), this.store.chairs());
    this.editing.set(false);
  }

  protected async pickPhoto(e: Event, d: Dentist): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file?.type.startsWith('image/')) return;
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height), size = Math.min(256, side);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
      void this.store.saveResources(this.store.dentists().map((x) => x.id === d.id ? { ...x, photo: canvas.toDataURL('image/jpeg', 0.85) } : x), this.store.chairs());
    } catch { /* unreadable image: keep the current photo */ }
  }
}
