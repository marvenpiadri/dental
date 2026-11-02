"""Self-check of the built library: python3 test_build.py (run build.py first)."""
import json
import numpy as np
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'teeth'
lib = json.loads((OUT / 'teeth.json').read_text())
buf = (OUT / 'teeth.bin').read_bytes()
P = {p['id']: p for p in lib['parts']}
f32 = lambda o, n: np.frombuffer(buf, '<f4', n * 3, o).reshape(-1, 3)
u8 = lambda o, n: np.frombuffer(buf, 'u1', n * 4, o).reshape(-1, 4)
fdis = sorted({p['fdi'] for p in lib['parts'] if p['kind'] == 'crown'})
assert len(fdis) == 32, fdis
for f in fdis:
    c = P[f'crown-{f}']; cp = f32(c['pos'], c['vertexCount'])
    roots = [p for p in lib['parts'] if p['fdi'] == f and p['kind'] == 'root']
    assert 1 <= len(roots) <= 3 and len({p['slot'] for p in roots}) == len(roots), f'{f}: roots {len(roots)}'
    for r in roots:
        rp = f32(r['pos'], r['vertexCount']); assert rp[:, 1].max() < 1e-3 and cp[:, 1].min() > -1e-3, f'{f}: crown/root not split at the neck'
        assert r['broken'] in P and f32(P[r['broken']]['pos'], 1).shape[0] == 1, f'{f}: no fractured variant'
        assert f32(P[r['broken']]['pos'], P[r['broken']]['vertexCount'])[:, 1].min() > rp[:, 1].min() + 0.3, f'{f}: fractured root is not shorter'
    h = cp[:, 1].max(); assert 6 < h < 12.5, f'{f}: crown height {h:.1f} mm is implausible'
    za, zb = u8(c['zoneA'], c['vertexCount']), u8(c['zoneB'], c['vertexCount'])
    s = za.astype(int).sum(1) + zb[:, 0]
    assert (abs(s - 255) <= 4).all(), f'{f}: zone weights do not sum to 1'
    sh = f32(P[f'shell-{f}']['pos'], P[f'shell-{f}']['vertexCount'])
    assert sh[:, 1].max() >= h - 0.01, f'{f}: shell is lower than the crown'
    assert P[f'pulp-{f}'] if f'pulp-{f}' in P else True
for name in ('implant-fixture', 'abutment', 'healing-cap', 'cover-screw', 'bracket', 'band'):
    assert f'hw-{name}' in P, name
print('tooth library OK:', len(lib['parts']), 'parts')
