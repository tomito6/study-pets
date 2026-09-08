// Bloqueio de sites, a parte pura: o que o usuário digita vira domínio, o que
// não vira aparece como "não entendi", os apelidos entram na lista que a
// extensão recebe, e o doc antigo (lista dentro do hardcore) migra.

import { describe, expect, it } from 'vitest';
import {
  SITE_ALIASES,
  aliasesOf,
  defaultSiteBlock,
  expandSites,
  migrateSiteBlock,
  normalizeSite,
  normalizeSiteBlockConfig,
  normalizeSites,
  parseSites,
  siteBlockArmable,
} from '../src/domain/siteBlock';

describe('normalizar', () => {
  it('qualquer coisa que o usuário cole vira o domínio', () => {
    expect(normalizeSite('https://www.YouTube.com/watch?v=abc')).toBe('youtube.com');
    expect(normalizeSite('  instagram.com/  ')).toBe('instagram.com');
    expect(normalizeSite('CHESS.COM')).toBe('chess.com');
    expect(normalizeSite('chess.com/play/online')).toBe('chess.com');
    expect(normalizeSite('http://exemplo.com:8080/x')).toBe('exemplo.com');
    expect(normalizeSite('.reddit.com.')).toBe('reddit.com');
    expect(normalizeSite('m.twitter.com')).toBe('m.twitter.com'); // subdomínio explícito é respeitado
  });

  it('o que não é domínio vira null (e não some em silêncio — ver parseSites)', () => {
    expect(normalizeSite('')).toBeNull();
    expect(normalizeSite('chess')).toBeNull();
    expect(normalizeSite('lol')).toBeNull();
    expect(normalizeSite('http://localhost:5173/x')).toBeNull(); // sem ponto não é domínio público
    expect(normalizeSite('não é site')).toBeNull();
  });

  it('a lista digitada vira domínios únicos, na ordem', () => {
    expect(normalizeSites('youtube.com\nhttps://www.youtube.com, twitch.tv\n\n')).toEqual(['youtube.com', 'twitch.tv']);
    expect(normalizeSites(['A.com', 'a.com', 42 as unknown as string])).toEqual(['a.com']);
  });

  it('parseSites guarda o que não entendeu, como o usuário escreveu, sem repetir', () => {
    const r = parseSites('chess.com\nchess\nlol, chess\nhttps://www.youtube.com/watch?v=x');
    expect(r.sites).toEqual(['chess.com', 'youtube.com']);
    expect(r.invalid).toEqual(['chess', 'lol']);
    expect(parseSites('   \n\n').sites).toEqual([]);
    expect(parseSites('   \n\n').invalid).toEqual([]);
  });
});

describe('apelidos', () => {
  it('a tabela é bidirecional onde faz sentido', () => {
    expect(aliasesOf('youtube.com')).toEqual(['youtu.be']);
    expect(aliasesOf('twitter.com')).toContain('x.com');
    expect(aliasesOf('x.com')).toContain('twitter.com');
    expect(aliasesOf('chess.com')).toEqual([]);
  });

  it('a lista que vai pra extensão é a expandida, sem repetir e na ordem', () => {
    expect(expandSites(['chess.com', 'youtube.com'])).toEqual(['chess.com', 'youtube.com', 'youtu.be']);
    expect(expandSites(['twitter.com', 'x.com'])).toEqual(['twitter.com', 'x.com', 't.co']);
    expect(expandSites([])).toEqual([]);
  });

  it('todo apelido é um domínio válido (senão a extensão recebe lixo)', () => {
    for (const [site, alias] of Object.entries(SITE_ALIASES)) {
      expect(normalizeSite(site)).toBe(site);
      for (const a of alias) expect(normalizeSite(a)).toBe(a);
    }
  });
});

describe('config', () => {
  it('qualquer formato vira config válida', () => {
    expect(normalizeSiteBlockConfig(undefined)).toEqual(defaultSiteBlock());
    expect(normalizeSiteBlockConfig('lixo')).toEqual(defaultSiteBlock());
    expect(normalizeSiteBlockConfig({ enabled: true, mode: 'whitelist', sites: ['WWW.Wikipedia.org'] })).toEqual({ enabled: true, mode: 'whitelist', sites: ['wikipedia.org'] });
    expect(normalizeSiteBlockConfig({ enabled: 'sim', mode: 'greylist', sites: 'youtube.com' })).toEqual(defaultSiteBlock());
  });

  it('lista negra vazia não arma nada; lista branca arma sempre', () => {
    expect(siteBlockArmable({ enabled: false, mode: 'blacklist', sites: ['x.com'] })).toBe(false);
    expect(siteBlockArmable({ enabled: true, mode: 'blacklist', sites: [] })).toBe(false);
    expect(siteBlockArmable({ enabled: true, mode: 'blacklist', sites: ['x.com'] })).toBe(true);
    expect(siteBlockArmable({ enabled: true, mode: 'whitelist', sites: [] })).toBe(true);
  });
});

describe('migração do doc antigo (a lista morava no hardcore)', () => {
  it('sem campo nenhum: desligado', () => {
    expect(migrateSiteBlock(undefined, undefined)).toEqual(defaultSiteBlock());
    expect(migrateSiteBlock(undefined, { enabled: true })).toEqual(defaultSiteBlock());
  });

  it('lista no hardcore: vira o bloqueio, herdando modo, lista e o "ligado"', () => {
    expect(migrateSiteBlock(undefined, { enabled: true, mode: 'whitelist', sites: ['Wikipedia.org'] })).toEqual({
      enabled: true,
      mode: 'whitelist',
      sites: ['wikipedia.org'],
    });
    expect(migrateSiteBlock(undefined, { enabled: false, mode: 'blacklist', sites: ['youtube.com'] })).toEqual({
      enabled: false,
      mode: 'blacklist',
      sites: ['youtube.com'],
    });
  });

  it('doc novo: `siteBlock` vence o campo antigo', () => {
    expect(migrateSiteBlock({ enabled: true, mode: 'blacklist', sites: ['chess.com'] }, { enabled: true, mode: 'whitelist', sites: ['antigo.com'] })).toEqual({
      enabled: true,
      mode: 'blacklist',
      sites: ['chess.com'],
    });
  });
});
