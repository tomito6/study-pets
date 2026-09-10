import { describe, expect, it } from 'vitest';
import { readIcs, itemOccurrences } from '../src/domain/ics';
import type { IcsSeriesItem, IcsDatesItem } from '../src/domain/ics';
import { expandEventsForDate } from '../src/domain/events';
import type { RecurringEventSeries } from '../src/domain/types';

// Horizonte fixo: 2026-09-10 é uma quinta-feira.
const RANGE = { from: '2026-09-10', to: '2026-12-31' } as const;

const ics = (...body: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'].join('\r\n');

const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];

const series = (plan: ReturnType<typeof readIcs>): IcsSeriesItem[] =>
  plan.items.filter((i): i is IcsSeriesItem => i.kind === 'series');
const dated = (plan: ReturnType<typeof readIcs>): IcsDatesItem[] =>
  plan.items.filter((i): i is IcsDatesItem => i.kind === 'dates');

describe('readIcs — formato', () => {
  it('desdobra linhas continuadas', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Análise II — exercícios da lista 3 com o gru',
          ' po da terça',
          'DTSTART:20260915T100000',
          'DTEND:20260915T113000',
        ),
      ),
      RANGE,
    );
    expect(plan.items[0].name).toBe('Análise II — exercícios da lista 3 com o grupo da terça');
  });

  it('desescapa vírgula, ponto e vírgula e barra invertida no nome', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Aula\\, prova\; revisão', 'DTSTART:20260915T100000', 'DTEND:20260915T110000')),
      RANGE,
    );
    expect(plan.items[0].name).toBe('Aula, prova; revisão');
  });

  it('lê o nome do calendário e ignora VALARM dentro do evento', () => {
    const plan = readIcs(
      ics(
        'X-WR-CALNAME:TUMonline',
        ...vevent(
          'UID:a@x',
          'SUMMARY:Aula',
          'DTSTART:20260915T100000',
          'DTEND:20260915T110000',
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'SUMMARY:Lembrete',
          'END:VALARM',
        ),
      ),
      RANGE,
    );
    expect(plan.calendarName).toBe('TUMonline');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].name).toBe('Aula');
  });
});

describe('readIcs — data e hora', () => {
  it('converte UTC pro relógio local', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Aula', 'DTSTART:20260915T083000Z', 'DTEND:20260915T093000Z')),
      RANGE,
    );
    const start = new Date(Date.UTC(2026, 8, 15, 8, 30));
    const hhmm = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    expect(plan.items[0].start).toBe(hhmm);
  });

  it('converte TZID pro relógio local', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Aula',
          'DTSTART;TZID=Europe/Berlin:20260915T100000',
          'DTEND;TZID=Europe/Berlin:20260915T113000',
        ),
      ),
      RANGE,
    );
    // 10:00 em Berlim (UTC+2 em setembro) = 08:00 UTC.
    const berlin = new Date(Date.UTC(2026, 8, 15, 8, 0));
    const hhmm = `${String(berlin.getHours()).padStart(2, '0')}:${String(berlin.getMinutes()).padStart(2, '0')}`;
    expect(plan.items[0].start).toBe(hhmm);
  });

  it('trata horário flutuante como local, sem conversão', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Aula', 'DTSTART:20260915T100000', 'DTEND:20260915T113000')),
      RANGE,
    );
    expect(plan.items[0].start).toBe('10:00');
    expect(plan.items[0].end).toBe('11:30');
  });

  it('aceita DURATION no lugar de DTEND', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Aula', 'DTSTART:20260915T100000', 'DURATION:PT1H30M')),
      RANGE,
    );
    expect(plan.items[0].end).toBe('11:30');
  });

  it('corta em 23:59 quem atravessa a meia-noite', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Festa', 'DTSTART:20260915T220000', 'DTEND:20260916T020000')),
      RANGE,
    );
    expect(plan.items[0].end).toBe('23:59');
    expect(plan.items[0].notes).toContain('crosses-midnight');
  });
});

describe('readIcs — o que fica de fora, com motivo', () => {
  const skipReason = (...lines: string[]) => readIcs(ics(...vevent(...lines)), RANGE).skipped[0]?.reason;

  it('dia inteiro', () => {
    expect(skipReason('UID:a@x', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20260915', 'DTEND;VALUE=DATE:20260916')).toBe('all-day');
  });

  it('cancelado', () => {
    expect(skipReason('UID:a@x', 'SUMMARY:Aula', 'STATUS:CANCELLED', 'DTSTART:20260915T100000', 'DTEND:20260915T110000')).toBe('cancelled');
  });

  it('sem fim e sem duração', () => {
    expect(skipReason('UID:a@x', 'SUMMARY:Lembrete', 'DTSTART:20260915T100000')).toBe('no-end');
  });

  it('inteiro no passado', () => {
    expect(skipReason('UID:a@x', 'SUMMARY:Aula velha', 'DTSTART:20260801T100000', 'DTEND:20260801T110000')).toBe('out-of-range');
  });

  it('nenhum evento válido não vira item nenhum', () => {
    const plan = readIcs(ics(...vevent('UID:a@x', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20260915')), RANGE);
    expect(plan.items).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
  });
});

describe('readIcs — recorrência que vira série do app', () => {
  it('semanal com BYDAY vira weekly com os dias certos', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Análise II',
          'DTSTART:20260915T100000',
          'DTEND:20260915T113000',
          'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261215T235959Z',
        ),
      ),
      RANGE,
    );
    const [s] = series(plan);
    expect(s.freq).toBe('weekly');
    expect(s.weekdays).toEqual([2, 4]);
    expect(s.until).toBe('2026-12-15');
    expect(s.anchor).toBe('2026-09-15');
  });

  it('INTERVAL=2 vira biweekly, com a âncora na primeira ocorrência que entra', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Seminário',
          // Começou em agosto (fora do horizonte); a paridade tem que sobreviver.
          'DTSTART:20260813T140000',
          'DTEND:20260813T160000',
          'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH',
        ),
      ),
      RANGE,
    );
    const [s] = series(plan);
    expect(s.freq).toBe('biweekly');
    // 13/08 + 2 semanas = 27/08, +2 = 10/09 — a primeira dentro do horizonte.
    expect(s.anchor).toBe('2026-09-10');
  });

  it('a série importada gera as mesmas datas pelo expansor do app', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Seminário',
          'DTSTART:20260813T140000',
          'DTEND:20260813T160000',
          'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH',
        ),
      ),
      RANGE,
    );
    const [s] = series(plan);
    const asApp: RecurringEventSeries = {
      id: 'ser_x',
      name: s.name,
      start: s.start,
      end: s.end,
      weekdays: s.weekdays,
      freq: s.freq,
      anchor: s.anchor,
      until: s.until,
      exceptions: s.exceptions,
    };
    const hits = ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'].map(
      (d) => expandEventsForDate(d, {}, [asApp]).length,
    );
    // Quinzenal: cai em 10/09 e 24/09, não em 17/09 nem 01/10.
    expect(hits).toEqual([1, 0, 1, 0]);
  });

  it('diária vira weekly com os sete dias', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Treino', 'DTSTART:20260915T070000', 'DTEND:20260915T080000', 'RRULE:FREQ=DAILY')),
      RANGE,
    );
    const [s] = series(plan);
    expect(s.freq).toBe('weekly');
    expect(s.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('mensal simples vira monthly e cai só no dia do mês', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Consulta', 'DTSTART:20260915T090000', 'DTEND:20260915T100000', 'RRULE:FREQ=MONTHLY')),
      RANGE,
    );
    const [s] = series(plan);
    expect(s.freq).toBe('monthly');
    const asApp: RecurringEventSeries = { id: 'm', name: s.name, start: s.start, end: s.end, weekdays: s.weekdays, freq: 'monthly', anchor: s.anchor };
    expect(expandEventsForDate('2026-10-15', {}, [asApp])).toHaveLength(1);
    expect(expandEventsForDate('2026-10-16', {}, [asApp])).toHaveLength(0);
  });

  it('EXDATE vira exceção da série', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Aula',
          'DTSTART:20260915T100000',
          'DTEND:20260915T110000',
          'RRULE:FREQ=WEEKLY;BYDAY=TU',
          'EXDATE:20260922T100000',
        ),
      ),
      RANGE,
    );
    const [s] = series(plan);
    expect(s.exceptions).toContain('2026-09-22');
  });
});

describe('readIcs — recorrência que não cabe na série', () => {
  it('a cada 3 semanas vira lista de datas', () => {
    const plan = readIcs(
      ics(
        ...vevent(
          'UID:a@x',
          'SUMMARY:Reunião',
          'DTSTART:20260915T160000',
          'DTEND:20260915T170000',
          'RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=TU;COUNT=4',
        ),
      ),
      RANGE,
    );
    const [d] = dated(plan);
    expect(d.notes).toContain('expanded');
    expect(d.dates).toEqual(['2026-09-15', '2026-10-06', '2026-10-27', '2026-11-17']);
  });

  it('COUNT limita as ocorrências', () => {
    const plan = readIcs(
      ics(
        ...vevent('UID:a@x', 'SUMMARY:Aula', 'DTSTART:20260915T100000', 'DTEND:20260915T110000', 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3'),
      ),
      RANGE,
    );
    expect(itemOccurrences(plan.items[0])).toBe(3);
  });

  it('"terceira quinta do mês" não vira série torta', () => {
    const plan = readIcs(
      ics(
        ...vevent('UID:a@x', 'SUMMARY:Colegiado', 'DTSTART:20260917T180000', 'DTEND:20260917T190000', 'RRULE:FREQ=MONTHLY;BYDAY=3TH'),
      ),
      RANGE,
    );
    expect(series(plan)).toHaveLength(0);
    expect(dated(plan)).toHaveLength(1);
  });

  it('"terceira quinta do mês" cai na terceira quinta, não no dia do mês', () => {
    const plan = readIcs(
      ics(
        ...vevent('UID:a@x', 'SUMMARY:Colegiado', 'DTSTART:20260917T180000', 'DTEND:20260917T190000', 'RRULE:FREQ=MONTHLY;BYDAY=3TH'),
      ),
      { from: '2026-09-10', to: '2026-12-31' },
    );
    // Set: 3, 10, 17 → 17/09. Out: 1, 8, 15 → 15/10. Nov: 5, 12, 19 → 19/11. Dez: 3, 10, 17 → 17/12.
    expect(dated(plan)[0].dates).toEqual(['2026-09-17', '2026-10-15', '2026-11-19', '2026-12-17']);
  });

  it('"última sexta do mês" conta de trás pra frente', () => {
    const plan = readIcs(
      ics(
        ...vevent('UID:a@x', 'SUMMARY:Fechamento', 'DTSTART:20260925T170000', 'DTEND:20260925T180000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR'),
      ),
      { from: '2026-09-10', to: '2026-11-30' },
    );
    // Últimas sextas: 25/09, 30/10, 27/11.
    expect(dated(plan)[0].dates).toEqual(['2026-09-25', '2026-10-30', '2026-11-27']);
  });
});

describe('readIcs — ocorrência modificada (RECURRENCE-ID)', () => {
  it('vira exceção na série mãe mais um avulso naquele dia', () => {
    const plan = readIcs(
      ics(
        ...vevent('UID:a@x', 'SUMMARY:Aula', 'DTSTART:20260915T100000', 'DTEND:20260915T110000', 'RRULE:FREQ=WEEKLY;BYDAY=TU'),
        ...vevent(
          'UID:a@x',
          'RECURRENCE-ID:20260922T100000',
          'SUMMARY:Aula (sala trocada)',
          'DTSTART:20260922T140000',
          'DTEND:20260922T150000',
        ),
      ),
      RANGE,
    );
    const [s] = series(plan);
    expect(s.exceptions).toContain('2026-09-22');
    const [d] = dated(plan);
    expect(d.dates).toEqual(['2026-09-22']);
    expect(d.start).toBe('14:00');
    // Identidade própria: reimportar não confunde com a série.
    expect(d.uid).not.toBe(s.uid);
  });
});

describe('readIcs — robustez', () => {
  it('arquivo vazio ou lixo não quebra', () => {
    expect(readIcs('', RANGE).items).toHaveLength(0);
    expect(readIcs('isto não é um ics', RANGE).items).toHaveLength(0);
  });

  it('repetição infinita para no horizonte', () => {
    const plan = readIcs(
      ics(...vevent('UID:a@x', 'SUMMARY:Diário', 'DTSTART:20260910T080000', 'DTEND:20260910T090000', 'RRULE:FREQ=DAILY')),
      { from: '2026-09-10', to: '2026-09-20' },
    );
    expect(itemOccurrences(plan.items[0])).toBe(11);
  });
});
