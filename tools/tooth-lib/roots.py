"""Splits a tooth's root part into its individual roots (up to three) plus the shared trunk above the furcation."""
import numpy as np
import trimesh
from scipy.cluster.vq import kmeans2
from geom import vertex_normals, take


def _count(mesh, y):
    sec = mesh.section(plane_origin=[0, y, 0], plane_normal=[0, 1, 0])
    if sec is None:
        return 0
    try:
        planar, _ = sec.to_2D()
        return sum(1 for p in planar.polygons_full if p.area > 1.0)
    except Exception:
        return 0


def _slot_names(f, cents, mesial):
    """Which of the three root slots each cluster is, by anatomy. Returns [(slot, key)] in cents order."""
    n = len(cents)
    upper, molar, premolar = f < 30, f % 10 >= 6, f % 10 in (4, 5)
    xs, zs = cents[:, 0] * mesial, cents[:, 2]
    if n == 1:
        return [(1, 'single')]
    if n == 3:  # upper molar: palatal is the most lingual; of the two buccal roots the mesial one comes first
        order = list(np.argsort(zs)); p = order[0]
        rest = sorted(order[1:], key=lambda i: -xs[i])
        out = {rest[0]: (1, 'mb'), rest[1]: (2, 'db'), p: (3, 'p')} if upper else {rest[0]: (1, 'm'), rest[1]: (2, 'd'), p: (3, 'l')}
        return [out[i] for i in range(3)]
    if molar:
        if upper:  # two roots found on an upper molar: buccal (fused) and palatal
            b = int(np.argmax(zs)); return [(1, 'b') if i == b else (3, 'p') for i in range(2)]
        m = int(np.argmax(xs)); return [(1, 'm') if i == m else (2, 'd') for i in range(2)]
    b = int(np.argmax(zs))  # premolar: buccal and palatal/lingual
    return [(1, 'b') if i == b else (2, 'l' if not upper else 'p') for i in range(2)]


def split(down, f, mesial):
    """down: watertight root mesh (y <= 0, neck at 0). Returns (trunk, roots, k) where roots = [dict(slot, key, mesh, broken)]."""
    pos, idx = down.vertices, down.faces
    nrm = vertex_normals(pos, idx)
    ymin = pos[:, 1].min()
    levels = np.linspace(0.2, 0.92, 15)
    counts = np.array([_count(down, ymin * t) for t in levels])
    # roots seen at three or more levels of the section are real; the scan merges the tips, so a single level means nothing
    n = max([k for k in (1, 2, 3) if (counts >= k).sum() >= 3] or [1])
    if f % 10 <= 3:  # incisors and canines have one root; a stray second polygon is noise
        n = 1
    # Anatomy asks for 3 horns on an upper molar, 2 on a lower molar and on a first upper premolar. Where the scan fused them,
    # the root is sliced into that many parts around its own axis instead.
    want = 3 if (f < 30 and f % 10 >= 6) else 2 if (f % 10 >= 6 or (f < 30 and f % 10 == 4)) else 1
    forced = n < want
    if forced:
        n = want
    tri_c = pos[idx].mean(1)
    if n == 1:
        groups, trunk_mask, cents = [np.ones(len(idx), bool)], np.zeros(len(idx), bool), np.array([[pos[:, 0].mean(), 0, pos[:, 2].mean()]])
    else:
        lv = levels[counts >= n] if not forced else levels[:0]
        low = pos[(pos[:, 1] <= ymin * lv.min()) & (pos[:, 1] >= ymin * lv.max())][:, [0, 2]] if len(lv) else pos[pos[:, 1] <= ymin * 0.3][:, [0, 2]]  # where the roots stand apart
        seeds = [low[np.argmax(low[:, 0])]]  # farthest-point seeds so the clusters are stable
        while len(seeds) < n:
            d = np.min([np.linalg.norm(low - s, axis=1) for s in seeds], axis=0); seeds.append(low[np.argmax(d)])
        cen2, _ = kmeans2(low, np.array(seeds), minit='matrix', iter=20)
        # furcation: the first level, walking down from the neck, where the section has fallen into n separate roots
        yf = ymin * 0.3
        for t in np.linspace(0.05, 0.6, 45):
            if not forced and _count(down, ymin * t) >= n:
                yf = ymin * t; break
        yf -= 0.6
        trunk_mask = tri_c[:, 1] > yf
        d = np.linalg.norm(tri_c[:, None, [0, 2]] - cen2[None], axis=2)
        owner = d.argmin(1)
        groups = [(~trunk_mask) & (owner == k) for k in range(n)]
        cents = np.array([[c[0], 0, c[1]] for c in cen2])
    names = _slot_names(f, cents, mesial)
    roots = []
    for k, g in enumerate(groups):
        if not g.any():
            continue
        p, nn, ii, _, _ = take(pos, nrm, idx, g)
        m = trimesh.Trimesh(p, ii, process=False)
        ytop, ybot = p[:, 1].max(), p[:, 1].min()
        cut = ytop + 0.5 * (ybot - ytop)  # a fracture across the middle of the root, slightly oblique
        brk = trimesh.intersections.slice_mesh_plane(m, [0.18, 1, 0.1], [0, cut, 0], cap=False)
        bn = vertex_normals(brk.vertices, brk.faces)
        roots.append(dict(slot=names[k][0], key=names[k][1], pos=p, nrm=nn, idx=ii, bpos=brk.vertices, bnrm=bn, bidx=brk.faces,
                          tip=p[np.argmin(p[:, 1])].tolist()))
    trunk = take(pos, nrm, idx, trunk_mask)[:3] if trunk_mask.any() else None
    return trunk, roots, n
