import json, math, numpy as np
raw=json.load(open('raw_svg.json'))
OL,OA=127.3578804,36.3630166
COS=math.cos(math.radians(OA))
CX,CY,PPM=720.0,750.0,7.05
KX,KY=111.32*COS,110.574   # km per degree

def to_polar(pts):
    p=np.asarray(pts,dtype=float)
    dx=p[:,0]-CX; dy=CY-p[:,1]
    r=np.hypot(dx,dy); th=np.arctan2(dy,dx)
    return r/PPM, th          # minutes, bearing

def to_lonlat(d,th):          # d km along bearing
    return OL + d*np.cos(th)/KX, OA + d*np.sin(th)/KY

# ---------- step 0 : walk/bus-only inverse ----------
def inv_walkbus(m):
    return np.where(m<=13.19*0.81, m/13.19, (m-8.0)/3.3)

DS=np.arange(0.0,30.001,0.02)          # candidate distances (km)
WALK=DS*13.19; BUS=8.0+DS*3.3

def solve(mins, ths, prev=None, stations=None):
    """recover d (km) for each (minutes,bearing) given metro station lon/lat"""
    n=len(mins); out=np.empty(n)
    if stations is None:
        return inv_walkbus(mins)
    slon,slat,sidx=stations
    ride=14.5+1.95*np.abs(sidx-8)                       # 10.5+4+ride
    base=np.minimum(WALK,BUS)                            # (D,)
    for k in range(n):
        lo,la=to_lonlat(DS,ths[k])                       # (D,)
        dxk=(lo[:,None]-slon[None,:])*KX
        dyk=(la[:,None]-slat[None,:])*KY
        sub=(np.hypot(dxk,dyk)*13.19+ride[None,:]).min(axis=1)
        curve=np.minimum(base,sub)                       # (D,)
        err=np.abs(curve-mins[k])
        if prev is not None:
            err=err+0.0008*np.abs(DS-prev[k])            # anchor to previous estimate
        out[k]=DS[int(err.argmin())]
    return out

# ---------- collect every point once ----------
buckets=[]   # (key, index-in-key, pts)
flat=[]
def add(key,pts):
    s=len(flat); flat.extend(pts); buckets.append((key,s,len(pts)))

def walk_geo(obj):
    return [(x,y) for sub in obj for (pts,_c) in sub for (x,y) in pts]

for key in ['city','gu','dong','line1','tram']:
    add(key, walk_geo(raw[key]))
for key in ['line1_st','tram_st','landmarks','gu_labels','dong_labels']:
    add(key, [(x,y) for x,y,_n in raw[key]])

mins,ths=to_polar(flat)
print('points',len(flat),'minutes range %.1f–%.1f'%(mins.min(),mins.max()))

# ---------- iterate ----------
d=inv_walkbus(mins)
st_off=[b for b in buckets if b[0]=='line1_st'][0]
for it in range(4):
    lon,lat=to_lonlat(d,ths)
    s0,sn=st_off[1],st_off[2]
    stations=(lon[s0:s0+sn], lat[s0:s0+sn], np.arange(sn,dtype=float))
    nd=solve(mins,ths,prev=d,stations=stations)
    shift=np.abs(nd-d).max(); d=nd
    print('iter',it,'max shift %.3f km'%shift)
    if shift<0.01: break

lon,lat=to_lonlat(d,ths)
print('lon %.4f–%.4f  lat %.4f–%.4f'%(lon.min(),lon.max(),lat.min(),lat.max()))
np.save('lon.npy',lon); np.save('lat.npy',lat)
json.dump([[k,s,n] for k,s,n in buckets],open('buckets.json','w'))
