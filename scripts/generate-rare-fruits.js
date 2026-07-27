'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const sourceDir = path.join(root, 'assets', 'rare-fruits', 'source');
const outputDir = path.join(root, 'assets', 'rare-fruits');

const common = `
<filter id="glow" x="-35%" y="-35%" width="170%" height="170%">
  <feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".76"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

function svg(defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>${common}${defs}</defs>${body}</svg>\n`;
}

function star(x, y, r, fill) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? r * 0.46 : r;
    const angle = -Math.PI / 2 + Math.PI * i / 5;
    points.push(`${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`);
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}"/>`;
}

function kiwiSeeds() {
  return Array.from({ length: 20 }, (_, i) => {
    const angle = i * Math.PI * 2 / 20;
    const x = 256 + Math.cos(angle) * 92;
    const y = 267 + Math.sin(angle) * 92;
    const degrees = angle * 180 / Math.PI + 90;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="13" transform="rotate(${degrees.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');
}

const assets = {
  'starlight-strawberry': svg(`
    <radialGradient id="berry" cx="30%" cy="20%" r="80%"><stop stop-color="#FF9498"/><stop offset=".5" stop-color="#F4516B"/><stop offset="1" stop-color="#B92D56"/></radialGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#A8EA77"/><stop offset="1" stop-color="#3BA76C"/></linearGradient>`, `
    <path d="M256 438C177 390 112 307 124 219c9-66 57-99 105-73 18-35 78-35 96 0 48-26 96 7 105 73 12 88-53 171-174 219z" fill="url(#berry)" stroke="#A72C50" stroke-width="11"/>
    <path d="M254 158c-48-36-91-34-117-12 35 5 60 20 76 45-40-5-66 9-80 32 49-7 84 2 107 28 5-39 10-69 14-93z" fill="url(#leaf)" stroke="#32875A" stroke-width="8"/>
    <path d="M258 158c48-36 91-34 117-12-35 5-60 20-76 45 40-5 66 9 80 32-49-7-84 2-107 28-5-39-10-69-14-93z" fill="url(#leaf)" stroke="#32875A" stroke-width="8"/>
    <path d="M230 145c5-43 23-68 54-80-9 30-7 59 8 88z" fill="#62C775" stroke="#32875A" stroke-width="8"/>
    <g filter="url(#glow)" stroke="#D89E2D" stroke-width="3">${star(186,245,19,'#FFDE69')}${star(271,219,19,'#FFDE69')}${star(338,273,19,'#FFDE69')}${star(223,331,19,'#FFDE69')}${star(304,354,19,'#FFDE69')}</g>
    <ellipse cx="184" cy="210" rx="31" ry="54" transform="rotate(25 184 210)" fill="url(#shine)" opacity=".64"/>`),

  'moon-grapes': svg(`
    <radialGradient id="ga" cx="30%" cy="20%" r="80%"><stop stop-color="#AAB9FF"/><stop offset=".5" stop-color="#7667E5"/><stop offset="1" stop-color="#463493"/></radialGradient>
    <radialGradient id="gb" cx="28%" cy="18%" r="82%"><stop stop-color="#C4F2FF"/><stop offset=".48" stop-color="#709BE8"/><stop offset="1" stop-color="#4B3C9A"/></radialGradient>
    <linearGradient id="vine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D9F7C8"/><stop offset="1" stop-color="#53B984"/></linearGradient>`, `
    <path d="M252 151c7-51 38-81 84-90-34 31-48 62-42 98" fill="none" stroke="#4D986F" stroke-width="15" stroke-linecap="round"/>
    <path d="M286 122c37-49 87-53 117-33-36 7-64 28-86 61z" fill="url(#vine)" stroke="#428B67" stroke-width="8"/>
    <g stroke="#44358A" stroke-width="8"><circle cx="220" cy="181" r="56" fill="url(#ga)"/><circle cx="294" cy="181" r="56" fill="url(#gb)"/><circle cx="173" cy="246" r="57" fill="url(#gb)"/><circle cx="255" cy="247" r="61" fill="url(#ga)"/><circle cx="338" cy="247" r="57" fill="url(#gb)"/><circle cx="210" cy="322" r="59" fill="url(#ga)"/><circle cx="300" cy="322" r="59" fill="url(#gb)"/><circle cx="255" cy="397" r="55" fill="url(#ga)"/></g>
    <g fill="none" stroke="#E7FAFF" stroke-width="10" stroke-linecap="round" opacity=".76"><path d="M190 154a39 39 0 0 1 23-12"/><path d="M263 154a39 39 0 0 1 23-12"/><path d="M143 222a39 39 0 0 1 23-12"/><path d="M224 220a43 43 0 0 1 25-13"/><path d="M307 222a39 39 0 0 1 23-12"/><path d="M225 371a36 36 0 0 1 21-11"/></g>
    <path d="M174 266c43-15 70-46 83-89-3 56-28 99-83 124z" fill="#E7FAFF" opacity=".16"/>`),

  'crystal-pear': svg(`
    <linearGradient id="pear" x1=".15" y1=".05" x2=".85" y2=".95"><stop stop-color="#F0FFFF"/><stop offset=".31" stop-color="#8EE9E8"/><stop offset=".68" stop-color="#61BCD6"/><stop offset="1" stop-color="#6D79C4"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFF2A4"/><stop offset=".55" stop-color="#F5C752"/><stop offset="1" stop-color="#D08C27"/></linearGradient>`, `
    <path d="M268 112c2-39 16-67 44-84" fill="none" stroke="#94703A" stroke-width="16" stroke-linecap="round"/>
    <path d="M285 87c37-34 79-30 101-10-35 4-64 20-85 48z" fill="url(#gold)" stroke="#BF872B" stroke-width="8"/>
    <path d="M256 101c-61 0-70 72-85 104-19 41-72 73-68 139 4 72 65 113 153 113s149-41 153-113c4-66-49-98-68-139-15-32-24-104-85-104z" fill="url(#pear)" stroke="#4F7DB1" stroke-width="11"/>
    <path d="M256 108 189 212l67 245 67-245z" fill="#fff" opacity=".18"/><path d="m189 212-80 126 147 119zm134 0 80 126-147 119z" fill="#4766B5" opacity=".13"/>
    <g fill="none" stroke="#E9FFFF" stroke-width="5" opacity=".5"><path d="M189 212 256 255l67-43"/><path d="M109 338h294"/><path d="m189 212 67 245 67-245"/></g>
    <ellipse cx="191" cy="194" rx="29" ry="52" transform="rotate(23 191 194)" fill="url(#shine)" opacity=".76"/>
    <g filter="url(#glow)">${star(256,155,23,'#FFF4A7')}</g>`),

  'flame-dragonfruit': svg(`
    <radialGradient id="dragon" cx="36%" cy="24%" r="80%"><stop stop-color="#FFA28B"/><stop offset=".44" stop-color="#F14B72"/><stop offset="1" stop-color="#A9265B"/></radialGradient>
    <linearGradient id="flame" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFE16A"/><stop offset=".5" stop-color="#FF9C48"/><stop offset="1" stop-color="#E34B4D"/></linearGradient>`, `
    <path d="M256 90c90 5 155 77 149 171-7 107-68 193-149 193s-142-86-149-193C101 167 166 95 256 90z" fill="url(#dragon)" stroke="#A72A58" stroke-width="11"/>
    <g fill="url(#flame)" stroke="#D65748" stroke-width="8" stroke-linejoin="round"><path d="M247 107c-9-55 9-85 37-104-1 43 15 69 40 94z"/><path d="M166 148c-47-30-71-13-95 6 37 10 56 32 65 65z"/><path d="M124 241c-50-8-73 14-86 41 38-4 64 8 82 36z"/><path d="M149 354c-46 15-57 44-55 75 30-25 58-30 88-17z"/><path d="M346 148c47-30 71-13 95 6-37 10-56 32-65 65z"/><path d="M388 241c50-8 73 14 86 41-38-4-64 8-82 36z"/><path d="M363 354c46 15 57 44 55 75-30-25-58-30-88-17z"/></g>
    <path d="M256 158c56 10 92 60 87 121-6 71-43 131-87 131s-81-60-87-131c-5-61 31-111 87-121z" fill="#FFB94D" opacity=".28" filter="url(#glow)"/>
    <g filter="url(#glow)">${star(256,257,56,'#FFF3A2')}</g><ellipse cx="187" cy="173" rx="26" ry="50" transform="rotate(29 187 173)" fill="url(#shine)" opacity=".56"/>`),

  'aurora-kiwi': svg(`
    <radialGradient id="flesh" cx="46%" cy="45%" r="59%"><stop stop-color="#FFF7B6"/><stop offset=".18" stop-color="#B3EE78"/><stop offset=".62" stop-color="#55C984"/><stop offset="1" stop-color="#268B6D"/></radialGradient>
    <linearGradient id="aurora" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#72F0DC"/><stop offset=".48" stop-color="#7BA8FF"/><stop offset="1" stop-color="#E380EA"/></linearGradient>`, `
    <circle cx="256" cy="267" r="188" fill="#9C7048" stroke="#70472F" stroke-width="13"/><circle cx="256" cy="267" r="161" fill="url(#flesh)" stroke="#EAD99B" stroke-width="8"/><circle cx="256" cy="267" r="54" fill="#FFF4B0" opacity=".9"/>
    <g fill="#263A3B">${kiwiSeeds()}</g>
    <path d="M126 245c68-80 139-79 261-7-94-25-171 4-250 77" fill="none" stroke="url(#aurora)" stroke-width="25" stroke-linecap="round" opacity=".9" filter="url(#glow)"/>
    <path d="M157 335c80-57 151-49 214 4-78-29-143-20-199 36" fill="none" stroke="#A5F5E3" stroke-width="15" stroke-linecap="round" opacity=".72"/>
    <ellipse cx="190" cy="163" rx="36" ry="57" transform="rotate(35 190 163)" fill="url(#shine)" opacity=".48"/>`),

  'golden-pineapple': svg(`
    <linearGradient id="pine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFF19B"/><stop offset=".45" stop-color="#F5BE3F"/><stop offset="1" stop-color="#CE7D27"/></linearGradient>
    <linearGradient id="crown" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#AAF2C2"/><stop offset=".52" stop-color="#48B986"/><stop offset="1" stop-color="#267A66"/></linearGradient>`, `
    <g fill="url(#crown)" stroke="#267A66" stroke-width="9" stroke-linejoin="round"><path d="m256 175-55-135c52 32 72 68 74 129z"/><path d="m249 172 56-142c20 60 6 103-36 152z"/><path d="m235 180-115-93c62 7 101 34 131 88z"/><path d="m276 179 118-85c-27 58-64 85-121 100z"/><path d="m249 176-3-151c37 51 43 95 20 154z"/></g>
    <path d="M256 153c99 0 151 71 144 163-8 107-61 169-144 169s-136-62-144-169c-7-92 45-163 144-163z" fill="url(#pine)" stroke="#B87325" stroke-width="12"/>
    <g fill="none" stroke="#B87325" stroke-width="8" opacity=".7"><path d="M140 228 370 435"/><path d="M117 291 328 480"/><path d="m373 216-232 220"/><path d="m396 281-207 197"/></g>
    <g stroke="#D2962E" stroke-width="3">${star(210,252,27,'#FFF1A0')}${star(304,323,27,'#FFF1A0')}${star(220,397,27,'#FFF1A0')}</g><g filter="url(#glow)">${star(256,119,36,'#FFF8BD')}</g>
    <ellipse cx="188" cy="230" rx="30" ry="54" transform="rotate(25 188 230)" fill="url(#shine)" opacity=".56"/>`),

  'galaxy-watermelon': svg(`
    <radialGradient id="space" cx="42%" cy="41%" r="67%"><stop stop-color="#8063C9"/><stop offset=".42" stop-color="#3E4F9B"/><stop offset="1" stop-color="#18245A"/></radialGradient>
    <linearGradient id="rind" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#85F0CD"/><stop offset=".5" stop-color="#36B29B"/><stop offset="1" stop-color="#176D70"/></linearGradient>`, `
    <path d="M75 164c132-97 313-96 364 0-19 164-93 279-182 279S94 328 75 164z" fill="url(#rind)" stroke="#155C68" stroke-width="13"/><path d="M104 171c113-67 267-67 305 0-25 135-83 231-152 231s-127-96-153-231z" fill="url(#space)" stroke="#B7EBD2" stroke-width="11"/>
    <path d="M145 213c90-53 180-46 247 7-97-25-170-6-236 52" fill="none" stroke="#D777D7" stroke-width="24" stroke-linecap="round" opacity=".45" filter="url(#glow)"/><path d="M133 292c93-49 178-36 240 21-91-29-165-17-222 37" fill="none" stroke="#5CE2D2" stroke-width="17" stroke-linecap="round" opacity=".5"/>
    <g filter="url(#glow)">${star(190,249,22,'#FFF0A0')}${star(301,219,18,'#FFF0A0')}${star(258,337,22,'#FFF0A0')}<circle cx="344" cy="300" r="9" fill="#FFF0A0"/><circle cx="205" cy="370" r="7" fill="#FFF0A0"/></g><ellipse cx="162" cy="179" rx="34" ry="44" transform="rotate(18 162 179)" fill="url(#shine)" opacity=".48"/>`),

  'rainbow-mangosteen': svg(`
    <radialGradient id="shell" cx="31%" cy="22%" r="82%"><stop stop-color="#C77CE8"/><stop offset=".45" stop-color="#8D52C5"/><stop offset="1" stop-color="#543078"/></radialGradient>
    <linearGradient id="rainbow" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FF8FB2"/><stop offset=".23" stop-color="#FFD66E"/><stop offset=".46" stop-color="#9BE891"/><stop offset=".7" stop-color="#78DDE3"/><stop offset="1" stop-color="#AC8AF2"/></linearGradient>
    <linearGradient id="leafM" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#B3EE80"/><stop offset="1" stop-color="#4BAE70"/></linearGradient>`, `
    <circle cx="256" cy="280" r="176" fill="url(#shell)" stroke="#543078" stroke-width="13"/>
    <path d="M256 126c-50-47-101-38-129-8 42 3 74 20 97 53z" fill="url(#leafM)" stroke="#3B8E62" stroke-width="9"/><path d="M256 126c50-47 101-38 129-8-42 3-74 20-97 53z" fill="url(#leafM)" stroke="#3B8E62" stroke-width="9"/><path d="M253 135c-7-51 14-84 50-101-12 42-7 77 18 107z" fill="#65BE6F" stroke="#3B8E62" stroke-width="9"/>
    <path d="M112 280c40-63 99-94 144-94s104 31 144 94c-40 94-99 141-144 141s-104-47-144-141z" fill="#FFF9EC" stroke="#684083" stroke-width="10"/>
    <g stroke="#E7DCEE" stroke-width="6"><path d="M256 192c-65 37-76 104-51 206 29-27 46-68 51-206z" fill="url(#rainbow)" opacity=".83"/><path d="M256 192c65 37 76 104 51 206-29-27-46-68-51-206z" fill="url(#rainbow)" opacity=".72"/><path d="M247 196c-92 30-119 92-94 161 36-12 72-56 94-161z" fill="#FFF5F8"/><path d="M265 196c92 30 119 92 94 161-36-12-72-56-94-161z" fill="#F4F6FF"/></g>
    <path d="M149 243c71-47 146-55 220-8" fill="none" stroke="url(#rainbow)" stroke-width="15" stroke-linecap="round" opacity=".75" filter="url(#glow)"/><ellipse cx="168" cy="183" rx="32" ry="54" transform="rotate(28 168 183)" fill="url(#shine)" opacity=".45"/>`)
};

fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

Object.entries(assets).forEach(([name, contents]) => {
  const source = path.join(sourceDir, `${name}.svg`);
  const target = path.join(outputDir, `${name}.png`);
  fs.writeFileSync(source, contents);
  const result = spawnSync('sips', ['-s', 'format', 'png', source, '--out', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Failed to render ${name}`);
  const resize = spawnSync('sips', ['-z', '256', '256', target], { encoding: 'utf8' });
  if (resize.status !== 0) throw new Error(resize.stderr || resize.stdout || `Failed to resize ${name}`);
});

console.log(`Generated ${Object.keys(assets).length} rare fruit assets in ${outputDir}`);
