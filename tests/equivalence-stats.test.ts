// Equivalência do computeStats/calcStreaks com a versão pré-migração.
//
// `_legacy-stats.mjs` contém o corpo original intacto; só as variáveis livres que
// ele lia (state, forEachDay, blocksForDay, ...) viraram parâmetros. Aqui os dois
// recebem exatamente os mesmos dados e a saída é comparada campo a campo.
//
// Some do repo quando o legado sair.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — harness JS sem tipos, de propósito.
import { makeLegacy } from './_legacy-stats.mjs';
import { calcStreaks, computeStats } from '../src/domain/stats';
import { generateBlocks } from '../src/domain/planner';
import { coinsForBlock, dailyBonusForStreak, xpFromCheck } from '../src/domain/progression';
import { dk, timeToMins } from '../src/domain/time';
import { isChecked as isCheckedPure, isDayClosed as isDayClosedPure } from '../src/domain/checks';
import type { ChecksByDate, DateKey, PlannerConfig, StudyEvent } from '../src/domain/types';

const HOJE = '2026-09-02';

beforeAll(() => {
  // O código antigo chama `new Date()` lá dentro; fixamos o relógio pros dois lados.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-02T14:30:00'));
});
afterAll(() => {
  vi.useRealTimers();
});

/** Gera uma sequência de dias corridos terminando em HOJE. */
function diasAte(qtd: number): Array<{ key: DateKey; date: Date; weekIdx: number }> {
  const out: Array<{ key: DateKey; date: Date; weekIdx: number }> = [];
  const fim = new Date('2026-09-02T12:00:00');
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(fim);
    d.setDate(d.getDate() - i);
    out.push({ key: dk(d), date: d, weekIdx: Math.floor((qtd - 1 - i) / 7) });
  }
  return out;
}

const cfgBase: PlannerConfig = {
  studyWindows: [{ start: '09:00', end: '18:00' }],
  start: '09:00',
  end: '18:00',
  lunch: '13:00',
  lunchDur: 60,
  hasLunch: true,
  pomo: 25,
  shortBreak: 5,
  longBreak: 20,
};

/** PRNG determinístico — o teste precisa ser reprodutível. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface Cenario {
  nome: string;
  dias: Array<{ key: DateKey; date: Date; weekIdx: number }>;
  cfg: PlannerConfig;
  eventosPorDia: Record<DateKey, StudyEvent[]>;
  checks: ChecksByDate;
  closedDays: Record<DateKey, boolean>;
  dailyStudyMin: number;
  uiWeek: number;
  uiDay: number;
}

function gerarCenarios(): Cenario[] {
  const cenarios: Cenario[] = [];
  const pomos = [20, 25, 30, 50];
  const metas = [0, 30, 60, 120];

  for (let seed = 1; seed <= 40; seed++) {
    const rand = rng(seed * 7919);
    const dias = diasAte(14 + Math.floor(rand() * 14));
    const cfg: PlannerConfig = {
      ...cfgBase,
      pomo: pomos[Math.floor(rand() * pomos.length)]!,
      hasLunch: rand() > 0.3,
      studyWindows:
        rand() > 0.5
          ? [{ start: '09:00', end: '18:00' }]
          : [
              { start: '08:00', end: '12:00' },
              { start: '14:30', end: '19:00' },
            ],
    };

    const eventosPorDia: Record<DateKey, StudyEvent[]> = {};
    const checks: ChecksByDate = {};
    const closedDays: Record<DateKey, boolean> = {};

    for (const { key } of dias) {
      if (rand() > 0.7) {
        eventosPorDia[key] = [
          {
            name: 'Aula',
            start: '10:00',
            end: '11:30',
            countsAsStudy: rand() > 0.3,
          },
        ];
      }
      if (rand() > 0.75) closedDays[key] = true;

      const blocos = generateBlocks(cfg, eventosPorDia[key] || []);
      for (const b of blocos) {
        if (b.type === 'almoco' || b.type === 'intervalo') continue;
        if (rand() > 0.45) continue;
        if (!checks[key]) checks[key] = {};
        const sorteio = rand();
        // Mistura os três formatos de check que existem em dados reais.
        checks[key]![b.time] =
          sorteio > 0.85
            ? true
            : sorteio > 0.55
              ? { pet: 'owl', bonus: 0.05 }
              : { pet: 'cat', bonus: 0 };
      }
    }

    cenarios.push({
      nome: `seed=${seed}`,
      dias,
      cfg,
      eventosPorDia,
      checks,
      closedDays,
      dailyStudyMin: metas[Math.floor(rand() * metas.length)]!,
      uiWeek: 1,
      uiDay: Math.floor(rand() * 7),
    });
  }
  return cenarios;
}

function rodarLegado(c: Cenario) {
  const state = {
    config: { ...c.cfg, dailyStudyMin: c.dailyStudyMin },
    checks: c.checks,
    closedDays: c.closedDays,
    uiWeek: c.uiWeek,
    uiDay: c.uiDay,
  };
  const blocksForDay = (key: DateKey) => generateBlocks(c.cfg, c.eventosPorDia[key] || []);
  const legacy = makeLegacy({
    state,
    forEachDay: (cb: (k: DateKey, d: Date, wi: number, di: number) => void) =>
      c.dias.forEach(({ key, date, weekIdx }, i) => cb(key, date, weekIdx, i % 7)),
    blocksForDay,
    isChecked: (k: DateKey, t: string) => isCheckedPure(c.checks, k, t),
    isDayClosed: (k: DateKey) => isDayClosedPure(c.closedDays, k),
    dk,
    dateForWeekDay: () => c.dias[c.dias.length - 1]!.date,
    timeToMins,
    xpFromCheck,
    coinsForBlock,
    dailyBonusForStreak,
  });
  return legacy;
}

function rodarNovo(c: Cenario) {
  return computeStats({
    days: c.dias,
    getBlocks: (key) => generateBlocks(c.cfg, c.eventosPorDia[key] || []),
    checks: c.checks,
    dayClosed: (k) => isDayClosedPure(c.closedDays, k),
    todayKey: HOJE,
    currentDayKey: dk(c.dias[c.dias.length - 1]!.date),
    currentWeekIdx: c.uiWeek - 1,
    dailyStudyMin: c.dailyStudyMin,
  });
}

describe('equivalência do computeStats com a versão antiga', () => {
  const cenarios = gerarCenarios();

  it('gera cenários com dados variados', () => {
    expect(cenarios.length).toBe(40);
    const comCheck = cenarios.filter((c) => Object.keys(c.checks).length > 0);
    expect(comCheck.length).toBeGreaterThan(30);
  });

  it('produz estatísticas idênticas em todos os cenários', () => {
    const divergentes: string[] = [];
    for (const c of cenarios) {
      const antigo = JSON.stringify(rodarLegado(c).computeStats());
      const novo = JSON.stringify(rodarNovo(c));
      if (antigo !== novo) divergentes.push(c.nome);
    }
    expect(divergentes).toEqual([]);
  });

  it('calcula as sequências igual à versão antiga', () => {
    const divergentes: string[] = [];
    for (const c of cenarios) {
      const legacy = rodarLegado(c);
      const dayStudyMins = legacy.computeStats().dayStudyMins;
      const antigo = JSON.stringify(legacy.calcStreaks(dayStudyMins));
      const novo = JSON.stringify(
        calcStreaks(
          dayStudyMins,
          c.dias.map((d) => d.key),
          HOJE,
          c.dailyStudyMin || 60,
        ),
      );
      if (antigo !== novo) divergentes.push(c.nome);
    }
    expect(divergentes).toEqual([]);
  });
});
