export interface Expense { id: string; day: string; label: string; amount: number }
export interface StockItem { id: string; name: string; qty: number; min: number }
export interface Task { id: string; text: string; done: boolean }
/** Which implant (brand and lot) went into which patient's tooth: needed if a lot is ever recalled. */
export interface ImplantRecord { id: string; patientId: string; tooth: string; brand: string; lot: string; day: string }
/** One run of the autoclave. */
export interface SterilizationCycle { id: string; day: string; device: string; lot: string; operator: string }
export const LAB_STATUSES = ['sent', 'ready', 'fitted'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];
export interface LabOrder { id: string; patientId: string; work: string; lab: string; due: string; status: LabStatus }

/** Total spent in a month, `month` as "YYYY-MM". */
export const monthTotal = (expenses: Expense[], month: string): number =>
  expenses.filter((e) => e.day.startsWith(month)).reduce((sum, e) => sum + e.amount, 0);

export const isLow = (item: StockItem): boolean => item.qty <= item.min;

/** Still at the lab after its due day. `today` and `due` are "YYYY-MM-DD", which sort as text. */
export const isLate = (order: LabOrder, today: string): boolean => order.status === 'sent' && order.due !== '' && order.due < today;

/** Whole numbers only (items, dirhams): anything else becomes the fallback. */
export const wholeNumber = (value: string, fallback = 0): number => {
  const n = Number(value.trim());
  return value.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : fallback;
};

/** Open tasks first, otherwise the order they were added. */
export const sortTasks = (tasks: Task[]): Task[] => [...tasks].sort((a, b) => Number(a.done) - Number(b.done));

/** Implants that came from one lot, for a recall notice. */
export const implantsInLot = (records: ImplantRecord[], lot: string): ImplantRecord[] =>
  lot.trim() ? records.filter((r) => r.lot.trim().toLowerCase() === lot.trim().toLowerCase()) : [];
