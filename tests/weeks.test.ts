import { describe, expect, it } from 'vitest';
import { buildWeeks, dateForWeekDay, findWeek, weekDays } from '../src/domain/weeks';
import { dk } from '../src/domain/time';

const HOJE = new Date('2026-09-02T12:00:00'); // quarta

describe('buildWeeks', () => {
  it('sem período nem dados: começa na segunda desta semana e vai até 31/12', () => {
    const w = buildWeeks({ periodStart: null, periodEnd: null, dataKeys: [], today: HOJE });
    expect(dk(w[0]!.start)).toBe('2026-08-31');
    expect(w[w.length - 1]!.end >= new Date('2026-12-31T00:00:00')).toBe(true);
    expect(w[0]!.n).toBe(1);
  });

  it('expande pra trás quando há dados antigos', () => {
    const w = buildWeeks({ periodStart: null, periodEnd: null, dataKeys: ['2026-07-15'], today: HOJE });
    expect(dk(w[0]!.start)).toBe('2026-07-13'); // segunda daquela semana
  });

  it('periodStart empurra o começo pra trás, nunca pra frente', () => {
    const atras = buildWeeks({ periodStart: '2026-08-10', periodEnd: null, dataKeys: [], today: HOJE });
    expect(dk(atras[0]!.start)).toBe('2026-08-10');
    const frente = buildWeeks({ periodStart: '2026-10-01', periodEnd: null, dataKeys: [], today: HOJE });
    expect(dk(frente[0]!.start)).toBe('2026-08-31');
  });

  it('periodEnd é respeitado: cobre o fim, não vai até dezembro (mínimo hoje+7)', () => {
    const w = buildWeeks({ periodStart: null, periodEnd: '2026-10-15', dataKeys: [], today: HOJE });
    const ultima = w[w.length - 1]!;
    expect(ultima.end >= new Date('2026-10-15T00:00:00')).toBe(true);
    // Comportamento original preservado: o arredondamento pode sobrar UMA semana além do fim,
    // nunca mais que isso (15/10 é quinta → termina em 25/10, não em 18/10).
    expect(dk(ultima.end)).toBe('2026-10-25');
    expect(ultima.end < new Date('2026-11-01T00:00:00')).toBe(true);
    const curto = buildWeeks({ periodStart: null, periodEnd: '2026-09-03', dataKeys: [], today: HOJE });
    expect(curto[curto.length - 1]!.end >= new Date('2026-09-09T00:00:00')).toBe(true);
  });

  it('modo "sempre" expande pra frente se houver dados futuros', () => {
    const w = buildWeeks({ periodStart: null, periodEnd: null, dataKeys: ['2027-02-10'], today: HOJE });
    expect(w[w.length - 1]!.end >= new Date('2027-02-10T00:00:00')).toBe(true);
  });

  it('com periodEnd, dados futuros fora do período NÃO expandem', () => {
    const w = buildWeeks({ periodStart: null, periodEnd: '2026-10-15', dataKeys: ['2027-02-10'], today: HOJE });
    expect(dk(w[w.length - 1]!.end)).toBe('2026-10-25'); // igual ao caso sem dados futuros
  });
});

describe('dateForWeekDay / findWeek / weekDays', () => {
  const weeks = buildWeeks({ periodStart: null, periodEnd: null, dataKeys: [], today: HOJE });

  it('acha a data de um dia da semana', () => {
    expect(dk(dateForWeekDay(weeks, 1, 2))).toBe('2026-09-02');
    expect(dk(dateForWeekDay(weeks, 2, 0))).toBe('2026-09-07');
  });

  it('sem semanas, devolve hoje em vez de quebrar', () => {
    expect(dateForWeekDay([], 3, 4)).toBeInstanceOf(Date);
  });

  it('acha a semana de uma data (1-based) e cai em 1 fora do range', () => {
    expect(findWeek(weeks, HOJE)).toBe(1);
    expect(findWeek(weeks, new Date('2026-09-09T12:00:00'))).toBe(2);
    expect(findWeek(weeks, new Date('2020-01-01T12:00:00'))).toBe(1);
  });

  it('lista todos os dias, e pula fim de semana quando pedido', () => {
    const todos = weekDays(weeks.slice(0, 2), false);
    expect(todos).toHaveLength(14);
    expect(todos[0]).toMatchObject({ key: '2026-08-31', weekIdx: 0, dayIdx: 0 });
    const uteis = weekDays(weeks.slice(0, 2), true);
    expect(uteis).toHaveLength(10);
    expect(uteis.every((d) => d.dayIdx < 5)).toBe(true);
  });
});
