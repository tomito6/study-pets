// "Como fica a semana" e o resumo de um plano (src/domain/weekPreview.ts,
// src/domain/settings.ts summarizePlan, src/domain/timeline.ts weekTimelineOf). Puro.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from '../src/domain/config';
import { generateBlocks } from '../src/domain/planner';
import { summarizePlan } from '../src/domain/settings';
import { weekTimelineOf } from '../src/domain/timeline';
import type { StudyBlock, StudyEvent } from '../src/domain/types';
import { eventDisplayName, weekEventLines, weekTotals } from '../src/domain/weekPreview';
import type { WeekPreviewDay } from '../src/domain/weekPreview';

const b = (time: string, endTime: string, type: StudyBlock['type'], name: string = type, xp = 0): StudyBlock => ({
  time, endTime, name, type, xp, cycle: 0,
});

const meal: StudyEvent = { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false };
const aula: StudyEvent = { name: 'Análise II', start: '10:00', end: '12:00', countsAsStudy: true };
const yoga: StudyEvent = { name: 'Yoga', start: '17:00', end: '18:00', countsAsStudy: false };

const day = (dayIdx: number, events: StudyEvent[] | null, changed = false): WeekPreviewDay => ({
  key: `2026-09-0${dayIdx + 1}`,
  dayIdx,
  rest: events === null ? 'weekend' : null,
  blocks: events === null ? [] : generateBlocks(DEFAULT_CFG, events),
  changed,
});

describe('summarizePlan', () => {
  it('conta pomos, minutos de estudo, pausa e evento, e o XP — pelo blockMins', () => {
    const s = summarizePlan([
      b('09:00', '09:25', 'estudo', 'Estudo 1', 50),
      b('09:25', '09:30', 'pausa', 'Pausa', 5),
      { ...b('09:30', '10:02', 'estudo', 'Estudo 2', 50), paused: 7 }, // esticado por uma pausa do timer: vale 25
      b('10:02', '12:00', 'event', '📅 Análise II', 236),
      b('13:00', '14:00', 'intervalo', '🍽️ Almoço'),
    ]);
    expect(s).toMatchObject({ pomos: 2, studyMins: 50, pauseMins: 5, eventMins: 118, totalXP: 341 });
  });

  it('o fim é o do último bloco que vale, e o bloqueio que vem depois entra na frase', () => {
    const blocks = generateBlocks(DEFAULT_CFG, [meal, yoga]);
    const s = summarizePlan(blocks);
    expect(s.lastStudyEnd).toBe('17:00');
    expect(s.after).toEqual({ name: 'Yoga', end: '18:00' });
  });

  it('a refeição no MEIO do dia não é "depois": só o que vem depois do último estudo', () => {
    const s = summarizePlan(generateBlocks(DEFAULT_CFG, [meal]));
    expect(s.lastStudyEnd).toBe('18:00');
    expect(s.after).toBeNull();
    expect(s.pomos).toBe(16);
    expect(s.studyMins).toBe(385);
  });

  it('a aula no fim do dia é o fim que vale', () => {
    const tarde: StudyEvent = { name: 'Aula', start: '16:00', end: '18:00', countsAsStudy: true };
    const s = summarizePlan(generateBlocks(DEFAULT_CFG, [tarde]));
    expect(s.lastStudyEnd).toBe('18:00');
    expect(s.eventMins).toBe(120);
  });

  it('sem blocos: tudo zero e sem fim', () => {
    expect(summarizePlan([])).toEqual({ pomos: 0, studyMins: 0, eventMins: 0, pauseMins: 0, totalXP: 0, lastStudyEnd: null, after: null });
  });
});

describe('weekTimelineOf', () => {
  it('sete dias na MESMA régua: os limites vêm da semana inteira, folga é linha vazia', () => {
    const tl = weekTimelineOf([
      [b('09:00', '09:25', 'estudo')],
      [],
      [b('14:00', '14:25', 'estudo'), b('17:00', '18:00', 'intervalo', 'Yoga')],
    ])!;
    expect(tl.fromMin).toBe(9 * 60);
    expect(tl.toMin).toBe(18 * 60);
    expect(tl.rows).toHaveLength(3);
    expect(tl.rows[1]).toEqual([]);
    expect(tl.rows[0]![0]!.left).toBe(0);
    expect(tl.rows[2]![1]!.left + tl.rows[2]![1]!.width).toBeCloseTo(100);
    // a mesma coluna nos dois dias: 14:00 cai no mesmo lugar em qualquer linha
    expect(tl.rows[2]![0]!.left).toBeCloseTo((5 / 9) * 100);
  });

  it('sem bloco nenhum, nada', () => {
    expect(weekTimelineOf([[], []])).toBeNull();
  });
});

describe('weekEventLines', () => {
  it('agrupa por nome e horário, na ordem em que aparecem, com os dias de cada um', () => {
    const lines = weekEventLines([day(0, [meal]), day(1, [meal, aula]), day(2, [meal, yoga]), day(3, [meal, aula]), day(4, [meal]), day(5, null), day(6, null)]);
    expect(lines.map((l) => l.name)).toEqual(['🍽️ Almoço', 'Análise II', 'Yoga']);
    expect(lines[1]).toMatchObject({ start: '10:00', end: '12:00', countsAsStudy: true, days: [1, 3], everyDay: false });
    expect(lines[2]).toMatchObject({ countsAsStudy: false, days: [2] });
  });

  it('quem cai em todos os dias com plano é "todo dia" — a folga não conta', () => {
    const lines = weekEventLines([day(0, [meal]), day(1, [meal]), day(2, [meal]), day(3, [meal]), day(4, [meal]), day(5, null), day(6, null)]);
    expect(lines[0]).toMatchObject({ name: '🍽️ Almoço', everyDay: true, days: [0, 1, 2, 3, 4] });
  });

  it('o 📅 que o gerador põe no evento sem ícone não é nome; o ícone que a pessoa pôs fica', () => {
    expect(eventDisplayName('📅 Análise II')).toBe('Análise II');
    expect(eventDisplayName('🍽️ Almoço')).toBe('🍽️ Almoço');
    expect(eventDisplayName('Dentista')).toBe('Dentista');
    const lines = weekEventLines([day(0, [aula])]);
    expect(lines[0]!.name).toBe('Análise II');
  });
});

describe('weekTotals', () => {
  it('soma só os dias com plano: estudo, eventos que contam, pomos e XP', () => {
    const t = weekTotals([day(0, [meal]), day(1, [meal, aula]), day(2, null)]);
    expect(t.days).toBe(2);
    expect(t.studyMins).toBe(385 + 290);
    expect(t.eventMins).toBe(120);
    expect(t.pomos).toBe(16 + 12);
    expect(t.totalXP).toBe(865 + 890);
  });
});
