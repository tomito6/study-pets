// Casos de uso das janelas de um dia: editar só as de hoje (ou de um dia futuro),
// "começar agora", declarar dia livre e restaurar a rotina. Cada mutação: limpa o
// cache do gerador, refaz as semanas (a data entra nas que expandem o período),
// salva, notifica, conta o que mudou no plano e reagenda o prompt de fim de dia.
//
// Regras: dia encerrado é read-only; dia passado também (mexer nas janelas de
// ontem só mudaria estatística); dia futuro pode — planejar é o ponto. Dia livre
// só antes de qualquer check de hoje: declarar depois de falhar seria o "streak
// freeze", padrão manipulativo que o app evita. Fim de semana pausado (`skipWeekends`)
// é um dia livre implícito: abrir janelas nele vale só pra aquele sábado — os outros
// continuam de folga — e "Restaurar rotina" devolve a folga.
//
// E o RITMO só do dia (2026-10-01, ver domain/dayRhythm.ts): o modal "🕘 Estrutura do dia"
// muda o pomodoro só daquele dia; a rotina fica nas Configurações. Num dia que ainda não
// começou, vale o dia inteiro; em hoje com algo já vivido, vale do próximo bloco em diante —
// o que já aconteceu nunca é reescrito.

import { isChecked, isDayClosed } from '../domain/checks';
import { configForDay, restDayKind, routineAfter, stopDayAt, validateDayWindows, windowsForDay } from '../domain/dayWindows';
import type { DayWindowsOverride, RestKind } from '../domain/dayWindows';
import { rhythmOf } from '../domain/configHistory';
import { isValidRhythm, rhythmChangeFrom, sameRhythm, wholeDayRhythm, withDayRhythm } from '../domain/dayRhythm';
import type { DayRhythmEntry } from '../domain/dayRhythm';
import { modeForDay } from '../domain/dayMode';
import { blockagesOnly } from '../domain/planner';
import { isValidWindow } from '../domain/settings';
import type { DayMode } from '../domain/dayMode';
import { dk, isWeekendKey, minsToTime, timeToMins } from '../domain/time';
import type { DateKey, LiveRhythm, StudyBlock, StudyWindow } from '../domain/types';
import { derived, notify, state } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { notifyPlanDelta } from './events';
import {
  blocksForDay,
  clearBlockCache,
  configAtDay,
  dayHasFacts,
  dayModeOf,
  generateBlocks,
  getEventsForDate,
  rebuildWeeks,
  restKindOf,
  rhythmAtDay,
  routineConfigAt,
} from './plan';
import { scheduleSave } from './save';

export type DayWindowsRefusal =
  | 'closed'
  | 'past'
  | 'has-checks'
  | 'empty'
  | 'invalid-window'
  | 'overlap'
  | 'invalid-rhythm';

export type DayWindowsResult = { ok: true } | { ok: false; reason: DayWindowsRefusal };

export const dayWindowsOverride = (dateKey: DateKey): DayWindowsOverride | null => state.windowOverrides[dateKey] ?? null;

/** As janelas que valem pro dia: as editadas; nenhuma no fim de semana pausado; senão as da rotina — a que valia NAQUELE dia. */
export const effectiveWindows = (dateKey: DateKey): StudyWindow[] =>
  windowsForDay(configAtDay(dateKey), dayWindowsOverride(dateKey), isWeekendKey(dateKey));

/** Por que o dia está sem blocos (fim de semana pausado / dia livre), ou null. */
export const restKindKey = (dateKey: DateKey): RestKind | null => restKindOf(dateKey);

/**
 * "Como fica o dia" DENTRO do modal 🕘 Estrutura do dia: o plano do dia como ficaria
 * com as janelas que o editor tem AGORA — antes de salvar. A mesma receita do
 * `blocksForDay` (a config que valia no dia, os eventos dele, as pausas dele), só com
 * as janelas do rascunho no lugar. Num dia ao vivo o rascunho não manda: o plano é o
 * que aconteceu, e é o `blocksForDay` que diz.
 *
 * `mode` é o modo que o modal tem ESCOLHIDO (2026-11-28: o chip deixou de valer no toque e
 * passou a esperar o Salvar). Diferente do modo salvo, a prévia mostra o dia como ele fica
 * depois da troca — pela mesma conta do salvar (`overrideForMode`), sem escrever.
 */
export function previewDayPlan(
  dateKey: DateKey,
  draft: StudyWindow[],
  rhythm: LiveRhythm | null = null,
  now: Date = new Date(),
  mode: DayMode = dayModeOf(dateKey),
): StudyBlock[] {
  if (mode === 'live') {
    if (dayModeOf(dateKey) === 'live') return blocksForDay(dateKey);
    // Indo pro ao vivo: fica o que já foi vivido (a manhã marcada vira corrida) e os compromissos.
    const ov = overrideForMode(dateKey, 'live', now);
    const rest = restDayKind({ skipWeekends: state.config.skipWeekends === true, isWeekend: isWeekendKey(dateKey), override: ov });
    if (rest !== null) return [];
    const events = getEventsForDate(dateKey);
    if (!ov) return blockagesOnly(events);
    return generateBlocks(configForDay(configAtDay(dateKey), ov), events, state.pauses?.[dateKey] ?? []);
  }
  const studyWindows = draft.filter(isValidWindow);
  if (studyWindows.length === 0) return [];
  // O ritmo do rascunho entra do mesmo jeito que entraria ao salvar (`nextDayRhythm`): o dia
  // inteiro se ele ainda não começou, do próximo bloco em diante se já começou.
  const base =
    rhythm && isValidRhythm(rhythm) ? withDayRhythm(routineConfigAt(dateKey), nextDayRhythm(dateKey, rhythm, now).entries) : configAtDay(dateKey);
  const cfg = configForDay(base, { studyWindows });
  return generateBlocks(cfg, getEventsForDate(dateKey), state.pauses?.[dateKey] ?? []);
}
export const isRestDayKey = (dateKey: DateKey): boolean => restKindOf(dateKey) !== null;

export function canEditDayWindows(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  if (isDayClosed(state.closedDays, dateKey)) return { ok: false, reason: 'closed' };
  if (dateKey < dk(now)) return { ok: false, reason: 'past' };
  return { ok: true };
}

function commit(dateKey: DateKey, before: StudyBlock[], now: Date): void {
  clearBlockCache();
  rebuildWeeks(now);
  scheduleSave();
  notify();
  notifyPlanDelta(dateKey, before);
  if (dateKey === dk(now)) rescheduleEndOfDayPrompt(now); // o último estudo de hoje pode ter mudado
}

/**
 * Troca o modo de um dia: **pela rotina** ou **ao vivo**.
 *
 * Trocar não mexe no que já foi vivido. Num dia que já tem corrida (a pessoa começou,
 * parou, e agora quer a rotina de volta), a rotina entra só de agora em diante — é o
 * mesmo `routineAfter` do "Voltar ao padrão", pela mesma razão: curar um bloco parcial
 * devolveria XP que ninguém estudou. Indo pro ao vivo, o override some e o dia fica sem
 * plano dali pra frente; o que já aconteceu continua no lugar se houver corrida.
 */
/** Onde a rotina de hoje vira corrida ao trocar pro ao vivo: agora, com bloco no timer; senão o fim do último bloco marcado; senão nada. */
function liveCutFor(dateKey: DateKey, now: Date): Date | null {
  if (derived.timerBlock && derived.timerDay === dateKey) return now;
  const marcados = blocksForDay(dateKey).filter((b) => isChecked(state.checks, dateKey, b.time));
  if (marcados.length === 0) return null;
  const fim = marcados.reduce((m, b) => (b.endTime > m ? b.endTime : m), '00:00');
  const [h, m] = fim.split(':').map(Number);
  const corte = new Date(now);
  corte.setHours(h as number, m as number, 0, 0);
  return corte;
}

/**
 * As janelas só do dia com que ele fica ao trocar pra `mode` — sem escrever nada
 * (`undefined` = sem override: o dia segue a rotina, ou fica sem plano no ao vivo).
 * É a conta do `setDayMode`, separada pra prévia do modal poder usá-la antes do Salvar.
 */
function overrideForMode(dateKey: DateKey, mode: DayMode, now: Date): DayWindowsOverride | undefined {
  const atual = state.windowOverrides[dateKey];
  const corridas = atual ? atual.studyWindows.filter((w) => w.live) : [];

  if (mode === 'rotina') {
    if (corridas.length > 0 && dateKey === dk(now)) {
      const r = routineAfter(corridas, configAtDay(dateKey).studyWindows, now);
      return r.ok ? { studyWindows: r.windows } : undefined;
    }
    return corridas.length > 0 ? { studyWindows: corridas } : undefined;
  }
  // Ao vivo: o que já foi vivido fica; o resto do dia deixa de vir montado.
  if (corridas.length > 0) return { studyWindows: corridas };
  // Sem corrida, mas com uma manhã de ROTINA já marcada: ela vira corrida, aparada no fim do
  // último bloco marcado (ou em agora, se há um bloco no timer). Apagar o override, como era,
  // tirava da tela os blocos marcados — checks órfãos, XP pendente a zero, "Plano reajustado:
  // −N estudos" — pra quem só quis passar a tarde pro ao vivo. É o mesmo `stopDayAt` do
  // "Parar por aqui": o que aconteceu fica, o que não aconteceu (os blocos sem check) sai.
  const corte = dateKey === dk(now) ? liveCutFor(dateKey, now) : null;
  const r = corte ? stopDayAt(effectiveWindows(dateKey), corte, rhythmOf(configAtDay(dateKey))) : null;
  return r?.ok ? { studyWindows: r.windows } : undefined;
}

/** Escreve a troca de modo no estado (janelas do dia + a escolha), sem salvar nem notificar. */
function applyDayMode(dateKey: DateKey, mode: DayMode, now: Date): void {
  const ov = overrideForMode(dateKey, mode, now);
  if (ov) state.windowOverrides[dateKey] = ov;
  else delete state.windowOverrides[dateKey];
  // A escolha do dia só pode ser APAGADA quando o padrão já diz a mesma coisa —
  // apagar é literalmente "siga o padrão". Com um padrão "ao vivo" em vigor, o
  // `delete` devolvia o dia pro ao vivo: o chip dizia "Modo do dia trocado",
  // fechava o modal, e o dia continuava vazio. Dizia que tinha funcionado sem ter.
  if (modeForDay(dateKey, undefined, state.dayModeDefault) === mode) delete state.dayModes[dateKey];
  else state.dayModes[dateKey] = mode;
}

export function setDayMode(dateKey: DateKey, mode: DayMode, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  if (dayModeOf(dateKey) === mode) return { ok: true };
  const before = blocksForDay(dateKey);
  applyDayMode(dateKey, mode, now);
  commit(dateKey, before, now);
  return { ok: true };
}

/**
 * As janelas que o dia tem (ou teria) em `mode`. No modo em que ele já está, as de sempre;
 * no outro, as que a troca deixaria. É o que o editor do modal mostra quando a pessoa
 * escolhe "Pela rotina" num dia ao vivo, antes de salvar.
 */
export function windowsInMode(dateKey: DateKey, mode: DayMode, now: Date = new Date()): StudyWindow[] {
  if (dayModeOf(dateKey) === mode) return effectiveWindows(dateKey);
  return windowsForDay(configAtDay(dateKey), overrideForMode(dateKey, mode, now) ?? null, isWeekendKey(dateKey));
}

/**
 * O padrão: de que jeito os dias NOVOS nascem. Vale **de hoje em diante** — o `since` é
 * gravado com a data de agora, e `modeForDay` só o consulta pra dias a partir dela.
 *
 * Sem o `since`, virar a chave pra "ao vivo" leria o passado inteiro como ao vivo: todo
 * dia sem janela editada (quase todos) devolveria plano vazio, e XP total, nível, moedas,
 * sequência, melhor dia e o heatmap sumiriam da tela num clique. Com ele, o histórico não
 * se mexe: quem olhar setembro vê setembro.
 *
 * Escolher "rotina" com um padrão de ao vivo em vigor não apaga o campo — grava rotina a
 * partir de hoje, senão os dias entre o `since` antigo e hoje mudariam de modo pra trás.
 */
export function setDefaultDayMode(mode: DayMode, now: Date = new Date()): void {
  state.dayModeDefault = { mode, since: dk(now) };
  clearBlockCache();
  rebuildWeeks(now);
  scheduleSave();
  notify();
}

export function setDayWindows(dateKey: DateKey, windows: StudyWindow[], now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const v = validateDayWindows(windows);
  if (!v.ok) return v;
  const before = blocksForDay(dateKey);
  state.windowOverrides[dateKey] = { studyWindows: windows.map((w) => ({ start: w.start, end: w.end })) };
  commit(dateKey, before, now);
  return { ok: true };
}

// ---------------------------------------------------------------- o ritmo só do dia

/** O ritmo que vale neste dia de agora em diante — é o que o modal mostra e edita. */
export const dayRhythmNow = (dateKey: DateKey): LiveRhythm => rhythmAtDay(dateKey);

/** O ritmo da ROTINA neste dia (a config que valia nele) — pra onde "Restaurar rotina" volta. */
export const routineRhythmOf = (dateKey: DateKey): LiveRhythm => rhythmOf(routineConfigAt(dateKey));

/** O dia está com um ritmo que não é o da rotina? */
export const dayRhythmEdited = (dateKey: DateKey): boolean => !sameRhythm(dayRhythmNow(dateKey), routineRhythmOf(dateKey));

/** O dia tem algo só dele: janelas editadas ou ritmo próprio. É o "· editado" do botão e o que "Restaurar rotina" desfaz. */
export const dayEdited = (dateKey: DateKey): boolean => dayWindowsOverride(dateKey) !== null || dayRhythmEdited(dateKey);

/** O que a mudança de ritmo faz com o dia: nada, o dia inteiro, ou só do próximo bloco em diante (hoje já tem algo vivido). */
export type RhythmApplies = 'unchanged' | 'whole-day' | 'from-now';

/**
 * O minuto a partir do qual um ritmo novo vale em HOJE: agora. O gerador cuida do resto — o
 * bloco em andamento e a pausa dele terminam como estavam (ver `RhythmChange`). A exceção é
 * um bloco no timer que ainda nem começou (o foco aberto antes da hora): ele também fica, e o
 * ritmo novo entra depois dele — senão o timer ficaria apontando pra um bloco que o plano
 * deixou de ter.
 */
function rhythmCut(dateKey: DateKey, now: Date): number {
  const agora = now.getHours() * 60 + now.getMinutes();
  const t = derived.timerBlock && derived.timerDay === dateKey ? derived.timerBlock : null;
  return t && timeToMins(t.time) >= agora ? timeToMins(t.endTime) : agora;
}

/**
 * O que a lista de ritmos do dia passa a ser se ele for trocado por `rhythm` agora — sem
 * escrever nada (a prévia do modal usa a mesma conta do salvar).
 *
 * A régua é a mesma da história da config (`dayHasFacts`): um dia que ainda não tem nada
 * vivido — amanhã, ou hoje antes do primeiro check — muda inteiro; hoje com check, pausa,
 * corrida ou bloco no timer muda só do próximo bloco em diante, e a manhã fica como foi.
 */
function nextDayRhythm(dateKey: DateKey, rhythm: LiveRhythm, now: Date): { entries: DayRhythmEntry[] | null; applies: RhythmApplies } {
  const atuais = state.dayRhythms?.[dateKey] ?? null;
  if (sameRhythm(rhythm, rhythmAtDay(dateKey))) return { entries: atuais, applies: 'unchanged' };
  if (!(dateKey === dk(now) && dayHasFacts(dateKey))) {
    return { entries: wholeDayRhythm(rhythm, routineRhythmOf(dateKey)), applies: 'whole-day' };
  }
  return { entries: rhythmChangeFrom(atuais, minsToTime(rhythmCut(dateKey, now)), rhythm), applies: 'from-now' };
}

function writeDayRhythm(dateKey: DateKey, entries: DayRhythmEntry[] | null): void {
  if (entries && entries.length > 0) state.dayRhythms[dateKey] = entries;
  else delete state.dayRhythms[dateKey];
}

export interface DayStructureDraft {
  windows: StudyWindow[];
  /** `null` = o modal não mexeu no ritmo. */
  rhythm: LiveRhythm | null;
  /** O modo escolhido no modal; ausente = o dia fica no modo em que está. */
  mode?: DayMode;
}

export type DayStructureResult =
  | { ok: true; windows: boolean; rhythm: RhythmApplies; mode: boolean }
  | { ok: false; reason: DayWindowsRefusal };

const sameWindowList = (a: StudyWindow[], b: StudyWindow[]): boolean =>
  a.length === b.length && a.every((w, i) => w.start === b[i]!.start && w.end === b[i]!.end);

/**
 * O "Salvar" do modal 🕘 Estrutura do dia: o modo, as janelas e o ritmo SÓ deste dia, numa
 * escrita só (um toast de "Plano reajustado", não três). Só grava o que mudou: quem mexeu só
 * no ritmo não prende o dia às janelas de hoje da rotina, e vice-versa. Valida tudo antes de
 * mudar qualquer coisa; devolve o que aconteceu com o ritmo pra tela contar (`whole-day` /
 * `from-now`).
 *
 * **O modo entra aqui desde 2026-11-28** (pedido do Tomi: "se a gente bota ao vivo, pelo menos
 * dê a opção de marcar quanto de estudo pomodoro o user quer — ele tem que apertar salvar"):
 * o chip "⏱ Ao vivo" trocava o modo no toque e fechava o modal, sem deixar escolher o ritmo.
 * Agora o chip só escolhe, e a troca acontece no Salvar, junto com o ritmo. Num dia ao vivo
 * as janelas do rascunho não valem (o modo não tem janelas: tem corridas); voltando pra
 * rotina, elas são comparadas com as que a troca deixaria (`windowsInMode`).
 */
export function saveDayStructure(dateKey: DateKey, draft: DayStructureDraft, now: Date = new Date()): DayStructureResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const modo = draft.mode ?? dayModeOf(dateKey);
  const modoMudou = modo !== dayModeOf(dateKey);
  const janelasMudaram = modo === 'rotina' && !sameWindowList(draft.windows, windowsInMode(dateKey, 'rotina', now));
  if (janelasMudaram) {
    const v = validateDayWindows(draft.windows);
    if (!v.ok) return v;
  }
  if (draft.rhythm && !isValidRhythm(draft.rhythm)) return { ok: false, reason: 'invalid-rhythm' };
  const ritmo = draft.rhythm ? nextDayRhythm(dateKey, draft.rhythm, now) : null;
  const ritmoMudou = !!ritmo && ritmo.applies !== 'unchanged';
  if (!modoMudou && !janelasMudaram && !ritmoMudou) return { ok: true, windows: false, rhythm: 'unchanged', mode: false };

  const before = blocksForDay(dateKey);
  // O modo vem ANTES do ritmo: indo pro ao vivo com a manhã marcada, ela vira corrida
  // carimbada com o ritmo em que foi vivida — o de antes desta escrita.
  if (modoMudou) applyDayMode(dateKey, modo, now);
  if (janelasMudaram) state.windowOverrides[dateKey] = { studyWindows: draft.windows.map((w) => ({ start: w.start, end: w.end })) };
  if (ritmo && ritmoMudou) writeDayRhythm(dateKey, ritmo.entries);
  commit(dateKey, before, now);
  return { ok: true, windows: janelasMudaram, rhythm: ritmo ? ritmo.applies : 'unchanged', mode: modoMudou };
}

/** Só o ritmo deste dia (o modal salva pelo `saveDayStructure`; isto é o mesmo caminho, sem as janelas). */
export function setDayRhythm(dateKey: DateKey, rhythm: LiveRhythm, now: Date = new Date()): DayStructureResult {
  return saveDayStructure(dateKey, { windows: effectiveWindows(dateKey), rhythm }, now);
}

/** Dia livre: sem blocos, e neutro na sequência (como fim de semana com `skipWeekends`). */
export function setDayOff(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  if (Object.keys(state.checks[dateKey] ?? {}).length > 0) return { ok: false, reason: 'has-checks' };
  const before = blocksForDay(dateKey);
  state.windowOverrides[dateKey] = { studyWindows: [] };
  commit(dateKey, before, now);
  return { ok: true };
}

/**
 * Hoje foi cortado por uma parada ("■ Parar por aqui") e a rotina ainda tem dia pela
 * frente: "↺ Restaurar rotina" devolveria algum estudo que ainda dá pra fazer? É o que
 * decide se a volta pela rotina aparece ao lado do "▶ Estudar agora" — oferecer uma volta
 * que não devolve nada (parou às 17:50 de um dia que acaba às 18:00) seria um botão morto.
 * A conta é a do próprio restaurar (`routineAfter`), gerada sem escrever.
 */
export function canResumeRoutine(dateKey: DateKey, now: Date = new Date()): boolean {
  if (dateKey !== dk(now) || dayModeOf(dateKey) === 'live' || !canEditDayWindows(dateKey, now).ok) return false;
  const corridas = (state.windowOverrides[dateKey]?.studyWindows ?? []).filter((w) => w.live);
  if (corridas.length === 0) return false;
  const r = routineAfter(corridas, configAtDay(dateKey).studyWindows, now);
  if (!r.ok) return false;
  const agora = minsToTime(now.getHours() * 60 + now.getMinutes());
  return previewDayPlan(dateKey, r.windows, null, now).some((b) => b.type === 'estudo' && b.endTime > agora);
}

/**
 * "Restaurar rotina" / "Voltar ao padrão": o dia volta a seguir a config.
 *
 * **Com corrida no dia, a rotina volta só de agora em diante** (`routineAfter`). Apagar o
 * override inteiro regeneraria o dia pela rotina e **curaria o bloco parcial**: quem parou
 * às 10:12 num pomo que ia até 10:25 tem um bloco de 12 minutos e 24 XP, e dois toques o
 * devolveriam com 25 minutos e 50 XP — o XP deixaria de ser proporcional exatamente no
 * fluxo que "Parar por aqui" existe pra servir, e pelo caminho honesto. O que foi vivido
 * fica; o que volta é o resto do dia.
 *
 * **O ritmo só do dia volta junto**, pela mesma régua: num dia que ainda não começou ele
 * some; em hoje com algo já vivido, o ritmo da rotina entra do próximo bloco em diante, e a
 * manhã estudada em 50 · 10 continua em 50 · 10.
 */
export function clearDayWindows(dateKey: DateKey, now: Date = new Date()): DayWindowsResult {
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return can;
  const atual = state.windowOverrides[dateKey];
  const temRitmo = (state.dayRhythms?.[dateKey]?.length ?? 0) > 0;
  if (!atual && !temRitmo) return { ok: true };
  const before = blocksForDay(dateKey);
  // A conta do ritmo vem ANTES de mexer nas janelas: é ela que pergunta se o dia já tem fato.
  const ritmo = temRitmo ? nextDayRhythm(dateKey, routineRhythmOf(dateKey), now) : null;
  const corridas = atual ? atual.studyWindows.filter((w) => w.live) : [];
  if (corridas.length > 0 && dateKey === dk(now)) {
    const r = routineAfter(corridas, configAtDay(dateKey).studyWindows, now);
    if (r.ok) state.windowOverrides[dateKey] = { studyWindows: r.windows };
    else delete state.windowOverrides[dateKey];
  } else {
    delete state.windowOverrides[dateKey];
  }
  if (ritmo && ritmo.applies !== 'unchanged') writeDayRhythm(dateKey, ritmo.entries);
  commit(dateKey, before, now);
  return { ok: true };
}
