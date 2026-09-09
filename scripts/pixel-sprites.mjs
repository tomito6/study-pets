// Gera os sprites de pet desenhados em código: as 5 espécies e todas as formas
// de evolução — 25 formas ao todo.
//
//   node scripts/pixel-sprites.mjs
//
// Cada forma vira 4 PNGs de 32×32 com transparência em public/idle/pets/{forma}/,
// no padrão do personagem (cores chapadas, sem contorno preto, ~24 px de altura,
// 4 frames: parado / respira / parado + detalhe / respira + detalhe). A arte é
// autoral — nada baixado — e é placeholder honesto: serve até alguém pintar à mão.
//
// As formas evoluídas reaproveitam o corpo da família (canídeo, gato, cobra,
// bovino, ave) e mudam paleta + detalhes — a mesma silhueta é o que faz "o mesmo
// bicho, mais forte" ler na tela. A forma-base de cada família fica pixel a pixel
// igual à versão anterior.
//
// Sem dependências: o PNG sai de `scripts/png.mjs` (zlib do Node + CRC32).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 32;
const H = 32;

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
const dots = (g, list, c) => list.forEach(([x, y]) => px(g, x, y, c));

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

// ---------------------------------------------------------------- letras
//
// o = pelo, d = pelo escuro (sombra, luz vem da esquerda), l = pelo claro (focinho,
// peito), k = preto (olho, nariz), w = brilho do olho, p = rosa (orelha, nariz,
// língua), s = "sela"/mancha, e = íris, h = chifre, b = bico/pé. Nas evoluções:
// g = ouro, q = ouro escuro, r = vermelho, u = azul, m = juba/membrana, f = fogo,
// y = miolo do fogo, c = brilho lunar, z = cinza claro.

// ---------------------------------------------------------------- canídeos

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

/** Pastor alemão parado: máscara escura no alto da cabeça (com as "sobrancelhas" claras) e sela nos flancos. */
function shepherdBase(g) {
  dogBody(g);
  pointyEars(g, 'p');
  rect(g, 12, 5, 18, 5, 's');
  rect(g, 10, 6, 20, 6, 's');
  rect(g, 9, 7, 21, 8, 's');
  px(g, 12, 8, 'o');
  px(g, 18, 8, 'o');
  rect(g, 10, 17, 11, 19, 's');
  rect(g, 19, 17, 20, 19, 's');
  rect(g, 8, 20, 10, 23, 's');
  rect(g, 20, 20, 22, 23, 's');
}

function shepherd(i) {
  let g = blank();
  shepherdBase(g);
  if (i % 2) g = headUp(g, 2, 16);
  curlTail(g, i >= 2);
  return g;
}

/** Cão lendário: o pastor alemão veterano — sobrancelhas e queixo grisalhos, bandana vermelha, medalha no peito. */
function dogLegend(i) {
  let g = blank();
  shepherdBase(g);
  px(g, 12, 8, 'z');
  px(g, 18, 8, 'z');
  rect(g, 13, 15, 17, 15, 'z');
  px(g, 12, 14, 'z');
  px(g, 18, 14, 'z');
  if (i % 2) g = headUp(g, 2, 16);
  curlTail(g, i >= 2);
  // bandana amarrada no pescoço, com a ponta caindo no peito
  rect(g, 11, 16, 19, 17, 'r');
  rect(g, 13, 18, 17, 18, 'r');
  rect(g, 14, 19, 16, 19, 'r');
  px(g, 15, 20, 'r');
  rect(g, 18, 16, 19, 17, 'q');
  px(g, 17, 18, 'q');
  // medalha
  rect(g, 15, 22, 16, 23, 'g');
  px(g, 16, 23, 'q');
  return g;
}

/** Lobo parado: orelhas em pé, tufos na bochecha, focinho longo, olhos âmbar, dorso escuro. */
function wolfBase(g) {
  dogBody(g);
  pointyEars(g, 'd');
  px(g, 8, 5, 'o');
  px(g, 8, 6, 'o');
  px(g, 22, 5, 'd');
  px(g, 22, 6, 'd');
  rect(g, 11, 11, 19, 14, 'l');
  rect(g, 12, 15, 18, 15, 'l');
  rect(g, 14, 12, 16, 13, 'k');
  px(g, 15, 14, 'd');
  rect(g, 12, 9, 13, 10, 'e');
  px(g, 12, 10, 'k');
  rect(g, 17, 9, 18, 10, 'e');
  px(g, 17, 10, 'k');
  rect(g, 10, 17, 11, 19, 'd');
  rect(g, 8, 20, 9, 24, 'd');
}

function wolf(i) {
  let g = blank();
  wolfBase(g);
  if (i % 2) g = headUp(g, 2, 16);
  bushyTail(g, i >= 2);
  return g;
}

/** Lobo lunar: pelagem prateada, olhos acesos, a lua crescente na testa, juba clara; estrelas piscam em volta. */
function wolfLunar(i) {
  let g = blank();
  wolfBase(g);
  dots(g, [[15, 5], [14, 6], [14, 7], [15, 8]], 'c');
  rect(g, 10, 16, 11, 16, 'l');
  rect(g, 9, 17, 11, 18, 'l');
  rect(g, 19, 16, 20, 16, 'l');
  rect(g, 19, 17, 21, 18, 'l');
  if (i % 2) g = headUp(g, 2, 16);
  bushyTail(g, i >= 2);
  if (i >= 2) dots(g, [[4, 6], [27, 9], [5, 14]], 'c');
  else dots(g, [[5, 9], [26, 5], [3, 16]], 'c');
  return g;
}

/** Tigre: o corpo grande do canídeo, orelhas redondas, listras pretas, focinho branco com nariz rosa. */
function tiger(i) {
  let g = blank();
  dogBody(g);
  rect(g, 8, 4, 10, 6, 'o');
  px(g, 9, 5, 'l');
  rect(g, 20, 4, 22, 6, 'o');
  px(g, 21, 5, 'l');
  px(g, 22, 5, 'd');
  rect(g, 12, 11, 18, 14, 'l');
  rect(g, 13, 15, 17, 15, 'l');
  rect(g, 14, 12, 16, 12, 'p');
  px(g, 15, 13, 'p');
  px(g, 15, 14, 'd');
  rect(g, 12, 9, 13, 10, 'e');
  px(g, 13, 10, 'k');
  rect(g, 17, 9, 18, 10, 'e');
  px(g, 17, 10, 'k');
  dots(g, [
    [15, 5], [15, 6], [15, 7], [12, 6], [12, 7], [18, 6], [18, 7], [10, 9], [10, 10], [20, 9], [20, 10],
    [11, 18], [19, 18], [9, 20], [10, 21], [9, 22], [10, 23], [9, 24], [21, 20], [20, 21], [21, 22], [20, 23], [21, 24],
  ], 'k');
  if (i % 2) g = headUp(g, 2, 16);
  // rabo grosso, listrado
  const dx = i >= 2 ? -1 : 0;
  rect(g, 22, 23, 23, 24, 'o');
  rect(g, 23, 21, 24, 22, 'o');
  rect(g, 24 + dx, 19, 25 + dx, 20, 'o');
  rect(g, 25 + dx, 17, 26 + dx, 18, 'o');
  rect(g, 25 + dx, 16, 26 + dx, 16, 'l');
  dots(g, [[23, 23], [24, 21], [25 + dx, 19], [26 + dx, 17]], 'k');
  return g;
}

// ---------------------------------------------------------------- gatos

/** Gato sentado: cabeça, olhos, focinho, corpo esguio, peito claro e patas. Sem orelhas, listras nem rabo. */
function catBody(g) {
  rect(g, 11, 6, 19, 6, 'o');
  rect(g, 10, 7, 20, 14, 'o');
  rect(g, 11, 15, 19, 15, 'o');
  rect(g, 20, 8, 20, 13, 'd');
  rect(g, 12, 9, 13, 10, 'e');
  rect(g, 13, 9, 13, 10, 'k');
  rect(g, 17, 9, 18, 10, 'e');
  rect(g, 17, 9, 17, 10, 'k');
  rect(g, 13, 11, 17, 14, 'l');
  px(g, 15, 12, 'p');
  px(g, 14, 13, 'd');
  px(g, 16, 13, 'd');
  rect(g, 12, 16, 18, 16, 'o');
  rect(g, 11, 17, 19, 19, 'o');
  rect(g, 10, 20, 20, 26, 'o');
  rect(g, 19, 17, 19, 19, 'd');
  rect(g, 20, 20, 20, 26, 'd');
  rect(g, 13, 16, 17, 16, 'l');
  rect(g, 13, 17, 17, 25, 'l');
  rect(g, 12, 22, 13, 27, 'o');
  rect(g, 17, 22, 18, 27, 'o');
  rect(g, 18, 22, 18, 27, 'd');
  rect(g, 11, 28, 14, 28, 'l');
  rect(g, 16, 28, 19, 28, 'l');
  rect(g, 8, 27, 10, 28, 'o');
  rect(g, 20, 27, 22, 28, 'o');
  px(g, 22, 27, 'd');
  px(g, 22, 28, 'd');
}

/** Orelhas triangulares. `inner` = cor de dentro. */
function catEars(g, inner) {
  px(g, 10, 3, 'o');
  rect(g, 10, 4, 11, 4, 'o');
  rect(g, 10, 5, 12, 5, 'o');
  px(g, 11, 5, inner);
  px(g, 20, 3, 'o');
  rect(g, 19, 4, 20, 4, 'o');
  rect(g, 18, 5, 20, 5, 'o');
  px(g, 19, 5, inner);
}

/** Listras na testa e no flanco. */
function catStripes(g) {
  dots(g, [[13, 7], [15, 7], [17, 7], [15, 8], [10, 21], [10, 23], [10, 25]], 'd');
}

/** Rabo fino subindo pela direita; a ponta balança nos frames 2 e 3. */
function catTail(g, i) {
  rect(g, 22, 26, 23, 26, 'o');
  rect(g, 23, 25, 24, 25, 'o');
  dots(g, [[24, 24], [24, 23], [25, 22], [25, 21], [25, 20]], 'o');
  if (i >= 2) {
    px(g, 25, 19, 'o');
    px(g, 24, 18, 'o');
    px(g, 24, 17, 'd');
  } else {
    px(g, 26, 19, 'o');
    px(g, 26, 18, 'o');
    px(g, 26, 17, 'd');
  }
}

function cat(i) {
  let g = blank();
  catBody(g);
  catEars(g, 'p');
  catStripes(g);
  if (i % 2) g = headUp(g, 3, 16);
  catTail(g, i);
  return g;
}

/** Lince: tufos pretos nas orelhas, costeletas largas, pintas e o rabo curto. */
function lynx(i) {
  let g = blank();
  catBody(g);
  catEars(g, 'l');
  dots(g, [[10, 2], [9, 1], [20, 2], [21, 1]], 'k');
  rect(g, 9, 11, 9, 15, 'o');
  rect(g, 8, 12, 8, 15, 'l');
  rect(g, 21, 11, 21, 15, 'o');
  rect(g, 22, 12, 22, 15, 'l');
  px(g, 22, 15, 'd');
  dots(g, [[13, 7], [17, 7], [11, 18], [19, 18], [12, 21], [18, 21], [11, 24], [19, 24]], 'd');
  if (i % 2) g = headUp(g, 1, 16);
  const dy = i >= 2 ? -1 : 0;
  rect(g, 21, 25 + dy, 23, 26 + dy, 'o');
  px(g, 23, 25 + dy, 'k');
  px(g, 23, 26 + dy, 'd');
  return g;
}

/** Gato egípcio: pelagem escura, olhos dourados delineados, coleira de ouro com pingente e um brinco. */
function catEgyptian(i) {
  let g = blank();
  catBody(g);
  catEars(g, 'g');
  dots(g, [[11, 10], [14, 10], [16, 10], [19, 10]], 'k');
  rect(g, 12, 16, 18, 16, 'g');
  px(g, 18, 16, 'q');
  px(g, 15, 17, 'g');
  px(g, 20, 6, 'g');
  if (i % 2) g = headUp(g, 3, 16);
  catTail(g, i);
  return g;
}

/** Esfinge: o gato com o nemes (a touca listrada de ouro e azul), a serpente na testa e o colar. */
function sphinx(i) {
  let g = blank();
  catBody(g);
  rect(g, 11, 3, 19, 3, 'g');
  rect(g, 10, 4, 20, 4, 'u');
  rect(g, 10, 5, 20, 5, 'g');
  px(g, 15, 3, 'u');
  px(g, 15, 2, 'g');
  rect(g, 8, 6, 9, 16, 'g');
  rect(g, 21, 6, 22, 16, 'g');
  for (const y of [6, 8, 10, 12, 14]) {
    rect(g, 8, y, 9, y, 'u');
    rect(g, 21, y, 22, y, 'u');
  }
  rect(g, 12, 16, 18, 16, 'g');
  px(g, 15, 17, 'u');
  if (i % 2) g = headUp(g, 2, 16);
  catTail(g, i);
  return g;
}

// ---------------------------------------------------------------- cobras

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

/** Os três anéis enrolados, com as escamas marcadas. */
function snakeCoil(g) {
  ring(g, 6, 26, 25, 28);
  ring(g, 8, 22, 23, 25);
  ring(g, 10, 18, 21, 21);
  for (const x of [9, 13, 17, 21]) px(g, x, 27, 'd');
  for (const x of [11, 15, 19]) px(g, x, 23, 'd');
  for (const x of [13, 17]) px(g, x, 19, 'd');
}

/** Pescoço erguido à esquerda e a cabeça olhando pra direita; `sway` balança 1 px, `tongue` mostra a língua. */
function snakeHead(g, sway, tongue) {
  rect(g, 9 + sway, 12, 11 + sway, 18, 'o');
  rect(g, 11 + sway, 12, 11 + sway, 18, 'd');
  rect(g, 7 + sway, 9, 14 + sway, 9, 'o');
  rect(g, 6 + sway, 10, 15 + sway, 12, 'o');
  rect(g, 7 + sway, 13, 13 + sway, 13, 'o');
  rect(g, 8 + sway, 13, 12 + sway, 13, 'l');
  px(g, 12 + sway, 10, 'e');
  px(g, 13 + sway, 10, 'k');
  px(g, 15 + sway, 12, 'd');
  if (tongue) {
    px(g, 16 + sway, 12, 'p');
    px(g, 17 + sway, 11, 'p');
    px(g, 17 + sway, 13, 'p');
  }
}

function snake(i) {
  const g = blank();
  snakeCoil(g);
  snakeHead(g, i % 2, i >= 2);
  return g;
}

/** Naja: o capuz aberto atrás da cabeça (mais escuro que ela), com a marca de "óculos" no alto. */
function naja(i) {
  const g = blank();
  const sway = i % 2;
  snakeCoil(g);
  rect(g, 4 + sway, 6, 17 + sway, 15, 'd');
  rect(g, 5 + sway, 5, 16 + sway, 5, 'd');
  rect(g, 5 + sway, 6, 16 + sway, 14, 's');
  dots(g, [[4 + sway, 6], [17 + sway, 6], [4 + sway, 15], [17 + sway, 15]], '.');
  rect(g, 8 + sway, 6, 9 + sway, 7, 'l');
  rect(g, 12 + sway, 6, 13 + sway, 7, 'l');
  rect(g, 10 + sway, 7, 11 + sway, 7, 'l');
  snakeHead(g, sway, i >= 2);
  return g;
}

/** Basilisco: a serpente coroada — coroa de ouro com a gema, olhar aceso, espinhos no dorso. */
function basilisk(i) {
  const g = blank();
  const sway = i % 2;
  snakeCoil(g);
  for (const x of [12, 16, 20]) px(g, x, 17, 'd');
  px(g, 9, 21, 'd');
  px(g, 22, 21, 'd');
  snakeHead(g, sway, i >= 2);
  rect(g, 8 + sway, 8, 13 + sway, 8, 'g');
  dots(g, [[8 + sway, 7], [10 + sway, 7], [13 + sway, 7], [10 + sway, 6]], 'g');
  px(g, 11 + sway, 7, 'u');
  px(g, 14 + sway, 10, 'e');
  return g;
}

/** Serpe: a cobra que criou chifres e escamas de brasa — o primeiro passo pro dragão. */
function wyrm(i) {
  const g = blank();
  const sway = i % 2;
  snakeCoil(g);
  for (const x of [12, 16, 20]) px(g, x, 17, 'd');
  snakeHead(g, sway, i >= 2);
  dots(g, [[8 + sway, 8], [7 + sway, 7], [13 + sway, 8], [14 + sway, 7]], 'h');
  if (i >= 2) dots(g, [[14, 19], [13, 23], [18, 27]], 'f');
  return g;
}

/** Dragão: o corpo de serpente ganha asa (bate nos frames 2 e 3), chifres e fogo pela boca. */
function dragon(i) {
  const g = blank();
  const sway = i % 2;
  const wy = i >= 2 ? -1 : 0;
  // asa atrás do corpo (então vem primeiro): osso na diagonal, membrana recortada embaixo
  for (let k = 0; k < 8; k++) {
    const x = 19 + k;
    const y = 18 + wy - k;
    rect(g, x, y + 1, x, Math.min(19 + wy, y + 4), 'm');
    px(g, x, y, 'd');
  }
  px(g, 27, 10 + wy, 'd');
  snakeCoil(g);
  for (const x of [12, 16]) px(g, x, 17, 'd');
  snakeHead(g, sway, false);
  dots(g, [[8 + sway, 8], [7 + sway, 7], [13 + sway, 8], [14 + sway, 7]], 'h');
  if (i >= 2) {
    dots(g, [[16 + sway, 12], [17 + sway, 11], [18 + sway, 12], [17 + sway, 13]], 'f');
    px(g, 17 + sway, 12, 'y');
  }
  return g;
}

// ---------------------------------------------------------------- bovinos

/** Vaca em pé, de frente: cabeça larga, orelhas pra fora (a esquerda mexe), focinho rosa, corpo, pernas e cascos. */
function cowBody(g, flick) {
  rect(g, 11, 5, 20, 5, 'o');
  rect(g, 10, 6, 21, 6, 'o');
  rect(g, 9, 7, 22, 14, 'o');
  rect(g, 10, 15, 21, 15, 'o');
  rect(g, 22, 8, 22, 13, 'd');
  rect(g, 6, 8 + flick, 8, 10 + flick, 'o');
  px(g, 7, 9 + flick, 'p');
  rect(g, 6, 8 + flick, 6, 10 + flick, 'd');
  rect(g, 23, 8, 25, 10, 'o');
  px(g, 24, 9, 'p');
  rect(g, 25, 8, 25, 10, 'd');
  rect(g, 11, 9, 12, 10, 'k');
  px(g, 12, 9, 'w');
  rect(g, 18, 9, 19, 10, 'k');
  px(g, 19, 9, 'w');
  rect(g, 11, 12, 20, 15, 'p');
  rect(g, 12, 16, 19, 16, 'p');
  px(g, 13, 14, 'k');
  px(g, 18, 14, 'k');
  rect(g, 9, 17, 22, 18, 'o');
  rect(g, 8, 19, 23, 25, 'o');
  rect(g, 23, 19, 23, 25, 'd');
  rect(g, 22, 17, 22, 18, 'd');
  for (const x of [9, 13, 17, 21]) {
    rect(g, x, 26, x + 2, 27, 'o');
    rect(g, x + 2, 26, x + 2, 27, 'd');
    rect(g, x, 28, x + 2, 28, 'k');
  }
}

function cowHorns(g) {
  rect(g, 8, 5, 9, 5, 'h');
  px(g, 8, 6, 'h');
  rect(g, 22, 5, 23, 5, 'h');
  px(g, 23, 6, 'h');
}

/** As manchas da vaca: uma na cabeça, duas no corpo. */
function cowSpots(g) {
  rect(g, 15, 5, 20, 8, 's');
  px(g, 14, 6, 's');
  px(g, 21, 9, 's');
  rect(g, 8, 19, 11, 22, 's');
  px(g, 12, 20, 's');
  rect(g, 18, 22, 22, 25, 's');
  px(g, 17, 23, 's');
}

/** Rabo com tufo; o tufo balança. */
function cowTail(g, flick) {
  rect(g, 24, 19, 24, 23, 'o');
  px(g, 24 + flick, 24, 'k');
  px(g, 24 + flick, 25, 'k');
}

function cow(i) {
  let g = blank();
  const flick = i >= 2 ? 1 : 0;
  cowHorns(g);
  cowBody(g, flick);
  cowSpots(g);
  if (i % 2) g = headUp(g, 4, 17);
  cowTail(g, flick);
  return g;
}

/** Vaca premiada: a estrela da feira — flor atrás da orelha, coleira vermelha com sino. */
function cowPrize(i) {
  let g = blank();
  const flick = i >= 2 ? 1 : 0;
  cowHorns(g);
  cowBody(g, flick);
  cowSpots(g);
  dots(g, [[20, 4], [19, 5], [21, 5], [20, 6]], 'p');
  px(g, 20, 5, 'y');
  rect(g, 10, 17, 21, 17, 'r');
  px(g, 21, 17, 'q');
  rect(g, 14, 18, 16, 19, 'g');
  px(g, 16, 19, 'q');
  px(g, 15, 20, 'k');
  if (i % 2) g = headUp(g, 4, 17);
  cowTail(g, flick);
  return g;
}

/** Vaca dourada: a lendária — pelagem de ouro com manchas creme, coleira azul, brilhos em volta. */
function cowGolden(i) {
  let g = blank();
  const flick = i >= 2 ? 1 : 0;
  cowHorns(g);
  cowBody(g, flick);
  cowSpots(g);
  rect(g, 10, 17, 21, 17, 'u');
  rect(g, 14, 18, 16, 19, 'l');
  px(g, 15, 20, 'k');
  if (i % 2) g = headUp(g, 4, 17);
  cowTail(g, flick);
  if (i >= 2) dots(g, [[5, 5], [27, 15], [3, 22]], 'w');
  else dots(g, [[4, 12], [27, 4], [28, 24]], 'w');
  return g;
}

/** Touro: pelagem escura, chifres grandes curvando pra cima, testa franzida, ombros largos e argola no nariz. */
function bull(i) {
  let g = blank();
  const flick = i >= 2 ? 1 : 0;
  dots(g, [[8, 6], [7, 5], [6, 4], [7, 4], [6, 3], [23, 6], [24, 5], [24, 4], [25, 4], [25, 3]], 'h');
  cowBody(g, flick);
  rect(g, 10, 8, 12, 8, 'd');
  rect(g, 18, 8, 20, 8, 'd');
  rect(g, 7, 16, 11, 16, 'o');
  rect(g, 20, 16, 24, 16, 'o');
  rect(g, 7, 17, 8, 18, 'o');
  rect(g, 23, 17, 24, 18, 'd');
  rect(g, 15, 16, 16, 17, 'g');
  if (i % 2) g = headUp(g, 3, 17);
  cowTail(g, flick);
  return g;
}

/** Bisão: a corcova escura nos ombros, a franja no alto da cabeça, a barba e os chifres curvos. */
function bison(i) {
  let g = blank();
  const flick = i >= 2 ? 1 : 0;
  cowBody(g, flick);
  rect(g, 9, 3, 22, 4, 'm');
  px(g, 10, 5, 'm');
  px(g, 21, 5, 'm');
  rect(g, 5, 13, 8, 18, 'm');
  rect(g, 23, 13, 26, 18, 'm');
  px(g, 5, 13, '.');
  px(g, 26, 13, '.');
  rect(g, 9, 16, 11, 16, 'm');
  rect(g, 20, 16, 22, 16, 'm');
  rect(g, 13, 17, 18, 18, 'm');
  px(g, 14, 19, 'm');
  px(g, 16, 19, 'm');
  dots(g, [[8, 5], [7, 4], [7, 3], [8, 2], [23, 5], [24, 4], [24, 3], [23, 2]], 'h');
  if (i % 2) g = headUp(g, 2, 17);
  cowTail(g, flick);
  return g;
}

// ---------------------------------------------------------------- aves

/** Pomba de lado, olhando pra direita: cauda, corpo redondo, barriga clara, pernas e pés. */
function doveBody(g) {
  rect(g, 4, 19, 8, 21, 'o');
  rect(g, 3, 20, 4, 21, 'd');
  rect(g, 5, 22, 7, 22, 'd');
  rect(g, 9, 15, 22, 15, 'o');
  rect(g, 8, 16, 23, 23, 'o');
  rect(g, 9, 24, 22, 24, 'o');
  rect(g, 10, 25, 20, 25, 'o');
  rect(g, 22, 17, 23, 23, 'd');
  rect(g, 11, 22, 19, 25, 'l');
  rect(g, 13, 26, 13, 27, 'b');
  rect(g, 18, 26, 18, 27, 'b');
  rect(g, 12, 28, 15, 28, 'b');
  rect(g, 17, 28, 20, 28, 'b');
}

/** Pescoço, cabeça pequena, olho e bico. */
function doveHead(g) {
  rect(g, 17, 12, 22, 14, 'o');
  rect(g, 17, 8, 23, 8, 'o');
  rect(g, 16, 9, 24, 12, 'o');
  rect(g, 17, 13, 23, 13, 'o');
  rect(g, 24, 10, 24, 12, 'd');
  px(g, 22, 10, 'k');
  rect(g, 25, 11, 26, 11, 'b');
  px(g, 25, 12, 'b');
}

/** Asa fechada no flanco; `dy` = -1 quando bate. */
function doveWing(g, dy) {
  rect(g, 9, 17 + dy, 17, 21 + dy, 'd');
  rect(g, 7, 18 + dy, 8, 20 + dy, 'd');
  px(g, 18, 18 + dy, 'd');
  px(g, 18, 19 + dy, 'd');
}

/** Asa erguida atrás do corpo, subindo pra esquerda; `wy` = 1 quando bate (desce). `tip` colore a ponta de cada pena. */
function raisedWing(g, wy, tip) {
  for (let k = 0; k < 8; k++) {
    const x = 15 - k;
    const y = 15 + wy - k;
    const bottom = Math.min(17 + wy, y + 3);
    rect(g, x, y + 1, x, bottom, 'o');
    px(g, x, bottom, tip);
    px(g, x, y, 'd');
  }
  px(g, 7, 7 + wy, 'd');
}

function dove(i) {
  let g = blank();
  doveBody(g);
  doveHead(g);
  if (i % 2) g = headUp(g, 7, 15);
  doveWing(g, i >= 2 ? -1 : 0);
  return g;
}

/** Pássaro de fogo: a pomba em brasa — cauda e crista de chamas (a crista acompanha a cabeça). */
function firebird(i) {
  let g = blank();
  doveBody(g);
  doveHead(g);
  rect(g, 2, 19, 3, 21, 'f');
  px(g, 1, 20, 'y');
  px(g, 3, 20, 'y');
  if (i % 2) g = headUp(g, 7, 15);
  const up = i % 2;
  doveWing(g, i >= 2 ? -1 : 0);
  dots(g, [[19, 7 - up], [20, 6 - up], [21, 7 - up]], 'f');
  px(g, 20, 7 - up, 'y');
  if (i >= 2) px(g, 20, 5 - up, 'y');
  return g;
}

/** Fênix: asa erguida com pontas de fogo, três penas na crista e a cauda longa que escorre em chamas. */
function phoenix(i) {
  let g = blank();
  raisedWing(g, i >= 2 ? 1 : 0, 'f');
  doveBody(g);
  doveHead(g);
  dots(g, [[3, 21], [4, 22], [5, 23]], 'o');
  dots(g, [[2, 22], [3, 23], [4, 24]], 'f');
  dots(g, [[1, 23], [2, 24], [3, 25]], 'y');
  if (i % 2) g = headUp(g, 7, 15);
  const up = i % 2;
  dots(g, [[18, 7 - up], [20, 6 - up], [22, 7 - up]], 'f');
  dots(g, [[18, 6 - up], [20, 5 - up], [22, 6 - up]], 'y');
  return g;
}

/** Falcão: cinza-ardósia, bico em gancho, a "bigodeira" preta embaixo do olho, peito barrado e garras. */
function falcon(i) {
  let g = blank();
  doveBody(g);
  doveHead(g);
  dots(g, [[12, 23], [14, 23], [16, 23], [18, 23], [13, 24], [15, 24], [17, 24]], 'd');
  px(g, 2, 20, 'd');
  if (i % 2) g = headUp(g, 7, 15);
  const up = i % 2;
  doveWing(g, i >= 2 ? -1 : 0);
  px(g, 26, 12 - up, 'k');
  px(g, 25, 12 - up, '.');
  px(g, 22, 11 - up, 'k');
  px(g, 22, 12 - up, 'k');
  dots(g, [[12, 28], [15, 28], [17, 28], [20, 28]], 'k');
  return g;
}

/** Águia: cabeça e cauda brancas, bico grande em gancho, sobrancelha séria, asa erguida (bate) e garras. */
function eagle(i) {
  let g = blank();
  raisedWing(g, i >= 2 ? 1 : 0, 'd');
  doveBody(g);
  doveHead(g);
  rect(g, 17, 12, 22, 14, 'l');
  rect(g, 17, 8, 23, 8, 'l');
  rect(g, 16, 9, 24, 12, 'l');
  rect(g, 17, 13, 23, 13, 'l');
  rect(g, 24, 10, 24, 12, 'z');
  px(g, 22, 10, 'k');
  px(g, 21, 9, 'd');
  rect(g, 4, 19, 8, 21, 'l');
  rect(g, 3, 20, 4, 21, 'z');
  rect(g, 5, 22, 7, 22, 'z');
  rect(g, 25, 11, 27, 11, 'b');
  px(g, 26, 12, 'b');
  px(g, 27, 12, 'k');
  if (i % 2) g = headUp(g, 7, 15);
  dots(g, [[12, 28], [15, 28], [17, 28], [20, 28]], 'k');
  return g;
}

// ---------------------------------------------------------------- paletas

const WHITE = [255, 255, 255];
const GOLD = [246, 206, 72];
const DARK_GOLD = [170, 130, 30];

const PALETTES = {
  dog: { o: [214, 146, 74], d: [160, 96, 40], l: [245, 222, 180], k: [40, 30, 25], w: WHITE, p: [232, 150, 160] },
  'dog-shepherd': { o: [196, 134, 62], d: [140, 90, 38], l: [226, 192, 140], k: [25, 22, 24], w: WHITE, p: [225, 150, 150], s: [38, 36, 42] },
  'dog-legend': { o: [196, 134, 62], d: [140, 90, 38], l: [226, 192, 140], k: [25, 22, 24], w: WHITE, p: [225, 150, 150], s: [38, 36, 42], z: [176, 172, 168], r: [204, 44, 56], q: [136, 22, 38], g: GOLD },
  wolf: { o: [128, 134, 146], d: [80, 86, 98], l: [206, 210, 220], k: [28, 28, 34], w: WHITE, e: [240, 190, 70] },
  'wolf-lunar': { o: [196, 206, 224], d: [128, 146, 176], l: [238, 244, 252], k: [30, 36, 54], w: WHITE, e: [130, 235, 255], c: [130, 235, 255] },
  cat: { o: [232, 152, 62], d: [178, 100, 34], l: [250, 232, 200], k: [30, 25, 25], w: WHITE, e: [120, 200, 80], p: [236, 140, 150] },
  lynx: { o: [198, 166, 118], d: [138, 106, 66], l: [242, 232, 210], k: [30, 25, 25], w: WHITE, e: [232, 190, 70], p: [220, 140, 140] },
  tiger: { o: [236, 140, 50], d: [190, 95, 30], l: [252, 240, 222], k: [28, 24, 24], w: WHITE, e: [240, 200, 70], p: [232, 140, 140] },
  'cat-egyptian': { o: [72, 66, 84], d: [44, 40, 56], l: [122, 114, 134], k: [18, 16, 22], w: WHITE, e: [240, 196, 70], p: [150, 110, 120], g: GOLD, q: DARK_GOLD },
  sphinx: { o: [226, 196, 140], d: [176, 140, 84], l: [250, 236, 204], k: [40, 32, 28], w: WHITE, e: [46, 150, 160], p: [225, 150, 140], g: GOLD, u: [56, 96, 196] },
  snake: { o: [92, 172, 82], d: [46, 112, 52], l: [196, 224, 156], k: [25, 30, 25], e: [242, 202, 60], p: [222, 62, 72] },
  naja: { o: [150, 162, 74], d: [58, 68, 28], s: [96, 108, 42], l: [222, 224, 160], k: [25, 30, 25], e: [240, 200, 60], p: [220, 60, 70] },
  basilisk: { o: [84, 56, 120], d: [48, 28, 76], l: [170, 140, 200], k: [20, 14, 30], e: [214, 96, 250], p: [240, 80, 120], g: GOLD, u: [80, 200, 120] },
  'snake-wyrm': { o: [206, 72, 58], d: [134, 36, 40], l: [250, 192, 120], k: [30, 16, 16], e: [250, 220, 80], p: [255, 140, 60], h: [236, 226, 200], f: [255, 170, 40] },
  dragon: { o: [196, 52, 64], d: [118, 24, 42], l: [250, 200, 110], k: [28, 14, 20], e: [255, 230, 90], p: [255, 120, 50], h: [240, 230, 210], m: [232, 120, 96], f: [255, 160, 40], y: [255, 236, 150] },
  cow: { o: [246, 244, 238], d: [198, 196, 190], s: [40, 38, 42], p: [240, 172, 176], k: [30, 28, 30], w: WHITE, h: [222, 200, 150] },
  'cow-prize': { o: [246, 244, 238], d: [198, 196, 190], s: [40, 38, 42], p: [240, 172, 176], k: [30, 28, 30], w: WHITE, h: [222, 200, 150], r: [204, 44, 56], q: DARK_GOLD, g: GOLD, y: [255, 240, 150] },
  'cow-golden': { o: [240, 200, 80], d: [190, 140, 40], s: [255, 244, 210], p: [240, 170, 150], k: [40, 30, 20], w: WHITE, h: [250, 245, 230], u: [60, 100, 200], l: [250, 240, 220] },
  bull: { o: [78, 52, 46], d: [46, 30, 28], p: [120, 88, 88], k: [20, 16, 16], w: WHITE, h: [232, 222, 200], g: GOLD },
  bison: { o: [102, 68, 46], d: [66, 42, 28], m: [52, 34, 24], p: [96, 74, 70], k: [22, 16, 14], w: WHITE, h: [226, 214, 190] },
  dove: { o: [240, 240, 246], d: [196, 200, 214], l: WHITE, k: [30, 30, 40], b: [236, 150, 60] },
  'dove-fire': { o: [236, 112, 48], d: [182, 52, 40], l: [255, 204, 96], k: [30, 18, 16], b: [250, 210, 70], f: [255, 168, 40], y: [255, 240, 150] },
  phoenix: { o: [244, 156, 44], d: [204, 72, 36], l: [255, 222, 120], k: [30, 18, 14], b: [250, 206, 60], f: [255, 120, 32], y: [255, 238, 150] },
  falcon: { o: [92, 104, 128], d: [52, 60, 80], l: [236, 230, 220], k: [20, 20, 28], b: [240, 190, 50] },
  eagle: { o: [92, 62, 36], d: [56, 36, 20], l: [250, 250, 244], z: [214, 214, 206], k: [20, 16, 14], b: [246, 200, 60] },
};

const FORMS = {
  dog, 'dog-shepherd': shepherd, 'dog-legend': dogLegend, wolf, 'wolf-lunar': wolfLunar,
  cat, lynx, tiger, 'cat-egyptian': catEgyptian, sphinx,
  snake, naja, basilisk, 'snake-wyrm': wyrm, dragon,
  cow, 'cow-prize': cowPrize, 'cow-golden': cowGolden, bull, bison,
  dove, 'dove-fire': firebird, phoenix, falcon, eagle,
};

for (const [form, build] of Object.entries(FORMS)) {
  const dir = join(ROOT, 'public', 'idle', 'pets', form);
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 4; i++) {
    writeFileSync(join(dir, `${i}.png`), encodePNG(W, H, render(build(i), PALETTES[form])));
  }
  console.log(`${form}: 4 frames em public/idle/pets/${form}/`);
}
