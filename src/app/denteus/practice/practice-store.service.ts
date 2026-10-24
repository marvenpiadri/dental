import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { ClinicDatabase } from '../services/clinic-database.service';
import { Expense, LabOrder, StockItem } from './practice-rules';

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
  private loading?: Promise<void>;

  init(): Promise<void> {
    this.loading ??= (async () => {
      const read = async <T>(key: string): Promise<T[]> => (await this.db.loadSetting<T[]>(key).catch(() => undefined)) ?? [];
      this.expenses.set(await read<Expense>('expenses'));
      this.stock.set(await read<StockItem>('stock'));
      this.lab.set(await read<LabOrder>('lab'));
      this.loaded.set(true);
    })();
    return this.loading;
  }

  changeExpenses(change: (list: Expense[]) => Expense[]): void { this.apply(this.expenses, 'expenses', change); }
  changeStock(change: (list: StockItem[]) => StockItem[]): void { this.apply(this.stock, 'stock', change); }
  changeLab(change: (list: LabOrder[]) => LabOrder[]): void { this.apply(this.lab, 'lab', change); }

  private apply<T>(list: WritableSignal<T[]>, key: string, change: (v: T[]) => T[]): void {
    list.update(change);
    void this.db.saveSetting(key, list());
  }
}
