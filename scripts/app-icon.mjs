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
//   extension/icon-192.png                        — o ícone da extensão do bloqueio de sites
//   ios/App/App/Assets.xcassets/…                 — o ícone (1024) e a tela de abertura do app de iPhone
//
// A extensão sai daqui pelo mesmo motivo: era uma cópia manual do ícone do app, e
// nada avisava quando o personagem mudava. Se `extension/manifest.json` passar a
// pedir outro tamanho, acrescente o alvo em `targets`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { encodeOpaquePNG } from './png.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spritePath = join(root, 'public', 'idle', 'user', '0.png');
const outDir = join(root, 'public', 'icons');
const extDir = join(root, 'extension');
const iosAssets = join(root, 'ios', 'App', 'App', 'Assets.xcassets');
const iosIconDir = join(iosAssets, 'AppIcon.appiconset');
const iosSplashDir = join(iosAssets, 'Splash.imageset');

const css = readFileSync(join(root, 'src', 'styles', 'app.css'), 'utf8');
const BG = /--bg:\s*(#[0-9a-fA-F]{3,8})/.exec(css)?.[1] ?? '#0e0e0f';
const ACCENT = /--accent:\s*(#[0-9a-fA-F]{3,8})/.exec(css)?.[1] ?? '#a3e635';
// A tela de abertura do iPhone é a primeira coisa que aparece, antes do app: usa o fundo
// do tema padrão (Café de casa), que é o que vem logo depois dela.
const cafe = readFileSync(join(root, 'src', 'styles', 'themes', 'cafe.css'), 'utf8');
const SPLASH_BG = /--bg:\s*(#[0-9a-fA-F]{3,8})/.exec(cafe)?.[1] ?? '#f6efe3';
const sprite = `data:image/png;base64,${readFileSync(spritePath).toString('base64')}`;

/**
 * Um PNG: pasta de saída, tamanho, fração da área que o personagem ocupa, e se o
 * fundo vai até a borda (maskable). Opcionais: `bg` (outro fundo), `floor: false`
 * (sem o chão) e `opaque` (PNG sem canal alfa — a App Store recusa ícone com alfa).
 */
const targets = [
  { dir: outDir, file: 'icon-192.png', size: 192, fill: 0.78, maskable: false },
  { dir: outDir, file: 'icon-512.png', size: 512, fill: 0.78, maskable: false },
  { dir: outDir, file: 'icon-512-maskable.png', size: 512, fill: 0.6, maskable: true },
  { dir: outDir, file: 'apple-touch-icon.png', size: 180, fill: 0.7, maskable: true },
  // O único tamanho que o manifest da extensão declara (icons e action.default_icon).
  // Não é maskable: ninguém recorta o ícone da barra do navegador.
  { dir: extDir, file: 'icon-192.png', size: 192, fill: 0.78, maskable: false },
  // O app de iPhone (Capacitor). O ícone é um só, 1024, quadrado até a borda (o iOS
  // recorta os cantos) e sem alfa. A tela de abertura é o personagem pequeno no meio do
  // creme; o Xcode pede três escalas e o Capacitor usa a mesma imagem nas três.
  { dir: iosIconDir, file: 'AppIcon-512@2x.png', size: 1024, fill: 0.7, maskable: true, opaque: true },
  ...['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((file) => ({
    dir: iosSplashDir, file, size: 2732, fill: 0.18, maskable: true, opaque: true, bg: SPLASH_BG, floor: false,
  })),
];

const page_html = `<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c"></canvas></body></html>`;

async function main() {
  for (const dir of new Set(targets.map((t) => t.dir))) mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(page_html);
  for (const t of targets) {
    const dataUrl = await page.evaluate(
      async ({ size, fill, maskable, bg, accent, sprite, floor, opaque }) => {
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
        if (floor) {
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.18;
          ctx.fillRect(x - scale, y + h - scale, w + scale * 2, scale);
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(img, x, y, w, h);
        // Sem alfa não dá pra pedir ao canvas (o PNG dele é sempre RGBA): reduz pra PNG
        // só pra atravessar a ponte leve, e quem tira o alfa é o Node, ao regravar.
        return c.toDataURL('image/png');
      },
      {
        size: t.size, fill: t.fill, maskable: t.maskable, bg: t.bg ?? BG, accent: ACCENT, sprite,
        floor: t.floor !== false, opaque: t.opaque === true,
      },
    );
    const out = join(t.dir, t.file);
    let png = Buffer.from(dataUrl.split(',')[1], 'base64');
    if (t.opaque) png = await withoutAlpha(page, dataUrl, t.size);
    writeFileSync(out, png);
    console.log(`ok ${relative(root, out)} (${t.size}px)`);
  }
  await browser.close();
}

/** O mesmo desenho regravado como PNG RGB: os pixels voltam crus da página e o Node codifica. */
async function withoutAlpha(page, dataUrl, size) {
  const b64 = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let bin = '';
    const STEP = 0x8000;
    for (let i = 0; i < data.length; i += STEP) bin += String.fromCharCode(...data.subarray(i, i + STEP));
    return btoa(bin);
  }, dataUrl);
  return encodeOpaquePNG(size, size, Buffer.from(b64, 'base64'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
