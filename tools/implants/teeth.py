import json, numpy as np, trimesh
J=json.load(open('/home/claude/dental/site/public/models/jaw.json')); B=open('/home/claude/dental/site/public/models/jaw.bin','rb').read()
out={}
for p in J['parts']:
    if p['group']!='tooth': continue
    n=p['n']; q=np.frombuffer(B,'<i2',n*3,p['pos']).reshape(-1,3).astype(float)
    lo=np.array(p['lo']); hi=np.array(p['hi']); pos=lo+(q+32767)/65534*(hi-lo)
    idx=np.frombuffer(B,'<u4' if p['big'] else '<u2',p['tris']*3,p['idx']).reshape(-1,3).astype(int)
    m=trimesh.Trimesh(pos,idx,process=False); out[p['fdi']]=m
    if p['fdi'] in (11,14,36,46): 
        m2=m.copy(); m2.merge_vertices()
        print(p['fdi'],'verts',len(m.vertices),'faces',len(m.faces),'watertight',m2.is_watertight,'vol',round(m2.volume,1),'ext',m.extents.round(1), 'comps',len(m2.split(only_watertight=False)))
import pickle; pickle.dump({k:(v.vertices,v.faces) for k,v in out.items()},open('teeth.pkl','wb'))
print(sorted(out))
