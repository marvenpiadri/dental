import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DentalStore } from '../services/dental-store.service';

@Component({
  selector: 'den-patient-workspace',
  imports: [FormsModule],
  providers: [DentalStore],
  templateUrl: './patient-workspace.component.html',
  styleUrl: './patient-workspace.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientWorkspaceComponent implements OnInit {
  protected readonly store = inject(DentalStore);
  protected readonly query = signal('');
  protected readonly fullName = signal('');
  protected readonly phone = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly patients = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.store.patients().filter((patient) => !query || `${patient.fullName} ${patient.phone}`.toLocaleLowerCase().includes(query));
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.store.init();
    } catch {
      this.error.set('The local clinic library could not be opened. Check browser storage and reload the app.');
    }
  }

  async addPatient(): Promise<void> {
    const fullName = this.fullName().trim();
    const phone = this.phone().trim();
    if (!fullName) {
      this.error.set('Enter the patient’s full name.');
      return;
    }
    if (this.store.patients().some((patient) => patient.fullName.trim().toLocaleLowerCase() === fullName.toLocaleLowerCase() && patient.phone.trim() === phone)) {
      this.error.set('A patient with this name and phone number already exists.');
      return;
    }
    this.error.set(null);
    this.saved.set(false);
    this.store.addPatient({ fullName, phone });
    try {
      await this.store.flushPersistence();
      this.fullName.set('');
      this.phone.set('');
      this.saved.set(true);
    } catch {
      this.error.set('The patient could not be saved to this browser. Please try again.');
    }
  }
}
