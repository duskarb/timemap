// Converts vuski/seoulsubway raw JS data -> clean stations.json + links.json
// Source data: https://github.com/vuski/seoulsubway  (CC-BY style attribution required)
//
// nodeData.js : {"no":id,"ln":line,"nm":name,"cl":hexColor,"gr":group,"x":m,"y":m}
// linkData.js : [fromId, toId, travelSeconds]   (includes transfer links across lines)
//
// We keep only gr===0 (currently operating network) and emit:
//   src/data/stations.json : [{id,name,line,color,x,y}]
//   src/data/links.json    : [[from,to,sec]]   (both directions, gr0 endpoints only)
//
// Coordinates x/y are EPSG:5179 (UTM-K) meters; used directly as a planar map.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function extractArray(text) {
  // grab substring from first '[' to last ']' and JSON.parse it
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  let body = text.slice(start, end + 1);
  // strip trailing commas before } or ]
  body = body.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(body);
}

const nodesRaw = extractArray(readFileSync(resolve(root, 'data/raw/nodeData.js'), 'utf8'));
const linksRaw = extractArray(readFileSync(resolve(root, 'data/raw/linkData.js'), 'utf8'));

const nodes = nodesRaw.filter((n) => n.gr === 0);
const validIds = new Set(nodes.map((n) => n.no));

const stations = nodes.map((n) => ({
  id: n.no,
  name: n.nm,
  line: n.ln,
  color: n.cl,
  x: n.x,
  y: n.y,
}));

const links = linksRaw.filter((l) => validIds.has(l[0]) && validIds.has(l[1]));

mkdirSync(resolve(root, 'src/data'), { recursive: true });
writeFileSync(resolve(root, 'src/data/stations.json'), JSON.stringify(stations));
writeFileSync(resolve(root, 'src/data/links.json'), JSON.stringify(links));

// quick stats
const xs = stations.map((s) => s.x), ys = stations.map((s) => s.y);
const lines = [...new Set(stations.map((s) => s.line))];
console.log(`stations: ${stations.length}, links: ${links.length}, lines: ${lines.length}`);
console.log(`x: ${Math.min(...xs)}..${Math.max(...xs)}  y: ${Math.min(...ys)}..${Math.max(...ys)}`);
