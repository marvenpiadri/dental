"""Reads the ToothFairy3 surfaces and puts every tooth in its own frame: +y toward the bite, +z toward the lip or cheek, mesial on `mesial` * x, origin at the crown centre."""
import json
import numpy as np
from pathlib import Path

SRC = Path(__file__).parent / 'source'


def load():
    m = json.loads((SRC / 'manifest.json').read_text())
    buf = (SRC / 'toothfairy.bin').read_bytes()
    parts = {(p['group'], p['fdi']): p for p in m['parts']}
    return m, buf, parts


def mesh_of(buf, p):
    pos = np.frombuffer(buf, '<f4', p['vertexCount'] * 3, p['positions']).reshape(-1, 3).astype(np.float64)
    nrm = np.frombuffer(buf, '<f4', p['vertexCount'] * 3, p['normals']).reshape(-1, 3).astype(np.float64)
    idx = np.frombuffer(buf, '<u4', p['indexCount'], p['indices']).reshape(-1, 3).astype(np.int64)
    return pos, nrm, idx


def unit(v):
    return v / np.linalg.norm(v)


def frames(parts):
    teeth = {f: p for (g, f), p in parts.items() if g == 'tooth'}
    c = {f: np.array(p['axes']['center']) for f, p in teeth.items()}
    upper = np.mean([v for f, v in c.items() if f < 30], axis=0)
    lower = np.mean([v for f, v in c.items() if f >= 30], axis=0)
    to_lower = unit(lower - upper)
    mid = (c[11] + c[21]) / 2
    out = {}
    for f, p in teeth.items():
        a = p['axes']
        crown = to_lower if f < 30 else -to_lower
        y = np.array(a['up'])
        if y @ crown < 0:
            y = -y
        y = unit(y)
        z = np.array(a['out']); z = unit(z - (z @ y) * y)
        x = np.cross(y, z)  # proper rotation, never a mirror
        out[f] = dict(c=c[f], R=np.stack([x, y, z]), mesial=float(np.sign((mid - c[f]) @ x) or 1))
    return out
