// Importar calendário (.ics) — o caso de uso entre o parser puro (`domain/ics.ts`)
// e a tela de revisão.
//
// O horizonte é daqui pra frente: um .ics de semestre carrega o passado junto, e
// mexer em dia já fechado não é importar, é reescrever histórico.
//
// Reimportar o mesmo arquivo **substitui** o que veio dele antes, em vez de
// duplicar: cada item entra carimbado com `externalId = ics:<UID>`, e aplicar
// começa apagando o que tem o mesmo carimbo. Evento digitado à mão não tem
// carimbo nenhum, então nenhuma importação encosta nele.

import { readIcs, itemOccurrences } from '../domain/ics';
import type { IcsImportPlan, IcsItem } from '../domain/ics';
import { dk } from '../domain/time';
import type { DateKey, RecurringEventSeries, StudyEvent } from '../domain/types';
import { readFileText } from '../infrastructure/fileText';
import { notify, state } from '../store/store';
import { clearBlockCache, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

/** Sem `periodEnd`, um ano pra frente é horizonte de sobra pra uma grade de aulas. */
const DEFAULT_HORIZON_DAYS = 365;

const externalIdOf = (uid: string) => `ics:${uid}`;

export type IcsLoadResult =
  | { ok: true; plan: IcsImportPlan }
  | { ok: false; reason: 'unreadable' | 'not-ics' | 'empty' };

function horizon(): { from: DateKey; to: DateKey } {
  const today = new Date();
  const from = dk(today);
  const far = new Date(today);
  far.setDate(far.getDate() + DEFAULT_HORIZON_DAYS);
  const end = state.config?.periodEnd;
  const to = dk(far);
  return { from, to: end && end < to ? end : to };
}

/** Lê o arquivo escolhido e monta o plano de importação pra revisão. */
export async function loadIcsFile(file: Blob): Promise<IcsLoadResult> {
  const text = await readFileText(file);
  if (text === null) return { ok: false, reason: 'unreadable' };
  if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, reason: 'not-ics' };
  const plan = readIcs(text, horizon());
  if (plan.items.length === 0 && plan.skipped.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, plan };
}

/** O que o usuário decidiu sobre cada item da revisão, por `uid`. */
export interface ImportChoice {
  include: boolean;
  /** Aula conta como estudo (XP); consulta médica só bloqueia o tempo. */
  countsAsStudy: boolean;
}

export interface ImportResult {
  /** Séries criadas. */
  series: number;
  /** Compromissos avulsos criados. */
  events: number;
  /** Itens de uma importação anterior que foram substituídos. */
  replaced: number;
}

/** Apaga o que veio antes destes mesmos UIDs — é o que faz reimportar não duplicar. */
function dropPrevious(ids: Set<string>): number {
  let removed = 0;
  const keptSeries = (state.eventSeries ?? []).filter((s) => {
    const hit = !!s.externalId && ids.has(s.externalId);
    if (hit) removed++;
    return !hit;
  });
  state.eventSeries = keptSeries;
  for (const [day, list] of Object.entries(state.events ?? {})) {
    const kept = list.filter((e) => {
      const hit = !!e.externalId && ids.has(e.externalId);
      if (hit) removed++;
      return !hit;
    });
    if (kept.length === list.length) continue;
    if (kept.length === 0) delete state.events[day];
    else state.events[day] = kept;
  }
  return removed;
}

function addSeries(item: Extract<IcsItem, { kind: 'series' }>, countsAsStudy: boolean): void {
  const series: RecurringEventSeries = {
    id: `ser_ics_${Math.random().toString(36).slice(2, 9)}`,
    name: item.name,
    start: item.start,
    end: item.end,
    weekdays: item.weekdays,
    freq: item.freq,
    anchor: item.anchor,
    until: item.until,
    exceptions: item.exceptions,
    countsAsStudy,
    externalId: externalIdOf(item.uid),
  };
  state.eventSeries.push(series);
}

function addDates(item: Extract<IcsItem, { kind: 'dates' }>, countsAsStudy: boolean): number {
  const event = (): StudyEvent => ({
    name: item.name,
    start: item.start,
    end: item.end,
    countsAsStudy,
    externalId: externalIdOf(item.uid),
  });
  for (const day of item.dates) {
    const list = state.events[day] ?? (state.events[day] = []);
    list.push(event());
  }
  return item.dates.length;
}

/**
 * Aplica a importação. Só entra o que o usuário marcou; o resto do arquivo é
 * esquecido (nada fica guardado pra "depois").
 */
export function applyIcsImport(plan: IcsImportPlan, choices: Record<string, ImportChoice>): ImportResult {
  const chosen = plan.items.filter((i) => choices[i.uid]?.include);
  if (chosen.length === 0) return { series: 0, events: 0, replaced: 0 };

  if (!state.eventSeries) state.eventSeries = [];
  const replaced = dropPrevious(new Set(chosen.map((i) => externalIdOf(i.uid))));

  let series = 0;
  let events = 0;
  for (const item of chosen) {
    const countsAsStudy = choices[item.uid]?.countsAsStudy ?? false;
    if (item.kind === 'series') {
      addSeries(item, countsAsStudy);
      series++;
    } else {
      events += addDates(item, countsAsStudy);
    }
  }

  clearBlockCache();
  rebuildWeeks();
  scheduleSave();
  notify();
  return { series, events, replaced };
}

/** Quantos compromissos o que está marcado põe no plano — o número do botão. */
export function countChosen(plan: IcsImportPlan, choices: Record<string, ImportChoice>): number {
  return plan.items.reduce((sum, i) => (choices[i.uid]?.include ? sum + itemOccurrences(i) : sum), 0);
}
