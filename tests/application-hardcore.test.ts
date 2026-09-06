// Modo hardcore, os casos de uso: entrar num bloco, a sessão que passa a valer
// quando o bloco roda, desistir (custa), parar na pausa e cancelar em espera
// (de graça), a emenda, o fim natural, e a sessão que ficou no dispositivo.
// Sem DOM: guard, extensão e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBlock, toggleBlockCheck } from '../src/application/checks';
import { hardcoreQuitPreview, quitHardcore, resumeHardcoreOnBoot, startHardcore } from '../src/application/hardcore';
import { endHardcoreSession } from '../src/application/hardcoreRuntime';
import { blocksForDay, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { cancelSession } from '../src/application/settings';
import { closeFocus, reconcileTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { isForfeited } from '../src/domain/hardcore';
import { emptyPersistedState } from '../src/domain/persistence';
import { petLevel, petLevelStart } from '../src/domain/pets';
import type { PetInstance, StudyBlock } from '../src/domain/types';
import { readHardcoreSession, useHardcoreStorage, writeHardcoreSession } from '../src/infrastructure/hardcoreSession';
import { unloadGuardArmed } from '../src/infrastructure/unloadGuard';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';
const AGORA = new Date('2026-09-02T10:10:00');
// Plano padrão (09:00, pomo 25 / pausa 5): Estudo 3 é 10:00–10:25, a pausa 10:25–10:30, Estudo 4 10:30–10:55.
const estudo3: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, session: 0 };
const estudo4: StudyBlock = { time: '10:30', endTime: '10:55', name: '📖 Estudo 4', type: 'estudo', xp: 50, session: 0 };

const gato = (xp: number): PetInstance => ({ id: 'cat', species: 'cat', name: 'Mia', xp, path: null, stage: 0, skill: null, skillActivatedAt: 0, adoptedAt: 0 });

/** Ontem fechado com 7 estudos marcados: 350 XP consolidados pro usuário. */
function ontemComXP(): void {
  const blocos = blocksForDay(ONTEM).filter((b) => b.type === 'estudo').slice(0, 7);
  state.checks[ONTEM] = Object.fromEntries(blocos.map((b) => [b.time, { pet: 'cat', bonus: 0 }]));
}

function relogioEm(hms: string): void {
  vi.setSystemTime(new Date(`${HOJE}T${hms}`));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  useHardcoreStorage(null); // Map em memória, zerado
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.config.hardcore = { enabled: true, mode: 'blacklist', sites: ['youtube.com'] };
  state.pets.owned = [gato(petLevelStart(5))]; // no começo do Lv. 5
  state.pets.active = 'cat';
  state.pets.xpProcessedUntil = ONTEM; // nada pendente
  ontemComXP();
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  rebuildWeeks(AGORA);
});

afterEach(() => {
  endHardcoreSession(); // solta o guard e limpa o storage, senão vaza pro próximo teste
  stopTimer();
  vi.useRealTimers();
});

describe('entrar', () => {
  it('abre o foco e, com o bloco rodando, a sessão passa a valer: guardada, guard armado', () => {
    expect(startHardcore(estudo3, AGORA)).toEqual({ ok: true });
    expect(derived.focusOpen).toBe(true);
    expect(derived.timerBlock).toBe(estudo3);
    expect(derived.hardcore).toMatchObject({ time: '10:00', type: 'estudo', pet: 'cat', armed: true });
    expect(unloadGuardArmed()).toBe(true);
    expect(readHardcoreSession('u')).toMatchObject({ dateKey: HOJE, time: '10:00' });
  });

  it('bloco em espera: sessão existe mas não vale ainda; passa a valer quando o relógio chega', () => {
    expect(startHardcore(estudo4, AGORA)).toEqual({ ok: true });
    expect(derived.hardcore?.armed).toBe(false);
    expect(unloadGuardArmed()).toBe(false);
    expect(readHardcoreSession('u')).toBeNull();
    relogioEm('10:30:00');
    expect(derived.hardcore?.armed).toBe(true);
    expect(unloadGuardArmed()).toBe(true);
  });

  it('recusa como o timer normal, e também um bloco abandonado', () => {
    expect(startHardcore({ ...estudo3, time: '09:00', endTime: '09:25' }, AGORA)).toEqual({ ok: false, reason: 'ended' });
    state.penalties = { [HOJE]: [{ time: '10:00', endTime: '10:25', name: 'Estudo 3', xp: 100, pet: 'cat', petXp: 100, at: 0, reason: 'quit' }] };
    expect(startHardcore(estudo3, AGORA)).toEqual({ ok: false, reason: 'forfeited' });
    expect(derived.hardcore).toBeNull();
  });

  it('no hardcore, "Sair do foco" e "Parar" não fazem nada', () => {
    startHardcore(estudo3, AGORA);
    closeFocus();
    expect(derived.focusOpen).toBe(true);
    stopTimer();
    expect(derived.timerBlock).toBe(estudo3);
  });
});

describe('desistir', () => {
  it('custa 2× o XP do bloco pro usuário e pro pet, na hora; o bloco fica abandonado', () => {
    startHardcore(estudo3, AGORA);
    expect(computeStatsNow(AGORA).totalXP).toBe(350);
    const preview = hardcoreQuitPreview(AGORA);
    expect(preview).toMatchObject({ free: false, userXp: 100, petXp: 100, petLevelBefore: 5, petLevelAfter: 4 });

    const cost = quitHardcore(AGORA);
    expect(cost).toEqual(preview);
    expect(computeStatsNow(AGORA).totalXP).toBe(250);
    expect(computeStatsNow(AGORA).penaltyXP).toBe(100);
    expect(computeStatsNow(AGORA).quits).toBe(1);
    expect(state.pets.owned[0]!.xp).toBe(petLevelStart(5) - 100);
    expect(petLevel(state.pets.owned[0]!)).toBe(4); // desceu de nível; a forma não muda
    expect(state.penalties[HOJE]).toEqual([{ time: '10:00', endTime: '10:25', name: 'Estudo 3', xp: 100, pet: 'cat', petXp: 100, at: AGORA.getTime(), reason: 'quit' }]);
    expect(isForfeited(state.penalties, HOJE, '10:00')).toBe(true);

    // Tudo limpo: sem timer, sem foco, sem sessão, sem guard.
    expect(derived.hardcore).toBeNull();
    expect(derived.timerBlock).toBeNull();
    expect(derived.focusOpen).toBe(false);
    expect(unloadGuardArmed()).toBe(false);
    expect(readHardcoreSession('u')).toBeNull();
  });

  it('o bloco abandonado perde o check que tinha e não aceita outro', () => {
    toggleBlockCheck(HOJE, estudo3, AGORA);
    startHardcore(estudo3, AGORA);
    quitHardcore(AGORA);
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(false);
    expect(toggleBlockCheck(HOJE, estudo3, AGORA)).toBeNull();
    expect(checkBlock(HOJE, estudo3, AGORA)).toBeNull();
    expect(state.checks[HOJE]).toBeUndefined();
  });

  it('nunca abaixo de zero: sem XP consolidado, perde 0 (mas o bloco fica abandonado)', () => {
    state.checks = {};
    state.pets.owned[0]!.xp = 30;
    startHardcore(estudo3, AGORA);
    const cost = quitHardcore(AGORA)!;
    expect(cost.userXp).toBe(0);
    expect(cost.petXp).toBe(30);
    expect(state.pets.owned[0]!.xp).toBe(0);
    expect(computeStatsNow(AGORA).totalXP).toBe(0);
    expect(isForfeited(state.penalties, HOJE, '10:00')).toBe(true);
  });

  it('sem pet equipado só o usuário perde', () => {
    state.pets.active = null;
    startHardcore(estudo3, AGORA);
    const cost = quitHardcore(AGORA)!;
    expect(cost.petXp).toBe(0);
    expect(state.penalties[HOJE]![0]).toMatchObject({ pet: null, petXp: 0, xp: 100 });
    expect(state.pets.owned[0]!.xp).toBe(petLevelStart(5));
  });

  it('cancelar em espera é de graça e não deixa registro', () => {
    startHardcore(estudo4, AGORA);
    const cost = quitHardcore(AGORA)!;
    expect(cost.free).toBe(true);
    expect(state.penalties).toEqual({});
    expect(computeStatsNow(AGORA).totalXP).toBe(350);
    expect(derived.timerBlock).toBeNull();
  });
});

describe('a sequência', () => {
  it('emenda estudo → pausa → estudo: a pausa não bloqueia nem prende; o estudo seguinte prende de novo', () => {
    startHardcore(estudo3, AGORA);
    relogioEm('10:24:59'); // 10:25:00 — fim do Estudo 3
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(derived.hardcore).toMatchObject({ time: '10:25', type: 'pausa', armed: true });
    expect(unloadGuardArmed()).toBe(false);
    expect(readHardcoreSession('u')).toMatchObject({ time: '10:25' });

    // Parar na pausa é de graça.
    const preview = hardcoreQuitPreview();
    expect(preview?.free).toBe(true);

    relogioEm('10:29:59'); // 10:30:00 — fim da pausa
    expect(derived.hardcore).toMatchObject({ time: '10:30', type: 'estudo', armed: true });
    expect(unloadGuardArmed()).toBe(true);
    expect(state.penalties).toEqual({});
  });

  it('parar na pausa: sem custo, sem registro, timer some', () => {
    startHardcore(estudo3, AGORA);
    relogioEm('10:24:59');
    const cost = quitHardcore(new Date(`${HOJE}T10:26:00`))!;
    expect(cost.free).toBe(true);
    expect(state.penalties).toEqual({});
    expect(derived.timerBlock).toBeNull();
    expect(derived.hardcore).toBeNull();
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true); // o estudo concluído fica
  });

  it('o fim natural da sequência limpa tudo sem cobrar', () => {
    const dia = blocksForDay(HOJE);
    const ultimo = dia[dia.length - 1]!;
    vi.setSystemTime(new Date(`${HOJE}T${ultimo.time}:30`));
    startHardcore(ultimo);
    expect(derived.hardcore?.armed).toBe(true);
    relogioEm(`${ultimo.endTime}:00`);
    expect(isChecked(state.checks, HOJE, ultimo.time)).toBe(true);
    expect(derived.hardcore).toBeNull();
    expect(derived.focusOpen).toBe(false);
    expect(unloadGuardArmed()).toBe(false);
    expect(readHardcoreSession('u')).toBeNull();
    expect(state.penalties).toEqual({});
  });

  it('voltar pra aba com o bloco terminado (reconcile) segue o mesmo caminho', () => {
    startHardcore(estudo3, AGORA);
    const volta = new Date(`${HOJE}T10:31:00`);
    vi.setSystemTime(volta);
    reconcileTimer(volta);
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(isChecked(state.checks, HOJE, '10:25')).toBe(true);
    expect(derived.hardcore).toMatchObject({ time: '10:30', type: 'estudo', armed: true });
  });
});

describe('a sessão que ficou no dispositivo', () => {
  it('sem nada guardado: nada acontece', () => {
    expect(resumeHardcoreOnBoot(AGORA)).toBe('none');
    expect(derived.timerBlock).toBeNull();
  });

  it('o bloco ainda roda: o foco volta em hardcore (recarregar não é sair)', () => {
    startHardcore(estudo3, AGORA);
    // "Recarrega": o runtime some, o storage fica.
    derived.hardcore = null;
    derived.timerBlock = null;
    derived.focusOpen = false;
    const depois = new Date(`${HOJE}T10:15:00`);
    expect(resumeHardcoreOnBoot(depois)).toBe('resumed');
    expect(derived.focusOpen).toBe(true);
    expect(derived.timerBlock).toMatchObject({ time: '10:00', endTime: '10:25' });
    expect(derived.hardcore).toMatchObject({ time: '10:00', armed: true, pet: 'cat' });
    expect(state.penalties).toEqual({});
  });

  it('o bloco acabou sem o app: abandono — a mesma conta, cobrada agora, uma vez só', () => {
    startHardcore(estudo3, AGORA);
    derived.hardcore = null;
    derived.timerBlock = null;
    const depois = new Date(`${HOJE}T10:40:00`);
    expect(resumeHardcoreOnBoot(depois)).toBe('abandoned');
    expect(state.penalties[HOJE]).toEqual([{ time: '10:00', endTime: '10:25', name: 'Estudo 3', xp: 100, pet: 'cat', petXp: 100, at: depois.getTime(), reason: 'abandon' }]);
    expect(computeStatsNow(depois).totalXP).toBe(250);
    expect(state.pets.owned[0]!.xp).toBe(petLevelStart(5) - 100);
    expect(readHardcoreSession('u')).toBeNull();
    expect(derived.timerBlock).toBeNull();
    // De novo (outro boot): nada guardado, nada cobrado.
    expect(resumeHardcoreOnBoot(depois)).toBe('none');
    expect(state.penalties[HOJE]).toHaveLength(1);
  });

  it('abandono cobra o pet que estava equipado na hora, não o de agora', () => {
    state.pets.owned.push({ ...gato(200), id: 'dog', species: 'dog', name: 'Bolt' });
    startHardcore(estudo3, AGORA); // com o gato
    derived.hardcore = null;
    derived.timerBlock = null;
    state.pets.active = 'dog';
    resumeHardcoreOnBoot(new Date(`${HOJE}T10:40:00`));
    expect(state.pets.owned[0]!.xp).toBe(petLevelStart(5) - 100);
    expect(state.pets.owned[1]!.xp).toBe(200);
  });

  it('pausa que acabou é só esquecida; sessão corrompida também', () => {
    writeHardcoreSession('u', { dateKey: HOJE, time: '10:25', endTime: '10:30', type: 'pausa', name: '🧘 Pausa', xp: 5, pet: 'cat', startedAt: 0 });
    expect(resumeHardcoreOnBoot(new Date(`${HOJE}T10:40:00`))).toBe('expired');
    expect(state.penalties).toEqual({});
    writeHardcoreSession('u', { lixo: true });
    expect(resumeHardcoreOnBoot(AGORA)).toBe('none');
  });

  it('a sessão é por usuário', () => {
    startHardcore(estudo3, AGORA);
    endHardcoreSession();
    expect(readHardcoreSession('u')).toBeNull();
    expect(readHardcoreSession('outro')).toBeNull();
  });
});

describe('cancelar sessão', () => {
  it('zera as desistências junto com o resto', () => {
    startHardcore(estudo3, AGORA);
    quitHardcore(AGORA);
    expect(state.penalties[HOJE]).toHaveLength(1);
    cancelSession();
    expect(state.penalties).toEqual({});
    expect(state.config.hardcore.enabled).toBe(false);
  });
});
