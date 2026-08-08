import json, math, numpy as np
lon=np.load('lon.npy'); lat=np.load('lat.npy')
B={k:(s,n) for k,s,n in json.load(open('buckets.json'))}; raw=json.load(open('raw_svg.json'))
KX,KY=111.32*math.cos(math.radians(36.363)),110.574
def km(a,b,c,d): return math.hypot((a-c)*KX,(b-d)*KY)

def polylines(key):
    s,_=B[key]; i=s; out=[]
    for sub in raw[key]:
        for pts,closed in sub:
            k=len(pts); out.append(([[round(float(lon[i+j]),5),round(float(lat[i+j]),5)] for j in range(k)],closed)); i+=k
    return out

def simplify(pl,tol_km):
    out=[]
    for pts,closed in pl:
        if len(pts)<3: 
            if len(pts)>1: out.append((pts,closed))
            continue
        kept=[pts[0]]
        for p in pts[1:-1]:
            if km(p[0],p[1],kept[-1][0],kept[-1][1])>=tol_km: kept.append(p)
        kept.append(pts[-1])
        if len(kept)>=2: out.append((kept,closed))
    return out

city=simplify(polylines('city'),0.25)
gu  =simplify(polylines('gu'),0.35)
l1  =simplify(polylines('line1'),0.12)
tram=simplify(polylines('tram'),0.12)
print('city',sum(len(p) for p,_ in city),'gu',sum(len(p) for p,_ in gu),
      'l1',sum(len(p) for p,_ in l1),'tram',sum(len(p) for p,_ in tram))

# ---------- stations ----------
MO=['반석','지족','노은','월드컵경기장','현충원','구암','유성온천','갑천','월평','갈마','정부청사',
    '시청','탄방','용문','오룡','서대전네거리','중구청','중앙로','대전역','대동','신흥','판암']
s,n=B['line1_st']
metro=[{'id':i,'name':MO[i],'line':'1호선','lon':round(float(lon[s+i]),5),'lat':round(float(lat[s+i]),5)} for i in range(n)]
s,n=B['tram_st']
tst=[]
for i in range(n):
    code,nm=raw['tram_st'][i][2].replace('tram-stop-','').split('-',1)
    tst.append({'id':100+i,'name':nm,'code':int(code),'line':'트램','lon':round(float(lon[s+i]),5),'lat':round(float(lat[s+i]),5)})
byCode={t['code']:t for t in tst}

# ---------- edges ----------
V_TRAM, V_M1 = 22.06, 33.5     # km/h 표정속도 (트램: 대전시 기본계획 / 1호선: 20.5km 36.7분)
edges=[]
FACT={}
def link(a,b,v,kind):
    d=km(a['lon'],a['lat'],b['lon'],b['lat'])*FACT.get(kind,1.0)
    edges.append([a['id'],b['id'],round(d/v*60,3),kind])

raw_m1=sum(km(metro[i]['lon'],metro[i]['lat'],metro[i+1]['lon'],metro[i+1]['lat']) for i in range(len(metro)-1))
FACT['m1']=20.5/raw_m1                       # 직선합 → 실제 노선연장 20.5km 보정
for i in range(len(metro)-1): link(metro[i],metro[i+1],V_M1,'m1')
main=[byCode[c] for c in range(201,241)]
raw_tr=sum(km(main[i]['lon'],main[i]['lat'],main[(i+1)%40]['lon'],main[(i+1)%40]['lat']) for i in range(40))
FACT['tram']=33.9/raw_tr                     # 직선합 → 본선 33.9km 보정
print('직선합 %.1fkm → 보정계수 %.3f, 순환 1주 %.0f분'%(raw_tr,FACT['tram'],33.9/V_TRAM*60))
for i in range(len(main)-1): link(main[i],main[i+1],V_TRAM,'tram')
link(main[-1],main[0],V_TRAM,'tram')                       # 유천 → 서대전역 (순환 폐합)
yj=[byCode[212]]+[byCode[c] for c in (241,242,243,244)]    # 연축지선
for i in range(len(yj)-1): link(yj[i],yj[i+1],V_TRAM,'tram')
jj=[byCode[233],byCode[245]]                               # 진잠지선
link(jj[0],jj[1],V_TRAM,'tram')
print('tram edge min/max', round(min(e[2] for e in edges if e[3]=='tram'),2), round(max(e[2] for e in edges if e[3]=='tram'),2))
loop=sum(e[2] for e in edges if e[3]=='tram' and e[0]<e[1] or False)


# transfers: metro <-> tram within 700 m
TR=[]
for m in metro:
    for t in tst:
        d=km(m['lon'],m['lat'],t['lon'],t['lat'])
        if d<0.45: TR.append([m['id'],t['id'],round(2.0+d*13.19,2),'xfer'])
print('transfers',len(TR))
for a,b,c,k in TR:
    print('   환승', next(x['name'] for x in metro if x['id']==a),'↔',next(x['name'] for x in tst if x['id']==b), c,'분')
edges+=TR

# ---------- 30분 도달권 계산용 그리드 ----------
def inside(px,py,rings):
    ins=False
    for pts,_ in rings:
        c=False
        for i in range(len(pts)):
            x1,y1=pts[i]; x2,y2=pts[i-1]
            if (y1>py)!=(y2>py) and px < (x2-x1)*(py-y1)/((y2-y1) or 1e-12)+x1: c=not c
        if c: ins=not ins
    return ins
cityRings=polylines('city')
STEP=0.005   # ~0.45 km lat
grid=[]
la=lat.min()
while la<=lat.max():
    lo=lon.min()
    while lo<=lon.max():
        if inside(lo,la,cityRings): grid.append([round(lo,4),round(la,4)])
        lo+=STEP/math.cos(math.radians(36.363))*0.9
    la+=STEP
cell=(STEP*KY)*(STEP/math.cos(math.radians(36.363))*0.9*KX)
print('grid',len(grid),'cell %.4f km2 → total %.0f km2'%(cell,len(grid)*cell))

out={'origin':{'lon':127.3578804,'lat':36.3630166,'label':'유성구 어은동'},
     'city':city,'gu':gu,'line1':l1,'tramline':tram,
     'metro':metro,'tram':tst,'edges':edges,
     'landmarks':[{'name':raw['landmarks'][i][2],'lon':round(float(lon[B['landmarks'][0]+i]),5),'lat':round(float(lat[B['landmarks'][0]+i]),5)} for i in range(B['landmarks'][1])],
     'guLabels':[{'name':raw['gu_labels'][i][2],'lon':round(float(lon[B['gu_labels'][0]+i]),5),'lat':round(float(lat[B['gu_labels'][0]+i]),5)} for i in range(B['gu_labels'][1])],
     'grid':grid,'cellKm2':round(cell,5),
     'speeds':{'tram':V_TRAM,'m1':V_M1},'walkMinPerKm':13.19,'bus':{'base':8.0,'minPerKm':3.3},'headway':{'tram':7.5,'m1':8.0}}
json.dump(out,open('daejeon.json','w'),ensure_ascii=False,separators=(',',':'))
import os;print('json %.0f KB'%(os.path.getsize('daejeon.json')/1024))
