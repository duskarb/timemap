import fs from 'node:fs';
const D=JSON.parse(fs.readFileSync('daejeon.json','utf8'));
const KX=111.32*Math.cos(36.363*Math.PI/180),KY=110.574;
const km=(a,b,c,d)=>Math.hypot((a-c)*KX,(b-d)*KY);
const WALK=D.walkMinPerKm,BUSB=D.bus.base,BUSK=D.bus.minPerKm;
const ALL=[...D.metro,...D.tram]; const byId=new Map(ALL.map(s=>[s.id,s]));
function adj(useTram){const m=new Map();for(const[a,b,w,k]of D.edges){if(!useTram&&k!=='m1')continue;
 if(!m.has(a))m.set(a,[]);if(!m.has(b))m.set(b,[]);m.get(a).push([b,w]);m.get(b).push([a,w]);}return m;}
const ADJ={now:adj(false),tram:adj(true)};
function arriveTimes(o,scen){const use=scen==='tram';const dist=new Map();const heap=[];
 const push=(id,d)=>{heap.push([d,id]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;
  if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
 for(const s of ALL){if(!use&&s.line==='트램')continue;const d=km(o.lon,o.lat,s.lon,s.lat);
  const access=Math.min(d*WALK,BUSB+d*BUSK);const wait=s.line==='트램'?D.headway.tram/2:D.headway.m1/2;
  const t=access+wait;if(t<75){dist.set(s.id,t);push(s.id,t);}}
 const A=ADJ[scen];
 while(heap.length){const top=heap[0];const last=heap.pop();
  if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;
   if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;
   if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}
  const[d,id]=top;if(d>(dist.get(id)??Infinity))continue;
  for(const[to,w]of A.get(id)??[]){const nd=d+w;if(nd<(dist.get(to)??Infinity)){dist.set(to,nd);push(to,nd);}}}
 return dist;}
function makeModel(o,arrive){const st=[];for(const[id,t]of arrive){const s=byId.get(id);st.push([s.lon,s.lat,t]);}
 return(lon,lat)=>{const d=km(o.lon,o.lat,lon,lat);let best=Math.min(d*WALK,BUSB+d*BUSK);
  for(const[x,y,t]of st){if(t>=best)continue;const e=km(x,y,lon,lat)*WALK;if(t+e<best)best=t+e;}return best;};}

function report(name){
  const o=ALL.find(s=>s.name===name);
  const mn=makeModel(o,arriveTimes(o,'now')), mt=makeModel(o,arriveTimes(o,'tram'));
  let a30n=0,a30t=0,a45n=0,a45t=0;const c=D.cellKm2;
  for(const[lo,la]of D.grid){const n=mn(lo,la),t=mt(lo,la);
    if(n<=30)a30n+=c;if(t<=30)a30t+=c;if(n<=45)a45n+=c;if(t<=45)a45t+=c;}
  console.log(`\n== 출발 ${name} ==`);
  console.log(` 30분 도달면적  ${a30n.toFixed(0)} → ${a30t.toFixed(0)} km²  (${((a30t/a30n-1)*100).toFixed(0)}%)`);
  console.log(` 45분 도달면적  ${a45n.toFixed(0)} → ${a45t.toFixed(0)} km²`);
  for(const d of['관저','대전역','유성온천','대전복합터미널','서대전역','진잠네거리','연축']){
    const s=ALL.find(x=>x.name===d);if(!s)continue;
    console.log(`  ${d.padEnd(9)} ${mn(s.lon,s.lat).toFixed(0).padStart(3)}분 → ${mt(s.lon,s.lat).toFixed(0).padStart(3)}분`);
  }
}
report('정부청사'); report('관저'); report('대전역');
// 포스터 검증: 관저동↔둔산동(정부청사)
const g=ALL.find(s=>s.name==='관저'), t=ALL.find(s=>s.name==='정부청사'&&s.line==='트램');
const mn=makeModel(g,arriveTimes(g,'now')),mt=makeModel(g,arriveTimes(g,'tram'));
console.log(`\n포스터 기준 관저 → 정부청사 : 현재 ${mn(t.lon,t.lat).toFixed(1)}분 → 트램 후 ${mt(t.lon,t.lat).toFixed(1)}분  (단축 ${(mn(t.lon,t.lat)-mt(t.lon,t.lat)).toFixed(1)}분)`);
