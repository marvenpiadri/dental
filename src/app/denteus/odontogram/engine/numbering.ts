/** Display-only tooth numbering. Stored data is always FDI; nothing here is ever persisted into a chart. */
export type NumberingSystem = 'fdi' | 'universal' | 'palmer';
export const NUMBERING_SYSTEMS: readonly NumberingSystem[] = ['fdi', 'universal', 'palmer'];

const QUADRANT_LABEL = ['', 'UR', 'UL', 'LL', 'LR'] as const;
const LETTERS = 'ABCDEFGHIJKLMNOPQRST';

/** The chart keeps a primary tooth at its permanent position (11 → 51); this is the number it is called by. Positions 6–8 have no primary tooth. */
export function primaryOf(position: number): number {
  const q = Math.floor(position / 10), p = position % 10;
  return q >= 1 && q <= 4 && p >= 1 && p <= 5 ? (q + 4) * 10 + p : position;
}

/** Universal: permanent 1-32 from upper right, primary A-T. Unknown numbers come back as-is. */
export function formatTooth(fdi: number, system: NumberingSystem): string {
  const q = Math.floor(fdi / 10);
  const p = fdi % 10;
  const primary = q >= 5 && q <= 8;
  if (system === 'fdi' || q < 1 || q > 8 || p < 1 || p > (primary ? 5 : 8)) return String(fdi);
  const quad = primary ? q - 4 : q;
  if (system === 'palmer') return `${QUADRANT_LABEL[quad]}${primary ? LETTERS[p - 1] : p}`;
  if (primary) return LETTERS[{ 1: 4 - (p - 1), 2: 5 + (p - 1), 3: 14 - (p - 1), 4: 15 + (p - 1) }[quad]!]!;
  return String({ 1: 9 - p, 2: 8 + p, 3: 25 - p, 4: 24 + p }[quad]!);
}
