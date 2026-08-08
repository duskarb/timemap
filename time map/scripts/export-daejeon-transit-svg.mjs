import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'exports');
const OUTPUT = path.join(OUTPUT_DIR, 'daejeon-transit-time-map.svg');

const origin = {
  name: '유성구 어은동 113-11',
  roadName: '어은로48번길 25',
  lon: 127.3578804,
  lat: 36.3630166,
};

const sourceFiles = {
  city: '/private/tmp/daejeon-boundary.geojson',
  yuseong: '/private/tmp/yuseong.geojson',
  seo: '/private/tmp/seo.geojson',
  jung: '/private/tmp/jung.geojson',
  dong: '/private/tmp/dong.geojson',
  daedeok: '/private/tmp/daedeok.geojson',
  osm: '/private/tmp/daejeon-osm.json',
};

for (const [name, file] of Object.entries(sourceFiles)) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${name} source: ${file}`);
  }
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const cityGeo = readJson(sourceFiles.city);
const osm = readJson(sourceFiles.osm);
const districtSources = [
  ['유성구', sourceFiles.yuseong],
  ['서구', sourceFiles.seo],
  ['중구', sourceFiles.jung],
  ['동구', sourceFiles.dong],
  ['대덕구', sourceFiles.daedeok],
].map(([name, file]) => ({ name, geo: readJson(file) }));

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
  (el) => el.type === 'node' && el.tags?.railway === 'station' && el.tags?.name,
);
const metroStations = metroOrder
  .map((name) => stationNodes.find((node) => node.tags.name === name))
  .filter(Boolean)
  .map((node, index) => ({
    name: metroOrder[index],
    lon: node.lon,
    lat: node.lat,
    index,
  }));

if (metroStations.length !== metroOrder.length) {
  const found = new Set(metroStations.map((station) => station.name));
  const missing = metroOrder.filter((name) => !found.has(name));
  throw new Error(`Missing metro stations: ${missing.join(', ')}`);
}

const originStationIndex = metroOrder.indexOf('월평');
const cosLat = Math.cos((origin.lat * Math.PI) / 180);
const kmFromOrigin = (lon, lat) => ({
  x: (lon - origin.lon) * 111.32 * cosLat,
  y: (lat - origin.lat) * 110.574,
});
const kmDistance = (aLon, aLat, bLon, bLat) => {
  const x = (aLon - bLon) * 111.32 * cosLat;
  const y = (aLat - bLat) * 110.574;
  return Math.hypot(x, y);
};

/**
 * Weekday daytime concept model:
 * - walk: 4.55 km/h
 * - surface transit: 8 min access/wait + 18.2 km/h
 * - metro: 10.5 min origin access + 4 min wait + 1.95 min/stop + final walk
 *
 * This is intentionally a legible design model, not a live timetable result.
 */
function transitMinutes(lon, lat) {
  const p = kmFromOrigin(lon, lat);
  const distance = Math.hypot(p.x, p.y);
  const walk = distance * 13.19;
  const surfaceTransit = 8 + distance * 3.3;
  let metro = Number.POSITIVE_INFINITY;

  for (const station of metroStations) {
    const finalWalk = kmDistance(lon, lat, station.lon, station.lat) * 13.19;
    const ride = Math.abs(station.index - originStationIndex) * 1.95;
    metro = Math.min(metro, 10.5 + 4 + ride + finalWalk);
  }

  return Math.min(walk, surfaceTransit, metro);
}

const width = 1440;
const height = 1240;
const center = { x: width / 2, y: 675 };
const pixelsPerMinute = 7.05;

function distort(lon, lat) {
  const p = kmFromOrigin(lon, lat);
  const distance = Math.hypot(p.x, p.y);
  if (distance < 0.0001) return { x: center.x, y: center.y, minutes: 0 };
  const minutes = transitMinutes(lon, lat);
  const radius = minutes * pixelsPerMinute;
  const angle = Math.atan2(p.y, p.x);
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y - Math.sin(angle) * radius,
    minutes,
  };
}

const n = (value) => Number(value.toFixed(1));
const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function simplify(points, threshold = 1.2) {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= threshold) {
      kept.push(point);
      last = point;
    }
  }
  kept.push(points.at(-1));
  return kept;
}

function linePath(coords, close = false, threshold = 1.2) {
  const points = simplify(
    coords.map(([lon, lat]) => distort(lon, lat)),
    threshold,
  );
  if (!points.length) return '';
  const commands = [`M${n(points[0].x)},${n(points[0].y)}`];
  for (const point of points.slice(1)) {
    commands.push(`L${n(point.x)},${n(point.y)}`);
  }
  if (close) commands.push('Z');
  return commands.join('');
}

function geometryPath(geometry, threshold = 1.2) {
  if (!geometry) return '';
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => linePath(ring, true, threshold)).join('');
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => linePath(ring, true, threshold)))
      .join('');
  }
  if (geometry.type === 'LineString') {
    return linePath(geometry.coordinates, false, threshold);
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.map((line) => linePath(line, false, threshold)).join('');
  }
  return '';
}

function featurePath(collection, threshold = 1.2) {
  return collection.features.map((feature) => geometryPath(feature.geometry, threshold)).join('');
}

const cityGeometry = cityGeo.features[0]?.geometry;
const cityPolygons =
  cityGeometry?.type === 'Polygon'
    ? [cityGeometry.coordinates]
    : cityGeometry?.type === 'MultiPolygon'
      ? cityGeometry.coordinates
      : [];

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function insideCity(lon, lat) {
  return cityPolygons.some((polygon) => {
    if (!pointInRing(lon, lat, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  });
}

function splitInsideCity(coords) {
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

const cityPath = featurePath(cityGeo, 0.9);
const districtPaths = districtSources.map(({ name, geo }) => ({
  name,
  d: featurePath(geo, 0.9),
}));

const roadsByClass = new Map([
  ['motorway', []],
  ['trunk', []],
  ['primary', []],
  ['secondary', []],
]);
const rivers = [];
for (const element of osm.elements) {
  if (element.type !== 'way' || !element.geometry?.length) continue;
  const coords = element.geometry.map((point) => [point.lon, point.lat]);
  if (roadsByClass.has(element.tags?.highway)) {
    for (const run of splitInsideCity(coords)) {
      roadsByClass.get(element.tags.highway).push(linePath(run, false, 1.7));
    }
  }
  if (element.tags?.waterway === 'river') {
    for (const run of splitInsideCity(coords)) {
      rivers.push(linePath(run, false, 1.3));
    }
  }
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
      0.7,
    ),
  );

const districtLabelLocations = [
  ['유성구', 127.301, 36.395],
  ['서구', 127.348, 36.293],
  ['중구', 127.412, 36.286],
  ['동구', 127.477, 36.326],
  ['대덕구', 127.427, 36.414],
];

const labelledStations = new Set([
  '반석',
  '유성온천',
  '월평',
  '정부청사',
  '시청',
  '서대전네거리',
  '중앙로',
  '대전역',
  '판암',
]);

const landmarkLocations = [
  ['KAIST', 127.3633, 36.3721],
  ['DCC', 127.3916, 36.3754],
  ['대전복합터미널', 127.4366, 36.3508],
  ['신탄진역', 127.4282, 36.4496],
];

const rings = [15, 30, 45, 60, 75];
const districtPalette = ['#EEF3E8', '#F2EEE5', '#F1E9EA', '#E9EFF3', '#EEEAF3'];

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>대전 대중교통 시간 지도 — 유성구 어은동 113-11 기준</title>
  <desc>실제 방위는 유지하고 중심 주소에서의 대중교통 예상 이동시간을 반지름으로 사용해 대전의 행정 경계, 주요 도로, 하천과 도시철도 1호선을 왜곡한 편집 가능한 벡터 지도입니다.</desc>
  <metadata>
    Origin: ${esc(origin.name)} (${origin.lat}, ${origin.lon})
    Address coordinate: OpenStreetMap road-centre approximation
    Geometry: OpenStreetMap contributors, ODbL 1.0
    Model: weekday daytime concept model; not a live timetable
    Generated: ${new Date().toISOString()}
  </metadata>

  <g id="00-background">
    <rect width="${width}" height="${height}" fill="#F8F7F3"/>
  </g>

  <g id="01-title" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" fill="#1F2933">
    <text x="72" y="68" font-size="34" font-weight="700">대전 대중교통 시간 지도</text>
    <text x="72" y="101" font-size="16" fill="#58636F">기준: ${esc(origin.name)} · 평일 낮 개념 모델 · 방위 유지 / 반지름 = 예상 이동시간</text>
  </g>

  <g id="02-time-rings" fill="none" stroke="#8795A5" stroke-width="1" stroke-dasharray="4 7" opacity="0.6">
    ${rings.map((minutes) => `<circle cx="${center.x}" cy="${center.y}" r="${n(minutes * pixelsPerMinute)}"/>`).join('\n    ')}
  </g>
  <g id="03-time-ring-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="13" fill="#6B7682" text-anchor="middle">
    ${rings
      .map(
        (minutes) =>
          `<text x="${center.x}" y="${n(center.y - minutes * pixelsPerMinute - 7)}">${minutes}분</text>`,
      )
      .join('\n    ')}
  </g>

  <g id="04-district-fills" fill-rule="evenodd">
    ${districtPaths
      .map(
        ({ name, d }, index) =>
          `<path id="district-${index + 1}-${esc(name)}" d="${d}" fill="${districtPalette[index]}" stroke="none"/>`,
      )
      .join('\n    ')}
  </g>
  <g id="05-city-boundary" fill="none" stroke="#27323C" stroke-width="3" stroke-linejoin="round">
    <path d="${cityPath}"/>
  </g>
  <g id="06-district-boundaries" fill="none" stroke="#7A858F" stroke-width="1.3" stroke-linejoin="round" opacity="0.9">
    ${districtPaths.map(({ d }) => `<path d="${d}"/>`).join('\n    ')}
  </g>

  <g id="07-rivers" fill="none" stroke="#73B9DD" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
    ${rivers.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="08-secondary-roads" fill="none" stroke="#C2C8CE" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">
    ${roadsByClass.get('secondary').map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="09-primary-roads" fill="none" stroke="#9EA8B1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    ${[...roadsByClass.get('primary'), ...roadsByClass.get('trunk')]
      .map((d) => `<path d="${d}"/>`)
      .join('\n    ')}
  </g>
  <g id="10-motorways" fill="none" stroke="#7B8792" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    ${roadsByClass.get('motorway').map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>

  <g id="11-metro-line-underlay" fill="none" stroke="#F8F7F3" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    ${metroPaths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="12-metro-line-1" fill="none" stroke="#E45C37" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    ${metroPaths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
  <g id="13-metro-stations" fill="#F8F7F3" stroke="#E45C37" stroke-width="2">
    ${metroStations
      .map((station) => {
        const point = distort(station.lon, station.lat);
        return `<circle id="station-${esc(station.name)}" cx="${n(point.x)}" cy="${n(point.y)}" r="4.2"/>`;
      })
      .join('\n    ')}
  </g>
  <g id="14-metro-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="12" fill="#343F49">
    ${metroStations
      .filter((station) => labelledStations.has(station.name))
      .map((station) => {
        const point = distort(station.lon, station.lat);
        const anchor = point.x < center.x ? 'end' : 'start';
        const dx = point.x < center.x ? -9 : 9;
        return `<text x="${n(point.x + dx)}" y="${n(point.y - 7)}" text-anchor="${anchor}">${esc(station.name)}</text>`;
      })
      .join('\n    ')}
  </g>

  <g id="15-district-labels" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" font-size="18" font-weight="700" fill="#5A6570" text-anchor="middle" opacity="0.82">
    ${districtLabelLocations
      .map(([name, lon, lat]) => {
        const point = distort(lon, lat);
        return `<text x="${n(point.x)}" y="${n(point.y)}">${esc(name)}</text>`;
      })
      .join('\n    ')}
  </g>

  <g id="16-landmarks" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif">
    ${landmarkLocations
      .map(([name, lon, lat]) => {
        const point = distort(lon, lat);
        const minutes = Math.round(point.minutes);
        return `<g id="landmark-${esc(name)}">
      <circle cx="${n(point.x)}" cy="${n(point.y)}" r="3.5" fill="#2C7A7B"/>
      <text x="${n(point.x + 8)}" y="${n(point.y - 7)}" font-size="12" fill="#34404B">${esc(name)} · 약 ${minutes}분</text>
    </g>`;
      })
      .join('\n    ')}
  </g>

  <g id="17-origin" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif">
    <circle cx="${center.x}" cy="${center.y}" r="17" fill="#1E2933" opacity="0.14"/>
    <circle cx="${center.x}" cy="${center.y}" r="8" fill="#1E2933"/>
    <path d="M${center.x - 13},${center.y}H${center.x + 13}M${center.x},${center.y - 13}V${center.y + 13}" stroke="#1E2933" stroke-width="2"/>
    <text x="${center.x + 19}" y="${center.y - 15}" font-size="15" font-weight="700" fill="#1E2933">${esc(origin.name)}</text>
    <text x="${center.x + 19}" y="${center.y + 6}" font-size="12" fill="#5F6A75">출발점 · ${esc(origin.roadName)}</text>
  </g>

  <g id="18-north-arrow" transform="translate(1325 92)" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif" fill="#25313B">
    <path d="M0,-20 L8,7 L0,3 L-8,7 Z" fill="#25313B"/>
    <text x="0" y="25" text-anchor="middle" font-size="13" font-weight="700">N</text>
  </g>

  <g id="19-legend" transform="translate(72 1094)" font-family="Noto Sans KR, Apple SD Gothic Neo, sans-serif">
    <line x1="0" y1="0" x2="36" y2="0" stroke="#E45C37" stroke-width="5" stroke-linecap="round"/>
    <text x="48" y="5" font-size="13" fill="#3F4A54">도시철도 1호선</text>
    <line x1="183" y1="0" x2="219" y2="0" stroke="#9EA8B1" stroke-width="1.5"/>
    <text x="231" y="5" font-size="13" fill="#3F4A54">주요 도로</text>
    <line x1="331" y1="0" x2="367" y2="0" stroke="#73B9DD" stroke-width="2.3"/>
    <text x="379" y="5" font-size="13" fill="#3F4A54">하천</text>
    <circle cx="462" cy="0" r="5" fill="#1E2933"/>
    <text x="475" y="5" font-size="13" fill="#3F4A54">기준점</text>
    <text x="0" y="34" font-size="12" fill="#6B7682">링 간격 15분 · 색상/선/텍스트는 피그마에서 그룹별 편집 가능</text>
    <text x="0" y="56" font-size="11" fill="#7C8791">시간은 도보·간선 대중교통·도시철도 1호선을 조합한 디자인용 추정치이며 실시간 길찾기 결과가 아닙니다.</text>
    <text x="0" y="77" font-size="11" fill="#7C8791">지도 선형: © OpenStreetMap contributors, ODbL 1.0</text>
  </g>
</svg>
`;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, svg, 'utf8');
console.log(OUTPUT);
