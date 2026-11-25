import trimesh, numpy as np, math
imp=trimesh.load('implant_centered.stl'); abu=trimesh.load('abutment_centered.stl'); scr=trimesh.load('screw_centered.stl')
R=trimesh.transformations.rotation_matrix
abu_f=abu.copy(); abu_f.apply_transform(R(np.pi,[1,0,0])); abu_f.apply_translation([0,0,93.5])
def vi(a,b):
    r=trimesh.boolean.intersection([a,b],engine='manifold'); return float(r.volume) if len(r.faces) else 0.0
def screw_at(zoff,ang):
    s=scr.copy(); s.apply_transform(R(np.pi,[1,0,0])); s.apply_translation([0,0,zoff]); s.apply_transform(R(math.radians(ang),[0,0,1])); return s
# seat height: head taper z_s~9..10 should meet abutment shoulder (flipped: 93.5-25=68.5..70). start guess zoff=78.75
best=[]
for zoff in np.arange(77.0,80.01,0.25):
    s=screw_at(zoff,0)
    best.append((vi(s,imp),vi(s,abu_f),zoff))
for v in best: print('zoff %.2f  screw/implant %.2f  screw/abutment %.2f'%(v[2],v[0],v[1]))
