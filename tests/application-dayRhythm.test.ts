// O ritmo do pomodoro SÓ de um dia (application/dayWindows.ts): o modal "🕘 Estrutura do
// dia" muda o dia dele, e a rotina (Configurações) muda todos os que não têm ritmo próprio.
// Duas coisas diferentes. Sem DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleBlockCheck } from '../src/application/checks';
import {
  clearDayWindows,
  dayEdited,
  dayRhythmEdited,
  dayRhythmNow,
  previewDayPlan,
  routineRhythmOf,
  saveDayStructure,
  setDayMode,
  setDayRhythm,
} from '../src/application/dayWindows';
import { startLive } from '../src/application/live';
import { stopHere } from '../src/application/pause';
import { blocksForDay, clearBlockCache, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { cancelSession, saveSettings } from '../src/application/settings';
import { reconcileTimer, startTimer, stopTimer } from '../src/application/timer';
import { weekPreview } from '../src/application/weekPreview';
import { emptyPersistedState, hydrateUserDoc, serializeState } from '../src/domain/persistence';
import { defaultDraft } from '../src/domain/settings';
import type { StudyBlock } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02'; // quarta
const ONTEM = '2026-09-01';
const AMANHA = '2026-09-03';
const em = (hm: string) => new Date(`${HOJE}T${hm}:00`);
const AGORA = em('14:03');
const R25 = { pomo: 25, shortBreak: 5, longBreak: 20 };
const R50 = { pomo: 50, shortBreak: 10, longBreak: 20 };
const ROTINA = [{ start: '09:00', end: '18:00' }];
const estudos = (dia: string) => blocksForDay(dia).filter((b) => b.type === 'estudo');
const marcar = (dia: string, time: string, quando: Date) => {
  const b = blocksForDay(dia).find((x) => x.time === time)!;
  expect(toggleBlockCheck(dia, b, quando), `o check das ${time} não entrou`).not.toBeNull();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.config.periodStart = '2026-08-01';
  derived.timerBlock = null;
  derived.timerDay = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.hardcore = null;
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});
afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('o ritmo de um dia que ainda não começou vale o dia inteiro', () => {
  it('amanhã em 50 · 10: só amanhã muda — hoje, depois de amanhã e a rotina ficam como estavam', () => {
    expect(setDayRhythm(AMANHA, R50, AGORA)).toEqual({ ok: true, windows: false, rhythm: 'whole-day' });
    expect(estudos(AMANHA)[0]).toMatchObject({ time: '09:00', endTime: '09:50' });
    expect(estudos(HOJE)[0]).toMatchObject({ endTime: '09:25' });
    expect(estudos('2026-09-04')[0]).toMatchObject({ endTime: '09:25' });
    expect(state.config).toMatchObject(R25);
    expect(state.dayRhythms).toEqual({ [AMANHA]: [R50] });
    // Mexer só no ritmo não prende o dia às janelas de hoje da rotina.
    expect(state.windowOverrides).toEqual({});
    expect(dayRhythmNow(AMANHA)).toEqual(R50);
    expect(routineRhythmOf(AMANHA)).toEqual(R25);
    expect(dayRhythmEdited(AMANHA)).toBe(true);
    expect(dayEdited(AMANHA)).toBe(true);
    expect(dayEdited(HOJE)).toBe(false);
  });

  it('hoje sem nada vivido também muda inteiro', () => {
    expect(setDayRhythm(HOJE, R50, AGORA)).toMatchObject({ ok: true, rhythm: 'whole-day' });
    expect(estudos(HOJE)[0]).toMatchObject({ time: '09:00', endTime: '09:50' });
  });

  it('digitar de volta o ritmo da rotina desfaz o ritmo próprio', () => {
    setDayRhythm(AMANHA, R50, AGORA);
    expect(setDayRhythm(AMANHA, R25, AGORA)).toMatchObject({ ok: true, rhythm: 'whole-day' });
    expect(state.dayRhythms).toEqual({});
    expect(dayEdited(AMANHA)).toBe(false);
  });

  it('o mesmo ritmo de novo não escreve nada', () => {
    expect(setDayRhythm(AMANHA, R25, AGORA)).toEqual({ ok: true, windows: false, rhythm: 'unchanged' });
    expect(state.dayRhythms).toEqual({});
  });

  it('recusa: dia passado, dia encerrado e ritmo inválido — sem mudar nada', () => {
    expect(setDayRhythm(ONTEM, R50, AGORA)).toEqual({ ok: false, reason: 'past' });
    expect(setDayRhythm(AMANHA, { pomo: 0, shortBreak: 5, longBreak: 20 }, AGORA)).toEqual({ ok: false, reason: 'invalid-rhythm' });
    expect(setDayRhythm(AMANHA, { pomo: 25.5, shortBreak: 5, longBreak: 20 }, AGORA)).toEqual({ ok: false, reason: 'invalid-rhythm' });
    state.closedDays[HOJE] = true;
    expect(setDayRhythm(HOJE, R50, AGORA)).toEqual({ ok: false, reason: 'closed' });
    expect(state.dayRhythms).toEqual({});
  });

  it('janelas e ritmo no mesmo Salvar; janela inválida recusa os dois', () => {
    const r = saveDayStructure(AMANHA, { windows: [{ start: '10:00', end: '14:00' }], rhythm: R50 }, AGORA);
    expect(r).toEqual({ ok: true, windows: true, rhythm: 'whole-day' });
    expect(estudos(AMANHA)[0]).toMatchObject({ time: '10:00', endTime: '10:50' });
    const ruim = saveDayStructure('2026-09-04', { windows: [{ start: '12:00', end: '10:00' }], rhythm: R50 }, AGORA);
    expect(ruim).toEqual({ ok: false, reason: 'invalid-window' });
    expect(state.dayRhythms['2026-09-04']).toBeUndefined();
    // Nada mudou → nada é escrito (salvar sem mexer não marca o dia como editado).
    expect(saveDayStructure('2026-09-04', { windows: ROTINA, rhythm: R25 }, AGORA)).toEqual({ ok: true, windows: false, rhythm: 'unchanged' });
    expect(state.windowOverrides['2026-09-04']).toBeUndefined();
  });
});

describe('hoje com algo já vivido: o ritmo novo vale do próximo bloco em diante', () => {
  beforeEach(() => {
    marcar(HOJE, '09:00', em('09:30'));
    marcar(HOJE, '09:30', em('10:00'));
  });

  it('a manhã fica idêntica (checks e XP no lugar) e a tarde nasce no ritmo novo', () => {
    const antes = blocksForDay(HOJE);
    const xpAntes = computeStatsNow(AGORA).todayXP;
    expect(xpAntes).toBe(100);
    // 14:03: sem refeição neste dia, o bloco em andamento pelo plano é o Estudo 9 (13:55–14:20).
    const emAndamento = antes.find((b) => b.time <= '14:03' && b.endTime > '14:03')!;
    expect(setDayRhythm(HOJE, R50, AGORA)).toEqual({ ok: true, windows: false, rhythm: 'from-now' });

    const depois = blocksForDay(HOJE);
    expect(depois.filter((b) => b.time < '14:03')).toEqual(antes.filter((b) => b.time < '14:03'));
    expect(depois.find((b) => b.time === emAndamento.time)).toEqual(emAndamento);
    expect(computeStatsNow(AGORA).todayXP).toBe(xpAntes);
    // Depois do bloco em andamento e da pausa dele, pomodoros de 50.
    const novos = depois.filter((b) => b.type === 'estudo' && b.time > emAndamento.time);
    expect(timeDiff(novos[0]!)).toBe(50);
    expect(state.dayRhythms[HOJE]).toEqual([{ ...R50, from: '14:03' }]);
    expect(state.windowOverrides).toEqual({}); // as janelas não foram tocadas
    expect(dayRhythmNow(HOJE)).toEqual(R50);
    expect(state.config).toMatchObject(R25);
    expect(estudos(AMANHA)[0]).toMatchObject({ endTime: '09:25' }); // amanhã segue a rotina
  });

  it('trocar de novo mais tarde guarda a troca anterior — ela é o registro de como o dia foi', () => {
    setDayRhythm(HOJE, R50, AGORA);
    const meio = blocksForDay(HOJE);
    expect(setDayRhythm(HOJE, R25, em('16:10'))).toMatchObject({ ok: true, rhythm: 'from-now' });
    expect(state.dayRhythms[HOJE]).toEqual([{ ...R50, from: '14:03' }, { ...R25, from: '16:10' }]);
    const fim = blocksForDay(HOJE);
    expect(fim.filter((b) => b.time < '16:10')).toEqual(meio.filter((b) => b.time < '16:10'));
    expect(dayRhythmEdited(HOJE)).toBe(false); // o ritmo em vigor voltou a ser o da rotina
  });

  it('"Restaurar rotina" devolve o ritmo da rotina só de agora em diante — a tarde em 50 já estudada fica em 50', () => {
    setDayRhythm(HOJE, R50, AGORA);
    const tarde = blocksForDay(HOJE).find((b) => b.type === 'estudo' && timeDiff(b) === 50)!;
    marcar(HOJE, tarde.time, em('15:30'));
    const antes = blocksForDay(HOJE);
    expect(clearDayWindows(HOJE, em('15:31'))).toEqual({ ok: true });
    const depois = blocksForDay(HOJE);
    expect(depois.filter((b) => b.time < '15:31')).toEqual(antes.filter((b) => b.time < '15:31'));
    expect(depois.find((b) => b.time === tarde.time)).toEqual(tarde);
    expect(dayRhythmNow(HOJE)).toEqual(R25);
    expect(computeStatsNow(em('15:31')).todayXP).toBe(200); // 50 + 50 da manhã, 100 do estudo de 50 min
  });

  it('mudar a ROTINA não mexe em hoje (já tem blocos): vale de amanhã, e o ritmo próprio de hoje continua', () => {
    setDayRhythm(HOJE, R50, AGORA);
    const hoje = blocksForDay(HOJE);
    expect(saveSettings({ ...defaultDraft(), pomo: '40' }, AGORA)).toEqual({ ok: true, plan: 'from-tomorrow' });
    expect(blocksForDay(HOJE)).toEqual(hoje);
    expect(estudos(AMANHA)[0]).toMatchObject({ endTime: '09:40' });
  });

  it('o bloco no timer que ainda não começou também fica: o ritmo novo entra depois dele', () => {
    const proximo = blocksForDay(HOJE).find((b) => b.type === 'estudo' && b.time > '14:03')!;
    derived.timerBlock = proximo;
    derived.timerDay = HOJE;
    expect(setDayRhythm(HOJE, R50, AGORA)).toMatchObject({ ok: true, rhythm: 'from-now' });
    expect(blocksForDay(HOJE).find((b) => b.time === proximo.time)).toEqual(proximo);
    expect(state.dayRhythms[HOJE]).toEqual([{ ...R50, from: proximo.endTime }]);
  });

  it('a prévia do modal mostra o mesmo plano que o Salvar grava — sem escrever nada', () => {
    const previa = previewDayPlan(HOJE, ROTINA, R50, AGORA);
    expect(state.dayRhythms).toEqual({});
    expect(blocksForDay(HOJE)).not.toEqual(previa);
    setDayRhythm(HOJE, R50, AGORA);
    expect(blocksForDay(HOJE)).toEqual(previa);
    // Sem ritmo no rascunho (ou com um inválido), a prévia é o dia como está.
    expect(previewDayPlan(HOJE, ROTINA, null, AGORA)).toEqual(previa);
    expect(previewDayPlan(HOJE, ROTINA, { pomo: 0, shortBreak: 0, longBreak: 0 }, AGORA)).toEqual(previa);
  });
});

describe('a rotina e o dia são duas coisas diferentes', () => {
  it('mudar a rotina não muda um dia que tem ritmo próprio; os outros dias seguem a rotina nova', () => {
    setDayRhythm(AMANHA, R50, AGORA);
    expect(saveSettings({ ...defaultDraft(), pomo: '40' }, AGORA)).toEqual({ ok: true, plan: 'from-today' });
    expect(estudos(AMANHA)[0]).toMatchObject({ endTime: '09:50' }); // o dia continua no ritmo dele
    expect(estudos(HOJE)[0]).toMatchObject({ endTime: '09:40' });
    expect(estudos('2026-09-04')[0]).toMatchObject({ endTime: '09:40' });
    expect(routineRhythmOf(AMANHA)).toMatchObject({ pomo: 40 });
  });

  it('"Restaurar rotina" num dia que não começou apaga o ritmo próprio (e as janelas editadas) de uma vez', () => {
    saveDayStructure(AMANHA, { windows: [{ start: '10:00', end: '14:00' }], rhythm: R50 }, AGORA);
    expect(clearDayWindows(AMANHA, AGORA)).toEqual({ ok: true });
    expect(state.dayRhythms).toEqual({});
    expect(state.windowOverrides).toEqual({});
    expect(estudos(AMANHA)[0]).toMatchObject({ time: '09:00', endTime: '09:25' });
  });

  it('a semana da rotina ignora o ritmo de um dia; a semana de verdade o mostra, com a marca', () => {
    setDayRhythm(AMANHA, R50, AGORA);
    const quinta = 3;
    const rotina = weekPreview('rotina', state.config, AGORA)[quinta]!;
    const real = weekPreview('semana', state.config, AGORA)[quinta]!;
    expect(rotina.blocks.find((b) => b.type === 'estudo')).toMatchObject({ endTime: '09:25' });
    expect(rotina.changed).toBe(false);
    expect(real.blocks.find((b) => b.type === 'estudo')).toMatchObject({ endTime: '09:50' });
    expect(real.changed).toBe(true);
  });

  it('num dia ao vivo a corrida nasce com o ritmo do dia', () => {
    setDayMode(HOJE, 'live', AGORA);
    setDayRhythm(HOJE, R50, AGORA);
    const r = startLive(HOJE, AGORA);
    expect(r.ok && r.block).toMatchObject({ time: '14:03', endTime: '14:53' });
    expect(state.windowOverrides[HOJE]!.studyWindows[0]!.live).toEqual(R50);
  });

  it('vai e volta do documento, e "Apagar todo o histórico" zera', () => {
    setDayRhythm(AMANHA, R50, AGORA);
    marcar(HOJE, '09:00', em('09:30'));
    setDayRhythm(HOJE, R50, AGORA);
    const doc = JSON.parse(JSON.stringify(serializeState(state)));
    expect(doc.dayRhythms).toEqual({ [AMANHA]: [R50], [HOJE]: [{ ...R50, from: '14:03' }] });
    expect(hydrateUserDoc(doc).dayRhythms).toEqual(state.dayRhythms);
    // Documento de antes do ritmo por dia: nenhum.
    const { dayRhythms: _fora, ...antigo } = doc;
    expect(hydrateUserDoc(antigo).dayRhythms).toEqual({});
    cancelSession(AGORA);
    expect(state.dayRhythms).toEqual({});
  });
});

// 2026-10-01, o relato do Tomi: "botei 13 minutos quando tava no modo ao vivo, voltei pro modo
// rotina, e ele fica em 13 minutos independente do que eu mude".
describe('voltar do ao vivo pra rotina com um ritmo de 13 minutos', () => {
  const R13 = { pomo: 13, shortBreak: 5, longBreak: 20 };
  const R40 = { pomo: 40, shortBreak: 5, longBreak: 20 };
  const seg = (hms: string) => new Date(`${HOJE}T${hms}`);
  const ir = (hms: string) => {
    vi.setSystemTime(seg(hms));
    reconcileTimer(seg(hms));
  };
  const semSobreposicao = () => {
    const dia = blocksForDay(HOJE);
    expect(new Set(dia.map((b) => b.time)).size).toBe(dia.length);
    for (let i = 1; i < dia.length; i++) expect(dia[i]!.time >= dia[i - 1]!.endTime, `${dia[i - 1]!.endTime} > ${dia[i]!.time}`).toBe(true);
  };
  const correr = () => {
    const r = startLive(HOJE, seg('10:00:00'));
    if (!r.ok) throw new Error('a corrida não começou');
    startTimer(r.block, seg('10:00:00'));
    derived.focusOpen = true;
    ir('10:13:01'); // o estudo acaba e emenda na pausa
    ir('10:18:01'); // a pausa acaba e emenda no segundo estudo (10:18–10:31)
  };

  it('o 13 veio das CONFIGURAÇÕES: a rotina só muda amanhã, mas o modal do dia muda hoje, do próximo bloco em diante', () => {
    vi.setSystemTime(seg('10:00:00'));
    setDayMode(HOJE, 'live', seg('10:00:00'));
    expect(saveSettings({ ...defaultDraft(), pomo: '13' }, seg('10:00:00'))).toEqual({ ok: true, plan: 'from-today' });
    correr();
    ir('10:22:00');
    expect(stopHere(seg('10:22:00'))).toMatchObject({ ok: true });
    setDayMode(HOJE, 'rotina', seg('10:23:00'));
    expect(estudos(HOJE).find((b) => b.time === '10:23')).toMatchObject({ endTime: '10:36' }); // a rotina de hoje é 13

    // Nas Configurações: hoje já tem corrida, então vale de amanhã — hoje continua em 13.
    expect(saveSettings({ ...defaultDraft(), pomo: '25' }, seg('10:24:00'))).toEqual({ ok: true, plan: 'from-tomorrow' });
    expect(estudos(HOJE).filter((b) => b.time >= '10:23').every((b) => timeDiff(b) <= 13)).toBe(true);
    expect(estudos(AMANHA)[0]).toMatchObject({ endTime: '09:25' });

    // No modal do dia: muda HOJE. O bloco das 10:23 (já começou) fica; os seguintes são de 40.
    expect(setDayRhythm(HOJE, R40, seg('10:25:00'))).toEqual({ ok: true, windows: false, rhythm: 'from-now' });
    const depois = estudos(HOJE).filter((b) => b.time > '10:23');
    expect(depois[0]).toMatchObject({ time: '10:41', endTime: '11:21' });
    expect(depois.slice(0, 4).every((b) => timeDiff(b) === 40)).toBe(true);
    // E o que foi vivido na corrida não se mexe.
    expect(blocksForDay(HOJE).slice(0, 3).map((b) => `${b.time}–${b.endTime}`)).toEqual(['10:00–10:13', '10:13–10:18', '10:18–10:22']);
    semSobreposicao();
  });

  it('voltar pra rotina com a corrida AINDA rodando: ela termina a pausa dela, e o resto do dia é da rotina — sem crescer por cima', () => {
    vi.setSystemTime(seg('10:00:00'));
    setDayMode(HOJE, 'live', seg('10:00:00'));
    setDayRhythm(HOJE, R13, seg('10:00:00'));
    correr();
    ir('10:20:00');
    setDayMode(HOJE, 'rotina', seg('10:20:00'));
    expect(setDayRhythm(HOJE, R40, seg('10:21:00'))).toMatchObject({ ok: true, rhythm: 'from-now' });

    // O estudo das 10:18 acaba: a pausa é da corrida (5 min, o ritmo dela), e a rotina começa depois dela.
    ir('10:31:01');
    expect(derived.timerBlock).toMatchObject({ time: '10:31', endTime: '10:36', type: 'pausa' });
    expect(state.windowOverrides[HOJE]!.studyWindows).toEqual([
      { start: '10:00', end: '10:36', live: R13 },
      { start: '10:36', end: '18:00' },
    ]);
    semSobreposicao();

    // A pausa acaba: o próximo é um estudo do PLANO, no ritmo novo do dia — e a corrida não cresce mais.
    ir('10:36:01');
    expect(derived.timerBlock).toMatchObject({ time: '10:36', endTime: '11:16', type: 'estudo' });
    expect(derived.timerBlock!.live).toBeUndefined();
    expect(state.windowOverrides[HOJE]!.studyWindows[0]).toMatchObject({ end: '10:36' });
    semSobreposicao();
  });
});

function timeDiff(b: StudyBlock): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return m(b.endTime) - m(b.time);
}
