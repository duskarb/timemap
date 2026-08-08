import fs from 'node:fs';
import path from 'node:path';

const input =
  '/Users/namkyuyeo/.codex/attachments/dc13c75f-8c6a-4482-9cb0-3897b34a6896/pasted-text.txt';
const outputDir = path.join(process.cwd(), 'exports', 'color-variants');
const source = fs.readFileSync(input, 'utf8');

const palettes = [
  {
    file: '01-paper-lime.svg',
    canvas: '#FFFFFF',
    outer: '#E4E7E5',
    outerMid: '#F0F2F1',
    middle: '#FFFFFF',
    inner: '#DFF2E6',
    map: '#FBFCFB',
    tram: '#A7E000',
    subway: '#273C75',
    ink: '#181818',
    admin: '#A7ADAA',
    label: '#757C79',
  },
  {
    file: '02-cobalt-coral.svg',
    canvas: '#F4F1EA',
    outer: '#B8C8E5',
    outerMid: '#DCE5F3',
    middle: '#FFFDF8',
    inner: '#F5D5C7',
    map: '#F8F5ED',
    tram: '#F04D32',
    subway: '#154177',
    ink: '#172033',
    admin: '#9DA7B7',
    label: '#697487',
  },
  {
    file: '03-warm-editorial.svg',
    canvas: '#F3ECE2',
    outer: '#D6B38E',
    outerMid: '#E7835E',
    middle: '#FFF9F0',
    inner: '#F0D8A8',
    map: '#F7F0E6',
    tram: '#C93E28',
    subway: '#24506E',
    ink: '#211A17',
    admin: '#B0A297',
    label: '#75685F',
  },
];

function replaceAllLiteral(text, from, to) {
  return text.split(from).join(to);
}

function recolor(palette) {
  let svg = source;
  svg = svg.replace(
    '<rect width="1335" height="1193" fill="white"/>',
    `<rect width="1335" height="1193" fill="${palette.canvas}"/>`,
  );
  svg = svg.replace('fill="#EF673A"', `fill="${palette.outer}"`);
  svg = svg.replace('fill="#FF4F23"', `fill="${palette.outerMid}"`);
  svg = svg.replace(
    'fill="white" stroke="#171717" stroke-width="2.875"',
    `fill="${palette.middle}" stroke="${palette.ink}" stroke-width="2.875"`,
  );
  svg = svg.replace('fill="#21FF4A"', `fill="${palette.inner}"`);

  svg = replaceAllLiteral(svg, '#F4F1E8', palette.map);
  svg = replaceAllLiteral(svg, '#C7FF00', palette.tram);
  svg = replaceAllLiteral(svg, '#173D68', palette.subway);
  svg = replaceAllLiteral(svg, '#171717', palette.ink);
  svg = replaceAllLiteral(svg, '#77736C', palette.admin);
  svg = replaceAllLiteral(svg, '#5F5B55', palette.label);
  svg = replaceAllLiteral(svg, 'stroke="black"', `stroke="${palette.ink}"`);
  svg = replaceAllLiteral(svg, 'fill="black"', `fill="${palette.ink}"`);
  return svg;
}

fs.mkdirSync(outputDir, { recursive: true });
for (const palette of palettes) {
  fs.writeFileSync(path.join(outputDir, palette.file), recolor(palette), 'utf8');
}

console.log(outputDir);
