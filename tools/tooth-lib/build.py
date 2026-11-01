"""Builds Dentaleus's own tooth library from the ToothFairy3 scan (CC BY-SA 4.0, case F_026).

  python3 build.py            -> ../../public/models/teeth/teeth.bin + teeth.json
  python3 build.py --glb      -> also teeth-preview.glb, openable in Blender

Per tooth: crown and root cut at the neck (capped, watertight), the pulp, a restoration shell that follows the real
crown, a prepared-tooth stump, and soft per-vertex surface weights. Plus procedural hardware. Units are mm, origin at the
neck, +y toward the bite, +z toward the lip or cheek; `mesial` says which side of x faces the midline.
"""
import json
import sys
import numpy as np
import trimesh
from pathlib import Path
from frames import load, mesh_of, frames
from geom import vertex_normals, smoothstep, hardware, flat

OUT = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'teeth'
SHELL_MM, PREP_MM = 0.35, 0.9


# Crown height as a share of the tooth's length (anatomy atlases): bounds for the neck search, so a long taper cannot push it too deep.
CROWN_SHARE = {1: (0.34, 0.44), 2: (0.34, 0.44), 3: (0.30, 0.40), 4: (0.32, 0.42), 5: (0.32, 0.42), 6: (0.28, 0.42), 7: (0.28, 0.42), 8: (0.28, 0.42)}


def neck_of(q, kind):
    """Where the crown ends: the cervical constriction (molars, premolars) or the steep taper below the widest part (single-root teeth)."""
    y = q[:, 1]; top, bot = y.max(), y.min(); L = top - bot
    edges = np.linspace(top, bot, 41); w = []
    for i in range(40):
        s = q[(y <= edges[i]) & (y > edges[i + 1])]
        w.append((np.ptp(s[:, 0]) + np.ptp(s[:, 2])) / 2 if len(s) else 0)
    w = np.convolve(w, np.ones(3) / 3, mode='same'); ip = int(np.argmax(w[:16]))
    win = w[ip + 2: ip + 14]
    k = int(np.argmin(win)) + ip + 2
    if k >= ip + 13 or w[k] > 0.97 * w[ip + 2]:  # no constriction: first bin that fell to 82% of the widest
        below = np.where(w[ip:] <= 0.82 * w[ip])[0]
        k = ip + int(below[0]) if len(below) else int(0.4 * 40)
    ny = edges[k]
    lo, hi = CROWN_SHARE[kind]
    return float(np.clip(ny, top - hi * L, top - lo * L))


def zone_weights(n, y, neck, mesial):
    """Soft partition of a crown's surface into mesial, distal, buccal, lingual (A) and occlusal, cervical (B)."""
    occ = smoothstep(0.40, 0.80, n[:, 1])
    side = lambda v: smoothstep(0.15, 0.65, v) * (1 - occ)
    w = np.stack([side(n[:, 0] * mesial), side(-n[:, 0] * mesial), side(n[:, 2]), side(-n[:, 2]), occ], 1)
    tot = w.sum(1, keepdims=True)
    w = np.where(tot < 1e-6, np.array([0, 0, 0, 0, 1.0]), w / np.where(tot == 0, 1, tot))
    cerv = 1 - smoothstep(0.0, 1.8, y - neck)
    return (w[:, :4] * 255).round().astype(np.uint8), np.stack([(w[:, 4] * 255).round(), (cerv * 255).round(), np.zeros(len(w)), np.zeros(len(w))], 1).astype(np.uint8)


def build():
    m, buf, parts = load(); fr = frames(parts)
    lib, meshes = [], {}
    body = bytearray()

    def put(arr):
        while len(body) % 4: body.append(0)
        off = len(body); body.extend(arr.tobytes()); return off

    def add(id_, kind, fdi, pos, nrm, idx, extra=None, **meta):
        assert idx.max() < 65535 and np.isfinite(pos).all() and np.isfinite(nrm).all(), id_
        e = dict(id=id_, kind=kind, fdi=fdi, vertexCount=len(pos), indexCount=idx.size,
                 pos=put(pos.astype('<f4')), nrm=put(nrm.astype('<f4')), idx=put(idx.astype('<u2').ravel()),
                 bounds=[pos.min(0).round(3).tolist(), pos.max(0).round(3).tolist()], **meta)
        for k, v in (extra or {}).items(): e[k] = put(v)
        lib.append(e); meshes[id_] = (pos, idx)

    for f in sorted(p['fdi'] for (g, _), p in parts.items() if g == 'tooth'):
        fm = fr[f]; R = fm['R']
        def local(p):
            pos, nrm, idx = mesh_of(buf, p)
            return (pos - fm['c']) @ R.T, nrm @ R.T, idx
        pos, nrm, idx = local(parts[('tooth', f)])
        neck = neck_of(pos, f % 10)
        crown_c = pos[pos[:, 1] > neck][:, [0, 2]].mean(0)
        shift = np.array([crown_c[0], neck, crown_c[1]])
        tm = trimesh.Trimesh(pos - shift, idx, process=True)
        parts_ = [c for c in tm.split(only_watertight=False) if len(c.faces) > 100]  # drops stray slivers some scans leave next to a tooth
        tm = trimesh.util.concatenate(parts_) if len(parts_) > 1 else parts_[0]
        assert tm.is_watertight, f'tooth {f} is not watertight'
        up = trimesh.intersections.slice_mesh_plane(tm, [0, 1, 0], [0, 0, 0], cap=True)
        down = trimesh.intersections.slice_mesh_plane(tm, [0, -1, 0], [0, 0, 0], cap=True)
        open_up = trimesh.intersections.slice_mesh_plane(tm, [0, 1, 0], [0, 0, 0], cap=False)
        meta = dict(mesial=fm['mesial'], neckY=0.0)

        cn = vertex_normals(up.vertices, up.faces)
        za, zb = zone_weights(cn, up.vertices[:, 1], 0.0, fm['mesial'])
        add(f'crown-{f}', 'crown', f, up.vertices, cn, up.faces, dict(zoneA=za, zoneB=zb), **meta)
        rn = vertex_normals(down.vertices, down.faces)
        add(f'root-{f}', 'root', f, down.vertices, rn, down.faces, **meta)
        # Restoration shell: same surface pushed out, open at the neck, tapering to nothing there so it seats on the tooth.
        sv = open_up.vertices; sn = vertex_normals(sv, open_up.faces)
        taper = smoothstep(0.0, 1.5, sv[:, 1])[:, None]
        shell = sv + sn * SHELL_MM * taper
        zsa, zsb = zone_weights(sn, sv[:, 1], 0.0, fm['mesial'])
        add(f'shell-{f}', 'shell', f, shell, sn, open_up.faces, dict(zoneA=zsa, zoneB=zsb), **meta)
        # Prepared stump: the crown shrunk 0.9 mm, flattened at the top, for "prepared for crown".
        top = up.vertices[:, 1].max()
        stump = up.vertices - cn * PREP_MM * smoothstep(0.0, 1.5, up.vertices[:, 1])[:, None]
        stump[:, 1] = np.minimum(stump[:, 1], top * 0.78)
        add(f'prep-{f}', 'prep', f, stump, vertex_normals(stump, up.faces), up.faces, **meta)
        pp = parts.get(('pulp', f))
        if pp:
            ppos, pnrm, pidx = local(pp)
            add(f'pulp-{f}', 'pulp', f, ppos - shift, pnrm, pidx, **meta)

    for name, (p, i) in hardware().items():
        fp, fn, fi = flat(p, i)
        add(f'hw-{name}', 'hardware', 0, fp, fn, fi)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'teeth.bin').write_bytes(bytes(body))
    (OUT / 'teeth.json').write_text(json.dumps(dict(
        units='mm', origin='neck of the tooth', up='+y toward the bite', lip='+z',
        zones='zoneA = u8x4 [mesial, distal, buccal, lingual]; zoneB = u8x4 [occlusal, cervical, 0, 0]; weights sum to 1 on the crown',
        source=dict(title='ToothFairy3', url='https://ditto.ing.unimore.it/toothfairy3/', case='ToothFairy3F_026', license='CC BY-SA 4.0'),
        parts=lib), separators=(',', ':')))
    if '--glb' in sys.argv:
        sc = trimesh.Scene()
        for e in lib:
            if e['kind'] in ('crown', 'root', 'pulp') and e['fdi'] in (16, 11):
                p, i = meshes[e['id']]; sc.add_geometry(trimesh.Trimesh(p, i), node_name=e['id'])
        sc.export(OUT / 'teeth-preview.glb')
    print(f'{len(lib)} parts, {len(body) / 1e6:.1f} MB')


if __name__ == '__main__':
    build()
