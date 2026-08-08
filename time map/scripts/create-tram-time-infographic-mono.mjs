import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const sourcePath = path.join(ROOT, 'exports', 'daejeon-transit-time-map-preview.png');
const outputPath = path.join(ROOT, 'exports', 'daejeon-tram-time-infographic-mono.svg');

if (!fs.existsSync(sourcePath)) throw new Error(`Missing source image: ${sourcePath}`);

const mapHref = `data:image/png;base64,${fs.readFileSync(sourcePath).toString('base64')}`;
const W = 1600;
// A1 portrait: 594 × 841 mm. Keep the viewBox proportional to the paper,
// so the same SVG is safe to place directly in an A1 print layout.
const H = 2264;
const ink = '#0B0B0B';
const white = '#FFFFFF';
const gray = '#D9D9D4';
const mid = '#737373';
const light = '#F2F2EF';

const trips = [
  { place: '도안·관저', current: 48, tram: 35, saved: 13, x: 298, y: 1160, align: 'start' },
  { place: '연축·대덕', current: 50, tram: 38, saved: 12, x: 810, y: 734, align: 'start' },
  { place: '서대전역권', current: 42, tram: 31, saved: 11, x: 455, y: 1270, align: 'start' },
  { place: '대전역', current: 36, tram: 28, saved: 8, x: 903, y: 1118, align: 'start' },
  { place: '신탄진·대덕', current: 34, tram: 27, saved: 7, x: 700, y: 865, align: 'start' },
];

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const metric = (x, value, label, note) => `
  <g>
    <text x="${x}" y="1890" font-size="72" font-weight="950">${esc(value)}</text>
    <text x="${x}" y="1932" font-size="22" font-weight="800" fill="${mid}">${esc(label)}</text>
    <text x="${x}" y="1970" font-size="18" font-weight="650" fill="${mid}">${esc(note)}</text>
  </g>`;

const tripRow = (trip, i) => {
  const y = 760 + i * 148;
  const width = Math.round((trip.saved / 13) * 204);
  return `
    <g>
      <text x="1144" y="${y}" font-size="25" font-weight="900">정부청사역 → ${esc(trip.place)}</text>
      <text x="1144" y="${y + 34}" font-size="19" font-weight="650" fill="${mid}">${trip.current}분 → ${trip.tram}분</text>
      <rect x="1144" y="${y + 56}" width="236" height="15" fill="${gray}"/>
      <rect x="1144" y="${y + 56}" width="${width}" height="15" fill="${ink}"/>
      <text x="1412" y="${y + 72}" font-size="39" font-weight="950">−${trip.saved}</text>
      <text x="1482" y="${y + 71}" font-size="17" font-weight="800" fill="${mid}">분</text>
    </g>`;
};

const tag = (trip) => {
  const w = trip.saved > 10 ? 152 : 134;
  const x = trip.x;
  const y = trip.y;
  return `
    <g>
      <line x1="${x + w / 2}" y1="${y + 68}" x2="${x + w / 2 + 16}" y2="${y + 96}" stroke="${ink}" stroke-width="2" stroke-dasharray="4 5"/>
      <rect x="${x}" y="${y}" width="${w}" height="68" rx="2" fill="${white}" stroke="${ink}" stroke-width="2.5"/>
      <text x="${x + 13}" y="${y + 27}" font-size="17" font-weight="900">${esc(trip.place)}</text>
      <text x="${x + 13}" y="${y + 55}" font-size="30" font-weight="950">−${trip.saved}분</text>
    </g>`;
};

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="594mm" height="841mm" viewBox="0 0 ${W} ${H}">
  <title>대전, 생각보다 가깝네? — 대전 트램 시간지도 인포그래픽</title>
  <desc>어은동 출발 기준, 대전 트램 연결 시나리오가 줄이는 시간을 중심에 둔 흑백 인포그래픽.</desc>
  <defs>
    <filter id="mono" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.4" intercept="-0.14"/>
        <feFuncG type="linear" slope="1.4" intercept="-0.14"/>
        <feFuncB type="linear" slope="1.4" intercept="-0.14"/>
      </feComponentTransfer>
    </filter>
    <clipPath id="mapClip"><rect x="64" y="490" width="1012" height="1088" rx="2"/></clipPath>
    <style>
      text { font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif; letter-spacing: -1.2px; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="${white}"/>

  <!-- Header: title to number, the primary eye path -->
  <g id="01-header">
    <text x="64" y="86" font-size="24" font-weight="900" letter-spacing="1px">DAEJEON TRAM 02  /  TIME MAP</text>
    <line x1="64" y1="116" x2="1536" y2="116" stroke="${ink}" stroke-width="3"/>
    <text x="64" y="238" font-size="104" font-weight="950">대전,</text>
    <text x="64" y="354" font-size="104" font-weight="950">생각보다 가깝네?</text>
    <text x="70" y="414" font-size="27" font-weight="750" fill="${mid}">트램은 도시에 새 선을 긋고, 시민의 하루에서는 시간을 지운다.</text>
    <g aria-label="maximum time saved">
      <rect x="1124" y="164" width="412" height="252" fill="${ink}"/>
      <text x="1152" y="212" font-size="20" font-weight="900" fill="${white}" letter-spacing="0">한 번 이동에서 가장 크게</text>
      <text x="1150" y="344" font-size="154" font-weight="950" fill="${white}" letter-spacing="-8">13</text>
      <text x="1384" y="344" font-size="47" font-weight="900" fill="${white}">분</text>
      <text x="1154" y="386" font-size="21" font-weight="800" fill="${white}" letter-spacing="0">정부청사역 → 도안·관저 / 48분 → 35분</text>
    </g>
  </g>

  <!-- Map: the evidence layer -->
  <g id="02-time-map">
    <rect x="64" y="490" width="1012" height="1088" fill="${light}" stroke="${ink}" stroke-width="3"/>
    <g clip-path="url(#mapClip)">
      <image href="${mapHref}" x="-59" y="360" width="1260" height="1260" filter="url(#mono)" opacity="0.88"/>
      <rect x="64" y="490" width="1012" height="1088" fill="${white}" opacity="0.08"/>
    </g>
    <rect x="64" y="490" width="1012" height="1088" fill="none" stroke="${ink}" stroke-width="3"/>
    <rect x="88" y="514" width="186" height="37" fill="${ink}"/>
    <text x="101" y="541" font-size="18" font-weight="900" fill="${white}" letter-spacing="0">정부청사역 중심 시간지도</text>
    <text x="88" y="1550" font-size="18" font-weight="750" fill="${mid}" letter-spacing="0">정부청사역을 0분에 두고, 원 한 칸을 15분으로 왜곡한 도시</text>
    ${trips.map(tag).join('\n')}
    <g id="origin">
      <circle cx="694" cy="994" r="16" fill="${white}" stroke="${ink}" stroke-width="4"/>
      <circle cx="694" cy="994" r="5" fill="${ink}"/>
      <line x1="710" y1="982" x2="804" y2="930" stroke="${ink}" stroke-width="2"/>
      <rect x="804" y="896" width="202" height="64" fill="${white}" stroke="${ink}" stroke-width="2"/>
      <text x="818" y="924" font-size="18" font-weight="900">출발점: 정부청사역</text>
      <text x="818" y="948" font-size="15" font-weight="700" fill="${mid}">0분 중심 / 15분 원</text>
    </g>
  </g>

  <!-- Comparison strip: precise figures second -->
  <g id="03-comparison-strip">
    <text x="1144" y="544" font-size="20" font-weight="900" fill="${mid}" letter-spacing="0">TIME SAVED / ONE-WAY</text>
    <text x="1144" y="608" font-size="52" font-weight="950">가까워진 5곳</text>
    <text x="1144" y="648" font-size="19" font-weight="650" fill="${mid}">숫자가 클수록 더 많이 줄어드는 시간</text>
    <line x1="1144" y1="690" x2="1536" y2="690" stroke="${ink}" stroke-width="3"/>
    ${trips.map(tripRow).join('\n')}
    <line x1="1144" y1="1512" x2="1536" y2="1512" stroke="${ink}" stroke-width="3"/>
    <text x="1144" y="1552" font-size="19" font-weight="800" fill="${mid}">계산의 출발점</text>
    <text x="1144" y="1588" font-size="26" font-weight="900">현재 대중교통 시간 −</text>
      <text x="1144" y="1620" font-size="26" font-weight="900">트램 연결 시나리오 시간</text>
  </g>

  <!-- Bottom: turn a trip number into lived time -->
  <g id="04-lived-time">
    <line x1="64" y1="1690" x2="1536" y2="1690" stroke="${ink}" stroke-width="5"/>
    <text x="64" y="1750" font-size="22" font-weight="900" fill="${mid}" letter-spacing="0">13분은 이동시간이 아니라, 돌아오는 시간이다.</text>
    <text x="64" y="1838" font-size="68" font-weight="950">왕복하면 하루 26분.</text>
    <rect x="944" y="1744" width="592" height="112" fill="${ink}"/>
    <text x="976" y="1791" font-size="20" font-weight="900" fill="${white}" letter-spacing="0">평일 20일, 왕복 기준</text>
    <text x="976" y="1837" font-size="42" font-weight="950" fill="${white}">한 달에 8시간 40분</text>
    ${metric(64, '38.8km', '트램 2호선 계획 연장', '순환선 + 지선')}
    ${metric(402, '45개', '계획 정거장', '생활권의 접점')}
    ${metric(684, '5곳', '시간 비교 목적지', '정부청사역 출발 기준')}
    <g>
      <text x="1038" y="1890" font-size="29" font-weight="950">읽는 순서</text>
      <text x="1038" y="1934" font-size="21" font-weight="700" fill="${mid}">① 13분  →  ② 시간지도  →  ③ 나의 하루</text>
      <text x="1038" y="1970" font-size="17" font-weight="650" fill="${mid}">‘멀다’는 감각이 몇 분의 차이인지 보여준다.</text>
    </g>
  </g>

  <g id="05-notes">
    <rect x="64" y="2040" width="1472" height="96" fill="${light}"/>
    <text x="86" y="2078" font-size="17" font-weight="800">NOTE</text>
    <text x="176" y="2078" font-size="16" font-weight="650" fill="${mid}" letter-spacing="0">시간 비교값은 시각화용 시나리오입니다. 실제 소요시간은 운행계획·배차·환승·보행 접근거리 확정 후 갱신해야 합니다.</text>
    <text x="86" y="2112" font-size="16" font-weight="650" fill="${mid}" letter-spacing="0">기준점: 정부청사역 / 원 한 칸 = 15분. 노선 정보: 총연장 38.8km, 정거장 45개소.</text>
  </g>
</svg>`;

fs.writeFileSync(outputPath, svg, 'utf8');
console.log(outputPath);
