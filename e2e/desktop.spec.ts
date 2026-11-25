// O app de computador aberto DE VERDADE (Electron): a janela, o esquema `app://`, os
// links que saem pro navegador do sistema e a pergunta ao fechar no modo hardcore.
// É o que o smoke não consegue mostrar — lá o app roda numa aba do Chromium.
//
// `npm run test:desktop` (depois de `npm run desktop:install`, uma vez).
//
// COMO ISTO FUNCIONA, e o que não mudar:
// - O app abre um build em MODO TESTE (`desktop/.web-teste`, gerado por
//   `desktop.setup.ts`): sem Firebase, conta nova a cada abertura. Quem aponta a casca
//   pra essa pasta é `SP_DESKTOP_WEB_DIR`, que só vale fora do app instalado.
// - Cada teste abre o app com uma pasta de dados própria e descartável: nada encosta
//   no login do app de verdade, e a trava de "uma janela só" não briga com um app aberto.
// - O que sairia do app (abrir o navegador, a caixa de diálogo do sistema) é trocado por
//   um espião DENTRO do processo principal: o teste confere o que a casca PEDIU, sem
//   abrir navegador nenhum nesta máquina.

import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { WEB_TESTE } from './desktop.setup';

const DESKTOP_DIR = fileURLToPath(new URL('../desktop', import.meta.url));
// O pacote `electron` exporta o caminho do executável que ele baixou.
const ELECTRON_EXE = createRequire(join(DESKTOP_DIR, 'package.json'))('electron') as string;

// O que os espiões guardam no processo principal.
declare const globalThis: { __abertos?: string[]; __resposta?: number; __perguntas?: number };

let app: ElectronApplication;
let page: Page;
let dados: string;

test.beforeEach(async () => {
  dados = mkdtempSync(join(tmpdir(), 'sp-desktop-'));
  app = await electron.launch({
    executablePath: ELECTRON_EXE,
    args: [
      // Como root (contêiner de CI) o Chromium só abre sem o sandbox dele.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      `--user-data-dir=${dados}`,
      DESKTOP_DIR,
    ],
    env: { ...process.env, SP_DESKTOP_WEB_DIR: WEB_TESTE },
  });
  page = await app.firstWindow();
  await page.waitForLoadState('load');
});

test.afterEach(async () => {
  // Um teste pode ter fechado a janela (e o app com ela) de propósito.
  await app.close().catch(() => {});
  rmSync(dados, { recursive: true, force: true });
});

async function passarOnboarding(): Promise<void> {
  await expect(page.locator('#onboarding-panel')).toBeVisible();
  await page.locator('#onb-avatar-next').click();
  await page.locator('#starter-grid .starter-card[data-species="cat"]').click();
  await page.locator('#onb-next').click();
  await page.locator('#onb-age').check();
  await page.locator('#onb-begin').click();
  await expect(page.locator('#onboarding-panel')).toBeHidden();
  // A corrida de setup: seis cartões e volta pro Plano (ver "O tutorial das Configurações").
  for (let i = 0; i < 6; i++) await page.locator('#settings-tour-next').click();
  await expect(page.locator('#settings-tour')).toHaveCount(0);
}

test('1. o app abre na janela própria, pelo esquema app://, sem Node na página', async () => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));

  expect(page.url()).toBe('app://study-pets/');
  await expect(page).toHaveTitle('Study Pets');

  const pagina = await page.evaluate(() => ({
    casca: (window as unknown as { studyPetsDesktop?: { shell?: string } }).studyPetsDesktop?.shell,
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    seguro: window.isSecureContext,
    indexedDB: typeof indexedDB,
    notificacao: Notification.permission,
  }));
  expect(pagina).toEqual({
    casca: 'desktop',
    require: 'undefined',
    process: 'undefined',
    seguro: true, // sem contexto seguro não há IndexedDB — nem login, nem cache offline
    indexedDB: 'object',
    notificacao: 'granted',
  });

  await passarOnboarding();
  // 1280px de janela: é o layout de tela grande, com a barra do topo e a coluna.
  await expect(page.locator('#gear-btn')).toBeVisible();
  await expect(page.locator('#plan-col')).toBeVisible();
  await expect(page.locator('.block-row').first()).toBeVisible();

  // O motivo de a casca existir: o relógio não é estrangulado com a janela escondida.
  const estrangula = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getBackgroundThrottling(),
  );
  expect(estrangula).toBe(false);
  expect(erros).toEqual([]);
});

test('2. sprite, fonte e asset saem do build; nada fora da pasta do app é servido', async () => {
  const status = (caminho: string) =>
    page.evaluate(async (c) => (await fetch(c)).status, caminho);

  expect(await status('/idle/pets/dog/0.png')).toBe(200);
  expect(await status('/manifest.webmanifest')).toBe(200);
  expect(await status('/nao-existe.png')).toBe(404);
  // `..` codificado é o que o navegador NÃO normaliza antes de pedir.
  expect(await status('/%2e%2e/%2e%2e/package.json')).toBe(404);
  expect(await status('/%2e%2e%5c%2e%2e%5cpackage.json')).toBe(404);
  expect(await status('/assets/%2e%2e/%2e%2e/main.cjs')).toBe(404);
});

test('3. link pra fora abre no navegador do sistema, e a janela continua no app', async () => {
  await app.evaluate(({ shell }) => {
    globalThis.__abertos = [];
    shell.openExternal = async (url: string) => {
      globalThis.__abertos!.push(url);
    };
  });
  await passarOnboarding();

  await page.locator('#gear-btn').click();
  await page.locator('#legal-privacidade').scrollIntoViewIfNeeded();
  await page.locator('#legal-privacidade').click();

  await expect
    .poll(() => app.evaluate(() => globalThis.__abertos))
    .toEqual(['https://plano-estudos-one.vercel.app/legal/privacidade.html']);
  expect(app.windows()).toHaveLength(1);
  expect(page.url()).toBe('app://study-pets/');

  // Uma navegação da própria janela pra fora também não acontece.
  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });
  await expect
    .poll(() => app.evaluate(() => globalThis.__abertos!.length))
    .toBe(2);
  // (Perguntado ao processo principal: o Playwright fica esperando a navegação que a
  // casca cancelou, e um locator na página penduraria junto.)
  const onde = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getURL(),
  );
  expect(onde).toBe('app://study-pets/');
});

test('4. na tela de login o botão do Google dá lugar ao aviso, como no iPhone', async () => {
  await passarOnboarding();
  await page.locator('#avatar-btn').click();
  await page.locator('#avatar-sair').click();

  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page.locator('#login-google-soon')).toBeVisible();
  await expect(page.locator('.ls-google-btn')).toHaveCount(0);
});

test('5. fechar com um estudo hardcore armado pergunta antes — e respeita a resposta', async () => {
  await app.evaluate(({ dialog }) => {
    globalThis.__perguntas = 0;
    globalThis.__resposta = 0; // "Continuar estudando"
    dialog.showMessageBoxSync = (() => {
      globalThis.__perguntas!++;
      return globalThis.__resposta!;
    }) as typeof dialog.showMessageBoxSync;
  });

  // No Electron o `beforeunload` não abre diálogo do navegador (quem pergunta é a casca,
  // pelo `will-prevent-unload`). Sem este ouvinte o Playwright tentaria dispensar um
  // diálogo que não existe.
  page.on('dialog', () => {});

  // O mesmo `beforeunload` que `infrastructure/unloadGuard.ts` arma. O navegador só o
  // respeita depois de um gesto da pessoa na página — por isso o clique antes.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.evaluate(() => {
    window.addEventListener('beforeunload', (e) => {
      e.preventDefault();
      e.returnValue = '';
    });
  });

  const fechar = () =>
    app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.close();
    });

  await fechar();
  await expect.poll(() => app.evaluate(() => globalThis.__perguntas)).toBe(1);
  expect(app.windows()).toHaveLength(1); // ficou

  const fechou = app.waitForEvent('close');
  await app.evaluate(() => {
    globalThis.__resposta = 1; // "Sair mesmo assim"
  });
  await fechar().catch(() => {}); // o app pode sair antes de responder
  await fechou;
});
