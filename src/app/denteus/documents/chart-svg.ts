// The tooth chart as a still vector picture for documents. It only READS the existing chart data (the same teeth map the
// interactive chart edits) and draws FDI numbers, surface marks, short codes and a legend. Black, white and hatching only,
// so it reads the same in grayscale. It is not a third interactive chart.
import type { TeethMap, ToothRecord } from '../odontogram/engine/chart';
import { esc } from './doc-engine';
import { OUTLINES } from './tooth-outlines';
import type { ToothImages } from './tooth-images';

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
const W = 380, TOP = 30, A = 98, B = 124, P = 3.4, S = 2.9, LOW = TOP + B - 40; // the two arches are stacked, upper over lower // S: picture units per mm of real tooth
const tw = (f: number) => OUTLINES[f].w * S, td = (f: number) => OUTLINES[f].d * S; // width along the arch and depth, from the real crown

interface Spot { x: number; y: number; deg: number }
/** Centre line of an arch (a squared half-ellipse), then one spot per tooth spread by tooth width along it. */
function spots(list: readonly number[], upper: boolean, ox: number): Spot[] {
  const top = upper ? TOP : LOW;
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k <= 400; k++) {
    const t = Math.PI - (Math.PI * k) / 400;
    pts.push({ x: A * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** (2 / P), y: -B * Math.abs(Math.sin(t)) ** (2 / P) });
  }
  const len = [0];
  for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  const widths = list.map(tw), total = widths.reduce((s, w) => s + w, 0);
  const k = (len[len.length - 1] - 16) / (total + list.length * 2); // squeeze or stretch so the arch is filled
  let at = 8 + k;
  return list.map((_, i) => {
    const mid = at + (widths[i] * k) / 2; at += widths[i] * k + 2 * k;
    let j = len.findIndex((l) => l >= mid); if (j < 1) j = 1;
    const p = pts[j], q = pts[j - 1], n = pts[Math.min(j + 1, pts.length - 1)];
    const deg = (Math.atan2((n.y - q.y) * (upper ? 1 : -1), n.x - q.x) * 180) / Math.PI;
    return { x: ox + p.x, y: upper ? top + B + p.y : top - p.y, deg };
  });
}

function glyph(fdi: number, upper: boolean, r: ToothRecord, image?: { href: string; flipX: boolean; flipY: boolean }): string {
  const o = OUTLINES[fdi], w = o.w * S, d = o.d * S, x = -w / 2, y = -d / 2, e = w / 2, b = d / 2;
  const mark = (zone: 'occlusal' | 'buccal' | 'lingual' | 'mesial' | 'distal'): string => {
    const key = zone, filled = r.fillingSurfaces.has(key), decay = r.caries.has('caries-' + key);
    if (!filled && !decay) return '';
    const p = o[zone];
    return `<path d="${p}" fill="${filled ? '#0a0a0a' : 'url(#cs-hatch)'}" fill-rule="evenodd" stroke="#0a0a0a" stroke-width=".3"/>${filled && decay ? `<path d="${p}" fill="url(#cs-hatch-w)" fill-rule="evenodd"/>` : ''}`;
  };
  const missing = r.toothSelection === 'none', implant = r.toothSelection === 'implant';
  // Empty by default: a striped band around a white silhouette. Findings are drawn on top, never inferred.
  const shape = `<path d="${o.all}" fill="none" stroke="url(#cs-band)" stroke-width="2" stroke-linejoin="round"/><path d="${o.all}" fill="#fff" stroke="#0a0a0a" stroke-width=".35"${missing || implant ? ' stroke-dasharray="1.2 .8"' : ''}/>`;
  const pic = image && !missing && !implant ? `<image href="${image.href}" x="${-o.w / 2}" y="${-o.d / 2}" width="${o.w}" height="${o.d}" preserveAspectRatio="none" transform="scale(${image.flipX ? -1 : 1} ${image.flipY ? -1 : 1})"/><path d="${o.all}" fill="none" stroke="#0a0a0a" stroke-width=".35"/>` : '';
  const zones = missing || implant ? '' : (['occlusal', 'buccal', 'lingual', 'mesial', 'distal'] as const).map(mark).join('');
  const sym = missing ? `<path d="M${x / S} ${y / S}L${e / S} ${b / S}M${e / S} ${y / S}L${x / S} ${b / S}" stroke="#0a0a0a" stroke-width=".8"/>`
    : implant ? `<circle r="${Math.min(o.w, o.d) * 0.3}" fill="#fff" stroke="#0a0a0a" stroke-width=".5"/><path d="M-1.6 -.8H1.6M-1.6 0H1.6M-1.6 .8H1.6" stroke="#0a0a0a" stroke-width=".3"/>` : '';
  const crown = r.restorationType !== 'none' && !missing ? `<path d="${o.all}" fill="none" stroke="#0a0a0a" stroke-width="1.1" stroke-linejoin="round"/>` : '';
  const slash = r.extractionPlan ? `<path d="M${(x - 3) / S} ${(b + 3) / S}L${(e + 3) / S} ${(y - 3) / S}" stroke="#0a0a0a" stroke-width=".9"/>` : '';
  return `<g transform="scale(${upper ? S : `${S} -${S}`})">${shape}${pic}${zones}${sym}${crown}${slash}</g>`;
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
  /** Pictures of the real 3D teeth. Without them the teeth print as plain outlines. */
  images?: ToothImages;
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
      const codes = toothCodes(r), d = td(fdi), s = at[i], rad = (s.deg * Math.PI) / 180;
      codes.forEach((k) => used.add(k));
      if (r.toothSelection !== 'none' && r.toothSelection !== 'implant') { caries ||= r.caries.size > 0; filling ||= r.fillingSurfaces.size > 0; }
      const out = upper ? { x: Math.sin(rad), y: -Math.cos(rad) } : { x: -Math.sin(rad), y: Math.cos(rad) }; // unit vector pointing away from the arch
      const nx = s.x + out.x * (d / 2 + 11), ny = s.y + out.y * (d / 2 + 11) + 3.5;
      const ix = s.x - out.x * (d / 2 + 9), iy = s.y - out.y * (d / 2 + 9) + 3;
      return text(nx, ny, num(fdi), 10, 600) + `<g transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.deg.toFixed(1)})">${glyph(fdi, upper, r, o.images?.get(fdi))}</g>`
        + codes.slice(0, 4).map((c, k) => text(ix, iy + k * 9, c, 8)).join('');
    }).join('');
  };
  const body = arch(UPPER, true, W / 2) + arch(LOWER, false, W / 2);
  const items: string[] = [];
  if (caries) items.push('caries');
  if (filling) items.push('filling');
  CODES.filter((k) => used.has(k)).forEach((k) => items.push(k));
  const colW = W / 2, legendTop = LOW + B + 48;
  const legend = items.map((k, i) => {
    const x = 10 + (i % 2) * colW, y = legendTop + 18 + Math.floor(i / 2) * 18;
    const swatch = k === 'caries' ? `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="url(#cs-hatch)" stroke="#0a0a0a"/>`
      : k === 'filling' ? `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="#0a0a0a"/>` : text(x + 6, y, k, 9, 700);
    return swatch + text(x + 20, y, o.label(k as Code), 10, 400, 'start');
  }).join('');
  const H = legendTop + 24 + Math.ceil(items.length / 2) * 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}"><title>${esc(o.title)}</title>
<defs><pattern id="cs-band" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="1" fill="#fff"/><line x1="0" y1="0" x2="0" y2="1" stroke="#0a0a0a" stroke-width=".45"/></pattern>
<pattern id="cs-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff"/><line x1="0" y1="0" x2="0" y2="4" stroke="#0a0a0a" stroke-width="1.6"/></pattern>
<pattern id="cs-hatch-w" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="#fff" stroke-width="1.6"/></pattern></defs>
${body}${text(10, legendTop + 4, o.title, 11, 700, 'start')}${legend}</svg>`;
}
