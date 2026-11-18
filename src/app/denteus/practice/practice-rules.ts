export const EXPENSE_CATEGORIES = ['rent', 'salaries', 'supplies', 'lab', 'equipment', 'utilities', 'taxes', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
/** `category` is absent on expenses recorded before categories existed; they count as `other`. */
export interface Expense { id: string; day: string; label: string; amount: number; category?: ExpenseCategory }
/** `expires` is the earliest expiry date of what is on the shelf ("YYYY-MM-DD"). */
export interface StockItem { id: string; name: string; qty: number; min: number; unit?: string; expires?: string }
export const MOVE_KINDS = ['in', 'out', 'waste', 'adjust'] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];
/** One line of the stock ledger. `change` is signed; `after` is the balance once it was applied. `opening` records stock that existed before the ledger did. */
export interface StockMovement { id: string; itemId: string; day: string; kind: MoveKind | 'opening'; change: number; after: number; reason?: string; by: string }
export interface Task { id: string; text: string; done: boolean }
/** Which implant (brand and lot) went into which patient's tooth: needed if a lot is ever recalled. */
export interface ImplantRecord { id: string; patientId: string; tooth: string; brand: string; lot: string; day: string }
/** One run of the autoclave. */
export interface SterilizationCycle { id: string; day: string; device: string; lot: string; operator: string }
export const LAB_STATUSES = ['sent', 'ready', 'fitted', 'remake', 'cancelled'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];
/** One step in a lab order's life; the list is append-only. */
export interface LabEvent { day: string; status: LabStatus; by: string; note?: string }
export interface LabOrder { id: string; patientId: string; work: string; lab: string; due: string; status: LabStatus; tooth?: string; shade?: string; cost?: number; history?: LabEvent[] }
/** Sending work back or dropping it must say why. */
export const labNeedsNote = (status: LabStatus): boolean => status === 'remake' || status === 'cancelled';

/** Move an order to a new status and log it. Fitted and cancelled orders are closed. */
export function changeLabStatus(order: LabOrder, status: LabStatus, by: { day: string; who: string; note?: string }): { ok: true; order: LabOrder } | { ok: false; error: 'same' | 'closed' | 'note' } {
  if (status === order.status) return { ok: false, error: 'same' };
  if (order.status === 'fitted' || order.status === 'cancelled') return { ok: false, error: 'closed' };
  const note = by.note?.trim() || undefined;
  if (labNeedsNote(status) && !note) return { ok: false, error: 'note' };
  return { ok: true, order: { ...order, status, history: [...(order.history ?? []), { day: by.day, status, by: by.who, ...(note ? { note } : {}) }] } };
}

/** Total spent in a month, `month` as "YYYY-MM". */
export const monthTotal = (expenses: Expense[], month: string): number =>
  expenses.filter((e) => e.day.startsWith(month)).reduce((sum, e) => sum + e.amount, 0);

export const isLow = (item: StockItem): boolean => item.qty <= item.min;

/** Still at the lab after its due day. `today` and `due` are "YYYY-MM-DD", which sort as text. */
export const isLate = (order: LabOrder, today: string): boolean => (order.status === 'sent' || order.status === 'remake') && order.due !== '' && order.due < today;

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

export type MoveError = 'amount' | 'insufficient' | 'reason';
export type MoveResult = { ok: true; item: StockItem; moves: StockMovement[] } | { ok: false; error: MoveError };

/**
 * Applies one stock movement. The balance only ever changes through here, so it always equals the sum of the item's movements.
 * `in` receives, `out` uses, `waste` discards (both cannot take more than is in stock), `adjust` sets the counted quantity and needs a reason.
 * Stock that has no history yet (older records) first gets an `opening` line, so the ledger adds up.
 */
export function recordMovement(
  item: StockItem, history: readonly StockMovement[],
  input: { kind: MoveKind; amount: number; reason?: string; day: string; by: string; newId: () => string },
): MoveResult {
  const { kind, amount } = input, reason = input.reason?.trim() || undefined;
  if (!Number.isInteger(amount) || amount < 0 || (kind !== 'adjust' && amount < 1)) return { ok: false, error: 'amount' };
  if ((kind === 'out' || kind === 'waste') && amount > item.qty) return { ok: false, error: 'insufficient' };
  if (kind === 'adjust' && !reason) return { ok: false, error: 'reason' };
  const change = kind === 'in' ? amount : kind === 'adjust' ? amount - item.qty : -amount;
  if (change === 0) return { ok: false, error: 'amount' };
  const moves: StockMovement[] = [];
  const known = history.filter((m) => m.itemId === item.id).reduce((n, m) => n + m.change, 0);
  if (known !== item.qty) moves.push({ id: input.newId(), itemId: item.id, day: input.day, kind: 'opening', change: item.qty - known, after: item.qty, by: input.by });
  const after = item.qty + change;
  moves.push({ id: input.newId(), itemId: item.id, day: input.day, kind, change, after, ...(reason ? { reason } : {}), by: input.by });
  return { ok: true, item: { ...item, qty: after }, moves };
}

/** Newest first, bounded: the history panel never renders an item's whole life. */
export const movementsFor = (moves: readonly StockMovement[], itemId: string, limit = 20): StockMovement[] =>
  moves.filter((m) => m.itemId === itemId).reverse().slice(0, limit);

const dayNumber = (iso: string): number => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : NaN; };
export const isExpired = (item: StockItem, today: string): boolean => !!item.expires && dayNumber(item.expires) < dayNumber(today);
/** Not expired yet, but within `days`. */
export const expiresSoon = (item: StockItem, today: string, days = 60): boolean =>
  !!item.expires && !isExpired(item, today) && dayNumber(item.expires) - dayNumber(today) <= days;

/** A device that needs regular servicing (autoclave, compressor, X-ray unit). */
export interface Equipment { id: string; name: string; serial?: string; location?: string; everyMonths?: number; lastService?: string; /** Services done in the app, oldest first; the day always matches `lastService` for the newest. */ log?: { day: string; note?: string }[] }
export type ServiceState = 'none' | 'ok' | 'soon' | 'overdue';

/** The day service is next due ("YYYY-MM-DD"), or null when no interval or no first service is set. */
export function nextService(eq: Equipment): string | null {
  if (!eq.everyMonths || !eq.lastService) return null;
  const d = new Date(`${eq.lastService}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + eq.everyMonths);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); // 31 Jan + 1 month is 28/29 Feb, not March
  return d.toISOString().slice(0, 10);
}

export function serviceState(eq: Equipment, today: string, soonDays = 30): ServiceState {
  const due = nextService(eq);
  if (!due) return 'none';
  const left = dayNumber(due) - dayNumber(today);
  return left < 0 ? 'overdue' : left <= soonDays ? 'soon' : 'ok';
}
