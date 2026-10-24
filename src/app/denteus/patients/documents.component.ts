import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';
import { PatientDocument } from '../models/dental.models';
import { ClinicDatabase } from '../services/clinic-database.service';
import { ACCEPTED, fileProblem, formatSize } from './document-rules';

interface Shown { doc: PatientDocument; url: string; image: boolean }

/** X-rays, photos and reports for one patient, kept in this browser's database. */
@Component({
  selector: 'den-documents',
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsComponent {
  readonly patientId = input.required<string>();

  private readonly db = inject(ClinicDatabase);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly accept = ACCEPTED;
  protected readonly formatSize = formatSize;

  protected readonly shown = signal<Shown[]>([]);
  protected readonly loading = signal(true);
  protected readonly problem = signal<'type' | 'size' | 'storage' | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.release());
    effect(() => {
      const id = this.patientId();
      untracked(() => void this.load(id));
    });
  }

  private release(): void {
    for (const item of this.shown()) URL.revokeObjectURL(item.url);
  }

  private async load(patientId: string): Promise<void> {
    this.loading.set(true);
    try {
      const docs = await this.db.listDocuments(patientId);
      this.release();
      this.shown.set(docs.map((doc) => ({ doc, url: URL.createObjectURL(doc.blob), image: doc.type.startsWith('image/') })));
    } catch {
      this.problem.set('storage');
    }
    this.loading.set(false);
  }

  protected async choose(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = ''; // the same file picked again must fire a new change
    this.problem.set(null);
    let stored = 0;
    for (const file of files) {
      const bad = fileProblem(file);
      if (bad) { this.problem.set(bad); continue; }
      try {
        await this.db.addDocument({ id: crypto.randomUUID(), patientId: this.patientId(), name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString(), blob: file });
        stored++;
      } catch {
        this.problem.set('storage');
      }
    }
    if (stored) await this.load(this.patientId());
  }

  protected async remove(item: Shown): Promise<void> {
    try {
      await this.db.deleteDocument(item.doc.id);
      URL.revokeObjectURL(item.url);
      this.shown.update((list) => list.filter((x) => x !== item));
    } catch {
      this.problem.set('storage');
    }
  }

  protected day(iso: string): string {
    return this.i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
