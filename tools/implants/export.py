import pickle, json, numpy as np, trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual import TextureVisuals
from build import imp, abu_f, scr_f, T, ZBASE
def mat(name,c,m,r): return PBRMaterial(name=name,baseColorFactor=[int(255*x) for x in c]+[255],metallicFactor=m,roughnessFactor=r)
MAT={'crown':mat('ceramic',[.93,.90,.84],0.0,.35),'abutment':mat('titanium-abutment',[.62,.64,.68],1.0,.32),'implant':mat('titanium-implant',[.74,.76,.79],1.0,.30),'screw':mat('screw',[.12,.12,.13],.9,.42)}
def tag(m,k): m=m.copy(); m.visual=TextureVisuals(material=MAT[k]); return m
sc=trimesh.Scene()
import fast_simplification as fs
def dec(m,red):
    v,f=fs.simplify(np.asarray(m.vertices,dtype=np.float32),np.asarray(m.faces,dtype=np.int32),target_reduction=red); d=trimesh.Trimesh(v,f,process=True); print('  decimated',len(m.faces),'->',len(d.faces),'watertight',d.is_watertight); return d
G={'abutment':tag(abu_f,'abutment'),'implant':tag(dec(imp,0.68),'implant'),'screw':tag(dec(scr_f,0.6),'screw')}
meta={}
for f in sorted(T):
    V,F,info=pickle.load(open(f'crown_{f}.pkl','rb'))
    s,Pcut,Rm=info['s'],info['Pcut'],info['Rm']
    M=np.eye(4); M[:3,:3]=Rm*s; M[:3,3]=Pcut-(Rm*s)@np.array([0,0,ZBASE])
    sc.graph.update(frame_to=f'tooth-{f}',frame_from='world',matrix=M)
    crown=trimesh.Trimesh(V,F,process=False); crown.fix_normals()
    sc.add_geometry(tag(crown,'crown'),node_name=f'crown-{f}',geom_name=f'crown-{f}',parent_node_name=f'tooth-{f}')
    for k,g in G.items(): sc.add_geometry(g,node_name=f'{k}-{f}',geom_name=k,parent_node_name=f'tooth-{f}')
    meta[f]=dict(s=round(s,4),D_mm=round(31.2*s,2),length_mm=round(63.45*s,2),wall_mm=round(float(info['wall_mm']),2))
sc.export('implants_raw.glb',include_normals=True); json.dump(meta,open('implants_meta.json','w'),indent=1)
import os; print('raw glb MB',os.path.getsize('implants_raw.glb')/1e6)
r=trimesh.load('implants_raw.glb'); print('nodes',len(r.graph.nodes_geometry),'unique geoms',len(r.geometry))
