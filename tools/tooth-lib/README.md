# Tooth library

`python3 build.py` turns the ToothFairy3 scan surfaces in `source/` into `public/models/teeth/` (the 3D tooth view loads
these). `python3 test_build.py` checks the result. Needs numpy, scipy, trimesh, shapely, rtree, mapbox-earcut, networkx.
`--glb` also writes a preview you can open in Blender. See the docstring in `build.py` for what each part is.
