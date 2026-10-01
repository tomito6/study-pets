// O ritmo do pomodoro SÓ DE UM DIA ("hoje vou de 50 · 10"). É a outra metade das janelas
// do dia: a rotina (Configurações → Estrutura da rotina) vale pra todo dia que não tem um
// ritmo próprio, e o modal "🕘 Estrutura do dia" muda só o dia dele. São duas coisas
// diferentes de propósito — o nome de cada tela já diz qual é qual.
//
// O que fica guardado é uma lista por dia. Uma entrada sem `from` é o ritmo do dia
// INTEIRO (o dia ainda não tinha começado quando foi escolhido); uma entrada com `from` é
// uma troca no meio do dia: vale pro primeiro bloco que começa naquele minuto ou depois, e
// o que já foi vivido fica como estava (quem garante é o gerador — ver `RhythmChange`).
// Os números vão por extenso em cada entrada, então mudar a rotina em dezembro não mexe
// num dia de setembro que tinha ritmo próprio.
//
// Puro. Quem sabe se o dia "já começou" é a aplicação (application/dayWindows.ts).

import { timeToMins } from './time';
import type { DateKey, LiveRhythm, RhythmChange, TimeString, UserConfig } from './types';

export interface DayRhythmEntry extends LiveRhythm {
  /** Ausente = o dia inteiro. Presente = vale pros blocos que começam deste minuto em diante. */
  from?: TimeString;
}

export type DayRhythms = Record<DateKey, DayRhythmEntry[]>;

/** A config de um dia já com o ritmo dele: é o que `configAtDay` devolve e o gerador lê. */
export type DayConfig = UserConfig & { rhythmChanges?: RhythmChange[] };

export const RHYTHM_MIN = 1;
export const RHYTHM_MAX = 600;

export const sameRhythm = (a: LiveRhythm, b: LiveRhythm): boolean =>
  a.pomo === b.pomo && a.shortBreak === b.shortBreak && a.longBreak === b.longBreak;

const onlyRhythm = (r: LiveRhythm): LiveRhythm => ({ pomo: r.pomo, shortBreak: r.shortBreak, longBreak: r.longBreak });

/** Três inteiros de 1 a 600 min. (A rotina não tem teto; aqui ele existe pra um dedo a mais não gerar um bloco de 16 horas.) */
export const isValidRhythm = (r: LiveRhythm): boolean =>
  [r.pomo, r.shortBreak, r.longBreak].every((n) => Number.isInteger(n) && n >= RHYTHM_MIN && n <= RHYTHM_MAX);

/** Os três campos como a pessoa digita — texto, pra permitir campo vazio no meio da edição. */
export interface RhythmDraft {
  pomo: string;
  shortBreak: string;
  longBreak: string;
}

export const rhythmDraftOf = (r: LiveRhythm): RhythmDraft => ({
  pomo: String(r.pomo),
  shortBreak: String(r.shortBreak),
  longBreak: String(r.longBreak),
});

/** O rascunho como ritmo, ou `null` se algum campo está vazio ou fora da faixa. */
export function parseRhythmDraft(d: RhythmDraft): LiveRhythm | null {
  const n = (s: string): number => (/^\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN);
  const r = { pomo: n(d.pomo), shortBreak: n(d.shortBreak), longBreak: n(d.longBreak) };
  return isValidRhythm(r) ? r : null;
}

const wholeDay = (entries: DayRhythmEntry[] | null | undefined): DayRhythmEntry | null =>
  entries?.find((e) => !e.from) ?? null;

const changesOf = (entries: DayRhythmEntry[] | null | undefined): DayRhythmEntry[] =>
  (entries ?? []).filter((e) => !!e.from).sort((a, b) => timeToMins(a.from!) - timeToMins(b.from!));

/** A troca em vigor num minuto do dia (a última com `from` ≤ ele), ou `null`. Sem minuto: a última do dia. */
export function changeInEffect(entries: DayRhythmEntry[] | null | undefined, minute?: number): LiveRhythm | null {
  let hit: DayRhythmEntry | null = null;
  for (const e of changesOf(entries)) if (minute === undefined || timeToMins(e.from!) <= minute) hit = e;
  return hit ? onlyRhythm(hit) : null;
}

/**
 * O ritmo com que nasce um bloco que começa em `minute` (sem minuto: o que vale do fim do
 * dia — "de agora em diante"): a troca em vigor, senão o ritmo do dia inteiro, senão a rotina.
 */
export function rhythmInEffect(routine: LiveRhythm, entries: DayRhythmEntry[] | null | undefined, minute?: number): LiveRhythm {
  const whole = wholeDay(entries);
  return changeInEffect(entries, minute) ?? (whole ? onlyRhythm(whole) : onlyRhythm(routine));
}

/** A config do dia com o ritmo dele: a base trocada (dia inteiro) e as trocas do meio do dia pro gerador. */
export function withDayRhythm(cfg: UserConfig, entries: DayRhythmEntry[] | null | undefined): DayConfig {
  if (!entries || entries.length === 0) return cfg;
  const whole = wholeDay(entries);
  const out: DayConfig = whole ? { ...cfg, ...onlyRhythm(whole) } : { ...cfg };
  const changes = changesOf(entries).map((e) => ({ at: e.from!, ...onlyRhythm(e) }));
  if (changes.length > 0) out.rhythmChanges = changes;
  return out;
}

/** O dia inteiro passa a ter este ritmo. Igual ao da rotina = sem ritmo próprio (`null`: o dia volta a seguir a rotina). */
export function wholeDayRhythm(rhythm: LiveRhythm, routine: LiveRhythm): DayRhythmEntry[] | null {
  return sameRhythm(rhythm, routine) ? null : [onlyRhythm(rhythm)];
}

/**
 * O ritmo muda a partir de `at`: o que veio antes fica (as entradas anteriores continuam
 * na lista — elas são o registro de como o dia foi vivido). Uma troca no mesmo minuto, ou
 * depois dele, é substituída: ela nunca chegou a valer pra bloco nenhum.
 */
export function rhythmChangeFrom(entries: DayRhythmEntry[] | null | undefined, at: TimeString, rhythm: LiveRhythm): DayRhythmEntry[] {
  const corte = timeToMins(at);
  const antes = (entries ?? []).filter((e) => !e.from || timeToMins(e.from) < corte);
  return [...antes, { ...onlyRhythm(rhythm), from: at }];
}

// ---------------------------------------------------------------- leitura do documento

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isDay = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is TimeString => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

/**
 * Campo cru do documento → só os dias com pelo menos uma entrada válida. Uma entrada de
 * dia inteiro por dia (a primeira vence), as trocas em ordem e sem `from` repetido (a
 * última escrita vence — é a que substituiu a anterior).
 */
export function normalizeDayRhythms(raw: unknown): DayRhythms {
  if (!isObj(raw)) return {};
  const out: DayRhythms = {};
  for (const [day, list] of Object.entries(raw)) {
    if (!isDay(day) || !Array.isArray(list)) continue;
    let whole: DayRhythmEntry | null = null;
    const byFrom = new Map<TimeString, DayRhythmEntry>();
    for (const e of list) {
      if (!isObj(e)) continue;
      const r = { pomo: e.pomo as number, shortBreak: e.shortBreak as number, longBreak: e.longBreak as number };
      if (!isValidRhythm(r)) continue;
      if (e.from === undefined || e.from === null) whole ??= r;
      else if (isTime(e.from)) byFrom.set(e.from, { ...r, from: e.from });
    }
    const entries = [...(whole ? [whole] : []), ...[...byFrom.values()].sort((a, b) => timeToMins(a.from!) - timeToMins(b.from!))];
    if (entries.length > 0) out[day] = entries;
  }
  return out;
}
