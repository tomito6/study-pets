// Modo hardcore, a parte pura: sites, a sessão no dispositivo, e a conta de desistir.

import { describe, expect, it } from 'vitest';
import {
  HARDCORE_MULTIPLIER,
  blockFromSession,
  isForfeited,
  normalizeHardcoreConfig,
  normalizePenalties,
  normalizeSite,
  normalizeSites,
  parseHardcoreSession,
  penaltyFor,
  penaltyRecord,
  quitCost,
  resolveSession,
  sessionFor,
} from '../src/domain/hardcore';
import type { HardcoreSession } from '../src/domain/hardcore';
import { petLevelStart } from '../src/domain/pets';
import type { StudyBlock } from '../src/domain/types';

const estudo: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, session: 0 };
const pausa: StudyBlock = { time: '10:25', endTime: '10:30', name: '🧘 Pausa', type: 'pausa', xp: 5, session: 0 };
const HOJE = '2026-09-02';
const as = (hms: string) => new Date(`${HOJE}T${hms}`);

describe('sites', () => {
  it('normaliza pra domínio: sem esquema, www, caminho, porta, maiúsculas', () => {
    expect(normalizeSite('https://www.YouTube.com/watch?v=abc')).toBe('youtube.com');
    expect(normalizeSite('  instagram.com/  ')).toBe('instagram.com');
    expect(normalizeSite('http://localhost:5173/x')).toBeNull(); // sem ponto não é domínio público
    expect(normalizeSite('m.twitter.com')).toBe('m.twitter.com');
    expect(normalizeSite('')).toBeNull();
    expect(normalizeSite('não é site')).toBeNull();
    expect(normalizeSite('.reddit.com.')).toBe('reddit.com');
  });

  it('a lista digitada vira domínios únicos, na ordem, ignorando lixo', () => {
    expect(normalizeSites('youtube.com\nhttps://www.youtube.com, twitch.tv  x\n\n')).toEqual(['youtube.com', 'twitch.tv']);
    expect(normalizeSites(['A.com', 'a.com', 42 as unknown as string])).toEqual(['a.com']);
  });

  it('config em qualquer formato vira config válida', () => {
    expect(normalizeHardcoreConfig(undefined)).toEqual({ enabled: false, mode: 'blacklist', sites: [] });
    expect(normalizeHardcoreConfig({ enabled: true, mode: 'whitelist', sites: ['WWW.Wikipedia.org'] })).toEqual({ enabled: true, mode: 'whitelist', sites: ['wikipedia.org'] });
    expect(normalizeHardcoreConfig({ enabled: 'sim', mode: 'greylist', sites: 'youtube.com' })).toEqual({ enabled: false, mode: 'blacklist', sites: [] });
  });
});

describe('sessão no dispositivo', () => {
  const s = sessionFor(estudo, HOJE, 'cat', as('10:10:00'));

  it('guarda o bloco, o dia e o pet equipado; volta a ser bloco', () => {
    expect(s).toMatchObject({ dateKey: HOJE, time: '10:00', endTime: '10:25', type: 'estudo', name: '📖 Estudo 3', xp: 50, pet: 'cat' });
    expect(blockFromSession(s)).toEqual(estudo);
  });

  it('lê de volta o que foi guardado e rejeita lixo', () => {
    expect(parseHardcoreSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseHardcoreSession(null)).toBeNull();
    expect(parseHardcoreSession({ dateKey: HOJE })).toBeNull();
    expect(parseHardcoreSession({ ...s, type: 'almoco' })).toBeNull();
    expect(parseHardcoreSession({ ...s, time: '10h' })).toBeNull();
  });

  it('o bloco ainda roda → volta pro foco; acabou → abandono (estudo) ou nada (pausa)', () => {
    expect(resolveSession(s, as('10:20:00'))).toBe('resume');
    expect(resolveSession(s, as('09:50:00'))).toBe('resume'); // em espera também volta
    expect(resolveSession(s, as('10:25:00'))).toBe('abandon');
    expect(resolveSession(s, new Date('2026-09-03T08:00:00'))).toBe('abandon'); // outro dia: já era
    const p: HardcoreSession = sessionFor(pausa, HOJE, null, as('10:26:00'));
    expect(resolveSession(p, as('10:31:00'))).toBe('expired-free');
  });
});

describe('a conta de desistir', () => {
  it('estudo custa 2× o XP do bloco; pausa nada', () => {
    expect(HARDCORE_MULTIPLIER).toBe(2);
    expect(penaltyFor(estudo)).toBe(100);
    expect(penaltyFor(pausa)).toBe(0);
  });

  it('desconta do usuário e do pet, na hora, e mostra os níveis antes/depois', () => {
    // Usuário com 800 XP (Focado, nível 3) e pet no começo do Lv. 5 (320).
    const c = quitCost({ block: estudo, now: as('10:10:00'), userTotalXP: 800, petXP: petLevelStart(5) });
    expect(c).toMatchObject({ free: false, full: 100, userXp: 100, userLevelBefore: 3, userLevelAfter: 2, petXp: 100, petLevelBefore: 5, petLevelAfter: 4 });
  });

  it('nunca abaixo de zero: quem tem 30 XP perde 30', () => {
    const c = quitCost({ block: estudo, now: as('10:10:00'), userTotalXP: 30, petXP: 0 });
    expect(c.userXp).toBe(30);
    expect(c.petXp).toBe(0);
    expect(c.userLevelAfter).toBe(1);
  });

  it('sem pet equipado só o usuário perde', () => {
    const c = quitCost({ block: estudo, now: as('10:10:00'), userTotalXP: 500, petXP: null });
    expect(c.petXp).toBe(0);
    expect(c.petLevelBefore).toBeNull();
  });

  it('em espera é de graça; pausa é de graça; a fase pode ser forçada (abandono)', () => {
    expect(quitCost({ block: estudo, now: as('09:50:00'), userTotalXP: 500, petXP: 100 })).toMatchObject({ free: true, userXp: 0, petXp: 0 });
    expect(quitCost({ block: pausa, now: as('10:27:00'), userTotalXP: 500, petXP: 100 })).toMatchObject({ free: true, full: 0 });
    expect(quitCost({ block: estudo, now: as('12:00:00'), userTotalXP: 500, petXP: 100, phase: 'running' })).toMatchObject({ free: false, userXp: 100, petXp: 100 });
  });
});

describe('registros de desistência', () => {
  const s = sessionFor(estudo, HOJE, 'cat', as('10:10:00'));

  it('monta o registro com o nome limpo e o que de fato saiu', () => {
    const r = penaltyRecord(s, { userXp: 100, petXp: 60 }, 'cat', 'quit', as('10:12:00'));
    expect(r).toEqual({ time: '10:00', endTime: '10:25', name: 'Estudo 3', xp: 100, pet: 'cat', petXp: 60, at: as('10:12:00').getTime(), reason: 'quit' });
  });

  it('um bloco com registro está abandonado', () => {
    const penalties = { [HOJE]: [penaltyRecord(s, { userXp: 100, petXp: 0 }, null, 'quit', as('10:12:00'))] };
    expect(isForfeited(penalties, HOJE, '10:00')).toBe(true);
    expect(isForfeited(penalties, HOJE, '10:30')).toBe(false);
    expect(isForfeited(penalties, '2026-09-03', '10:00')).toBe(false);
    expect(isForfeited(undefined, HOJE, '10:00')).toBe(false);
  });

  it('lê `penalties` de qualquer formato, descartando o que não serve', () => {
    expect(normalizePenalties(undefined)).toEqual({});
    expect(normalizePenalties({ [HOJE]: 'x', '2026-09-01': [{ time: '10:00', xp: 100, pet: 'cat', petXp: 100, at: 1, reason: 'abandon' }, { xp: 5 }] })).toEqual({
      '2026-09-01': [{ time: '10:00', endTime: '10:00', name: '', xp: 100, pet: 'cat', petXp: 100, at: 1, reason: 'abandon' }],
    });
  });
});
