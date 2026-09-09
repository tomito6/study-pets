// O personagem virando imagem: pega o grid de letras do domínio, pinta com a
// paleta da aparência escolhida e devolve um data: URI por frame.
//
// É infraestrutura porque toca canvas. O resultado é memoizado por aparência —
// 24×42 px são microssegundos, mas a UI pede os frames a cada render.
//
// Sem DOM (teste, SSR) devolve strings vazias: `<img src="">` não quebra nada,
// e nenhum teste depende de pixel.

import { AVATAR_FRAMES, AVATAR_H, AVATAR_W, avatarFrames, avatarPalette } from '../../domain/avatar';
import type { AvatarConfig } from '../../domain/avatar';

const cache = new Map<string, string[]>();
const keyOf = (cfg: AvatarConfig): string => `${cfg.skin}|${cfg.hair}|${cfg.style}`;

const EMPTY: string[] = Array.from({ length: AVATAR_FRAMES }, () => '');

function paint(grid: string[], palette: Record<string, readonly [number, number, number]>): string {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_W;
  canvas.height = AVATAR_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(AVATAR_W, AVATAR_H);
  for (let y = 0; y < AVATAR_H; y++) {
    const row = grid[y] ?? '';
    for (let x = 0; x < AVATAR_W; x++) {
      const rgb = palette[row[x] ?? '.'];
      if (!rgb) continue;
      const i = (y * AVATAR_W + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Os frames do personagem com esta aparência, como data: URI. */
export function avatarSprites(cfg: AvatarConfig): string[] {
  if (typeof document === 'undefined') return EMPTY;
  const key = keyOf(cfg);
  const hit = cache.get(key);
  if (hit) return hit;
  const palette = avatarPalette(cfg);
  const frames = avatarFrames(cfg.style).map((grid) => paint(grid, palette));
  cache.set(key, frames);
  return frames;
}
