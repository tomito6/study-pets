import { defineConfig } from '@playwright/test';

// Smoke test dos fluxos principais, rodando contra o MODO TESTE (memória):
// sem Firebase, sem login, cada teste começa como conta nova numa aba limpa.
//
// BROWSER — leia antes de mudar:
// Usa o Chromium do próprio Playwright (`npx playwright install chromium`), em
// headless. NUNCA o Chrome/Edge do sistema nesta máquina: o Cold Turkey Blocker
// exige a extensão dele em todo chrome.exe/msedge.exe e, ao ver um sem extensão,
// fecha o executável inteiro — derrubando as abas reais do usuário e o teste junto
// ("Target page, context or browser has been closed"). Em headless o Playwright
// roda o headless shell (headless_shell.exe), que o Cold Turkey não reconhece.
//
// `npm run test:e2e:ui` e `--headed` usam o Chromium completo (chrome.exe do
// bundle) — o Cold Turkey pode pegar pelo nome. Avisar antes de rodar assim.
//
// PW_CHANNEL existe só como override consciente (ex.: CI com outro browser).

const PORT = 5174;
const channel = process.env.PW_CHANNEL; // undefined = Chromium do Playwright

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Local: sem repetição — flake tem que aparecer. Em CI, uma repetição segura instabilidade de máquina.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(channel ? { channel } : {}),
    viewport: { width: 480, height: 900 }, // o app é mobile-first, max-width 480
    trace: 'retain-on-failure',
    locale: 'pt-BR',
    // startTimer pede permissão de notificação; concedida de antemão pra não ficar prompt pendurado.
    permissions: ['notifications'],
    timezoneId: 'Europe/Berlin',
  },
  webServer: {
    command: 'npm run dev:teste -- --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
