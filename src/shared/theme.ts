// O tema visual do app: o Café de casa (claro, o padrão desde 2026-09-07) e o escuro original.
//
// Cada arquivo de tema só vale sob `:root[data-theme="<slug>"]`, então trocar de tema é
// trocar um atributo no `<html>` — nenhum CSS é carregado ou descarregado, nada de geometria
// muda. O escuro é a ausência do atributo (é o que `src/styles/app.css` pinta por padrão).
//
// Isolado de propósito: sem React, sem store, sem persistência na nuvem. O tema é uma
// preferência DESTE dispositivo (localStorage), como a sessão hardcore — e a querystring
// `?tema=<slug>` existe pra abrir num tema específico sem entrar em Configurações.

export type ThemeId = 'cafe' | 'escuro';

export type ThemeInfo = {
  id: ThemeId;
  nome: string;
  descricao: string;
};

/** O catálogo, na ordem em que aparece no seletor. `cafe` é o padrão e vem primeiro. */
export const TEMAS: ThemeInfo[] = [
  { id: 'cafe', nome: 'Café de casa', descricao: 'Claro: papel creme, tinta marrom, verde sálvia.' },
  { id: 'escuro', nome: 'Escuro', descricao: 'O escuro de sempre, com o verde-limão.' },
];

const STORAGE_KEY = 'sp-theme';
const QUERY_KEY = 'tema';
const DEFAULT_THEME: ThemeId = 'cafe';

/** Os temas cujo fundo é claro — vira o `color-scheme` do documento (inputs nativos). */
const LIGHT: ThemeId[] = ['cafe'];

const IDS = TEMAS.map((t) => t.id);

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (IDS as string[]).includes(v);
}

export function themeInfo(id: ThemeId): ThemeInfo {
  return TEMAS.find((t) => t.id === id) ?? TEMAS[0];
}

function readStored(): ThemeId | null {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isThemeId(v) ? v : null;
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
    return isThemeId(v) ? v : null;
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
 * Aplica o tema: põe (ou tira, no caso do escuro) o `data-theme` no `<html>`, grava a
 * escolha e acerta o que vive fora do CSS — o `color-scheme` do documento e a
 * `<meta name="theme-color">` (a barra do navegador no celular / PWA), que passa a valer
 * o `--bg` computado depois da troca.
 */
export function applyTheme(id: ThemeId): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;

  if (id === 'escuro') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);

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
