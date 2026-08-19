/* =========================================================================
   대전 시간지도 — geo↔time 모프 렌더러

   소요시간은 브라우저에서 계산하지 않는다. data/daejeon.js 에 실린 r5py 통행시간
   행렬(GTFS: TAGO 노선 + 운송사업조합 시간표 + 1호선 + 트램)을 조회할 뿐이다.
   행렬은 출발지 62개 × 도착지 2204개(격자 2142 + 정거장 62)의 uint8 분값이고,
   255 는 CAP 분 안에 닿지 못한다는 뜻이다.
   ========================================================================= */
const D = window.__DAEJEON__;
const KX = 111.32 * Math.cos(36.363 * Math.PI / 180), KY = 110.574;
const km = (a, b, c, d) => Math.hypot((a - c) * KX, (b - d) * KY);
const CAP = D.cap;                          // 시간지도 반경 상한(분) = 행렬의 max_time
const RINGS = [30, 60, 90, 120, 150];
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- 통행시간 행렬 ---------- */
const STRIDE = D.stride, NC = D.nCells;
function unb64(s) {
  const bin = atob(s), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
const TTM = { now: unb64(D.ttm.before), tram: unb64(D.ttm.after) };
const raw = (scen, o, col) => TTM[scen][o * STRIDE + col];
/** 출발지 행 × 도착지 열의 소요시간(분). 미도달(255)은 CAP 으로 접는다. */
const tt = (scen, o, col) => { const v = raw(scen, o, col); return v === 255 ? CAP : v; };

const ALL = D.stations;                     // 1호선 22 + 트램 45, 환승역 5쌍 병합 → 62

/* ---------- 격자 래티스 ----------
   시간지도는 정점마다 각도=실제 방위, 반지름=소요시간으로 찍는다. 소요시간 격자가
   거칠면(붙어 있는 0.5km 셀끼리 최대 56분 차이) 이웃 정점의 반지름이 튀어 경계선이
   접힌다. 그래서 (1) 시간장을 격자 위에서 먼저 평활하고 (2) 모든 지오메트리는 그
   평활된 장을 좌표로만 조회한다. 정점이 "내가 어느 링 소속인지"를 보지 않으므로
   좌표가 같은 정점은 언제나 같은 위치로 간다 = 공유 경계가 갈라지지 않는다. */
const DLON = 0.00556, DLAT = 0.00451;       // 격자 간격(≈0.5km). build_webproto.py 와 맞춘 값
const FIELD_SMOOTH = 20;                    // 시간장 평활 반복수
const FIELD_R = 2;                          // 조회 커널 반경(셀). ±2셀 ≈ ±1km
const SUB = 3;                              // 구 경계 컨투어 세분 배수(≈167m)
let GLON0 = Infinity, GLAT0 = Infinity;
for (const g of D.grid) { if (g[0] < GLON0) GLON0 = g[0]; if (g[1] < GLAT0) GLAT0 = g[1]; }
const lx = lon => Math.round((lon - GLON0) / DLON), ly = lat => Math.round((lat - GLAT0) / DLAT);
const CK = (a, b) => a + ',' + b;
const CELL = new Map();                     // "ix,iy" → 격자 셀 인덱스
D.grid.forEach((g, i) => CELL.set(CK(lx(g[0]), ly(g[1])), i));
const CNB = D.grid.map(g => {
  const a = lx(g[0]), b = ly(g[1]);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => CELL.get(CK(a + dx, b + dy))).filter(j => j !== undefined);
});

const fNow = new Float64Array(NC), fTram = new Float64Array(NC);
const fBuf = new Float64Array(NC);
/** 격자 시간장을 이웃 평균으로 평활한다. 스파이크를 없애야 경계선이 안 접힌다. */
function smoothField(scen, o, out) {
  for (let i = 0; i < NC; i++) out[i] = tt(scen, o, i);
  for (let k = 0; k < FIELD_SMOOTH; k++) {
    for (let i = 0; i < NC; i++) {
      const nb = CNB[i];
      if (!nb.length) { fBuf[i] = out[i]; continue; }
      let s = 0; for (const j of nb) s += out[j];
      fBuf[i] = out[i] * 0.5 + 0.5 * s / nb.length;
    }
    out.set(fBuf);
  }
}
/** 임의 좌표의 소요시간(분). 반경 FIELD_R 셀의 역거리 가중 평균. */
function fieldAt(f, lon, lat) {
  const ix = lx(lon), iy = ly(lat);
  let acc = 0, w = 0;
  for (let dx = -FIELD_R; dx <= FIELD_R; dx++) for (let dy = -FIELD_R; dy <= FIELD_R; dy++) {
    const c = CELL.get(CK(ix + dx, iy + dy)); if (c === undefined) continue;
    const g = D.grid[c];
    const d = Math.hypot((lon - g[0]) * KX, (lat - g[1]) * KY);
    const ww = 1 / (d * d + 0.01);
    acc += f[c] * ww; w += ww;
  }
  return w > 0 ? acc / w : CAP;
}

/* ---------- 구 경계 = 격자 라벨 컨투어 ----------
   원본 구 폴리곤을 정점마다 투영하면, 링마다 따로 매끈하게 만들 수밖에 없어서 공유
   경계가 두 줄로 갈라진다. 대신 세분 격자에 "이 점은 어느 구인가"를 칠하고, 라벨이
   바뀌는 격자 엣지만 뽑는다. 두 구가 맞닿은 곳의 엣지는 하나뿐이라 갈라질 수 없다. */
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function guContours() {
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const k of CELL.keys()) {
    const [a, b] = k.split(',');
    mnx = Math.min(mnx, +a); mxx = Math.max(mxx, +a);
    mny = Math.min(mny, +b); mxy = Math.max(mxy, +b);
  }
  // 링마다 bbox 를 먼저 걸러야 2만 개 노드 × 5링 점-다각형 검사가 느려지지 않는다.
  const BB = D.gu.map(([r]) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, x1, y0, y1];
  });
  const lab = new Map();                    // 세분 노드 "a,b" → 구 인덱스(-1 = 시 밖)
  const hole = new Set();                   // 시 안쪽인데 어느 구에도 안 들어간 노드
  for (let a = mnx * SUB; a <= (mxx + 1) * SUB; a++) for (let b = mny * SUB; b <= (mxy + 1) * SUB; b++) {
    const lon = GLON0 + a * DLON / SUB, lat = GLAT0 + b * DLAT / SUB;
    // 가장 가까운 격자 셀만 보면 안 된다. 0.5km 격자는 시 경계를 거칠게 잘라 낸 것이라
    // 시 안쪽인데도 제 셀이 없는 지점이 생기고, 거기서 구 경계선이 끊긴다. ±1셀까지 본다.
    const ix = lx(lon), iy = ly(lat);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1; dy++)
      if (CELL.has(CK(ix + dx, iy + dy))) { near = true; break; }
    if (!near) continue;
    let l = -1;
    for (let k = 0; k < D.gu.length; k++) {
      const [x0, x1, y0, y1] = BB[k];
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      if (inRing(lon, lat, D.gu[k][0])) { l = k; break; }
    }
    lab.set(CK(a, b), l);
    if (l < 0 && inRing(lon, lat, D.city[0][0])) hole.add(CK(a, b));
  }
  // 구 폴리곤 5개의 합집합이 시 폴리곤을 다 덮지 않는다(OSM 경계를 각각 단순화한 탓).
  // 그 틈이 시 안쪽 4.8km 지점까지 파고들어 거기서 구 경계선이 끊긴다. 이웃 구로 메운다.
  for (let pass = 0; hole.size && pass < 40; pass++) {
    let filled = 0;
    for (const k of [...hole]) {
      const [a, b] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = lab.get(CK(a + dx, b + dy));
        if (m >= 0) { lab.set(k, m); hole.delete(k); filled++; break; }
      }
    }
    if (!filled) break;
  }
  // 라벨이 다른 이웃 사이의 듀얼 엣지. 끝점은 반정수 격자점이라 좌표가 정확히 일치한다.
  const adj = new Map();                    // 코너 "a,b" → 이웃 코너 배열
  const link = (p, q) => {
    if (!adj.has(p)) adj.set(p, []);
    adj.get(p).push(q);
  };
  for (const [k, la] of lab) {
    const [a, b] = k.split(',').map(Number);
    for (const [dx, dy, pa, pb, qa, qb] of [[1, 0, a, b - 1, a, b], [0, 1, a - 1, b, a, b]]) {
      const lb = lab.get(CK(a + dx, b + dy));
      if (lb === undefined || lb === la || la < 0 || lb < 0) continue;
      const p = CK(pa, pb), q = CK(qa, qb);
      link(p, q); link(q, p);
    }
  }
  // 엣지를 이어 폴리라인으로. 갈래가 3개 이상인 삼거리는 거기서 끊는다.
  const used = new Set();
  const eid = (p, q) => p < q ? p + '|' + q : q + '|' + p;
  const xy = k => { const [a, b] = k.split(',').map(Number);
    return [GLON0 + (a + 0.5) * DLON / SUB, GLAT0 + (b + 0.5) * DLAT / SUB]; };
  const walk = start => {
    const chain = [start]; let cur = start;
    for (;;) {
      const nxt = (adj.get(cur) || []).find(n => !used.has(eid(cur, n)));
      if (nxt === undefined) break;
      used.add(eid(cur, nxt)); chain.push(nxt); cur = nxt;
      if (cur === start) break;
    }
    return chain;
  };
  const out = [];
  const keys = [...adj.keys()];
  for (const pass of [1, 2]) for (const k of keys) {           // 1차: 끝점/삼거리에서 시작, 2차: 남은 고리
    const deg = adj.get(k).length;
    if (pass === 1 ? deg === 2 : false) continue;
    while ((adj.get(k) || []).some(n => !used.has(eid(k, n)))) {
      const chain = walk(k);
      if (chain.length > 2) out.push([chain.map(xy), chain[0] === chain[chain.length - 1]]);
    }
  }
  return out;
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

/** 기본 배율. 1 = 라임 지리 대전이 안전영역에 꽉 맞는 크기.
 *  1보다 키우면 지도가 제목·레일 아래로 흘러넘친다. view.s 와 별개라
 *  더블클릭 원위치는 이 배율로 돌아온다. */
const ZOOM0 = 1;

let geoFit = null;
function fitGeo() {
  let mnx = 999, mxx = -999, mny = 99, mxy = -99;
  for (const [pts] of D.city) for (const [x, y] of pts) {
    if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
  }
  const pad = VW >= 821 ? 34 : 18;
  const w = (mxx - mnx) * KX, h = (mxy - mny) * KY;
  const sc = Math.min((BOX.w - 2 * pad) / w, (BOX.h - 2 * pad) / h) * ZOOM0;
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

/* ---------- 지오메트리 평탄화 ----------
   PTS 순서: 시 경계 → 구 라벨 → 정거장 → 구 경계 컨투어. 정거장만 행렬에 자기 열이
   있어 NC + 인덱스로 바로 찾고, 나머지는 전부 평활된 시간장을 좌표로 조회한다. */
const FEAT = [];   // {key, closed, s:start, n:len}
const PTS = [];    // [lon,lat]
function addSet(key, arr) {
  for (const [pts, closed] of arr) {
    FEAT.push({ key, closed, s: PTS.length, n: pts.length });
    for (const p of pts) PTS.push(p);
  }
}
addSet('city', D.city);                       // 노선은 D.routes(정거장 시퀀스)로 그린다
const GU_S = PTS.length;
for (const g of D.guLabels) PTS.push([g.lon, g.lat]);
const NODE_S = PTS.length;
for (const s of ALL) PTS.push([s.lon, s.lat]);
const CONT_S = PTS.length;
addSet('guc', guContours());                  // 구 경계 = 격자 라벨 컨투어
const N = PTS.length;

/* ---------- 상태 ---------- */
let origin = ALL.findIndex(s => s.name === '정부청사역');
if (origin < 0) origin = 0;
let scen = 'tram';                  // 'now' | 'tram'
let mode = 'geo';                   // 'geo' | 'time' | 'diff'
const minsNow = new Float32Array(N), minsTram = new Float32Array(N);
const posGeo = new Float32Array(N * 2), posNow = new Float32Array(N * 2), posTram = new Float32Array(N * 2);
const cur = new Float32Array(N * 2), from = new Float32Array(N * 2), to = new Float32Array(N * 2);
let tw = 1, fromT = 0, toT = 0, curT = 0;   // 모프 진행도 / time-amount
let stats = null, hover = null;
const GN = NC;
const gridXY = new Float32Array(GN * 2);    // 그리드 지리 좌표(모프 없음)
const gridCut = new Float32Array(GN);       // 트램으로 줄어드는 시간(분)

function recompute() {
  const o = ALL[origin];
  // 링별 반지름 평활은 없앴다. 링마다 따로 돌면 두 구가 공유하는 정점이 서로 다른
  // 반지름을 받아 같은 경계가 두 줄로 갈라진다(최대 18px). 대신 격자 시간장을 평활한다.
  smoothField('now', origin, fNow);
  smoothField('tram', origin, fTram);
  for (let i = 0; i < N; i++) {
    if (i >= NODE_S && i < CONT_S) {        // 정거장은 행렬에 자기 열이 있다
      const col = NC + (i - NODE_S);
      minsNow[i] = tt('now', origin, col);
      minsTram[i] = tt('tram', origin, col);
    } else {
      minsNow[i] = fieldAt(fNow, PTS[i][0], PTS[i][1]);
      minsTram[i] = fieldAt(fTram, PTS[i][0], PTS[i][1]);
    }
  }
  RMAX = (Math.min(BOX.w, BOX.h) / 2 - (VW >= 821 ? 30 : 16)) * ZOOM0;
  for (let i = 0; i < N; i++) {
    const g = geoFit(PTS[i]);
    posGeo[i * 2] = g.x; posGeo[i * 2 + 1] = g.y;
    const a = timePos(PTS[i][0], PTS[i][1], minsNow[i], o);
    posNow[i * 2] = a.x; posNow[i * 2 + 1] = a.y;
    const b = timePos(PTS[i][0], PTS[i][1], minsTram[i], o);
    posTram[i * 2] = b.x; posTram[i * 2 + 1] = b.y;
  }
  for (let i = 0; i < GN; i++) {
    const g = geoFit(D.grid[i]); gridXY[i * 2] = g.x; gridXY[i * 2 + 1] = g.y;
    gridCut[i] = Math.max(0, tt('now', origin, i) - tt('tram', origin, i));
  }
  computeStats();
}

const DEST = ['정부청사역', '대전역', '유성온천역', '대전복합터미널', '관저네거리', '진잠네거리'];

function computeStats() {
  let a30n = 0, a30t = 0, a45n = 0, a45t = 0;
  for (let i = 0; i < GN; i++) {
    const c = D.cellKm2[i], n = tt('now', origin, i), t = tt('tram', origin, i);
    if (n <= 30) a30n += c; if (t <= 30) a30t += c;
    if (n <= 45) a45n += c; if (t <= 45) a45t += c;
  }
  const rows = DEST.map(nm => {
    const i = ALL.findIndex(x => x.name === nm);
    return i < 0 ? null
      : { name: nm, now: tt('now', origin, NC + i), tram: tt('tram', origin, NC + i) };
  }).filter(r => r && r.name !== ALL[origin].name).slice(0, 5);
  // 단축 면적은 셀마다 면적이 다르므로 개수 × 상수로 셀 수 없다(경계에 걸친 셀은 작다).
  // 최대 단축은 두 시나리오 모두 CAP 아래인 셀에서만 센다. CAP 에 잘린 셀은 실제
  // 시간이 얼마든 CAP 으로 접히므로, 차이를 그대로 쓰면 없는 단축이 생긴다.
  let cutSum = 0, cutMax = 0, cutCells = 0, cutArea = 0;
  for (let i = 0; i < GN; i++) {
    const v = gridCut[i]; if (v <= 0.6) continue;
    cutCells++; cutSum += v; cutArea += D.cellKm2[i];
    if (v > cutMax && raw('now', origin, i) < CAP && raw('tram', origin, i) < CAP) cutMax = v;
  }
  stats = { a30n, a30t, a45n, a45t, rows,
            cutArea, cutAvg: cutCells ? cutSum / cutCells : 0, cutMax };
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
/* 포스터 A1 최종본(Figma DDA_design 214:3169 "진짜Final") 팔레트 — css/style.css 의 :root 와 같은 값 */
const C = { bg: '#f1f1f1', green: '#076940', green2: '#2e624c', lime: '#cef00a',
            gold: '#e2c414', orange: '#ff7105', orangeDeep: '#8f3a00', ink: '#0b3a26',
            peach: '#f4c29c' };
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

const isTramOnly = s => s.line === '트램';

/** 시 영역 경로. 채우기·클립 양쪽에서 같은 경로를 써야 선이 면 밖으로 안 나간다. */
function pathFrom(src) {
  ctx.beginPath();
  for (const f of FEAT) if (f.key === 'city') {
    for (let j = 0; j < f.n; j++) {
      const i = f.s + j;
      const x = src[i * 2] * view.s + view.x, y = src[i * 2 + 1] * view.s + view.y;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
}
function cityPath() { pathFrom(cur); }

/** 포스터의 출발지 핀(Figma Group 75). 뾰족한 끝이 정거장 좌표에 닿는다. */
const PIN = new Path2D('M61.7422 0C95.8416 0 123.484 27.6428 123.484 61.7422C123.484 74.2828 119.746 85.9501 113.322 95.6904H113.394L62.7578 167.661L12.5596 99.0713C12.1032 98.471 11.6572 97.8624 11.2227 97.2451L10.085 95.6904H10.1621C3.73846 85.9502 0 74.2827 0 61.7422C0 27.6428 27.6428 0 61.7422 0Z');
const PIN_DOT = new Path2D('M61.7448 83.9786C76.5875 83.9786 88.6199 71.9461 88.6199 57.1034C88.6199 42.2607 76.5875 30.2283 61.7448 30.2283C46.902 30.2283 34.8696 42.2607 34.8696 57.1034C34.8696 71.9461 46.902 83.9786 61.7448 83.9786Z');
function drawPin(x, y, h) {
  const k = h / 167.661;
  ctx.save();
  ctx.translate(x - 62.7578 * k, y - 167.661 * k); ctx.scale(k, k);
  ctx.fillStyle = C.green; ctx.fill(PIN);
  ctx.fillStyle = '#fff'; ctx.fill(PIN_DOT);
  ctx.restore();
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  if (mode === 'diff' && tw > .55) { drawDiff(); return; }

  // 1) 라임 = 실제 크기의 대전. 포스터에서 시간지도가 그 위에서 줄어드는 바탕이 된다.
  ctx.fillStyle = C.lime;
  pathFrom(posGeo);
  ctx.fill();

  // 대비 고스트(반대 시나리오)
  if (curT > 0.05) {
    const other = scen === 'tram' ? posNow : posTram;
    ctx.save(); ctx.globalAlpha = curT * .9;
    ctx.strokeStyle = scen === 'tram' ? 'rgba(7,105,64,.5)' : 'rgba(255,113,5,.8)';
    ctx.lineWidth = 1.8; ctx.setLineDash([6, 5]);
    for (const f of FEAT) if (f.key === 'city') { ghostPoly(f, other); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
  }

  // 2) 시간지도 = 라임 위 반투명 오버레이. 트램은 rgba(255,131,36,.4) 라서 포스터의 금색
  //    #e2c414 그대로 나온다. 지리 모드(curT=0)에서는 두 경로가 겹쳐 라임만 남는다.
  ctx.save();
  ctx.globalAlpha = curT;
  ctx.fillStyle = scen === 'tram' ? 'rgba(255,131,36,.4)' : 'rgba(46,98,76,.34)';
  cityPath(); ctx.fill();
  ctx.restore();

  // 구 경계 — 포스터는 시간지도 안쪽에만 살구색 실선을 둔다. 시 영역으로 클립한다.
  // 시 외곽선은 정점 548개(≈365m 간격)를 직선으로 이어 볼록한 구간이 안쪽으로 잘리는데,
  // 167m 간격인 구 경계 컨투어는 그 현(弦) 바깥으로 삐져나온다(워프 후 최대 7.6px).
  ctx.save();
  cityPath(); ctx.clip();
  ctx.strokeStyle = curT > .5 ? C.peach : 'rgba(7,105,64,.42)';
  ctx.globalAlpha = curT > .5 ? curT : 1;
  ctx.lineWidth = 2.4;
  for (const f of FEAT) if (f.key === 'guc') { smoothPath(f); ctx.stroke(); }
  ctx.restore();

  // 3) 시간지도 외곽선 — 포스터의 주황 실선
  ctx.save();
  ctx.globalAlpha = curT;
  ctx.strokeStyle = scen === 'tram' ? C.orange : C.green;
  ctx.lineWidth = 2.4; cityPath(); ctx.stroke();
  ctx.restore();

  // 노선
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.green; ctx.lineWidth = 5.4;
  for (const r of D.routes) if (r.kind === 'm1') { routePath(r); ctx.stroke(); }
  ctx.strokeStyle = scen === 'tram' ? C.orangeDeep : 'rgba(7,105,64,.3)';
  ctx.lineWidth = 5.4;
  for (const r of D.routes) if (r.kind === 'tram') { routePath(r); ctx.stroke(); }

  // 구 이름
  ctx.fillStyle = 'rgba(11,58,38,.62)'; ctx.font = '700 15px Pretendard, sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < D.guLabels.length; i++) { const [x, y] = P(GU_S + i); ctx.fillText(D.guLabels[i].name, x, y); }

  // 정거장
  for (let i = 0; i < ALL.length; i++) {
    const s = ALL[i], [x, y] = P(NODE_S + i);
    if (isTramOnly(s) && scen === 'now') continue;
    if (i === origin) continue;                 // 출발지는 핀으로 그린다
    const isH = hover === i;
    const rr = VW >= 821 ? 3.2 : 4.2;
    ctx.beginPath(); ctx.arc(x, y, isH ? rr + 2.5 : rr, 0, 7);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isTramOnly(s) ? C.orangeDeep : C.green;
    ctx.stroke();
  }

  // 시간 링 (채움 위) — 포스터처럼 초록 점선 + 오른쪽 끝에서 아래로 내린 리더선·라벨
  if (curT > 0.02 && mode !== 'diff') {
    ctx.save(); ctx.globalAlpha = curT * .85;
    const ccx = BOX.cx * view.s + view.x, ccy = BOX.cy * view.s + view.y;
    const baseY = BOX.cy + BOX.h / 2 - 6, x1 = BOX.cx + BOX.w / 2;
    ctx.strokeStyle = 'rgba(7,105,64,.55)'; ctx.lineWidth = 1.1;
    ctx.setLineDash([5, 7]);
    for (const m of RINGS) { const r = radial(m) * view.s;
      ctx.beginPath(); ctx.arc(ccx, ccy, r, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = '700 11.5px Pretendard, sans-serif'; ctx.textAlign = 'center';
    for (const m of RINGS) {
      const x = ccx + radial(m) * view.s;
      if (x > x1 - 14 || x < BOX.cx - BOX.w / 2 || ccy > baseY - 24) continue;
      ctx.strokeStyle = 'rgba(7,105,64,.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, ccy); ctx.lineTo(x, baseY - 14); ctx.stroke();
      ctx.fillStyle = 'rgba(7,105,64,.85)'; ctx.fillText(m + '분', x, baseY);
    }
    ctx.restore();
  }

  // 출발지 핀 — 포스터의 물방울 핀. 텍스트는 좌측 레일 '출발지'가 이미 보여준다.
  const [ox, oy] = P(NODE_S + origin);
  drawPin(ox, oy, VW >= 821 ? 34 : 28);
}

function drawDiff() {
  cityPath();
  ctx.fillStyle = '#e2e5db'; ctx.fill();
  ctx.strokeStyle = 'rgba(7,105,64,.35)'; ctx.lineWidth = 1.4; ctx.stroke();

  const cell = Math.max(3, 5.2 * view.s);
  for (let i = 0; i < GN; i++) {
    const v = gridCut[i]; if (v < 0.6) continue;
    const t = Math.min(1, v / 30);
    ctx.globalAlpha = 0.25 + t * 0.75;
    ctx.fillStyle = t < .34 ? C.lime : t < .67 ? C.gold : C.orange;
    const x = gridXY[i * 2] * view.s + view.x, y = gridXY[i * 2 + 1] * view.s + view.y;
    ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  cityPath(); ctx.clip();
  ctx.strokeStyle = 'rgba(7,105,64,.35)'; ctx.lineWidth = 2.4;
  for (const f of FEAT) if (f.key === 'guc') { poly(f); ctx.stroke(); }
  ctx.restore();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(7,105,64,.4)'; ctx.lineWidth = 4.2;
  for (const r of D.routes) if (r.kind === 'm1') { routePath(r); ctx.stroke(); }
  ctx.strokeStyle = C.green2; ctx.lineWidth = 5.1;
  for (const r of D.routes) if (r.kind === 'tram') { routePath(r); ctx.stroke(); }

  for (let i = 0; i < ALL.length; i++) {
    if (!isTramOnly(ALL[i])) continue;
    const [x, y] = P(NODE_S + i);
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.green2; ctx.lineWidth = 1.5; ctx.stroke();
  }
  const [ox, oy] = P(NODE_S + origin);
  ctx.beginPath(); ctx.arc(ox, oy, 8, 0, 7); ctx.fillStyle = C.orange; ctx.fill();
  ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = '800 14px Pretendard, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = C.green;
  ctx.fillText(ALL[origin].name, ox + 13, oy - 8);
  ctx.fillStyle = 'rgba(11,58,38,.62)'; ctx.font = '700 15px Pretendard, sans-serif'; ctx.textAlign = 'center';
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
    if (isTramOnly(ALL[i]) && scen === 'now') continue;
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
    const s = ALL[h];
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
  if (drag && moved < 5) { const h = pick(drag.x, drag.y); if (h >= 0) setOrigin(h); }
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

function setOrigin(i) {
  origin = i; recompute();
  document.getElementById('originName').textContent = ALL[i].name;
  document.getElementById('originLine').textContent = ALL[i].line;
  document.getElementById('originPick').value = String(i);
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
    scen === 'tram' ? '라임 = 실제 크기 대전 · 금색 = 트램 후 시간지도 · 점선 = 현재'
                    : '라임 = 실제 크기 대전 · 올리브 = 현재 시간지도 · 점선 = 트램 후';
  tweenTo(mode === 'diff' ? 'geo' : mode, scen);
  if (window.innerWidth < 821) document.body.dataset.sheet = '0';
}));
document.getElementById('originPick').addEventListener('change', e => {
  setOrigin(Number(e.target.value));
});

(function initPicker() {
  const sel = document.getElementById('originPick');
  // 환승역은 두 노선 어디에도 중복해 넣지 않고 자기 그룹을 갖는다.
  for (const [label, line] of [['도시철도 1호선', '1호선'],
                               ['1호선 · 트램 환승', '1호선·트램'],
                               ['트램 2호선 정거장', '트램']]) {
    const g = document.createElement('optgroup'); g.label = label;
    ALL.forEach((s, i) => { if (s.line === line) g.appendChild(new Option(s.name, i)); });
    if (g.childElementCount) sel.appendChild(g);
  }
  sel.value = String(origin);
})();

const sheetBtn = document.getElementById('sheetBtn');
sheetBtn && sheetBtn.addEventListener('click', () => { document.body.dataset.sheet = '1'; });
const sheetClose = document.getElementById('sheetClose');
sheetClose && sheetClose.addEventListener('click', () => { document.body.dataset.sheet = '0'; });
addEventListener('orientationchange', () => setTimeout(resize, 220));
document.body.dataset.sheet = '0';

resize();
document.getElementById('originName').textContent = ALL[origin].name;
document.getElementById('originLine').textContent = ALL[origin].line;
document.body.dataset.scen = scen;
requestAnimationFrame(step);
document.body.dataset.view = 'geo';
setTimeout(() => document.querySelector('[data-mode="tram"]').click(), 900);
