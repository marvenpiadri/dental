import { describe, expect, it } from 'vitest';
import { AllergyDef, LibMedication, RxTemplate } from '../models/dental.models';
import { Libraries, LibraryPackage, exportLibrary, parseLibrary, resolveImport } from './library-io';

const g = (id: string, name: string, extra: Partial<LibMedication> = {}): LibMedication => ({ id, kind: 'generic', name, ...extra });
const b = (id: string, name: string, genericId: string): LibMedication => ({ id, kind: 'brand', name, genericId });
const tpl: RxTemplate = { id: 't1', name: 'Post-op', updatedAt: 'x', items: [{ id: 'i1', name: 'Clamoxyl', medicationId: 'b1', dosage: '1', alerts: [{ id: 'al', type: 'allergy', refId: 'a1', label: 'Penicillin', severity: 'critical' }, { id: 'al2', type: 'problem', refId: 'kidney', label: 'kidney', severity: 'warning' }] }] };
const full: Libraries = { medications: [g('g1', 'Amoxicillin', { notes: 'Penicillin class' }), b('b1', 'Clamoxyl', 'g1')], allergies: [{ id: 'a1', name: 'Penicillin', medicationId: 'g1' }], templates: [tpl] };
let n = 0;
const id = () => `n${++n}`;
const empty: Libraries = { medications: [], allergies: [], templates: [] };
const pkg = (): LibraryPackage => { const r = parseLibrary(JSON.stringify(exportLibrary(['medications', 'allergies', 'templates'], full, '1', 'now'))); if (!r.ok) throw new Error(r.error); return r.pkg; };

describe('export and parse', () => {
  it('round-trips a package with format, version, timestamp and the relationships', () => {
    const p = pkg();
    expect(p).toMatchObject({ format: 'dontalist.library', schemaVersion: 1, exportedAt: 'now', appVersion: '1', contents: ['medications', 'allergies', 'templates'] });
    expect(p.medications[1]).toMatchObject({ kind: 'brand', genericId: 'g1' });
    expect(p.templates[0].items[0].alerts).toHaveLength(2);
  });
  it('exports only the chosen parts', () => {
    const p = exportLibrary(['allergies'], full, '1', 'now');
    expect(p.medications).toEqual([]);
    expect(p.allergies).toHaveLength(1);
  });
  it('rejects files that are not a library, wrong versions, bad JSON and oversized input', () => {
    expect(parseLibrary('{nope')).toEqual({ ok: false, error: 'json' });
    expect(parseLibrary('{"format":"other"}')).toEqual({ ok: false, error: 'format' });
    expect(parseLibrary('{"format":"dontalist.library","schemaVersion":9}')).toEqual({ ok: false, error: 'version' });
    expect(parseLibrary(' '.repeat(5_000_001))).toEqual({ ok: false, error: 'size' });
  });
  it('treats content strictly as data: drops invalid records, unknown fields and bad codes, caps lengths', () => {
    const text = JSON.stringify({ format: 'dontalist.library', schemaVersion: 1, medications: [
      { id: 'ok', kind: 'generic', name: 'x'.repeat(500), evil: '<script>', __proto__: { polluted: true }, reviewConditions: ['kidney', 'nonsense'] },
      { id: 'bad id!', kind: 'generic', name: 'Bad' }, { id: 'nobrand', kind: 'brand', name: 'Orphan' }, 'junk', { id: 'k', kind: 'weird', name: 'k' }], allergies: [], templates: [] });
    const r = parseLibrary(text);
    if (!r.ok) throw new Error('should parse');
    expect(r.rejected).toBe(4);
    expect(r.pkg.medications).toHaveLength(1);
    expect(r.pkg.medications[0].name).toHaveLength(120);
    expect(r.pkg.medications[0].reviewConditions).toEqual(['kidney']);
    expect(Object.keys(r.pkg.medications[0])).not.toContain('evil');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('resolveImport', () => {
  it('adds everything to an empty clinic and keeps the relationships', () => {
    const r = resolveImport(empty, pkg(), {}, id);
    expect(r.added).toEqual({ medications: 2, allergies: 1, templates: 1 });
    const t = r.libraries.templates[0];
    expect(t.items[0].medicationId).toBe('b1');
    expect(t.items[0].alerts!.map((a) => a.refId)).toEqual(['a1', 'kidney']);
    expect(r.missing).toEqual([]);
  });
  it('skips what is already there and never overwrites', () => {
    const local: Libraries = { ...full, medications: [g('g1', 'Amoxicillin', { notes: 'My own notes' }), b('b1', 'Clamoxyl', 'g1')] };
    const r = resolveImport(local, pkg(), {}, id);
    expect(r.added).toEqual({ medications: 0, allergies: 0, templates: 0 });
    expect(r.libraries.medications[0].notes).toBe('My own notes');
    expect(r.rows.every((x) => x.status === 'same')).toBe(true);
  });
  it('remaps an id that belongs to an unrelated local record and rewires what depends on it', () => {
    const local: Libraries = { medications: [g('g1', 'Totally different')], allergies: [], templates: [] };
    const r = resolveImport(local, pkg(), {}, id);
    const amox = r.libraries.medications.find((m) => m.name === 'Amoxicillin')!;
    expect(amox.id).not.toBe('g1');
    expect(r.libraries.medications.find((m) => m.name === 'Clamoxyl')!.genericId).toBe(amox.id);
    expect(r.libraries.allergies[0].medicationId).toBe(amox.id);
    expect(r.libraries.medications.find((m) => m.id === 'g1')!.name).toBe('Totally different');
    expect(r.rows.find((x) => x.name === 'Amoxicillin')!.status).toBe('idRemapped');
  });
  it('does not merge a same-name record silently: separate by default, existing only when chosen', () => {
    const local: Libraries = { medications: [g('other', 'amoxicillin')], allergies: [], templates: [] };
    const sep = resolveImport(local, pkg(), {}, id);
    expect(sep.libraries.medications.filter((m) => m.kind === 'generic')).toHaveLength(2);
    expect(sep.rows.find((x) => x.id === 'g1')!.status).toBe('duplicate');
    const use = resolveImport(local, pkg(), { g1: 'existing' }, id);
    expect(use.libraries.medications.filter((m) => m.kind === 'generic')).toHaveLength(1);
    expect(use.libraries.medications.find((m) => m.name === 'Clamoxyl')!.genericId).toBe('other');
  });
  it('reports missing relationships and drops only the unresolvable link', () => {
    const only = parseLibrary(JSON.stringify(exportLibrary(['templates'], full, '1', 'now')));
    if (!only.ok) throw new Error('parse');
    const r = resolveImport(empty, only.pkg, {}, id);
    expect(r.libraries.templates[0].items[0]).toMatchObject({ name: 'Clamoxyl', dosage: '1' });
    expect(r.libraries.templates[0].items[0].medicationId).toBeUndefined();
    expect(r.libraries.templates[0].items[0].alerts!.map((a) => a.refId)).toEqual(['kidney']);
    expect(r.missing.map((m) => m.kind).sort()).toEqual(['templateAlert', 'templateMedication']);
    const brandOnly = parseLibrary(JSON.stringify({ ...exportLibrary(['medications'], { ...full, medications: [b('b9', 'Lonely', 'gone')] }, '1', 'now') }));
    if (!brandOnly.ok) throw new Error('parse');
    const r2 = resolveImport(empty, brandOnly.pkg, {}, id);
    expect(r2.libraries.medications).toEqual([]);
    expect(r2.rows[0].status).toBe('blocked');
  });
  it('is a pure preview: the input libraries are never changed', () => {
    const local: Libraries = { medications: [g('x', 'X')], allergies: [], templates: [] };
    const copy = JSON.stringify(local);
    resolveImport(local, pkg(), {}, id);
    expect(JSON.stringify(local)).toBe(copy);
  });
});
