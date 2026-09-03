// Gera os sprites de pet desenhados em código: cachorro, pastor alemão e lobo.
//
//   node scripts/pixel-sprites.mjs
//
// Cada pet vira 4 PNGs de 32×32 com transparência em public/idle/pets/{forma}/,
// no padrão do personagem (cores chapadas, sem contorno preto, ~24 px de altura,
// 4 frames de respiração + rabo). A arte é autoral — nada baixado — e é
// placeholder honesto: serve pra testar o fluxo até alguém pintar à mão.
//
// Sem dependências: o PNG é montado aqui mesmo (zlib do Node + CRC32).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 32;
const H = 32;

// ---------------------------------------------------------------- PNG

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** `rgba` = Buffer de W*H*4 bytes. */
function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- pincel

const blank = () => Array.from({ length: H }, () => Array(W).fill('.'));

function rect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
    }
  }
}
const px = (g, x, y, c) => rect(g, x, y, x, y, c);

/** Sobe as linhas y0..y1 em 1 px; a linha y1 fica duplicada (o pescoço estica). */
function headUp(g, y0, y1) {
  const out = g.map((r) => r.slice());
  for (let y = y0; y <= y1; y++) out[y - 1] = g[y].slice();
  return out;
}

function render(g, palette) {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = g[y][x];
      if (c === '.') continue;
      const rgb = palette[c];
      if (!rgb) throw new Error(`cor desconhecida "${c}" em (${x},${y})`);
      const i = (y * W + x) * 4;
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      buf[i + 3] = 255;
    }
  }
  return buf;
}

// ---------------------------------------------------------------- partes
//
// Letras: o = pelo, d = pelo escuro (sombra, luz vem da esquerda), l = pelo claro
// (focinho, peito), k = preto (olho, nariz), w = brilho do olho, p = orelha por dentro,
// s = "sela"/máscara escura (pastor alemão), e = íris (lobo).

/** Cabeça redonda + corpo sentado, de frente. Sem orelhas nem rabo — cada forma põe os seus. */
function body(g) {
  // cabeça
  rect(g, 12, 5, 18, 5, 'o');
  rect(g, 10, 6, 20, 6, 'o');
  rect(g, 9, 7, 21, 14, 'o');
  rect(g, 10, 15, 20, 15, 'o');
  rect(g, 21, 8, 21, 13, 'd');
  // olhos 2×2 com brilho
  rect(g, 12, 9, 13, 10, 'k');
  px(g, 13, 9, 'w');
  rect(g, 17, 9, 18, 10, 'k');
  px(g, 18, 9, 'w');
  // focinho, nariz, boca
  rect(g, 12, 11, 18, 14, 'l');
  rect(g, 13, 15, 17, 15, 'l');
  rect(g, 14, 12, 16, 13, 'k');
  px(g, 15, 14, 'd');
  // pescoço e tronco
  rect(g, 11, 16, 19, 16, 'o');
  rect(g, 10, 17, 20, 19, 'o');
  rect(g, 8, 20, 22, 26, 'o');
  rect(g, 20, 17, 20, 19, 'd');
  rect(g, 21, 20, 22, 26, 'd');
  // peito claro
  rect(g, 13, 16, 17, 16, 'l');
  rect(g, 12, 17, 18, 25, 'l');
  rect(g, 13, 26, 17, 27, 'l');
  // patas dianteiras
  rect(g, 11, 22, 12, 27, 'o');
  rect(g, 18, 22, 19, 27, 'o');
  rect(g, 19, 22, 19, 27, 'd');
  rect(g, 10, 28, 13, 28, 'l');
  rect(g, 17, 28, 20, 28, 'l');
  // patas traseiras (de lado)
  rect(g, 7, 27, 9, 28, 'o');
  rect(g, 21, 27, 23, 28, 'o');
  rect(g, 23, 27, 23, 28, 'd');
}

function floppyEars(g) {
  rect(g, 7, 8, 8, 13, 'o');
  rect(g, 7, 9, 7, 12, 'd');
  rect(g, 22, 8, 23, 13, 'o');
  rect(g, 23, 9, 23, 12, 'd');
  px(g, 8, 10, 'p');
  px(g, 22, 10, 'p');
}

/** Orelhas em pé. `inner` = cor de dentro. */
function pointyEars(g, inner) {
  // esquerda
  px(g, 11, 2, 'o');
  rect(g, 10, 3, 11, 3, 'o');
  rect(g, 9, 4, 11, 4, 'o');
  rect(g, 9, 5, 11, 5, 'o');
  rect(g, 9, 6, 9, 6, 'o');
  px(g, 10, 4, inner);
  px(g, 10, 5, inner);
  // direita
  px(g, 19, 2, 'o');
  rect(g, 19, 3, 20, 3, 'o');
  rect(g, 19, 4, 21, 4, 'o');
  rect(g, 19, 5, 21, 5, 'o');
  rect(g, 21, 6, 21, 6, 'o');
  px(g, 20, 4, inner);
  px(g, 20, 5, inner);
  rect(g, 21, 4, 21, 5, 'd');
}

/** Rabo enrolado pra cima, à direita. `wag` alterna a ponta. */
function curlTail(g, wag) {
  rect(g, 22, 23, 23, 23, 'o');
  rect(g, 23, 22, 24, 22, 'o');
  rect(g, 24, 21, 25, 21, 'o');
  rect(g, 24, 20, 25, 20, 'o');
  if (wag) {
    rect(g, 24, 19, 25, 19, 'o');
    rect(g, 24, 18, 25, 18, 'o');
    rect(g, 23, 17, 25, 17, 'o');
    px(g, 23, 17, 'l');
  } else {
    rect(g, 25, 19, 26, 19, 'o');
    rect(g, 25, 18, 26, 18, 'o');
    rect(g, 24, 17, 26, 17, 'o');
    px(g, 26, 17, 'l');
  }
}

/** Rabo cheio de lobo. */
function bushyTail(g, wag) {
  rect(g, 22, 23, 24, 24, 'o');
  rect(g, 23, 21, 25, 22, 'o');
  const dx = wag ? -1 : 0;
  rect(g, 24 + dx, 19, 26 + dx, 20, 'o');
  rect(g, 25 + dx, 17, 27 + dx, 18, 'o');
  rect(g, 25 + dx, 16, 27 + dx, 16, 'l');
  rect(g, 26 + dx, 17, 27 + dx, 18, 'd');
}

// ---------------------------------------------------------------- formas

function dog() {
  const g = blank();
  body(g);
  floppyEars(g);
  return g;
}

function shepherd() {
  const g = blank();
  body(g);
  pointyEars(g, 'p');
  // máscara escura no alto da cabeça, com as "sobrancelhas" claras clássicas
  rect(g, 12, 5, 18, 5, 's');
  rect(g, 10, 6, 20, 6, 's');
  rect(g, 9, 7, 21, 8, 's');
  px(g, 12, 8, 'o');
  px(g, 18, 8, 'o');
  // sela escura nos ombros e flancos
  rect(g, 10, 17, 11, 19, 's');
  rect(g, 19, 17, 20, 19, 's');
  rect(g, 8, 20, 10, 23, 's');
  rect(g, 20, 20, 22, 23, 's');
  return g;
}

function wolf() {
  const g = blank();
  body(g);
  pointyEars(g, 'd');
  // orelhas um pouco maiores
  px(g, 8, 5, 'o');
  px(g, 8, 6, 'o');
  px(g, 22, 5, 'd');
  px(g, 22, 6, 'd');
  // focinho mais longo e olhos âmbar
  rect(g, 11, 11, 19, 14, 'l');
  rect(g, 12, 15, 18, 15, 'l');
  rect(g, 14, 12, 16, 13, 'k');
  px(g, 15, 14, 'd');
  rect(g, 12, 9, 13, 10, 'e');
  px(g, 12, 10, 'k');
  rect(g, 17, 9, 18, 10, 'e');
  px(g, 17, 10, 'k');
  // pelagem mais escura no dorso
  rect(g, 10, 17, 11, 19, 'd');
  rect(g, 8, 20, 9, 24, 'd');
  return g;
}

const PALETTES = {
  dog: { o: [214, 146, 74], d: [160, 96, 40], l: [245, 222, 180], k: [40, 30, 25], w: [255, 255, 255], p: [232, 150, 160] },
  'dog-shepherd': { o: [196, 134, 62], d: [140, 90, 38], l: [226, 192, 140], k: [25, 22, 24], w: [255, 255, 255], p: [225, 150, 150], s: [38, 36, 42] },
  wolf: { o: [128, 134, 146], d: [80, 86, 98], l: [206, 210, 220], k: [28, 28, 34], w: [255, 255, 255], e: [240, 190, 70] },
};

const FORMS = {
  dog: { body: dog, tail: curlTail },
  'dog-shepherd': { body: shepherd, tail: curlTail },
  wolf: { body: wolf, tail: bushyTail },
};

/** 4 frames: parado / cabeça sobe / parado com o rabo mexendo / cabeça sobe com o rabo mexendo. */
function frames({ body: build, tail }) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const up = i % 2 === 1;
    const wag = i >= 2;
    let g = build();
    if (up) g = headUp(g, 2, 16);
    tail(g, wag); // o rabo entra depois: não sobe com a cabeça
    out.push(g);
  }
  return out;
}

for (const [form, parts] of Object.entries(FORMS)) {
  const dir = join(ROOT, 'public', 'idle', 'pets', form);
  mkdirSync(dir, { recursive: true });
  frames(parts).forEach((g, i) => {
    writeFileSync(join(dir, `${i}.png`), encodePNG(W, H, render(g, PALETTES[form])));
  });
  console.log(`${form}: 4 frames em public/idle/pets/${form}/`);
}
