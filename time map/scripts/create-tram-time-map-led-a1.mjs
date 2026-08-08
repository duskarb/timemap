import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const mapPath = path.join(ROOT, 'exports', 'daejeon-transit-time-map-preview.png');
const out = path.join(ROOT, 'exports', 'daejeon-tram-time-map-led-A1.svg');
if (!fs.existsSync(mapPath)) throw new Error(`Missing source image: ${mapPath}`);

const map = `data:image/png;base64,${fs.readFileSync(mapPath).toString('base64')}`;
const W = 1600;
const H = 2264; // A1 portrait ratio, 594 × 841 mm
const ink = '#0A0A0A';
const gray = '#9B9B96';
const pale = '#ECECE8';
const paper = '#FFFFFF';

// Placeholder values deliberately sit in data objects so the final calculated
// government-complex-station model can replace the numbers without re-laying out.
const dunsan = [
  ['유성구', 28, 16, 12],
  ['서구', 20, 11, 9],
  ['중구', 31, 23, 8],
  ['동구', 38, 31, 7],
  ['대덕구', 35, 26, 9],
];
const crossGu = [
  ['유성구', 8.4],
  ['서구', 7.6],
  ['중구', 6.1],
  ['동구', 5.3],
  ['대덕구', 7.2],
];
const esc = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function dunsanRow([gu, before, after, save], i) {
  const y = 1570 + i * 56;
  const beforeW = before * 7.2;
  const afterW = after * 7.2;
  return `<g>
    <text x="90" y="${y + 16}" font-size="19" font-weight="900">${esc(gu)}</text>
    <rect x="205" y="${y}" width="${beforeW}" height="14" fill="${pale}"/>
    <rect x="205" y="${y + 18}" width="${afterW}" height="14" fill="${ink}"/>
    <text x="${205 + beforeW + 12}" y="${y + 14}" font-size="16" font-weight="750" fill="${gray}">${before}</text>
    <text x="${205 + afterW + 12}" y="${y + 32}" font-size="16" font-weight="900">${after}</text>
    <text x="635" y="${y + 27}" font-size="26" font-weight="950">−${save}</text>
    <text x="691" y="${y + 27}" font-size="16" font-weight="800" fill="${gray}">분</text>
  </g>`;
}

function averageRow([gu, save], i) {
  const y = 1570 + i * 56;
  const w = save * 31;
  return `<g>
    <text x="884" y="${y + 18}" font-size="19" font-weight="900">${esc(gu)}</text>
    <rect x="1000" y="${y}" width="300" height="30" fill="${pale}"/>
    <rect x="1000" y="${y}" width="${w}" height="30" fill="${ink}"/>
    <text x="1330" y="${y + 25}" font-size="28" font-weight="950">−${save}</text>
    <text x="1407" y="${y + 24}" font-size="16" font-weight="800" fill="${gray}">분</text>
  </g>`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="594mm" height="841mm" viewBox="0 0 ${W} ${H}">
  <title>대전, 생각보다 가깝네? — 시간지도 중심 A1 인포그래픽</title>
  <desc>정부청사역을 출발점으로 두는 대전 트램 시간지도와 세 가지 보조 인포그래픽을 담은 A1 흑백 포스터 시안.</desc>
  <defs>
    <filter id="mono"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.25" intercept="-0.08"/><feFuncG type="linear" slope="1.25" intercept="-0.08"/><feFuncB type="linear" slope="1.25" intercept="-0.08"/></feComponentTransfer></filter>
    <clipPath id="mapClip"><rect x="64" y="264" width="1472" height="1180"/></clipPath>
    <style>text { font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif; letter-spacing: -1.1px; }</style>
  </defs>
  <rect width="${W}" height="${H}" fill="${paper}"/>

  <g id="header">
    <text x="64" y="80" font-size="23" font-weight="900" letter-spacing="1">DAEJEON TRAM 02 / TIME, NOT DISTANCE</text>
    <line x1="64" y1="108" x2="1536" y2="108" stroke="${ink}" stroke-width="3"/>
    <text x="64" y="200" font-size="84" font-weight="950">대전, 생각보다 가깝네?</text>
    <text x="69" y="238" font-size="23" font-weight="750" fill="${gray}">정부청사역에서 시작하면, 대전은 몇 분으로 다시 그려질까.</text>
    <rect x="1280" y="148" width="256" height="72" fill="${ink}"/>
    <text x="1302" y="179" font-size="18" font-weight="900" fill="${paper}">원 한 칸</text>
    <text x="1302" y="207" font-size="30" font-weight="950" fill="${paper}">15분</text>
  </g>

  <!-- Main map gets more than half the poster's visual weight. -->
  <g id="main-time-map">
    <rect x="64" y="264" width="1472" height="1180" fill="${pale}" stroke="${ink}" stroke-width="3"/>
    <g clip-path="url(#mapClip)">
      <image href="${map}" x="178" y="262" width="1240" height="1240" filter="url(#mono)"/>
    </g>
    <!-- Cover the source map's own title; this poster supplies the new reading key. -->
    <rect x="88" y="288" width="1424" height="66" fill="${gray}"/>
    <rect x="88" y="288" width="288" height="42" fill="${ink}"/>
    <text x="104" y="317" font-size="20" font-weight="900" fill="${paper}">정부청사역 중심 시간지도</text>
    <g id="government-origin">
      <circle cx="806" cy="824" r="21" fill="${paper}" stroke="${ink}" stroke-width="5"/>
      <circle cx="806" cy="824" r="7" fill="${ink}"/>
      <line x1="827" y1="808" x2="938" y2="734" stroke="${ink}" stroke-width="2.5"/>
      <rect x="938" y="698" width="270" height="70" fill="${paper}" stroke="${ink}" stroke-width="2.5"/>
      <text x="957" y="730" font-size="21" font-weight="950">0분: 정부청사역</text>
      <text x="957" y="754" font-size="16" font-weight="750" fill="${gray}">원 한 칸 = 15분</text>
    </g>
    <text x="88" y="1412" font-size="18" font-weight="800" fill="${gray}">트램 선을 따라 가까워진 생활권을, ‘거리’가 아닌 ‘도착 시간’으로 읽는다.</text>
  </g>

  <!-- Support 1 + 2: two ways of reading the same map -->
  <g id="dunsan-access">
    <line x1="64" y1="1500" x2="744" y2="1500" stroke="${ink}" stroke-width="4"/>
    <text x="64" y="1542" font-size="18" font-weight="900" fill="${gray}">01 / 둔산동까지</text>
    <text x="64" y="1588" font-size="36" font-weight="950">구별 도착시간은 얼마나 줄까?</text>
    <text x="64" y="1620" font-size="17" font-weight="700" fill="${gray}">윗줄 현재 · 아랫줄 트램 연결 후 / 분</text>
    ${dunsan.map(dunsanRow).join('')}
  </g>
  <g id="cross-district-average">
    <line x1="824" y1="1500" x2="1536" y2="1500" stroke="${ink}" stroke-width="4"/>
    <text x="824" y="1542" font-size="18" font-weight="900" fill="${gray}">02 / 도시 전체</text>
    <text x="824" y="1588" font-size="36" font-weight="950">다른 구까지의 평균은?</text>
    <text x="824" y="1620" font-size="17" font-weight="700" fill="${gray}">각 구 → 나머지 4개 구 평균 단축시간</text>
    ${crossGu.map(averageRow).join('')}
  </g>

  <!-- Support 3: converts one commute into lived time. -->
  <g id="commute-story">
    <rect x="64" y="1908" width="1472" height="244" fill="${ink}"/>
    <text x="90" y="1950" font-size="18" font-weight="900" fill="${paper}">03 / 대표 출퇴근 축</text>
    <text x="90" y="1998" font-size="37" font-weight="950" fill="${paper}">관저1동 → 둔산2동</text>
    <text x="90" y="2030" font-size="17" font-weight="700" fill="#C7C7C2">통근 OD 상위 조합 확정 후 출발·도착지와 수치 교체</text>
    <text x="90" y="2106" font-size="30" font-weight="950" fill="${paper}">46분</text>
    <text x="198" y="2103" font-size="23" font-weight="750" fill="#C7C7C2">→</text>
    <text x="238" y="2106" font-size="30" font-weight="950" fill="${paper}">33분</text>
    <text x="350" y="2104" font-size="17" font-weight="800" fill="#C7C7C2">편도</text>
    <line x1="500" y1="1950" x2="500" y2="2128" stroke="#555550" stroke-width="2"/>
    <text x="542" y="1988" font-size="18" font-weight="800" fill="#C7C7C2">하루 왕복</text>
    <text x="542" y="2040" font-size="53" font-weight="950" fill="${paper}">26분</text>
    <text x="793" y="1988" font-size="18" font-weight="800" fill="#C7C7C2">한 달 / 20일</text>
    <text x="793" y="2040" font-size="53" font-weight="950" fill="${paper}">8시간 40분</text>
    <text x="1153" y="1988" font-size="18" font-weight="800" fill="#C7C7C2">1년 / 220일</text>
    <text x="1153" y="2040" font-size="53" font-weight="950" fill="${paper}">95시간 20분</text>
    <text x="542" y="2091" font-size="17" font-weight="700" fill="#C7C7C2">13분 × 2</text>
    <text x="793" y="2091" font-size="17" font-weight="700" fill="#C7C7C2">26분 × 20일</text>
    <text x="1153" y="2091" font-size="17" font-weight="700" fill="#C7C7C2">26분 × 220일</text>
  </g>

  <g id="notes">
    <text x="64" y="2200" font-size="15" font-weight="900">METHOD</text>
    <text x="155" y="2200" font-size="15" font-weight="650" fill="${gray}">현재 수치는 레이아웃 검증을 위한 예시. 정부청사역 기준 시간왜곡·구별 OD·통근 OD를 같은 분석 기준으로 산출해 교체한다.</text>
    <text x="64" y="2231" font-size="14" font-weight="650" fill="${gray}">A1 세로 594 × 841mm / 흑백 인쇄 기준 / 지도는 정보를 담고, 세 보조 차트는 지도에서 읽은 시간을 검증한다.</text>
  </g>
</svg>`;

fs.writeFileSync(out, svg, 'utf8');
console.log(out);
