import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { isSameDay } from '../../calendar/utils/date.utils';
import { I18n } from '../../core/i18n/i18n.service';
import { Appointment, Patient } from '../models/dental.models';
import { DentalStore } from '../services/dental-store.service';
import { isActive, relativeDay } from '../utils/appointment-labels';
import { ageOn, initials, matchesQuery } from './patient-rules';

type Filter = 'all' | 'today' | 'alert';
type Sort = 'name' | 'recent';

interface Row {
  patient: Patient;
  next: Appointment | null;
  last: Appointment | null;
  live: 'arrived' | 'in-progress' | null;
}

const PAGE = 50;

@Component({
  selector: 'den-patient-list',
  imports: [RouterLink],
  templateUrl: './patient-list.component.html',
  styleUrl: './patient-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PatientListComponent {
  protected readonly store = inject(DentalStore);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly initials = initials;

  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly sort = signal<Sort>('name');
  private readonly limit = signal(PAGE);
  protected readonly filters: readonly Filter[] = ['all', 'today', 'alert'];

  // Only read after the store has loaded, which only happens in the browser.
  private readonly now = new Date();

  /** One pass over the appointments gives every patient's next visit, last visit and live status. */
  private readonly rows = computed<Row[]>(() => {
    const meta = new Map<string, Omit<Row, 'patient'>>();
    const get = (id: string) => meta.get(id) ?? meta.set(id, { next: null, last: null, live: null }).get(id)!;
    const now = this.now;
    for (const a of this.store.appointments()) {
      const m = get(a.patientId);
      if (a.status === 'completed' && a.start <= now && (!m.last || a.start > m.last.start)) m.last = a;
      if (isActive(a) && a.status !== 'completed' && a.end >= now && (!m.next || a.start < m.next.start)) m.next = a;
      if ((a.status === 'arrived' || a.status === 'in-progress') && isSameDay(a.start, now)) m.live = a.status;
    }
    return this.store.patients().map((patient) => ({ patient, ...(meta.get(patient.id) ?? { next: null, last: null, live: null }) }));
  });

  private readonly matching = computed(() => {
    const query = this.query();
    const filter = this.filter();
    const rows = this.rows().filter((row) => {
      if (!matchesQuery(row.patient, query)) return false;
      if (filter === 'alert') return !!row.patient.alert;
      if (filter === 'today') return (!!row.next && isSameDay(row.next.start, this.now)) || row.live !== null;
      return true;
    });
    const collator = new Intl.Collator(this.i18n.lang(), { sensitivity: 'base' });
    return rows.sort(
      this.sort() === 'name'
        ? (a, b) => collator.compare(a.patient.fullName, b.patient.fullName)
        : (a, b) => (b.patient.createdAt ?? '').localeCompare(a.patient.createdAt ?? ''),
    );
  });

  protected readonly visible = computed(() => this.matching().slice(0, this.limit()));
  protected readonly total = computed(() => this.matching().length);

  protected setQuery(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE);
  }

  protected setFilter(filter: Filter): void {
    this.filter.set(filter);
    this.limit.set(PAGE);
  }

  protected showMore(): void {
    this.limit.update((n) => n + PAGE);
  }

  protected age(patient: Patient): string {
    const years = ageOn(patient.birthDate, this.now);
    return years === null ? '' : this.i18n.tn('profile.age', years);
  }

  protected visit(a: Appointment | null): string {
    return a ? `${relativeDay(this.i18n, a.start, this.now)} · ${this.i18n.time(a.start)}` : this.t('common.notProvided');
  }
}
