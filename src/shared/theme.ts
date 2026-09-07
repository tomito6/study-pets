// O tema visual do app: o escuro original mais os cinco pacotes de `src/styles/themes/`.
//
// Cada arquivo de tema só vale sob `:root[data-theme="<slug>"]`, então trocar de tema é
// trocar um atributo no `<html>` — nenhum CSS é carregado ou descarregado, nada de geometria
// muda. O escuro original é a ausência do atributo (é o que `src/styles/app.css` já pinta).
//
// Isolado de propósito: sem React, sem store, sem persistência na nuvem. O tema é uma
// preferência DESTE dispositivo (localStorage), como a sessão hardcore — e a querystring
// `?tema=<slug>` existe pra comparar os pacotes lado a lado sem entrar em Configurações.

export type ThemeId = 'escuro' | 'cafe' | 'noturno' | 'papel' | 'salvia' | 'misto';

export type ThemeInfo = {
  id: ThemeId;
  nome: string;
  descricao: string;
};

/** O catálogo, na ordem em que aparece no seletor. `escuro` é o padrão e vem primeiro. */
export const TEMAS: ThemeInfo[] = [
  { id: 'escuro', nome: 'Original', descricao: 'O escuro de sempre, com o verde-limão.' },
  { id: 'cafe', nome: 'Café de casa', descricao: 'Papel creme, tinta marrom, verde sálvia.' },
  { id: 'noturno', nome: 'Café noturno', descricao: 'O mesmo café, à noite: escuro quente.' },
  { id: 'papel', nome: 'Papel', descricao: 'Caderno de estudo: fio e respiro, sem caixa.' },
  { id: 'salvia', nome: 'Sálvia', descricao: 'Claro, com o verde como superfície.' },
  { id: 'misto', nome: 'Misto', descricao: 'O café de casa com o verde-limão do app.' },
];

const STORAGE_KEY = 'sp-theme';
const QUERY_KEY = 'tema';
const DEFAULT_THEME: ThemeId = 'escuro';

/** Os temas cujo fundo é claro — vira o `color-scheme` do documento (inputs nativos). */
const LIGHT: ThemeId[] = ['cafe', 'papel', 'salvia', 'misto'];

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
 * senão o que estiver no localStorage, senão o escuro original.
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

  if (id === DEFAULT_THEME) root.removeAttribute('data-theme');
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
