import { defineConfig } from '@playwright/test';

// A extensão do navegador (`extension/`) num navegador de VERDADE: regras do
// declarativeNetRequest aplicadas, site caindo na tela do pet, badge acesa.
// É o que o smoke não consegue mostrar — lá a extensão não existe.
//
// `npm run test:ext`. Suíte separada de propósito: precisa do Chromium COMPLETO
// (o headless shell do smoke não carrega extensão), abre um contexto persistente
// por teste e não roda em paralelo.
//
// BROWSER — leia antes de mudar: o binário vem de `scripts/chromium-exe.mjs`.
// Dentro do app desktop do Claude é obrigatório usar o caminho real do MSIX
// (`Packages\Claude_…\LocalCache\Local\ms-playwright`); pelo caminho virtual o
// Windows não acha o manifesto SideBySide e a abertura morre com `spawn UNKNOWN`.
// NUNCA `channel: 'chrome'`/`'msedge'`: o Cold Turkey Blocker desta máquina fecha
// o Chrome do sistema inteiro, levando as abas reais do usuário junto.

const PORT = Number(process.env.SP_EXT_PORT) || 5183;

export default defineConfig({
  testDir: 'e2e',
  testMatch: /extension\.spec\.ts/,
  // Um contexto persistente por vez: o perfil e a extensão não se dividem bem.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  // A extensão vive no relógio real (alarme, `until`): nada de acelerar aqui.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'Europe/Berlin',
  },
  webServer: {
    command: `npx vite --mode teste --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
