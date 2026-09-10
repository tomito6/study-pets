// Os PNGs do personagem padrão, em public/idle/user/.
//
//   node --import ./scripts/ts-loader.mjs scripts/character-sprites.mjs
//   node --import ./scripts/ts-loader.mjs scripts/character-sprites.mjs --ascii
//   node --import ./scripts/ts-loader.mjs scripts/character-sprites.mjs --todos
//
// O app NÃO usa estes arquivos: ele pinta o personagem na hora, no canvas, com a
// aparência que o usuário escolheu (`src/infrastructure/avatar/sprite.ts`). Estes
// PNGs existem pra quem precisa de um arquivo: `scripts/app-icon.mjs`, que gera os
// ícones do PWA, e qualquer <img> de fallback.
//
// `--ascii` desenha os penteados no terminal (o jeito rápido de ver o que mudou);
// `--todos` escreve uma pasta por penteado em public/idle/user/estilos/, útil pra
// olhar a arte de uma vez.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AVATAR_H,
  AVATAR_W,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  avatarAscii,
  avatarFrames,
  avatarPalette,
} from '../src/domain/avatar.ts';
import { encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USER_DIR = join(ROOT, 'public', 'idle', 'user');

function render(grid, palette) {
  const buf = Buffer.alloc(AVATAR_W * AVATAR_H * 4);
  for (let y = 0; y < AVATAR_H; y++) {
    const row = grid[y] ?? '';
    for (let x = 0; x < AVATAR_W; x++) {
      const rgb = palette[row[x] ?? '.'];
      if (!rgb) continue;
      const i = (y * AVATAR_W + x) * 4;
      buf[i] = rgb[0];
      buf[i + 1] = rgb[1];
      buf[i + 2] = rgb[2];
      buf[i + 3] = 255;
    }
  }
  return buf;
}

function write(dir, cfg) {
  mkdirSync(dir, { recursive: true });
  const palette = avatarPalette(cfg);
  avatarFrames(cfg.style, cfg.body).forEach((grid, i) => {
    writeFileSync(join(dir, `${i}.png`), encodePNG(AVATAR_W, AVATAR_H, render(grid, palette)));
  });
}

if (process.argv.includes('--ascii')) {
  for (const s of HAIR_STYLES) {
    console.log(`\n=== ${s.name} (${s.id}) ===`);
    console.log(avatarAscii(s.id, 0));
  }
} else {
  write(USER_DIR, DEFAULT_AVATAR);
  let n = 1;
  if (process.argv.includes('--todos')) {
    for (const s of HAIR_STYLES) {
      write(join(USER_DIR, 'estilos', s.id), { ...DEFAULT_AVATAR, style: s.id });
      n++;
    }
  }
  console.log(`personagem: ${AVATAR_W}×${AVATAR_H}, ${n} aparência(s) × 4 frames → public/idle/user/`);
}
