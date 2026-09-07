// A aparência no navegador: o atributo `data-theme` do <html>, a cor da barra do sistema
// (a meta `theme-color`, que o PWA usa) e uma cópia em localStorage que o index.html lê
// antes do primeiro paint — sem ela o app piscaria no escuro até o documento chegar.
// O documento do usuário continua sendo a fonte da verdade: quem chama isto é o caso de
// uso, com o tema que o estado diz. Fora do browser (testes) tudo aqui é no-op.

/** As mesmas chaves que o script inline do index.html lê. Mudar aqui = mudar lá. */
export const THEME_STORAGE_KEY = 'study-pets:theme';
export const THEME_COLOR_STORAGE_KEY = 'study-pets:theme-color';

export function readStoredTheme(): string | null {
  try {
    return globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function applyThemeToDocument(id: string): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.setAttribute('data-theme', id);
  // A cor da barra do sistema é o `--bg` do tema, lido do CSS já aplicado — a paleta não é duplicada aqui.
  const bg = getComputedStyle(html).getPropertyValue('--bg').trim();
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && bg) meta.content = bg;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
    if (bg) localStorage.setItem(THEME_COLOR_STORAGE_KEY, bg);
  } catch {
    // sem storage (modo privado, cota): o boot só perde o atalho; o doc aplica o tema em seguida
  }
}
