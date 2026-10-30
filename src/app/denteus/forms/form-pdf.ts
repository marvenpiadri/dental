import { FormField, FormTemplate, guessSource } from './form-models';

export interface PageImage { url: string; width: number; height: number; data: ImageData }

/** Draws every page of the uploaded form to a picture the designer and the fill view can show. */
export async function renderPages(file: Blob, kind: 'pdf' | 'image'): Promise<{ pages: PageImage[]; sizes: { w: number; h: number }[] }> {
  const pages: PageImage[] = [], sizes: { w: number; h: number }[] = [];
  if (kind === 'image') {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    pages.push({ url: URL.createObjectURL(file), width: bmp.width, height: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height) });
    sizes.push({ w: bmp.width * 0.75, h: bmp.height * 0.75 });
    return { pages, sizes };
  }
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) { // shortcut: first 10 pages, forms are 1-3; raise if a clinic needs longer ones
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    pages.push({ url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height) });
    sizes.push({ w: base.width, h: base.height });
  }
  return { pages, sizes };
}

/**
 * Finds the empty spaces on a flat form: long thin dark lines (the underlines people write on) become a field sitting on each line.
 * shortcut: lines only; boxes, comb fields and tables are not recognised, the clinic adds or deletes fields by hand.
 */
export function detectBlanks(img: PageImage, page: number): FormField[] {
  const { width: W, height: H } = img;
  const px = img.data.data;
  const minRun = Math.max(40, Math.round(W * 0.06));
  const dark = (x: number, y: number) => { const i = (y * W + x) * 4; return px[i + 3] > 128 && px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 < 130; };
  const lines: { x0: number; x1: number; y: number }[] = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!dark(x, y)) { x++; continue; }
      let e = x;
      while (e < W && dark(e, y)) e++;
      if (e - x >= minRun) {
        const prev = lines[lines.length - 1];
        if (prev && y - prev.y <= 3 && Math.abs(prev.x0 - x) < 6 && Math.abs(prev.x1 - e) < 6) prev.y = y; // same line, a few pixels thick
        else lines.push({ x0: x, x1: e, y });
      }
      x = e;
    }
  }
  const boxH = Math.round(H * 0.012) + 12;
  return lines.slice(0, 80).map((l, n) => ({
    id: crypto.randomUUID(), label: `#${n + 1}`, page, source: 'text' as const,
    x: l.x0 / W, w: (l.x1 - l.x0) / W, y: Math.max(0, (l.y - boxH - 1) / H), h: boxH / H,
  }));
}

/** Real PDF form fields (AcroForm), if the file has them: much more exact than looking for lines. */
export async function acroFields(file: Blob): Promise<FormField[]> {
  const { PDFDocument, PDFTextField } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const pages = pdf.getPages();
  const out: FormField[] = [];
  for (const f of pdf.getForm().getFields()) {
    if (!(f instanceof PDFTextField)) continue;
    for (const wdg of f.acroField.getWidgets()) {
      const r = wdg.getRectangle();
      const idx = Math.max(0, pages.findIndex((p) => p.ref === wdg.P()));
      const { width: pw, height: ph } = pages[idx].getSize();
      out.push({ id: crypto.randomUUID(), label: f.getName(), page: idx, source: guessSource(f.getName()), x: r.x / pw, w: r.width / pw, y: 1 - (r.y + r.height) / ph, h: r.height / ph });
    }
  }
  return out;
}

const win = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^ -ÿ]/g, '?'); // standard PDF fonts are Latin-1 only (no Arabic)

/** The form with the values written on it, as a PDF the clinic prints or sends. */
export async function exportFilled(t: FormTemplate, values: Record<string, string>): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  let pdf: Awaited<ReturnType<typeof PDFDocument.create>>;
  if (t.kind === 'pdf') pdf = await PDFDocument.load(await t.file.arrayBuffer(), { ignoreEncryption: true });
  else {
    pdf = await PDFDocument.create();
    const bytes = await t.file.arrayBuffer();
    const img = t.file.type === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const page = pdf.addPage([t.pages[0].w, t.pages[0].h]);
    page.drawImage(img, { x: 0, y: 0, width: t.pages[0].w, height: t.pages[0].h });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const f of t.fields) {
    const text = win(values[f.id] ?? '');
    const page = pages[f.page];
    if (!text || !page) continue;
    const { width: pw, height: ph } = page.getSize();
    const size = f.size ?? Math.min(11, Math.max(6, f.h * ph * 0.7));
    page.drawText(text, { x: f.x * pw + 2, y: ph - (f.y + f.h) * ph + (f.h * ph - size) / 2 + 1, size, font, color: rgb(0, 0, 0), maxWidth: f.w * pw - 4 });
  }
  return new Blob([await pdf.save() as BlobPart], { type: 'application/pdf' });
}

/**
 * Names the blanks found on a text PDF from the printed words next to them ("Nom", "Date de naissance"...),
 * and picks the matching patient data. Scanned forms have no text layer: those blanks stay "type by hand".
 */
export async function labelBlanks(file: Blob, fields: FormField[], sizes: { w: number; h: number }[]): Promise<FormField[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const words = new Map<number, { s: string; x0: number; x1: number; y: number }[]>();
  for (let i = 0; i < Math.min(doc.numPages, sizes.length); i++) {
    const content = await (await doc.getPage(i + 1)).getTextContent();
    words.set(i, content.items.flatMap((it) => ('str' in it && it.str.trim() ? [{ s: it.str.trim(), x0: it.transform[4], x1: it.transform[4] + it.width, y: sizes[i].h - it.transform[5] - it.height / 2 }] : [])));
  }
  return fields.map((f) => {
    const sz = sizes[f.page], list = words.get(f.page) ?? [];
    if (!sz || f.source !== 'text') return f;
    const left = f.x * sz.w, top = f.y * sz.h, mid = top + (f.h * sz.h) / 2;
    const near = list.filter((w) => Math.abs(w.y - mid) < Math.max(10, f.h * sz.h) && w.x1 <= left + 4 && w.x1 > left - 260).sort((a, b) => b.x1 - a.x1)[0]
      ?? list.filter((w) => w.y < top && w.y > top - 26 && w.x0 < left + f.w * sz.w && w.x1 > left).sort((a, b) => b.y - a.y)[0];
    return near ? { ...f, label: near.s, source: guessSource(near.s) } : f;
  });
}
