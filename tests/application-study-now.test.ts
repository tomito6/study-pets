// "▶ Estudar agora" (src/application/live.ts, `canStudyNow` + `startLive` com `fromRoutine`)
// e a volta pela rotina depois de "■ Parar por aqui" (`canResumeRoutine`).
//
// O estado que não tinha porta (2026-11-26): hoje pela rotina, e nada no plano que dê pra
// iniciar. Quem cria a conta às 21h nascia aí; quem parava pra almoçar caía aí.
// Sem DOM: toast, Wake Lock e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import { canResumeRoutine, clearDayWindows, setDayMode, setDayOff } from '../src/application/dayWindows';
import { closeDay } from '../src/application/dayEnd';
import { canStudyNow, previewLive, startLive } from '../src/application/live';
import { finishOnboarding, starterMeal } from '../src/application/onboarding';
import { stopHere } from '../src/application/pause';
import { blocksForDay, clearBlockCache, dayModeOf, rebuildWeeks } from '../src/application/plan';
import { startTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import type { StudyBlock } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02'; // quarta
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
const NOITE = em('21:10:00');

function zera(agora: Date) {
  vi.setSystemTime(agora);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  clearBlockCache();
  rebuildWeeks(agora);
}

const linha = (b: StudyBlock) => `${b.time}–${b.endTime} ${b.type}`;
const bloco = (time: string) => blocksForDay(HOJE).find((b) => b.time === time)!;

/** Um estudo de rotina começado às 10:00 e cortado às 10:12 pelo "■ Parar por aqui". */
function paraAs1012() {
  vi.setSystemTime(em('10:00:00'));
  startTimer(bloco('10:00'), em('10:00:00'));
  vi.setSystemTime(em('10:12:00'));
  expect(stopHere(em('10:12:00')).ok).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  zera(NOITE);
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('canStudyNow — quando a porta aparece', () => {
  it('o plano do dia já passou: aparece', () => {
    expect(blocksForDay(HOJE).length).toBeGreaterThan(0);
    expect(canStudyNow(HOJE, NOITE)).toBe(true);
  });

  it('ainda há bloco por começar ou em andamento: a porta é a linha dele', () => {
    expect(canStudyNow(HOJE, em('08:30:00'))).toBe(false);
    expect(canStudyNow(HOJE, em('10:05:00'))).toBe(false);
    expect(canStudyNow(HOJE, em('17:50:00'))).toBe(false); // o último estudo ainda roda
  });

  it('não é de hoje, dia já ao vivo, folga, dia encerrado ou timer rodando: não aparece', () => {
    expect(canStudyNow('2026-09-01', NOITE)).toBe(false);
    expect(canStudyNow('2026-09-03', NOITE)).toBe(false);

    setDayMode(HOJE, 'live', NOITE);
    expect(canStudyNow(HOJE, NOITE)).toBe(false); // lá a porta é o "▶ Começar"

    zera(NOITE);
    expect(setDayOff(HOJE, NOITE).ok).toBe(true);
    expect(canStudyNow(HOJE, NOITE)).toBe(false);

    zera(NOITE);
    toggleBlockCheck(HOJE, bloco('09:00'), NOITE);
    closeDay(NOITE);
    expect(canStudyNow(HOJE, NOITE)).toBe(false);

    zera(NOITE);
    startTimer(bloco('09:00'), NOITE); // qualquer bloco no timer: a porta é o próprio timer
    expect(derived.timerBlock).not.toBeNull();
    expect(canStudyNow(HOJE, NOITE)).toBe(false);
  });
});

describe('startLive com fromRoutine — "▶ Estudar agora"', () => {
  it('sem a opção, um dia de rotina continua recusando', () => {
    expect(startLive(HOJE, NOITE)).toEqual({ ok: false, reason: 'not-live' });
    expect(previewLive(HOJE, NOITE)).toEqual({ ok: false, reason: 'not-live' });
  });

  it('com a opção, mas com bloco ainda por começar: recusa — a porta é a linha', () => {
    expect(startLive(HOJE, em('10:05:00'), { fromRoutine: true })).toEqual({ ok: false, reason: 'not-live' });
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(state.dayModes[HOJE]).toBeUndefined();
  });

  it('abre um pomodoro agora, o dia vira ao vivo, e o que passou fica INTEIRO', () => {
    const antes = blocksForDay(HOJE).map(linha);
    const r = startLive(HOJE, NOITE, { fromRoutine: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.block.type).toBe('estudo');
    expect(`${r.block.time}–${r.block.endTime}`).toBe('21:10–21:35');
    expect(dayModeOf(HOJE)).toBe('live');

    const depois = blocksForDay(HOJE).map(linha);
    // Tudo que a rotina tinha continua lá, na mesma ordem e com os mesmos horários…
    expect(depois.slice(0, antes.length)).toEqual(antes);
    // …e a única linha nova é o pomodoro de agora.
    expect(depois.slice(antes.length)).toEqual(['21:10–21:35 estudo']);
  });

  it('a manhã que não foi marcada ainda aceita check depois — quem estudou longe marca à noite', () => {
    const r = startLive(HOJE, NOITE, { fromRoutine: true });
    expect(r.ok).toBe(true);
    stopTimer();
    toggleBlockCheck(HOJE, bloco('09:00'), em('21:11:00'));
    expect(isChecked(state.checks, HOJE, '09:00')).toBe(true);
  });

  it('a prévia diz o mesmo bloco sem escrever nada', () => {
    const p = previewLive(HOJE, NOITE, { fromRoutine: true });
    expect(p.ok).toBe(true);
    if (p.ok) expect(`${p.block.time}–${p.block.endTime}`).toBe('21:10–21:35');
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(state.dayModes[HOJE]).toBeUndefined();
    expect(dayModeOf(HOJE)).not.toBe('live');
  });

  it('sem espaço (um compromisso cravado em agora): recusa e o dia volta a ser o que era', () => {
    state.events[HOJE] = [{ name: 'Jantar', start: '21:10', end: '22:00', countsAsStudy: false }];
    clearBlockCache();
    const antes = blocksForDay(HOJE).map(linha);
    expect(startLive(HOJE, NOITE, { fromRoutine: true })).toEqual({ ok: false, reason: 'no-room' });
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(state.dayModes[HOJE]).toBeUndefined();
    expect(blocksForDay(HOJE).map(linha)).toEqual(antes);
  });
});

describe('depois de "■ Parar por aqui" num dia de rotina', () => {
  beforeEach(() => {
    zera(em('09:00:00'));
    paraAs1012();
  });

  it('as duas voltas existem: estudar agora, e remontar o resto pela rotina', () => {
    const agora = em('10:20:00');
    expect(canStudyNow(HOJE, agora)).toBe(true);
    expect(canResumeRoutine(HOJE, agora)).toBe(true);
  });

  it('estudar agora: o bloco parcial fica do tamanho que foi, e nasce um pomodoro em agora', () => {
    const agora = em('10:20:00');
    const r = startLive(HOJE, agora, { fromRoutine: true });
    expect(r.ok).toBe(true);
    const dia = blocksForDay(HOJE).filter((b) => b.type === 'estudo').map(linha);
    expect(dia).toContain('10:00–10:12 estudo');
    expect(dia).toContain('10:20–10:45 estudo');
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true); // o parcial saiu marcado
  });

  it('remontar pela rotina devolve estudos de agora em diante — e aí as duas portas somem', () => {
    const agora = em('10:20:00');
    vi.setSystemTime(agora);
    expect(clearDayWindows(HOJE, agora).ok).toBe(true);
    const futuros = blocksForDay(HOJE).filter((b) => b.type === 'estudo' && b.time >= '10:20');
    expect(futuros.length).toBeGreaterThan(5);
    expect(blocksForDay(HOJE).filter((b) => b.type === 'estudo').map(linha)).toContain('10:00–10:12 estudo');
    expect(canStudyNow(HOJE, agora)).toBe(false); // a porta volta a ser a linha do bloco
    expect(canResumeRoutine(HOJE, em('10:21:00'))).toBe(true); // ainda é um dia cortado com rotina pela frente
  });

  it('a volta pela rotina não é oferecida quando ela não devolveria nenhum estudo', () => {
    expect(canResumeRoutine(HOJE, em('17:58:00'))).toBe(false);
    expect(canResumeRoutine(HOJE, em('21:00:00'))).toBe(false);
    expect(canStudyNow(HOJE, em('21:00:00'))).toBe(true); // estudar agora continua valendo
  });
});

describe('canResumeRoutine — fora do dia cortado', () => {
  it('dia de rotina sem corrida nenhuma, dia ao vivo e outro dia: não', () => {
    expect(canResumeRoutine(HOJE, NOITE)).toBe(false);
    expect(canResumeRoutine(HOJE, em('10:00:00'))).toBe(false);
    setDayMode(HOJE, 'live', em('10:00:00'));
    expect(canResumeRoutine(HOJE, em('10:00:00'))).toBe(false);
    expect(canResumeRoutine('2026-09-03', em('10:00:00'))).toBe(false);
  });
});

describe('starterMeal — a refeição com que a conta nasce', () => {
  it('conta nova: 13:00–14:00, e é a mesma que o onboarding grava', () => {
    const m = starterMeal();
    expect(m && `${m.start}–${m.end}`).toBe('13:00–14:00');
    const r = finishOnboarding(
      { studyWindows: [{ start: '09:00', end: '18:00' }], skipWeekends: false, starter: { species: 'dog', name: 'Bolt' }, avatar: null, ageConfirmed: true },
      em('08:00:00'),
    );
    expect(r.ok).toBe(true);
    expect(state.eventSeries.map((s) => `${s.id} ${s.start}–${s.end}`)).toEqual(['ser_almoco 13:00–14:00']);
    // Com pet e com a série, não há refeição nova — nem outra série empilhada.
    expect(starterMeal()).toBeNull();
  });
});
