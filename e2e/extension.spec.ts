// A extensão do navegador num navegador de VERDADE: as regras do
// declarativeNetRequest aplicadas, o site caindo na tela do pet, a badge acesa.
// É o que nenhum outro teste consegue mostrar — no smoke a extensão não existe.
//
// `npm run test:ext`. Cada teste abre um contexto persistente próprio (perfil
// limpo, conta nova no modo teste) com a extensão carregada.
//
// COMO ISTO É POSSÍVEL, e o que não mudar:
// - Extensão só carrega no Chromium COMPLETO, em contexto persistente. O binário
//   vem de `scripts/chromium-exe.mjs`; dentro do app desktop do Claude é
//   obrigatório o caminho real do MSIX (o virtual morre com `spawn UNKNOWN`).
//   NUNCA o Chrome/Edge do sistema: o Cold Turkey desta máquina fecha o
//   navegador do usuário junto.
// - O "site de distração" é um servidor HTTP local que responde a qualquer Host,
//   e o Chromium recebe `--host-resolver-rules` mandando `chess.test` e
//   `livre.test` pra ele. São domínios `.test`, em http, sem HSTS: o que se
//   testa é a REGRA DE DOMÍNIO, não o DNS.
// - **Sem `page.clock` aqui.** A extensão vive no relógio real (alarme, `until`):
//   um `until` no passado limparia as regras na hora. Por isso os testes que
//   precisam de um estudo rodando abrem uma janela do dia em volta do "agora".

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { chromiumExecutable } from '../scripts/chromium-exe.mjs';

// A extensão roda no mundo dela: dentro de `sw.evaluate` o `chrome.*` é o do
// navegador, não deste processo. Só o mínimo que os testes leem daqui.
declare const chrome: {
  declarativeNetRequest: { getDynamicRules(): Promise<unknown[]> };
  action: { getBadgeText(details: Record<string, never>): Promise<string> };
};

const EXT_DIR = fileURLToPath(new URL('../extension', import.meta.url));
const SITE_PORT = Number(process.env.SP_SITE_PORT) || 8099;
const CHESS = `http://www.chess.test:${SITE_PORT}/play/online`;
const LIVRE = `http://livre.test:${SITE_PORT}/`;

// ---------------------------------------------------------------- o site de distração

let server: Server;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${req.headers.host}</title></head><body><h1 id="site">${req.headers.host}</h1></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(SITE_PORT, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------- o navegador

interface Ext {
  ctx: BrowserContext;
  sw: Worker;
  profile: string;
}

async function abrirNavegador(): Promise<Ext> {
  const profile = mkdtempSync(join(tmpdir(), 'sp-ext-'));
  const executablePath = chromiumExecutable() ?? undefined;
  const ctx = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'Europe/Berlin',
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      `--host-resolver-rules=MAP chess.test 127.0.0.1, MAP *.chess.test 127.0.0.1, MAP livre.test 127.0.0.1, MAP *.livre.test 127.0.0.1`,
    ],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 30_000 }));
  return { ctx, sw, profile };
}

async function fechar(ext: Ext | null): Promise<void> {
  if (!ext) return;
  await ext.ctx.close().catch(() => {});
  rmSync(ext.profile, { recursive: true, force: true });
}

const regras = (sw: Worker) => sw.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
const badge = (sw: Worker) => sw.evaluate(() => chrome.action.getBadgeText({}));
const contarRegras = async (sw: Worker) => (await regras(sw)).length;

// ---------------------------------------------------------------- o app

/** Passa pelo onboarding (personagem padrão, gato, janelas padrão) e fecha o tour. */
async function abrirApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  // O primeiro passo é o personagem desde 2026-09-10 (`d261721`). O helper do smoke foi
  // atualizado junto; este ficou pra trás e travava os cinco testes no card do pet — e como
  // esta suíte só roda entre 00:05 e 13:00, passou dias quebrada sem ninguém ver.
  await page.locator('#onb-avatar-next').click();
  await page.locator('#starter-grid .starter-card[data-species="cat"]').click();
  await page.locator('#onb-next').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('#onboarding-panel')).toBeHidden();
  await page.locator('#tour-skip').click({ timeout: 3000 }).catch(() => {});
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Uma janela de estudo em volta do AGORA, só pra hoje, pra existir um bloco
 * rodando neste instante — o relógio é o de verdade, então de madrugada a
 * rotina padrão (09:00–18:00) não serve.
 */
async function janelaAgora(page: Page): Promise<void> {
  const now = new Date();
  const inicio = new Date(now.getTime() - 2 * 60_000);
  const fimMin = Math.min(23 * 60 + 55, inicio.getHours() * 60 + inicio.getMinutes() + 180);
  const fim = `${pad(Math.floor(fimMin / 60))}:${pad(fimMin % 60)}`;
  await page.locator('#day-windows-btn').click();
  await expect(page.locator('#day-windows-panel')).toBeVisible();
  const linha = page.locator('#day-windows-panel .sw-row').first();
  await linha.locator('.swc-start').fill(hhmm(inicio));
  await linha.locator('.swc-end').fill(fim);
  await page.locator('#day-windows-save').click();
  await expect(page.locator('#day-windows-panel')).toBeHidden();
}

/** Só dá pra montar uma janela em volta do agora se sobra dia suficiente. */
function janelaCabe(): boolean {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  return m >= 5 && m + 30 <= 23 * 60 + 55;
}

interface BloqueioOpts {
  mode?: 'blacklist' | 'whitelist';
  sites: string;
  hardcore?: boolean;
}

/** Configurações → Geral: liga o bloqueio (e o hardcore, se pedido) e salva. */
async function ligarBloqueio(page: Page, opts: BloqueioOpts): Promise<void> {
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
  await page.locator('.st-switch', { has: page.locator('#cfg-siteblock') }).click();
  await expect(page.locator('#siteblock-fields')).toBeVisible();
  if (opts.mode === 'whitelist') await page.locator('#cfg-siteblock-mode .sb-mode-chip[data-mode="whitelist"]').click();
  await page.locator('#cfg-siteblock-sites').fill(opts.sites);
  if (opts.hardcore) {
    await page.locator('.st-switch', { has: page.locator('#cfg-hardcore') }).click();
    await expect(page.locator('#cfg-hardcore')).toBeChecked();
  }
  await page.locator('#settings-panel').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#settings-panel')).toBeHidden();
}

/** Abre uma aba nova e devolve onde ela parou. */
async function abrir(ctx: BrowserContext, url: string): Promise<{ page: Page; url: string }> {
  const page = await ctx.newPage();
  await page.goto(url).catch(() => {}); // um redirect pra chrome-extension:// pode "falhar" no goto
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  return { page, url: page.url() };
}

// ---------------------------------------------------------------- os testes

let ext: Ext | null = null;

test.afterEach(async () => {
  await fechar(ext);
  ext = null;
});

test('ext-1. a extensão se anuncia, e "Testar por 1 min" bloqueia o site de verdade', async () => {
  ext = await abrirNavegador();
  const { ctx, sw } = ext;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await abrirApp(page);

  // Antes de tudo: o site abre normalmente.
  const antes = await abrir(ctx, CHESS);
  expect(antes.url).toBe(CHESS);
  await expect(antes.page.locator('#site')).toHaveText(`www.chess.test:${SITE_PORT}`);
  await antes.page.close();

  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
  await page.locator('.st-switch', { has: page.locator('#cfg-siteblock') }).click();
  await page.locator('#cfg-siteblock-sites').fill(`chess.test\nhttps://www.chess.test/x`);
  // A URL colada e o domínio viram um chip só — e a extensão foi encontrada.
  await expect(page.locator('#siteblock-preview .sb-chip')).toHaveCount(1);
  await expect(page.locator('#siteblock-preview .sb-chip').first()).toHaveText('chess.test');
  await expect(page.locator('#siteblock-ext-status')).toContainText('Extensão encontrada');

  await page.locator('#siteblock-test').click();
  await expect(page.locator('#siteblock-test')).toHaveText('■ Parar teste');
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#siteblock-ext-status')).toContainText('Teste rodando');
  expect(await badge(sw)).toBe('ON');

  // Subdomínio + caminho caem na tela do pet; um site fora da lista abre normal.
  const bloqueado = await abrir(ctx, CHESS);
  expect(bloqueado.url).toContain('/blocked.html');
  await expect(bloqueado.page.locator('#title')).toHaveText('É assim que fica');
  await expect(bloqueado.page.locator('#hint')).toContainText('Teste do Study Pets');
  await bloqueado.page.close();

  const livre = await abrir(ctx, LIVRE);
  expect(livre.url).toBe(LIVRE);
  await livre.page.close();

  // "Parar teste" libera na hora.
  await page.locator('#siteblock-test').click();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(0);
  expect(await badge(sw)).toBe('');
  const depois = await abrir(ctx, CHESS);
  expect(depois.url).toBe(CHESS);
});

test('ext-2. estudo sem hardcore bloqueia, redireciona a aba já aberta, e "✕ Parar" libera', async () => {
  test.skip(!janelaCabe(), 'não dá pra montar uma janela de estudo em volta do agora nesta hora');
  ext = await abrirNavegador();
  const { ctx, sw } = ext;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await abrirApp(page);
  await ligarBloqueio(page, { sites: 'chess.test' });
  await janelaAgora(page);

  // Uma aba já aberta no site — ela é redirecionada quando o bloqueio arma.
  const aberta = await abrir(ctx, CHESS);
  expect(aberta.url).toBe(CHESS);

  // Tocar no primeiro bloco (o estudo que está rodando) abre o foco — sem hardcore, direto.
  await page.locator('.block-row').first().locator('.block-name').click();
  await expect(page.locator('#focus-overlay')).toBeVisible();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#focus-site-block')).toContainText('1 site bloqueado');

  await expect.poll(() => aberta.page.url(), { timeout: 10_000 }).toContain('/blocked.html');
  await expect(aberta.page.locator('#hint')).toContainText('pare o estudo lá no app');
  await aberta.page.close();

  // "Sair do foco" só fecha o overlay: o estudo continua, o bloqueio também.
  await page.locator('.focus-exit').click();
  await expect(page.locator('#timer-bar')).toHaveClass(/active/);
  expect(await contarRegras(sw)).toBe(1);

  await page.locator('#timer-bar .timer-stop').click();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(0);
  const depois = await abrir(ctx, CHESS);
  expect(depois.url).toBe(CHESS);
});

test('ext-3. "permitir só estes": tudo fora da lista vira a tela do pet, a lista e o app abrem', async () => {
  test.skip(!janelaCabe(), 'não dá pra montar uma janela de estudo em volta do agora nesta hora');
  ext = await abrirNavegador();
  const { ctx, sw } = ext;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await abrirApp(page);
  await ligarBloqueio(page, { mode: 'whitelist', sites: 'livre.test' });
  await janelaAgora(page);

  await page.locator('.block-row').first().locator('.block-name').click();
  await expect(page.locator('#focus-overlay')).toBeVisible();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBeGreaterThan(1);

  const fora = await abrir(ctx, CHESS);
  expect(fora.url).toContain('/blocked.html');
  await fora.page.close();

  const dentro = await abrir(ctx, LIVRE);
  expect(dentro.url).toBe(LIVRE);
  await dentro.page.close();

  // O próprio app nunca é bloqueado — senão não haveria como sair.
  const app = await abrir(ctx, `http://localhost:${new URL(page.url()).port}/`);
  expect(app.url).not.toContain('/blocked.html');
});

test('ext-4. hardcore: o consentimento avisa, a tela do pet cobra XP, e "Desistir" libera', async () => {
  test.skip(!janelaCabe(), 'não dá pra montar uma janela de estudo em volta do agora nesta hora');
  ext = await abrirNavegador();
  const { ctx, sw } = ext;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await abrirApp(page);
  await ligarBloqueio(page, { sites: 'chess.test', hardcore: true });
  await janelaAgora(page);

  await page.locator('.block-row').first().locator('.block-name').click();
  await expect(page.locator('#hardcore-start-confirm')).toBeVisible();
  await expect(page.locator('#hardcore-start-sites')).toHaveText('🛡️ chess.test fica bloqueado até o fim.');
  await page.locator('#hardcore-start-btn').click();
  await expect(page.locator('#focus-hardcore')).toBeVisible();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(1);

  const bloqueado = await abrir(ctx, CHESS);
  expect(bloqueado.url).toContain('/blocked.html');
  await expect(bloqueado.page.locator('#hint')).toContainText('custa XP');
  await bloqueado.page.close();

  await page.locator('#hardcore-quit').click();
  await page.locator('#hardcore-quit-btn').click();
  await expect(page.locator('#focus-overlay')).toBeHidden();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(0);
});

test('ext-5. recarregar a página do app no meio do estudo NÃO libera o site', async () => {
  test.skip(!janelaCabe(), 'não dá pra montar uma janela de estudo em volta do agora nesta hora');
  ext = await abrirNavegador();
  const { ctx, sw } = ext;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await abrirApp(page);
  await ligarBloqueio(page, { sites: 'chess.test' });
  await janelaAgora(page);

  await page.locator('.block-row').first().locator('.block-name').click();
  await expect(page.locator('#focus-overlay')).toBeVisible();
  await expect.poll(() => contarRegras(sw), { timeout: 10_000 }).toBe(1);

  // O timer não sobrevive ao reload (é runtime) — mas o bloqueio precisa sobreviver.
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#focus-overlay')).toBeHidden();
  // Tempo pro content script perguntar e o app responder `unknown`.
  await page.waitForTimeout(3000);
  expect(await contarRegras(sw)).toBe(1);
  expect(await badge(sw)).toBe('ON');

  const ainda = await abrir(ctx, CHESS);
  expect(ainda.url).toContain('/blocked.html');
});
