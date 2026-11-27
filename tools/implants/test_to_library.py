"""Contract of public/models/teeth/implants.{json,bin} (what tooth-scene.ts relies on). Unit tier: reads the committed files, no database, no GPU.
  python3 -m unittest tools/implants/test_to_library.py"""
import json, unittest
from pathlib import Path
import numpy as np

D = Path(__file__).resolve().parents[2] / 'public' / 'models' / 'teeth'
META = json.loads((D / 'implants.json').read_text()); BIN = (D / 'implants.bin').read_bytes()
P = {p['id']: p for p in META['parts']}
FDI = [q * 10 + n for q in (1, 2, 3, 4) for n in range(1, 9)]

class ImplantLibrary(unittest.TestCase):
    def test_one_crown_per_tooth_and_three_shared_parts(self):
        self.assertEqual(sorted(k for k in P if k.startswith('imp-crown-')), sorted(f'imp-crown-{f}' for f in FDI))
        for k in ('imp-implant', 'imp-abutment', 'imp-screw'): self.assertIn(k, P)
        self.assertEqual(len(P), 35)

    def test_every_part_lies_inside_the_file_and_is_aligned(self):
        for p in P.values():
            for off, n in ((p['pos'], p['vertexCount'] * 12), (p['nrm'], p['vertexCount'] * 12), (p['idx'], p['indexCount'] * 2)):
                self.assertEqual(off % 4, 0, p['id']); self.assertLessEqual(off + n, len(BIN), p['id'])
            self.assertLess(p['vertexCount'], 65535, p['id'])  # Uint16 index
            self.assertEqual(p['indexCount'] % 3, 0, p['id'])
            self.assertTrue(p['pos'] < p['nrm'] < p['idx'], p['id'])  # tooth-scene fetches pos..idx end as one byte range

    def test_indices_point_at_real_vertices(self):
        for p in P.values():
            idx = np.frombuffer(BIN, '<u2', p['indexCount'], p['idx']); self.assertLess(int(idx.max()), p['vertexCount'], p['id'])

    def test_crowns_sit_on_the_neck_in_the_library_frame(self):
        for f in FDI:
            lo, hi = P[f'imp-crown-{f}']['bounds']
            self.assertGreater(hi[1], 6, f); self.assertLess(hi[1], 14, f)    # a crown: mm, +y toward the bite
            self.assertGreater(lo[1], -4, f); self.assertLess(lo[1], 1, f)    # base at the neck plane (the emergence profile dips a little below)
            self.assertLess(max(hi[0] - lo[0], hi[2] - lo[2]), 16, f)

    def test_fit_matrix_puts_the_fixture_below_the_neck(self):
        b = np.array(P['imp-implant']['bounds']); box = np.array([[x, y, z, 1] for x in b[:, 0] for y in b[:, 1] for z in b[:, 2]])
        for f in FDI:
            fit = P[f'imp-crown-{f}']['fit']; self.assertEqual(len(fit), 16)
            M = np.array(fit).reshape(4, 4).T; self.assertTrue(np.allclose(M[3], [0, 0, 0, 1]), f)
            y = (box @ M.T)[:, 1]
            self.assertLess(y.max(), 1.5, f); self.assertGreater(y.min(), -20, f)   # collar within 1.5 mm of the neck plane, about 6 to 12.5 mm long
            self.assertGreater(y.max() - y.min(), 5.5, f)  # shortest are the lower incisors (about 6 mm)

if __name__ == '__main__': unittest.main()
