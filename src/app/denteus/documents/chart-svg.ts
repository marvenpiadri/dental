// The tooth chart as a still vector picture for documents. It only READS the existing chart data (the same teeth map the
// interactive chart edits) and draws FDI numbers, surface marks, short codes and a legend. Black, white and hatching only,
// so it reads the same in grayscale. It is not a third interactive chart.
import type { TeethMap, ToothRecord } from '../odontogram/engine/chart';
import { esc } from './doc-engine';

export const UPPER: readonly number[] = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER: readonly number[] = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/** Short codes printed under a tooth, in legend order. Letters carry the meaning, never colour. */
export const CODES = ['X', 'Im', 'D', 'Cr', 'Br', 'In', 'On', 'Ve', 'Rx', 'Fx', 'Pr', 'RC', 'Rm', 'Ex', 'Cn', 'Pu', 'Ap', 'Se', 'M1', 'M2', 'M3', 'Pt', 'Or'] as const;
export type Code = (typeof CODES)[number];
export type ChartLabel = (code: Code | 'caries' | 'filling') => string;

type Rec = Pick<ToothRecord, 'toothSelection' | 'restorationType' | 'toothSubstrate' | 'endo' | 'extractionPlan' | 'crownNeeded' | 'pulpDx' | 'apicalDx' | 'fissureSealing' | 'mobility' | 'prosthesis' | 'orthoAppliance' | 'caries' | 'fillingSurfaces'>;

/** Codes for one tooth, from the recorded state only (nothing is inferred). */
export function toothCodes(r: Rec): Code[] {
  const c: Code[] = [];
  if (r.toothSelection === 'none') c.push('X');
  if (r.toothSelection === 'implant') c.push('Im');
  if (r.toothSelection === 'milktooth') c.push('D');
  const rest: Record<string, Code> = { crown: 'Cr', bridge: 'Br', inlay: 'In', onlay: 'On', veneer: 'Ve' };
  if (rest[r.restorationType]) c.push(rest[r.restorationType]);
  if (r.toothSubstrate === 'radix') c.push('Rx');
  if (r.toothSubstrate === 'broken') c.push('Fx');
  if (r.toothSubstrate === 'crownprep') c.push('Pr');
  if (r.endo === 'endo-medical-filling') c.push('Rm');
  else if (r.endo && r.endo !== 'none') c.push('RC');
  if (r.extractionPlan) c.push('Ex');
  if (r.crownNeeded) c.push('Cn');
  if (r.pulpDx && r.pulpDx !== 'normal') c.push('Pu');
  if (r.apicalDx && r.apicalDx !== 'normal') c.push('Ap');
  if (r.fissureSealing) c.push('Se');
  if (r.mobility === 'm1' || r.mobility === 'm2' || r.mobility === 'm3') c.push(r.mobility.toUpperCase() as Code);
  if (r.prosthesis && r.prosthesis !== 'none') c.push('Pt');
  if (r.orthoAppliance && r.orthoAppliance !== 'none') c.push('Or');
  return c;
}

const COL = 40, GLYPH = 28, LEFT = 10, MID = 12, W = 2 * LEFT + 16 * COL + MID;
const x0 = (i: number) => LEFT + i * COL + (i >= 8 ? MID : 0);

/** Mesial faces the midline, so it is the right side of a tooth in quadrants 1 and 4 and the left side in 2 and 3. */
const mesialRight = (fdi: number) => fdi < 30 ? fdi < 20 : fdi >= 40;

function glyph(cx: number, y: number, fdi: number, upper: boolean, r: ToothRecord): string {
  const g = cx - GLYPH / 2, i0 = g + 8, i1 = g + 20, e = g + GLYPH, b = y + GLYPH;
  const face = (s: string, pts: string): string => {
    const filled = r.fillingSurfaces.has(s), decay = r.caries.has(s);
    const fill = filled ? '#0a0a0a' : decay ? 'url(#cs-hatch)' : '#fff';
    return `<polygon points="${pts}" fill="${fill}" stroke="#0a0a0a" stroke-width="1"/>${filled && decay ? `<polygon points="${pts}" fill="url(#cs-hatch-w)"/>` : ''}`;
  };
  const top = upper ? 'buccal' : 'lingual', bottom = upper ? 'lingual' : 'buccal';
  const right = mesialRight(fdi) ? 'mesial' : 'distal', left = mesialRight(fdi) ? 'distal' : 'mesial';
  const missing = r.toothSelection === 'none';
  const parts = missing ? `<rect x="${g}" y="${y}" width="${GLYPH}" height="${GLYPH}" fill="#fff" stroke="#0a0a0a" stroke-dasharray="3 2"/><path d="M${g} ${y}L${e} ${b}M${e} ${y}L${g} ${b}" stroke="#0a0a0a" stroke-width="2"/>`
    : r.toothSelection === 'implant' ? `<rect x="${g}" y="${y}" width="${GLYPH}" height="${GLYPH}" fill="#fff" stroke="#0a0a0a" stroke-dasharray="3 2"/><circle cx="${cx}" cy="${y + 14}" r="7" fill="#fff" stroke="#0a0a0a" stroke-width="1.5"/><path d="M${cx - 5} ${y + 11}H${cx + 5}M${cx - 5} ${y + 14}H${cx + 5}M${cx - 5} ${y + 17}H${cx + 5}" stroke="#0a0a0a"/>`
    : face(top, `${g},${y} ${e},${y} ${i1},${y + 8} ${i0},${y + 8}`) + face(bottom, `${g},${b} ${e},${b} ${i1},${b - 8} ${i0},${b - 8}`)
      + face(left, `${g},${y} ${i0},${y + 8} ${i0},${b - 8} ${g},${b}`) + face(right, `${e},${y} ${i1},${y + 8} ${i1},${b - 8} ${e},${b}`)
      + face('occlusal', `${i0},${y + 8} ${i1},${y + 8} ${i1},${b - 8} ${i0},${b - 8}`);
  const crown = r.restorationType !== 'none' && !missing ? `<rect x="${g - 2}" y="${y - 2}" width="${GLYPH + 4}" height="${GLYPH + 4}" fill="none" stroke="#0a0a0a" stroke-width="3"/>` : '';
  const slash = r.extractionPlan ? `<path d="M${g - 3} ${b + 3}L${e + 3} ${y - 3}" stroke="#0a0a0a" stroke-width="2.5"/>` : '';
  return parts + crown + slash;
}

const text = (x: number, y: number, s: string, size: number, weight = 400, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="system-ui, sans-serif" fill="#0a0a0a">${esc(s)}</text>`;

export interface ChartSvgOptions {
  teeth: TeethMap;
  label: ChartLabel;
  title: string;
  /** Teeth left out (wisdom teeth nobody recorded anything on). */
  hide?: ReadonlySet<number>;
  tooth?: (fdi: number) => string;
}

export function chartSvg(o: ChartSvgOptions): string {
  const num = o.tooth ?? String;
  const used = new Set<Code>();
  let caries = false, filling = false;
  const row = (list: readonly number[], upper: boolean, top: number): string => list.map((fdi, i) => {
    const r = o.teeth.get(fdi);
    if (!r || o.hide?.has(fdi)) return '';
    const cx = x0(i) + COL / 2, codes = toothCodes(r);
    codes.forEach((k) => used.add(k));
    if (r.toothSelection !== 'none' && r.toothSelection !== 'implant') { caries ||= r.caries.size > 0; filling ||= r.fillingSurfaces.size > 0; }
    const line = (n: number) => codes.slice(n * 3, n * 3 + 3).join(' ');
    const gy = top + 20;
    const numberY = upper ? top + 12 : gy + GLYPH + 14, codeY = upper ? gy + GLYPH + 14 : top + 11;
    return text(cx, numberY, num(fdi), 11, 600) + glyph(cx, gy, fdi, upper, r) + text(cx, upper ? codeY : gy - 4 - 9, line(0), 8) + text(cx, upper ? codeY + 9 : gy - 4, line(1), 8);
  }).join('');
  // Upper row: numbers, tooth, codes. Lower row: codes, tooth, numbers.
  const body = row(UPPER, true, 0) + `<path d="M${W / 2} 4V150" stroke="#0a0a0a" stroke-dasharray="2 3"/>` + row(LOWER, false, 80);
  const items: string[] = [];
  if (caries) items.push('caries');
  if (filling) items.push('filling');
  CODES.filter((k) => used.has(k)).forEach((k) => items.push(k));
  const colW = W / 3, legendTop = 168;
  const legend = items.map((k, i) => {
    const x = LEFT + (i % 3) * colW, y = legendTop + 18 + Math.floor(i / 3) * 18;
    const swatch = k === 'caries' ? `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="url(#cs-hatch)" stroke="#0a0a0a"/>`
      : k === 'filling' ? `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="#0a0a0a"/>` : text(x + 6, y, k, 9, 700);
    return swatch + text(x + 20, y, o.label(k as Code), 10, 400, 'start');
  }).join('');
  const H = legendTop + 24 + Math.ceil(items.length / 3) * 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}"><title>${esc(o.title)}</title>
<defs><pattern id="cs-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff"/><line x1="0" y1="0" x2="0" y2="4" stroke="#0a0a0a" stroke-width="1.6"/></pattern>
<pattern id="cs-hatch-w" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#fff" stroke-width="1.6"/></pattern></defs>
${body}${text(LEFT, legendTop + 4, o.title, 11, 700, 'start')}${legend}</svg>`;
}
