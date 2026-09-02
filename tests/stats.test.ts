import { describe, expect, it } from 'vitest';
import { calcStreaks, computeStats } from '../src/domain/stats';
import type { StatsInput } from '../src/domain/stats';
import type { ChecksByDate, StudyBlock } from '../src/domain/types';

const ANTEONTEM = '2026-08-31';
const ONTEM = '2026-09-01';
const HOJE = '2026-09-02';

const dia = (key: string, weekIdx = 0) => ({
  key,
  date: new Date(`${key}T12:00:00`),
  weekIdx,
});

const estudo = (time: string, endTime: string, session = 0): StudyBlock => {
  const [h1, m1] = time.split(':').map(Number);
  const [h2, m2] = endTime.split(':').map(Number);
  const dur = (h2! * 60 + m2!) - (h1! * 60 + m1!);
  return { time, endTime, name: `📖 Estudo ${time}`, type: 'estudo', xp: dur * 2, session };
};

const pausa = (time: string, endTime: string): StudyBlock => ({
  time,
  endTime,
  name: '🧘 Pausa',
  type: 'pausa',
  xp: 5,
  session: 0,
});

const evento = (time: string, endTime: string): StudyBlock => {
  const [h1, m1] = time.split(':').map(Number);
  const [h2, m2] = endTime.split(':').map(Number);
  const dur = (h2! * 60 + m2!) - (h1! * 60 + m1!);
  return { time, endTime, name: '📅 Aula', type: 'event', xp: dur * 2, session: 0 };
};

/** Um dia de 2h: dois pomos de 30 com uma pausa no meio. */
const diaPadrao = (): StudyBlock[] => [
  estudo('09:00', '09:30'),
  pausa('09:30', '09:35'),
  estudo('09:35', '10:05'),
];

const entrada = (over: Partial<StatsInput> = {}): StatsInput => ({
  days: [dia(ONTEM), dia(HOJE)],
  getBlocks: diaPadrao,
  checks: {},
  dayClosed: () => false,
  todayKey: HOJE,
  currentDayKey: HOJE,
  currentWeekIdx: 0,
  dailyStudyMin: 60,
  ...over,
});

const marcandoTudo = (key: string, times: string[]): ChecksByDate => ({
  [key]: Object.fromEntries(times.map((t) => [t, { pet: 'cat', bonus: 0 }])),
});

describe('computeStats — XP e moedas só entram quando o dia fecha', () => {
  it('dia passado marcado soma nos totais', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(ONTEM, ['09:00', '09:35']) }));
    expect(stats.totalXP).toBe(120); // 2 pomos de 30 min = 2 × 60 XP
    expect(stats.totalChecks).toBe(2);
    expect(stats.coins).toBe(65); // 60 moedas de estudo + 5 do bônus de streak (1º dia)
    expect(stats.studyMins).toBe(60);
  });

  it('hoje ainda aberto NÃO soma nos totais', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(HOJE, ['09:00', '09:35']) }));
    expect(stats.totalXP).toBe(0);
    expect(stats.totalChecks).toBe(0);
    expect(stats.studyMins).toBe(0);
  });

  it('mas expõe o ganho de hoje como pendente', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(HOJE, ['09:00', '09:35']) }));
    expect(stats.todayXP).toBe(120);
    expect(stats.todayChecks).toBe(2);
    expect(stats.todayCoins).toBe(65);
  });

  it('hoje encerrado manualmente passa a contar nos totais', () => {
    const stats = computeStats(
      entrada({ checks: marcandoTudo(HOJE, ['09:00', '09:35']), dayClosed: (k) => k === HOJE }),
    );
    expect(stats.totalXP).toBe(120);
    expect(stats.coins).toBe(65);
  });

  it('aplica o bônus salvo no check', () => {
    const checks: ChecksByDate = { [ONTEM]: { '09:00': { pet: 'owl', bonus: 0.05 } } };
    expect(computeStats(entrada({ checks })).totalXP).toBe(63); // 60 × 1.05
  });
});

describe('computeStats — o que conta como estudo', () => {
  it('pausa marcada dá XP mas não moeda nem minuto de estudo', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(ONTEM, ['09:30']) }));
    expect(stats.totalXP).toBe(5);
    expect(stats.coins).toBe(0);
    expect(stats.studyMins).toBe(0);
  });

  it('evento marcado conta igual a estudo', () => {
    const stats = computeStats(
      entrada({ getBlocks: () => [evento('09:00', '10:30')], checks: marcandoTudo(ONTEM, ['09:00']) }),
    );
    expect(stats.studyMins).toBe(90);
    expect(stats.coins).toBe(90 + 5); // 1 moeda/min + bônus de streak
    expect(stats.totalXP).toBe(180);
  });

  it('conta as horas em que os blocos foram marcados', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(ONTEM, ['09:00', '09:35']) }));
    expect(stats.hourCounts).toEqual({ 9: 2 });
  });
});

describe('computeStats — aderência inclui hoje de propósito', () => {
  it('conta o planejado de todos os dias', () => {
    const stats = computeStats(entrada());
    expect(stats.dayStudyPlanned[ONTEM]).toBe(60);
    expect(stats.dayStudyPlanned[HOJE]).toBe(60);
  });

  it('conta o cumprido de hoje mesmo com o dia aberto', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(HOJE, ['09:00']) }));
    expect(stats.dayStudyDoneMins[HOJE]).toBe(30);
  });

  it('marca se o dia bateu a meta', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(ONTEM, ['09:00', '09:35']) }));
    expect(stats.dayMetGoal[ONTEM]).toBe(true);
    expect(stats.dayMetGoal[HOJE]).toBe(false);
  });

  it('respeita uma meta diária diferente', () => {
    const stats = computeStats(
      entrada({ checks: marcandoTudo(ONTEM, ['09:00']), dailyStudyMin: 30 }),
    );
    expect(stats.dayMetGoal[ONTEM]).toBe(true);
  });
});

describe('computeStats — streak e bônus', () => {
  it('dá bônus de streak crescente em dias seguidos que batem a meta', () => {
    const checks: ChecksByDate = {
      ...marcandoTudo(ANTEONTEM, ['09:00', '09:35']),
      ...marcandoTudo(ONTEM, ['09:00', '09:35']),
    };
    const stats = computeStats(entrada({ days: [dia(ANTEONTEM), dia(ONTEM), dia(HOJE)], checks }));
    // 2 dias × 60 moedas de estudo, mais bônus do 1º e do 2º dia de streak (5 + 5).
    expect(stats.coins).toBe(120 + 10);
  });

  it('não dá bônus de streak em dia que não bateu a meta', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(ONTEM, ['09:00']) }));
    expect(stats.coins).toBe(30); // só a moeda do estudo, sem bônus
  });

  it('o bônus de hoje fica em todayCoins, não nas moedas totais', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(HOJE, ['09:00', '09:35']) }));
    expect(stats.coins).toBe(0);
    expect(stats.todayCoins).toBe(65);
  });
});

describe('computeStats — recordes e agregados por semana', () => {
  it('registra o melhor dia por número de checks', () => {
    const stats = computeStats(entrada({ checks: marcandoTudo(ONTEM, ['09:00', '09:35']) }));
    expect(stats.bestDayChecks).toBe(2);
    expect(stats.bestDayLabel).toBe('01/09');
  });

  it('soma XP por semana e acha a melhor', () => {
    const checks: ChecksByDate = {
      ...marcandoTudo(ANTEONTEM, ['09:00']),
      ...marcandoTudo(ONTEM, ['09:00', '09:35']),
    };
    const stats = computeStats(
      entrada({ days: [dia(ANTEONTEM, 0), dia(ONTEM, 1), dia(HOJE, 1)], checks }),
    );
    expect(stats.weekXP[0]).toBe(60);
    expect(stats.weekXP[1]).toBe(120);
    expect(stats.bestWeekChecks).toBe(2);
    expect(stats.activeWeeks).toBe(2);
  });

  it('conta conclusão por sessão só de dias fechados', () => {
    const blocos = () => [estudo('09:00', '09:30', 0), estudo('09:35', '10:05', 1)];
    const stats = computeStats(
      entrada({ getBlocks: blocos, checks: marcandoTudo(ONTEM, ['09:00']) }),
    );
    expect(stats.sessionStats[0]).toEqual({ done: 1, total: 1 });
    expect(stats.sessionStats[1]).toEqual({ done: 0, total: 1 });
  });

  it('não conta sessão de dia ainda aberto', () => {
    const stats = computeStats(entrada({ days: [dia(HOJE)] }));
    expect(stats.sessionStats).toEqual({});
  });
});

describe('computeStats — contadores do dia visível na UI', () => {
  it('conta estudos e pausas do dia que está na tela', () => {
    const stats = computeStats(
      entrada({ currentDayKey: ONTEM, checks: marcandoTudo(ONTEM, ['09:00', '09:30']) }),
    );
    expect(stats.estudosToday).toEqual({ done: 1, total: 2 });
    expect(stats.pausasToday).toEqual({ done: 1, total: 1 });
  });
});

describe('calcStreaks', () => {
  const dias = [ANTEONTEM, ONTEM, HOJE];

  it('conta a sequência atual até hoje', () => {
    const mins = { [ANTEONTEM]: 60, [ONTEM]: 60, [HOJE]: 60 };
    expect(calcStreaks(mins, dias, HOJE, 60)).toEqual({ cur: 3, best: 3 });
  });

  it('quebra a sequência num dia abaixo da meta', () => {
    const mins = { [ANTEONTEM]: 60, [ONTEM]: 10, [HOJE]: 60 };
    expect(calcStreaks(mins, dias, HOJE, 60)).toEqual({ cur: 1, best: 1 });
  });

  it('guarda a maior sequência mesmo depois de quebrar', () => {
    const dias5 = ['2026-08-28', '2026-08-29', ANTEONTEM, ONTEM, HOJE];
    const mins = { '2026-08-28': 60, '2026-08-29': 60, [ANTEONTEM]: 60, [ONTEM]: 0, [HOJE]: 60 };
    expect(calcStreaks(mins, dias5, HOJE, 60)).toEqual({ cur: 1, best: 3 });
  });

  it('sequência atual é zero quando hoje não bateu a meta', () => {
    const mins = { [ANTEONTEM]: 60, [ONTEM]: 60, [HOJE]: 0 };
    expect(calcStreaks(mins, dias, HOJE, 60).cur).toBe(0);
  });

  it('recalcula ao mudar a meta diária', () => {
    const mins = { [ANTEONTEM]: 30, [ONTEM]: 30, [HOJE]: 30 };
    expect(calcStreaks(mins, dias, HOJE, 60).cur).toBe(0);
    expect(calcStreaks(mins, dias, HOJE, 30).cur).toBe(3);
  });
});
