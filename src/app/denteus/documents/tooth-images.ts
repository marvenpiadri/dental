// Pictures of the real 3D teeth (the library the 3D view uses), seen from the biting side, for the printed chart.
// Each is drawn clean (no findings, those are marked on top in vector), in grey, cropped to the crown, and turned to match the flat outline.
import { newChart } from '../odontogram/engine/chart';
import { ToothSnap } from '../odontogram/tooth-snap.service';
import { OUTLINES } from './tooth-outlines';

export interface ToothImage { href: string; flipX: boolean; flipY: boolean }
export type ToothImages = ReadonlyMap<number, ToothImage>;
const N = 48;

const load = (src: string): Promise<HTMLImageElement> => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })!]; };
const bits = (ctx: CanvasRenderingContext2D): boolean[] => { const d = ctx.getImageData(0, 0, N, N).data; return Array.from({ length: N * N }, (_, k) => d[k * 4 + 3] > 60); };

/** Crops to the visible crown, turns it grey, and finds which mirror image lines up best with the outline. */
async function prepare(fdi: number, url: string): Promise<ToothImage> {
  const img = await load(url);
  const [src, sx] = canvas(img.width, img.height);
  sx.filter = 'grayscale(1) contrast(.9) brightness(1.08)';
  sx.drawImage(img, 0, 0);
  const a = sx.getImageData(0, 0, img.width, img.height).data;
  let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (a[(y * img.width + x) * 4 + 3] > 60) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1);
  const [crop, cx] = canvas(w, h);
  cx.drawImage(src, x0, y0, w, h, 0, 0, w, h);

  const o = OUTLINES[fdi];
  const [, ox] = canvas(N, N);
  ox.setTransform(N / o.w, 0, 0, N / o.d, N / 2, N / 2); ox.fill(new Path2D(o.all));
  const want = bits(ox);
  let best = { fx: false, fy: false, score: -1 };
  for (const fx of [false, true]) for (const fy of [false, true]) {
    const [, mx] = canvas(N, N);
    mx.setTransform(fx ? -1 : 1, 0, 0, fy ? -1 : 1, fx ? N : 0, fy ? N : 0);
    mx.drawImage(crop, 0, 0, N, N);
    const got = bits(mx);
    let both = 0, any = 0;
    for (let k = 0; k < got.length; k++) { if (got[k] && want[k]) both++; if (got[k] || want[k]) any++; }
    if (both / any > best.score) best = { fx, fy, score: both / any };
  }
  return { href: crop.toDataURL('image/png'), flipX: best.fx, flipY: best.fy };
}

/** One clean 3D picture per tooth. Teeth that cannot be drawn (no WebGL) are left out and print as flat outlines. */
export async function toothImages(snap: ToothSnap): Promise<ToothImages> {
  const out = new Map<number, ToothImage>(), chart = newChart();
  for (const fdi of Object.keys(OUTLINES).map(Number)) {
    const rec = chart.status.get(fdi);
    const url = rec ? await snap.snap(fdi, rec, false, true).catch(() => null) : null;
    if (url) out.set(fdi, await prepare(fdi, url).catch(() => undefined) as ToothImage);
  }
  for (const [k, v] of out) if (!v) out.delete(k);
  return out;
}
