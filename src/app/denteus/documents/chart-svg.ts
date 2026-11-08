// The tooth chart as a still vector picture for documents. It only READS the existing chart data (the same teeth map the
// interactive chart edits) and draws FDI numbers, surface marks, short codes and a legend. Tooth shapes and the arch layout come
// from react-odontogram (MIT, see tooth-paths.LICENSE.txt). Black, white and hatching only, so it reads the same in grayscale.
// Teeth print empty: only recorded findings are marked. It is not a third interactive chart.
import type { TeethMap, ToothRecord } from '../odontogram/engine/chart';
import { esc } from './doc-engine';
import { TOOTH_PATHS } from './tooth-paths';

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

// Two arches in the library's oval layout: the upper right quadrant is drawn once, the others are mirrored copies.
const VW = 409, VH = 694, X0 = -36, VBW = VW + 72, Y0 = -26;
type Zone = 'occlusal' | 'buccal' | 'lingual' | 'mesial' | 'distal';
const ZONES: readonly Zone[] = ['buccal', 'lingual', 'mesial', 'distal'];
const wedge = (c: [number, number], a: [number, number], b: [number, number]) => `${c[0].toFixed(1)},${c[1].toFixed(1)} ${(c[0] + 100 * a[0]).toFixed(1)},${(c[1] + 100 * a[1]).toFixed(1)} ${(c[0] + 100 * b[0]).toFixed(1)},${(c[1] + 100 * b[1]).toFixed(1)}`;

interface Place { m: string; cx: number; cy: number; w: number; h: number; ox: number; oy: number; tx: number; ty: number; path: (typeof TOOTH_PATHS)[number] }
function place(fdi: number): Place {
  const q = Math.floor(fdi / 10), p = TOOTH_PATHS[fdi % 10];
  const fx = q === 2 || q === 3, fy = q === 3 || q === 4;
  const cx = fx ? VW - p.cx : p.cx, cy = fy ? VH - p.cy : p.cy;
  const centre = [VW / 2, fy ? VH - 250 : 250], apex = [VW / 2, fy ? VH : 0];
  const len = Math.hypot(cx - centre[0], cy - centre[1]) || 1, ox = (cx - centre[0]) / len, oy = (cy - centre[1]) / len;
  let tx = -oy, ty = ox; // along the arch; mesial points toward the midline
  if ((apex[0] - cx) * tx + (apex[1] - cy) * ty < 0) { tx = -tx; ty = -ty; }
  return { m: `matrix(${fx ? -1 : 1} 0 0 ${fy ? -1 : 1} ${fx ? VW : 0} ${fy ? VH : 0})`, cx, cy, w: p.w, h: p.h, ox, oy, tx, ty, path: p };
}

const BAND = 'stroke="url(#cs-band)" stroke-width="6" stroke-linejoin="round" fill="none"';
function glyph(fdi: number, pl: Place, r: ToothRecord): string {
  const { path: p, m } = pl, missing = r.toothSelection === 'none', implant = r.toothSelection === 'implant';
  const dash = missing || implant ? ' stroke-dasharray="4 3"' : '';
  const base = `<path d="${p.outline}" transform="${m}" ${BAND}/><path d="${p.outline}" transform="${m}" fill="#fff" stroke="#0a0a0a" stroke-width="1.4"${dash}/>`;
  if (missing) return base + `<path d="M${pl.cx - pl.w / 2} ${pl.cy - pl.h / 2}L${pl.cx + pl.w / 2} ${pl.cy + pl.h / 2}M${pl.cx + pl.w / 2} ${pl.cy - pl.h / 2}L${pl.cx - pl.w / 2} ${pl.cy + pl.h / 2}" stroke="#0a0a0a" stroke-width="3"/>`;
  if (implant) return base + `<circle cx="${pl.cx}" cy="${pl.cy}" r="${Math.min(pl.w, pl.h) * 0.28}" fill="#fff" stroke="#0a0a0a" stroke-width="1.6"/><path d="M${pl.cx - 7} ${pl.cy - 4}H${pl.cx + 7}M${pl.cx - 7} ${pl.cy}H${pl.cx + 7}M${pl.cx - 7} ${pl.cy + 4}H${pl.cx + 7}" stroke="#0a0a0a"/>`;
  const state = (z: Zone) => ({ filled: r.fillingSurfaces.has(z), decay: r.caries.has('caries-' + z) });
  const fill = (z: Zone) => { const s = state(z); return s.filled ? '#0a0a0a' : s.decay ? 'url(#cs-hatch)' : ''; };
  const both = (z: Zone) => state(z).filled && state(z).decay;
  const o: [number, number] = [pl.ox, pl.oy], t: [number, number] = [pl.tx, pl.ty], c: [number, number] = [pl.cx, pl.cy];
  const neg = (v: [number, number]): [number, number] => [-v[0], -v[1]], add = (a: [number, number], b: [number, number]): [number, number] => [a[0] + b[0], a[1] + b[1]];
  const pts: Record<string, string> = {
    buccal: wedge(c, add(o, neg(t)), add(o, t)), lingual: wedge(c, add(neg(o), neg(t)), add(neg(o), t)),
    mesial: wedge(c, add(t, neg(o)), add(t, o)), distal: wedge(c, add(neg(t), neg(o)), add(neg(t), o)),
  };
  const ring = ZONES.filter((z) => fill(z)).map((z) => `<polygon points="${pts[z]}" fill="${fill(z)}"/>${both(z) ? `<polygon points="${pts[z]}" fill="url(#cs-hatch-w)"/>` : ''}`).join('');
  const centre = fill('occlusal'), any = ring || centre;
  const inner = `${m} translate(${p.cx} ${p.cy}) scale(.5) translate(${-p.cx} ${-p.cy})`;
  const marks = any ? `<g clip-path="url(#cp-${fdi})">${ring}</g><path d="${p.outline}" transform="${inner}" fill="${centre || '#fff'}" stroke="#0a0a0a" stroke-width="1.2"/>${both('occlusal') ? `<path d="${p.outline}" transform="${inner}" fill="url(#cs-hatch-w)"/>` : ''}` : '';
  const clip = ring ? `<clipPath id="cp-${fdi}"><path d="${p.outline}" transform="${m}"/></clipPath>` : '';
  const shading = `<path d="${p.shadow}" transform="${m}" fill="#0a0a0a" fill-opacity=".1"/><path d="${p.highlight}" transform="${m}" fill="none" stroke="#0a0a0a" stroke-opacity=".45" stroke-width="1" stroke-linecap="round"/>`;
  const crown = r.restorationType !== 'none' ? `<path d="${p.outline}" transform="${m}" fill="none" stroke="#0a0a0a" stroke-width="4" stroke-linejoin="round"/>` : '';
  const slash = r.extractionPlan ? `<path d="M${pl.cx - pl.w / 2 - 6} ${pl.cy + pl.h / 2 + 6}L${pl.cx + pl.w / 2 + 6} ${pl.cy - pl.h / 2 - 6}" stroke="#0a0a0a" stroke-width="3"/>` : '';
  return clip + base + shading + marks + crown + slash;
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
  const body = [...UPPER, ...LOWER].map((fdi) => {
    const r = o.teeth.get(fdi);
    if (!r || o.hide?.has(fdi)) return '';
    const pl = place(fdi), codes = toothCodes(r);
    codes.forEach((k) => used.add(k));
    if (r.toothSelection !== 'none' && r.toothSelection !== 'implant') { caries ||= r.caries.size > 0; filling ||= r.fillingSurfaces.size > 0; }
    const reach = Math.abs(pl.ox) * pl.w / 2 + Math.abs(pl.oy) * pl.h / 2;
    const nx = pl.cx + pl.ox * (reach + 16), ny = pl.cy + pl.oy * (reach + 16) + 5;
    const ix = pl.cx - pl.ox * (reach + 4), iy = pl.cy - pl.oy * (reach + 4);
    return glyph(fdi, pl, r) + text(nx, ny, num(fdi), 15, 600) + codes.slice(0, 4).map((c, k) => text(ix, iy + 4 + k * 12 - (codes.length > 1 ? 6 : 0), c, 11)).join('');
  }).join('');
  const items: string[] = [];
  if (caries) items.push('caries');
  if (filling) items.push('filling');
  CODES.filter((k) => used.has(k)).forEach((k) => items.push(k));
  const colW = VBW / 2, legendTop = VH + 52;
  const legend = items.map((k, i) => {
    const x = X0 + 6 + (i % 2) * colW, y = legendTop + 24 + Math.floor(i / 2) * 22;
    const swatch = k === 'caries' ? `<rect x="${x}" y="${y - 13}" width="15" height="15" fill="url(#cs-hatch)" stroke="#0a0a0a"/>`
      : k === 'filling' ? `<rect x="${x}" y="${y - 13}" width="15" height="15" fill="#0a0a0a"/>` : text(x + 8, y, k, 12, 700);
    return swatch + text(x + 26, y, o.label(k as Code), 13, 400, 'start');
  }).join('');
  const H = legendTop + 30 + Math.ceil(items.length / 2) * 22 - Y0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0} ${Y0} ${VBW} ${H}" role="img" aria-label="${esc(o.title)}"><title>${esc(o.title)}</title>
<defs><pattern id="cs-band" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="2.2" fill="#fff"/><line x1="0" y1="0" x2="0" y2="2.2" stroke="#0a0a0a" stroke-width="1"/></pattern>
<pattern id="cs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="#0a0a0a" stroke-width="1.8"/></pattern>
<pattern id="cs-hatch-w" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#fff" stroke-width="1.8"/></pattern></defs>
${body}${text(X0 + 6, legendTop, o.title, 14, 700, 'start')}${legend}</svg>`;
}
