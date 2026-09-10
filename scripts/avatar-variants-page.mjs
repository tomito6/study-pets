// Gera docs/personagens.html: as variantes de desenho do personagem, com os
// tratamentos de olho e as cores de íris, animadas no browser.
//
//   node --import ./scripts/ts-loader.mjs scripts/avatar-variants-page.mjs
//
// A página não guarda sprites: ela embute o próprio módulo de variantes e
// desenha na hora. Mexer no desenho é mexer em avatar-variants.mjs e regerar.

import { readFileSync, writeFileSync } from 'node:fs';
import { SKINS, HAIRS } from '../src/domain/avatar.ts';

const mod = readFileSync(new URL('./avatar-variants.mjs', import.meta.url), 'utf8')
  .replace(/^export /gm, '');

const IRISES = [
  { id: 'castanho', name: 'Castanho', base: [104, 68, 44] },
  { id: 'mel', name: 'Mel', base: [162, 116, 56] },
  { id: 'verde', name: 'Verde', base: [86, 118, 76] },
  { id: 'azul', name: 'Azul', base: [78, 118, 158] },
  { id: 'cinza', name: 'Cinza', base: [120, 126, 128] },
  { id: 'escuro', name: 'Escuro', base: [58, 46, 44] },
];

const data = {
  skins: SKINS.map((s) => ({ id: s.id, name: s.name, base: s.base, shade: s.shade, line: s.line })),
  hairs: HAIRS.map((h) => ({ id: h.id, name: h.name, base: h.base, shade: h.shade })),
  irises: IRISES,
  styles: ['curto', 'longo', 'coque'],
};

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Study Pets · variantes do personagem</title>
<style>
  :root{--bg:#f6efe3;--bg2:#fffdf7;--bg3:#f2ead9;--text:#40382e;--muted:#6e6455;
    --accent:#486244;--line:rgba(64,56,46,.13)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:14px/1.5 "DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  header{padding:34px 24px 16px;max-width:1180px;margin:0 auto}
  h1{margin:0 0 6px;font:600 26px/1.2 "Lora",Georgia,serif;letter-spacing:-.2px}
  .sub{margin:0;color:var(--muted);max-width:66ch}
  .bar{position:sticky;top:0;z-index:5;background:rgba(246,239,227,.94);backdrop-filter:blur(8px);
    border-bottom:1px solid var(--line);padding:9px 24px}
  .bar-in{max-width:1180px;margin:0 auto;display:flex;flex-wrap:wrap;gap:16px;align-items:center}
  .grp{display:flex;gap:6px;align-items:center}
  .grp>b{font:600 10px/1 "DM Sans",sans-serif;letter-spacing:.09em;text-transform:uppercase;
    color:var(--muted);margin-right:2px}
  .sw{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;
    box-shadow:0 0 0 1px var(--line) inset}
  .sw[aria-pressed=true]{border-color:var(--accent);transform:scale(1.12)}
  .pill{border:1px solid var(--line);background:var(--bg2);color:var(--text);border-radius:999px;
    padding:5px 12px;font:500 12px/1 "DM Sans",sans-serif;cursor:pointer}
  .pill[aria-pressed=true]{background:var(--accent);color:#fbf8f2;border-color:var(--accent)}
  main{max-width:1180px;margin:0 auto;padding:22px 24px 80px}
  section{background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px 20px;
    margin-bottom:22px}
  section h2{margin:0 0 3px;font:600 15px/1.2 "Lora",Georgia,serif}
  section p.d{margin:0 0 16px;color:var(--muted);font-size:12.5px;max-width:70ch}
  .eyerow{display:grid;grid-template-columns:repeat(auto-fill,minmax(236px,1fr));gap:14px}
  .eye{border:1px solid var(--line);border-radius:13px;padding:12px 12px 13px;cursor:pointer;
    background:var(--bg);text-align:left;font:inherit;color:inherit;transition:border-color .15s}
  .eye[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
  .eye canvas{display:block;margin:0 auto 9px;background:var(--bg3);border-radius:8px}
  .eye b{display:block;font:600 13px/1.2 "DM Sans",sans-serif;margin-bottom:3px}
  .eye span{display:block;font-size:11.5px;line-height:1.42;color:var(--muted)}
  .faces{display:flex;gap:26px;flex-wrap:wrap;align-items:flex-end}
  .cell{text-align:center}
  .cell span{display:block;margin-top:7px;font:500 11px/1 "DM Sans",sans-serif;color:var(--muted)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
  .card{background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px;
    display:flex;flex-direction:column;gap:13px}
  .card h3{margin:0;font:600 17px/1.2 "Lora",Georgia,serif}
  .tag{font-size:12.5px;color:var(--muted);margin:0;min-height:36px}
  .meta{font:500 10px/1 "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;
    color:var(--accent);opacity:.85}
  .stage{display:flex;gap:16px;align-items:flex-end;justify-content:center;background:var(--bg3);
    border-radius:12px;padding:18px 14px;min-height:212px}
  .stage.dark{background:#1b1b20}
  .stage.quarto{background:linear-gradient(#efe2cd 0%,#efe2cd 62%,#d8c3a2 62%,#cdb694 100%)}
  .sizes{display:flex;gap:16px;align-items:flex-end;justify-content:center;
    border-top:1px dashed var(--line);padding:12px 0 0}
  .sizes .cell span{margin-top:6px;font-size:10px}
  canvas{image-rendering:pixelated}
  footer{max-width:1180px;margin:0 auto;padding:0 24px 60px;color:var(--muted);font-size:12.5px}
  footer code{background:var(--bg3);padding:1px 5px;border-radius:4px;font-size:11.5px}
</style></head><body>
<header>
  <h1>O personagem: corpo e olhar</h1>
  <p class="sub">Quatro desenhos de corpo ao lado do atual, e seis tratamentos de olho que valem
  para todos. O olho é a peça que muda o rosto — comece por ele, de perto, e só depois olhe a
  silhueta pequena. A íris ganhou cor própria (dimensão nova de personalização) e o controle
  <b>Olhos</b> junta ou afasta o par em 1px: às vezes o incômodo é o espaçamento, não o desenho.</p>
</header>
<div class="bar"><div class="bar-in">
  <div class="grp" id="skins"><b>Pele</b></div>
  <div class="grp" id="hairs"><b>Cabelo</b></div>
  <div class="grp" id="irises"><b>Íris</b></div>
  <div class="grp" id="gaps"><b>Olhos</b></div>
  <div class="grp" id="styles"><b>Penteado</b></div>
  <div class="grp" id="bgs"><b>Fundo</b></div>
  <div class="grp"><button class="pill" id="anim" aria-pressed="true">Animação</button></div>
</div></div>
<main>
  <section>
    <h2>Os seis olhos, de perto</h2>
    <p class="d">Aplicados na cabeça de <span id="baseName">Atual</span> — troque a base nos chips.
    Clique num olho pra usar ele no resto da página. Onde a cabeça é pequena, o tratamento cai
    sozinho pra versão que cabe: é informação, não bug.</p>
    <div class="grp" id="bases" style="margin-bottom:14px"><b>Base</b></div>
    <div class="eyerow" id="eyes"></div>
  </section>
  <section>
    <h2>O rosto inteiro</h2>
    <p class="d">O mesmo olho nas cinco cabeças. É aqui que se vê se ele combina com o queixo, a
    boca e o cabelo de cada desenho.</p>
    <div class="faces" id="faces"></div>
  </section>
  <section>
    <h2>Silhueta no tamanho de uso</h2>
    <p class="d">Como cada um chega no quarto da coluna (48px) e no perfil (96px). Detalhe de olho
    que só existe no zoom não conta.</p>
    <div class="faces" id="strip48"></div>
    <div class="faces" id="strip96" style="margin-top:20px"></div>
  </section>
  <div class="grid" id="cards"></div>
</main>
<footer>
  Escolhidos um corpo e um olho, o desenho se cola em <code>src/domain/avatar.ts</code> — mesmas
  letras, mesmas primitivas. As letras novas do olho (<code>L</code> cílio, <code>I</code> íris,
  <code>i</code> pupila, <code>w</code> brilho) entram em <code>avatarPalette</code>, e a cor da
  íris vira um catálogo ao lado de pele e cabelo. Dá pra pedir mistura: “o corpo do Estudante com
  o olho Brilho e a boca do Companheiro”.
</footer>
<script>
${mod}
const DATA = ${JSON.stringify(data)};
const dim = (rgb, k) => rgb.map((c) => Math.round(c * k));
const PAL = (skin, hair, iris) => ({
  S: skin.base, s: skin.shade, K: skin.line, H: hair.base, h: hair.shade,
  W: [252,250,248], w: [255,255,255], E: [58,44,38],
  L: dim(skin.line, .62), I: iris.base, i: dim(iris.base, .45),
  C: [122,154,108], c: [95,124,84], P: [72,84,104], p: [55,65,82], B: [58,52,48],
});
let sel = { skin: DATA.skins[1], hair: DATA.hairs[1], iris: DATA.irises[0],
            style: 'curto', eye: 'cilio', gap: 0, bg: 'papel', anim: true, base: 'atual' };
const cache = new Map();
const framesFor = (v, style, eye, gap) => {
  const k = v.id + '|' + style + '|' + eye + '|' + gap;
  if (!cache.has(k)) cache.set(k, framesOf(v, style, eye, gap));
  return cache.get(k);
};
const faceBox = (v) => {
  if (v._box) return v._box;
  const rows = framesOf(v, 'curto', 'bloco', 0)[0];
  let x0 = v.W, x1 = 0;
  for (let y = v.face[0]; y <= v.face[1]; y++) for (let x = 0; x < v.W; x++)
    if (rows[y][x] !== '.') { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  v._box = { x0: Math.max(0, x0 - 1), x1: Math.min(v.W - 1, x1 + 1), y0: v.face[0], y1: v.face[1] };
  return v._box;
};
const fullBox = (v) => ({ x0: 0, x1: v.W - 1, y0: 0, y1: v.H - 1 });
function paint(cv, rows, scale, pal, box) {
  const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
  cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const c = rows[y][x]; if (c === '.') continue;
    const rgb = pal[c]; if (!rgb) continue;
    ctx.fillStyle = 'rgb(' + rgb.join(',') + ')';
    ctx.fillRect((x - box.x0) * scale, (y - box.y0) * scale, scale, scale);
  }
}
const spots = [];
function add(parent, v, px, label, opts) {
  const o = opts || {};
  const cell = document.createElement('div'); cell.className = 'cell';
  const cv = document.createElement('canvas');
  const box = o.crop ? faceBox(v) : fullBox(v);
  const h = box.y1 - box.y0 + 1, w = box.x1 - box.x0 + 1;
  cv.style.height = px + 'px'; cv.style.width = (px * w / h) + 'px';
  cell.appendChild(cv);
  if (label) { const s = document.createElement('span'); s.textContent = label; cell.appendChild(s); }
  parent.appendChild(cell);
  spots.push({ cv, v, scale: Math.max(1, Math.round(px / h)), box, eye: o.eye });
  return cell;
}
const eyesHost = document.getElementById('eyes');
function buildEyes() {
  eyesHost.innerHTML = '';
  for (let i = spots.length - 1; i >= 0; i--) if (spots[i].inEyes) spots.splice(i, 1);
  const v = VARIANTS.find((x) => x.id === sel.base);
  for (const t of EYES) {
    const b = document.createElement('button'); b.className = 'eye'; b.type = 'button';
    b.setAttribute('aria-pressed', String(t.id === sel.eye));
    b.onclick = () => { sel.eye = t.id; render(); };
    const cv = document.createElement('canvas');
    const box = faceBox(v), h = box.y1 - box.y0 + 1, w = box.x1 - box.x0 + 1;
    cv.style.height = '168px'; cv.style.width = (168 * w / h) + 'px';
    b.appendChild(cv);
    const nb = document.createElement('b'); nb.textContent = t.name; b.appendChild(nb);
    const sp = document.createElement('span'); sp.textContent = t.desc; b.appendChild(sp);
    eyesHost.appendChild(b);
    spots.push({ cv, v, scale: Math.max(1, Math.round(168 / h)), box, eye: t.id, inEyes: true });
  }
  document.getElementById('baseName').textContent = v.name;
}
const faces = document.getElementById('faces');
for (const v of VARIANTS) add(faces, v, 128, v.name, { crop: true });
for (const v of VARIANTS) add(document.getElementById('strip48'), v, 48, v.name);
for (const v of VARIANTS) add(document.getElementById('strip96'), v, 96, null);
const cards = document.getElementById('cards');
for (const v of VARIANTS) {
  const card = document.createElement('div'); card.className = 'card';
  card.innerHTML = '<div><h3>' + v.name + '</h3><div class="meta">' + v.heads + ' · ' + v.W + '×' + v.H
    + '</div></div><p class="tag">' + v.tagline + '</p>';
  const stage = document.createElement('div'); stage.className = 'stage'; card.appendChild(stage);
  add(stage, v, 178, null);
  const sizes = document.createElement('div'); sizes.className = 'sizes'; card.appendChild(sizes);
  add(sizes, v, 24, '24'); add(sizes, v, 48, '48'); add(sizes, v, 72, '72');
  cards.appendChild(card);
}
function mk(host, items, current, onPick, kind) {
  host.querySelectorAll('button').forEach((b) => b.remove());
  items.forEach((it) => {
    const b = document.createElement('button');
    if (kind === 'sw') { b.className = 'sw'; b.title = it.name; b.style.background = 'rgb(' + it.base.join(',') + ')'; }
    else { b.className = 'pill'; b.textContent = it.name || it; }
    b.setAttribute('aria-pressed', String(current(it)));
    b.onclick = () => { onPick(it); render(); };
    host.appendChild(b);
  });
}
let frame = 0;
function draw() {
  const pal = PAL(sel.skin, sel.hair, sel.iris);
  for (const s of spots) {
    const f = framesFor(s.v, sel.style, s.eye || sel.eye, sel.gap);
    paint(s.cv, f[frame], s.scale, pal, s.box);
  }
}
function render() {
  buildEyes();
  mk(document.getElementById('skins'), DATA.skins, (x) => x.id === sel.skin.id, (x) => (sel.skin = x), 'sw');
  mk(document.getElementById('hairs'), DATA.hairs, (x) => x.id === sel.hair.id, (x) => (sel.hair = x), 'sw');
  mk(document.getElementById('irises'), DATA.irises, (x) => x.id === sel.iris.id, (x) => (sel.iris = x), 'sw');
  mk(document.getElementById('styles'), DATA.styles.map((s) => ({ id: s, name: s })),
     (x) => x.id === sel.style, (x) => (sel.style = x.id));
  mk(document.getElementById('bases'), VARIANTS.map((v) => ({ id: v.id, name: v.name })),
     (x) => x.id === sel.base, (x) => (sel.base = x.id));
  mk(document.getElementById('gaps'), [{id:-1,name:'juntos'},{id:0,name:'normal'},{id:1,name:'afastados'}],
     (x) => x.id === sel.gap, (x) => (sel.gap = x.id));
  mk(document.getElementById('bgs'), [{id:'papel',name:'papel'},{id:'quarto',name:'quarto'},{id:'escuro',name:'escuro'}],
     (x) => x.id === sel.bg, (x) => (sel.bg = x.id));
  document.getElementById('anim').setAttribute('aria-pressed', String(sel.anim));
  document.querySelectorAll('.stage').forEach((s) => {
    s.className = 'stage' + (sel.bg === 'escuro' ? ' dark' : sel.bg === 'quarto' ? ' quarto' : '');
  });
  draw();
}
document.getElementById('anim').onclick = () => { sel.anim = !sel.anim; render(); };
render();
let last = 0, step = 0;
const SEQ = [0, 1, 1, 0];
requestAnimationFrame(function loop(t) {
  if (sel.anim && t - last > 180) { last = t; step = (step + 1) % 4; frame = SEQ[step]; draw(); }
  requestAnimationFrame(loop);
});
</script></body></html>`;

writeFileSync(new URL('../docs/personagens.html', import.meta.url), html);
console.log('ok', (html.length / 1024).toFixed(0) + 'KB');
