// Gera os sprites de pet desenhados em código: cachorro, pastor alemão, lobo,
// gato, cobra, vaca e pomba.
//
//   node scripts/pixel-sprites.mjs
//
// Cada forma vira 4 PNGs de 32×32 com transparência em public/idle/pets/{forma}/,
// no padrão do personagem (cores chapadas, sem contorno preto, ~24 px de altura,
// 4 frames: parado / respira / parado + detalhe / respira + detalhe). A arte é
// autoral — nada baixado — e é placeholder honesto: serve até alguém pintar à mão.
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

// ---------------------------------------------------------------- partes dos canídeos
//
// Letras: o = pelo, d = pelo escuro (sombra, luz vem da esquerda), l = pelo claro
// (focinho, peito), k = preto (olho, nariz), w = brilho do olho, p = rosa (orelha,
// nariz, língua), s = "sela"/mancha escura, e = íris, h = chifre, b = bico/pé.

/** Cabeça redonda + corpo sentado, de frente. Sem orelhas nem rabo — cada forma põe os seus. */
function dogBody(g) {
  rect(g, 12, 5, 18, 5, 'o');
  rect(g, 10, 6, 20, 6, 'o');
  rect(g, 9, 7, 21, 14, 'o');
  rect(g, 10, 15, 20, 15, 'o');
  rect(g, 21, 8, 21, 13, 'd');
  rect(g, 12, 9, 13, 10, 'k');
  px(g, 13, 9, 'w');
  rect(g, 17, 9, 18, 10, 'k');
  px(g, 18, 9, 'w');
  rect(g, 12, 11, 18, 14, 'l');
  rect(g, 13, 15, 17, 15, 'l');
  rect(g, 14, 12, 16, 13, 'k');
  px(g, 15, 14, 'd');
  rect(g, 11, 16, 19, 16, 'o');
  rect(g, 10, 17, 20, 19, 'o');
  rect(g, 8, 20, 22, 26, 'o');
  rect(g, 20, 17, 20, 19, 'd');
  rect(g, 21, 20, 22, 26, 'd');
  rect(g, 13, 16, 17, 16, 'l');
  rect(g, 12, 17, 18, 25, 'l');
  rect(g, 13, 26, 17, 27, 'l');
  rect(g, 11, 22, 12, 27, 'o');
  rect(g, 18, 22, 19, 27, 'o');
  rect(g, 19, 22, 19, 27, 'd');
  rect(g, 10, 28, 13, 28, 'l');
  rect(g, 17, 28, 20, 28, 'l');
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
  px(g, 11, 2, 'o');
  rect(g, 10, 3, 11, 3, 'o');
  rect(g, 9, 4, 11, 4, 'o');
  rect(g, 9, 5, 11, 5, 'o');
  rect(g, 9, 6, 9, 6, 'o');
  px(g, 10, 4, inner);
  px(g, 10, 5, inner);
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
// Cada forma é uma função (frame 0..3) → grid. Frames ímpares respiram (cabeça
// sobe 1 px); frames 2 e 3 mexem um detalhe (rabo, língua, asa, orelha).

function dog(i) {
  let g = blank();
  dogBody(g);
  floppyEars(g);
  if (i % 2) g = headUp(g, 2, 16);
  curlTail(g, i >= 2);
  return g;
}

function shepherd(i) {
  let g = blank();
  dogBody(g);
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
  if (i % 2) g = headUp(g, 2, 16);
  curlTail(g, i >= 2);
  return g;
}

function wolf(i) {
  let g = blank();
  dogBody(g);
  pointyEars(g, 'd');
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
  if (i % 2) g = headUp(g, 2, 16);
  bushyTail(g, i >= 2);
  return g;
}

/** Gato sentado: cabeça menor, orelhas triangulares, listras, rabo fino que balança. */
function cat(i) {
  let g = blank();
  // cabeça
  rect(g, 11, 6, 19, 6, 'o');
  rect(g, 10, 7, 20, 14, 'o');
  rect(g, 11, 15, 19, 15, 'o');
  rect(g, 20, 8, 20, 13, 'd');
  // orelhas
  px(g, 10, 3, 'o');
  rect(g, 10, 4, 11, 4, 'o');
  rect(g, 10, 5, 12, 5, 'o');
  px(g, 11, 5, 'p');
  px(g, 20, 3, 'o');
  rect(g, 19, 4, 20, 4, 'o');
  rect(g, 18, 5, 20, 5, 'o');
  px(g, 19, 5, 'p');
  // listras na testa
  px(g, 13, 7, 'd');
  px(g, 15, 7, 'd');
  px(g, 17, 7, 'd');
  px(g, 15, 8, 'd');
  // olhos verdes com pupila
  rect(g, 12, 9, 13, 10, 'e');
  rect(g, 13, 9, 13, 10, 'k');
  rect(g, 17, 9, 18, 10, 'e');
  rect(g, 17, 9, 17, 10, 'k');
  // focinho, nariz, boca
  rect(g, 13, 11, 17, 14, 'l');
  px(g, 15, 12, 'p');
  px(g, 14, 13, 'd');
  px(g, 16, 13, 'd');
  // corpo esguio
  rect(g, 12, 16, 18, 16, 'o');
  rect(g, 11, 17, 19, 19, 'o');
  rect(g, 10, 20, 20, 26, 'o');
  rect(g, 19, 17, 19, 19, 'd');
  rect(g, 20, 20, 20, 26, 'd');
  px(g, 10, 21, 'd');
  px(g, 10, 23, 'd');
  px(g, 10, 25, 'd');
  // peito
  rect(g, 13, 16, 17, 16, 'l');
  rect(g, 13, 17, 17, 25, 'l');
  // patas dianteiras
  rect(g, 12, 22, 13, 27, 'o');
  rect(g, 17, 22, 18, 27, 'o');
  rect(g, 18, 22, 18, 27, 'd');
  rect(g, 11, 28, 14, 28, 'l');
  rect(g, 16, 28, 19, 28, 'l');
  // patas traseiras
  rect(g, 8, 27, 10, 28, 'o');
  rect(g, 20, 27, 22, 28, 'o');
  px(g, 22, 27, 'd');
  px(g, 22, 28, 'd');
  if (i % 2) g = headUp(g, 3, 16);
  // rabo fino subindo pela direita; a ponta balança
  rect(g, 22, 26, 23, 26, 'o');
  rect(g, 23, 25, 24, 25, 'o');
  px(g, 24, 24, 'o');
  px(g, 24, 23, 'o');
  px(g, 25, 22, 'o');
  px(g, 25, 21, 'o');
  px(g, 25, 20, 'o');
  if (i >= 2) {
    px(g, 25, 19, 'o');
    px(g, 24, 18, 'o');
    px(g, 24, 17, 'd');
  } else {
    px(g, 26, 19, 'o');
    px(g, 26, 18, 'o');
    px(g, 26, 17, 'd');
  }
  return g;
}

/** Um anel do corpo da cobra, com barriga clara embaixo e sombra à direita. */
function ring(g, x0, y0, x1, y1) {
  rect(g, x0, y0, x1, y1, 'o');
  rect(g, x0 + 1, y1, x1 - 1, y1, 'l');
  rect(g, x1, y0, x1, y1 - 1, 'd');
  px(g, x0, y0, '.');
  px(g, x1, y0, '.');
  px(g, x0, y1, '.');
  px(g, x1, y1, '.');
}

/** Cobra enrolada, cabeça erguida à esquerda olhando pra direita; a língua aparece e a cabeça balança. */
function snake(i) {
  const g = blank();
  const sway = i % 2;
  ring(g, 6, 26, 25, 28);
  ring(g, 8, 22, 23, 25);
  ring(g, 10, 18, 21, 21);
  for (const x of [9, 13, 17, 21]) px(g, x, 27, 'd');
  for (const x of [11, 15, 19]) px(g, x, 23, 'd');
  for (const x of [13, 17]) px(g, x, 19, 'd');
  // pescoço
  rect(g, 9 + sway, 12, 11 + sway, 18, 'o');
  rect(g, 11 + sway, 12, 11 + sway, 18, 'd');
  // cabeça
  rect(g, 7 + sway, 9, 14 + sway, 9, 'o');
  rect(g, 6 + sway, 10, 15 + sway, 12, 'o');
  rect(g, 7 + sway, 13, 13 + sway, 13, 'o');
  rect(g, 8 + sway, 13, 12 + sway, 13, 'l');
  px(g, 12 + sway, 10, 'e');
  px(g, 13 + sway, 10, 'k');
  px(g, 15 + sway, 12, 'd');
  if (i >= 2) {
    px(g, 16 + sway, 12, 'p');
    px(g, 17 + sway, 11, 'p');
    px(g, 17 + sway, 13, 'p');
  }
  return g;
}

/** Vaca em pé, de frente: cabeça larga, focinho rosa, manchas, chifres; a orelha e o rabo mexem. */
function cow(i) {
  let g = blank();
  const flick = i >= 2 ? 1 : 0;
  // chifres
  rect(g, 8, 5, 9, 5, 'h');
  px(g, 8, 6, 'h');
  rect(g, 22, 5, 23, 5, 'h');
  px(g, 23, 6, 'h');
  // cabeça
  rect(g, 11, 5, 20, 5, 'o');
  rect(g, 10, 6, 21, 6, 'o');
  rect(g, 9, 7, 22, 14, 'o');
  rect(g, 10, 15, 21, 15, 'o');
  rect(g, 22, 8, 22, 13, 'd');
  // mancha na cabeça
  rect(g, 15, 5, 20, 8, 's');
  px(g, 14, 6, 's');
  px(g, 21, 9, 's');
  // orelhas pra fora (a esquerda mexe)
  rect(g, 6, 8 + flick, 8, 10 + flick, 'o');
  px(g, 7, 9 + flick, 'p');
  rect(g, 6, 8 + flick, 6, 10 + flick, 'd');
  rect(g, 23, 8, 25, 10, 'o');
  px(g, 24, 9, 'p');
  rect(g, 25, 8, 25, 10, 'd');
  // olhos
  rect(g, 11, 9, 12, 10, 'k');
  px(g, 12, 9, 'w');
  rect(g, 18, 9, 19, 10, 'k');
  px(g, 19, 9, 'w');
  // focinho
  rect(g, 11, 12, 20, 15, 'p');
  rect(g, 12, 16, 19, 16, 'p');
  px(g, 13, 14, 'k');
  px(g, 18, 14, 'k');
  // corpo
  rect(g, 9, 17, 22, 18, 'o');
  rect(g, 8, 19, 23, 25, 'o');
  rect(g, 23, 19, 23, 25, 'd');
  rect(g, 22, 17, 22, 18, 'd');
  rect(g, 8, 19, 11, 22, 's');
  px(g, 12, 20, 's');
  rect(g, 18, 22, 22, 25, 's');
  px(g, 17, 23, 's');
  // pernas e cascos
  for (const x of [9, 13, 17, 21]) {
    rect(g, x, 26, x + 2, 27, 'o');
    rect(g, x + 2, 26, x + 2, 27, 'd');
    rect(g, x, 28, x + 2, 28, 'k');
  }
  if (i % 2) g = headUp(g, 4, 17);
  // rabo com tufo
  rect(g, 24, 19, 24, 23, 'o');
  px(g, 24 + flick, 24, 'k');
  px(g, 24 + flick, 25, 'k');
  return g;
}

/** Pomba de lado, olhando pra direita: corpo redondo, cabeça pequena, bico e pés laranja; a asa bate. */
function dove(i) {
  let g = blank();
  // cauda à esquerda
  rect(g, 4, 19, 8, 21, 'o');
  rect(g, 3, 20, 4, 21, 'd');
  rect(g, 5, 22, 7, 22, 'd');
  // corpo
  rect(g, 9, 15, 22, 15, 'o');
  rect(g, 8, 16, 23, 23, 'o');
  rect(g, 9, 24, 22, 24, 'o');
  rect(g, 10, 25, 20, 25, 'o');
  rect(g, 22, 17, 23, 23, 'd');
  rect(g, 11, 22, 19, 25, 'l');
  // pescoço e cabeça
  rect(g, 17, 12, 22, 14, 'o');
  rect(g, 17, 8, 23, 8, 'o');
  rect(g, 16, 9, 24, 12, 'o');
  rect(g, 17, 13, 23, 13, 'o');
  rect(g, 24, 10, 24, 12, 'd');
  px(g, 22, 10, 'k');
  rect(g, 25, 11, 26, 11, 'b');
  px(g, 25, 12, 'b');
  // pernas e pés
  rect(g, 13, 26, 13, 27, 'b');
  rect(g, 18, 26, 18, 27, 'b');
  rect(g, 12, 28, 15, 28, 'b');
  rect(g, 17, 28, 20, 28, 'b');
  if (i % 2) g = headUp(g, 7, 15);
  // asa (bate nos frames 2 e 3)
  const dy = i >= 2 ? -1 : 0;
  rect(g, 9, 17 + dy, 17, 21 + dy, 'd');
  rect(g, 7, 18 + dy, 8, 20 + dy, 'd');
  px(g, 18, 18 + dy, 'd');
  px(g, 18, 19 + dy, 'd');
  return g;
}

const PALETTES = {
  dog: { o: [214, 146, 74], d: [160, 96, 40], l: [245, 222, 180], k: [40, 30, 25], w: [255, 255, 255], p: [232, 150, 160] },
  'dog-shepherd': { o: [196, 134, 62], d: [140, 90, 38], l: [226, 192, 140], k: [25, 22, 24], w: [255, 255, 255], p: [225, 150, 150], s: [38, 36, 42] },
  wolf: { o: [128, 134, 146], d: [80, 86, 98], l: [206, 210, 220], k: [28, 28, 34], w: [255, 255, 255], e: [240, 190, 70] },
  cat: { o: [232, 152, 62], d: [178, 100, 34], l: [250, 232, 200], k: [30, 25, 25], w: [255, 255, 255], e: [120, 200, 80], p: [236, 140, 150] },
  snake: { o: [92, 172, 82], d: [46, 112, 52], l: [196, 224, 156], k: [25, 30, 25], e: [242, 202, 60], p: [222, 62, 72] },
  cow: { o: [246, 244, 238], d: [198, 196, 190], s: [40, 38, 42], p: [240, 172, 176], k: [30, 28, 30], w: [255, 255, 255], h: [222, 200, 150] },
  dove: { o: [240, 240, 246], d: [196, 200, 214], l: [255, 255, 255], k: [30, 30, 40], b: [236, 150, 60] },
};

const FORMS = { dog, 'dog-shepherd': shepherd, wolf, cat, snake, cow, dove };

for (const [form, build] of Object.entries(FORMS)) {
  const dir = join(ROOT, 'public', 'idle', 'pets', form);
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 4; i++) {
    writeFileSync(join(dir, `${i}.png`), encodePNG(W, H, render(build(i), PALETTES[form])));
  }
  console.log(`${form}: 4 frames em public/idle/pets/${form}/`);
}
