import trimesh, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
D='/mnt/user-data/attachments/af926fd3-9817-5400-b13f-10bd131c71f1/'
F={'implant':'b9a3b30e-Implant.stl','abutment':'2910c814-Abutment.stl','screw':'10dde514-Screw.stl'}
fig,axs=plt.subplots(1,3,figsize=(15,8))
M={}
for ax,(n,f) in zip(axs,F.items()):
    m=trimesh.load(D+f,force='mesh'); c=m.bounds.mean(0)
    # center xy on the axis
    m.apply_translation([-m.vertices[:,0].mean(),-m.vertices[:,1].mean(),0]); 
    ctr=np.array([ (m.bounds[0,0]+m.bounds[1,0])/2,(m.bounds[0,1]+m.bounds[1,1])/2,0]); m.apply_translation(-ctr)
    M[n]=m
    s=m.section(plane_origin=[0,0,0],plane_normal=[0,1,0])
    p,_=s.to_2D(to_2D=np.array([[1,0,0,0],[0,0,1,0],[0,1,0,0],[0,0,0,1]]))
    for e in p.entities:
        pts=p.vertices[e.points]; ax.plot(pts[:,0],pts[:,1],lw=.7)
    ax.set_aspect('equal'); ax.set_title(n); ax.grid(alpha=.3)
plt.savefig('sections.png',dpi=90)
import pickle
for n,m in M.items(): m.export(f'{n}_centered.stl')
