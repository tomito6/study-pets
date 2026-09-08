// A parte pura da extensão do navegador (extension/rules.js): quais regras o
// estado do bloqueio vira, e quais URLs abertas caem nele.

import { describe, expect, it } from 'vitest';
import { ALWAYS_ALLOWED, ackFor, allowedFor, buildRules, domainMatches, hostOf, isBlocked, isLive, isSupported } from '../extension/rules.js';
import type { BlockingExtPayload } from '../extension/rules.js';

const base: BlockingExtPayload = {
  v: 2,
  active: true,
  until: 1_800_000_000_000,
  mode: 'blacklist',
  sites: ['youtube.com', 'youtu.be', 'instagram.com'],
  block: { name: 'Estudo 3', endTime: '10:25' },
  pet: null,
  appUrl: 'http://localhost:5174',
  hardcore: false,
  test: false,
};

describe('hosts', () => {
  it('extrai o domínio sem www, e só de http(s)', () => {
    expect(hostOf('https://www.YouTube.com/watch?v=1')).toBe('youtube.com');
    expect(hostOf('chrome://extensions')).toBeNull();
    expect(hostOf('lixo')).toBeNull();
    expect(domainMatches('m.youtube.com', 'youtube.com')).toBe(true);
    expect(domainMatches('notyoutube.com', 'youtube.com')).toBe(false);
  });

  it('o app de onde a página foi servida entra nos sempre permitidos', () => {
    expect(allowedFor(base)).toEqual(ALWAYS_ALLOWED); // localhost já está
    expect(allowedFor({ ...base, appUrl: 'https://preview-abc.vercel.app' })).toContain('preview-abc.vercel.app');
  });
});

describe('versão e validade', () => {
  it('só entende o payload v2 — o formato antigo é ignorado', () => {
    expect(isSupported(base)).toBe(true);
    expect(isSupported({ ...base, v: 1 })).toBe(false);
    expect(isSupported(null)).toBe(false);
  });

  it('estado vale enquanto o `until` não venceu', () => {
    expect(isLive(base, base.until! - 1)).toBe(true);
    expect(isLive(base, base.until!)).toBe(false);
    expect(isLive({ ...base, active: false }, 0)).toBe(false);
    expect(isLive(null, 0)).toBe(false);
  });
});

describe('isBlocked — abas já abertas', () => {
  it('lista negra: os sites da lista, com subdomínio, caminho e porta', () => {
    expect(isBlocked('https://m.youtube.com/x', base)).toBe(true);
    expect(isBlocked('https://youtu.be/abc', base)).toBe(true); // o apelido veio expandido do app
    expect(isBlocked('http://www.youtube.com:8080/watch?v=1', base)).toBe(true);
    expect(isBlocked('https://wikipedia.org', base)).toBe(false);
    expect(isBlocked('http://localhost:5174/', base)).toBe(false);
  });

  it('lista branca: tudo, menos a lista e o que o app precisa', () => {
    const wl = { ...base, mode: 'whitelist' as const, sites: ['wikipedia.org'] };
    expect(isBlocked('https://wikipedia.org/wiki/x', wl)).toBe(false);
    expect(isBlocked('https://youtube.com', wl)).toBe(true);
    expect(isBlocked('https://accounts.google.com/signin', wl)).toBe(false);
    expect(isBlocked('https://plano-estudos-one.vercel.app/', wl)).toBe(false);
  });

  it('sem estado ativo, nada bloqueia', () => {
    expect(isBlocked('https://youtube.com', { ...base, active: false })).toBe(false);
    expect(isBlocked('https://youtube.com', null)).toBe(false);
  });
});

describe('buildRules', () => {
  it('lista negra: um redirect por site, só main_frame', () => {
    const rules = buildRules(base);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({
      id: 1000,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: '/blocked.html' } },
      condition: { requestDomains: ['youtube.com'], resourceTypes: ['main_frame'] },
    });
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('lista branca: bloqueia toda página http com allows por cima', () => {
    const rules = buildRules({ ...base, mode: 'whitelist', sites: ['wikipedia.org', 'localhost'] });
    expect(rules[0]).toMatchObject({ id: 1, priority: 1, action: { type: 'redirect' }, condition: { urlFilter: '|http' } });
    const allows = rules.slice(1);
    expect(allows.every((r) => r.action.type === 'allow' && r.priority === 2)).toBe(true);
    const domains = allows.flatMap((r) => r.condition.requestDomains ?? []);
    expect(domains).toContain('wikipedia.org');
    expect(domains).toContain('plano-estudos-one.vercel.app');
    expect(domains).toContain('accounts.google.com');
    expect(domains.filter((d) => d === 'localhost')).toHaveLength(1); // sem duplicar o que já é sempre permitido
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('inativo: nenhuma regra', () => {
    expect(buildRules({ ...base, active: false })).toEqual([]);
    expect(buildRules(null)).toEqual([]);
  });
});

describe('ackFor — o que o app recebe de volta', () => {
  it('conta os domínios aplicados e diz se é teste', () => {
    expect(ackFor(base)).toEqual({ applied: true, until: base.until, sites: 3, mode: 'blacklist', test: false });
    expect(ackFor({ ...base, test: true })).toMatchObject({ applied: true, test: true });
  });

  it('nada aplicado vira o ack vazio', () => {
    expect(ackFor(null)).toEqual({ applied: false, until: 0, sites: 0, mode: null, test: false });
    expect(ackFor({ ...base, active: false })).toEqual({ applied: false, until: 0, sites: 0, mode: null, test: false });
  });
});
