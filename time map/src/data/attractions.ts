import type { Attraction, AttractionRaw } from '../types';
import { stations } from './index';
import attractionsJson from './attractions.json';

const WALK_MPS = 1.25; // ~4.5 km/h

/** Attach nearest subway station (geo) + walking time to each attraction. */
export const attractions: Attraction[] = (attractionsJson as AttractionRaw[]).map((a) => {
  let nearestId = stations[0].id;
  let best = Infinity;
  for (const s of stations) {
    const d = Math.hypot(s.x - a.x, s.y - a.y);
    if (d < best) {
      best = d;
      nearestId = s.id;
    }
  }
  return { ...a, nearestStationId: nearestId, walkSec: best / WALK_MPS };
});
