import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { ClinicDatabase } from '../services/clinic-database.service';
import { PRACTICE_KEYS, PracticeData } from '../services/backup';
import { Expense, ImplantRecord, LabOrder, MoveKind, SterilizationCycle, StockItem, StockMovement, Task, recordMovement } from './practice-rules';

/**
 * Expenses, stock and lab orders: small lists kept in the browser database next to the clinic's settings.
 * shortcut: not part of backups yet, and one saved list per kind; move to tables with the Postgres backend.
 */
@Injectable({ providedIn: 'root' })
export class PracticeStore {
  private readonly db = inject(ClinicDatabase);
  readonly loaded = signal(false);
  readonly expenses = signal<Expense[]>([]);
  readonly stock = signal<StockItem[]>([]);
  readonly stockMoves = signal<StockMovement[]>([]);
  readonly lab = signal<LabOrder[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly implants = signal<ImplantRecord[]>([]);
  readonly cycles = signal<SterilizationCycle[]>([]);
  private loading?: Promise<void>;

  init(): Promise<void> {
    this.loading ??= (async () => {
      const read = async <T>(key: string): Promise<T[]> => (await this.db.loadSetting<T[]>(key).catch(() => undefined)) ?? [];
      this.expenses.set(await read<Expense>('expenses'));
      this.stock.set(await read<StockItem>('stock'));
      this.stockMoves.set(await read<StockMovement>('stockMoves'));
      this.lab.set(await read<LabOrder>('lab'));
      this.tasks.set(await read<Task>('tasks'));
      this.implants.set(await read<ImplantRecord>('implants'));
      this.cycles.set(await read<SterilizationCycle>('steril'));
      this.loaded.set(true);
    })();
    return this.loading;
  }

  private readonly lists = { expenses: this.expenses, stock: this.stock, stockMoves: this.stockMoves, lab: this.lab, tasks: this.tasks, implants: this.implants, steril: this.cycles } as unknown as Record<(typeof PRACTICE_KEYS)[number], WritableSignal<unknown[]>>;

  /** For backups: what is in the lists now (loads them first, so an early export isn't empty). */
  async snapshot(): Promise<PracticeData> {
    await this.init();
    return Object.fromEntries(PRACTICE_KEYS.map((k) => [k, this.lists[k]()])) as PracticeData;
  }

  /** Replaces the lists with a backup's. Saved first, shown after, like the rest of a restore. */
  async restore(data: PracticeData): Promise<void> {
    await this.init();
    for (const key of PRACTICE_KEYS) await this.db.saveSetting(key, data[key]);
    for (const key of PRACTICE_KEYS) this.lists[key].set(data[key]);
  }

  changeExpenses(change: (list: Expense[]) => Expense[]): void { this.apply(this.expenses, 'expenses', change); }
  changeStock(change: (list: StockItem[]) => StockItem[]): void { this.apply(this.stock, 'stock', change); }
  /**
   * The only way a quantity changes after an item exists. The item is saved before its ledger lines: a crash between the two leaves a balance
   * the history does not explain, which the next movement records as an `opening` line instead of hiding it.
   */
  moveStock(itemId: string, input: { kind: MoveKind; amount: number; reason?: string; day: string; by: string }): ReturnType<typeof recordMovement> | undefined {
    const item = this.stock().find((s) => s.id === itemId);
    if (!item) return undefined;
    const result = recordMovement(item, this.stockMoves(), { ...input, newId: () => crypto.randomUUID() });
    if (result.ok) {
      this.apply(this.stock, 'stock', (list) => list.map((s) => (s.id === itemId ? result.item : s)));
      this.apply(this.stockMoves, 'stockMoves', (list) => [...list, ...result.moves]);
    }
    return result;
  }
  /** A new item; any starting quantity is an `opening` movement so the ledger adds up from the first day. */
  addStockItem(item: StockItem, day: string, by: string): void {
    this.apply(this.stock, 'stock', (list) => [...list, item]);
    if (item.qty > 0) this.apply(this.stockMoves, 'stockMoves', (list) => [...list, { id: crypto.randomUUID(), itemId: item.id, day, kind: 'opening', change: item.qty, after: item.qty, by } as StockMovement]);
  }
  changeLab(change: (list: LabOrder[]) => LabOrder[]): void { this.apply(this.lab, 'lab', change); }

  changeTasks(change: (list: Task[]) => Task[]): void { this.apply(this.tasks, 'tasks', change); }
  changeImplants(change: (list: ImplantRecord[]) => ImplantRecord[]): void { this.apply(this.implants, 'implants', change); }
  changeCycles(change: (list: SterilizationCycle[]) => SterilizationCycle[]): void { this.apply(this.cycles, 'steril', change); }

  private apply<T>(list: WritableSignal<T[]>, key: string, change: (v: T[]) => T[]): void {
    list.update(change);
    void this.db.saveSetting(key, list());
  }
}
