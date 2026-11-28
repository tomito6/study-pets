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
// PW_PORT idem: pra rodar a suíte com um dev server já ocupando a 5174 (ex.: dois checkouts).

// FUSO — o relógio dos testes é o de Berlim, nos dois lados.
// O spec monta a hora no Node (`new Date('2026-09-02T10:10:00')`, sem fuso = o fuso
// da MÁQUINA) e o navegador roda em `timezoneId: 'Europe/Berlin'`. Numa máquina em
// outro fuso os dois discordam: em São Paulo o app vê 15:10, em UTC vê 12:10, o
// "bloco de agora" já passou e 35 testes caem por nada. Fixar aqui vale pra este
// processo e pros workers (que carregam este arquivo antes do spec), em qualquer
// terminal — no Git Bash do Windows um `TZ=…` na linha de comando nem chega no Node.
// Os dois nomes andam juntos: mudou um, mude o outro.
const TIMEZONE = 'Europe/Berlin';
process.env.TZ = TIMEZONE;

const PORT = Number(process.env.PW_PORT) || 5174;
const channel = process.env.PW_CHANNEL; // undefined = Chromium do Playwright

export default defineConfig({
  testDir: 'e2e',
  // `extension.spec.ts` é outra suíte: precisa do Chromium completo com a extensão
  // carregada (`npm run test:ext`, playwright.extension.config.ts). Aqui ela não roda.
  // `desktop.spec.ts` idem: abre o app de computador (`npm run test:desktop`).
  testIgnore: /(extension|desktop)\.spec\.ts/,
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
    timezoneId: TIMEZONE,
  },
  webServer: {
    // O mesmo que `npm run dev:teste`, com a porta parametrizada.
    command: `npx vite --mode teste --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
