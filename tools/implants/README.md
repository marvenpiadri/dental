# Implant restorations (site)

Generates `site/public/models/implants.glb` + `implants.json` from the jaw scan teeth and three STL parts (implant, abutment, screw).

Run order (needs `pip install trimesh manifold3d scipy fast-simplification`, and `@gltf-transform/cli` for compression):
`teeth.py` (extract tooth meshes from jaw.bin) -> keep the outer shell only (the scan teeth contain an inner pulp shell) -> `runall.py` (per-tooth crown by boolean) -> `export.py` -> `gltf-transform weld | quantize | meshopt`.

Verified (report.json): all 32 crowns watertight, Euler number 2, zero interference volume against abutment and screw,
crown wall >= 0.5 mm. Implant, abutment and screw STLs fit each other with zero interference when the abutment and screw
are flipped (z = 93.5 - z and z = 78.625 - z) and the hex flats are aligned (rotation 0).
Not verified: mechanical behaviour (torque, preload, loading). This is geometric fit only.
The three STLs are third-party free downloads: confirm their licence before commercial use.
Implant/screw are decimated for the web (90k -> 29k and 37k -> 15k triangles); fit was checked on the full-resolution STLs.
