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

  it('acha a semana de uma data (1-based); antes do range cai em 1, depois na última', () => {
    expect(findWeek(weeks, HOJE)).toBe(1);
    expect(findWeek(weeks, new Date('2026-09-09T12:00:00'))).toBe(2);
    expect(findWeek(weeks, new Date('2020-01-01T12:00:00'))).toBe(1);
    // Depois do fim: a última semana. Errar a semana é ruim; errar por 40 dias é outra coisa.
    const ultima = weeks[weeks.length - 1]!;
    expect(findWeek(weeks, new Date('2030-01-01T12:00:00'))).toBe(ultima.n);
  });

  /**
   * O bug do domingo (2026-09-12). `w.end` é o domingo às 00:00 — `mondayOf` zera a hora e o
   * fim é início + 6 dias —, então comparar INSTANTES fazia nenhuma semana casar em qualquer
   * domingo depois da meia-noite, e o fallback jogava o usuário na semana 1. Quem tinha
   * histórico antigo abria o app num domingo de agosto, com o cabeçalho dizendo a data certa,
   * e perdia "🕘 Janelas do dia" e "✓ Encerrar o dia" — os dois só existem no dia de hoje.
   * Conta nova nunca reproduziu: a semana 1 dela É a semana corrente, e o fallback acertava
   * por acidente.
   */
  it('acha a semana em QUALQUER hora do dia — inclusive no domingo', () => {
    const antigas = buildWeeks({ periodStart: '2026-08-03', periodEnd: null, dataKeys: [], today: HOJE });
    const domingo = (hh: number, mm = 0) => new Date(2026, 8, 13, hh, mm); // 13/09/2026, um domingo
    const esperada = antigas.find((w) => dk(w.start) <= '2026-09-13' && '2026-09-13' <= dk(w.end))!.n;
    for (const hora of [0, 1, 10, 12, 23]) {
      expect(findWeek(antigas, domingo(hora)), `domingo às ${hora}h`).toBe(esperada);
    }
    expect(findWeek(antigas, domingo(23, 59))).toBe(esperada);
  });

  it('todo dia da semana, a qualquer hora, cai na semana que o contém', () => {
    const semanas = buildWeeks({ periodStart: '2026-07-06', periodEnd: null, dataKeys: [], today: HOJE });
    for (let dia = 0; dia < 28; dia++) {
      for (const hora of [0, 9, 17, 23]) {
        const d = new Date(2026, 7, 3 + dia, hora, 30); // agosto/setembro, varrendo 4 semanas
        const w = semanas[findWeek(semanas, d) - 1]!;
        expect(dk(w.start) <= dk(d) && dk(d) <= dk(w.end), `${dk(d)} ${hora}h`).toBe(true);
      }
    }
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
