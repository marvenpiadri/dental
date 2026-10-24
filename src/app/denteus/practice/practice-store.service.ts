import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { ClinicDatabase } from '../services/clinic-database.service';
import { Expense, ImplantRecord, LabOrder, SterilizationCycle, StockItem, Task } from './practice-rules';

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
      this.lab.set(await read<LabOrder>('lab'));
      this.tasks.set(await read<Task>('tasks'));
      this.implants.set(await read<ImplantRecord>('implants'));
      this.cycles.set(await read<SterilizationCycle>('steril'));
      this.loaded.set(true);
    })();
    return this.loading;
  }

  changeExpenses(change: (list: Expense[]) => Expense[]): void { this.apply(this.expenses, 'expenses', change); }
  changeStock(change: (list: StockItem[]) => StockItem[]): void { this.apply(this.stock, 'stock', change); }
  changeLab(change: (list: LabOrder[]) => LabOrder[]): void { this.apply(this.lab, 'lab', change); }

  changeTasks(change: (list: Task[]) => Task[]): void { this.apply(this.tasks, 'tasks', change); }
  changeImplants(change: (list: ImplantRecord[]) => ImplantRecord[]): void { this.apply(this.implants, 'implants', change); }
  changeCycles(change: (list: SterilizationCycle[]) => SterilizationCycle[]): void { this.apply(this.cycles, 'steril', change); }

  private apply<T>(list: WritableSignal<T[]>, key: string, change: (v: T[]) => T[]): void {
    list.update(change);
    void this.db.saveSetting(key, list());
  }
}
