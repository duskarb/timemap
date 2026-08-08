import { adjacency, stationById } from './data';

/**
 * Dijkstra shortest travel-time (seconds) from an origin station to all others,
 * over the subway graph (inter-station + transfer links carry real seconds).
 *
 * This gives REAL subway travel times with zero API calls when the origin is a
 * station. For an arbitrary GPS origin (M3) we add a first-mile walk to nearby
 * boarding stations, then run this from each as a multi-source seed.
 */
export function travelTimesFrom(originId: number): Map<number, number> {
  const dist = new Map<number, number>();
  dist.set(originId, 0);

  // simple binary-heap priority queue
  const heap: Array<{ id: number; d: number }> = [{ id: originId, d: 0 }];
  const swap = (i: number, j: number) => {
    [heap[i], heap[j]] = [heap[j], heap[i]];
  };
  const push = (id: number, d: number) => {
    heap.push({ id, d });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= heap[i].d) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < heap.length && heap[l].d < heap[m].d) m = l;
        if (r < heap.length && heap[r].d < heap[m].d) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const { id, d } = pop();
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const { to, sec } of adjacency.get(id) ?? []) {
      const nd = d + sec;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        push(to, nd);
      }
    }
  }
  return dist;
}

/** Seconds -> minutes (rounded). */
export function toMinutes(sec: number): number {
  return Math.round(sec / 60);
}

export function stationName(id: number): string {
  return stationById.get(id)?.name ?? String(id);
}
