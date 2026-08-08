import type { Station, Link } from '../types';
import stationsJson from './stations.json';
import linksJson from './links.json';

export const stations: Station[] = stationsJson as Station[];
export const links: Link[] = linksJson as Link[];

export const stationById = new Map<number, Station>(stations.map((s) => [s.id, s]));

/** Adjacency list for shortest-path: id -> [{to, sec}] */
export const adjacency = new Map<number, Array<{ to: number; sec: number }>>();
for (const [from, to, sec] of links) {
  if (!adjacency.has(from)) adjacency.set(from, []);
  adjacency.get(from)!.push({ to, sec });
}

/** Express lines visually overlap their local line; hidden from drawing but kept
 *  in the graph (they make real trips faster). */
export const isExpress = (line: string): boolean => /급행/.test(line);

/** Draw edges: one per same-line adjacent pair (deduped, transfer + express excluded). */
export const drawEdges: Array<{ a: number; b: number; color: string }> = (() => {
  const seen = new Set<string>();
  const edges: Array<{ a: number; b: number; color: string }> = [];
  for (const [from, to] of links) {
    const a = stationById.get(from);
    const b = stationById.get(to);
    if (!a || !b) continue;
    if (a.line !== b.line) continue; // skip transfer links for drawing
    if (isExpress(a.line)) continue; // express overlaps local
    const key = from < to ? `${from}-${to}` : `${to}-${from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ a: from, b: to, color: a.color });
  }
  return edges;
})();

/** Interchange hubs: station names served by >= 3 distinct lines. Data-driven so
 *  we always label the real big transfer stations (강남, 서울역, 왕십리 …). */
export const majorNames: Set<string> = (() => {
  const lines = new Map<string, Set<string>>();
  for (const s of stations) {
    if (!lines.has(s.name)) lines.set(s.name, new Set());
    lines.get(s.name)!.add(s.line);
  }
  const major = new Set<string>();
  for (const [name, set] of lines) if (set.size >= 3) major.add(name);
  // iconic stations that aren't 3-line interchanges but everyone knows
  const curated = ['강남', '잠실', '사당', '교대', '신촌', '건대입구', '성수', '강변',
    '수서', '신도림', '구로', '노원', '용산', '합정', '수원', '인천', '판교', '정자',
    '명동', '이태원', '성신여대입구', '혜화'];
  for (const name of curated) if (lines.has(name)) major.add(name);
  return major;
})();
