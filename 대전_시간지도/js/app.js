/* =========================================================================
   대전 시간지도 — time map 프로젝트(Dijkstra + geo↔time 모프)를 대전 트램에 적용
   ========================================================================= */
const D = window.__DAEJEON__;
const KX = 111.32 * Math.cos(36.363 * Math.PI / 180), KY = 110.574;
const km = (a, b, c, d) => Math.hypot((a - c) * KX, (b - d) * KY);
const DET = 1.3;                                  // 직선거리 → 실제 경로 우회계수
const WALK = D.walkMinPerKm * DET;                // 도보 4.55km/h
const busMin = d => 10 + d * DET * 3.75 + (d > 5 ? 7 : 0);  // 접근4+대기6 · 16km/h · 5km↑ 환승 7분
const CAP = 90;                                   // 시간지도 반경 상한(분)
const RINGS = [15, 30, 45, 60, 75];
let useBus = true;
const access = d => useBus ? Math.min(d * WALK, busMin(d)) : d * WALK;
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- 정거장 · 그래프 ---------- */
const ALL = [...D.metro, ...D.tram];
const byId = new Map(ALL.map(s => [s.id, s]));
function adj(useTram) {
  const m = new Map();
  for (const [a, b, w, k] of D.edges) {
    if (!useTram && k !== 'm1') continue;
    if (!m.has(a)) m.set(a, []); if (!m.has(b)) m.set(b, []);
    m.get(a).push([b, w]); m.get(b).push([a, w]);
  }
  return m;
}
const ADJ = { now: adj(false), tram: adj(true) };

/** 출발점(lon,lat)에서 모든 정거장까지의 도착시각(분). 다중 시드 다익스트라. */
function arriveTimes(o, scen) {
  const use = scen === 'tram';
  const dist = new Map(); const heap = [];
  const push = (id, d) => { heap.push([d, id]); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  for (const s of ALL) {
    if (!use && s.line === '트램') continue;
    const d = km(o.lon, o.lat, s.lon, s.lat);
    if (d > 12) continue;
    const wait = s.line === '트램' ? D.headway.tram / 2 : D.headway.m1 / 2;
    const t = access(d) + wait;
    if (t < 100) { dist.set(s.id, t); push(s.id, t); }
  }
  const A = ADJ[scen];
  while (heap.length) {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
    const [d, id] = top;
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const [to, w] of A.get(id) ?? []) {
      const nd = d + w;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); push(to, nd); }
    }
  }
  return dist;
}

/** 임의 지점까지의 소요시간(분) = min(도보, 버스, 철도+하차도보) */
function makeModel(o, arrive) {
  const st = [];
  for (const [id, t] of arrive) { const s = byId.get(id); st.push([s.lon, s.lat, t]); }
  return (lon, lat) => {
    const d = km(o.lon, o.lat, lon, lat);
    let best = access(d);
    for (let i = 0; i < st.length; i++) {
      const t = st[i][2]; if (t >= best) continue;
      const e = km(st[i][0], st[i][1], lon, lat) * WALK;
      if (t + e < best) best = t + e;
    }
    return best;
  };
}

/* ---------- 좌표계 ---------- */
const cvs = document.getElementById('stage'), ctx = cvs.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
let view = { s: 1, x: 0, y: 0 };

/** 좌·우 레일과 하단 컨트롤을 뺀 지도 안전영역. 지도는 항상 이 박스 중앙에 놓인다. */
let BOX = { cx: 0, cy: 0, w: 0, h: 0 };
function layout() {
  const wide = VW >= 1241, mid = VW >= 821;
  const L = mid ? (wide ? 420 : 320) : 12;
  const R = mid ? (wide ? 372 : 300) : 12;
  const T = mid ? 40 : 128;
  const B = mid ? 40 : 138;
  const x0 = L, x1 = VW - R, y0 = T, y1 = VH - B;
  BOX = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(160, x1 - x0), h: Math.max(160, y1 - y0) };
}

let geoFit = null;
function fitGeo() {
  let mnx = 999, mxx = -999, mny = 99, mxy = -99;
  for (const [pts] of D.city) for (const [x, y] of pts) {
    if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
  }
  const pad = VW >= 821 ? 34 : 18;
  const w = (mxx - mnx) * KX, h = (mxy - mny) * KY;
  const sc = Math.min((BOX.w - 2 * pad) / w, (BOX.h - 2 * pad) / h);
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
  geoFit = p => ({ x: BOX.cx + (p[0] - cx) * KX * sc, y: BOX.cy - (p[1] - cy) * KY * sc });
}

/** 반경 스케일: 선형이면 가까운 정거장이 중심에 뭉쳐 노선이 쭈그러든다.
 *  0.68제곱으로 안쪽을 펴 준다(원본 time map 프로젝트의 sqrt 스케일과 같은 취지). */
const POW = 0.68;
let RMAX = 300;
const radial = m => RMAX * Math.pow(Math.min(m, CAP) / CAP, POW);
function timePos(lon, lat, minutes, o) {
  const dx = (lon - o.lon) * KX, dy = (lat - o.lat) * KY;
  const th = Math.atan2(dy, dx), r = radial(minutes);
  return { x: BOX.cx + r * Math.cos(th), y: BOX.cy - r * Math.sin(th) };
}

/* ---------- 지오메트리 평탄화 ---------- */
const FEAT = [];   // {key, closed, idx:[start,len]}
const PTS = [];    // [lon,lat]
function addSet(key, arr) {
  for (const [pts, closed] of arr) {
    FEAT.push({ key, closed, s: PTS.length, n: pts.length });
    for (const p of pts) PTS.push(p);
  }
}
addSet('city', D.city); addSet('gu', D.gu);   // 노선은 ROUTES(정거장 시퀀스)로 그린다
const NODE_S = PTS.length;
for (const s of ALL) PTS.push([s.lon, s.lat]);
const LM_S = PTS.length;
for (const l of D.landmarks) PTS.push([l.lon, l.lat]);
const GU_S = PTS.length;
for (const g of D.guLabels) PTS.push([g.lon, g.lat]);
const N = PTS.length;

/* ---------- 노선 = 정거장 시퀀스 ----------
   OSM 폴리라인을 정점마다 따로 왜곡하면 시간지도에서 방위가 튀어 지그재그가 생긴다.
   노선을 '정거장을 순서대로 잇는 곡선'으로 다시 정의하면 어떤 왜곡에서도 매끄럽다.
   (미세한 선형은 잃지만 정거장 위치·순서·연결은 정확하다) */
const TI = new Map(D.tram.map((t, i) => [t.code, 22 + i]));   // 트램 코드 → ALL 인덱스
const ROUTES = [
  { kind: 'm1',   closed: false, idx: D.metro.map((_, i) => i) },
  { kind: 'tram', closed: true,  idx: Array.from({ length: 40 }, (_, i) => TI.get(201 + i)) },
  { kind: 'tram', closed: false, idx: [TI.get(212), TI.get(241), TI.get(242), TI.get(243), TI.get(244)] },
  { kind: 'tram', closed: false, idx: [TI.get(233), TI.get(245)] },
].map(r => ({ ...r, idx: r.idx.filter(v => v !== undefined) }));

/* ---------- 상태 ---------- */
let origin = D.metro.find(s => s.name === '정부청사') || D.metro[10];
let scen = 'tram';                  // 'now' | 'tram'
let mode = 'geo';                   // 'geo' | 'time' | 'diff'
let model = { now: null, tram: null }, arrive = { now: null, tram: null };
const minsNow = new Float32Array(N), minsTram = new Float32Array(N);
const posGeo = new Float32Array(N * 2), posNow = new Float32Array(N * 2), posTram = new Float32Array(N * 2);
const cur = new Float32Array(N * 2), from = new Float32Array(N * 2), to = new Float32Array(N * 2);
let tw = 1, fromT = 0, toT = 0, curT = 0;   // 모프 진행도 / time-amount
let stats = null, hover = null;
const GN = D.grid.length;
const gridXY = new Float32Array(GN * 2);    // 그리드 지리 좌표(모프 없음)
const gridCut = new Float32Array(GN);       // 트램으로 줄어드는 시간(분)

/** 시간지도에서 경계선의 반지름만 순환 평활화한다. 각도(실제 방위)는 건드리지 않는다. */
function smoothRadius(pos) {
  for (const f of FEAT) {
    if (f.key !== 'city' && f.key !== 'gu') continue;
    const n = f.n; if (n < 6) continue;
    const th = new Float64Array(n), r = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const dx = pos[(f.s + j) * 2] - BOX.cx, dy = BOX.cy - pos[(f.s + j) * 2 + 1];
      r[j] = Math.hypot(dx, dy); th[j] = Math.atan2(dy, dx);
    }
    const t = new Float64Array(n);
    for (let it = 0; it < 6; it++) {
      for (let j = 0; j < n; j++) {
        const a = f.closed ? (j - 1 + n) % n : Math.max(0, j - 1);
        const b = f.closed ? (j + 1) % n : Math.min(n - 1, j + 1);
        t[j] = r[j] * 0.5 + (r[a] + r[b]) * 0.25;
      }
      r.set(t);
    }
    for (let j = 0; j < n; j++) {
      pos[(f.s + j) * 2] = BOX.cx + r[j] * Math.cos(th[j]);
      pos[(f.s + j) * 2 + 1] = BOX.cy - r[j] * Math.sin(th[j]);
    }
  }
}

function recompute() {
  for (const k of ['now', 'tram']) {
    arrive[k] = arriveTimes(origin, k);
    model[k] = makeModel(origin, arrive[k]);
  }
  for (let i = 0; i < N; i++) {
    minsNow[i] = model.now(PTS[i][0], PTS[i][1]);
    minsTram[i] = model.tram(PTS[i][0], PTS[i][1]);
  }
  RMAX = Math.min(BOX.w, BOX.h) / 2 - (VW >= 821 ? 30 : 16);
  for (let i = 0; i < N; i++) {
    const g = geoFit(PTS[i]);
    posGeo[i * 2] = g.x; posGeo[i * 2 + 1] = g.y;
    const a = timePos(PTS[i][0], PTS[i][1], minsNow[i], origin);
    posNow[i * 2] = a.x; posNow[i * 2 + 1] = a.y;
    const b = timePos(PTS[i][0], PTS[i][1], minsTram[i], origin);
    posTram[i * 2] = b.x; posTram[i * 2 + 1] = b.y;
  }
  smoothRadius(posNow); smoothRadius(posTram);
  for (let i = 0; i < GN; i++) {
    const [lo, la] = D.grid[i];
    const g = geoFit([lo, la]); gridXY[i * 2] = g.x; gridXY[i * 2 + 1] = g.y;
    const a = model.now(lo, la), b = model.tram(lo, la);
    gridCut[i] = Math.max(0, a - b);
  }
  computeStats();
}

function computeStats() {
  const c = D.cellKm2; let a30n = 0, a30t = 0, a45n = 0, a45t = 0;
  for (const [lo, la] of D.grid) {
    const n = model.now(lo, la), t = model.tram(lo, la);
    if (n <= 30) a30n += c; if (t <= 30) a30t += c;
    if (n <= 45) a45n += c; if (t <= 45) a45t += c;
  }
  const dest = ['정부청사', '대전역', '유성온천', '대전복합터미널', '관저', '진잠네거리'];
  const rows = dest.map(nm => {
    const s = ALL.find(x => x.name === nm) || ALL.find(x => x.name.startsWith(nm));
    return { name: nm, now: model.now(s.lon, s.lat), tram: model.tram(s.lon, s.lat) };
  }).filter(r => r.name !== origin.name).slice(0, 5);
  let cutSum = 0, cutMax = 0, cutCells = 0;
  for (let i = 0; i < GN; i++) { const v = gridCut[i];
    if (v > 0.6) { cutCells++; cutSum += v; if (v > cutMax) cutMax = v; } }
  stats = { a30n, a30t, a45n, a45t, rows,
            cutArea: cutCells * D.cellKm2, cutAvg: cutCells ? cutSum / cutCells : 0, cutMax };
  paintStats();
}

/* ---------- 트윈 ---------- */
function target(m, sc) {
  return (m === 'geo' || m === 'diff') ? posGeo : (sc === 'tram' ? posTram : posNow);
}
function tweenTo(m, sc) {
  const t = target(m, sc);
  from.set(tw >= 1 ? (curReady ? cur : posGeo) : cur);
  to.set(t); fromT = curT; toT = (m === 'geo' || m === 'diff') ? 0 : 1; tw = 0;
}
let curReady = false;
function settle() { const t = target(mode, scen); cur.set(t); from.set(t); to.set(t); tw = 1;
  curT = toT = fromT = (mode === 'geo' || mode === 'diff') ? 0 : 1; curReady = true; }

/* ---------- 렌더 ---------- */
const C = { bg: '#ececec', green: '#2e624c', lime: '#c7ff00', orange: '#ff8324', ink: '#1b3b2f' };
const P = (i) => [cur[i * 2] * view.s + view.x, cur[i * 2 + 1] * view.s + view.y];

function poly(f) {
  ctx.beginPath();
  for (let j = 0; j < f.n; j++) { const [x, y] = P(f.s + j); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  if (f.closed) ctx.closePath();
}
/** 중점 통과 2차 베지에 — 경계선의 미세한 각을 없앤다. */
function smoothPath(f) {
  const n = f.n; ctx.beginPath();
  if (n < 3) { poly(f); return; }
  let [qx, qy] = P(f.s + 1);
  const [sx, sy] = P(f.s); ctx.moveTo(sx, sy);
  for (let j = 1; j < n - 1; j++) {
    const [nx, ny] = P(f.s + j + 1);
    ctx.quadraticCurveTo(qx, qy, (qx + nx) / 2, (qy + ny) / 2);
    qx = nx; qy = ny;
  }
  ctx.lineTo(qx, qy);
  if (f.closed) ctx.closePath();
}

/** Catmull-Rom 스플라인으로 정거장을 잇는다(장력 0.5). 어떤 왜곡에서도 꺾이지 않는다. */
function routePath(r) {
  const idx = r.idx, m = idx.length; if (m < 2) return;
  const pt = i => {
    const k = r.closed ? (i + m) % m : Math.max(0, Math.min(m - 1, i));
    return P(NODE_S + idx[k]);
  };
  ctx.beginPath();
  const [x0, y0] = pt(0); ctx.moveTo(x0, y0);
  const last = r.closed ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const [p0x, p0y] = pt(i - 1), [p1x, p1y] = pt(i), [p2x, p2y] = pt(i + 1), [p3x, p3y] = pt(i + 2);
    ctx.bezierCurveTo(
      p1x + (p2x - p0x) / 6, p1y + (p2y - p0y) / 6,
      p2x - (p3x - p1x) / 6, p2y - (p3y - p1y) / 6,
      p2x, p2y);
  }
  if (r.closed) ctx.closePath();
}
function ghostPoly(f, src) {
  ctx.beginPath();
  for (let j = 0; j < f.n; j++) {
    const i = f.s + j;
    const gx = src[i * 2] * curT + posGeo[i * 2] * (1 - curT);
    const gy = src[i * 2 + 1] * curT + posGeo[i * 2 + 1] * (1 - curT);
    const x = gx * view.s + view.x, y = gy * view.s + view.y;
    j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  if (f.closed) ctx.closePath();
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  if (mode === 'diff' && tw > .55) { drawDiff(); return; }

  // 대비 고스트(반대 시나리오)
  if (curT > 0.05) {
    const other = scen === 'tram' ? posNow : posTram;
    ctx.save(); ctx.globalAlpha = curT * .95;
    ctx.strokeStyle = scen === 'tram' ? 'rgba(46,98,76,.55)' : 'rgba(255,131,36,.85)';
    ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    for (const f of FEAT) if (f.key === 'city') { ghostPoly(f, other); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
  }

  // 시 영역
  ctx.fillStyle = scen === 'tram' ? C.orange : C.lime;
  ctx.globalAlpha = curT > .05 ? .92 : 1;
  ctx.beginPath();
  for (const f of FEAT) if (f.key === 'city') {
    for (let j = 0; j < f.n; j++) { const [x, y] = P(f.s + j); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = scen === 'tram' ? 'rgba(46,98,76,.55)' : 'rgba(46,98,76,.45)';
  ctx.lineWidth = 1.6; ctx.stroke();

  // 구 경계
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.4;
  for (const f of FEAT) if (f.key === 'gu') { smoothPath(f); ctx.stroke(); }

  // 노선
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.green; ctx.lineWidth = 3.6;
  for (const r of ROUTES) if (r.kind === 'm1') { routePath(r); ctx.stroke(); }
  ctx.strokeStyle = scen === 'tram' ? '#7a2f00' : 'rgba(46,98,76,.3)';
  ctx.lineWidth = 3.6;
  for (const r of ROUTES) if (r.kind === 'tram') { routePath(r); ctx.stroke(); }

  // 구 이름
  ctx.fillStyle = 'rgba(27,59,47,.55)'; ctx.font = '700 13px Pretendard, sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < D.guLabels.length; i++) { const [x, y] = P(GU_S + i); ctx.fillText(D.guLabels[i].name, x, y); }

  // 정거장
  for (let i = 0; i < ALL.length; i++) {
    const s = ALL[i], [x, y] = P(NODE_S + i);
    const isTram = s.line === '트램';
    if (isTram && scen === 'now') continue;
    const isO = s.id === origin.id, isH = hover === i;
    const rr = VW >= 821 ? 3.6 : 4.4;
    ctx.beginPath(); ctx.arc(x, y, isO ? rr + 4.5 : isH ? rr + 2.5 : rr, 0, 7);
    ctx.fillStyle = isO ? C.orange : (isTram ? '#fff' : '#fff');
    ctx.fill();
    ctx.lineWidth = isO ? 3 : 1.6;
    ctx.strokeStyle = isO ? C.green : (isTram ? '#7a2f00' : C.green);
    ctx.stroke();
  }

  // 랜드마크
  ctx.fillStyle = C.ink; ctx.font = '600 11.5px Pretendard, sans-serif';
  for (let i = 0; i < D.landmarks.length; i++) {
    const [x, y] = P(LM_S + i);
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillText(D.landmarks[i].name, x + 7, y + 4);
  }

  // 시간 링 (채움 위)
  if (curT > 0.02 && mode !== 'diff') {
    ctx.save(); ctx.globalAlpha = curT * .8;
    const ccx = BOX.cx * view.s + view.x, ccy = BOX.cy * view.s + view.y;
    ctx.strokeStyle = 'rgba(27,59,47,.42)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.1;
    for (const m of RINGS) { const r = radial(m) * view.s;
      ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = '700 11.5px Pretendard, sans-serif'; ctx.textAlign = 'center';
    for (const m of RINGS) {
      const y = ccy - radial(m) * view.s;
      ctx.fillStyle = 'rgba(236,236,236,.86)';
      ctx.fillRect(ccx - 21, y - 13, 42, 15);
      ctx.fillStyle = 'rgba(27,59,47,.75)'; ctx.fillText(m + '분', ccx, y - 2);
    }
    ctx.restore();
  }

  // 출발지 라벨
  const [ox, oy] = P(NODE_S + ALL.indexOf(origin));
  ctx.font = '800 14px Pretendard, sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = C.green; ctx.fillText(origin.name, ox + 13, oy - 8);
}

function drawDiff() {
  ctx.beginPath();
  for (const f of FEAT) if (f.key === 'city') {
    for (let j = 0; j < f.n; j++) { const [x, y] = P(f.s + j); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
  }
  ctx.fillStyle = '#e2e5db'; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(46,98,76,.35)'; ctx.lineWidth = 1.4; ctx.stroke();

  const cell = Math.max(3, 5.2 * view.s);
  for (let i = 0; i < GN; i++) {
    const v = gridCut[i]; if (v < 0.6) continue;
    const t = Math.min(1, v / 30);
    ctx.globalAlpha = 0.25 + t * 0.75;
    ctx.fillStyle = t < .34 ? '#c7ff00' : t < .67 ? '#ffb43a' : '#ff6a00';
    const x = gridXY[i * 2] * view.s + view.x, y = gridXY[i * 2 + 1] * view.s + view.y;
    ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2;
  for (const f of FEAT) if (f.key === 'gu') { poly(f); ctx.stroke(); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(46,98,76,.4)'; ctx.lineWidth = 2.8;
  for (const r of ROUTES) if (r.kind === 'm1') { routePath(r); ctx.stroke(); }
  ctx.strokeStyle = '#2e624c'; ctx.lineWidth = 3.4;
  for (const r of ROUTES) if (r.kind === 'tram') { routePath(r); ctx.stroke(); }

  for (let i = 0; i < ALL.length; i++) {
    const s = ALL[i]; if (s.line !== '트램') continue;
    const [x, y] = P(NODE_S + i);
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#2e624c'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  const [ox, oy] = P(NODE_S + ALL.indexOf(origin));
  ctx.beginPath(); ctx.arc(ox, oy, 8, 0, 7); ctx.fillStyle = C.orange; ctx.fill();
  ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = '800 14px Pretendard, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = C.green;
  ctx.fillText(origin.name, ox + 13, oy - 8);
  ctx.fillStyle = 'rgba(27,59,47,.55)'; ctx.font = '700 13px Pretendard, sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < D.guLabels.length; i++) { const [x, y] = P(GU_S + i); ctx.fillText(D.guLabels[i].name, x, y); }
}

function step() {
  if (tw < 1) {
    tw = Math.min(1, tw + 16 / 1400);
    const e = easeInOut(tw);
    for (let i = 0; i < N * 2; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
    curT = fromT + (toT - fromT) * e;
    curReady = true;
  }
  draw();
  requestAnimationFrame(step);
}

/* ---------- 리사이즈 ---------- */
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  VW = cvs.clientWidth; VH = cvs.clientHeight;
  cvs.width = Math.round(VW * DPR); cvs.height = Math.round(VH * DPR);
  layout(); fitGeo(); recompute(); settle();
}
addEventListener('resize', resize);

/* ---------- 인터랙션 ---------- */
const tip = document.getElementById('tip');
let drag = null, moved = 0;
const rel = e => { const r = cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function pick(px, py) {
  const HIT = VW >= 821 ? 16 : 22; let best = -1, bd = HIT * HIT;
  for (let i = 0; i < ALL.length; i++) {
    if (ALL[i].line === '트램' && scen === 'now') continue;
    const [x, y] = P(NODE_S + i); const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
cvs.addEventListener('pointerdown', e => { cvs.setPointerCapture(e.pointerId); drag = rel(e); moved = 0; });
cvs.addEventListener('pointermove', e => {
  const p = rel(e);
  if (drag) { view.x += p.x - drag.x; view.y += p.y - drag.y; moved += Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y); drag = p; tip.hidden = true; return; }
  const h = pick(p.x, p.y); hover = h < 0 ? null : h;
  cvs.style.cursor = h < 0 ? 'grab' : 'pointer';
  if (h >= 0) {
    const s = ALL[h], mn = scen === 'tram' ? minsTram[NODE_S + h] : minsNow[NODE_S + h];
    const a = minsNow[NODE_S + h], b = minsTram[NODE_S + h];
    const fm = v => v >= CAP ? CAP + '분+' : Math.round(v) + '분';
    tip.innerHTML = `<b>${s.name}</b><span>${s.line}</span>
      <span class="t">현재 <em>${fm(a)}</em> · 트램 후 <em class="o">${fm(b)}</em></span>`;
    tip.hidden = false;
    const tw2 = tip.offsetWidth / 2 + 8;
    tip.style.left = Math.max(tw2, Math.min(innerWidth - tw2, e.clientX)) + 'px';
    tip.style.top = Math.max(52, e.clientY) + 'px';
  } else tip.hidden = true;
});
function up(e) {
  if (drag && moved < 5) { const h = pick(drag.x, drag.y); if (h >= 0) setOrigin(ALL[h]); }
  drag = null; cvs.style.cursor = 'grab';
}
cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
cvs.addEventListener('pointerleave', () => { if (!drag) { tip.hidden = true; hover = null; } });
cvs.addEventListener('wheel', e => {
  e.preventDefault(); const p = rel(e); const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const ns = Math.max(.5, Math.min(6, view.s * f)); const k = ns / view.s;
  view.x = p.x - (p.x - view.x) * k; view.y = p.y - (p.y - view.y) * k; view.s = ns;
}, { passive: false });
cvs.addEventListener('dblclick', () => { view = { s: 1, x: 0, y: 0 }; });

function setOrigin(s) {
  origin = s; recompute();
  document.getElementById('originName').textContent = s.name;
  document.getElementById('originLine').textContent = s.line;
  if (mode === 'time') tweenTo('time', scen); else settle();
}

/* ---------- UI ---------- */
function paintStats() {
  if (!stats) return;
  const f = v => v.toFixed(0);
  document.getElementById('a30n').textContent = f(stats.a30n);
  document.getElementById('a30t').textContent = f(stats.a30t);
  const gain = stats.a30n > 0 ? (stats.a30t / stats.a30n - 1) * 100 : 0;
  document.getElementById('a30g').textContent = (gain >= 0 ? '+' : '') + gain.toFixed(0) + '%';
  document.getElementById('a45n').textContent = f(stats.a45n);
  document.getElementById('a45t').textContent = f(stats.a45t);
  document.getElementById('cutArea').textContent = f(stats.cutArea);
  document.getElementById('cutMax').textContent = stats.cutMax.toFixed(0);
  document.getElementById('odBody').innerHTML = stats.rows.map(r => {
    const d = r.now - r.tram;
    const fm = v => v >= CAP ? CAP + '분+' : Math.round(v) + '분';
    return `<tr><td>${r.name}</td><td>${fm(r.now)}</td>
      <td class="o">${fm(r.tram)}</td>
      <td class="${d > 0.5 ? 'cut' : 'flat'}">${d > 0.5 ? '−' + Math.round(d) + '분' : '—'}</td></tr>`;
  }).join('');
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const v = b.dataset.mode;
  if (v === 'geo' || v === 'diff') mode = v; else { mode = 'time'; scen = v; }
  document.body.dataset.scen = scen;
  document.body.dataset.view = mode;
  document.getElementById('ghostNote').textContent =
    mode === 'geo' ? '지리 지도 — 실제 거리 그대로' :
    mode === 'diff' ? '트램으로 줄어드는 시간 — 진할수록 많이 줄어듭니다' :
    scen === 'tram' ? '점선 = 현재 시간지도 · 면 = 트램 후' : '점선 = 트램 후 시간지도 · 면 = 현재';
  tweenTo(mode === 'diff' ? 'geo' : mode, scen);
  if (window.innerWidth < 821) document.body.dataset.sheet = '0';
}));
document.getElementById('originPick').addEventListener('change', e => {
  const s = ALL.find(x => String(x.id) === e.target.value); if (s) setOrigin(s);
});

(function initPicker() {
  const sel = document.getElementById('originPick');
  const g1 = document.createElement('optgroup'); g1.label = '도시철도 1호선';
  for (const s of D.metro) g1.appendChild(new Option(s.name, s.id));
  const g2 = document.createElement('optgroup'); g2.label = '트램 2호선 정거장';
  for (const s of D.tram) g2.appendChild(new Option(s.name, s.id));
  sel.append(g1, g2); sel.value = String(origin.id);
})();

const sheetBtn = document.getElementById('sheetBtn');
sheetBtn && sheetBtn.addEventListener('click', () => { document.body.dataset.sheet = '1'; });
const sheetClose = document.getElementById('sheetClose');
sheetClose && sheetClose.addEventListener('click', () => { document.body.dataset.sheet = '0'; });
addEventListener('orientationchange', () => setTimeout(resize, 220));
document.body.dataset.sheet = '0';

resize();
document.getElementById('originName').textContent = origin.name;
document.getElementById('originLine').textContent = origin.line;
document.body.dataset.scen = scen;
requestAnimationFrame(step);
document.body.dataset.view = 'geo';
setTimeout(() => document.querySelector('[data-mode="tram"]').click(), 900);
