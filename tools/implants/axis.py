import pickle, numpy as np, trimesh, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
T=pickle.load(open('teeth_outer.pkl','rb'))
ARCH=np.array([-64.,28.])
CROWN={11:10.5,12:9.0,13:10.0,14:8.5,15:8.5,16:7.5,17:7.0,18:6.5,21:10.5,22:9.0,23:10.0,24:8.5,25:8.5,26:7.5,27:7.0,28:6.5,
       31:9.0,32:9.5,33:11.0,34:8.5,35:8.0,36:7.5,37:7.0,38:7.0,41:9.0,42:9.5,43:11.0,44:8.5,45:8.0,46:7.5,47:7.0,48:7.0}
def frame(fdi):
    V,F=T[fdi]; m=trimesh.Trimesh(V,F,process=False); upper=fdi<30
    z=V[:,2]; lo,hi=z.min(),z.max(); ext=hi-lo
    crown_sel = z<lo+0.25*ext if upper else z>hi-0.25*ext
    apex_sel  = z>hi-0.25*ext if upper else z<lo+0.25*ext
    Cc=V[crown_sel].mean(0); Ca=V[apex_sel].mean(0); a=Cc-Ca; a/=np.linalg.norm(a)
    center=V.mean(0); b=np.array([center[0]-ARCH[0],center[1]-ARCH[1],0.]); b-=a*np.dot(b,a); b/=np.linalg.norm(b)
    md=np.cross(a,b); md/=np.linalg.norm(md)
    return m,a,b,md,Cc
if __name__=='__main__':
    fig,axs=plt.subplots(2,4,figsize=(18,7))
    for ax,f in zip(axs.flat,[11,13,14,16,31,33,36,46]):
        m,a,b,md,Cc=frame(f); h=m.vertices@a; top=h.max(); bot=h.min()
        hs=np.arange(bot+0.3,top-0.2,0.25); A=[];W=[]
        for hh in hs:
            s=m.section(plane_origin=a*hh,plane_normal=a)
            if s is None: A.append(0);W.append(0);continue
            tot=0
            u=np.cross(a,[1,0,0]); 
            if np.linalg.norm(u)<.1: u=np.cross(a,[0,1,0])
            u/=np.linalg.norm(u); v=np.cross(a,u)
            for e in s.discrete:
                x=e@u; y=e@v; tot+=abs(0.5*np.sum(x*np.roll(y,-1)-np.roll(x,-1)*y))
            A.append(tot); W.append(0)
        d=top-hs
        ax.plot(d,A,label='area'); ax.axvline(CROWN[f],color='r',ls='--'); ax.set_title(f'{f} len {top-bot:.1f}  tilt vs Z {np.degrees(np.arccos(abs(a[2]))):.0f}°'); ax.grid(alpha=.3)
    plt.savefig('areas.png',dpi=70)
