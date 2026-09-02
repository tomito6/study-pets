import { describe, expect, it } from 'vitest';
import { expandEventsForDate } from '../src/domain/events';
import type { RecurringEventSeries, StudyEvent } from '../src/domain/types';

// 2026-09-02 é uma quarta-feira. As datas abaixo saem dessa âncora.
const QUA = '2026-09-02';
const QUI = '2026-09-03';
const QUA_SEG = '2026-09-09'; // uma semana depois
const QUA_TER = '2026-09-16'; // duas semanas depois
const QUA_MES = '2026-10-02'; // mesmo dia do mês seguinte (sexta)

const serie = (over: Partial<RecurringEventSeries> = {}): RecurringEventSeries => ({
  id: 'ser_1',
  name: 'Aula de Álgebra',
  start: '10:00',
  end: '11:30',
  weekdays: [3], // quarta
  freq: 'weekly',
  anchor: QUA,
  ...over,
});

describe('expandEventsForDate — eventos avulsos', () => {
  it('devolve os eventos do dia', () => {
    const avulsos: Record<string, StudyEvent[]> = {
      [QUA]: [{ name: 'Dentista', start: '15:00', end: '16:00' }],
    };
    const out = expandEventsForDate(QUA, avulsos, []);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Dentista');
  });

  it('devolve lista vazia num dia sem nada', () => {
    expect(expandEventsForDate(QUI, {}, [])).toEqual([]);
  });

  it('não vaza eventos de um dia para outro', () => {
    const avulsos: Record<string, StudyEvent[]> = {
      [QUA]: [{ name: 'Dentista', start: '15:00', end: '16:00' }],
    };
    expect(expandEventsForDate(QUI, avulsos, [])).toEqual([]);
  });

  it('ordena por horário de início', () => {
    const avulsos: Record<string, StudyEvent[]> = {
      [QUA]: [
        { name: 'Tarde', start: '15:00', end: '16:00' },
        { name: 'Manhã', start: '08:00', end: '09:00' },
      ],
    };
    expect(expandEventsForDate(QUA, avulsos, []).map((e) => e.name)).toEqual(['Manhã', 'Tarde']);
  });
});

describe('expandEventsForDate — recorrência semanal', () => {
  it('aparece no mesmo dia da semana', () => {
    expect(expandEventsForDate(QUA_SEG, {}, [serie()])).toHaveLength(1);
  });

  it('não aparece em outro dia da semana', () => {
    expect(expandEventsForDate(QUI, {}, [serie()])).toEqual([]);
  });

  it('não aparece antes da âncora', () => {
    expect(expandEventsForDate('2026-08-26', {}, [serie()])).toEqual([]);
  });

  it('marca a ocorrência com o id da série', () => {
    expect(expandEventsForDate(QUA, {}, [serie()])[0]!._seriesId).toBe('ser_1');
  });

  it('respeita o campo until', () => {
    const s = serie({ until: QUA_SEG });
    expect(expandEventsForDate(QUA_SEG, {}, [s])).toHaveLength(1);
    expect(expandEventsForDate(QUA_TER, {}, [s])).toEqual([]);
  });

  it('aceita múltiplos dias da semana', () => {
    const s = serie({ weekdays: [3, 4] }); // quarta e quinta
    expect(expandEventsForDate(QUA, {}, [s])).toHaveLength(1);
    expect(expandEventsForDate(QUI, {}, [s])).toHaveLength(1);
  });
});

describe('expandEventsForDate — recorrência quinzenal', () => {
  const quinzenal = serie({ freq: 'biweekly' });

  it('aparece na semana da âncora', () => {
    expect(expandEventsForDate(QUA, {}, [quinzenal])).toHaveLength(1);
  });

  it('pula a semana seguinte', () => {
    expect(expandEventsForDate(QUA_SEG, {}, [quinzenal])).toEqual([]);
  });

  it('volta duas semanas depois', () => {
    expect(expandEventsForDate(QUA_TER, {}, [quinzenal])).toHaveLength(1);
  });
});

describe('expandEventsForDate — recorrência mensal', () => {
  const mensal = serie({ freq: 'monthly', weekdays: [3, 4, 5] });

  it('aparece no mesmo dia do mês seguinte', () => {
    expect(expandEventsForDate(QUA_MES, {}, [mensal])).toHaveLength(1);
  });

  it('não aparece em outro dia do mês', () => {
    expect(expandEventsForDate(QUA_SEG, {}, [mensal])).toEqual([]);
  });
});

describe('expandEventsForDate — exceções', () => {
  it('pula o dia listado em exceptions', () => {
    const s = serie({ exceptions: [QUA_SEG] });
    expect(expandEventsForDate(QUA_SEG, {}, [s])).toEqual([]);
  });

  it('continua aparecendo nos outros dias', () => {
    const s = serie({ exceptions: [QUA_SEG] });
    expect(expandEventsForDate(QUA_TER, {}, [s])).toHaveLength(1);
  });
});

describe('expandEventsForDate — mistura de fontes', () => {
  it('junta avulsos e série no mesmo dia, em ordem', () => {
    const avulsos: Record<string, StudyEvent[]> = {
      [QUA]: [{ name: 'Dentista', start: '15:00', end: '16:00' }],
    };
    const out = expandEventsForDate(QUA, avulsos, [serie()]);
    expect(out.map((e) => e.name)).toEqual(['Aula de Álgebra', 'Dentista']);
  });

  it('propaga countsAsStudy da série, com default true', () => {
    expect(expandEventsForDate(QUA, {}, [serie()])[0]!.countsAsStudy).toBe(true);
    expect(
      expandEventsForDate(QUA, {}, [serie({ countsAsStudy: false })])[0]!.countsAsStudy,
    ).toBe(false);
  });

  it('ignora série sem dias da semana', () => {
    expect(expandEventsForDate(QUA, {}, [serie({ weekdays: [] })])).toEqual([]);
  });
});
