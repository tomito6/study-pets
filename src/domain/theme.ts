// Aparência: o catálogo dos temas e a leitura tolerante do que vem do documento.
// Nenhuma cor aqui — a paleta de cada tema mora no CSS (`:root[data-theme="…"]` em
// src/styles/app.css); o domínio só conhece os ids e o padrão.

export const THEME_IDS = ['dark', 'lamp', 'paper', 'oat'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** O tema de sempre — é o `:root` sem atributo. */
export const DEFAULT_THEME: ThemeId = 'dark';

export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);

/** O que veio do doc (ou de qualquer lugar) → um id válido. Ausente ou desconhecido = escuro. */
export const normalizeTheme = (v: unknown): ThemeId => (isThemeId(v) ? v : DEFAULT_THEME);
