/* app.js 를 최소 DOM 스텁 위에서 실제로 실행해 런타임 오류를 잡는다 */
import fs from 'node:fs';
const html=fs.readFileSync('/sessions/jolly-ecstatic-volta/mnt/DDA/대전_시간지도.html','utf8');
const [,dataJs]=html.match(/<script>(window\.__DAEJEON__[\s\S]*?)<\/script>/);
const appJs=fs.readFileSync("app.js","utf8");
const calls=[];
const el=(id)=>({id,textContent:'',innerHTML:'',dataset:{},style:{},classList:{add(){},remove(){}},
  hidden:false,value:'',appendChild(){},append(){},addEventListener(t,f){calls.push([id,t,f]);},
  getBoundingClientRect:()=>({left:0,top:0}),clientWidth:1440,clientHeight:900,width:0,height:0,
  setPointerCapture(){},
  getContext:()=>new Proxy({},{get:(t,k)=>k==='canvas'?{}:(()=>{})})});
const store=new Map();
const g=globalThis;
g.window=g; g.devicePixelRatio=2;
g.document={ getElementById:id=>store.get(id)??(store.set(id,el(id)),store.get(id)),
  querySelector:s=>el(s), querySelectorAll:s=>[el(s+'#a'),el(s+'#b'),el(s+'#c'),el(s+'#d')],
  createElement:()=>el('new'), body:el('body') };
g.Option=function(a,b){return {a,b};};
g.addEventListener=()=>{}; g.requestAnimationFrame=()=>{}; g.setTimeout=(f)=>{};
new Function(dataJs)();
try{ new Function(appJs)(); console.log('✔ 초기 실행 성공'); }
catch(e){ console.log('✘ 런타임 오류:',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n')); process.exit(1); }
// 모드 버튼 핸들러 실행
const modeHandlers=calls.filter(c=>c[0].startsWith('[data-mode]')).map(c=>c[2]);
console.log('mode handlers bound:',modeHandlers.length);
for(const [id,type,fn] of calls){
  if(type!=='click') continue;
  for(const v of ['geo','now','tram','diff']){
    try{ fn.call({dataset:{mode:v},classList:{add(){},remove(){}}}); }
    catch(e){ console.log('✘ 모드',v,'오류:',e.message); process.exit(1);} }
}
console.log('✔ 지리/현재/트램후/단축 모드 전환 모두 통과');
