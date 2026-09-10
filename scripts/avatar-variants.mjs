// Variantes de design do personagem, escritas no MESMO idioma de src/domain/avatar.ts
// (rect/band/pair, letras como papel de cor). A escolhida se cola no domínio trocando
// body() + HAIR_DRAW — nada aqui é jogado fora.
//
// O olho é peça separada: cada variante declara a CAIXA do olho esquerdo e o
// tratamento se desenha lá dentro, ancorado pelo lado de dentro (a distância entre
// os olhos é o que define o rosto). Letras novas: L cílio, I íris, i pupila, w brilho.

export function makeGrid(W, H) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) g[y][x] = c;
  };
  const px = (x, y, c) => rect(x, y, x, y, c);
  const dots = (l, c) => l.forEach(([x, y]) => px(x, y, c));
  const band = (x0, y0, y1, c) => rect(x0, y0, W - 1 - x0, y1, c);
  const pair = (x0, y0, x1, y1, c) => { rect(x0, y0, x1, y1, c); rect(W - 1 - x1, y0, W - 1 - x0, y1, c); };
  return { g, rect, px, dots, band, pair, W, H };
}

const OUTLINE = { S: 'K', s: 'K', H: 'h', h: 'h', C: 'c', c: 'c', P: 'p', p: 'p', B: 'B' };

export function outline(rows, W, H) {
  const g = rows.map((r) => r.split(''));
  const vazio = (x, y) => x < 0 || y < 0 || x >= W || y >= H || g[y][x] === '.';
  return g.map((row, y) => row.map((c, x) => {
    const o = OUTLINE[c];
    if (!o) return c;
    return vazio(x - 1, y) || vazio(x + 1, y) || vazio(x, y - 1) || vazio(x, y + 1) ? o : c;
  }).join(''));
}

export function headUp(rows, y0, y1) {
  const out = rows.slice();
  for (let y = y0; y <= y1; y++) out[y - 1] = rows[y];
  return out;
}

// ------------------------------------------------------------------- os olhos
// Cada tratamento é uma lista de padrões, do mais detalhado ao mais econômico;
// vale o primeiro que couber na caixa da variante. O olho direito é o espelho.

export const EYES = [
  { id: 'bloco', name: 'Bloco', flip: true,
    desc: 'O de hoje: branco em cima, escuro embaixo. Sem íris, sem cílio.',
    pats: [['WW', 'EE']] },
  { id: 'cilio', name: 'Cílio', flip: true,
    desc: 'Uma linha de pálpebra escura por cima e a pupila no meio do branco. Dá olhar sem colorir nada.',
    pats: [['LLL', 'WiW'], ['LL', 'ii']] },
  { id: 'iris', name: 'Íris', flip: true,
    desc: 'O olho é a íris inteira, com a pupila no meio. Redondo, olhar de bicho — o mais próximo dos pets.',
    pats: [['IiI', 'IiI'], ['II', 'ii']] },
  { id: 'brilho', name: 'Brilho', flip: true,
    desc: 'Cílio, íris, pupila e o ponto de luz no canto de fora. O mais expressivo — e o mais caro em pixel.',
    pats: [['LLLL', 'WwiI', 'WIiI'], ['LLL', 'wiI', 'IiI'], ['LLL', 'wiI'], ['LL', 'ii']] },
  { id: 'amendoado', name: 'Amendoado', flip: true,
    desc: 'Pálpebra em cima e embaixo, íris no meio: olhar sereno, o mais adulto dos seis.',
    pats: [['.LLL', 'wIiI', '.LL.'], ['LLL', 'IiI', 'LL.'], ['LLL', 'IiI'], ['LL', 'ii']] },
  { id: 'traco', name: 'Traço', flip: true,
    desc: 'Só a linha da pálpebra e a pupila. Sem branco — some a 24px e continua lendo.',
    pats: [['LLL', '.i.'], ['LL', 'ii']] },
];

const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));

function stamp(P, rows, x0, y0) {
  rows.forEach((row, dy) => row.split('').forEach((c, dx) => {
    if (c !== '.') P.rect(x0 + dx, y0 + dy, x0 + dx, y0 + dy, c);
  }));
}

/** Desenha o par de olhos da variante. `gap` afasta (+1) ou junta (−1) em 1px. */
export function drawEyes(P, v, eyeId, gap) {
  const t = EYES.find((e) => e.id === eyeId) ?? EYES[0];
  const box = v.eye;
  const pat = t.pats.find((p) => p[0].length <= box.w && p.length <= box.h) ?? t.pats[t.pats.length - 1];
  const pw = pat[0].length;
  const x = box.x + box.w - pw - (gap || 0);   // ancorado pelo lado de dentro do rosto
  stamp(P, pat, x, box.y);
  stamp(P, t.flip ? mirror(pat) : pat, P.W - 1 - x - pw + 1, box.y);
}

// ------------------------------------------------------------------ 0. Atual
// O que está no app hoje, portado pra cá pra poder receber os mesmos olhos.
const HEAD_ATUAL = [[8,4],[7,5],[6,6],[5,7],[5,8],[5,9],[5,10],[5,11],[5,12],[5,13],[5,14],[5,15],[5,16],[6,17],[7,18],[9,19]];
const atual = {
  id: 'atual', name: 'Atual', heads: '2,5 cabeças',
  tagline: 'O que está no app hoje: cabeça oval alta, tronco reto, boca larga.',
  W: 24, H: 42, breathe: [1, 21], face: [2, 21], eye: { x: 7, y: 12, w: 3, h: 3 },
  body(P) {
    const { rect, band, pair, dots } = P;
    for (const [x0, y] of HEAD_ATUAL) band(x0, y, y, 'S');
    pair(8, 10, 9, 10, 'K');
    dots([[11, 15], [12, 15]], 's');
    pair(7, 14, 7, 15, 's');
    rect(10, 17, 13, 17, 'K');
    rect(10, 20, 13, 21, 'S');
    rect(10, 21, 13, 21, 's');
    rect(8, 22, 15, 33, 'C');
    band(8, 22, 22, 'c');
    pair(8, 23, 8, 33, 'c');
    band(8, 33, 33, 'c');
    pair(6, 23, 7, 28, 'C');
    pair(6, 24, 6, 28, 'c');
    pair(6, 29, 7, 32, 'S');
    pair(6, 30, 6, 32, 's');
    pair(8, 34, 10, 39, 'P');
    pair(8, 35, 8, 39, 'p');
    pair(7, 40, 10, 41, 'B');
  },
  hairs: {
    curto(P, back) {
      if (back) return;
      const { band, pair } = P;
      band(8, 3, 3, 'H'); band(6, 4, 4, 'H'); band(5, 5, 8, 'H');
      pair(5, 9, 6, 10, 'H'); pair(5, 5, 5, 10, 'h'); band(7, 8, 8, 'h');
    },
    longo(P, back) {
      const { band, pair, dots } = P;
      if (back) { band(4, 6, 31, 'H'); pair(4, 6, 5, 31, 'h'); band(6, 31, 31, 'h');
        dots([[5, 28], [6, 30], [18, 28], [17, 30]], 'h'); return; }
      band(8, 3, 3, 'H'); band(6, 4, 4, 'H'); band(5, 5, 8, 'H');
      pair(4, 9, 5, 23, 'H'); pair(4, 9, 4, 23, 'h'); band(7, 8, 8, 'h');
      dots([[5, 22], [5, 23], [18, 22], [18, 23]], 'h');
    },
    coque(P, back) {
      const { rect, band, pair, dots } = P;
      if (back) { rect(9, 0, 14, 3, 'H'); rect(9, 0, 9, 3, 'h'); rect(9, 3, 14, 3, 'h'); return; }
      band(8, 4, 4, 'H'); band(6, 5, 5, 'H'); band(5, 6, 8, 'H');
      pair(5, 9, 5, 11, 'H'); pair(5, 6, 5, 11, 'h'); band(6, 8, 8, 'h');
      dots([[7, 5], [9, 4], [16, 5], [14, 4]], 'h');
    },
  },
};

// ------------------------------------------------------------------ 1. Companheiro
const companheiro = {
  id: 'companheiro', name: 'Companheiro', heads: '2,1 cabeças',
  tagline: 'Cabeça redonda, corpo compacto, bochecha. Fala a mesma língua dos pets.',
  W: 24, H: 36, breathe: [1, 18], face: [0, 18], eye: { x: 6, y: 9, w: 4, h: 3 },
  body(P) {
    const { rect, band, pair } = P;
    for (const [x0, y] of [[8,1],[6,2],[5,3],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[4,10],[4,11],[4,12],[4,13],[4,14],[5,15],[6,16],[8,17]])
      band(x0, y, y, 'S');
    pair(6, 12, 6, 13, 's');
    rect(11, 14, 12, 14, 'K');
    rect(10, 18, 13, 18, 'S');
    rect(7, 19, 16, 28, 'C');
    band(7, 19, 19, 'c');
    pair(7, 20, 7, 28, 'c');
    band(7, 28, 28, 'c');
    pair(5, 20, 6, 24, 'C');
    pair(5, 21, 5, 24, 'c');
    pair(5, 25, 6, 27, 'S');
    pair(5, 26, 5, 27, 's');
    pair(7, 29, 10, 33, 'P');
    pair(7, 30, 7, 33, 'p');
    pair(6, 34, 10, 35, 'B');
  },
  hairs: {
    curto(P, back) {
      if (back) return;
      const { band, pair } = P;
      band(8, 0, 0, 'H'); band(6, 1, 1, 'H'); band(5, 2, 2, 'H'); band(3, 3, 7, 'H');
      pair(3, 8, 5, 10, 'H'); pair(3, 3, 3, 10, 'h'); band(6, 7, 7, 'h');
    },
    longo(P, back) {
      const { band, pair, dots } = P;
      if (back) { band(3, 3, 26, 'H'); pair(3, 3, 4, 26, 'h'); dots([[4,24],[5,26],[19,24],[18,26]], 'h'); return; }
      band(8, 0, 0, 'H'); band(6, 1, 1, 'H'); band(5, 2, 2, 'H'); band(3, 3, 7, 'H');
      pair(3, 8, 4, 21, 'H'); pair(3, 3, 3, 21, 'h'); band(6, 7, 7, 'h');
    },
    coque(P, back) {
      const { rect, band, pair, dots } = P;
      if (back) { rect(9, 0, 14, 2, 'H'); rect(9, 0, 9, 2, 'h'); rect(9, 2, 14, 2, 'h'); return; }
      band(5, 2, 2, 'H'); band(4, 3, 7, 'H'); pair(4, 8, 4, 9, 'H');
      pair(4, 3, 4, 9, 'h'); band(6, 7, 7, 'h'); dots([[6, 3], [8, 2], [17, 3], [15, 2]], 'h');
    },
  },
};

// ------------------------------------------------------------------ 2. Estudante
const estudante = {
  id: 'estudante', name: 'Estudante', heads: '3,0 cabeças',
  tagline: 'Proporção adulta: cabeça menor, ombro largo, perna longa. Sério sem ser frio.',
  W: 24, H: 42, breathe: [1, 18], face: [1, 18], eye: { x: 7, y: 9, w: 3, h: 3 },
  body(P) {
    const { rect, band, pair, dots } = P;
    for (const [x0, y] of [[9,3],[7,4],[6,5],[6,6],[6,7],[6,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,15],[9,16]])
      band(x0, y, y, 'S');
    pair(8, 7, 9, 7, 'K');
    dots([[11, 12], [12, 12]], 's');
    pair(7, 11, 7, 12, 's');
    rect(11, 14, 12, 14, 'K');
    rect(10, 17, 13, 18, 'S');
    rect(10, 18, 13, 18, 's');
    rect(6, 19, 17, 31, 'C');
    band(6, 19, 19, 'c');
    pair(6, 20, 6, 31, 'c');
    band(6, 31, 31, 'c');
    pair(4, 20, 5, 26, 'C');
    pair(4, 21, 4, 26, 'c');
    pair(4, 27, 5, 31, 'S');
    pair(4, 28, 4, 31, 's');
    pair(6, 32, 9, 39, 'P');
    pair(6, 33, 6, 39, 'p');
    pair(5, 40, 9, 41, 'B');
  },
  hairs: {
    curto(P, back) {
      if (back) return;
      const { band, pair } = P;
      band(9, 2, 2, 'H'); band(7, 3, 3, 'H'); band(5, 4, 6, 'H');
      pair(5, 7, 6, 9, 'H'); pair(5, 4, 5, 9, 'h'); band(8, 6, 6, 'h');
    },
    longo(P, back) {
      const { band, pair, dots } = P;
      if (back) { band(5, 5, 30, 'H'); pair(5, 5, 6, 30, 'h'); dots([[6,28],[7,30],[17,28],[16,30]], 'h'); return; }
      band(9, 2, 2, 'H'); band(7, 3, 3, 'H'); band(5, 4, 6, 'H');
      pair(5, 7, 6, 23, 'H'); pair(5, 4, 5, 23, 'h'); band(8, 6, 6, 'h');
    },
    coque(P, back) {
      const { rect, band, pair, dots } = P;
      if (back) { rect(9, 0, 14, 3, 'H'); rect(9, 0, 9, 3, 'h'); rect(9, 3, 14, 3, 'h'); return; }
      band(8, 3, 3, 'H'); band(6, 4, 6, 'H'); pair(6, 7, 6, 10, 'H');
      pair(6, 4, 6, 10, 'h'); band(8, 6, 6, 'h'); dots([[8, 3], [10, 3], [15, 3], [13, 3]], 'h');
    },
  },
};

// ------------------------------------------------------------------ 3. Traço
const traco = {
  id: 'traco', name: 'Traço', heads: '2,6 cabeças',
  tagline: 'Silhueta antes de detalhe: massa sólida, pernas juntas. Lê como ícone.',
  W: 24, H: 42, breathe: [1, 21], face: [2, 21], eye: { x: 7, y: 11, w: 3, h: 3 },
  body(P) {
    const { rect, band, pair } = P;
    for (const [x0, y] of [[7,4],[6,5],[5,6],[5,7],[5,8],[5,9],[5,10],[5,11],[5,12],[5,13],[5,14],[5,15],[5,16],[5,17],[6,18],[8,19]])
      band(x0, y, y, 'S');
    pair(7, 15, 7, 16, 's');
    rect(10, 20, 13, 21, 'S');
    rect(6, 22, 17, 33, 'C');
    band(6, 22, 22, 'c');
    pair(8, 24, 8, 33, 'c');
    pair(6, 30, 7, 33, 'S');
    band(6, 33, 33, 'c');
    rect(7, 34, 16, 39, 'P');
    band(11, 34, 39, 'p');
    pair(6, 40, 10, 41, 'B');
  },
  hairs: {
    curto(P, back) {
      if (back) return;
      const { band, pair } = P;
      band(6, 3, 3, 'H'); band(4, 4, 10, 'H'); pair(4, 11, 5, 13, 'H');
      pair(4, 4, 4, 13, 'h'); band(7, 10, 10, 'h');
    },
    longo(P, back) {
      const { band, pair } = P;
      if (back) { band(4, 5, 32, 'H'); pair(4, 5, 5, 32, 'h'); return; }
      band(6, 3, 3, 'H'); band(4, 4, 10, 'H'); pair(4, 11, 5, 27, 'H');
      pair(4, 4, 4, 27, 'h'); band(7, 10, 10, 'h');
    },
    coque(P, back) {
      const { rect, band, pair } = P;
      if (back) { rect(9, 1, 14, 4, 'H'); rect(9, 1, 9, 4, 'h'); rect(9, 4, 14, 4, 'h'); return; }
      band(6, 4, 4, 'H'); band(5, 5, 10, 'H'); pair(5, 11, 5, 13, 'H');
      pair(5, 5, 5, 13, 'h'); band(7, 10, 10, 'h');
    },
  },
};

// ------------------------------------------------------------------ 4. 8-bit
const oitobit = {
  id: 'oitobit', name: '8-bit', heads: '2,5 cabeças',
  tagline: 'Grid de 16×28: pixel grande, detalhe mínimo. Charme de cartucho.',
  W: 16, H: 28, breathe: [1, 12], face: [0, 13], eye: { x: 4, y: 5, w: 3, h: 2 },
  body(P) {
    const { rect, band, pair } = P;
    for (const [x0, y] of [[4,1],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7],[3,8],[3,9],[4,10],[5,11]])
      band(x0, y, y, 'S');
    rect(7, 8, 8, 8, 'K');
    rect(6, 12, 9, 12, 'S');
    rect(3, 13, 12, 19, 'C');
    band(3, 13, 13, 'c');
    pair(3, 14, 3, 19, 'c');
    band(3, 19, 19, 'c');
    pair(1, 14, 2, 17, 'C');
    pair(1, 15, 1, 17, 'c');
    pair(1, 18, 2, 19, 'S');
    pair(3, 20, 6, 25, 'P');
    pair(3, 21, 3, 25, 'p');
    pair(2, 26, 6, 27, 'B');
  },
  hairs: {
    curto(P, back) {
      if (back) return;
      const { band, pair } = P;
      band(4, 0, 0, 'H'); band(2, 1, 1, 'H'); band(2, 2, 4, 'H');
      pair(2, 5, 2, 7, 'H'); pair(2, 2, 2, 7, 'h'); band(4, 4, 4, 'h');
    },
    longo(P, back) {
      const { band, pair } = P;
      if (back) { band(2, 2, 20, 'H'); pair(2, 2, 2, 20, 'h'); return; }
      band(4, 0, 0, 'H'); band(2, 1, 1, 'H'); band(2, 2, 4, 'H');
      pair(2, 5, 2, 16, 'H'); pair(2, 2, 2, 16, 'h'); band(4, 4, 4, 'h');
    },
    coque(P, back) {
      const { rect, band, pair } = P;
      if (back) { rect(6, 0, 9, 2, 'H'); rect(6, 0, 6, 2, 'h'); rect(6, 2, 9, 2, 'h'); return; }
      band(4, 1, 1, 'H'); band(3, 2, 4, 'H'); pair(3, 5, 3, 7, 'H');
      pair(3, 2, 3, 7, 'h'); band(4, 4, 4, 'h');
    },
  },
};

export const VARIANTS = [atual, companheiro, estudante, traco, oitobit];

/** Os dois grids únicos de uma variante: parado e "respirando". */
export function framesOf(v, styleId, eyeId, gap) {
  const P = makeGrid(v.W, v.H);
  const draw = v.hairs[styleId] ?? v.hairs.curto;
  draw(P, true);
  v.body(P);
  drawEyes(P, v, eyeId, gap);
  draw(P, false);
  const rest = P.g.map((r) => r.join(''));
  return [outline(rest, v.W, v.H), outline(headUp(rest, v.breathe[0], v.breathe[1]), v.W, v.H)];
}
