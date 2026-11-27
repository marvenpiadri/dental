"""Puts the fitted implant set into the app's tooth-library frame (mm, origin at the neck, +y toward the bite, +z toward the lip).
  python3 tools/implants/to_library.py /path/to/implants_raw.glb      (the uncompressed export.py output)
Writes public/models/teeth/implants.{json,bin}: implant, abutment and screw once (their own units) with a 4x4 per tooth,
and the 32 crowns already in the library frame. Needs the same packages as tools/tooth-lib."""
import json, sys
from pathlib import Path
import numpy as np, trimesh
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tooth-lib'))
from frames import load, frames, mesh_of
from build import neck_of

OUT = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'teeth'
sc = trimesh.load(sys.argv[1], force='scene')
m, buf, parts = load(); fr = frames(parts)
body = bytearray(); lib = []

def put(a):
    while len(body) % 4: body.append(0)
    o = len(body); body.extend(a.tobytes()); return o

def add(id_, fdi, V, F, **extra):
    assert F.max() < 65535, id_
    n = trimesh.Trimesh(V, F, process=False).vertex_normals
    lib.append(dict(id=id_, fdi=fdi, vertexCount=len(V), indexCount=F.size, pos=put(V.astype('<f4')), nrm=put(n.astype('<f4')), idx=put(F.astype('<u2').ravel()),
                    bounds=[V.min(0).round(3).tolist(), V.max(0).round(3).tolist()], **extra))

def lib_frame(f):
    """World (scan) -> library frame, exactly as tools/tooth-lib/build.py places the tooth."""
    R = fr[f]['R']; c = fr[f]['c']
    pos = (mesh_of(buf, parts[('tooth', f)])[0] - c) @ R.T
    neck = neck_of(pos, f % 10); cc = pos[pos[:, 1] > neck][:, [0, 2]].mean(0)
    L = np.eye(4); L[:3, :3] = R; L[:3, 3] = -R @ c - np.array([cc[0], neck, cc[1]]); return L

shared = {}
for f in sorted(k for k in (int(n.split('-')[1]) for n in sc.graph.nodes_geometry if n.startswith('crown-'))):
    L = lib_frame(f); mats = {}
    for k in ('crown', 'implant', 'abutment', 'screw'):
        Mw, g = sc.graph.get(f'{k}-{f}'); mats[k] = L @ Mw; geo = sc.geometry[g]
        if k == 'crown':
            V = trimesh.transformations.transform_points(geo.vertices, mats[k]); add(f'imp-crown-{f}', f, V, np.asarray(geo.faces))
        elif k not in shared: shared[k] = geo
    assert all(np.allclose(mats[k], mats['implant']) for k in ('abutment', 'screw')), f'{f}: parts do not share one transform'
    lib[-1]['fit'] = mats['implant'].T.ravel().round(6).tolist()   # column-major for three.js Matrix4.fromArray
for k, g in shared.items(): add(f'imp-{k}', 0, np.asarray(g.vertices), np.asarray(g.faces))
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'implants.bin').write_bytes(bytes(body))
(OUT / 'implants.json').write_text(json.dumps(dict(units='mm', origin='neck of the tooth', up='+y toward the bite', lip='+z',
    note='imp-crown-FDI is baked in the library frame; imp-implant/abutment/screw are in their own units: apply the crown part\'s `fit` matrix.',
    parts=lib), separators=(',', ':')))
print(len(lib), 'parts', round(len(body) / 1e6, 2), 'MB')
