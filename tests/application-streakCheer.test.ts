// O parabéns pela sequência, ligado ao check (src/application/streakCheer.ts + checks.ts).
//
// O que precisa ser provado: ele nasce no check que bate a meta do dia, por qualquer das
// portas de marcar; sai UMA vez por aumento; e não nasce de quem mexe no número sem ter
// estudado agora.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBlock, toggleBlockCheck } from '../src/application/checks';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { cheerStreakIfGrew, dismissStreakCheer, streakNow } from '../src/application/streakCheer';
import { emptyPersistedState, hydrateUserDoc, serializeState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const SEG = '2026-08-31';
const TER = '2026-09-01';
const HOJE = '2026-09-02'; // quarta

function resetAt(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.weeks = [];
  derived.streakCheer = null;
  derived.onboardingOpen = false;
  derived.timerBlock = null;
  clearBlockCache();
  rebuildWeeks(new Date(iso));
}

const estudos = (dia: string): StudyBlock[] => blocksForDay(dia).filter((b) => b.type === 'estudo');
/** Marca os `n` primeiros estudos do dia (25 min cada; a meta padrão é 60). */
const marcar = (dia: string, n: number): void => estudos(dia).slice(0, n).forEach((b) => toggleBlockCheck(dia, b));

describe('o parabéns pela sequência', () => {
  beforeEach(() => resetAt('2026-09-02T17:30:00'));

  it('nasce no check que bate a meta — não antes', () => {
    marcar(HOJE, 2); // 50 min: ainda não
    expect(derived.streakCheer).toBeNull();
    expect(state.streakCheered).toBeNull();
    toggleBlockCheck(HOJE, estudos(HOJE)[2]!); // 75 min
    expect(derived.streakCheer).toMatchObject({ n: 1, record: false });
    expect(state.streakCheered).toEqual({ day: HOJE, n: 1 });
  });

  it('conta os dias anteriores: segunda e terça feitas, quarta bate a meta → 3 dias', () => {
    marcar(SEG, 3);
    marcar(TER, 3);
    // Completar dias passados com hoje ainda sem meta não mexe na sequência (ela só existe a partir de hoje).
    expect(derived.streakCheer).toBeNull();
    marcar(HOJE, 3);
    expect(derived.streakCheer).toMatchObject({ n: 3, milestone: true });
    expect(streakNow()).toBe(3);
  });

  it('uma vez por aumento: desmarcar e remarcar o bloco que bateu a meta não repete', () => {
    marcar(HOJE, 3);
    dismissStreakCheer();
    const ultimo = estudos(HOJE)[2]!;
    toggleBlockCheck(HOJE, ultimo); // desmarca: a sequência volta a 0
    expect(streakNow()).toBe(0);
    toggleBlockCheck(HOJE, ultimo); // remarca: volta a 1, que já foi comemorado
    expect(streakNow()).toBe(1);
    expect(derived.streakCheer).toBeNull();
  });

  it('mais um estudo num dia que já bateu a meta não é aumento', () => {
    marcar(HOJE, 3);
    dismissStreakCheer();
    toggleBlockCheck(HOJE, estudos(HOJE)[3]!);
    expect(derived.streakCheer).toBeNull();
  });

  it('emendar duas sequências à noite (o bloco de ontem que faltava) comemora o número novo', () => {
    marcar(SEG, 3);
    marcar(HOJE, 3);
    expect(derived.streakCheer).toMatchObject({ n: 1 });
    dismissStreakCheer();
    marcar(TER, 3); // terça fecha o buraco: segunda–terça–quarta
    expect(derived.streakCheer).toMatchObject({ n: 3 });
    expect(state.streakCheered).toEqual({ day: HOJE, n: 3 });
  });

  it('o fim do bloco no foco (`checkBlock`) é a mesma porta', () => {
    marcar(HOJE, 2);
    checkBlock(HOJE, estudos(HOJE)[2]!);
    expect(derived.streakCheer).toMatchObject({ n: 1 });
  });

  it('quem mexe no número sem estudar não ganha parabéns: baixar a meta diária', () => {
    marcar(HOJE, 1); // 25 min, meta de 60
    state.config.dailyStudyMin = 15; // agora hoje "bate a meta" — por configuração
    clearBlockCache();
    expect(derived.streakCheer).toBeNull();
    expect(state.streakCheered).toBeNull();
  });

  it('`cheerStreakIfGrew` sozinho: sem crescimento, nem estado nem marca mudam', () => {
    marcar(HOJE, 3);
    const marca = state.streakCheered;
    dismissStreakCheer();
    cheerStreakIfGrew(streakNow());
    expect(derived.streakCheer).toBeNull();
    expect(state.streakCheered).toBe(marca);
  });

  it('fechar tira da tela e não apaga a marca', () => {
    marcar(HOJE, 3);
    dismissStreakCheer();
    expect(derived.streakCheer).toBeNull();
    expect(state.streakCheered).toEqual({ day: HOJE, n: 1 });
  });

  it('a marca viaja no documento — é o que impede o repeteco em outro aparelho', () => {
    marcar(HOJE, 3);
    const doc = serializeState(state);
    expect(doc.streakCheered).toEqual({ day: HOJE, n: 1 });
    expect(hydrateUserDoc(JSON.parse(JSON.stringify(doc))).streakCheered).toEqual({ day: HOJE, n: 1 });
  });

  it('apagar o histórico zera a marca e tira o pop-up da tela', () => {
    marcar(HOJE, 3);
    cancelSession();
    expect(state.streakCheered).toBeNull();
    expect(derived.streakCheer).toBeNull();
  });
});
