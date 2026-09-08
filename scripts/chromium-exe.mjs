// Onde está o Chromium COMPLETO do Playwright (o único que carrega extensão).
//
// Dentro do app desktop do Claude (pacote MSIX), `%LOCALAPPDATA%\ms-playwright` é
// um redirecionamento virtual: o carregador do Windows não enxerga o manifesto
// SideBySide ao lado do `chrome.exe` e a abertura falha com `spawn UNKNOWN`
// ("side-by-side configuration is incorrect"). Pelo **caminho real**, em
// `AppData\Local\Packages\Claude_…\LocalCache\Local\ms-playwright`, ele abre —
// headless, com a extensão carregada. Fora do app Claude o caminho normal
// funciona e esta função devolve `null` (o Playwright acha o binário sozinho).
//
// Ordem: `SP_CHROMIUM_EXE` no ambiente vence; senão o caminho real do MSIX, se
// existir; senão o padrão do Playwright.
//
// NUNCA usar o Chrome/Edge do sistema (`channel: 'chrome'`) nesta máquina: o
// Cold Turkey Blocker fecha o executável inteiro, levando as abas reais junto.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MSIX_ROOT = join(
  process.env.LOCALAPPDATA ?? '',
  'Packages',
  'Claude_pzs8sxrjxfjjc',
  'LocalCache',
  'Local',
  'ms-playwright',
);

/** O `chrome.exe` do bundle, ou `null` pra deixar o Playwright decidir. */
export function chromiumExecutable() {
  const fromEnv = process.env.SP_CHROMIUM_EXE;
  if (fromEnv) return fromEnv;
  if (process.platform !== 'win32' || !existsSync(MSIX_ROOT)) return null;
  let dirs = [];
  try {
    // `chromium-1234` muda a cada versão do Playwright: pega a maior.
    dirs = readdirSync(MSIX_ROOT).filter((d) => /^chromium-\d+$/.test(d));
  } catch {
    return null;
  }
  dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const dir of dirs) {
    const exe = join(MSIX_ROOT, dir, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}
