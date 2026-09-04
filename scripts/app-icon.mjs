// Gera os ícones do PWA a partir do personagem (public/idle/user/0.png), em código —
// arte autoral, sem baixar nada. Um ícone desenhado à mão pode substituir os PNGs
// em public/icons/ a qualquer hora; este script é só o ponto de partida.
//
//   node scripts/app-icon.mjs
//
// Renderiza numa página local, com o Chromium headless do próprio Playwright
// (nunca o Chrome do sistema), o sprite em canvas com imageSmoothingEnabled=false
// (pixel art nítida), centralizado sobre o fundo escuro do app (--bg de
// src/styles/app.css), e salva:
//   public/icons/icon-192.png, icon-512.png       — personagem grande, cantos do fundo
//   public/icons/icon-512-maskable.png            — fundo até a borda, personagem na zona segura (80%)
//   public/icons/apple-touch-icon.png (180)       — iOS

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spritePath = join(root, 'public', 'idle', 'user', '0.png');
const outDir = join(root, 'public', 'icons');

const css = readFileSync(join(root, 'src', 'styles', 'app.css'), 'utf8');
const BG = /--bg:\s*(#[0-9a-fA-F]{3,8})/.exec(css)?.[1] ?? '#0e0e0f';
const ACCENT = /--accent:\s*(#[0-9a-fA-F]{3,8})/.exec(css)?.[1] ?? '#a3e635';
const sprite = `data:image/png;base64,${readFileSync(spritePath).toString('base64')}`;

/** Um PNG: tamanho, fração da área que o personagem ocupa, e se o fundo vai até a borda (maskable). */
const targets = [
  { file: 'icon-192.png', size: 192, fill: 0.78, maskable: false },
  { file: 'icon-512.png', size: 512, fill: 0.78, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, fill: 0.6, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, fill: 0.7, maskable: true },
];

const page_html = `<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c"></canvas></body></html>`;

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(page_html);
  for (const t of targets) {
    const dataUrl = await page.evaluate(
      async ({ size, fill, maskable, bg, accent, sprite }) => {
        const img = new Image();
        img.src = sprite;
        await img.decode();
        const c = document.getElementById('c');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        // Fundo: o escuro do app. No ícone normal, cantos arredondados (o launcher não recorta);
        // no maskable, quadrado até a borda — quem recorta é o sistema.
        ctx.fillStyle = bg;
        if (maskable) {
          ctx.fillRect(0, 0, size, size);
        } else {
          const r = size * 0.18;
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.arcTo(size, 0, size, size, r);
          ctx.arcTo(size, size, 0, size, r);
          ctx.arcTo(0, size, 0, 0, r);
          ctx.arcTo(0, 0, size, 0, r);
          ctx.closePath();
          ctx.fill();
        }
        // Um chão sutil na cor de destaque, pro personagem não flutuar.
        const scale = Math.floor((size * fill) / Math.max(img.width, img.height));
        const w = img.width * scale;
        const h = img.height * scale;
        const x = Math.round((size - w) / 2);
        const y = Math.round((size - h) / 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x - scale, y + h - scale, w + scale * 2, scale);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, x, y, w, h);
        return c.toDataURL('image/png');
      },
      { size: t.size, fill: t.fill, maskable: t.maskable, bg: BG, accent: ACCENT, sprite },
    );
    writeFileSync(join(outDir, t.file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`ok ${t.file} (${t.size}px)`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
