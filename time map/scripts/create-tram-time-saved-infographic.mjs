import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const inputPath = path.join(ROOT, 'exports', 'daejeon-transit-time-map-preview.png');
const outputPath = path.join(ROOT, 'exports', 'daejeon-tram-time-saved-infographic.svg');

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing source image: ${inputPath}`);
}

const imageData = fs.readFileSync(inputPath).toString('base64');
const imageHref = `data:image/png;base64,${imageData}`;

const W = 1600;
const H = 2000;
const orange = '#F2522B';
const ink = '#111111';
const paper = '#F7F3E8';
const lime = '#B9FF00';
const blue = '#123D65';
const muted = '#6C5E52';

const comparisons = [
  { route: '어은동 -> 도안·관저', current: 48, tram: 35, saved: 13, x: 356, y: 1084 },
  { route: '어은동 -> 연축·대덕', current: 50, tram: 38, saved: 12, x: 902, y: 712 },
  { route: '어은동 -> 서대전역권', current: 42, tram: 31, saved: 11, x: 560, y: 1182 },
  { route: '어은동 -> 대전역', current: 36, tram: 28, saved: 8, x: 962, y: 1040 },
  { route: '어은동 -> 정부청사', current: 22, tram: 15, saved: 7, x: 752, y: 850 },
];

const maxSaved = Math.max(...comparisons.map((item) => item.saved));

const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function textLines(lines, x, y, opts = {}) {
  const size = opts.size ?? 28;
  const weight = opts.weight ?? 500;
  const fill = opts.fill ?? ink;
  const gap = opts.gap ?? Math.round(size * 1.25);
  const anchor = opts.anchor ?? 'start';
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * gap}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(line)}</text>`,
    )
    .join('\n');
}

function metricCard({ x, y, label, value, sub, w = 205, h = 158 }) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${paper}" stroke="${ink}" stroke-width="2"/>
      <text x="${x + 22}" y="${y + 42}" font-size="20" font-weight="700" fill="${muted}">${esc(label)}</text>
      <text x="${x + 22}" y="${y + 96}" font-size="46" font-weight="900" fill="${ink}">${esc(value)}</text>
      <text x="${x + 22}" y="${y + 128}" font-size="18" font-weight="600" fill="${muted}">${esc(sub)}</text>
    </g>`;
}

function barRow(item, i) {
  const x = 1176;
  const y = 826 + i * 116;
  const barW = Math.round((item.saved / maxSaved) * 260);
  return `
    <g>
      <text x="${x}" y="${y}" font-size="22" font-weight="800" fill="${ink}">${esc(item.route)}</text>
      <text x="${x}" y="${y + 31}" font-size="17" font-weight="600" fill="${muted}">현재 ${item.current}분 -> 트램 ${item.tram}분</text>
      <rect x="${x}" y="${y + 48}" width="260" height="18" rx="6" fill="#E7DED1"/>
      <rect x="${x}" y="${y + 48}" width="${barW}" height="18" rx="6" fill="${lime}" stroke="${ink}" stroke-width="2"/>
      <text x="${x + 286}" y="${y + 65}" font-size="30" font-weight="900" fill="${ink}">-${item.saved}분</text>
    </g>`;
}

function callout(item, i) {
  const dx = i % 2 === 0 ? -54 : 48;
  const dy = i === 1 ? -44 : -36;
  const w = item.saved >= 11 ? 166 : 142;
  const x = item.x + dx;
  const y = item.y + dy;
  return `
    <g>
      <line x1="${item.x}" y1="${item.y}" x2="${x + w / 2}" y2="${y + 80}" stroke="${ink}" stroke-width="2" stroke-dasharray="5 6"/>
      <rect x="${x}" y="${y}" width="${w}" height="72" rx="8" fill="${lime}" stroke="${ink}" stroke-width="3"/>
      <text x="${x + 16}" y="${y + 28}" font-size="18" font-weight="800" fill="${ink}">${esc(item.route.split(' -> ')[1])}</text>
      <text x="${x + 16}" y="${y + 58}" font-size="31" font-weight="900" fill="${ink}">-${item.saved}분</text>
    </g>`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>대전, 생각보다 가깝네? - 트램 시간 단축 인포그래픽</title>
  <desc>대전 대중교통 시간 지도 미리보기 이미지를 바탕으로 트램 도입 이후 단축되는 시간을 강조한 포스터형 인포그래픽 시안입니다.</desc>
  <defs>
    <clipPath id="mapClip">
      <rect x="72" y="438" width="1048" height="1048" rx="8"/>
    </clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="13" flood-color="#000000" flood-opacity="0.18"/>
    </filter>
    <style>
      text { font-family: "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif; letter-spacing: 0; }
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="${orange}"/>

  <g id="header">
    <text x="72" y="120" font-size="42" font-weight="900" fill="${ink}">DAEJEON / TIME SAVED MAP</text>
    <text x="72" y="236" font-size="104" font-weight="950" fill="${ink}">대전,</text>
    <text x="72" y="342" font-size="104" font-weight="950" fill="${ink}">생각보다 가깝네?</text>
    <rect x="838" y="204" width="674" height="128" rx="8" fill="${paper}" stroke="${ink}" stroke-width="3"/>
    <text x="866" y="254" font-size="30" font-weight="900" fill="${ink}">트램이 줄이는 건 거리보다 시간</text>
    <text x="866" y="298" font-size="22" font-weight="700" fill="${ink}">어은동 기준 현재 대중교통 시간지도 위에</text>
    <text x="866" y="326" font-size="22" font-weight="700" fill="${ink}">트램 연결 시나리오를 겹친 시안</text>
  </g>

  <g id="map" filter="url(#softShadow)">
    <rect x="72" y="438" width="1048" height="1048" rx="8" fill="${orange}" stroke="${ink}" stroke-width="3"/>
    <g clip-path="url(#mapClip)">
      <image href="${imageHref}" x="-79.8" y="254.8" width="1359.4" height="1359.4"/>
      <rect x="72" y="438" width="1048" height="1048" fill="#000000" opacity="0.03"/>
    </g>
    <rect x="72" y="438" width="1048" height="1048" rx="8" fill="none" stroke="${ink}" stroke-width="3"/>
    <g id="map-callouts">
      ${comparisons.map(callout).join('\n')}
    </g>
    <g id="origin-note">
      <circle cx="626" cy="943" r="18" fill="${lime}" stroke="${ink}" stroke-width="4"/>
      <circle cx="626" cy="943" r="6" fill="${ink}"/>
      <rect x="654" y="910" width="216" height="76" rx="8" fill="${paper}" stroke="${ink}" stroke-width="2"/>
      <text x="674" y="940" font-size="20" font-weight="900" fill="${ink}">출발점: 어은동</text>
      <text x="674" y="968" font-size="16" font-weight="650" fill="${muted}">15분 링을 기준으로 비교</text>
    </g>
  </g>

  <g id="summary-panel">
    <rect x="1152" y="438" width="376" height="1048" rx="8" fill="${paper}" stroke="${ink}" stroke-width="3"/>
    <text x="1176" y="502" font-size="25" font-weight="900" fill="${ink}">한 번 타면 줄어드는 시간</text>
    <text x="1176" y="553" font-size="76" font-weight="950" fill="${ink}">최대</text>
    <text x="1176" y="639" font-size="108" font-weight="950" fill="${ink}">13분</text>
    <rect x="1176" y="668" width="248" height="52" rx="8" fill="${lime}" stroke="${ink}" stroke-width="3"/>
    <text x="1200" y="703" font-size="23" font-weight="900" fill="${ink}">왕복 하루 26분</text>
    <text x="1176" y="760" font-size="18" font-weight="650" fill="${muted}">평일 20일이면 약 8시간 40분.</text>
    <text x="1176" y="788" font-size="18" font-weight="650" fill="${muted}">지도는 '가까움'을 분 단위로 읽게 한다.</text>
    <line x1="1176" y1="810" x2="1500" y2="810" stroke="${ink}" stroke-width="2"/>
    ${comparisons.map(barRow).join('\n')}
  </g>

  <g id="metric-cards">
    ${metricCard({ x: 72, y: 1542, label: '노선 규모', value: '38.8km', sub: '순환선 + 지선' })}
    ${metricCard({ x: 300, y: 1542, label: '정거장', value: '45개', sub: '생활권 접점' })}
    ${metricCard({ x: 528, y: 1542, label: '차량', value: '수소', sub: '무가선 트램' })}
    ${metricCard({ x: 756, y: 1542, label: '관점', value: '분', sub: '거리보다 시간' })}
  </g>

  <g id="bottom-note">
    <rect x="72" y="1742" width="1456" height="170" rx="8" fill="${ink}"/>
    ${textLines(['읽는 법', '초록 박스는 주요 생활권별 예상 단축 시간이다. 가장 큰 숫자를 먼저 보고, 현재 시간지도 위에서 어느 방향의 시간이 얇아지는지 따라가면 된다.'], 104, 1796, { size: 24, weight: 900, fill: paper, gap: 42 })}
    <text x="104" y="1870" font-size="18" font-weight="600" fill="#D8D0C2">시안용 수치입니다. 실제 소요시간은 운행계획, 배차, 환승, 보행 접근거리 확정 후 업데이트해야 합니다.</text>
    <text x="104" y="1902" font-size="18" font-weight="600" fill="#D8D0C2">원본 지도 기준: 어은동 113-11, 15분 간격 시간 원. 트램 사업 기본 정보: 총연장 38.8km, 정거장 45개소.</text>
  </g>
</svg>
`;

fs.writeFileSync(outputPath, svg, 'utf8');
console.log(outputPath);
