/* =========================================================================
   대전 시간지도 — time map 프로젝트(Dijkstra + geo↔time 모프)를 대전 트램에 적용
   ========================================================================= */
const D = window.__DAEJEON__;
const KX = 111.32 * Math.cos(36.363 * Math.PI / 180), KY = 110.574;
const km = (a, b, c, d) => Math.hypot((a - c) * KX, (b - d) * KY);
const DET = 1.3;                                  // 직선거리 → 실제 경로 우회계수
const WALK = D.walkMinPerKm * DET;                // 도보 4.55km/h
const busMin = d => 10 + d * DET * 3.75 + (d > 5 ? 7 : 0);  // 접근4+대기6 · 16km/h · 5km↑ 환승 7분
const CAP = 150;   // 시간지도 반경 상한(분). 전 출발지 기준 시 경계 최대치가 135.6분이라 포화되지 않는다.
                   // (포화되면 외곽이 현재·트램 후 모두 같은 반지름에 붙어 축소가 가려진다)
const RINGS = [30, 60, 90];
const access = d => Math.min(d * WALK, busMin(d));
/** 철도 하차 후 목적지까지. 도보 또는 연계버스(환승도보 2분 + 대기 3분 + 16km/h).
 *  이걸 도보로만 두면 역세권 밖에서는 철도가 영원히 열세라 시간지도가 노선에 반응하지 않는다. */
const egress = e => Math.min(e * WALK, 5 + e * DET * 3.75);
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

/** 임의 지점까지의 소요시간(분) = min(도보, 버스, 철도 + 하차 후 도보/연계버스) */
function makeModel(o, arrive) {
  const st = [];
  for (const [id, t] of arrive) { const s = byId.get(id); st.push([s.lon, s.lat, t]); }
  return (lon, lat) => {
    const d = km(o.lon, o.lat, lon, lat);
    let best = access(d);
    for (let i = 0; i < st.length; i++) {
      const t = st[i][2]; if (t >= best) continue;
      const e = egress(km(st[i][0], st[i][1], lon, lat));
      if (t + e < best) best = t + e;
    }
    return best;
  };
}

/* ---------- 좌표계 ---------- */
const cvs = document.getElementById('stage'), ctx = cvs.getContext('2d');
const mapTransform = document.getElementById('mapTransform');
const districtCurrent = document.getElementById('districtCurrent');
const districtActive = document.getElementById('districtActive');
const cityCurrentFill = document.getElementById('cityCurrentFill');
const cityActiveFill = document.getElementById('cityActiveFill');
const districtBoundary = document.getElementById('districtBoundary');
const timeRings = document.getElementById('timeRings');
const routeLines = document.getElementById('routeLines');
const stationMarks = document.getElementById('stationMarks');
const originPinMark = document.getElementById('originPinMark');
const SVG_NS = 'http://www.w3.org/2000/svg';
let VW = 0, VH = 0, DPR = 1;
let view = { s: 1, x: 0, y: 0 };
let zoomTarget = { ...view }, zoomAnim = null, zoomTimer = 0;

/** 첫 화면의 약 70%를 지도 그래픽이 차지하는 포스터형 무대.
 *  레일 사이의 남은 칸에 지도를 가두지 않고, 제목 뒤에서 우측 지표 직전까지 크게 흘린다. */
let BOX = { cx: 0, cy: 0, w: 0, h: 0 };
function layout() {
  const wide = VW >= 1241, mid = VW >= 821;
  const x0 = mid ? (wide ? VW * .08 : VW * .12) : 8;
  const x1 = mid ? (wide ? VW - 350 : VW - 245) : VW - 8;
  const y0 = mid ? -VH * .08 : 104;
  const y1 = mid ? VH * 1.08 : VH - 116;
  BOX = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(160, x1 - x0), h: Math.max(160, y1 - y0) };
}

let geoFit = null;
function fitGeo() {
  let mnx = 999, mxx = -999, mny = 99, mxy = -99;
  for (const [pts] of D.city) for (const [x, y] of pts) {
    if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
  }
  const pad = VW >= 821 ? 10 : 8;
  const w = (mxx - mnx) * KX, h = (mxy - mny) * KY;
  const sc = Math.min((BOX.w - 2 * pad) / w, (BOX.h - 2 * pad) / h) * GEO_FILL;
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
  geoFit = p => ({ x: BOX.cx + (p[0] - cx) * KX * sc, y: BOX.cy - (p[1] - cy) * KY * sc });
  GEO_SC = sc;                                     // px per km — 단축시간 격자 셀 크기에 쓴다
  CUT_BASE = Math.max(1.6, Math.min(3.6, w * sc * CUT_RATIO));   // 구 경계 기준 굵기
  GEO_AREA = CITY_KM2 * sc * sc;                   // 지리 지도로 그려진 대전의 픽셀 면적
  BOXR = Math.min(BOX.w - 2 * pad, BOX.h - 2 * pad) / 2;   // 시간지도가 쓸 수 있는 반지름 예산
}

/** 반경 스케일 = 분 × 고정 축척(선형).
 *  두 단계의 '줄어드는 정도'를 의도한 대로 벌린다.
 *   · 지리 → 현재 시간지도 : 약하게. 현재 시간지도 면적을 지리 지도 면적의 NOW_VS_GEO 로 맞춘다.
 *   · 현재 → 트램 후       : 세게. 두 시간지도가 같은 축척을 쓰므로 면적비 = 실제 시간비의 제곱.
 *  선형(제곱 1.0)이라 화면에 그려진 면적비가 곧 오른쪽 카드의 숫자다. */
const POW = 1;
/* 시간지도 블롭은 출발지에서 멀리 뻗어 길쭉하다. 반지름 예산 안에 다 넣으면 면적이
   지리 지도의 55~70%밖에 안 돼, 지리→현재 단계가 현재→트램 단계보다 커져 버린다.
   그래서 지리 지도를 안전영역의 84%까지 키우되 첫 단계의 면적비는 유지한다. */
const GEO_FILL = 0.98;
const NOW_VS_GEO = 0.88;  // 현재 시간지도 면적 ÷ 지리 지도 면적
let GEO_AREA = 1, GEO_SC = 20, BOXR = 300, RMAX = 300, RFILL = 260, TREF = 90;
/* 구 경계 굵기. 화면 픽셀로 고정하면 창 크기와 확대율이 바뀔 때마다 지도만 커져 선이
   가늘어 보이므로, 기준값을 지도 폭에서 뽑고 확대에는 역 마커처럼 완만하게만 따라간다.
   비율은 포스터 원본(지도 폭의 0.78%)을 그대로 쓰지 않는다. 포스터는 지도가 판면 안에
   들어오지만 여기서는 화면 밖까지 흘려 보내기 때문에, 같은 비율이면 5.9px가 나와
   트램 노선(5.2px)보다 굵어진다. 구 경계는 바탕이지 주인공이 아니므로 지하철 노선(2.2px)
   바로 위, 트램 노선의 절반쯤에 둔다. */
const CUT_RATIO = .0034;
let CUT_BASE = 2.6;
const radial = m => Math.min(RMAX, RFILL * Math.pow(Math.min(m, CAP) / TREF, POW));
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
addSet('city', D.city);
addSet('gu', D.gu);

/* 각 구의 전체 외곽선을 모두 그리면 서로 조금씩 어긋난 공유 경계가 두세 줄로 보인다.
   지리 좌표에서 서로 220m 안에 있는 공유 변만 골라 한쪽 구의 선으로 합친다. */
const GU_FEAT = FEAT.filter(f => f.key === 'gu');
function pointSegmentKm(p, a, b) {
  const px = p[0] * KX, py = p[1] * KY;
  const ax = a[0] * KX, ay = a[1] * KY, bx = b[0] * KX, by = b[1] * KY;
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function sharedRuns(a, b) {
  const mark = new Array(a.n).fill(false);
  for (let k = 0; k < a.n; k++) {
    const p = PTS[a.s + k], q = PTS[a.s + (k + 1) % a.n];
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let nearest = Infinity;
    for (let j = 0; j < b.n; j++) {
      nearest = Math.min(nearest, pointSegmentKm(mid, PTS[b.s + j], PTS[b.s + (j + 1) % b.n]));
    }
    mark[k] = nearest < .22;
  }
  // 좌표 정밀도 차이로 한두 변만 빠진 틈은 공유 경계 안에서 닫아 끊김을 없앤다.
  for (let pass = 0; pass < 2; pass++) {
    const fill = [];
    for (let k = 0; k < a.n; k++) {
      if (!mark[k] && mark[(k - 1 + a.n) % a.n] && mark[(k + 1) % a.n]) fill.push(k);
    }
    for (const k of fill) mark[k] = true;
  }
  const runs = [];
  let start = mark.findIndex((v, k) => v && !mark[(k - 1 + a.n) % a.n]);
  if (start < 0) return runs;
  let walked = 0, k = start;
  while (walked < a.n) {
    if (!mark[k]) { k = (k + 1) % a.n; walked++; continue; }
    const run = [a.s + k];
    while (walked < a.n && mark[k]) {
      run.push(a.s + (k + 1) % a.n);
      k = (k + 1) % a.n; walked++;
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}
const GU_CUTS = [];
for (let i = 0; i < GU_FEAT.length; i++) {
  for (let j = i + 1; j < GU_FEAT.length; j++) GU_CUTS.push(...sharedRuns(GU_FEAT[i], GU_FEAT[j]));
}

/* 출력용 구 경계. 공유 변은 구 '쌍'마다 따로 뽑히기 때문에 세 구가 만나는 지점마다
   토막이 난다. 그대로 그리면 지도 한복판에 20px짜리 동강이 떠 있게 된다.
   그래서 ① 끝점이 맞닿는 토막을 가장 곧게 이어지는 짝끼리 잇고 ② 그러고도 남는
   짧은 조각만 버린 뒤 ③ 70m 수준으로만 단순화한다. 원본 포스터의 구 경계는 매끈한
   곡선이 아니라 행정 경계 특유의 잔 굴곡을 가진 '잘린 자국'이라, 세게 펴면 흰 국수가 된다. */
function geoPoint(i) { return [PTS[i][0] * KX, PTS[i][1] * KY]; }
function pointSegSq(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
  const dx = p[0] - (a[0] + vx * t), dy = p[1] - (a[1] + vy * t);
  return dx * dx + dy * dy;
}
function simplifyIndexRun(run, tolerance) {
  if (run.length < 3) return run.slice();
  const keep = new Uint8Array(run.length); keep[0] = keep[run.length - 1] = 1;
  const stack = [[0, run.length - 1]], tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop(); const pa = geoPoint(run[a]), pb = geoPoint(run[b]);
    let far = -1, farD = tol2;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegSq(geoPoint(run[i]), pa, pb);
      if (d > farD) { farD = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return run.filter((_, i) => keep[i]);
}
function runKm(run) {
  let d = 0;
  for (let i = 1; i < run.length; i++) {
    const a = geoPoint(run[i - 1]), b = geoPoint(run[i]);
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}
/** 조각의 한쪽 끝에서 바깥(조각 몸통 반대편)을 향하는 단위 벡터 */
function tipDir(run, atHead) {
  const n = run.length;
  const a = geoPoint(run[atHead ? 0 : n - 1]);
  const b = geoPoint(run[atHead ? Math.min(2, n - 1) : Math.max(0, n - 3)]);
  const dx = a[0] - b[0], dy = a[1] - b[1], L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
}
/** 끝점이 joinKm 안에서 만나는 토막을 잇는다. 삼거리에서는 가장 곧게 이어지는 쪽을 고르고,
 *  꺾여 들어오는 세 번째 가지는 잇지 않고 남겨 T자로 맞닿게 둔다. */
function chainCuts(runs, joinKm) {
  const used = new Array(runs.length).fill(false), out = [];
  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain = runs[i].slice();
    for (const atHead of [false, true]) {
      for (;;) {
        const tip = geoPoint(chain[atHead ? 0 : chain.length - 1]), u = tipDir(chain, atHead);
        let best = -1, bestHead = false, bestCos = 0;   // 90°를 넘겨 되꺾이는 연결은 만들지 않는다
        for (let j = 0; j < runs.length; j++) {
          if (used[j]) continue;
          for (const candHead of [true, false]) {
            const q = geoPoint(runs[j][candHead ? 0 : runs[j].length - 1]);
            if (Math.hypot(q[0] - tip[0], q[1] - tip[1]) > joinKm) continue;
            const v = tipDir(runs[j], candHead);
            const cos = -(u[0] * v[0] + u[1] * v[1]);
            if (cos > bestCos) { bestCos = cos; best = j; bestHead = candHead; }
          }
        }
        if (best < 0) break;
        used[best] = true;
        // 이어붙일 쪽의 이음매 꼭짓점은 버린다(체인 쪽 것과 겹쳐 미세한 꺾임을 만든다).
        const add = bestHead ? runs[best].slice(1) : runs[best].slice(0, -1).reverse();
        chain = atHead ? add.reverse().concat(chain) : chain.concat(add);
      }
    }
    out.push(chain);
  }
  return out;
}
/* 5개 구를 나누는 경계는 쌍으로 따지면 정확히 7개다(유성↔서 18.3km · 유성↔대덕 12.0km ·
   서↔중 9.9km · 서↔대덕 3.2km · 중↔동 22.4km · 중↔대덕 1.15km · 동↔대덕 19.1km).
   하나라도 빠지면 두 구가 붙어 버리므로 길이로 거르는 문턱은 220m 근접 판정이 만들어 낼 수
   있는 부스러기만 걸러 낼 만큼(0.3km)만 둔다 — 실제 경계 중 가장 짧은 것도 그 네 배다. */
const GU_DRAW = chainCuts(GU_CUTS, .6)
  .filter(run => runKm(run) >= .3)
  .map(run => simplifyIndexRun(run, .07));

/** 대전 시역의 실제 면적(km²) — 신발끈. 지리 지도와 시간지도의 면적을 맞출 때 쓴다. */
const CITY_KM2 = (() => {
  let s = 0;
  for (const [pts] of D.city) for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    s += (a[0] * KX) * (b[1] * KY) - (b[0] * KX) * (a[1] * KY);
  }
  return Math.abs(s) / 2;
})();
const NODE_S = PTS.length;
for (const s of ALL) PTS.push([s.lon, s.lat]);
const N = PTS.length;

/* ---------- 출력 노선 ----------
   시간 왜곡에서 OSM의 촘촘한 정점을 그대로 변환하면 선이 톱니처럼 꺾인다.
   정거장 순서만 유지한 중심형 SVG 곡선으로 노선의 시각적 연속성을 우선한다. */
const TI = new Map(D.tram.map((t, i) => [t.code, D.metro.length + i]));
const ROUTES = [
  { kind: 'm1', closed: false, idx: D.metro.map((_, i) => i) },
  { kind: 'tram', closed: true, idx: Array.from({ length: 40 }, (_, i) => TI.get(201 + i)) },
  { kind: 'tram', closed: false, idx: [TI.get(212), TI.get(241), TI.get(242), TI.get(243), TI.get(244)] },
  { kind: 'tram', closed: false, idx: [TI.get(233), TI.get(245)] },
].map(r => ({ ...r, idx: r.idx.filter(v => v !== undefined) }));

/* ---------- 상태 ---------- */
/* 기본 출발지는 트램이 실제로 격차를 메우는 곳으로 둔다(관저동 — 현재 철도 없음).
   1호선 역에서 출발하면 트램 전후 차이가 3~5%라 '줄어드는 도시'가 보이지 않는다. */
let origin = ALL.find(s => s.name === '관저네거리') || D.metro.find(s => s.name === '정부청사') || D.metro[10];
let scen = 'tram';                  // 'now' | 'tram'
let mode = 'time';                  // 'geo' | 'time' | 'diff'
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
    for (let it = 0; it < 4; it++) {
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

/** 분→px 축척을 '현재' 시나리오 하나로 고정한다. 트램 후 지도는 같은 축척으로 그리므로
 *  크기 차이가 곧 시간 단축이다. 축척은 두 조건 중 빡빡한 쪽을 따른다.
 *    (a) 현재 시간지도 면적 = 지리 지도 면적 × NOW_VS_GEO  ← 보통 이쪽이 잡힌다
 *    (b) 시간지도 외곽(p99)이 반지름 예산 안에 들어올 것    ← 넘칠 때만 잡힌다 */
const CITY_IDX = [];
for (const f of FEAT) if (f.key === 'city') for (let j = 0; j < f.n; j++) CITY_IDX.push(f.s + j);
function calibrate() {
  const v = CITY_IDX.map(i => minsNow[i]).sort((a, b) => a - b);
  TREF = Math.max(30, Math.min(CAP, v[Math.floor(v.length * 0.99)] || CAP));
  RFILL = 1; RMAX = Infinity;                       // 단위 축척으로 시간지도 면적을 먼저 잰다
  const unit = tmAreaPx(minsNow);
  const kArea = Math.sqrt(NOW_VS_GEO * GEO_AREA / Math.max(unit, 1e-9));
  const kFit = BOXR / Math.pow(Math.min(v[v.length - 1], CAP) / TREF, POW);
  RFILL = Math.min(kArea, kFit);
  RMAX = BOXR;
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
  calibrate();
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

/** 화면에 그려지는 시간지도(시 경계선)의 픽셀 면적 — 극좌표 신발끈.
 *  r 은 실제로 찍히는 radial(분), θ 는 실제 방위. 그래서 이 값의 비 = 눈에 보이는 면적비다. */
function tmAreaPx(mins) {
  let sum = 0;
  for (const f of FEAT) {
    if (f.key !== 'city') continue;
    for (let j = 0; j < f.n; j++) {
      const a = f.s + j, b = f.s + (j + 1) % f.n;
      const t1 = Math.atan2((PTS[a][1] - origin.lat) * KY, (PTS[a][0] - origin.lon) * KX);
      const t2 = Math.atan2((PTS[b][1] - origin.lat) * KY, (PTS[b][0] - origin.lon) * KX);
      let dt = t2 - t1;
      while (dt > Math.PI) dt -= 2 * Math.PI;
      while (dt < -Math.PI) dt += 2 * Math.PI;
      sum += 0.5 * radial(mins[a]) * radial(mins[b]) * Math.sin(dt);
    }
  }
  return Math.abs(sum);
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
  const areaNow = tmAreaPx(minsNow);
  const shrink = 1 - tmAreaPx(minsTram) / areaNow;
  const geoStep = 1 - areaNow / GEO_AREA;   // 지리 → 현재 단계의 축소(설계상 NOW_VS_GEO)
  stats = { a30n, a30t, a45n, a45t, rows, shrink, geoStep,
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
/* Figma 214:3170의 지도 토큰. 임의 보간색을 만들지 않고 이 다섯 값만 조합한다. */
const C = {
  bg: '#ececec', green: '#076940', lime: '#cef00a',
  orange: '#ff8324', orangeEdge: '#ff7105', ink: '#076940',
  currentFill: 'rgba(206,240,10,.62)', currentEdge: 'rgba(7,105,64,.22)',
  tramFill: 'rgba(255,131,36,.4)', quietGreen: 'rgba(7,105,64,.24)',
};
/* 지형 좌표만 지도 zoom을 따른다. 글자·선·점선·마커는 1/view.s로 역보정해
   어떤 확대 단계에서도 사용자가 보는 화면 픽셀 크기를 동일하게 유지한다. */
const P = (i) => [cur[i * 2], cur[i * 2 + 1]];
const screenP = (i) => [cur[i * 2] * view.s + view.x, cur[i * 2 + 1] * view.s + view.y];
const SZ = n => n / view.s;
const mapFont = (weight, size) => `${weight} ${size / view.s}px Pretendard, sans-serif`;
/* 역 마커는 지형과 완전히 같은 비율로 폭증시키지 않고, 줌에 따라 완만하게 반응한다.
   화면상 0.78×~1.85× 범위라 확대감은 느껴지면서도 역이 지도를 덮지 않는다. */
const markerScale = () => Math.max(.78, Math.min(1.85, Math.pow(view.s, .46)));
const MK = n => n * markerScale() / view.s;
/** 구 경계의 화면 굵기(non-scaling-stroke 라 화면 px 그대로 넣는다) */
const cutWidth = () => CUT_BASE * Math.max(.92, Math.min(2.1, Math.pow(view.s, .5)));

/** 정보 텍스트는 외곽선이나 배경판 없이 단색으로만 그린다. */
function mapText(text, x, y, color) {
  ctx.fillStyle = color || C.ink; ctx.fillText(text, x, y);
}

/** 최종 그래픽용 곡선 정제. 촘촘한 GIS 꼭짓점을 직접 잇지 않고 중점 기반 곡선으로 재보간한다. */
function traceSmoothRun(run, at) {
  if (!run.length) return;
  const points = run.map(at);
  if (points.length === 1) { ctx.moveTo(points[0][0], points[0][1]); return; }
  ctx.moveTo(points[0][0], points[0][1]);
  for (let j = 1; j < points.length - 1; j++) {
    const p = points[j], n = points[j + 1];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
  }
  const end = points[points.length - 1]; ctx.lineTo(end[0], end[1]);
}
function traceSmoothFeature(f, at) {
  if (f.n < 3) return traceSmoothRun(Array.from({ length: f.n }, (_, j) => f.s + j), at);
  const first = at(f.s), last = at(f.s + f.n - 1);
  ctx.moveTo((first[0] + last[0]) / 2, (first[1] + last[1]) / 2);
  for (let j = 0; j < f.n; j++) {
    const p = at(f.s + j), n = at(f.s + (j + 1) % f.n);
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
  }
  ctx.closePath();
}
function cityPath(src = null) {
  ctx.beginPath();
  for (const f of FEAT) if (f.key === 'city') {
    traceSmoothFeature(f, i => src ? ghostAt(i, src) : P(i));
  }
}

/** 중심형 Catmull-Rom을 제한된 cubic SVG 패스로 변환한다.
 *  균일 스플라인의 급커브 오버슈트와 고리 현상을 막아 인쇄용 선처럼 안정적으로 잇는다.
 *  꼭짓점을 '지나가는' 곡선이라, 단순화가 살려 둔 실제 꺾임이 그대로 남는다. */
function curveD(pts, closed) {
  const m = pts.length; if (m < 2) return '';
  const pt = i => pts[closed ? (i + m) % m : Math.max(0, Math.min(m - 1, i))];
  const [x0, y0] = pt(0); let d = `M${x0.toFixed(2)} ${y0.toFixed(2)}`;
  const last = closed ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const [p0x, p0y] = pt(i - 1), [p1x, p1y] = pt(i), [p2x, p2y] = pt(i + 1), [p3x, p3y] = pt(i + 2);
    const d01 = Math.sqrt(Math.max(.001, Math.hypot(p1x - p0x, p1y - p0y)));
    const d12 = Math.sqrt(Math.max(.001, Math.hypot(p2x - p1x, p2y - p1y)));
    const d23 = Math.sqrt(Math.max(.001, Math.hypot(p3x - p2x, p3y - p2y)));
    const seg = Math.max(.001, Math.hypot(p2x - p1x, p2y - p1y));
    let t1x = (p2x - p0x) * d12 / Math.max(.001, d01 + d12) / 3;
    let t1y = (p2y - p0y) * d12 / Math.max(.001, d01 + d12) / 3;
    let t2x = (p3x - p1x) * d12 / Math.max(.001, d12 + d23) / 3;
    let t2y = (p3y - p1y) * d12 / Math.max(.001, d12 + d23) / 3;
    const cap = seg * .38;
    const l1 = Math.hypot(t1x, t1y), l2 = Math.hypot(t2x, t2y);
    if (l1 > cap) { t1x *= cap / l1; t1y *= cap / l1; }
    if (l2 > cap) { t2x *= cap / l2; t2y *= cap / l2; }
    d += `C${(p1x + t1x).toFixed(2)} ${(p1y + t1y).toFixed(2)} ${(p2x - t2x).toFixed(2)} ${(p2y - t2y).toFixed(2)} ${p2x.toFixed(2)} ${p2y.toFixed(2)}`;
  }
  return closed ? d + 'Z' : d;
}
function routePathD(r) { return curveD(r.idx.map(i => P(NODE_S + i)), r.closed); }
/** 반대 시나리오의 한 조각. beginPath 는 호출자가 한다(여러 조각을 모아 evenodd 로 채우려고). */
function ghostSub(f, src) {
  traceSmoothFeature(f, i => ghostAt(i, src));
}
const ghostAt = (i, src) => [
  src[i * 2] * curT + posGeo[i * 2] * (1 - curT),
  src[i * 2 + 1] * curT + posGeo[i * 2 + 1] * (1 - curT)];

/* ---------- 출력용 SVG 지도 ----------
 *  5개 구를 각각 독립 path로 유지하고, 공유 경계는 하나의 path에서 딱 한 번만 그린다.
 *  노선·정거장·출발지 역시 같은 SVG 좌표계에서 움직여 캔버스 선의 떨림과 이중선을 없앤다. */
const districtRuns = GU_FEAT.map(f => Array.from({ length: f.n }, (_, j) => f.s + j));
const districtSvg = [], districtCurrentSvg = [], routeSvg = [], stationSvg = [], ringSvg = [];
function closedPathD(run, at) {
  if (run.length < 3) return '';
  const pts = run.map(at), first = pts[0], last = pts[pts.length - 1];
  let d = `M${((first[0] + last[0]) / 2).toFixed(2)} ${((first[1] + last[1]) / 2).toFixed(2)}`;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], n = pts[(i + 1) % pts.length];
    d += `Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${((p[0] + n[0]) / 2).toFixed(2)} ${((p[1] + n[1]) / 2).toFixed(2)}`;
  }
  return d + 'Z';
}
/* 예전에는 중점 기반 2차 곡선으로 그렸다. 그 방식은 꼭짓점을 지나지 않고 전부 제어점으로만
   쓰기 때문에 모든 모서리를 절반씩 깎아낸다 — 단순화가 애써 남긴 꺾임만 골라 지우는 셈이라
   경계가 굴곡 없는 국수가 됐다. 노선과 같은 보간 곡선으로 바꿔 꼭짓점을 지나가게 한다. */
/* 단순화는 지리 좌표에서 하지만 실제로 그려지는 건 시간 왜곡을 거친 좌표다. 왜곡은 구역마다
   압축률이 달라서, 지리에서 고른 간격이던 꼭짓점이 화면에서는 한 곳에 뭉친다. 그 상태로
   보간 곡선을 태우면 1px 안에서 되꺾이는 매듭이 생기므로 화면 간격으로 한 번 더 솎는다.
   길이를 이유로 조각을 빼지는 않는다. 7개의 구 경계는 5개 구를 나누는 데 하나도 빠짐없이
   필요하고, 그중 중구↔대덕구는 1.15km로 짧아 왜곡에 눌리면 20px까지 줄어든다.
   그걸 토막으로 보고 빼면 화면에서 두 구가 한 덩어리로 붙어 버린다. */
function boundaryPathD() {
  let d = '';
  const minGap = 1.1 / view.s;
  for (const run of GU_DRAW) {
    const pts = [];
    for (let i = 0; i < run.length; i++) {
      const q = P(run[i]), t = pts[pts.length - 1], last = i === run.length - 1;
      // 양 끝은 간격과 무관하게 남긴다. 솎다가 조각 하나를 통째로 날리면 그 두 구가 붙는다.
      if (!t || last || Math.hypot(q[0] - t[0], q[1] - t[1]) >= minGap) pts.push(q);
    }
    if (pts.length > 1) d += curveD(pts, false);
  }
  return d;
}
function initSvgMap() {
  for (let i = 0; i < districtRuns.length; i++) {
    const name = D.guLabels[i]?.name || `구역 ${i + 1}`;
    const under = document.createElementNS(SVG_NS, 'path');
    const active = document.createElementNS(SVG_NS, 'path');
    under.dataset.district = name; active.dataset.district = name;
    districtCurrent.appendChild(under); districtActive.appendChild(active);
    districtCurrentSvg.push(under); districtSvg.push(active);
  }
  for (const r of ROUTES) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.dataset.route = r.kind; routeLines.appendChild(path); routeSvg.push(path);
  }
  for (const minutes of RINGS) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    const label = document.createElementNS(SVG_NS, 'text');
    circle.dataset.minutes = String(minutes); label.textContent = minutes + '분';
    circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', C.green);
    circle.setAttribute('stroke-width', '.7'); circle.setAttribute('stroke-dasharray', '9 12');
    circle.setAttribute('vector-effect', 'non-scaling-stroke');
    label.setAttribute('fill', C.green); label.setAttribute('font-family', 'Pretendard, sans-serif');
    label.setAttribute('font-weight', '600');
    timeRings.appendChild(circle); timeRings.appendChild(label); ringSvg.push({ minutes, circle, label });
  }
  for (const s of ALL) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.dataset.station = s.name; stationMarks.appendChild(circle); stationSvg.push(circle);
  }
}
function updateSvgMap() {
  mapTransform.setAttribute('transform', `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.s.toFixed(5)})`);
  const band = curT > .05 && scen === 'tram' && mode !== 'diff';
  const overlay = scen === 'tram' && curT > .05 && mode !== 'diff';
  districtCurrent.style.display = band ? '' : 'none';
  districtCurrent.style.opacity = String(curT);
  districtActive.style.opacity = String(curT > .05 ? (band ? 1 : .92) : 1);
  cityActiveFill.setAttribute('d', closedPathD(CITY_IDX, P));
  cityActiveFill.setAttribute('fill', mode === 'diff' ? 'none' : overlay ? C.tramFill : C.currentFill);
  cityCurrentFill.setAttribute('d', closedPathD(CITY_IDX, k => ghostAt(k, posNow)));
  cityCurrentFill.setAttribute('fill', C.currentFill);
  for (let i = 0; i < districtRuns.length; i++) {
    districtSvg[i].setAttribute('d', closedPathD(districtRuns[i], P));
    districtSvg[i].setAttribute('fill', mode === 'diff' ? 'none' : overlay ? C.tramFill : C.currentFill);
    districtCurrentSvg[i].setAttribute('d', closedPathD(districtRuns[i], k => ghostAt(k, posNow)));
    districtCurrentSvg[i].setAttribute('fill', C.currentFill);
  }
  districtBoundary.setAttribute('d', boundaryPathD());
  districtBoundary.setAttribute('stroke-width', cutWidth().toFixed(2));
  timeRings.style.display = curT > .02 && mode !== 'diff' ? '' : 'none';
  timeRings.setAttribute('opacity', String(curT));
  for (const item of ringSvg) {
    const rr = radial(item.minutes);
    item.circle.setAttribute('cx', String(BOX.cx)); item.circle.setAttribute('cy', String(BOX.cy));
    item.circle.setAttribute('r', String(rr)); item.circle.setAttribute('opacity', '.18');
    item.label.setAttribute('x', String(BOX.cx + SZ(6)));
    item.label.setAttribute('y', String(BOX.cy - rr + SZ(3)));
    item.label.setAttribute('font-size', String(SZ(10.5))); item.label.setAttribute('opacity', '.46');
  }
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i], el = routeSvg[i]; el.setAttribute('d', routePathD(r) || '');
    const tram = r.kind === 'tram';
    el.setAttribute('stroke', C.green);
    el.setAttribute('stroke-width', tram ? '5.2' : '2.2');
    el.setAttribute('opacity', tram ? ((scen === 'tram' || mode === 'diff') ? '1' : '.16') : '.28');
  }
  for (let i = 0; i < ALL.length; i++) {
    const s = ALL[i], el = stationSvg[i], isTram = s.line === '트램';
    const hidden = (isTram && scen === 'now' && mode !== 'diff') || s.id === origin.id;
    el.style.display = hidden ? 'none' : '';
    if (hidden) continue;
    const p = P(NODE_S + i), isH = hover === i;
    el.setAttribute('cx', p[0].toFixed(2)); el.setAttribute('cy', p[1].toFixed(2));
    el.setAttribute('r', String(MK(isH ? 4.4 : VW >= 821 ? 2.8 : 3.6)));
    el.setAttribute('fill', isH ? C.orange : C.bg);
    el.setAttribute('stroke', C.green); el.setAttribute('stroke-width', isH ? '1.8' : '1.25');
  }
  const op = P(NODE_S + ALL.indexOf(origin)), pw = MK(26), ph = pw * 167.661 / 123.484;
  originPinMark.setAttribute('x', String(op[0] - pw / 2)); originPinMark.setAttribute('y', String(op[1] - ph));
  originPinMark.setAttribute('width', String(pw)); originPinMark.setAttribute('height', String(ph));
}
initSvgMap();

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  ctx.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * view.x, DPR * view.y);
  if (mode === 'diff' && tw > .55) { drawDiff(); return; }

}

function drawDiff() {
  cityPath();
  ctx.fillStyle = C.currentFill; ctx.fill('evenodd');
  const cell = Math.max(3, Math.sqrt(D.cellKm2) * GEO_SC + 0.6);   // 격자 간격에 맞춘 셀
  for (let i = 0; i < GN; i++) {
    const v = gridCut[i]; if (v < 0.6) continue;
    const t = Math.min(1, v / 30);
    ctx.globalAlpha = 0.25 + t * 0.75;
    ctx.fillStyle = t < .34 ? C.lime : t < .67 ? C.orange : C.orangeEdge;
    const x = gridXY[i * 2], y = gridXY[i * 2 + 1];
    ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
  }
  ctx.globalAlpha = 1;

}

function step(now) {
  if (zoomAnim) {
    const t = Math.min(1, (now - zoomAnim.started) / zoomAnim.duration);
    const e = easeInOut(t);
    view.s = zoomAnim.from.s + (zoomAnim.to.s - zoomAnim.from.s) * e;
    view.x = zoomAnim.from.x + (zoomAnim.to.x - zoomAnim.from.x) * e;
    view.y = zoomAnim.from.y + (zoomAnim.to.y - zoomAnim.from.y) * e;
    if (t >= 1) { view = { ...zoomAnim.to }; zoomTarget = { ...view }; zoomAnim = null; }
  }
  if (tw < 1) {
    tw = Math.min(1, tw + 16 / 1400);
    const e = easeInOut(tw);
    for (let i = 0; i < N * 2; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
    curT = fromT + (toT - fromT) * e;
    curReady = true;
  }
  draw();
  updateSvgMap();
  requestAnimationFrame(step);
}

/* ---------- 리사이즈 ---------- */
function resize() {
  clearTimeout(zoomTimer); zoomAnim = null;
  DPR = Math.min(devicePixelRatio || 1, 2);
  VW = cvs.clientWidth; VH = cvs.clientHeight;
  cvs.width = Math.round(VW * DPR); cvs.height = Math.round(VH * DPR);
  layout(); fitGeo(); recompute(); settle(); zoomTarget = { ...view };
}
addEventListener('resize', resize);

/* ---------- 인터랙션 ---------- */
const tip = document.getElementById('tip');
let drag = null, moved = 0;
const rel = e => { const r = cvs.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const ZOOM_IDLE_MS = 240;
function cancelZoomMotion() {
  clearTimeout(zoomTimer); zoomTimer = 0; zoomAnim = null; zoomTarget = { ...view };
}
function animateToZoomTarget() {
  zoomTimer = 0;
  const distance = Math.abs(Math.log(zoomTarget.s / view.s));
  if (distance < .001) return;
  zoomAnim = {
    from: { ...view }, to: { ...zoomTarget }, started: performance.now(),
    duration: Math.max(440, Math.min(720, 430 + distance * 170)),
  };
}
/** hit 기본값은 '탭으로 출발지 바꾸기'용. 호버 판정은 정거장 위에 실제로 올라갔을 때만. */
function pick(px, py, hit) {
  const HIT = hit ?? (VW >= 821 ? 16 : 22);
  let best = -1, bd = HIT * HIT;
  for (let i = 0; i < ALL.length; i++) {
    if (ALL[i].line === '트램' && scen === 'now') continue;
    const [x, y] = screenP(NODE_S + i); const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function clearHover() { hover = null; tip.hidden = true; }
cvs.addEventListener('pointerdown', e => {
  cancelZoomMotion();
  cvs.setPointerCapture(e.pointerId); drag = rel(e); moved = 0; clearHover();
});
cvs.addEventListener('pointermove', e => {
  const p = rel(e);
  if (drag) {
    view.x += p.x - drag.x; view.y += p.y - drag.y;
    moved += Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y); drag = p;
    clearHover(); draw(); return;
  }
  // 정거장 정보는 마우스가 정거장 위에 올라가 있는 동안에만.
  if (e.pointerType && e.pointerType !== 'mouse') { clearHover(); return; }
  const h = pick(p.x, p.y, VW >= 821 ? 11 : 13);
  cvs.style.cursor = h < 0 ? 'grab' : 'pointer';
  if (h < 0) { clearHover(); return; }
  hover = h;
  const s = ALL[h];
  const a = minsNow[NODE_S + h], b = minsTram[NODE_S + h];
  const fm = v => v >= CAP ? CAP + '분+' : Math.round(v) + '분';
  const d = a - b;
  tip.innerHTML = `<b>${s.name}</b><span>${s.line}</span>
    <span class="t">현재 <em>${fm(a)}</em> · 트램 후 <em class="o">${fm(b)}</em>${
      d > 0.5 ? ` <em class="cut">−${Math.round(d)}분</em>` : ''}</span>`;
  tip.hidden = false;
  const tw2 = tip.offsetWidth / 2 + 8;
  tip.style.left = Math.max(tw2, Math.min(innerWidth - tw2, e.clientX)) + 'px';
  tip.style.top = Math.max(52, e.clientY) + 'px';
});
function up(e) {
  if (drag && moved < 5) { const h = pick(drag.x, drag.y); if (h >= 0) setOrigin(ALL[h]); }
  drag = null; cvs.style.cursor = 'grab';
}
cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
cvs.addEventListener('pointerleave', clearHover);
addEventListener('blur', clearHover);
cvs.addEventListener('wheel', e => {
  clearHover();
  e.preventDefault();
  if (zoomAnim) cancelZoomMotion();
  const p = rel(e);
  const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18
    : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? Math.max(320, VH) : 1;
  const dy = Math.max(-140, Math.min(140, e.deltaY * unit));
  const f = Math.exp(-dy * 0.0042);
  const ns = Math.max(.5, Math.min(6, zoomTarget.s * f)); const k = ns / zoomTarget.s;
  zoomTarget.x = p.x - (p.x - zoomTarget.x) * k;
  zoomTarget.y = p.y - (p.y - zoomTarget.y) * k;
  zoomTarget.s = ns;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(animateToZoomTarget, ZOOM_IDLE_MS);
}, { passive: false });
cvs.addEventListener('dblclick', () => {
  cancelZoomMotion();
  zoomTarget = { s: 1, x: 0, y: 0 };
  animateToZoomTarget();
});

function setOrigin(s) {
  origin = s; recompute();
  document.getElementById('originName').textContent = s.name;
  document.getElementById('originLine').textContent = s.line;
  document.getElementById('originPick').value = String(s.id);   // 지도 클릭과 선택상자를 맞춘다
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
  const sh = stats.shrink * 100;
  document.getElementById('shrink').textContent = (sh >= 0 ? '−' : '+') + Math.abs(sh).toFixed(0) + '%';
  document.getElementById('shrinkNote').textContent =
    sh >= 20 ? '트램이 새로 닿는 곳이라 변화가 큽니다.'
    : sh >= 8 ? '1호선과 트램이 함께 닿아 중간 정도 줄어듭니다.'
    : '이미 1호선이 지나는 곳이라 변화가 작습니다. 다른 출발지를 골라 보세요.';
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
    (mode === 'geo' ? '지리 지도 — 실제 거리 그대로' :
    mode === 'diff' ? '트램으로 줄어드는 시간 — 진할수록 많이 줄어듭니다' :
    scen === 'tram' ? '연한 연두 = 현재 · 주황 = 트램 후 · 진녹색 = 트램 노선'
                    : '연한 연두 = 현재 시간지도 · 진녹색 = 도시철도');
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
document.body.dataset.view = mode;
requestAnimationFrame(step);
