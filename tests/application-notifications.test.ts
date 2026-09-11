// O sininho ligado ao resto do app: quem cria as linhas, e por que elas não duplicam.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { closeDay, initialDayEnd, resetEndOfDayPrompt } from '../src/application/dayEnd';
import {
  clearNotifications,
  markNotificationsRead,
  notifications,
  pushNotifications,
  unreadNotifications,
} from '../src/application/notifications';
import { startDayRollover, stopDayRollover } from '../src/application/dayRollover';
import { applyPendingPetXP } from '../src/application/pets';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { emptyPersistedState } from '../src/domain/persistence';
import type { PetInstance } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';

const gato = (over: Partial<PetInstance> = {}): PetInstance => ({
  id: 'cat', species: 'cat', name: 'Mia', xp: 0, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0, ...over,
});

function resetAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  derived.dayEnd = initialDayEnd();
  derived.onboardingOpen = false;
  clearBlockCache();
  resetEndOfDayPrompt();
  rebuildWeeks(new Date(iso));
}

/** Marca `n` estudos de hoje. Devolve os blocos marcados. */
function marcar(n: number) {
  const estudos = blocksForDay(HOJE).filter((b) => b.type === 'estudo').slice(0, n);
  for (const b of estudos) toggleBlockCheck(HOJE, b);
  return estudos;
}

describe('encerrar o dia deixa o que aconteceu no sininho', () => {
  beforeEach(() => {
    resetAt('2026-09-02T17:30:00');
    state.pets.owned = [gato()];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = ONTEM;
  });

  it('um estudo marcado deixa a linha do dia e a do pet que subiu de nível', () => {
    marcar(1);
    closeDay();
    const ids = notifications().map((n) => n.id);
    expect(ids).toEqual(['dia:2026-09-02', 'pet-nivel:cat:2']); // a mais nova primeiro
    expect(notifications()[0]!.data).toEqual({ dia: HOJE, xp: 50, coins: 25 });
    expect(unreadNotifications()).toBe(2);
  });

  it('dia encerrado em branco não deixa linha nenhuma — nem pra comemorar nem pra cobrar', () => {
    closeDay();
    expect(notifications()).toEqual([]);
  });

  it('encerrar o mesmo dia de novo não duplica: o id vem do dia, não do relógio', () => {
    marcar(1);
    closeDay();
    const antes = notifications().map((n) => n.id);
    vi.setSystemTime(new Date('2026-09-02T18:30:00'));
    closeDay();
    expect(notifications().map((n) => n.id)).toEqual(antes);
  });

  it('subir de nível entra por cima da linha do dia', () => {
    marcar(6); // 300 XP passa dos 250 do nível 2
    closeDay();
    expect(notifications()[0]!.id).toBe('nivel:2');
    expect(notifications()[0]!.data).toMatchObject({ n: 2, nome: 'Iniciante' });
  });

  it('sem pet equipado, ninguém sobe de nível — só a linha do dia', () => {
    state.pets.active = null;
    marcar(1);
    closeDay();
    expect(notifications().map((n) => n.kind)).toEqual(['dia']);
  });
});

describe('o que aconteceu com o app fechado', () => {
  beforeEach(() => resetAt('2026-09-02T09:00:00'));

  it('o dia que passou sozinho e o pet que subiu de nível são descobertos no boot', () => {
    // Ontem teve um estudo marcado e o app foi fechado. Ninguém apertou "Encerrar o
    // dia": a virada da meia-noite pôs o dia na conta, e nenhuma tela contou isso.
    state.pets.owned = [gato()];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = '2026-08-31';
    state.closedDays[ONTEM] = true;
    const b = blocksForDay(ONTEM).find((x) => x.type === 'estudo')!;
    state.checks[ONTEM] = { [b.time]: { pet: 'cat', bonus: 0 } };

    applyPendingPetXP(new Date('2026-09-02T09:00:00'));

    expect(state.pets.owned[0]!.xp).toBe(50);
    expect(notifications().map((n) => n.id)).toEqual(['dia:2026-09-01', 'pet-nivel:cat:2']);
    expect(notifications()[0]!.data).toEqual({ dia: ONTEM, xp: 50, coins: 25 });
  });

  it('rodar de novo (outro boot, um sync) não cria a linha duas vezes', () => {
    state.pets.owned = [gato()];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = '2026-08-31';
    state.closedDays[ONTEM] = true;
    const b = blocksForDay(ONTEM).find((x) => x.type === 'estudo')!;
    state.checks[ONTEM] = { [b.time]: { pet: 'cat', bonus: 0 } };

    applyPendingPetXP(new Date('2026-09-02T09:00:00'));
    const primeiro = notifications().map((n) => n.id);
    applyPendingPetXP(new Date('2026-09-02T09:05:00'));
    expect(notifications().map((n) => n.id)).toEqual(primeiro);
  });

  it('voltar de uma semana fora não enche o painel: no máximo três "dia encerrado"', () => {
    state.pets.xpProcessedUntil = '2026-08-25';
    for (const dia of ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-31', '2026-09-01']) {
      const estudos = blocksForDay(dia).filter((b) => b.type === 'estudo').slice(0, 3);
      state.checks[dia] = Object.fromEntries(estudos.map((b) => [b.time, { pet: null, bonus: 0 }]));
    }
    rebuildWeeks(new Date('2026-09-02T09:00:00')); // as semanas se estendem pra trás quando há dados antigos
    applyPendingPetXP(new Date('2026-09-02T09:00:00'));
    const dias = notifications().filter((n) => n.kind === 'dia').map((n) => n.data.dia);
    expect(dias).toEqual(['2026-09-01', '2026-08-31', '2026-08-28']); // as mais recentes, no topo
    // Mas o que aconteceu ao longo da semana não se perde: o nível é uma linha só.
    const niveis = notifications().filter((n) => n.kind === 'nivel');
    expect(niveis).toHaveLength(1);
    expect(niveis[0]!.data.n).toBe(3); // 5 dias × 150 XP = 750, e o nível 3 começa em 750
  });

  it('conta nova no primeiro boot não inventa notificação nenhuma', () => {
    state.pets.owned = [gato()];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = null;
    applyPendingPetXP(new Date('2026-09-02T09:00:00'));
    expect(notifications()).toEqual([]);
  });
});

describe('lido, limpo e zerado', () => {
  beforeEach(() => resetAt('2026-09-02T17:30:00'));

  it('marcar como lido zera o selo sem apagar nada', () => {
    pushNotifications([{ id: 'a', kind: 'dia' }, { id: 'b', kind: 'nivel' }]);
    expect(unreadNotifications()).toBe(2);
    markNotificationsRead();
    expect(unreadNotifications()).toBe(0);
    expect(notifications()).toHaveLength(2);
  });

  it('limpar esvazia a lista', () => {
    pushNotifications([{ id: 'a', kind: 'dia' }]);
    clearNotifications();
    expect(notifications()).toEqual([]);
  });

  it('cancelar a sessão zera o sininho: as linhas falam de um passado que deixou de existir', () => {
    pushNotifications([{ id: 'a', kind: 'dia' }]);
    cancelSession();
    expect(notifications()).toEqual([]);
  });

  it('pushNotifications devolve quantas entraram de fato', () => {
    expect(pushNotifications([{ id: 'a', kind: 'dia' }])).toBe(1);
    expect(pushNotifications([{ id: 'a', kind: 'dia' }])).toBe(0);
    expect(pushNotifications([])).toBe(0);
  });
});

describe('marcos que só aparecem depois de alguns dias', () => {
  beforeEach(() => {
    resetAt('2026-09-02T17:30:00');
    state.pets.xpProcessedUntil = ONTEM;
  });

  /** Fecha um dia passado com `n` estudos marcados, sem passar pelo closeDay. */
  function diaFechado(dia: string, n: number) {
    const estudos = blocksForDay(dia).filter((b) => b.type === 'estudo').slice(0, n);
    state.checks[dia] = Object.fromEntries(estudos.map((b) => [b.time, { pet: null, bonus: 0 }]));
    state.closedDays[dia] = true;
  }

  it('o terceiro dia seguido na meta vira um marco, com o bônus de moedas escrito', () => {
    diaFechado('2026-08-31', 3); // segunda, 75 min
    diaFechado('2026-09-01', 3); // terça
    marcar(3); // quarta, hoje
    closeDay();
    const seq = notifications().find((n) => n.kind === 'sequencia');
    expect(seq).toBeDefined();
    expect(seq!.id).toBe('sequencia:2026-09-02:3');
    expect(seq!.data).toMatchObject({ n: 3, coins: 8 });
  });

  it('dois dias seguidos ainda não são marco', () => {
    diaFechado('2026-09-01', 3);
    marcar(3);
    closeDay();
    expect(notifications().some((n) => n.kind === 'sequencia')).toBe(false);
  });

  it('bater o próprio melhor dia vira recorde — mas o primeiro dia fechado não', () => {
    diaFechado('2026-09-01', 1); // 50 XP
    marcar(3); // 150 XP hoje
    closeDay();
    const rec = notifications().find((n) => n.kind === 'recorde-dia');
    expect(rec).toBeDefined();
    expect(rec!.data).toMatchObject({ xp: 150 });
  });

  it('o primeiro dia fechado da vida não é "melhor dia até agora"', () => {
    marcar(3);
    closeDay();
    expect(notifications().some((n) => n.kind === 'recorde-dia')).toBe(false);
  });

  it('o saldo cruzar o preço do pet mais barato avisa uma vez; no dia seguinte, não de novo', () => {
    marcar(6); // 150 min = 150 moedas, o preço do pet mais barato
    closeDay();
    expect(notifications().some((n) => n.kind === 'moedas')).toBe(true);

    // Dia seguinte, mais moedas: já dava pra comprar ontem, então nada de lembrete diário.
    clearNotifications();
    vi.setSystemTime(new Date('2026-09-03T17:30:00'));
    rebuildWeeks(new Date('2026-09-03T17:30:00'));
    const amanha = '2026-09-03';
    const estudos = blocksForDay(amanha).filter((b) => b.type === 'estudo').slice(0, 3);
    for (const b of estudos) toggleBlockCheck(amanha, b);
    closeDay(new Date('2026-09-03T17:30:00'));
    expect(notifications().some((n) => n.kind === 'moedas')).toBe(false);
  });
});

describe('a virada da meia-noite com o app ABERTO', () => {
  beforeEach(() => {
    resetAt('2026-09-02T22:00:00');
    state.pets.owned = [gato()];
    state.pets.active = 'cat';
    state.pets.xpProcessedUntil = ONTEM;
  });

  it('o dia entra na conta sozinho: o pet é creditado e a linha aparece, sem recarregar', () => {
    marcar(1); // hoje, sem encerrar o dia
    startDayRollover(new Date('2026-09-02T22:00:00'));
    expect(notifications()).toEqual([]);
    expect(state.pets.owned[0]!.xp).toBe(0); // hoje ainda não entrou

    // Duas horas depois já é dia 3, e o timeout da virada dispara.
    vi.setSystemTime(new Date('2026-09-03T00:00:05'));
    rebuildWeeks(new Date('2026-09-03T00:00:05'));
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 6000);

    expect(state.pets.owned[0]!.xp).toBe(50);
    expect(notifications().map((n) => n.id)).toEqual(['dia:2026-09-02', 'pet-nivel:cat:2']);
    stopDayRollover();
  });

  it('o relógio não virou o dia: nada acontece, e a virada continua agendada', () => {
    marcar(1);
    startDayRollover(new Date('2026-09-02T22:00:00'));
    vi.advanceTimersByTime(60 * 60 * 1000); // uma hora, ainda dia 2
    expect(notifications()).toEqual([]);
    stopDayRollover();
  });

  it('sair da conta desarma a virada', () => {
    startDayRollover(new Date('2026-09-02T22:00:00'));
    stopDayRollover();
    marcar(1);
    vi.setSystemTime(new Date('2026-09-03T00:00:05'));
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    expect(notifications()).toEqual([]);
  });
});
