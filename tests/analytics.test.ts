import { describe, expect, it } from 'vitest';
import { currentWeekKeys, dropoff, goalWeek, heatmap, hourBars, nextLevel, sparkline } from '../src/domain/analytics';

const QUA = new Date('2026-09-02T15:00:00');

describe('semana atual e próximo nível', () => {
  it('lista segunda a domingo da semana de agora', () => {
    const k = currentWeekKeys(QUA);
    expect(k[0]).toBe('2026-08-31');
    expect(k[6]).toBe('2026-09-06');
  });

  it('acha o próximo nível, ou null no máximo', () => {
    expect(nextLevel(0)).toEqual({ threshold: 250, name: 'Iniciante' });
    expect(nextLevel(10000)).toBeNull();
  });
});

describe('meta diária — 7 dots', () => {
  const stats = {
    dayMetGoal: { '2026-08-31': true, '2026-09-01': false, '2026-09-02': true },
    dayStudyDoneMins: { '2026-08-31': 60, '2026-09-01': 10, '2026-09-02': 90 },
  };

  it('conta só os dias já passados, e classifica cada dot', () => {
    const g = goalWeek(stats, { now: QUA, skipWeekends: false });
    expect(g).toMatchObject({ metCount: 2, totalDays: 7 });
    expect(g.dots.map((d) => d.kind)).toEqual(['met', 'miss', 'met', 'future', 'future', 'future', 'future']);
    expect(g.dots[2]!.isToday).toBe(true);
  });

  it('com skipWeekends, sáb e dom ficam neutros e a semana tem 5 dias', () => {
    const g = goalWeek(stats, { now: QUA, skipWeekends: true });
    expect(g.totalDays).toBe(5);
    expect(g.dots[5]!.kind).toBe('weekend');
    expect(g.dots[6]!.kind).toBe('weekend');
  });

  it('dia declarado livre é neutro: sai da conta e o dot vira "off"', () => {
    const g = goalWeek(stats, { now: QUA, skipWeekends: false, dayOff: (k) => k === '2026-09-01' });
    expect(g).toMatchObject({ metCount: 2, totalDays: 6 });
    expect(g.dots[1]!.kind).toBe('off');
    expect(g.dots[0]!.kind).toBe('met');
  });
});

describe('heatmap', () => {
  it('tem 7 × 16 células, em ordem de coluna, terminando na semana de hoje', () => {
    const cells = heatmap({}, { now: QUA, goal: 60, skipWeekends: false });
    expect(cells).toHaveLength(112);
    expect(cells[0]!.key).toBe('2026-05-18'); // segunda, 15 semanas atrás
    expect(cells[111]!.key).toBe('2026-09-06'); // domingo desta semana
    expect(cells.filter((c) => c.kind === 'future')).toHaveLength(4); // qui..dom
  });

  it('intensidade por % da meta: 0/25/50/75/100+', () => {
    const done = { '2026-09-01': 10, '2026-08-31': 30, '2026-08-28': 45, '2026-08-27': 59, '2026-08-26': 120 };
    const byKey = Object.fromEntries(heatmap(done, { now: QUA, goal: 60, skipWeekends: false }).map((c) => [c.key, c]));
    expect(byKey['2026-09-01']!.intensity).toBe(0);
    expect(byKey['2026-08-31']!.intensity).toBe(2);
    expect(byKey['2026-08-28']!.intensity).toBe(3);
    expect(byKey['2026-08-27']!.intensity).toBe(3);
    expect(byKey['2026-08-26']!.intensity).toBe(4);
    expect(byKey['2026-08-26']!.pct).toBe(200);
  });

  it('meta zero: qualquer minuto acende no máximo', () => {
    const c = heatmap({ '2026-09-01': 5 }, { now: QUA, goal: 0, skipWeekends: false }).find((c) => c.key === '2026-09-01')!;
    expect(c.intensity).toBe(4);
  });

  it('skipWeekends marca sáb/dom passados como fim de semana', () => {
    const c = heatmap({}, { now: QUA, goal: 60, skipWeekends: true }).find((c) => c.key === '2026-08-30')!;
    expect(c.kind).toBe('weekend-off');
  });

  it('dia declarado livre vira célula neutra "day-off"; no futuro continua "future"', () => {
    const cells = heatmap({}, { now: QUA, goal: 60, skipWeekends: false, dayOff: (k) => k === '2026-09-01' || k === '2026-09-04' });
    expect(cells.find((c) => c.key === '2026-09-01')!.kind).toBe('day-off');
    expect(cells.find((c) => c.key === '2026-09-04')!.kind).toBe('future');
  });
});

describe('horas, drop-off e sparkline', () => {
  it('barras das horas do dia, relativas ao pico', () => {
    const bars = hourBars({ 9: 4, 10: 2 }, '09:00', '11:00');
    expect(bars.map((b) => b.hour)).toEqual([9, 10, 11, 12]);
    expect(bars[0]).toMatchObject({ count: 4, pct: 100 });
    expect(bars[1]).toMatchObject({ count: 2, pct: 50 });
    expect(bars[3]).toMatchObject({ count: 0, pct: 0 });
  });

  it('drop-off ignora sessões sem blocos e ordena', () => {
    const rows = dropoff({ 2: { done: 1, total: 4 }, 0: { done: 3, total: 3 }, 1: { done: 0, total: 0 } });
    expect(rows.map((r) => r.session)).toEqual([0, 2]);
    expect(rows[1]!.pct).toBe(25);
  });

  it('sparkline agrega por semana, 8 pontos, o último no máximo quando é a maior', () => {
    const sp = sparkline({ '2026-09-01': 30, '2026-09-02': 30, '2026-08-25': 20 }, QUA);
    expect(sp.series).toHaveLength(8);
    expect(sp.series[7]).toEqual({ week: '2026-08-31', mins: 60 });
    expect(sp.series[6]).toEqual({ week: '2026-08-24', mins: 20 });
    expect(sp.last[1]).toBeCloseTo(2, 5); // topo (pad) = maior valor
    expect(sp.polyline.split(' ')).toHaveLength(8);
  });
});
