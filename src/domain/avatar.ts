// O personagem do usuário: a aparência como DADOS, não como arquivo de imagem.
//
// A arte é desenhada aqui em código (mesmo espírito de `scripts/pixel-sprites.mjs`),
// num grid de letras — cada letra é um papel de cor, não uma cor. Quem pinta é a
// paleta, montada a partir do tom de pele e da cor de cabelo escolhidos. Por isso
// 6 tons × 9 cores × 6 penteados = 324 aparências sem um único PNG a mais.
//
// Puro: sem DOM, sem canvas. Quem transforma o grid em imagem é
// `src/infrastructure/avatar/sprite.ts`.
//
// Cosmético novo no futuro = uma letra nova na paleta e um desenho a mais aqui.

export const AVATAR_W = 24;
export const AVATAR_H = 42;
export const AVATAR_FRAMES = 4;

export type RGB = readonly [number, number, number];

export interface SkinTone {
  id: string;
  /** Nome do material, não da pessoa: a cor é da tinta. */
  name: string;
  /** Cor principal, sombra e o traço (contorno/boca) — o traço acompanha a pele. */
  base: RGB;
  shade: RGB;
  line: RGB;
}

export interface HairColor {
  id: string;
  name: string;
  base: RGB;
  shade: RGB;
}

export interface HairStyle {
  id: string;
  name: string;
}

/**
 * Seis tons, do mais claro ao mais escuro, com passo parelho — nenhum é "o
 * padrão" e nenhum é um desvio dos outros. O contorno é sempre uma versão bem
 * escura do próprio tom: contorno preto chapado achata a pele escura.
 */
export const SKINS: readonly SkinTone[] = [
  { id: 'areia', name: 'Areia', base: [255, 219, 186], shade: [232, 184, 148], line: [122, 79, 56] },
  { id: 'mel', name: 'Mel', base: [240, 194, 148], shade: [212, 161, 116], line: [107, 67, 46] },
  { id: 'amendoa', name: 'Amêndoa', base: [211, 158, 111], shade: [180, 128, 85], line: [92, 56, 36] },
  { id: 'canela', name: 'Canela', base: [172, 118, 76], shade: [141, 92, 56], line: [72, 43, 27] },
  { id: 'castanha', name: 'Castanha', base: [126, 82, 52], shade: [99, 62, 38], line: [52, 31, 20] },
  { id: 'ebano', name: 'Ébano', base: [85, 55, 38], shade: [64, 40, 27], line: [36, 21, 14] },
];

export const HAIRS: readonly HairColor[] = [
  { id: 'preto', name: 'Preto', base: [42, 38, 42], shade: [26, 24, 28] },
  { id: 'castanho', name: 'Castanho', base: [88, 58, 38], shade: [62, 40, 26] },
  { id: 'castanho-claro', name: 'Castanho claro', base: [143, 100, 60], shade: [110, 74, 43] },
  { id: 'loiro', name: 'Loiro', base: [230, 190, 106], shade: [193, 148, 66] },
  { id: 'loiro-claro', name: 'Loiro claro', base: [246, 222, 168], shade: [214, 184, 120] },
  { id: 'ruivo', name: 'Ruivo', base: [190, 92, 44], shade: [148, 64, 30] },
  { id: 'grisalho', name: 'Grisalho', base: [154, 150, 152], shade: [117, 113, 117] },
  { id: 'branco', name: 'Branco', base: [230, 228, 226], shade: [188, 186, 188] },
  { id: 'azul', name: 'Azul', base: [86, 130, 190], shade: [58, 96, 150] },
];

export const HAIR_STYLES: readonly HairStyle[] = [
  { id: 'curto', name: 'Curto' },
  { id: 'ondulado', name: 'Ondulado' },
  { id: 'cacheado', name: 'Cacheado' },
  { id: 'longo', name: 'Longo' },
  { id: 'coque', name: 'Coque' },
  { id: 'raspado', name: 'Raspado' },
];

export interface AvatarConfig {
  skin: string;
  hair: string;
  style: string;
}

export const DEFAULT_AVATAR: AvatarConfig = { skin: 'mel', hair: 'castanho', style: 'curto' };

const has = <T extends { id: string }>(list: readonly T[], id: unknown): boolean =>
  typeof id === 'string' && list.some((x) => x.id === id);

/** Aparência lida do documento: o que não existe mais no catálogo vira o padrão. */
export function normalizeAvatar(raw: unknown): AvatarConfig {
  const a = (raw ?? {}) as Partial<AvatarConfig>;
  return {
    skin: has(SKINS, a.skin) ? a.skin! : DEFAULT_AVATAR.skin,
    hair: has(HAIRS, a.hair) ? a.hair! : DEFAULT_AVATAR.hair,
    style: has(HAIR_STYLES, a.style) ? a.style! : DEFAULT_AVATAR.style,
  };
}

export const skinOf = (id: string): SkinTone => SKINS.find((s) => s.id === id) ?? SKINS[1]!;
export const hairOf = (id: string): HairColor => HAIRS.find((h) => h.id === id) ?? HAIRS[1]!;

/**
 * As letras do grid → cor. `S`/`s` pele e sombra, `K` traço, `H`/`h` cabelo e
 * sombra, `W`/`E` olho, `C`/`c` camiseta, `P`/`p` calça, `B` sapato.
 */
export function avatarPalette(cfg: AvatarConfig): Record<string, RGB> {
  const skin = skinOf(cfg.skin);
  const hair = hairOf(cfg.hair);
  return {
    S: skin.base,
    s: skin.shade,
    K: skin.line,
    H: hair.base,
    h: hair.shade,
    W: [252, 250, 248],
    E: [58, 44, 38],
    C: [122, 154, 108],
    c: [95, 124, 84],
    P: [72, 84, 104],
    p: [55, 65, 82],
    B: [58, 52, 48],
  };
}

// ---------------------------------------------------------------- o desenho
//
// O corpo é preenchido com formas cheias; o contorno de 1 px sai sozinho no fim
// (`outline`), escurecendo só o que faz fronteira com o vazio. É o que faz o
// cabelo ter contorno de cabelo e a pele contorno de pele — contorno preto
// chapado achata tom escuro.

type Grid = string[][];

const blank = (): Grid => Array.from({ length: AVATAR_H }, () => Array(AVATAR_W).fill('.'));

function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string): void {
  for (let y = Math.max(0, y0); y <= Math.min(AVATAR_H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(AVATAR_W - 1, x1); x++) g[y]![x] = c;
  }
}
const px = (g: Grid, x: number, y: number, c: string) => rect(g, x, y, x, y, c);
const dots = (g: Grid, list: ReadonlyArray<readonly [number, number]>, c: string) =>
  list.forEach(([x, y]) => px(g, x, y, c));
/** Uma faixa simétrica: de `x0` até o espelho dele. O personagem é de frente. */
const band = (g: Grid, x0: number, y0: number, y1: number, c: string) =>
  rect(g, x0, y0, AVATAR_W - 1 - x0, y1, c);
/** Um par espelhado de retângulos (braço esquerdo e direito, perna e perna). */
function pair(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string): void {
  rect(g, x0, y0, x1, y1, c);
  rect(g, AVATAR_W - 1 - x1, y0, AVATAR_W - 1 - x0, y1, c);
}

/** Cada letra e a versão dela que serve de contorno. */
const OUTLINE: Record<string, string> = { S: 'K', s: 'K', H: 'h', h: 'h', C: 'c', c: 'c', P: 'p', p: 'p', B: 'B' };

/** Escurece a borda: todo pixel cheio que faz fronteira com o vazio vira o tom de contorno dele. */
function outline(rows: string[]): string[] {
  const g = rows.map((r) => r.split(''));
  const vazio = (x: number, y: number) => x < 0 || y < 0 || x >= AVATAR_W || y >= AVATAR_H || g[y]![x] === '.';
  return g.map((row, y) =>
    row.map((c, x) => {
      const o = OUTLINE[c];
      if (!o) return c;
      return vazio(x - 1, y) || vazio(x + 1, y) || vazio(x, y - 1) || vazio(x, y + 1) ? o : c;
    }).join(''),
  );
}

/** A silhueta da cabeça, linha a linha: um oval de 14 no meio, afinando nas pontas. */
const HEAD: ReadonlyArray<readonly [number, number]> = [
  [8, 4], [7, 5], [6, 6], [5, 7], [5, 8], [5, 9], [5, 10], [5, 11],
  [5, 12], [5, 13], [5, 14], [5, 15], [5, 16], [6, 17], [7, 18], [9, 19],
];

/** O corpo, sem cabelo: cabeça, rosto, tronco, braços e pernas. */
function body(g: Grid): void {
  for (const [x0, y] of HEAD) band(g, x0, y, y, 'S');

  // rosto
  pair(g, 8, 12, 9, 13, 'W');
  pair(g, 8, 13, 9, 13, 'E');
  pair(g, 8, 10, 9, 10, 'K');       // sobrancelhas
  dots(g, [[11, 15], [12, 15]], 's'); // nariz
  pair(g, 7, 14, 7, 15, 's');        // maçãs do rosto
  rect(g, 10, 17, 13, 17, 'K');      // boca

  // pescoço e tronco
  rect(g, 10, 20, 13, 21, 'S');
  rect(g, 10, 21, 13, 21, 's');
  rect(g, 8, 22, 15, 33, 'C');
  band(g, 8, 22, 22, 'c');           // gola
  pair(g, 8, 23, 8, 33, 'c');        // o vinco que separa o tronco do braço
  band(g, 8, 33, 33, 'c');           // barra da camiseta

  // braços: manga, antebraço, mão
  pair(g, 6, 23, 7, 28, 'C');
  pair(g, 6, 24, 6, 28, 'c');
  pair(g, 6, 29, 7, 32, 'S');
  pair(g, 6, 30, 6, 32, 's');

  // pernas e sapatos
  pair(g, 8, 34, 10, 39, 'P');
  pair(g, 8, 35, 8, 39, 'p');
  pair(g, 7, 40, 10, 41, 'B');
}

/** Cada penteado desenha a metade esquerda; `back` é o que fica atrás do corpo. */
type HairFn = (g: Grid, back: boolean) => void;

const HAIR_DRAW: Record<string, HairFn> = {
  // Cai reto até um pouco abaixo da orelha, com franja curta na testa.
  curto: (g, back) => {
    if (back) return;
    band(g, 8, 3, 3, 'H');
    band(g, 6, 4, 4, 'H');
    band(g, 5, 5, 8, 'H');
    pair(g, 5, 9, 6, 10, 'H');
    pair(g, 5, 5, 5, 10, 'h');
    band(g, 7, 8, 8, 'h');
  },
  // Mais volume e uma silhueta que quebra: mechas passando da orelha.
  ondulado: (g, back) => {
    if (back) {
      band(g, 5, 6, 15, 'H');
      pair(g, 5, 6, 5, 15, 'h');
      return;
    }
    band(g, 7, 2, 2, 'H');
    band(g, 5, 3, 3, 'H');
    band(g, 4, 4, 9, 'H');
    pair(g, 4, 10, 6, 14, 'H');
    pair(g, 4, 4, 4, 14, 'h');
    band(g, 7, 8, 9, 'h');
    dots(g, [[5, 3], [7, 2], [6, 11], [5, 13], [9, 7], [16, 11], [18, 13], [14, 7]], 'h');
  },
  // Volume arredondado que passa das orelhas dos dois lados; textura por pontos.
  cacheado: (g, back) => {
    if (back) {
      band(g, 3, 4, 11, 'H');
      band(g, 4, 12, 13, 'H');
      band(g, 5, 14, 14, 'H');
      pair(g, 3, 4, 3, 11, 'h');
      pair(g, 4, 12, 4, 13, 'h');
      return;
    }
    band(g, 7, 0, 0, 'H');
    band(g, 5, 1, 1, 'H');
    band(g, 4, 2, 2, 'H');
    band(g, 3, 3, 8, 'H');
    pair(g, 3, 9, 5, 12, 'H');
    pair(g, 3, 3, 3, 12, 'h');
    band(g, 6, 8, 8, 'h');
    dots(g, [[5, 2], [8, 0], [4, 5], [6, 3], [8, 2], [10, 1], [4, 7], [6, 6], [9, 4],
             [18, 2], [15, 0], [19, 5], [17, 3], [15, 2], [13, 1], [19, 7], [17, 6], [14, 4],
             [4, 10], [5, 12], [19, 10], [18, 12]], 'h');
  },
  // Desce até a cintura por trás; na frente, duas mechas emolduram o rosto.
  longo: (g, back) => {
    if (back) {
      band(g, 4, 6, 31, 'H');
      pair(g, 4, 6, 5, 31, 'h');
      band(g, 6, 31, 31, 'h');
      dots(g, [[5, 28], [6, 30], [18, 28], [17, 30]], 'h');
      return;
    }
    band(g, 8, 3, 3, 'H');
    band(g, 6, 4, 4, 'H');
    band(g, 5, 5, 8, 'H');
    pair(g, 4, 9, 5, 23, 'H');
    pair(g, 4, 9, 4, 23, 'h');
    band(g, 7, 8, 8, 'h');
    dots(g, [[5, 22], [5, 23], [18, 22], [18, 23]], 'h');
  },
  // Puxado pra trás, com o coque aparecendo por cima da cabeça.
  coque: (g, back) => {
    if (back) {
      rect(g, 9, 0, 14, 3, 'H');
      rect(g, 9, 0, 9, 3, 'h');
      rect(g, 9, 3, 14, 3, 'h');
      return;
    }
    band(g, 8, 4, 4, 'H');
    band(g, 6, 5, 5, 'H');
    band(g, 5, 6, 8, 'H');
    pair(g, 5, 9, 5, 11, 'H');
    pair(g, 5, 6, 5, 11, 'h');
    band(g, 6, 8, 8, 'h');   // só a linha da franja, que o cabelo puxado é liso
    dots(g, [[7, 5], [9, 4], [16, 5], [14, 4]], 'h');
  },
  // Rente à cabeça, quase só a sombra do couro cabeludo.
  raspado: (g, back) => {
    if (back) return;
    band(g, 8, 4, 4, 'H');
    band(g, 6, 5, 7, 'H');
    band(g, 6, 8, 8, 'h');  // só a linha onde o cabelo encontra a testa
    pair(g, 6, 9, 6, 10, 'H');
    dots(g, [[8, 4], [10, 4], [7, 5], [9, 6], [11, 5], [15, 4], [13, 4], [16, 5], [14, 6], [12, 5]], 'h');
  },
};

/** Sobe as linhas `y0..y1` em 1 px; a de baixo duplica (o pescoço estica). É a respiração. */
function headUp(rows: string[], y0: number, y1: number): string[] {
  const out = rows.slice();
  for (let y = y0; y <= y1; y++) out[y - 1] = rows[y]!;
  return out;
}

const cache = new Map<string, string[][]>();

/**
 * Os 4 frames de um penteado, como grids de letras. A animação é a respiração do
 * personagem original: cabeça e ombros sobem 1 px nos frames do meio e voltam —
 * dois pra dentro, dois pra fora, no ritmo dos pets (180 ms).
 */
export function avatarFrames(styleId: string): string[][] {
  const cached = cache.get(styleId);
  if (cached) return cached;

  const draw = HAIR_DRAW[styleId] ?? HAIR_DRAW.curto!;
  const g = blank();
  draw(g, true);   // o cabelo que fica atrás do corpo
  body(g);
  draw(g, false);  // e o que fica na frente

  const rest = g.map((r) => r.join(''));
  const frames = [outline(rest), outline(headUp(rest, 1, 21)), outline(headUp(rest, 1, 21)), outline(rest)];
  cache.set(styleId, frames);
  return frames;
}

/** Uma aparência em texto — o que os testes comparam e o que o script mostra no terminal. */
export const avatarAscii = (styleId: string, frame = 0): string => avatarFrames(styleId)[frame]!.join('\n');
