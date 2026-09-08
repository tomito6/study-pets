// Bloqueio de sites: a lista que o usuário escreve vira domínios, e domínio vira
// "o site inteiro". Puro — quem publica pra extensão é `application/siteBlock.ts`.
//
// Duas ideias:
//
// 1. **Um domínio cobre tudo.** "chess.com" cobre `chess.com`, todo subdomínio
//    (`www.`, `live.`, `api.`) e qualquer caminho ou porta. É o que o
//    `requestDomains` do declarativeNetRequest faz — aqui só normalizamos a
//    entrada pra isso ser verdade (o usuário cola a URL inteira, a gente guarda
//    o domínio).
// 2. **Apelidos.** Bloquear o YouTube e continuar com `youtu.be` aberto é o tipo
//    de furo que faz o usuário dizer "não funciona". A tabela `SITE_ALIASES` é
//    pequena e explícita de propósito: é a lista *expandida* que vai pra
//    extensão, que continua burra.
//
// A linha que não vira domínio ("chess", "lol") NÃO some em silêncio: `parseSites`
// devolve os inválidos pra UI mostrar "não entendi: chess".

import type { SiteBlockConfig, SiteBlockMode } from './types';

export const defaultSiteBlock = (): SiteBlockConfig => ({ enabled: false, mode: 'blacklist', sites: [] });

// ---------------------------------------------------------------- normalização

/**
 * "https://www.YouTube.com/watch?v=x" → "youtube.com". Só o domínio: sem esquema,
 * sem `www.`, sem caminho/porta. `null` se não parece um domínio.
 */
export function normalizeSite(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split(/[/?#:]/)[0] ?? '';
  s = s.replace(/^\.+|\.+$/g, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

/** O que o usuário escreveu, separado em pedaços (uma por linha, vírgula ou espaço). */
const tokens = (input: string | readonly string[]): string[] =>
  (typeof input === 'string' ? input.split(/[\n,\s]+/) : Array.from(input))
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);

/** A lista como o usuário digita → domínios únicos, na ordem. Descarta o que não entende. */
export function normalizeSites(input: string | readonly string[]): string[] {
  return parseSites(input).sites;
}

export interface SitesParse {
  /** Domínios únicos, na ordem em que apareceram. */
  sites: string[];
  /** Pedaços que não viraram domínio, como o usuário escreveu (únicos). A UI mostra "não entendi: …". */
  invalid: string[];
}

/** Igual a `normalizeSites`, mas guarda o que não entendeu — o usuário merece saber. */
export function parseSites(input: string | readonly string[]): SitesParse {
  const sites: string[] = [];
  const invalid: string[] = [];
  for (const raw of tokens(input)) {
    const site = normalizeSite(raw);
    if (site) {
      if (!sites.includes(site)) sites.push(site);
    } else if (!invalid.includes(raw)) {
      invalid.push(raw);
    }
  }
  return { sites, invalid };
}

// ---------------------------------------------------------------- apelidos

/**
 * Os encurtadores e domínios irmãos que o usuário nunca lembra de escrever.
 * Tabela pequena e explícita: nada de adivinhar. Bidirecional onde faz sentido
 * (quem bloqueia `x.com` quer o `twitter.com` fora também).
 */
export const SITE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'youtube.com': ['youtu.be'],
  'twitter.com': ['x.com', 't.co'],
  'x.com': ['twitter.com', 't.co'],
  'facebook.com': ['fb.com', 'fb.watch'],
  'instagram.com': ['instagr.am'],
  'reddit.com': ['redd.it'],
};

/** Os apelidos de um domínio, ou lista vazia. */
export const aliasesOf = (site: string): string[] => [...(SITE_ALIASES[site] ?? [])];

/**
 * A lista que de fato vai pra extensão: cada domínio mais os apelidos dele, sem
 * repetir. Vale nos dois modos — quem permite só o YouTube também quer o `youtu.be`.
 */
export function expandSites(sites: readonly string[]): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  for (const site of sites) {
    push(site);
    for (const alias of aliasesOf(site)) push(alias);
  }
  return out;
}

// ---------------------------------------------------------------- config

const isMode = (v: unknown): v is SiteBlockMode => v === 'blacklist' || v === 'whitelist';

/** `config.siteBlock` em qualquer formato (ausente, parcial, lixo) → config válida. */
export function normalizeSiteBlockConfig(raw: unknown): SiteBlockConfig {
  const d = defaultSiteBlock();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const r = raw as { enabled?: unknown; mode?: unknown; sites?: unknown };
  return {
    enabled: r.enabled === true,
    mode: isMode(r.mode) ? r.mode : d.mode,
    sites: Array.isArray(r.sites) ? normalizeSites(r.sites as string[]) : [],
  };
}

/**
 * A migração do doc antigo (schemaVersion ≤ 3), onde a lista de sites morava
 * dentro do modo hardcore. Doc com `siteBlock` vence; senão, um `hardcore` com
 * lista não vazia vira o bloqueio (ligado se o hardcore estava ligado); um doc
 * sem nada nasce desligado.
 */
export function migrateSiteBlock(rawSiteBlock: unknown, rawHardcore: unknown): SiteBlockConfig {
  if (rawSiteBlock && typeof rawSiteBlock === 'object' && !Array.isArray(rawSiteBlock)) {
    return normalizeSiteBlockConfig(rawSiteBlock);
  }
  const legacy = normalizeSiteBlockConfig(rawHardcore);
  return legacy.sites.length > 0 ? legacy : defaultSiteBlock();
}

/** Tem o que bloquear? Lista negra sem site nenhum não bloqueia nada; lista branca sempre bloqueia o resto. */
export function siteBlockArmable(cfg: SiteBlockConfig): boolean {
  if (!cfg.enabled) return false;
  return cfg.mode === 'whitelist' || cfg.sites.length > 0;
}
