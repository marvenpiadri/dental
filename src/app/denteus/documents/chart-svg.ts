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

// Two arches seen from the biting side, like a dentist's chart: upper opens downward, lower opens upward.
const ARCH_W = 300, GAP = 20, W = 2 * ARCH_W + GAP, TOP = 34, A = 98, B = 138, P = 3.4;
const TW = [15, 12, 16, 18, 18, 26, 25, 24], TD = [13, 13, 16, 19, 19, 25, 24, 22]; // width along the arch and depth, tooth 1 to 8

/** Mesial faces the midline, so it is the right side of a tooth in quadrants 1 and 4 and the left side in 2 and 3. */
const mesialRight = (fdi: number) => fdi < 30 ? fdi < 20 : fdi >= 40;

interface Spot { x: number; y: number; deg: number }
/** Centre line of an arch (a squared half-ellipse), then one spot per tooth spread by tooth width along it. */
function spots(list: readonly number[], upper: boolean, ox: number): Spot[] {
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k <= 400; k++) {
    const t = Math.PI - (Math.PI * k) / 400;
    pts.push({ x: A * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / P), y: -B * Math.abs(Math.sin(t)) ** (2 / P) });
  }
  const len = [0];
  for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const widths = list.map((f) => TW[(f % 10) - 1]), total = widths.reduce((s, w) => s + w, 0);
  const k = (len[len.length - 1] - 16) / (total + list.length * 2); // squeeze or stretch so the arch is filled
  let at = 8 + k;
  return list.map((_, i) => {
    const mid = at + (widths[i] * k) / 2; at += widths[i] * k + 2 * k;
    let j = len.findIndex((l) => l >= mid); if (j < 1) j = 1;
    const p = pts[j], q = pts[j - 1], n = pts[Math.min(j + 1, pts.length - 1)];
    const deg = (Math.atan2((n.y - q.y) * (upper ? 1 : -1), n.x - q.x) * 180) / Math.PI;
    return { x: ox + p.x, y: upper ? TOP + B + p.y : TOP - p.y, deg };
  });
}

function glyph(fdi: number, upper: boolean, r: ToothRecord, w: number, d: number): string {
  const x = -w / 2, y = -d / 2, e = w / 2, b = d / 2, i = Math.max(3, Math.min(w, d) * 0.28);
  // Only marked surfaces are drawn on top of a plain rounded tooth, so a clean tooth stays clean.
  const face = (s: string, pts: string): string => {
    const filled = r.fillingSurfaces.has(s), decay = r.caries.has('caries-' + s);
    if (!filled && !decay) return '';
    return `<polygon points="${pts}" fill="${filled ? '#0a0a0a' : 'url(#cs-hatch)'}" stroke="#0a0a0a" stroke-width=".8"/>${filled && decay ? `<polygon points="${pts}" fill="url(#cs-hatch-w)"/>` : ''}`;
  };
  const rx = Math.min(w, d) * 0.4;
  const base = `<rect x="${x}" y="${y}" width="${w}" height="${d}" rx="${rx}" fill="#fff" stroke="#0a0a0a" stroke-width="1.1"/><rect x="${x + i}" y="${y + i}" width="${w - 2 * i}" height="${d - 2 * i}" rx="${rx * 0.6}" fill="none" stroke="#0a0a0a" stroke-width=".6"/>`;
  const outer = 'buccal', inner = 'lingual', up = upper ? outer : inner, down = upper ? inner : outer; // cheek side is up in the upper arch, down in the lower
  const right = mesialRight(fdi) ? 'mesial' : 'distal', left = mesialRight(fdi) ? 'distal' : 'mesial';
  const box = `<rect x="${x}" y="${y}" width="${w}" height="${d}" rx="${rx}" fill="#fff" stroke="#0a0a0a" stroke-dasharray="3 2"/>`;
  const missing = r.toothSelection === 'none';
  const parts = missing ? `${box}<path d="M${x} ${y}L${e} ${b}M${e} ${y}L${x} ${b}" stroke="#0a0a0a" stroke-width="2"/>`
    : r.toothSelection === 'implant' ? `${box}<circle r="${Math.min(w, d) * 0.3}" fill="#fff" stroke="#0a0a0a" stroke-width="1.4"/><path d="M-4 -2H4M-4 0H4M-4 2H4" stroke="#0a0a0a"/>`
    : base + face(up, `${x},${y} ${e},${y} ${e - i},${y + i} ${x + i},${y + i}`) + face(down, `${x},${b} ${e},${b} ${e - i},${b - i} ${x + i},${b - i}`)
      + face(left, `${x},${y} ${x + i},${y + i} ${x + i},${b - i} ${x},${b}`) + face(right, `${e},${y} ${e - i},${y + i} ${e - i},${b - i} ${e},${b}`)
      + face('occlusal', `${x + i},${y + i} ${e - i},${y + i} ${e - i},${b - i} ${x + i},${b - i}`);
  const crown = r.restorationType !== 'none' && !missing ? `<rect x="${x - 1.5}" y="${y - 1.5}" width="${w + 3}" height="${d + 3}" rx="${rx}" fill="none" stroke="#0a0a0a" stroke-width="2.6"/>` : '';
  const slash = r.extractionPlan ? `<path d="M${x - 3} ${b + 3}L${e + 3} ${y - 3}" stroke="#0a0a0a" stroke-width="2.2"/>` : '';
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
  const arch = (list: readonly number[], upper: boolean, ox: number): string => {
    const at = spots(list, upper, ox);
    return list.map((fdi, i) => {
      const r = o.teeth.get(fdi);
      if (!r || o.hide?.has(fdi)) return '';
      const codes = toothCodes(r), n = (fdi % 10) - 1, w = TW[n], d = TD[n], s = at[i], rad = (s.deg * Math.PI) / 180;
      codes.forEach((k) => used.add(k));
      if (r.toothSelection !== 'none' && r.toothSelection !== 'implant') { caries ||= r.caries.size > 0; filling ||= r.fillingSurfaces.size > 0; }
      const out = upper ? { x: Math.sin(rad), y: -Math.cos(rad) } : { x: -Math.sin(rad), y: Math.cos(rad) }; // unit vector pointing away from the arch
      const nx = s.x + out.x * (d / 2 + 11), ny = s.y + out.y * (d / 2 + 11) + 3.5;
      const ix = s.x - out.x * (d / 2 + 9), iy = s.y - out.y * (d / 2 + 9) + 3;
      return text(nx, ny, num(fdi), 10, 600) + `<g transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.deg.toFixed(1)})">${glyph(fdi, upper, r, w, d)}</g>`
        + codes.slice(0, 4).map((c, k) => text(ix, iy + k * 9, c, 8)).join('');
    }).join('');
  };
  const body = arch(UPPER, true, ARCH_W / 2) + arch(LOWER, false, ARCH_W + GAP + ARCH_W / 2);
  const items: string[] = [];
  if (caries) items.push('caries');
  if (filling) items.push('filling');
  CODES.filter((k) => used.has(k)).forEach((k) => items.push(k));
  const colW = W / 3, legendTop = TOP + B + 44;
  const legend = items.map((k, i) => {
    const x = 10 + (i % 3) * colW, y = legendTop + 18 + Math.floor(i / 3) * 18;
    const swatch = k === 'caries' ? `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="url(#cs-hatch)" stroke="#0a0a0a"/>`
      : k === 'filling' ? `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="#0a0a0a"/>` : text(x + 6, y, k, 9, 700);
    return swatch + text(x + 20, y, o.label(k as Code), 10, 400, 'start');
  }).join('');
  const H = legendTop + 24 + Math.ceil(items.length / 3) * 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}"><title>${esc(o.title)}</title>
<defs><pattern id="cs-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff"/><line x1="0" y1="0" x2="0" y2="4" stroke="#0a0a0a" stroke-width="1.6"/></pattern>
<pattern id="cs-hatch-w" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#fff" stroke-width="1.6"/></pattern></defs>
${body}${text(10, legendTop + 4, o.title, 11, 700, 'start')}${legend}</svg>`;
}
