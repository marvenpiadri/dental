"""Small mesh helpers (numpy only): normals, slicing, procedural hardware."""
import numpy as np


def vertex_normals(pos, idx):
    n = np.zeros_like(pos)
    a, b, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(b - a, c - a)  # area-weighted
    for k in range(3):
        np.add.at(n, idx[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(ln == 0, 1, ln)


def take(pos, nrm, idx, tri_mask, extra=()):
    """Sub-mesh made of the triangles in tri_mask, vertices reindexed. Returns pos, nrm, idx, extra arrays, old-vertex map."""
    tri = idx[tri_mask]
    used, inv = np.unique(tri.ravel(), return_inverse=True)
    return pos[used], nrm[used], inv.reshape(-1, 3), [e[used] for e in extra], used


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lathe(profile, seg=48):
    """Surface of revolution about y from (radius, y) rings; closed with the end rings as they are."""
    prof = np.asarray(profile, float)
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    pos = np.concatenate([np.stack([r * np.cos(ang), np.full(seg, y), r * np.sin(ang)], 1) for r, y in prof])
    rings = len(prof)
    idx = []
    for i in range(rings - 1):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            c, d = (i + 1) * seg + j, (i + 1) * seg + (j + 1) % seg
            idx += [[a, c, b], [b, c, d]]
    # cap both ends with a centre vertex
    for ring, up in ((0, False), (rings - 1, True)):
        cy = prof[ring][1]
        pos = np.vstack([pos, [0, cy, 0]]); ci = len(pos) - 1
        for j in range(seg):
            a, b = ring * seg + j, ring * seg + (j + 1) % seg
            idx.append([ci, a, b] if up else [ci, b, a])
    return pos, np.array(idx)


def box(w, h, d, at=(0, 0, 0)):
    x, y, z = w / 2, h / 2, d / 2
    v = np.array([[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]) + at
    f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]]
    return v, np.array(f)


def merge(meshes):
    pos, idx, off = [], [], 0
    for p, i in meshes:
        pos.append(p); idx.append(i + off); off += len(p)
    return np.vstack(pos), np.vstack(idx)


def flat(pos, idx):
    """Unshare vertices so normals are per-face (hard edges) - right for hardware."""
    p = pos[idx.ravel()]
    n = np.repeat(np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]]), 3, axis=0)
    n /= np.where(np.linalg.norm(n, axis=1, keepdims=True) == 0, 1, np.linalg.norm(n, axis=1, keepdims=True))
    return p, n, np.arange(len(p)).reshape(-1, 3)


def hardware():
    """Titanium fixture with threads, abutments, healing cap, bracket, band. mm, origin at the neck of the tooth, +y toward the bite."""
    out = {}
    # fixture: 4.1 mm platform, 10 mm long, tapered apex, 0.8 mm pitch threads
    ys = np.linspace(0, -10, 181); pitch = 0.8
    taper = np.where(ys < -8, 1 - 0.45 * np.clip((-ys - 8) / 2, 0, 1) ** 1.5, 1.0)
    thread = 0.22 * ((-ys / pitch) % 1.0)
    r = (1.75 + thread) * taper
    p, i = lathe(np.stack([r, ys], 1), 48)
    out['implant-fixture'] = p, i
    # abutment: hex collar then a cone
    ab = lathe([(2.2, 0), (2.2, 0.6), (1.9, 0.6), (1.7, 1.2), (1.5, 4.0), (1.3, 4.0)], 6)
    ab2 = lathe([(1.9, 0.6), (1.7, 1.2), (1.5, 4.0), (1.3, 4.0)], 40)
    out['abutment'] = merge([lathe([(2.2, 0), (2.2, 0.6)], 40), ab2])
    out['healing-cap'] = lathe([(2.4, 0), (2.4, 1.4), (2.0, 2.6), (1.1, 3.0), (0.0, 3.1)], 40)
    out['cover-screw'] = lathe([(1.4, 0), (1.4, 0.5), (0.0, 0.55)], 32)
    # bracket: pad, body with an archwire slot, two wings
    pad = box(3.4, 3.0, 0.5, (0, 0, 0.25)); bodyL = box(1.4, 3.0, 1.1, (-1.0, 0, 1.05)); bodyR = box(1.4, 3.0, 1.1, (1.0, 0, 1.05))
    wing = lambda s: box(3.4, 0.5, 1.1, (0, s * 1.2, 1.05))
    out['bracket'] = merge([pad, bodyL, bodyR, wing(1), wing(-1)])
    ring = lathe([(5.3, -1.6), (5.3, 1.6), (4.8, 1.6), (4.8, -1.6), (5.3, -1.6)], 64)
    out['band'] = ring
    return out
