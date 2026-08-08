import fs from 'node:fs';
import path from 'node:path';

const OUTPUT = path.join(process.cwd(), 'exports', 'daejeon-transit-time-map.svg');
const sources = {
  city: '/private/tmp/daejeon-boundary.geojson',
  yuseong: '/private/tmp/yuseong.geojson',
  seo: '/private/tmp/seo.geojson',
  jung: '/private/tmp/jung.geojson',
  dong: '/private/tmp/dong.geojson',
  daedeok: '/private/tmp/daedeok.geojson',
  osm: '/private/tmp/daejeon-osm.json',
  dongs: '/private/tmp/daejeon-dongs.json',
  tram: '/private/tmp/daejeon-tram-osm.json',
  tramStops: '/private/tmp/daejeon-tram-stops-all.json',
};

for (const file of Object.values(sources)) {
  if (!fs.existsSync(file)) throw new Error(`Missing source: ${file}`);
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const cityGeo = read(sources.city);
const osm = read(sources.osm);
const dongData = read(sources.dongs);
const tramData = read(sources.tram);
const tramStopData = read(sources.tramStops);
const guData = [
  ['유성구', read(sources.yuseong)],
  ['서구', read(sources.seo)],
  ['중구', read(sources.jung)],
  ['동구', read(sources.dong)],
  ['대덕구', read(sources.daedeok)],
];

const origin = {
  label: '어은동 113-11',
  lon: 127.3578804,
  lat: 36.3630166,
};

const metroOrder = [
  '반석',
  '지족',
  '노은',
  '월드컵경기장',
  '현충원',
  '구암',
  '유성온천',
  '갑천',
  '월평',
  '갈마',
  '정부청사',
  '시청',
  '탄방',
  '용문',
  '오룡',
  '서대전네거리',
  '중구청',
  '중앙로',
  '대전역',
  '대동',
  '신흥',
  '판암',
];

const stationNodes = osm.elements.filter(
  (element) =>
    element.type === 'node' &&
    element.tags?.railway === 'station' &&
    metroOrder.includes(element.tags?.name),
);
const metroStations = metroOrder.map((name, index) => {
  const node = stationNodes.find((item) => item.tags.name === name);
  if (!node) throw new Error(`Missing metro station: ${name}`);
  return { name, lon: node.lon, lat: node.lat, index };
});

const cosLat = Math.cos((origin.lat * Math.PI) / 180);
const localKm = (lon, lat) => ({
  x: (lon - origin.lon) * 111.32 * cosLat,
  y: (lat - origin.lat) * 110.574,
});
const kmBetween = (aLon, aLat, bLon, bLat) => {
  const x = (aLon - bLon) * 111.32 * cosLat;
  const y = (aLat - bLat) * 110.574;
  return Math.hypot(x, y);
};

function currentTransitMinutes(lon, lat) {
  const local = localKm(lon, lat);
  const distance = Math.hypot(local.x, local.y);
  const walk = distance * 13.19;
  const bus = 8 + distance * 3.3;
  const originStation = metroOrder.indexOf('월평');
  let subway = Number.POSITIVE_INFINITY;

  for (const station of metroStations) {
    const finalWalk = kmBetween(lon, lat, station.lon, station.lat) * 13.19;
    const ride = Math.abs(station.index - originStation) * 1.95;
    subway = Math.min(subway, 10.5 + 4 + ride + finalWalk);
  }
  return Math.min(walk, bus, subway);
}

const width = 1440;
const height = 1440;
const center = { x: 720, y: 750 };
const pixelsPerMinute = 7.05;

function distort(lon, lat) {
  const local = localKm(lon, lat);
  const distance = Math.hypot(local.x, local.y);
  if (distance < 0.0001) return { x: center.x, y: center.y, minutes: 0 };
  const minutes = currentTransitMinutes(lon, lat);
  const radius = minutes * pixelsPerMinute;
  const angle = Math.atan2(local.y, local.x);
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y - Math.sin(angle) * radius,
    minutes,
  };
}

const num = (value) => Number(value.toFixed(1));
const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function simplify(points, threshold = 1.1) {
  if (points.length <= 2) return points;
  const output = [points[0]];
  let previous = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= threshold) {
      output.push(point);
      previous = point;
    }
  }
  output.push(points.at(-1));
  return output;
}

function linePath(coords, close = false, threshold = 1.1) {
  const points = simplify(
    coords.map(([lon, lat]) => distort(lon, lat)),
    threshold,
  );
  if (points.length < 2) return '';
  let d = `M${num(points[0].x)},${num(points[0].y)}`;
  for (const point of points.slice(1)) d += `L${num(point.x)},${num(point.y)}`;
  if (close) d += 'Z';
  return d;
}

function geometryPath(geometry, threshold = 1.1) {
  if (!geometry) return '';
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => linePath(ring, true, threshold)).join('');
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => linePath(ring, true, threshold)))
      .join('');
  }
  return '';
}

const collectionPath = (collection, threshold = 1.1) =>
  collection.features.map((feature) => geometryPath(feature.geometry, threshold)).join('');

const cityGeometry = cityGeo.features[0].geometry;
const cityPolygons =
  cityGeometry.type === 'Polygon' ? [cityGeometry.coordinates] : cityGeometry.coordinates;

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crossed =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crossed) inside = !inside;
  }
  return inside;
}

function insideCity(lon, lat) {
  return cityPolygons.some((polygon) => {
    if (!pointInRing(lon, lat, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  });
}

function splitInside(coords) {
  const runs = [];
  let run = [];
  for (const coord of coords) {
    if (insideCity(coord[0], coord[1])) {
      run.push(coord);
    } else {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}

const cityPath = collectionPath(cityGeo, 0.85);
const guPaths = guData.map(([name, geo]) => ({ name, d: collectionPath(geo, 0.9) }));

const dongRelations = dongData.elements.filter(
  (element) =>
    element.type === 'relation' &&
    element.tags?.admin_level === '8' &&
    element.tags?.name,
);

const dongShapes = [];
const seenDong = new Set();
for (const relation of dongRelations) {
  const segments = [];
  const allCoords = [];
  for (const member of relation.members ?? []) {
    if (member.type !== 'way' || !member.geometry?.length) continue;
    const coords = member.geometry.map((point) => [point.lon, point.lat]);
    for (const run of splitInside(coords)) {
      segments.push(linePath(run, false, 0.65));
      allCoords.push(...run);
    }
  }
  if (!segments.length || !allCoords.length) continue;
  const minLon = Math.min(...allCoords.map(([lon]) => lon));
  const maxLon = Math.max(...allCoords.map(([lon]) => lon));
  const minLat = Math.min(...allCoords.map(([, lat]) => lat));
  const maxLat = Math.max(...allCoords.map(([, lat]) => lat));
  const lon = (minLon + maxLon) / 2;
  const lat = (minLat + maxLat) / 2;
  if (!insideCity(lon, lat)) continue;
  const key = `${relation.tags.name}-${lon.toFixed(3)}-${lat.toFixed(3)}`;
  if (seenDong.has(key)) continue;
  seenDong.add(key);
  dongShapes.push({
    name: relation.tags.name,
    paths: segments,
    label: distort(lon, lat),
  });
}

const metroRelation = osm.elements.find(
  (element) =>
    element.type === 'relation' &&
    element.tags?.route === 'subway' &&
    String(element.tags?.name).includes('반석 → 판암'),
);
const metroPaths = (metroRelation?.members ?? [])
  .filter((member) => member.type === 'way' && member.geometry?.length)
  .map((member) =>
    linePath(
      member.geometry.map((point) => [point.lon, point.lat]),
      false,
      0.55,
    ),
  );

const tramRelation = tramData.elements.find(
  (element) =>
    element.type === 'relation' &&
    element.tags?.route === 'tram' &&
    element.tags?.name === '대전 도시철도 2호선',
);
const tramPaths = (tramRelation?.members ?? [])
  .filter((member) => member.type === 'way' && member.geometry?.length)
  .flatMap((member) => {
    const coords = member.geometry.map((point) => [point.lon, point.lat]);
    return splitInside(coords).map((run) => linePath(run, false, 0.55));
  });

const tramStopDefinitions = [
  [201, '서대전역'],
  [202, '서대전네거리'],
  [203, '대사'],
  [204, '보문산공원'],
  [205, '인동'],
  [206, '대전역(중앙시장)'],
  [207, '대전역(혁신도시)'],
  [208, '대동'],
  [209, '자양'],
  [210, '가양'],
  [211, '대전복합터미널'],
  [212, '용전'],
  [213, '중리'],
  [214, '오정'],
  [215, '오정농수산물시장'],
  [216, '둔산'],
  [217, '샘머리공원'],
  [218, '정부청사'],
  [219, '둔산선사유적지'],
  [220, '만년'],
  [221, '국립중앙과학관'],
  [222, '구성'],
  [223, '유성구청'],
  [224, '궁동'],
  [225, '유성온천'],
  [226, '상대'],
  [227, '원골'],
  [228, '대전시립박물관'],
  [229, '도안'],
  [230, '용계'],
  [231, '대정'],
  [232, '원앙네거리'],
  [233, '관저네거리'],
  [234, '관저'],
  [235, '가수원네거리'],
  [236, '정림삼거리'],
  [237, '도마·복수'],
  [238, '도마네거리'],
  [239, '버드내네거리'],
  [240, '유천'],
  [241, '동춘당'],
  [242, '법동'],
  [243, '읍내'],
  [244, '연축'],
  [245, '진잠네거리'],
];

const rawTramStopNodes = tramStopData.elements.filter(
  (element) => element.type === 'node' && element.tags?.name,
);
const tramStops = tramStopDefinitions.map(([ref, name]) => {
  const node = rawTramStopNodes.find((element) => element.tags.name === name);
  if (!node) throw new Error(`Missing tram stop ${ref}: ${name}`);
  return { ref, name, ...distort(node.lon, node.lat) };
});

const guLabels = [
  ['유성구', 127.301, 36.395],
  ['서구', 127.348, 36.293],
  ['중구', 127.412, 36.286],
  ['동구', 127.477, 36.326],
  ['대덕구', 127.427, 36.414],
].map(([name, lon, lat]) => ({ name, ...distort(lon, lat) }));

const landmarks = [
  ['KAIST', 127.3633, 36.3721, -10, -9, 'end'],
  ['국립중앙과학관', 127.3776, 36.3742, 10, -10, 'start'],
  ['대전시청', 127.3845, 36.3504, -10, 17, 'end'],
  ['대전역', 127.4346, 36.3322, 13, 25, 'start'],
  ['대전복합터미널', 127.4366, 36.3508, 14, -18, 'start'],
  ['대전오월드', 127.3977, 36.2883, 10, -10, 'start'],
].map(([name, lon, lat, dx, dy, anchor]) => ({
  name,
  dx,
  dy,
  anchor,
  ...distort(lon, lat),
}));

const labelledDongs = new Set([
  '온천2동',
  '신성동',
  '월평1동',
  '만년동',
  '둔산1동',
  '오정동',
  '중리동',
  '용전동',
  '중앙동',
  '대흥동',
  '도마1동',
  '관저1동',
  '신탄진동',
  '산내동',
]);

const rings = [15, 30, 45, 60, 75];
const background = '#F15A2B';
const paper = '#F4F1E8';
const ink = '#171717';
const subway = '#173D68';
const tram = '#C7FF00';

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>대전 대중교통 시간 지도 — 미니멀 벡터 버전</title>
  <desc>어은동 113-11을 중심으로 구와 동 경계, 도시철도 1호선, 건설 중인 트램 2호선, 랜드마크, 15분 간격 시간 원만 표시한 지도입니다.</desc>
  <metadata>
    Origin: ${origin.label} (${origin.lat}, ${origin.lon})
    Tram geometry: Daejeon Metro Line 2 construction route, OpenStreetMap snapshot
    Administrative geometry: OpenStreetMap contributors, ODbL 1.0
    Time model: weekday daytime concept estimate using current walk, bus and Metro Line 1 access
    Generated: ${new Date().toISOString()}
  </metadata>

  <g id="00-background">
    <rect width="${width}" height="${height}" fill="${background}"/>
  </g>

  <g id="01-title" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" fill="${ink}">
    <text x="64" y="70" font-size="30" font-weight="800">DAEJEON / TIME MAP</text>
    <text x="66" y="100" font-size="14">${origin.label} 기준 · 원 한 칸 = 15분</text>
  </g>

  <g id="02-city-area" fill="${paper}" stroke="none" fill-rule="evenodd">
    <path d="${cityPath}"/>
  </g>

  <g id="03-time-rings" fill="none" stroke="${ink}" stroke-width="1.15" opacity="0.72">
    ${rings
      .map(
        (minutes) =>
          `<circle cx="${center.x}" cy="${center.y}" r="${num(minutes * pixelsPerMinute)}"/>`,
      )
      .join('\n    ')}
  </g>
  <g id="04-time-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="12" fill="${ink}" text-anchor="middle">
    ${rings
      .map(
        (minutes) =>
          `<text x="${center.x}" y="${num(center.y - minutes * pixelsPerMinute - 7)}">${minutes}분</text>`,
      )
      .join('\n    ')}
  </g>

  <g id="05-dong-boundaries" fill="none" stroke="#77736C" stroke-width="0.65" opacity="0.62">
    ${dongShapes.flatMap((shape) => shape.paths.map((d) => `<path d="${d}"/>`)).join('\n    ')}
  </g>
  <g id="06-gu-boundaries" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round">
    ${guPaths.map(({ d }) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="07-city-boundary" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linejoin="round">
    <path d="${cityPath}"/>
  </g>

  <g id="08-dong-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="9" fill="#5F5B55" text-anchor="middle" opacity="0.72">
    ${dongShapes
      .filter(({ name }) => labelledDongs.has(name))
      .map(
        ({ name, label }) =>
          `<text x="${num(label.x)}" y="${num(label.y)}">${escapeXml(name)}</text>`,
      )
      .join('\n    ')}
  </g>
  <g id="09-gu-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="19" font-weight="800" fill="${ink}" text-anchor="middle">
    ${guLabels
      .map(({ name, x, y }) => `<text x="${num(x)}" y="${num(y)}">${name}</text>`)
      .join('\n    ')}
  </g>

  <g id="10-subway-line-1-underlay" fill="none" stroke="${paper}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    ${metroPaths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="11-subway-line-1" fill="none" stroke="${subway}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    ${metroPaths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="12-subway-stations" fill="${paper}" stroke="${subway}" stroke-width="1.8">
    ${metroStations
      .map((station) => {
        const point = distort(station.lon, station.lat);
        return `<circle cx="${num(point.x)}" cy="${num(point.y)}" r="3.7"/>`;
      })
      .join('\n    ')}
  </g>

  <g id="13-tram-line-2-underlay" fill="none" stroke="${ink}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
    ${tramPaths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="14-tram-line-2" fill="none" stroke="${tram}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    ${tramPaths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>

  <g id="15-tram-stations" fill="${paper}" stroke="${ink}" stroke-width="1.4">
    ${tramStops
      .map(
        ({ ref, name, x, y }) =>
          `<circle id="tram-stop-${ref}-${escapeXml(name)}" cx="${num(x)}" cy="${num(y)}" r="3.7"/>`,
      )
      .join('\n    ')}
  </g>

  <g id="16-line-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="13" font-weight="800">
    <text x="${num(distort(127.316, 36.385).x - 8)}" y="${num(distort(127.316, 36.385).y)}" fill="${subway}" text-anchor="end">1호선 지하철</text>
    <text x="${num(distort(127.451, 36.407).x + 7)}" y="${num(distort(127.451, 36.407).y - 10)}" fill="${ink}" text-anchor="start">2호선 트램 · 공사중</text>
  </g>

  <g id="17-landmarks" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" fill="${ink}">
    ${landmarks
      .map(
        ({ name, x, y, dx, dy, anchor }) => `<g id="landmark-${escapeXml(name)}">
      <circle cx="${num(x)}" cy="${num(y)}" r="5.5" fill="${ink}"/>
      <text x="${num(x + dx)}" y="${num(y + dy)}" text-anchor="${anchor}" font-size="11.5" font-weight="700">${escapeXml(name)}</text>
    </g>`,
      )
      .join('\n    ')}
  </g>

  <g id="18-origin" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" fill="${ink}">
    <circle cx="${center.x}" cy="${center.y}" r="14" fill="${tram}" stroke="${ink}" stroke-width="3"/>
    <circle cx="${center.x}" cy="${center.y}" r="4.5" fill="${ink}"/>
    <text x="${center.x + 20}" y="${center.y - 12}" font-size="14" font-weight="800">${origin.label}</text>
    <text x="${center.x + 20}" y="${center.y + 8}" font-size="11">출발점</text>
  </g>
</svg>
`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, svg, 'utf8');
console.log(OUTPUT);
