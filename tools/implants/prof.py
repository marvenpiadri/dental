import trimesh, numpy as np
for n in ['abutment','implant','screw']:
    m=trimesh.load(f'{n}_centered.stl')
    print(n, 'z-range',m.bounds[:,2].round(2))
    for z in np.arange(1,m.bounds[1,2],3.0):
        s=m.section(plane_origin=[0,0,z],plane_normal=[0,0,1])
        if s is None: continue
        out=[]
        for e in s.discrete:
            r=np.linalg.norm(e[:,:2],axis=1); out.append((round(r.min(),2),round(r.max(),2),round(r.std(),2),len(e)))
        print(f'  z={z:5.1f}', sorted(out,key=lambda t:t[1]))
