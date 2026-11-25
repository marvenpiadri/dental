import trimesh, numpy as np
imp=trimesh.load('implant_centered.stl'); abu=trimesh.load('abutment_centered.stl'); scr=trimesh.load('screw_centered.stl')
def hex_angle(m,z,rmin_hex):
    s=m.section(plane_origin=[0,0,z],plane_normal=[0,0,1])
    best=None
    for e in s.discrete:
        r=np.linalg.norm(e[:,:2],axis=1)
        if r.max()<rmin_hex[0] or r.min()>rmin_hex[1]: continue
        if abs(r.max()-r.min())<0.3: continue
        a=np.degrees(np.arctan2(e[:,1],e[:,0])); i=np.argmax(r)
        best=(a[i]%60, r.min(), r.max(), len(e))
    return best
print('implant hex @z49', hex_angle(imp,49,(8,9.2)))
print('abutment hex @z46', hex_angle(abu,46,(8,9.2)))
# flip: rotate 180 about X
def flip(m,zoff):
    m=m.copy(); m.apply_transform(trimesh.transformations.rotation_matrix(np.pi,[1,0,0])); m.apply_translation([0,0,zoff]); return m
abu_f=flip(abu,93.5)    # collar flat z=30 -> 63.5, tip 50 -> 43.5
print('abutment flipped z',abu_f.bounds[:,2])
def vol_int(a,b):
    try:
        r=trimesh.boolean.intersection([a,b],engine='manifold'); return float(r.volume) if len(r.faces) else 0.0
    except Exception as ex: return -1
import math
res=[]
for ang in range(0,60,3):
    a=abu_f.copy(); a.apply_transform(trimesh.transformations.rotation_matrix(math.radians(ang),[0,0,1]))
    res.append((vol_int(imp,a),ang))
res.sort(); print('abutment/implant interference by rotation (best 5):',[(round(v,1),a) for v,a in res[:5]],'worst',round(res[-1][0],1))
np.save('best_abut_rot.npy',np.array([res[0][1]]))
