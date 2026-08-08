import type { Attraction, Vec2 } from '../types';
import { stations, stationById } from '../data';
import { attractions } from '../data/attractions';

export interface Viewport {
  w: number;
  h: number;
}

const PAD = 64;

// Radius is scaled against this many minutes, not the absolute farthest station.
// The metro graph reaches Cheonan/Chuncheon (~150min); without a cap the Seoul
// core collapses into a tiny center. Stations beyond the cap sit at the rim.
const FOCUS_MIN = 90;

/** Geographic (EPSG:5179 planar) -> screen, aspect-preserving fit. */
export class GeoFit {
  private midX: number;
  private midY: number;
  private scale: number;
  private cx: number;
  private cy: number;

  constructor(vp: Viewport) {
    const xs = stations.map((s) => s.x);
    const ys = stations.map((s) => s.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    this.midX = (minX + maxX) / 2;
    this.midY = (minY + maxY) / 2;
    this.scale = Math.min((vp.w - 2 * PAD) / (maxX - minX), (vp.h - 2 * PAD) / (maxY - minY));
    this.cx = vp.w / 2;
    this.cy = vp.h / 2;
  }

  project(s: { x: number; y: number }): Vec2 {
    return {
      x: this.cx + (s.x - this.midX) * this.scale,
      y: this.cy - (s.y - this.midY) * this.scale, // flip: north up
    };
  }
}

export interface Ring {
  minutes: number;
  radius: number;
}

export interface AttractionPos {
  a: Attraction;
  geo: Vec2;
  time: Vec2;
  sec: number | undefined; // travel time incl. walk; undefined if unreachable
}

export interface Layout {
  geo: Map<number, Vec2>;
  time: Map<number, Vec2>;
  attractions: AttractionPos[];
  rings: Ring[];
  maxMinutes: number;
  reachable: Set<number>;
}

/** sqrt spreads the dense inner ring so nearby stations don't pile up at center. */
function radialNorm(sec: number, maxSec: number): number {
  return Math.sqrt(Math.min(sec, maxSec) / maxSec);
}

/**
 * Build geo + radial-time positions. Bearing is real geography (from origin),
 * radius is travel time. Origin sits at the screen center in time-space.
 */
export function computeLayout(
  originId: number,
  times: Map<number, number>, // seconds
  vp: Viewport,
): Layout {
  const geoFit = new GeoFit(vp);
  const origin = stationById.get(originId)!;
  const center: Vec2 = { x: vp.w / 2, y: vp.h / 2 };
  const Rmax = Math.min(vp.w, vp.h) / 2 - PAD;

  const reachable = new Set<number>();
  let maxSec = 1;
  for (const s of stations) {
    const t = times.get(s.id);
    if (t !== undefined && Number.isFinite(t)) {
      reachable.add(s.id);
      if (t > maxSec) maxSec = t;
    }
  }
  // Cap the radial scale so the dense Seoul core (mostly < 1h) uses the full
  // radius; far suburban ends clamp to the rim instead of dominating.
  const scaleMaxSec = Math.min(maxSec, FOCUS_MIN * 60);
  // Unreachable stations are parked just outside the furthest ring.
  const parkSec = scaleMaxSec * 1.12;

  const geo = new Map<number, Vec2>();
  const time = new Map<number, Vec2>();
  for (const s of stations) {
    geo.set(s.id, geoFit.project(s));
    const sec = times.get(s.id) ?? parkSec;
    const dx = s.x - origin.x;
    const dy = s.y - origin.y;
    const theta = Math.atan2(dy, dx);
    const r = Rmax * radialNorm(sec, scaleMaxSec);
    time.set(s.id, {
      x: center.x + r * Math.cos(theta),
      y: center.y - r * Math.sin(theta), // flip: north up
    });
  }

  // attractions: time = nearest-station time + walk; positioned like stations
  const attractionPos = attractions.map((a) => {
    const geoP = geoFit.project(a);
    const stTime = times.get(a.nearestStationId);
    const sec = stTime === undefined ? undefined : stTime + a.walkSec;
    const usedSec = sec ?? parkSec;
    const dx = a.x - origin.x;
    const dy = a.y - origin.y;
    const theta = Math.atan2(dy, dx);
    const r = Rmax * radialNorm(usedSec, scaleMaxSec);
    return {
      a,
      geo: geoP,
      time: { x: center.x + r * Math.cos(theta), y: center.y - r * Math.sin(theta) },
      sec,
    };
  });

  // concentric guide rings every 20 min, scaled to the focus cap
  const maxMinutes = Math.ceil(scaleMaxSec / 60);
  const step = maxMinutes <= 40 ? 10 : maxMinutes <= 80 ? 20 : 30;
  const rings: Ring[] = [];
  for (let m = step; m <= maxMinutes; m += step) {
    rings.push({ minutes: m, radius: Rmax * radialNorm(m * 60, scaleMaxSec) });
  }

  return { geo, time, attractions: attractionPos, rings, maxMinutes, reachable };
}
