// "▶ Voltar" com uma corrida ainda aberta (src/application/live.ts, `startLive`): a
// janela da corrida cobre o minuto de agora mas nada roda — o timer morreu num reload
// (ele é runtime) ou parou pelo ✕ da barra. Antes, `startLive` DESCARTAVA essa janela
// inteira, com os blocos marcados dentro dela: o XP do dia caía em silêncio (medido no
// app: +148 → +93). Agora ela é aparada em agora, e o cartão nem aparece enquanto a
// corrida cobre o minuto atual (`liveRunOpen`) — a porta certa é o "▶ Iniciar" da linha.
// Sem DOM: toast, Wake Lock e localStorage caem nos fallbacks em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setDayMode } from '../src/application/dayWindows';
import { liveRunOpen, startLive } from '../src/application/live';
import { blocksForDay, clearBlockCache, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { startTimer, stopTimer } from '../src/application/timer';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
function relogioEm(hms: string): void {
  vi.setSystemTime(em(hms));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(em('09:12:00'));
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerDay = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  clearBlockCache();
  rebuildWeeks(em('09:12:00'));
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

/** Uma corrida de dois blocos marcados e um terceiro rodando — e aí o timer some. */
function corridaAbertaAs(hms: string): void {
  setDayMode(HOJE, 'live', em('09:12:00'));
  const r = startLive(HOJE, em('09:12:00'));
  if (!r.ok) throw new Error('não começou');
  startTimer(r.block, em('09:12:00'));
  relogioEm('09:37:00'); // estudo 1 marcado; a pausa 09:37–09:42 emenda
  relogioEm('09:42:00'); // pausa marcada; estudo 2 09:42–10:07 rodando
  vi.setSystemTime(em(hms));
  stopTimer(); // o reload (o timer é runtime) — ou o ✕ da barra
}

describe('"▶ Voltar" com uma corrida ainda aberta', () => {
  it('apara a corrida em agora em vez de apagá-la: os blocos marcados ficam, com o XP', () => {
    corridaAbertaAs('09:50:00');
    const antes = computeStatsNow(em('09:50:00')).todayXP;
    expect(antes).toBeGreaterThanOrEqual(55); // estudo 1 (50) + pausa (5)

    const v = startLive(HOJE, em('09:50:00'));
    expect(v.ok && v.block).toMatchObject({ time: '09:50', endTime: '10:15', type: 'estudo' });
    expect(state.windowOverrides[HOJE]!.studyWindows.map((w) => `${w.start}–${w.end}`)).toEqual(['09:12–09:50', '09:50–10:15']);

    const dia = blocksForDay(HOJE);
    expect(isChecked(state.checks, HOJE, '09:12')).toBe(true);
    expect(dia.map((b) => `${b.time}–${b.endTime}`)).toEqual(['09:12–09:37', '09:37–09:42', '09:42–09:50', '09:50–10:15']);
    expect(computeStatsNow(em('09:50:00')).todayXP).toBe(antes);
  });

  it('uma corrida que já acabou fica inteira, como sempre', () => {
    corridaAbertaAs('10:20:00'); // o estudo 2 acabaria às 10:07: a janela toda já passou
    startLive(HOJE, em('10:20:00'));
    expect(state.windowOverrides[HOJE]!.studyWindows.map((w) => `${w.start}–${w.end}`)).toEqual(['09:12–10:07', '10:20–10:45']);
  });
});

describe('liveRunOpen — o cartão Começar some enquanto uma corrida cobre agora', () => {
  it('é verdadeiro dentro da corrida aberta e falso depois dela (e num dia sem corrida)', () => {
    expect(liveRunOpen(HOJE, em('09:12:00'))).toBe(false);
    corridaAbertaAs('09:50:00');
    expect(liveRunOpen(HOJE, em('09:50:00'))).toBe(true); // a janela vai até 10:07
    expect(liveRunOpen(HOJE, em('10:07:00'))).toBe(false); // o fim é exclusivo: às 10:07 a corrida acabou
    expect(liveRunOpen(HOJE, em('10:20:00'))).toBe(false);
  });
});

// Parar no PRIMEIRO minuto da primeira corrida (a folha diz "Nada a registrar"): a corrida
// recém-aberta tem que sumir. Antes ela ficava — 25 minutos inteiros no plano, sem check,
// com "▶ Iniciar" na linha — e a faixa se escondia atrás dela (a janela ainda cobre agora).
describe('"Parar por aqui" no primeiro minuto de uma corrida', () => {
  it('desfaz a corrida recém-aberta: o dia volta a "não começou"', async () => {
    const { stopHere } = await import('../src/application/pause');
    setDayMode(HOJE, 'live', em('09:12:00'));
    const r = startLive(HOJE, em('09:12:00'));
    if (!r.ok) throw new Error('não começou');
    startTimer(r.block, em('09:12:00'));
    vi.setSystemTime(em('09:12:20'));
    expect(stopHere(em('09:12:20'))).toEqual({ ok: false, reason: 'nothing-lived' });
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    expect(blocksForDay(HOJE).filter((b) => b.type === 'estudo')).toHaveLength(0);
    expect(derived.timerBlock).toBeNull();
    expect(liveRunOpen(HOJE, em('09:12:20'))).toBe(false); // a faixa volta a aparecer, com "Começar"
  });

  it('com corridas anteriores, só a recém-aberta some', async () => {
    const { stopHere } = await import('../src/application/pause');
    corridaAbertaAs('10:20:00'); // 09:12–10:07, dois blocos ✓
    const v = startLive(HOJE, em('10:20:00'));
    if (!v.ok) throw new Error('não voltou');
    startTimer(v.block, em('10:20:00'));
    vi.setSystemTime(em('10:20:30'));
    expect(stopHere(em('10:20:30')).ok).toBe(true); // a corrida anterior é "vivida": o corte é ok, e apara a nova em zero
    expect(state.windowOverrides[HOJE]!.studyWindows.map((w) => `${w.start}–${w.end}`)).toEqual(['09:12–10:07']);
    expect(isChecked(state.checks, HOJE, '09:12')).toBe(true);
  });
});
