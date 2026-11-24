"""Packs the ToothFairy3 whole-mouth surfaces (from the cd.dali repo) into a small web file for the Dontalist site.
Positions become int16 per part (bounds in the json), normals int8, indices uint16 (uint32 only where a part has more than 65535 vertices).
  python3 tools/site-jaw.py /path/to/cd.dali/public/models/dental site/public/models
Source: ToothFairy3F_026, CC BY-SA 4.0 (Bolelli, Lumetti, Vinayahalingam et al.); the output carries the same licence."""
import json, sys, numpy as np
src, out = sys.argv[1], sys.argv[2]
m = json.load(open(f'{src}/manifest.json')); buf = open(f'{src}/toothfairy.bin', 'rb').read()
chunks, parts, off = [], [], 0
def add(a):
    global off
    b = a.tobytes(); pad = (-len(b)) % 4; chunks.append(b + b'\0' * pad); o = off; off += len(b) + pad; return o
for p in m['parts']:
    if p['buffer'] != 'toothfairy' or p['group'] in ('canal', 'sinus'): continue
    n = p['vertexCount']
    pos = np.frombuffer(buf, '<f4', n * 3, p['positions']).reshape(-1, 3)
    nor = np.frombuffer(buf, '<f4', n * 3, p['normals']).reshape(-1, 3)
    idx = np.frombuffer(buf, '<u4', p['indexCount'], p['indices'])
    lo, hi = pos.min(0), pos.max(0); span = np.maximum(hi - lo, 1e-6)
    q = np.round((pos - lo) / span * 65534 - 32767).astype('<i2')
    nq = np.round(np.clip(nor, -1, 1) * 127).astype('i1'); nq = np.concatenate([nq, np.zeros((n, 1), 'i1')], 1)  # padded to 4 bytes
    big = n > 65535
    parts.append(dict(id=p['id'], group=p['group'], fdi=p.get('fdi'), n=n, tris=p['indexCount'] // 3, big=big,
                      lo=[float(v) for v in lo], hi=[float(v) for v in hi], pos=add(q), nor=add(nq), idx=add(idx.astype('<u4' if big else '<u2'))))
open(f'{out}/jaw.bin', 'wb').write(b''.join(chunks))
json.dump(dict(license='CC BY-SA 4.0', source='ToothFairy3F_026', parts=parts), open(f'{out}/jaw.json', 'w'), separators=(',', ':'))
print(len(parts), 'parts', off, 'bytes', {g: sum(1 for p in parts if p['group'] == g) for g in {p['group'] for p in parts}})
