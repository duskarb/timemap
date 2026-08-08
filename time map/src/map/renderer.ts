import { easeCubicInOut } from 'd3-ease';
import type { Attraction, Vec2 } from '../types';
import { stations, stationById, drawEdges, majorNames, isExpress } from '../data';
import { computeLayout, type Layout, type Viewport } from './projection';

const MORPH_MS = 1500;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Octilinear 2-segment path A->B using only H/V and 45° segments (metro-diagram style). */
function octiPath(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const bend: Vec2 = adx >= ady
    ? { x: b.x - Math.sign(dx) * ady, y: a.y } // horizontal then 45°
    : { x: a.x, y: b.y - Math.sign(dy) * adx }; // vertical then 45°
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(bend.x, bend.y);
  ctx.lineTo(b.x, b.y);
}

export interface PickResult {
  id: number;
  screen: Vec2;
}

interface LabelCand {
  name: string;
  x: number;
  y: number;
  kind: 'origin' | 'hover' | 'attraction' | 'hub';
  alpha: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private vp: Viewport = { w: 0, h: 0 };
  private dpr = 1;

  private layout: Layout | null = null;
  private times: Map<number, number> | null = null;
  private originId: number | null = null;

  // Tween between two arbitrary position snapshots (from -> to). This lets any
  // transition — geo↔time AND timeA↔timeB — animate directly from the CURRENT
  // on-screen state instead of snapping back to the geographic base first.
  private fromPos = new Map<number, Vec2>();
  private toPos = new Map<number, Vec2>();
  private fromAttr: Vec2[] = [];
  private toAttr: Vec2[] = [];
  private fromTime = 0; // 0 = geo, 1 = time (for rings/label fade)
  private toTime = 0;
  private sLin = 1; // transition progress 0..1 (1 = settled)
  private mode: 'geo' | 'time' = 'geo';

  private current = new Map<number, Vec2>(); // displayed station positions (hit-test)
  private currentAttr: Vec2[] = []; // displayed attraction positions
  private curTimeAmount = 0; // displayed 0..1 (rings/labels)
  private hoverId: number | null = null;

  // pan/zoom view transform (CSS-px space)
  private viewScale = 1;
  private viewX = 0;
  private viewY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    const loop = () => {
      this.step();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.vp = { w, h };
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.originId !== null && this.times) {
      this.layout = computeLayout(this.originId, this.times, this.vp);
      this.settle(); // positions changed with viewport — snap to current mode
    }
  }

  /** Snap the tween to a settled state at the current mode (no animation). */
  private settle(): void {
    if (!this.layout) return;
    const tgt = this.mode === 'time' ? this.layout.time : this.layout.geo;
    const tgtAttr = this.layout.attractions.map((a) => (this.mode === 'time' ? a.time : a.geo));
    this.fromPos = new Map(tgt);
    this.toPos = new Map(tgt);
    this.fromAttr = tgtAttr;
    this.toAttr = tgtAttr.slice();
    this.fromTime = this.toTime = this.mode === 'time' ? 1 : 0;
    this.sLin = 1;
  }

  /** Begin a tween from the currently displayed state to the given mode's layout. */
  private tweenTo(mode: 'geo' | 'time'): void {
    if (!this.layout) return;
    this.mode = mode;
    const seeded = this.current.size > 0;
    this.fromPos = seeded ? new Map(this.current) : new Map(this.layout.geo);
    this.fromAttr = this.currentAttr.length
      ? this.currentAttr.slice()
      : this.layout.attractions.map((a) => a.geo);
    this.fromTime = seeded ? this.curTimeAmount : 0;
    this.toPos = new Map(mode === 'time' ? this.layout.time : this.layout.geo);
    this.toAttr = this.layout.attractions.map((a) => (mode === 'time' ? a.time : a.geo));
    this.toTime = mode === 'time' ? 1 : 0;
    this.sLin = 0;
  }

  /** Pick an origin: morph DIRECTLY from the current view to the new time-layout. */
  selectOrigin(originId: number, times: Map<number, number>) {
    this.originId = originId;
    this.times = times;
    this.layout = computeLayout(originId, times, this.vp);
    this.tweenTo('time');
  }

  setMode(mode: 'geo' | 'time') {
    this.tweenTo(mode);
  }

  /** Jump to a morph value and draw synchronously (deterministic render/export). */
  forceMorph(v: number): void {
    this.mode = v > 0.5 ? 'time' : 'geo';
    this.settle();
    this.draw();
  }

  /** Debug: freeze the tween at a given progress and draw (verification only). */
  debugProgress(s: number): void {
    this.sLin = Math.max(0, Math.min(1, s));
    this.draw();
  }

  /** Zoom by `factor` keeping the world point under (sx,sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const ns = Math.max(0.6, Math.min(9, this.viewScale * factor));
    const wx = (sx - this.viewX) / this.viewScale;
    const wy = (sy - this.viewY) / this.viewScale;
    this.viewX = sx - ns * wx;
    this.viewY = sy - ns * wy;
    this.viewScale = ns;
  }

  panBy(dx: number, dy: number): void {
    this.viewX += dx;
    this.viewY += dy;
  }

  resetView(): void {
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;
  }

  toggle(): 'geo' | 'time' {
    const next = this.mode === 'time' ? 'geo' : 'time';
    this.tweenTo(next);
    return next;
  }

  setHover(id: number | null) {
    this.hoverId = id;
  }

  /** Nearest station within px radius of a screen point (accounts for pan/zoom). */
  pick(sx: number, sy: number, radius = 14): PickResult | null {
    // convert screen -> world
    const wx = (sx - this.viewX) / this.viewScale;
    const wy = (sy - this.viewY) / this.viewScale;
    const wr = radius / this.viewScale;
    let best: PickResult | null = null;
    let bestD = wr * wr;
    for (const [id, p] of this.current) {
      const dx = p.x - wx, dy = p.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { id, screen: p };
      }
    }
    return best;
  }

  currentPos(id: number): Vec2 | undefined {
    return this.current.get(id);
  }

  get morph(): number {
    return this.curTimeAmount;
  }

  get maxMinutes(): number {
    return this.layout?.maxMinutes ?? 0;
  }

  private step() {
    if (this.sLin < 1) {
      const speed = 1 / (MORPH_MS / 16.7);
      this.sLin = Math.min(1, this.sLin + speed);
    }
    this.draw();
  }

  private draw() {
    const ctx = this.ctx;
    const { w, h } = this.vp;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.viewX, this.viewY);
    ctx.scale(this.viewScale, this.viewScale);

    const layout = this.layout;

    if (!layout) {
      // initial geo-only render (no origin yet)
      this.drawGeoOnly();
      ctx.restore();
      return;
    }

    // interpolate displayed positions from the from->to snapshot (eased)
    const es = easeCubicInOut(this.sLin);
    const tt = lerp(this.fromTime, this.toTime, es); // 0 = geo, 1 = time
    this.curTimeAmount = tt;

    this.current.clear();
    for (const s of stations) {
      const f = this.fromPos.get(s.id);
      const t = this.toPos.get(s.id);
      if (f && t) this.current.set(s.id, { x: lerp(f.x, t.x, es), y: lerp(f.y, t.y, es) });
    }
    this.currentAttr = layout.attractions.map((ap, i) => {
      const f = this.fromAttr[i] ?? ap.geo;
      const t = this.toAttr[i] ?? ap.time;
      return { x: lerp(f.x, t.x, es), y: lerp(f.y, t.y, es) };
    });
    const cur = (id: number): Vec2 => this.current.get(id) ?? { x: 0, y: 0 };

    // --- time rings (fade in with morph) ---
    if (layout.rings.length) {
      const ringA = tt;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = `rgba(150,170,210,${0.18 * ringA})`;
      ctx.fillStyle = `rgba(170,190,230,${0.5 * ringA})`;
      ctx.lineWidth = 1;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const ring of layout.rings) {
        ctx.beginPath();
        ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
        if (ringA > 0.4) ctx.fillText(`${ring.minutes}분`, 0, -ring.radius - 4);
      }
      ctx.restore();
    }

    // --- edges (octilinear: only horizontal / vertical / 45°), colored by subway line ---
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const e of drawEdges) {
      const a = cur(e.a), b = cur(e.b);
      ctx.strokeStyle = hexA(e.color, 0.85);
      ctx.beginPath();
      octiPath(ctx, a, b);
      ctx.stroke();
    }

    // --- attraction connectors (achromatic, octilinear) drawn beneath nodes ---
    const attrItems = layout.attractions.map((ap, i) => ({ a: ap.a, p: this.currentAttr[i] }));
    ctx.strokeStyle = 'rgba(150,158,175,0.32)';
    ctx.lineWidth = 1;
    for (const it of attrItems) {
      ctx.beginPath();
      octiPath(ctx, cur(it.a.nearestStationId), it.p);
      ctx.stroke();
    }

    // --- nodes (colored by subway line) ---
    for (const s of stations) {
      if (isExpress(s.line)) continue; // express overlaps local visually
      const p = cur(s.id);
      const isOrigin = s.id === this.originId;
      const isHover = s.id === this.hoverId;
      const r = isOrigin ? 6 : isHover ? 5 : 2.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = hexA(s.color, 0.95);
      if (isOrigin) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 16;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // --- attraction diamonds ---
    this.drawAttractionMarkers(attrItems);

    // --- unified labels with collision avoidance ---
    const cands: LabelCand[] = [];
    const seen = new Set<string>();
    for (const s of stations) {
      if (isExpress(s.line)) continue;
      const isOrigin = s.id === this.originId;
      const isHover = s.id === this.hoverId;
      if (!(isOrigin || isHover || majorNames.has(s.name)) || seen.has(s.name)) continue;
      seen.add(s.name);
      const p = cur(s.id);
      cands.push({
        name: s.name,
        x: p.x,
        y: p.y,
        kind: isOrigin ? 'origin' : isHover ? 'hover' : 'hub',
        alpha: isOrigin || isHover ? 1 : tt,
      });
    }
    for (const it of attrItems) {
      cands.push({ name: it.a.name, x: it.p.x, y: it.p.y, kind: 'attraction', alpha: tt });
    }
    this.drawLabels(cands);

    // --- animated origin pulse ---
    if (this.originId !== null) {
      const o = cur(this.originId);
      const phase = (performance.now() % 2200) / 2200; // 0..1
      const pr = 9 + phase * 26;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - phase)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(o.x, o.y, pr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore(); // end pan/zoom transform
  }

  /** Neutral diamond markers for Seoul attractions (labels handled by drawLabels). */
  private drawAttractionMarkers(items: Array<{ a: Attraction; p: Vec2 }>): void {
    const ctx = this.ctx;
    for (const it of items) {
      ctx.save();
      ctx.translate(it.p.x, it.p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(236,239,246,0.92)';
      ctx.strokeStyle = 'rgba(10,14,24,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(-3.1, -3.1, 6.2, 6.2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Draw labels with greedy collision avoidance; priority origin > hover > attraction > hub. */
  private drawLabels(cands: LabelCand[]): void {
    const ctx = this.ctx;
    const rank = { origin: 0, hover: 1, attraction: 2, hub: 3 };
    cands.sort((a, b) => rank[a.kind] - rank[b.kind]);
    const placed: Array<[number, number, number, number]> = [];
    ctx.textBaseline = 'middle';
    for (const c of cands) {
      if (c.alpha <= 0.03) continue;
      const big = c.kind === 'origin' || c.kind === 'hover';
      const isAttr = c.kind === 'attraction';
      ctx.font = `${big ? 600 : 500} ${big ? 13 : isAttr ? 10.5 : 11}px system-ui, sans-serif`;
      const w = ctx.measureText(c.name).width;
      const ly = isAttr ? c.y + 9 : c.y - (c.kind === 'origin' ? 12 : 8);
      const anchorX = isAttr ? c.x : c.x + (c.kind === 'origin' ? 12 : 7);
      const left = isAttr ? c.x - w / 2 : anchorX;
      const rect: [number, number, number, number] = [left - 2, ly - 7, w + 4, 14];
      let ok = true;
      for (const r of placed) {
        if (rect[0] < r[0] + r[2] && rect[0] + rect[2] > r[0] && rect[1] < r[1] + r[3] && rect[1] + rect[3] > r[1]) {
          ok = false;
          break;
        }
      }
      if (!ok && !big) continue; // origin/hover always drawn
      placed.push(rect);
      ctx.globalAlpha = c.alpha;
      ctx.textAlign = isAttr ? 'center' : 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,11,20,0.85)';
      ctx.strokeText(c.name, anchorX, ly);
      ctx.fillStyle = c.kind === 'origin' ? '#ffffff'
        : big ? '#e8edf7'
        : isAttr ? 'rgba(222,227,240,0.92)'
        : 'rgba(214,222,240,0.8)';
      ctx.fillText(c.name, anchorX, ly);
      ctx.globalAlpha = 1;
    }
  }

  /** geo-only render before an origin is chosen (lines by color). */
  private drawGeoOnly() {
    const ctx = this.ctx;
    const layout = computeLayout(stations[0].id, new Map(), this.vp); // geo positions only
    this.current.clear();
    for (const s of stations) this.current.set(s.id, layout.geo.get(s.id)!);
    this.currentAttr = layout.attractions.map((ap) => ap.geo);
    this.curTimeAmount = 0;
    const cur = (id: number): Vec2 => this.current.get(id) ?? { x: 0, y: 0 };

    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const e of drawEdges) {
      ctx.strokeStyle = hexA(e.color, 0.8);
      ctx.beginPath();
      octiPath(ctx, cur(e.a), cur(e.b));
      ctx.stroke();
    }

    // attraction connectors (achromatic, octilinear)
    const attrItems = layout.attractions.map((ap) => ({ a: ap.a, p: ap.geo }));
    ctx.strokeStyle = 'rgba(150,158,175,0.32)';
    ctx.lineWidth = 1;
    for (const ap of layout.attractions) {
      ctx.beginPath();
      octiPath(ctx, cur(ap.a.nearestStationId), ap.geo);
      ctx.stroke();
    }

    for (const s of stations) {
      if (isExpress(s.line)) continue;
      const p = cur(s.id);
      const isHover = s.id === this.hoverId;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isHover ? 5 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = hexA(s.color, 0.95);
      ctx.fill();
    }

    this.drawAttractionMarkers(attrItems);

    // unified labels (idle: hubs + attractions + hover)
    const cands: LabelCand[] = [];
    const seen = new Set<string>();
    for (const s of stations) {
      if (isExpress(s.line)) continue;
      const isHover = s.id === this.hoverId;
      if (!(isHover || majorNames.has(s.name)) || seen.has(s.name)) continue;
      seen.add(s.name);
      const p = cur(s.id);
      cands.push({ name: s.name, x: p.x, y: p.y, kind: isHover ? 'hover' : 'hub', alpha: 1 });
    }
    for (const it of attrItems) {
      cands.push({ name: it.a.name, x: it.p.x, y: it.p.y, kind: 'attraction', alpha: 1 });
    }
    this.drawLabels(cands);
  }
}

/** hex (#rrggbb) -> rgba string with alpha. */
function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgb')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export { stationById };
