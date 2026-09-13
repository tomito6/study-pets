// O tema visual do app: o Café de casa (claro, o padrão desde 2026-09-07) e o Loft noturno
// (escuro, desde 2026-09-14 — ele substituiu o escuro herdado da primeira versão, que nunca
// tinha sido desenhado).
//
// Cada arquivo de tema só vale sob `:root[data-theme="<slug>"]`, então trocar de tema é
// trocar um atributo no `<html>` — nenhum CSS é carregado ou descarregado, nada de geometria
// muda. Os DOIS põem o atributo: o `:root` de `src/styles/app.css` deixou de ser "o tema
// escuro" e passou a ser a base que os dois herdam (e o fallback se o atributo faltar).
//
// Isolado de propósito: sem React, sem store, sem persistência na nuvem. O tema é uma
// preferência DESTE dispositivo (localStorage), como a sessão hardcore — e a querystring
// `?tema=<slug>` existe pra abrir num tema específico sem entrar em Configurações.

export type ThemeId = 'cafe' | 'loft';

export type ThemeInfo = {
  id: ThemeId;
  nome: string;
  descricao: string;
};

/** O catálogo, na ordem em que aparece no seletor. `cafe` é o padrão e vem primeiro. */
export const TEMAS: ThemeInfo[] = [
  { id: 'cafe', nome: 'Café de casa', descricao: 'Claro: papel creme, tinta marrom, verde sálvia.' },
  { id: 'loft', nome: 'Loft noturno', descricao: 'Escuro: azul noite, chá verde e âmbar.' },
];

const STORAGE_KEY = 'sp-theme';
const QUERY_KEY = 'tema';
const DEFAULT_THEME: ThemeId = 'cafe';

/** Os temas cujo fundo é claro — vira o `color-scheme` do documento (inputs nativos). */
const LIGHT: ThemeId[] = ['cafe'];

const IDS = TEMAS.map((t) => t.id);

/**
 * Slugs que já foram gravados e não existem mais. `escuro` é o tema herdado que o Loft
 * substituiu: sem isto, quem tinha ele no `localStorage` (ou um link `?tema=escuro`)
 * abriria no CLARO — trocar o tema de alguém pelo oposto, calado, na primeira abertura.
 */
const ALIASES: Record<string, ThemeId> = { escuro: 'loft' };

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (IDS as string[]).includes(v);
}

/** O id que vale pra um valor lido de fora (storage, querystring), traduzindo os antigos. */
function normalize(v: unknown): ThemeId | null {
  if (isThemeId(v)) return v;
  // `Object.hasOwn` e não `ALIASES[v]`: o objeto literal carrega o Object.prototype, então
  // `?tema=toString` (ou `constructor`, `valueOf`, `__proto__`) devolvia uma FUNÇÃO daqui —
  // que seguia como se fosse tema, era gravada no localStorage e apagava a escolha de verdade.
  return typeof v === 'string' && Object.hasOwn(ALIASES, v) ? ALIASES[v]! : null;
}

export function themeInfo(id: ThemeId): ThemeInfo {
  return TEMAS.find((t) => t.id === id) ?? TEMAS[0];
}

function readStored(): ThemeId | null {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return normalize(v);
  } catch {
    return null;
  }
}

function store(id: ThemeId): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    /* modo privado / sem storage: o tema vale só nesta carga da página */
  }
}

function readQuery(): ThemeId | null {
  try {
    const search = globalThis.location?.search;
    if (!search) return null;
    const v = new URLSearchParams(search).get(QUERY_KEY);
    return normalize(v);
  } catch {
    return null;
  }
}

/**
 * O tema que vale agora: `?tema=<slug>` vence (e fica gravado, pra sobreviver ao reload),
 * senão o que estiver no localStorage, senão o Café de casa.
 */
export function readTheme(): ThemeId {
  const fromQuery = readQuery();
  if (fromQuery) {
    store(fromQuery);
    return fromQuery;
  }
  return readStored() ?? DEFAULT_THEME;
}

/**
 * Aplica o tema: põe o `data-theme` no `<html>`, grava a escolha e acerta o que vive fora do CSS — o `color-scheme` do documento e a
 * `<meta name="theme-color">` (a barra do navegador no celular / PWA), que passa a valer
 * o `--bg` computado depois da troca.
 */
export function applyTheme(id: ThemeId): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;

  root.setAttribute('data-theme', id);

  root.style.colorScheme = LIGHT.includes(id) ? 'light' : 'dark';
  store(id);

  // Depois de aplicar: o --bg já é o do tema novo.
  try {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (bg && meta) meta.setAttribute('content', bg);
  } catch {
    /* sem layout (SSR, teste): a meta fica como estava */
  }
}

/** Chamada no boot, antes do React montar, pra não piscar o tema errado. */
export function initTheme(): ThemeId {
  const id = readTheme();
  applyTheme(id);
  return id;
}
