import { defaultState } from './vendor/state/payload';
import { applyEdit } from './edits';
import { paintTooth, prepareArt } from './render';

// Minimal artwork with the real layer ids and the real quirk: hidden layers carry inline display:none.
const IDS = ['base', 'tooth', 'tooth-base', 'tooth-base-beauty', 'tooth-healthy-pulp', 'surfaces', 'caries', 'caries-mesial', 'caries-occlusal', 'subcaries-occlusal',
  'filling-composite-occlusal', 'restorations', 'emax', 'emax-crown', 'mods'];
const load = (_f: string): SVGElement => {
  const body = IDS.map((id) => `<g id="${id}" style="display: none;"></g>`).join('');
  const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`, 'image/svg+xml').documentElement as unknown as SVGElement;
  prepareArt(svg);
  return svg;
};
const opts = { showBase: true, showHealthyPulp: true };

describe('paintTooth', () => {
  it('a healthy tooth shows the crown, no restoration', () => {
    const ids = paintTooth(load('14'), 14, defaultState(), opts);
    expect(ids).toContain('tooth-base');
    expect(ids.some((i) => i.includes('emax'))).toBe(false);
  });
  it('restoration, caries and missing tooth paint the right layers', () => {
    const svg = load('14');
    const t = defaultState();
    applyEdit(t, 14, { kind: 'restoration', value: 'crown|emax' });
    expect(paintTooth(svg, 14, t, opts)).toEqual(expect.arrayContaining(['restorations', 'emax']));
    const c = defaultState();
    applyEdit(c, 14, { kind: 'caries', surface: 'mesial', on: true });
    expect(paintTooth(svg, 14, c, opts)).toContain('caries-mesial');
    const gone = defaultState();
    applyEdit(gone, 14, { kind: 'selection', value: 'none' });
    expect(paintTooth(svg, 14, gone, opts)).not.toContain('tooth-base');
  });
  it('a filling turns caries on that surface into recurrent (subcaries)', () => {
    const svg = load('14');
    const t = defaultState();
    applyEdit(t, 14, { kind: 'caries', surface: 'occlusal', on: true });
    applyEdit(t, 14, { kind: 'fillingMaterial', value: 'composite' });
    applyEdit(t, 14, { kind: 'fillingSurface', surface: 'occlusal', on: true });
    const ids = paintTooth(svg, 14, t, opts);
    expect(ids).toContain('subcaries-occlusal');
    expect(ids).not.toContain('caries-occlusal');
  });
  it('a hidden layer carries no inline display:none once prepared', () => {
    const svg = load('14');
    const el = svg.querySelector('[id="caries-occlusal"]')!;
    expect(el.getAttribute('style') ?? '').not.toMatch(/display/);
    const t = defaultState();
    applyEdit(t, 14, { kind: 'caries', surface: 'occlusal', on: true });
    paintTooth(svg, 14, t, opts);
    expect(el.getAttribute('data-active')).toBe('1');
  });
  it('repainting fully resets the previous state', () => {
    const svg = load('16');
    const t = defaultState();
    applyEdit(t, 16, { kind: 'caries', surface: 'mesial', on: true });
    paintTooth(svg, 16, t, opts);
    expect(paintTooth(svg, 16, defaultState(), opts)).not.toContain('caries-mesial');
  });
});
