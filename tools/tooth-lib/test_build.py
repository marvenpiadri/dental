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
    c, r = P[f'crown-{f}'], P[f'root-{f}']
    cp = f32(c['pos'], c['vertexCount']); rp = f32(r['pos'], r['vertexCount'])
    assert cp[:, 1].min() > -1e-3 and rp[:, 1].max() < 1e-3, f'{f}: crown/root not split at the neck'
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
