/** Stored as plain strings so it survives backups and a future database column unchanged. */
export interface OpeningHours { open: string; close: string; /** 0 = Sunday … 6 = Saturday */ days: number[] }
export interface Hours { startMin: number; endMin: number; days: readonly number[] }

export const DEFAULT_HOURS: Hours = { startMin: 9 * 60, endMin: 18 * 60, days: [1, 2, 3, 4, 5, 6] };

const toMin = (s: unknown): number | null => {
  const m = typeof s === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const fromMin = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Unusable stored hours fall back to the defaults instead of closing the clinic or offering nonsense. */
export function parseHours(raw: Partial<OpeningHours> | undefined): Hours {
  const start = toMin(raw?.open), end = toMin(raw?.close);
  const days = Array.isArray(raw?.days) ? [...new Set(raw.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null;
  if (start === null || end === null || end <= start || !days?.length) return DEFAULT_HOURS;
  return { startMin: start, endMin: end, days };
}
