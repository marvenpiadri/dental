import { ChangeDetectionStrategy, Component, afterNextRender, computed, inject, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, Key } from '../../core/i18n/i18n.service';
import { DentalStore } from '../services/dental-store.service';
import { localIsoDay } from '../utils/appointment-labels';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicDatabase } from '../services/clinic-database.service';
import { fileProblem, ACCEPTED } from '../patients/document-rules';
import { Documents } from '../documents/documents.service';
import { ReorderGroup, orderText, reorderGroups, EXPENSE_CATEGORIES, ExpenseCategory, Equipment, nextService, serviceState, LAB_STATUSES, LabOrder, LabStatus, changeLabStatus, labNeedsNote, MOVE_KINDS, MoveKind, StockItem, expiresSoon, implantsInLot, isExpired, isLate, isLow, monthTotal, movementsFor, sortTasks, wholeNumber } from './practice-rules';
import { PracticeStore } from './practice-store.service';

type Tab = 'tasks' | 'expenses' | 'stock' | 'lab' | 'equipment' | 'trace';

/** The daily running of the clinic outside the chair: what was spent, what is running out, what is at the lab. */
@Component({
  selector: 'den-practice',
  imports: [RouterLink],
  templateUrl: './practice.component.html',
  styleUrl: './practice.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ds-page' },
})
export class PracticeComponent {
  protected readonly practice = inject(PracticeStore);
  protected readonly store = inject(DentalStore);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly tabs: Tab[] = ['tasks', 'expenses', 'stock', 'lab', 'equipment', 'trace'];
  protected readonly tabKey: Record<Tab, Key> = { tasks: 'practice.tab.tasks', trace: 'practice.tab.trace', expenses: 'practice.tab.expenses', stock: 'practice.tab.stock', lab: 'practice.tab.lab', equipment: 'practice.tab.equipment' };
  protected readonly statuses = LAB_STATUSES;
  protected readonly statusKey: Record<LabStatus, Key> = { sent: 'practice.lab.status.sent', ready: 'practice.lab.status.ready', fitted: 'practice.lab.status.fitted', remake: 'practice.lab.status.remake', cancelled: 'practice.lab.status.cancelled' };
  protected readonly tab = signal<Tab>('tasks');
  protected readonly lot = signal('');
  protected readonly invalid = signal(false);
  protected readonly categories = EXPENSE_CATEGORIES;
  private readonly docs = inject(Documents);
  private readonly db = inject(ClinicDatabase);
  protected readonly accept = ACCEPTED;
  /** Files attached to open lab orders, by order id. Loaded for the open orders only (at most 30), never all documents. */
  protected readonly labFiles = signal<Record<string, { id: string; name: string; url: string }[]>>({});
  protected readonly labFileProblem = signal(false);
  private labFileUrls: string[] = [];
  private readonly labFilesLoader = effect(() => { this.orders(); void this.loadLabFiles(); });

  private async loadLabFiles(): Promise<void> {
    const open = this.orders().filter((o) => o.status !== 'fitted' && o.status !== 'cancelled').slice(0, 30);
    const out: Record<string, { id: string; name: string; url: string }[]> = {};
    for (const u of this.labFileUrls) URL.revokeObjectURL(u);
    this.labFileUrls = [];
    for (const patientId of new Set(open.map((o) => o.patientId))) {
      for (const d of await this.db.listDocuments(patientId)) {
        if (!d.labOrderId || !open.some((o) => o.id === d.labOrderId)) continue;
        const url = URL.createObjectURL(d.blob); this.labFileUrls.push(url);
        (out[d.labOrderId] ??= []).push({ id: d.id, name: d.name, url });
      }
    }
    this.labFiles.set(out);
  }

  protected async attachToOrder(o: LabOrder, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    this.labFileProblem.set(false);
    if (!file) return;
    if (fileProblem(file)) { this.labFileProblem.set(true); return; }
    try { await this.db.addDocument({ id: crypto.randomUUID(), patientId: o.patientId, name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString(), tooth: o.tooth, labOrderId: o.id, blob: file }); }
    catch { this.labFileProblem.set(true); return; }
    await this.loadLabFiles();
  }
  protected expKey = (c: string): Key => `exp.${c}` as Key;
  /** Set in the browser only: the server doesn't know the visitor's day. */
  protected readonly today = signal('');

  protected readonly monthSpent = computed(() => this.today() ? monthTotal(this.practice.expenses(), this.today().slice(0, 7)) : 0);
  protected readonly newestFirst = computed(() => [...this.practice.expenses()].sort((a, b) => b.day.localeCompare(a.day)));
  protected readonly lowCount = computed(() => this.attention());
  protected readonly taskList = computed(() => sortTasks(this.practice.tasks()));
  protected readonly openTasks = computed(() => this.practice.tasks().filter((x) => !x.done).length);
  protected readonly lotMatches = computed(() => implantsInLot(this.practice.implants(), this.lot()));
  protected readonly implantList = computed(() => [...this.practice.implants()].sort((a, b) => b.day.localeCompare(a.day)));
  protected readonly cycleList = computed(() => [...this.practice.cycles()].sort((a, b) => b.day.localeCompare(a.day)));
  protected readonly orders = computed(() => [...this.practice.lab()].sort((a, b) => a.due.localeCompare(b.due)));

  constructor() {
    afterNextRender(() => {
      this.today.set(localIsoDay(new Date()));
      void this.practice.init();
    });
  }

  protected isLow = isLow;
  /** What this person may do here; the server must enforce the same (see docs/audit/README.md, F15). */
  protected readonly may = computed(() => ({ add: this.auth.can('practice.create'), edit: this.auth.can('practice.edit'), pay: this.auth.can('billing.create'), payEdit: this.auth.can('billing.edit'), task: this.auth.can('tasks.create'), taskEdit: this.auth.can('tasks.edit') }));
  protected readonly equipmentList = computed(() => [...this.practice.equipment()].sort((a, b) => a.name.localeCompare(b.name)));
  protected readonly serviceLate = computed(() => this.today() ? this.practice.equipment().filter((e) => serviceState(e, this.today()) === 'overdue').length : 0);
  protected state = (e: Equipment) => serviceState(e, this.today());
  protected nextDue = nextService;
  protected addEquipment(name: string, serial: string, where: string, every: string, last: string): void {
    const months = wholeNumber(every, 0);
    if (!name.trim() || (months > 0 && !last)) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeEquipment((list) => [...list, { id: crypto.randomUUID(), name: name.trim(), serial: serial.trim() || undefined, location: where.trim() || undefined, everyMonths: months || undefined, lastService: last || undefined }]);
  }
  protected serviced(id: string, note = ''): void { this.practice.changeEquipment((list) => list.map((e) => (e.id === id ? { ...e, lastService: this.today(), log: [...(e.log ?? []), { day: this.today(), ...(note.trim() ? { note: note.trim().slice(0, 120) } : {}) }] } : e))); }
  protected late = (o: LabOrder): boolean => isLate(o, this.today());
  protected patientName = (id: string): string => this.store.patientMap().get(id)?.fullName ?? '—';

  protected addExpense(label: string, amount: string, category = 'other'): void {
    const value = wholeNumber(amount);
    if (!label.trim() || value <= 0) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeExpenses((list) => [...list, { id: crypto.randomUUID(), day: this.today(), label: label.trim(), amount: value, category: (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? (category as ExpenseCategory) : 'other' }]);
  }

  protected addStock(name: string, qty: string, min: string, unit = '', expires = '', supplier = ''): void {
    if (!name.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.addStockItem({ id: crypto.randomUUID(), name: name.trim(), qty: wholeNumber(qty), min: wholeNumber(min), unit: unit.trim() || undefined, expires: expires || undefined, supplier: supplier.trim() || undefined }, this.today(), this.who());
  }

  private who = (): string => this.auth.user()?.name ?? this.t('practice.stock.frontDesk');
  protected readonly moveKinds = MOVE_KINDS;
  protected readonly reorder = computed(() => reorderGroups(this.practice.stock()));
  protected readonly suppliers = computed(() => [...new Set(this.practice.stock().map((s) => s.supplier).filter((x): x is string => !!x))].sort());
  protected readonly copied = signal<string | null>(null);
  protected async copyOrder(g: ReorderGroup): Promise<void> {
    try { await navigator.clipboard.writeText(orderText(this.docs.clinicName(), g)); this.copied.set(g.supplier); } catch { this.copied.set(null); }
  }
  protected readonly moveKey: Record<MoveKind, Key> = { in: 'practice.stock.kind.in', out: 'practice.stock.kind.out', waste: 'practice.stock.kind.waste', adjust: 'practice.stock.kind.adjust' };
  /** The item whose movement form or history is open (one at a time keeps the list short). */
  protected readonly moving = signal<string | null>(null);
  protected readonly history = signal<string | null>(null);
  protected readonly moveError = signal<string | null>(null);
  protected readonly lastMoves = computed(() => { const id = this.history(); return id ? movementsFor(this.practice.stockMoves(), id) : []; });
  protected expired = (s: StockItem): boolean => isExpired(s, this.today());
  protected soon = (s: StockItem): boolean => expiresSoon(s, this.today());
  protected readonly attention = computed(() => this.practice.stock().filter((s) => isLow(s) || isExpired(s, this.today()) || expiresSoon(s, this.today())).length);

  /** One use at the chair: a single click records "used 1". */
  protected useOne(s: StockItem): void { void this.record(s.id, 'out', '1', ''); }

  protected clear(...fields: HTMLInputElement[]): boolean { for (const f of fields) f.value = ''; return true; }

  /** True when the movement was recorded. */
  protected record(id: string, kind: string, amount: string, reason: string): boolean {
    const trimmed = amount.trim();
    const n = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
    const r = this.practice.moveStock(id, { kind: kind as MoveKind, amount: n, reason, day: this.today(), by: this.who() });
    if (!r) return false;
    this.moveError.set(r.ok ? null : this.t(`practice.stock.err.${r.error}` as Key));
    if (r.ok) this.moving.set(null);
    return r.ok;
  }

  protected addOrder(patientId: string, work: string, lab: string, due: string, tooth = '', shade = '', cost = ''): void {
    if (!patientId || !work.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeLab((list) => [...list, { id: crypto.randomUUID(), patientId, work: work.trim(), lab: lab.trim(), due, status: 'sent', tooth: tooth.trim() || undefined, shade: shade.trim() || undefined, cost: wholeNumber(cost, 0) || undefined, history: [{ day: this.today(), status: 'sent', by: this.who() }] }]);
  }

  protected addTask(text: string): void {
    if (!text.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeTasks((list) => [...list, { id: crypto.randomUUID(), text: text.trim(), done: false }]);
  }

  protected toggleTask(id: string): void {
    this.practice.changeTasks((list) => list.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }

  protected addImplant(patientId: string, tooth: string, brand: string, lot: string): void {
    if (!patientId || !brand.trim() || !lot.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeImplants((list) => [...list, { id: crypto.randomUUID(), patientId, tooth: tooth.trim(), brand: brand.trim(), lot: lot.trim(), day: this.today() }]);
  }

  protected addCycle(device: string, lot: string, operator: string): void {
    if (!device.trim()) { this.invalid.set(true); return; }
    this.invalid.set(false);
    this.practice.changeCycles((list) => [...list, { id: crypto.randomUUID(), day: this.today(), device: device.trim(), lot: lot.trim(), operator: operator.trim() }]);
  }

  protected readonly labPending = signal<{ id: string; status: LabStatus } | null>(null);
  protected readonly labHistory = signal<string | null>(null);
  protected readonly labError = signal<string | null>(null);
  protected readonly needsNote = labNeedsNote;

  /** A status that needs a reason waits for it; the others apply at once. */
  protected setStatus(id: string, status: string, note = ''): boolean {
    const st = status as LabStatus, order = this.practice.lab().find((o) => o.id === id);
    if (!order || st === order.status) return false;
    if (labNeedsNote(st) && !note.trim()) { this.labError.set(this.labPending() ? this.t('practice.lab.err.note') : null); this.labPending.set({ id, status: st }); return false; }
    const r = changeLabStatus(order, st, { day: this.today(), who: this.who(), note });
    this.labError.set(r.ok ? null : this.t(`practice.lab.err.${r.error}` as Key));
    if (r.ok) { this.practice.changeLab((list) => list.map((o) => (o.id === id ? r.order : o))); this.labPending.set(null); }
    return r.ok;
  }
}
