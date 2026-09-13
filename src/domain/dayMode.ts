// De que jeito um dia nasce: **pela rotina** (o dia vem montado das janelas de estudo,
// que é como o app sempre funcionou) ou **ao vivo** (o dia começa quando você aperta
// Começar, e um pomodoro emenda no outro até você parar).
//
// Puro. Quem guarda é `state.dayModes` (a escolha de um dia) e `config.dayMode` (o
// padrão de quem já decidiu que prefere um dos dois).

import type { DateKey } from './types';

export type DayMode = 'rotina' | 'live';

/** A escolha explícita de um dia. Dia sem entrada segue o padrão. */
export type DayModes = Record<DateKey, DayMode>;

/**
 * O padrão de quem virou a chave: vale **de `since` em diante**, nunca pra trás.
 *
 * O `since` não é detalhe, é o que impede um desastre. Sem ele a leitura só poderia ser
 * retroativa: todo dia passado sem janela editada viraria "ao vivo sem corrida", o
 * gerador devolveria lista vazia pra cada um, e XP total, nível, moedas, sequência,
 * melhor dia e o heatmap inteiro sumiriam da tela num clique.
 */
export interface DayModeDefault {
  mode: DayMode;
  since: DateKey;
}

/**
 * O modo de um dia: a escolha explícita dele vence; senão o padrão, se o dia é de
 * `since` em diante; senão rotina, que é como o app sempre funcionou.
 */
export function modeForDay(
  dateKey: DateKey,
  dayModes: DayModes | undefined,
  padrao: DayModeDefault | null | undefined,
): DayMode {
  const escolhido = dayModes?.[dateKey];
  if (escolhido) return escolhido;
  if (padrao && dateKey >= padrao.since) return padrao.mode;
  return 'rotina';
}

const isMode = (v: unknown): v is DayMode => v === 'rotina' || v === 'live';
const isDay = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Campo cru do documento → só os dias com um modo conhecido. */
export function normalizeDayModes(raw: unknown): DayModes {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: DayModes = {};
  for (const [k, v] of Object.entries(raw)) if (isDay(k) && isMode(v)) out[k] = v;
  return out;
}

/** Campo cru → o padrão, ou `null`. Sem `since` válido não há padrão: ver `DayModeDefault`. */
export function normalizeDayModeDefault(raw: unknown): DayModeDefault | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return isMode(r.mode) && isDay(r.since) ? { mode: r.mode, since: r.since } : null;
}
