import pickle, json, sys
from multiprocessing import Pool
from build import build, T
def job(f):
    try:
        fin,crown,info=build(f)
        pickle.dump((fin.vertices,fin.faces,info),open(f'crown_{f}.pkl','wb'))
        return {k:(float(v) if hasattr(v,'item') or isinstance(v,float) else v) for k,v in info.items() if k not in('Pcut','Rm')}
    except Exception as e: return {'fdi':f,'error':repr(e)}
if __name__=='__main__':
    with Pool(4) as p: res=p.map(job,sorted(T))
    json.dump(res,open('report.json','w'),indent=1)
    for r in res: print(r)
