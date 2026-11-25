import pickle, numpy as np, trimesh, math
from axis import T, ARCH, frame
from scipy.spatial import cKDTree
R=trimesh.transformations.rotation_matrix
imp=trimesh.load('implant_centered.stl'); abu=trimesh.load('abutment_centered.stl'); scr=trimesh.load('screw_centered.stl')
abu_f=abu.copy(); abu_f.apply_transform(R(np.pi,[1,0,0])); abu_f.apply_translation([0,0,93.5])
scr_f=scr.copy(); scr_f.apply_transform(R(np.pi,[1,0,0])); scr_f.apply_translation([0,0,78.625])
PLUG=trimesh.creation.cylinder(radius=7.9,height=93.5-64.0,transform=trimesh.transformations.translation_matrix([0,0,(93.5+64.0)/2]),sections=96)
CAV0=trimesh.boolean.union([abu_f,PLUG],engine='manifold')
ZBASE=65.0   # crown base plane in implant units: just above the collar rim (rim spans z=63.5..65.75)
def sect_area(m,a,h):
    s=m.section(plane_origin=a*h,plane_normal=a)
    if s is None: return 0,None
    u=np.cross(a,[1,0,0]); u=u if np.linalg.norm(u)>.1 else np.cross(a,[0,1,0]); u/=np.linalg.norm(u); v=np.cross(a,u)
    tot=0; cen=np.zeros(3)
    for e in s.discrete:
        x=e@u;y=e@v; ar=abs(0.5*np.sum(x*np.roll(y,-1)-np.roll(x,-1)*y)); tot+=ar; cen+=ar*e.mean(0)
    return tot,cen/max(tot,1e-9)
def smooth(t): t=np.clip(t,0,1); return t*t*(3-2*t)
def build(fdi,s_override=None):
    m,a,b,md,Cc=frame(fdi); V=m.vertices.copy(); h=V@a; top=h.max()
    hs=np.arange(top-1.0,top-22,-0.25); A=np.array([sect_area(m,a,x)[0] for x in hs]); imax=int(np.argmax(A))
    idx=np.where((np.arange(len(A))>imax)&(A<=0.82*A[imax]))[0]; dc=(top-hs[idx[0]]) if len(idx) else 10.0
    h_cej=top-dc; Acej,cen=sect_area(m,a,h_cej)
    H=3.0 if fdi%10>=6 else 2.2
    deq=2*math.sqrt(Acej/math.pi); D=float(np.clip(0.62*deq,3.0,5.5)); s=(s_override or D/31.2)
    Rb=16.4*s; SLOPE=0.45
    P0=cen+a*(h_cej-cen@a)                       # axis point at the neck, in the neck plane
    for attempt in range(10):
        SLOPE=[0.45,0.7,1.0][min(attempt,2)]
        # radial blend below the neck onto a circle of radius Rb (a root-form emergence profile)
        rel=V-P0; hh=rel@a; rp=rel-np.outer(hh,a); r=np.linalg.norm(rp,axis=1)+1e-9
        w=smooth((h_cej-h)/(0.85*H)); rt=Rb+SLOPE*np.maximum(h-(h_cej-H),0); r2=r+w*(rt-r)
        Vm=P0+np.outer(hh,a)+rp/r[:,None]*r2[:,None]
        # smooth only the emergence zone (below the neck, above the exact-circle ring) so the low-poly root fan does not wrinkle
        q=(h_cej-h)/H; zone=(q>-0.05)&(q<0.7)
        Fc=m.faces; E=np.concatenate([Fc[:,[0,1]],Fc[:,[1,2]],Fc[:,[2,0]]]); E=np.concatenate([E,E[:,::-1]])
        cnt=np.bincount(E[:,0],minlength=len(Vm)).astype(float)
        def lap(P,lam):
            acc=np.zeros_like(P); np.add.at(acc,E[:,0],P[E[:,1]]); avg=acc/np.maximum(cnt,1)[:,None]
            Q=P.copy(); Q[zone]=P[zone]+lam*(avg[zone]-P[zone]); return Q
        for _ in range(12): Vm=lap(lap(Vm,0.5),-0.53)
        mm=trimesh.Trimesh(Vm,m.faces.copy(),process=False)
        # to implant frame (units): p = Rm^T (V-Pcut)/s + [0,0,ZBASE]
        Pcut=P0+a*(-H)
        Rm=np.stack([b,md,a],1)
        Vi=((Vm-Pcut)@Rm)/s+np.array([0,0,ZBASE])
        ci=trimesh.Trimesh(Vi,m.faces.copy(),process=False)
        box=trimesh.creation.box(extents=[400,400,300],transform=trimesh.transformations.translation_matrix([0,0,ZBASE+150]))
        crown=trimesh.boolean.intersection([ci,box],engine='manifold')
        cav=CAV0.copy(); cav.apply_scale([1.012,1.012,1.0]); zs=(93.5+0.3-65)/(93.5-65); cav.apply_translation([0,0,-65]); cav.apply_scale([1,1,zs]); cav.apply_translation([0,0,65])
        fin=trimesh.boolean.difference([crown,cav],engine='manifold')
        # wall thickness: cavity surface vs crown outer surface
        outer=crown.sample(60000); 
        cs=cav.sample(20000); cs=cs[cs[:,2]>ZBASE+9.0]
        dd=cKDTree(outer).query(cs)[0]*s; wall=dd.min()
        prof={int(z0):round(float(dd[(cs[:,2]>=z0)&(cs[:,2]<z0+4)].min()),2) for z0 in range(74,94,4) if ((cs[:,2]>=z0)&(cs[:,2]<z0+4)).any()}
        print('   try s=%.3f D=%.2f wall=%.2f mm'%(s,31.2*s,wall))
        if wall>=0.5 or s_override or (attempt>=2 and 31.2*s*0.95<3.0): break
        if attempt>=2: s*=0.95; Rb=16.4*s
    def vi(a,b):
        r=trimesh.boolean.intersection([a,b],engine='manifold'); return float(r.volume) if len(r.faces) else 0.0
    i_abu=vi(fin,abu_f); i_scr=vi(fin,scr_f)
    info=dict(fdi=fdi,slope=SLOPE,wall_profile=prof,euler_morph=int(mm.euler_number),euler_cut=int(crown.euler_number),int_abutment=i_abu,int_screw=i_scr,min_z=float(fin.bounds[0,2]),euler=int(fin.euler_number),volume_ok=bool(fin.is_volume),s=s,D=31.2*s,len=63.45*s,Acej=Acej,dc=dc,H=H,wall_mm=wall,tris=len(fin.faces),wt=fin.is_watertight,vol=float(fin.volume),
              Pcut=Pcut,Rm=Rm)
    return fin,crown,info
if __name__=='__main__':
    import sys
    for f in map(int,sys.argv[1:]):
        fin,crown,info=build(f)
        print({k:(round(v,3) if isinstance(v,float) else v) for k,v in info.items() if k not in('Pcut','Rm')})
        pickle.dump((fin.vertices,fin.faces,info),open(f'crown_{f}.pkl','wb'))
