// "Como fica a semana" (src/application/weekPreview.ts): a rotina é o molde (config +
// séries, ignora avulso e janela editada), "esta semana" é a semana de verdade. E o
// "Como fica o dia" do modal (previewDayPlan): o plano com as janelas do rascunho.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewDayPlan, setDayMode, setDayWindows } from '../src/application/dayWindows';
import { clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { weekPreview, weekPreviewValid } from '../src/application/weekPreview';
import { mealSeries } from '../src/domain/eventPresets';
import { emptyPersistedState } from '../src/domain/persistence';
import { summarizePlan } from '../src/domain/settings';
import { eventDisplayName } from '../src/domain/weekPreview';
import type { RecurringEventSeries } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-02T10:07:00'); // quarta; a semana vai de 31/08 a 06/09
const HOJE = '2026-09-02';
const QUINTA = '2026-09-03';
const SEXTA = '2026-09-04';
const yoga: RecurringEventSeries = { id: 'ser_yoga', name: 'Yoga', start: '17:00', end: '18:00', weekdays: [3], freq: 'weekly', countsAsStudy: false };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  state.eventSeries = [mealSeries('13:00', 60), yoga];
  state.events[QUINTA] = [{ name: 'Dentista', start: '15:00', end: '16:00', countsAsStudy: false }];
  state.windowOverrides[SEXTA] = { studyWindows: [{ start: '10:30', end: '18:00' }] };
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('weekPreview — rotina', () => {
  it('sete dias, segunda a domingo, pela config dada e pelas séries', () => {
    const dias = weekPreview('rotina', state.config, AGORA);
    expect(dias.map((d) => d.key)).toEqual(['2026-08-31', '2026-09-01', HOJE, QUINTA, SEXTA, '2026-09-05', '2026-09-06']);
    expect(dias.map((d) => d.dayIdx)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // a quarta tem o yoga no horário dele; o almoço está em todos
    expect(dias[2]!.blocks.some((b) => eventDisplayName(b.name) === 'Yoga' && b.time === '17:00')).toBe(true);
    expect(dias.every((d) => d.blocks.some((b) => b.name.includes('Almoço')))).toBe(true);
  });

  it('ignora o avulso e a janela editada: a rotina é o molde, não a semana', () => {
    const dias = weekPreview('rotina', state.config, AGORA);
    expect(dias[3]!.blocks.some((b) => b.name === 'Dentista')).toBe(false); // avulso sem série: nome cru
    expect(dias[4]!.blocks[0]!.time).toBe('09:00');
    expect(dias.every((d) => !d.changed)).toBe(true);
  });

  it('reage à config dada (o rascunho), não à salva — e pausa o fim de semana se ela manda', () => {
    const dias = weekPreview('rotina', { ...state.config, pomo: 50, skipWeekends: true }, AGORA);
    expect(dias[0]!.blocks[0]!.endTime).toBe('09:50');
    expect(dias[5]!.rest).toBe('weekend');
    expect(dias[6]!.rest).toBe('weekend');
    expect(dias[5]!.blocks).toEqual([]);
    expect(state.config.pomo).toBe(25); // nada foi salvo
  });
});

describe('weekPreview — esta semana', () => {
  it('é o blocksForDay de cada dia: o avulso e a janela editada entram, e marcam o dia', () => {
    const dias = weekPreview('semana', state.config, AGORA);
    expect(dias[3]!.blocks.some((b) => b.name === 'Dentista')).toBe(true);
    expect(dias[3]!.changed).toBe(true);
    expect(dias[4]!.blocks[0]!.time).toBe('10:30');
    expect(dias[4]!.changed).toBe(true);
    expect(dias[2]!.changed).toBe(false);
  });

  it('o dia livre e o fim de semana pausado são folga', () => {
    state.config.skipWeekends = true;
    state.windowOverrides['2026-09-01'] = { studyWindows: [] };
    clearBlockCache();
    const dias = weekPreview('semana', state.config, AGORA);
    expect(dias[1]!.rest).toBe('off');
    expect(dias[5]!.rest).toBe('weekend');
    expect(dias[1]!.blocks).toEqual([]);
  });
});

describe('weekPreviewValid', () => {
  it('campo vazio ou nenhuma janela válida = ainda não dá pra gerar', () => {
    expect(weekPreviewValid(state.config)).toBe(true);
    expect(weekPreviewValid({ ...state.config, pomo: Number.NaN })).toBe(false);
    expect(weekPreviewValid({ ...state.config, studyWindows: [{ start: '18:00', end: '09:00' }] })).toBe(false);
  });
});

describe('previewDayPlan — "Como fica o dia" dentro do modal', () => {
  it('sem mexer no editor, é o mesmo plano do dia (com os eventos dele)', () => {
    const plano = previewDayPlan(HOJE, state.config.studyWindows);
    const s = summarizePlan(plano);
    expect(s.pomos).toBe(14);
    expect(s.lastStudyEnd).toBe('17:00');
    // a série ganha o 📅 do gerador; quem tira é a tela (eventDisplayName)
    expect(s.after!.end).toBe('18:00');
    expect(eventDisplayName(s.after!.name)).toBe('Yoga');
  });

  it('as janelas do rascunho mandam — antes de salvar, e sem salvar', () => {
    const plano = previewDayPlan(HOJE, [{ start: '14:00', end: '18:00' }]);
    expect(plano.find((b) => b.type === 'estudo')!.time).toBe('14:00');
    expect(state.windowOverrides[HOJE]).toBeUndefined();
    // janela inválida ou nenhuma: nada
    expect(previewDayPlan(HOJE, [{ start: '18:00', end: '09:00' }])).toEqual([]);
    expect(previewDayPlan(HOJE, [])).toEqual([]);
  });

  it('num dia ao vivo o rascunho não manda: o plano é o que aconteceu', () => {
    expect(setDayMode(HOJE, 'live', AGORA)).toEqual({ ok: true });
    const plano = previewDayPlan(HOJE, state.config.studyWindows);
    expect(plano.some((b) => b.type === 'estudo')).toBe(false); // nada começou: só os compromissos
    expect(plano.some((b) => b.name.includes('Almoço'))).toBe(true);
  });

  it('respeita as janelas já salvas do dia como ponto de partida do editor', () => {
    expect(setDayWindows(SEXTA, [{ start: '10:30', end: '12:00' }], AGORA)).toEqual({ ok: true });
    const plano = previewDayPlan(SEXTA, state.windowOverrides[SEXTA]!.studyWindows);
    expect(summarizePlan(plano).lastStudyEnd).toBe('12:00');
  });
});
