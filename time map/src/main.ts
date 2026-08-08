import './style.css';
import { Renderer } from './map/renderer';
import { stations, stationById } from './data';
import { travelTimesFrom, toMinutes } from './graph';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const tooltip = document.getElementById('tooltip') as HTMLDivElement;
const toggleBtn = document.getElementById('toggle') as HTMLButtonElement;
const originLabel = document.querySelector('#origin-label strong') as HTMLElement;
const hint = document.getElementById('hint') as HTMLElement;
const legend = document.getElementById('legend') as HTMLDivElement;
const intro = document.getElementById('intro') as HTMLElement;

const renderer = new Renderer(canvas);
let times: Map<number, number> | null = null;

window.addEventListener('resize', () => renderer.resize());

let userInteracted = false;

function selectOrigin(id: number) {
  const station = stationById.get(id);
  if (!station) return;
  times = travelTimesFrom(id);
  renderer.selectOrigin(id, times);
  originLabel.textContent = station.name;
  toggleBtn.disabled = false;
  toggleBtn.textContent = '지리 지도로 보기';
  hint.textContent = '다른 역 클릭 · 스크롤 확대 · 드래그 이동 · 더블클릭 원위치';
  intro.classList.add('dim');
  buildLegend(id);
}

function buildLegend(originId: number) {
  legend.innerHTML = `
    <div class="legend-title">${stationById.get(originId)!.name}에서 걸리는 시간</div>
    <div class="legend-note">중심에 가까울수록 가깝습니다 · 링 = 30 / 60 / 90분</div>`;
  legend.classList.add('show');
}

// --- pointer interaction: hover · click-to-select · drag-pan · pinch/wheel-zoom ---
const pointers = new Map<number, { x: number; y: number }>();
let dragLast: { x: number; y: number } | null = null;
let downPos: { x: number; y: number } | null = null;
let moved = 0;
let pinchDist: number | null = null;

const rel = (e: { clientX: number; clientY: number }) => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

function showTooltip(id: number, clientX: number, clientY: number) {
  const st = stationById.get(id)!;
  const min = times ? toMinutes(times.get(id) ?? Infinity) : null;
  tooltip.innerHTML = min === null || !Number.isFinite(min)
    ? `<strong>${st.name}</strong><span>${st.line}</span>`
    : `<strong>${st.name}</strong><span>${st.line} · <b>${min}분</b></span>`;
  tooltip.style.left = `${clientX}px`;
  tooltip.style.top = `${clientY}px`;
  tooltip.hidden = false;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = rel(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 1) {
    dragLast = p;
    downPos = p;
    moved = 0;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    dragLast = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = rel(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

  // two-finger pinch zoom
  if (pointers.size >= 2 && pinchDist !== null) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 0) renderer.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
    pinchDist = d;
    tooltip.hidden = true;
    return;
  }

  // drag to pan
  if (dragLast) {
    const dx = p.x - dragLast.x, dy = p.y - dragLast.y;
    renderer.panBy(dx, dy);
    dragLast = p;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) {
      tooltip.hidden = true;
      canvas.style.cursor = 'grabbing';
    }
    return;
  }

  // hover
  const hit = renderer.pick(p.x, p.y);
  renderer.setHover(hit ? hit.id : null);
  if (hit) {
    canvas.style.cursor = 'pointer';
    showTooltip(hit.id, e.clientX, e.clientY);
  } else {
    canvas.style.cursor = 'grab';
    tooltip.hidden = true;
  }
});

function endPointer(e: PointerEvent) {
  const wasSingle = pointers.size === 1;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = null;
  if (pointers.size === 0) {
    if (wasSingle && downPos && moved < 5) {
      const hit = renderer.pick(downPos.x, downPos.y);
      if (hit) {
        userInteracted = true;
        selectOrigin(hit.id);
      }
    }
    dragLast = null;
    downPos = null;
    canvas.style.cursor = 'grab';
  } else if (pointers.size === 1) {
    dragLast = [...pointers.values()][0];
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('pointerleave', () => {
  if (!dragLast) {
    tooltip.hidden = true;
    renderer.setHover(null);
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = rel(e);
  renderer.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

// double-click empty space to reset the view
canvas.addEventListener('dblclick', () => renderer.resetView());

// Auto-intro: if the visitor just watches, reveal the morph from a flagship origin.
const DEFAULT_ORIGIN = ['시청', '광화문', '강남', '서울역'];
window.setTimeout(() => {
  if (userInteracted) return;
  for (const name of DEFAULT_ORIGIN) {
    const s = stations.find((st) => st.name === name);
    if (s) {
      selectOrigin(s.id);
      break;
    }
  }
}, 2400);

toggleBtn.addEventListener('click', () => {
  const mode = renderer.toggle();
  toggleBtn.textContent = mode === 'time' ? '지리 지도로 보기' : '시간 지도로 보기';
});

toggleBtn.disabled = true;

// debug hook for deterministic verification (dev only)
if (import.meta.env.DEV) {
  (window as unknown as { timeMap: unknown }).timeMap = {
    selectByName: (n: string) => {
      const s = stations.find((st) => st.name === n);
      if (s) {
        userInteracted = true;
        selectOrigin(s.id);
      }
    },
    setMode: (m: 'geo' | 'time') => renderer.setMode(m),
    force: (v: number) => renderer.forceMorph(v),
    progress: (s: number) => renderer.debugProgress(s),
    zoomAt: (x: number, y: number, f: number) => renderer.zoomAt(x, y, f),
    reset: () => renderer.resetView(),
    morph: () => renderer.morph,
  };
}
