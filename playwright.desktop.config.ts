import { defineConfig } from '@playwright/test';

// O app de computador (`desktop/`, Electron) aberto DE VERDADE: a janela, o esquema
// `app://`, os links que saem pro navegador, a pergunta ao fechar no hardcore.
// É o que o smoke não consegue mostrar — lá o app roda numa aba.
//
// `npm run test:desktop`. Suíte separada, como a da extensão: abre um app por teste e
// não roda em paralelo. Antes de tudo, `e2e/desktop.setup.ts` gera um build do app em
// MODO TESTE (memória, sem Firebase) em `desktop/.web-teste/` — nada aqui toca dado real.
//
// BROWSER: nenhum. O executável é o `electron.exe` de `desktop/node_modules` (instale
// com `npm run desktop:install`), não o Chrome nem o Edge do sistema — o Cold Turkey
// desta máquina procura por esses dois nomes.

export default defineConfig({
  testDir: 'e2e',
  testMatch: /desktop\.spec\.ts/,
  globalSetup: './e2e/desktop.setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
