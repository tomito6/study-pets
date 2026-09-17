// Janelas de estudo só de um dia ("acordei tarde, hoje começo às 10") e o "dia
// livre". É a config daquele dia — nunca uma regra especial no gerador. Puro.
//
// Também decide o que é dia de descanso: fim de semana pausado (`skipWeekends`) ou
// dia declarado livre. Nos dois casos as janelas do dia mandam — abrir uma janela
// num sábado pausado faz daquele sábado um dia de estudo (um "dia bônus").

import { deriveStartEnd, isValidWindow } from './settings';
import { minsToTime, timeToMins } from './time';
import { pausedMinutes } from './pauses';
import type { DateKey, LiveRhythm, PauseRecord, StudyWindow, TimeString, UserConfig } from './types';

/** As janelas de um dia. Lista vazia = dia livre (o plano fica sem blocos). */
export interface DayWindowsOverride {
  studyWindows: StudyWindow[];
}

export type WindowOverrides = Record<DateKey, DayWindowsOverride>;

export const isDayOff = (ov: DayWindowsOverride | null | undefined): boolean => !!ov && ov.studyWindows.length === 0;

/** Por que um dia não tem blocos: fim de semana pausado ou dia declarado livre. */
export type RestKind = 'weekend' | 'off';

export interface RestDayInput {
  skipWeekends: boolean;
  isWeekend: boolean;
  override: DayWindowsOverride | null | undefined;
}

/**
 * O dia é de descanso? As janelas do dia mandam: com override, o dia só é livre se a
 * lista está vazia — janelas abertas num sábado desfazem a pausa daquele sábado. Sem
 * override, o fim de semana pausado descansa.
 */
export function restDayKind({ skipWeekends, isWeekend, override }: RestDayInput): RestKind | null {
  if (override) return override.studyWindows.length === 0 ? 'off' : null;
  return skipWeekends && isWeekend ? 'weekend' : null;
}

/**
 * Dia bônus: fim de semana pausado em que o usuário abriu janelas mesmo assim. É um dia
 * a mais, não uma obrigação — conta se bateu a meta, e não quebra a sequência se não
 * bateu. Estudar na folga nunca pode ser pior do que não estudar.
 */
export const isBonusDay = ({ skipWeekends, isWeekend, override }: RestDayInput): boolean =>
  skipWeekends && isWeekend && !!override && override.studyWindows.length > 0;

/** As janelas que valem pro dia: as editadas; nenhuma no fim de semana pausado; senão as da rotina. */
export function windowsForDay(
  config: Pick<UserConfig, 'studyWindows' | 'skipWeekends'>,
  override: DayWindowsOverride | null | undefined,
  isWeekend: boolean,
): StudyWindow[] {
  if (override) return override.studyWindows;
  if (config.skipWeekends && isWeekend) return [];
  return config.studyWindows;
}

/** A config efetiva do dia: as janelas do override no lugar das da rotina, com start/end derivados. */
export function configForDay(config: UserConfig, ov: DayWindowsOverride | null | undefined): UserConfig {
  if (!ov) return config;
  return { ...config, studyWindows: ov.studyWindows, ...deriveStartEnd(ov.studyWindows) };
}

export type DayWindowsValidation = { ok: true } | { ok: false; reason: 'empty' | 'invalid-window' | 'overlap' };

/** Mesma regra das janelas da rotina (fim depois do início), mais: sem sobreposição. Vazio só via "dia livre". */
export function validateDayWindows(windows: StudyWindow[]): DayWindowsValidation {
  if (windows.length === 0) return { ok: false, reason: 'empty' };
  if (!windows.every(isValidWindow)) return { ok: false, reason: 'invalid-window' };
  const sorted = [...windows].sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (timeToMins(sorted[i]!.start) < timeToMins(sorted[i - 1]!.end)) return { ok: false, reason: 'overlap' };
  }
  return { ok: true };
}

/** O dia parou: as janelas aparadas, ou o motivo de não haver o que aparar. */
export type StopDayResult = { ok: true; windows: StudyWindow[] } | { ok: false; reason: 'nothing-lived' };

/**
 * "■ Parar por aqui": o dia acaba no minuto em que a pessoa parou, e o que sobrou do
 * plano some — porque não aconteceu. Cada janela é aparada no corte e passa a ser uma
 * **corrida** (`live`), com o ritmo que rodou.
 *
 * A marca vale pra janela INTEIRA, não só pro rabo, e isso é medido, não suposto. A
 * intuição era partir a janela no último bloco completo, deixando o começo como rotina
 * pra não mexer nas bordas de antes de um evento. Medindo os 2146 cortes possíveis de
 * cinco dias diferentes (com refeição, com aula no meio, com duas janelas, à noite), a
 * versão partida preserva o passado em 33% deles e esta preserva em **100%** — porque os
 * quatro desligamentos da corrida não inventam nada: com o mesmo ritmo, eles devolvem
 * exatamente os mesmos blocos, e só param de reescrever a borda rasgada do fim.
 *
 * Os minutos que passaram valem: parar às 10:12 num pomo que ia até 10:25 deixa o bloco
 * 10:00–10:12, com o XP dos 12 minutos.
 */
export function stopDayAt(windows: StudyWindow[], now: Date, ritmo: LiveRhythm): StopDayResult {
  const corte = now.getHours() * 60 + now.getMinutes();
  const out: StudyWindow[] = [];
  for (const w of windows) {
    if (!isValidWindow(w)) continue;
    const inicio = timeToMins(w.start);
    if (inicio >= corte) continue; // a janela inteira está no futuro: não aconteceu
    const fim = Math.min(timeToMins(w.end), corte);
    if (fim <= inicio) continue;
    // Janela que já é corrida guarda o ritmo com que rodou: carimbar o de agora por cima
    // reescreveria os blocos dela (e os checks) se o ritmo mudou entre uma corrida e a outra.
    out.push({ start: w.start, end: minsToTime(fim), live: w.live ? { ...w.live } : { ...ritmo } });
  }
  // Nada vivido: parar antes do começo da primeira janela não deixa registro nenhum, e
  // uma lista vazia seria lida como "dia livre" (ver `isDayOff`) — que é outra coisa.
  if (out.length === 0) return { ok: false, reason: 'nothing-lived' };
  return { ok: true, windows: out };
}

/**
 * "↺ Voltar ao padrão" depois de uma parada: a rotina volta **de agora em diante** e o
 * que foi vivido fica como está.
 *
 * Sem isto, o caminho honesto desfazia o corte: `clearDayWindows` apaga o override, o
 * gerador regenera o dia inteiro pela rotina, e o bloco parcial de 12 minutos volta a
 * valer 25 — parar pra almoçar e voltar devolveria 50 XP no lugar de 24. As corridas
 * ficam; a rotina entra só no que sobra do dia, aparada no corte e no que sobrepõe
 * corrida (corrida vence, porque é fato).
 */
export function routineAfter(corridas: StudyWindow[], rotina: StudyWindow[], now: Date): StopDayResult {
  const agora = now.getHours() * 60 + now.getMinutes();
  const fimDasCorridas = corridas.reduce((m, w) => Math.max(m, timeToMins(w.end)), 0);
  const desde = Math.max(agora, fimDasCorridas);
  const out: StudyWindow[] = corridas.map((w) => ({ ...w }));
  for (const w of rotina) {
    if (!isValidWindow(w)) continue;
    const fim = timeToMins(w.end);
    if (fim <= desde) continue; // já passou: a rotina não volta pra trás
    out.push({ start: minsToTime(Math.max(timeToMins(w.start), desde)), end: w.end });
  }
  if (out.length === 0) return { ok: false, reason: 'nothing-lived' };
  return { ok: true, windows: out.sort((a, b) => timeToMins(a.start) - timeToMins(b.start)) };
}


/**
 * A corrida do modo ao vivo crescendo pelos minutos que uma pausa acrescentou ao bloco em
 * andamento — a conta pura por trás de `growLiveForPause` (application/live.ts), que é quem
 * escreve; a prévia de "retomar agora" (`pauseOutlookNow`) usa a mesma conta sem escrever.
 *
 * A janela da corrida termina exatamente no fim do bloco em andamento (só `chainLive` escreve
 * esse fim), então crescer por `pausado_total − pausado_antes` põe o fim onde o bloco acabaria
 * sem corte nenhum. O total é medido pelos REGISTROS, não pelo bloco regenerado: o gerador
 * conta os minutos pausados só até o corte, e uma pausa que atravessa o fim da corrida
 * apareceria menor do que é. Toda pausa a partir do início do bloco é dele: o timer só deixa
 * pausar o bloco que está rodando.
 *
 * `null` se o bloco não está numa corrida, ou se a pausa ainda não completou um minuto.
 */
export function grownRunWindows(
  windows: StudyWindow[],
  blockStart: TimeString,
  alreadyPaused: number,
  pauses: PauseRecord[],
): StudyWindow[] | null {
  const inicio = timeToMins(blockStart);
  const idx = windows.findIndex((w) => w.live && timeToMins(w.start) <= inicio && timeToMins(w.end) > inicio);
  if (idx < 0) return null;
  const meus = pauses.filter((r) => timeToMins(r.at) >= inicio);
  const cresceu = pausedMinutes(meus.reduce((soma, r) => soma + r.secs, 0)) - alreadyPaused;
  if (cresceu <= 0) return null;
  const out = [...windows];
  const janela = windows[idx]!;
  out[idx] = { ...janela, end: minsToTime(Math.min(timeToMins(janela.end) + cresceu, 24 * 60 - 1)) };
  return out;
}
