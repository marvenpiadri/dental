import type { Chart } from './engine/chart';
import { furcationEntrances } from './engine/vendor/state/payload';
import { sheetRows } from './perio-sheet.component';

/** The six probing sites. Buccal row first, then lingual, as in the sheet. */
export const PERIO_SITE_IDS = ['MB', 'B', 'DB', 'ML', 'L', 'DL'] as const;
export type PerioSiteId = (typeof PERIO_SITE_IDS)[number];

/**
 * Where each site sits around the tooth neck, in degrees: u = cos (mesial positive), z = sin (buccal positive).
 * The 3D view and the sheet both read sites by name, so this is the only place geometry meets the six-site model.
 */
export const SITE_ANGLE: Record<PerioSiteId, number> = { MB: 45, B: 90, DB: 135, DL: 225, L: 270, ML: 315 };

/** Plaque is recorded per surface; these are the probing sites each surface touches. */
export const SURFACE_SITES: Record<string, readonly PerioSiteId[]> = { buccal: ['B'], lingual: ['L'], mesial: ['MB', 'ML'], distal: ['DB', 'DL'] };
/** Where a furcation entrance opens, in the same angles. */
export const ENTRANCE_ANGLE: Record<string, number> = { mesial: 0, buccal: 90, distal: 180, lingual: 270 };

export interface SiteViz { site: PerioSiteId; pd: number | null; gm: number | null; cal: number | null; bop: boolean; sup: boolean }
export interface ToothViz {
  tooth: number; sites: SiteViz[];
  plaque: ReadonlySet<string>; gingival: ReadonlyMap<string, number>;
  furcation: { entrance: string; grade: number; angle: number }[];
  mobility: 0 | 1 | 2 | 3; probed: boolean;
}

/** Everything the 3D view draws for one tooth, read from the chart and nothing else. CAL = PD + recession. */
export function toothViz(chart: Chart, tooth: number): ToothViz | null {
  const t = chart.status.get(tooth);
  if (!t || !sheetRows(chart).some((r) => r.tooth === tooth)) return null;
  const sites = PERIO_SITE_IDS.map((site): SiteViz => {
    const pd = t.perio.pd.get(site) ?? null, gm = t.perio.gm.get(site) ?? null;
    return { site, pd, gm, cal: pd === null ? null : pd + (gm ?? 0), bop: t.perio.bop.has(site), sup: t.perio.sup.has(site) };
  });
  const m = /^m([123])$/.exec(String(t.mobility));
  return {
    tooth, sites, plaque: new Set<string>(t.plaque as Iterable<string>), gingival: new Map<string, number>(t.gi as Iterable<[string, number]>),
    furcation: furcationEntrances(tooth).flatMap((entrance) => { const g = t.furcation.get(entrance); return g ? [{ entrance, grade: g, angle: ENTRANCE_ANGLE[entrance] ?? 0 }] : []; }),
    mobility: (m ? Number(m[1]) : 0) as 0 | 1 | 2 | 3, probed: sites.some((s) => s.pd !== null),
  };
}

/** Teeth present in the mouth, in sheet order, that have something to draw. */
export function chartViz(chart: Chart): ToothViz[] { return sheetRows(chart).flatMap((r) => toothViz(chart, r.tooth) ?? []); }

export type PocketTone = 'shallow' | 'watch' | 'deep';
/** ≤3 mm is healthy range, 4–5 mm needs watching, ≥6 mm is deep. */
export const pocketTone = (pd: number): PocketTone => (pd <= 3 ? 'shallow' : pd <= 5 ? 'watch' : 'deep');

/** A value measured at the sites, read at any angle around the tooth (smooth between neighbouring sites). Unprobed sites count as 0. */
export function levelAt(v: ToothViz, phi: number, pick: (s: SiteViz) => number | null): number {
  const pts = v.sites.map((s) => ({ a: SITE_ANGLE[s.site], x: pick(s) ?? 0 })).sort((p, q) => p.a - q.a);
  const p = ((phi % 360) + 360) % 360;
  let lo = pts[pts.length - 1], hi = pts[0];
  for (let i = 0; i < pts.length; i++) if (pts[i].a <= p) { lo = pts[i]; hi = pts[(i + 1) % pts.length]; }
  const span = (((hi.a - lo.a) % 360) + 360) % 360 || 360, f = (((p - lo.a) % 360) + 360) % 360 / span;
  return lo.x + (hi.x - lo.x) * (0.5 - Math.cos(Math.PI * f) / 2);
}

/** How a site's pocket depth changed since an earlier exam: positive = deeper. Null when either exam has no reading. */
export function pdChange(now: ToothViz | null, before: ToothViz | null, site: PerioSiteId): number | null {
  const a = now?.sites.find((s) => s.site === site)?.pd, b = before?.sites.find((s) => s.site === site)?.pd;
  return a == null || b == null ? null : a - b;
}

export interface PerioStats { sites: number; bopPct: number; pd4: number; pd6: number; worse: number }
/** Whole-mouth numbers for the summary strip. `worse` counts sites at least 2 mm deeper than `before` (when given). */
export function perioStats(chart: Chart, before?: Chart | null): PerioStats {
  let sites = 0, bop = 0, pd4 = 0, pd6 = 0, worse = 0;
  for (const v of chartViz(chart)) {
    const old = before ? toothViz(before, v.tooth) : null;
    for (const s of v.sites) { if (s.pd === null) continue; sites++; if (s.bop) bop++; if (s.pd >= 4) pd4++; if (s.pd >= 6) pd6++; if ((pdChange(v, old, s.site) ?? 0) >= 2) worse++; }
  }
  return { sites, bopPct: sites ? Math.round((bop / sites) * 100) : 0, pd4, pd6, worse };
}
