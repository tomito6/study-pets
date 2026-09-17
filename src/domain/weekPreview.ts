// "Como fica a semana": o que se lê de sete dias de plano — o resumo de cada dia, os
// totais e a legenda dos compromissos (a aula de ter/qui, o yoga de quarta, o almoço de
// todo dia). Puro: recebe os blocos já gerados, nunca gera plano.
//
// Nasceu do esboço "Direção A" de prototypes/estrutura-da-rotina.html (2026-09-16), com
// uma regra que o Tomi pediu: o compromisso é dito pelo NOME, nunca por um emoji — o
// app não tem como saber o ícone de "Dentista", e um evento sem ícone ficaria mudo.

import type { RestKind } from './dayWindows';
import { summarizePlan } from './settings';
import type { PlanSummary } from './settings';
import { eventDisplayName } from './timer';
import type { DateKey, StudyBlock, TimeString } from './types';

export interface WeekPreviewDay {
  key: DateKey;
  /** 0 = segunda … 6 = domingo. */
  dayIdx: number;
  /** Por que o dia está sem plano, ou null. */
  rest: RestKind | null;
  blocks: StudyBlock[];
  /** Só na variante "esta semana": o dia tem janela editada ou evento avulso. */
  changed: boolean;
}

/** Um compromisso da semana, com os dias em que aparece. */
export interface WeekEventLine {
  name: string;
  start: TimeString;
  end: TimeString;
  countsAsStudy: boolean;
  /** Índices dos dias (0 = segunda) em que ele cai. */
  days: number[];
  /** Cai em todos os dias que têm plano — "todo dia", em vez da lista. */
  everyDay: boolean;
}

export interface WeekTotals {
  studyMins: number;
  eventMins: number;
  pomos: number;
  totalXP: number;
  /** Dias com plano (folga fica de fora). */
  days: number;
}

/** O 📅 que o gerador põe na frente de evento sem ícone próprio não é nome — sai da legenda. */
// `eventDisplayName` mora em `domain/timer.ts`, junto de `cleanBlockName` (os dois são "o nome como aparece"); fica exportado daqui pra quem já importava.
export { eventDisplayName };

/**
 * Os compromissos da semana, agrupados por nome + horário, na ordem em que aparecem.
 * Quem cai em todos os dias com plano (a refeição) vira "todo dia".
 */
export function weekEventLines(days: WeekPreviewDay[]): WeekEventLine[] {
  const planned = days.filter((d) => d.rest === null && d.blocks.length > 0).length;
  const lines = new Map<string, WeekEventLine>();
  for (const d of days) {
    for (const b of d.blocks) {
      if (b.type !== 'event' && b.type !== 'intervalo') continue;
      const name = eventDisplayName(b.name);
      const id = `${name}|${b.time}|${b.endTime}|${b.type}`;
      let line = lines.get(id);
      if (!line) {
        line = { name, start: b.time, end: b.endTime, countsAsStudy: b.type === 'event', days: [], everyDay: false };
        lines.set(id, line);
      }
      if (!line.days.includes(d.dayIdx)) line.days.push(d.dayIdx);
    }
  }
  for (const line of lines.values()) line.everyDay = planned > 1 && line.days.length === planned;
  return [...lines.values()];
}

export const summarizeWeekDay = (d: WeekPreviewDay): PlanSummary => summarizePlan(d.blocks);

export function weekTotals(days: WeekPreviewDay[]): WeekTotals {
  const t: WeekTotals = { studyMins: 0, eventMins: 0, pomos: 0, totalXP: 0, days: 0 };
  for (const d of days) {
    if (d.rest !== null || d.blocks.length === 0) continue;
    const s = summarizePlan(d.blocks);
    t.studyMins += s.studyMins;
    t.eventMins += s.eventMins;
    t.pomos += s.pomos;
    t.totalXP += s.totalXP;
    t.days++;
  }
  return t;
}
