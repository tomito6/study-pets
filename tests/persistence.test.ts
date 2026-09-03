import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  emptyPersistedState,
  hydrateUserDoc,
  serializeState,
} from '../src/domain/persistence';
import type { PersistedState } from '../src/domain/persistence';
import { DEFAULT_CFG } from '../src/domain/config';

describe('hydrateUserDoc — documentos antigos continuam carregando', () => {
  it('documento vazio vira conta nova', () => {
    expect(hydrateUserDoc({})).toEqual(emptyPersistedState());
  });

  it('lixo (null, string, array) também vira conta nova em vez de quebrar', () => {
    expect(hydrateUserDoc(null)).toEqual(emptyPersistedState());
    expect(hydrateUserDoc('x')).toEqual(emptyPersistedState());
    expect(hydrateUserDoc([1, 2])).toEqual(emptyPersistedState());
  });

  it('config antiga sem studyWindows ganha a janela a partir de start/end', () => {
    // Bug corrigido na Fase 4: o loadData original espalhava DEFAULT_CFG (que já tem
    // studyWindows) ANTES de migrar, e a janela padrão 09–18 engolia os horários reais.
    const s = hydrateUserDoc({ config: { start: '08:00', end: '16:00' } });
    expect(s.config.studyWindows).toEqual([{ start: '08:00', end: '16:00' }]);
    expect(s.config.pomo).toBe(DEFAULT_CFG.pomo); // o resto vem do default
  });

  it('config antiga sem start/end nem studyWindows cai na janela padrão', () => {
    const s = hydrateUserDoc({ config: { pomo: 40 } });
    expect(s.config.studyWindows).toEqual(DEFAULT_CFG.studyWindows);
    expect(s.config.pomo).toBe(40);
  });

  it('config nova é preservada', () => {
    const cfg = { ...DEFAULT_CFG, pomo: 50, dailyStudyMin: 90, studyWindows: [{ start: '10:00', end: '12:00' }] };
    expect(hydrateUserDoc({ config: cfg }).config).toEqual(cfg);
  });

  it('checks antigos salvos como `true` passam intactos', () => {
    const checks = { '2026-05-07': { '09:00': true } };
    expect(hydrateUserDoc({ checks }).checks).toEqual(checks);
  });

  it('pets v0 (só owned/active, por espécie) viram instâncias com o id da espécie', () => {
    const s = hydrateUserDoc({ pets: { owned: ['cat'], active: 'cat' } });
    expect(s.pets).toEqual({ owned: [{ id: 'cat', species: 'cat', name: 'Gato', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }], active: 'cat', activeSince: 0, xpProcessedUntil: null });
  });

  it('pets v1 (xp por espécie + skills.owl) migram XP e skill pra dentro da instância', () => {
    const pets = { owned: ['owl', 'cat'], active: 'owl', xp: { owl: 120 }, xpProcessedUntil: '2026-09-01' };
    const s = hydrateUserDoc({ pets, skills: { owl: 'noturno', activatedAt: 1234 } });
    expect(s.pets).toEqual({
      owned: [
        { id: 'owl', species: 'owl', name: 'Coruja', xp: 120, path: null, stage: 0, skill: 'noturno', skillActivatedAt: 1234, adoptedAt: 0 },
        { id: 'cat', species: 'cat', name: 'Gato', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 },
      ],
      active: 'owl',
      activeSince: 0,
      xpProcessedUntil: '2026-09-01',
    });
  });

  it('pets v2 (instâncias) passam intactos; campo faltando ganha default; active órfão vira null', () => {
    const bolt = { id: 'dog', species: 'dog', name: 'Bolt', xp: 60, path: 'selvagem', stage: 1, skill: 'noturno', skillActivatedAt: 9, adoptedAt: 5 };
    expect(hydrateUserDoc({ pets: { owned: [bolt], active: 'dog', activeSince: 7 } }).pets).toEqual({ owned: [bolt], active: 'dog', activeSince: 7, xpProcessedUntil: null });
    const s = hydrateUserDoc({ pets: { owned: [{ id: 'dog-2', species: 'dog' }, { nao: 'vale' }, 42], active: 'sumiu' } });
    expect(s.pets.owned).toEqual([{ id: 'dog-2', species: 'dog', name: 'Cachorro', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 }]);
    expect(s.pets.active).toBeNull();
  });

  it('xpProcessedUntil que não é string vira null', () => {
    expect(hydrateUserDoc({ pets: { xpProcessedUntil: 123 } }).pets.xpProcessedUntil).toBeNull();
  });

  it('documento sem closedDays ou eventSeries ganha vazios', () => {
    const s = hydrateUserDoc({ checks: {} });
    expect(s.closedDays).toEqual({});
    expect(s.eventSeries).toEqual([]);
    expect(s.groups).toEqual({});
  });

  it('grupos malformados são descartados; nome vazio vira "Grupo", objetivo ausente vira vazio', () => {
    const s = hydrateUserDoc({
      groups: {
        '2026-09-02': [
          { id: 'g1', start: '09:00', end: '10:25', name: 'Análise', goal: 'lista 3' },
          { id: 'g2', start: '14:00', end: '15:00' },
          { start: '16:00', end: '17:00', name: 'sem id' },
          'lixo',
        ],
        '2026-09-03': 'não é lista',
      },
    });
    expect(s.groups).toEqual({
      '2026-09-02': [
        { id: 'g1', start: '09:00', end: '10:25', name: 'Análise', goal: 'lista 3' },
        { id: 'g2', start: '14:00', end: '15:00', name: 'Grupo', goal: '' },
      ],
    });
  });

  it('eventSeries que não é array é descartado', () => {
    expect(hydrateUserDoc({ eventSeries: { oops: true } }).eventSeries).toEqual([]);
  });

  it('coinsSpent que não é número vira 0', () => {
    expect(hydrateUserDoc({ coinsSpent: '150' }).coinsSpent).toBe(0);
    expect(hydrateUserDoc({ coinsSpent: 150 }).coinsSpent).toBe(150);
  });

  it('ignora schemaVersion desconhecido sem quebrar', () => {
    expect(() => hydrateUserDoc({ schemaVersion: 999 })).not.toThrow();
  });
});

describe('serializeState', () => {
  it('grava o schemaVersion atual', () => {
    expect(serializeState(emptyPersistedState()).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('não leva campos de UI', () => {
    const comUi = { ...emptyPersistedState(), uiTab: 'plano', uiWeek: 3, user: { uid: 'x' } };
    const doc = serializeState(comUi as never) as unknown as Record<string, unknown>;
    expect(doc).not.toHaveProperty('uiTab');
    expect(doc).not.toHaveProperty('uiWeek');
    expect(doc).not.toHaveProperty('user');
  });

  it('preenche defaults pra campos que podem estar faltando no state', () => {
    const parcial = { ...emptyPersistedState() } as Record<string, unknown>;
    delete parcial.eventSeries;
    delete parcial.closedDays;
    delete parcial.pets;
    delete parcial.coinsSpent;
    delete parcial.groups;
    const doc = serializeState(parcial as never);
    expect(doc.eventSeries).toEqual([]);
    expect(doc.closedDays).toEqual({});
    expect(doc.pets).toEqual({ owned: [], active: null, activeSince: 0, xpProcessedUntil: null });
    expect(doc.coinsSpent).toBe(0);
    expect(doc).not.toHaveProperty('skills');
    expect(doc.groups).toEqual({});
  });
});

describe('ida e volta', () => {
  it('serializar e hidratar devolve o mesmo estado', () => {
    const estado: PersistedState = {
      ...emptyPersistedState(),
      checks: { '2026-09-01': { '09:00': { pet: 'owl', bonus: 0.05 }, '10:00': true } },
      events: { '2026-09-01': [{ name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: true }] },
      eventSeries: [{ id: 's1', name: 'Treino', start: '18:00', end: '19:00', weekdays: [1, 3], freq: 'weekly', anchor: '2026-09-01' }],
      closedDays: { '2026-09-01': true },
      pets: {
        owned: [
          { id: 'owl', species: 'owl', name: 'Sofia', xp: 300, path: null, stage: 0, skill: 'noturno', skillActivatedAt: 1234, adoptedAt: 10 },
          { id: 'dog', species: 'dog', name: 'Bolt', xp: 60, path: 'selvagem', stage: 1, skill: null, skillActivatedAt: 0, adoptedAt: 20 },
        ],
        active: 'owl',
        activeSince: 99,
        xpProcessedUntil: '2026-09-01',
      },
      coinsSpent: 300,
      groups: { '2026-09-01': [{ id: 'grp_1', start: '09:00', end: '10:25', name: 'Análise II', goal: 'lista 3' }] },
    };
    expect(hydrateUserDoc(serializeState(estado))).toEqual(estado);
  });
});
