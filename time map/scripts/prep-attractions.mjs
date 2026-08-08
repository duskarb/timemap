// Curated Seoul tourist attractions (museums, palaces, parks, landmarks).
// WGS84 lat/lng -> EPSG:5179 (UTM-K) x/y so they share the station coordinate space.
//
// NOTE: this is a well-known curated set standing in for an official
// "서울시 선정 관광명소" list; swap in an official dataset later if desired.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const EPSG5179 =
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';

// [name, category, lat, lng]
const SOURCE = [
  ['경복궁', '고궁', 37.5796, 126.977],
  ['창덕궁', '고궁', 37.5794, 126.991],
  ['창경궁', '고궁', 37.5785, 126.995],
  ['덕수궁', '고궁', 37.5658, 126.9751],
  ['경희궁', '고궁', 37.5715, 126.9685],
  ['종묘', '문화유산', 37.5745, 126.994],
  ['북촌한옥마을', '명소', 37.5826, 126.983],
  ['남산서울타워', '명소', 37.5512, 126.9882],
  ['국립중앙박물관', '박물관', 37.524, 126.9803],
  ['국립민속박물관', '박물관', 37.5817, 126.9793],
  ['서대문형무소역사관', '박물관', 37.5745, 126.956],
  ['국립현대미술관 서울', '미술관', 37.5787, 126.98],
  ['서울시립미술관', '미술관', 37.564, 126.9738],
  ['리움미술관', '미술관', 37.5384, 126.999],
  ['아모레퍼시픽미술관', '미술관', 37.5296, 126.9648],
  ['예술의전당', '공연', 37.479, 127.013],
  ['세종문화회관', '공연', 37.572, 126.976],
  ['DDP 동대문디자인플라자', '명소', 37.5665, 127.009],
  ['서울숲', '공원', 37.5443, 127.0374],
  ['여의도한강공원', '공원', 37.5285, 126.933],
  ['올림픽공원', '공원', 37.5202, 127.121],
  ['월드컵공원 하늘공원', '공원', 37.571, 126.883],
  ['북서울꿈의숲', '공원', 37.6205, 127.056],
  ['서울대공원', '공원', 37.427, 127.017],
  ['뚝섬한강공원', '공원', 37.531, 127.066],
  ['롯데월드', '명소', 37.5111, 127.098],
  ['서울스카이 롯데타워', '명소', 37.5125, 127.1025],
  ['코엑스', '명소', 37.5115, 127.059],
  ['63스퀘어', '명소', 37.5199, 126.9403],
  ['청계천', '명소', 37.569, 126.9784],
  ['광장시장', '시장', 37.5701, 126.9997],
  ['남대문시장', '시장', 37.5591, 126.9776],
  ['동대문시장', '시장', 37.57, 127.009],
  ['인사동', '명소', 37.574, 126.9855],
  ['명동', '명소', 37.5636, 126.985],
  ['홍대거리', '명소', 37.556, 126.9236],
  ['이태원', '명소', 37.5346, 126.9945],
  ['노들섬', '명소', 37.5175, 126.9585],
];

const attractions = SOURCE.map(([name, category, lat, lng]) => {
  const [x, y] = proj4('WGS84', EPSG5179, [lng, lat]);
  return { name, category, x: Math.round(x), y: Math.round(y) };
});

writeFileSync(resolve(root, 'src/data/attractions.json'), JSON.stringify(attractions));
console.log(`attractions: ${attractions.length}`);
console.log('sample:', attractions.slice(0, 3));
