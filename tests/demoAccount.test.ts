// O personagem pronto do site de teste é um ESTADO como outro qualquer: estes testes
// cobram que ele seja um estado que o app entende — sem onboarding, sem tour, com um
// histórico em que todo check cai num bloco de verdade — e que a troca entre ele e uma
// conta nova apague só a conta de teste.

import { describe, expect, it } from 'vitest';
import { DEMO_PET, DEMO_STUDIES_PER_DAY, demoAccount } from '../src/domain/demoAccount';
import { expandEventsForDate } from '../src/domain/events';
import { hydrateUserDoc, serializeState } from '../src/domain/persistence';
import { generateBlocks } from '../src/domain/planner';
import { blockMins, dk } from '../src/domain/time';
import { TOUR_AREAS, activeTourArea } from '../src/domain/tutorial';
import { MEMORY_DOC_PREFIX } from '../src/infrastructure/memory/userRepository';
import type { KeyValueStorage } from '../src/infrastructure/memory/userRepository';
import {
  accountKindFromSearch,
  prepareTestAccount,
  searchWithoutAccount,
} from '../src/infrastructure/memory/testSite';

const AGORA = new Date('2026-11-27T10:30:00');
const HOJE = '2026-11-27';
const UID = 'usuario-teste';

const diasAtras = (n: number): string => {
  const d = new Date(AGORA);
  d.setDate(d.getDate() - n);
  return dk(d);
};

function fakeStorage(): KeyValueStorage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

describe('o personagem pronto', () => {
  const s = demoAccount(AGORA);

  it('é determinístico: o mesmo agora devolve o mesmo personagem', () => {
    expect(demoAccount(AGORA)).toEqual(s);
  });

  it('sobrevive à ida e volta do documento salvo', () => {
    expect(hydrateUserDoc(JSON.parse(JSON.stringify(serializeState(s))))).toEqual(s);
  });

  it('já passou pelo onboarding: tem pet equipado, a refeição das 13h e a idade declarada', () => {
    expect(s.pets.owned).toHaveLength(1);
    expect(s.pets.owned[0]).toMatchObject({ species: DEMO_PET.species, name: DEMO_PET.name });
    expect(s.pets.active).toBe(s.pets.owned[0]!.id);
    expect(s.eventSeries.map((e) => e.id)).toEqual(['ser_almoco']);
    expect(s.ageConfirmed).toBe(true);
    expect(s.config.periodStart).toBe(diasAtras(DEMO_STUDIES_PER_DAY.length));
  });

  it('nenhum tour abre: todas as áreas já foram vistas', () => {
    for (const area of TOUR_AREAS) expect(s.tutorialSeen[area]).toBe(true);
    for (const tab of ['plan', 'profile', 'analytics']) {
      expect(activeTourArea(s.tutorialSeen, tab, { onboardingOpen: false, loaded: true })).toBeNull();
    }
  });

  it('hoje fica em branco, e o histórico é só de dias passados', () => {
    expect(s.checks[HOJE]).toBeUndefined();
    for (const dia of Object.keys(s.checks)) expect(dia < HOJE).toBe(true);
  });

  it('todo check cai num bloco que o gerador monta naquele dia, com os estudos combinados', () => {
    DEMO_STUDIES_PER_DAY.forEach((estudos, i) => {
      const dia = diasAtras(i + 1);
      const marcados = Object.keys(s.checks[dia] ?? {});
      if (estudos === 0) return expect(marcados).toEqual([]);
      const plano = generateBlocks(s.config, expandEventsForDate(dia, s.events, s.eventSeries));
      const blocos = marcados.map((t) => plano.find((b) => b.time === t));
      expect(blocos.every(Boolean)).toBe(true);
      expect(blocos.filter((b) => b!.type === 'estudo')).toHaveLength(estudos);
    });
  });

  it('os três dias antes de hoje batem a meta: a sequência chega viva', () => {
    for (const n of [1, 2, 3]) {
      const dia = diasAtras(n);
      const plano = generateBlocks(s.config, expandEventsForDate(dia, s.events, s.eventSeries));
      const mins = plano
        .filter((b) => b.type === 'estudo' && s.checks[dia]?.[b.time])
        .reduce((soma, b) => soma + blockMins(b), 0);
      expect(mins).toBeGreaterThanOrEqual(s.config.dailyStudyMin);
    }
    expect(DEMO_STUDIES_PER_DAY[3]).toBe(0); // o dia que falhou, pra sequência não ser o histórico inteiro
  });

  it('o pet recebe o XP do histórico pelo boot: o marco fica um dia antes do começo', () => {
    expect(s.pets.owned[0]!.xp).toBe(0);
    expect(s.pets.xpProcessedUntil).toBe(diasAtras(DEMO_STUDIES_PER_DAY.length + 1));
  });
});

describe('o pedido de conta no endereço do site de teste', () => {
  it('só entende nova e pronta', () => {
    expect(accountKindFromSearch('?conta=nova')).toBe('nova');
    expect(accountKindFromSearch('?tema=loft&conta=pronta')).toBe('pronta');
    expect(accountKindFromSearch('?conta=outra')).toBeNull();
    expect(accountKindFromSearch('')).toBeNull();
  });

  it('sai do endereço sem levar os outros parâmetros', () => {
    expect(searchWithoutAccount('?conta=nova')).toBe('');
    expect(searchWithoutAccount('?tema=loft&conta=nova')).toBe('?tema=loft');
  });
});

describe('qual conta o site de teste abre', () => {
  const doc = (st: KeyValueStorage) => st.getItem(MEMORY_DOC_PREFIX + UID);

  it('primeira visita: nasce com o personagem pronto', () => {
    const st = fakeStorage();
    expect(prepareTestAccount(st, UID, null, AGORA)).toBe('seeded');
    expect(hydrateUserDoc(JSON.parse(doc(st)!))).toEqual(demoAccount(AGORA));
  });

  it('visita seguinte: a conta que já está lá não é tocada', () => {
    const st = fakeStorage();
    st.setItem(MEMORY_DOC_PREFIX + UID, '{"coinsSpent":150}');
    expect(prepareTestAccount(st, UID, null, AGORA)).toBe('kept');
    expect(doc(st)).toBe('{"coinsSpent":150}');
  });

  it('conta nova: apaga a conta, e um reload no meio do onboarding não vira personagem pronto', () => {
    const st = fakeStorage();
    prepareTestAccount(st, UID, null, AGORA);
    expect(prepareTestAccount(st, UID, 'nova', AGORA)).toBe('empty');
    expect(doc(st)).toBeNull();
    expect(prepareTestAccount(st, UID, null, AGORA)).toBe('empty'); // o reload
    expect(doc(st)).toBeNull();
  });

  it('conta nova que terminou o onboarding continua sendo a conta dela', () => {
    const st = fakeStorage();
    prepareTestAccount(st, UID, 'nova', AGORA);
    st.setItem(MEMORY_DOC_PREFIX + UID, '{"ageConfirmed":true}'); // o save do fim do onboarding
    expect(prepareTestAccount(st, UID, null, AGORA)).toBe('kept');
  });

  it('personagem pronto: volta pra ele de qualquer estado', () => {
    const st = fakeStorage();
    prepareTestAccount(st, UID, 'nova', AGORA);
    expect(prepareTestAccount(st, UID, 'pronta', AGORA)).toBe('seeded');
    expect(prepareTestAccount(st, UID, null, AGORA)).toBe('kept');
  });

  it('trocar de conta leva junto a sessão hardcore e a pausa aberta — e deixa o tema e o volume', () => {
    const st = fakeStorage();
    st.setItem('study-pets:hardcore:' + UID, '{}');
    st.setItem('study-pets:pause:' + UID, '{}');
    st.setItem('sp-theme', 'loft');
    st.setItem('sp-audio', '{"volume":0.4}');
    prepareTestAccount(st, UID, 'pronta', AGORA);
    expect(st.keys().sort()).toEqual([MEMORY_DOC_PREFIX + UID, 'sp-audio', 'sp-theme'].sort());
  });
});
