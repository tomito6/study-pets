// O modo **ao vivo**: o dia começa quando você aperta Começar, e um pomodoro emenda no
// outro até você dizer que parou. Nada é montado antes — o plano é consequência do que
// aconteceu, não premissa.
//
// O chão todo já existe: a janela marcada como corrida (`StudyWindow.live`), os quatro
// desligamentos do gerador, o corte do "Parar por aqui" e o XP proporcional. Aqui ficam
// só os dois verbos do modo: começar, e emendar no bloco seguinte.

import { isDayClosed } from '../domain/checks';
import { dk, minsToTime, timeToMins } from '../domain/time';
import type { LiveRhythm, StudyBlock } from '../domain/types';
import { derived, state } from '../store/store';
import { canEditDayWindows } from './dayWindows';
import { blocksForDay, clearBlockCache, dayModeOf, rebuildWeeks } from './plan';
import { saveNow } from './save';

export type LiveRefusal = 'not-live' | 'closed' | 'past' | 'busy' | 'no-room';
export type LiveStart = { ok: true; block: StudyBlock } | { ok: false; reason: LiveRefusal };

/** O ritmo que a corrida de hoje roda: o da config, congelado na janela ao começar. */
export const liveRhythm = (): LiveRhythm => ({
  pomo: state.config.pomo,
  shortBreak: state.config.shortBreak,
  longBreak: state.config.longBreak,
});

const minuteOf = (d: Date): number => d.getHours() * 60 + d.getMinutes();

/** As janelas de corrida já registradas hoje (as corridas anteriores do dia). */
const runsOf = (dateKey: string) => (state.windowOverrides[dateKey]?.studyWindows ?? []).filter((w) => w.live);

function commit(now: Date): void {
  clearBlockCache();
  rebuildWeeks(now); // a data ganha dados — e notifica
  void saveNow(); // sem debounce: um F5 no meio da corrida não pode perder onde ela começou
}

/**
 * "▶ Começar": abre a corrida agora. A janela vai do minuto de agora até o fim do
 * primeiro pomodoro — e não além, porque o que vem depois ainda não aconteceu. Quem a
 * estica, bloco a bloco, é `chainLive`.
 */
export function startLive(dateKey: string, now: Date = new Date()): LiveStart {
  if (dayModeOf(dateKey) !== 'live') return { ok: false, reason: 'not-live' };
  if (isDayClosed(state.closedDays, dateKey)) return { ok: false, reason: 'closed' };
  const can = canEditDayWindows(dateKey, now);
  if (!can.ok) return { ok: false, reason: can.reason === 'closed' ? 'closed' : 'past' };
  if (dateKey !== dk(now)) return { ok: false, reason: 'past' };
  if (derived.timerBlock) return { ok: false, reason: 'busy' };

  const ritmo = liveRhythm();
  const inicio = minuteOf(now);
  const anteriores = runsOf(dateKey).filter((w) => timeToMins(w.end) <= inicio);
  const janela = { start: minsToTime(inicio), end: minsToTime(inicio + ritmo.pomo), live: ritmo };
  state.windowOverrides[dateKey] = { studyWindows: [...anteriores, janela] };
  commit(now);

  const bloco = blocksForDay(dateKey).find((b) => b.time === janela.start) ?? null;
  if (!bloco) {
    // Um evento cravado no minuto de agora não deixa espaço. Desfaz e diz o motivo.
    if (anteriores.length > 0) state.windowOverrides[dateKey] = { studyWindows: anteriores };
    else delete state.windowOverrides[dateKey];
    commit(now);
    return { ok: false, reason: 'no-room' };
  }
  return { ok: true, block: bloco };
}

/**
 * O bloco acabou: a corrida cresce pelo bloco seguinte e o timer emenda nele.
 *
 * A duração do próximo bloco **não é calculada aqui** — seria duplicar o ritmo do
 * pomodoro (quando entra a pausa longa, o que a pausa registrada faz com o fim). Em vez
 * disso a janela é esticada com folga, o dia é regenerado, e ela é aparada no bloco que
 * de fato nasceu começando onde este acabou. O gerador continua sendo a única fonte.
 *
 * Devolve `null` quando não há o que emendar — um evento no caminho, o fim do dia.
 */
export function chainLive(dateKey: string, endedAt: string, now: Date = new Date()): StudyBlock | null {
  const janelas = state.windowOverrides[dateKey]?.studyWindows ?? [];
  const idx = janelas.findIndex((w) => w.live && w.end === endedAt);
  if (idx < 0) return null;
  const atual = janelas[idx]!;
  const ritmo = atual.live!;
  const folga = timeToMins(atual.end) + ritmo.pomo + ritmo.longBreak;
  const esticar = (fim: number) => {
    const copia = [...janelas];
    copia[idx] = { ...atual, end: minsToTime(Math.min(fim, 24 * 60 - 1)) };
    state.windowOverrides[dateKey] = { studyWindows: copia };
    clearBlockCache();
  };

  esticar(folga);
  const seguinte = blocksForDay(dateKey).find((b) => b.time === endedAt && (b.type === 'estudo' || b.type === 'pausa'));
  if (!seguinte) {
    esticar(timeToMins(atual.end)); // volta a janela pro tamanho de antes
    commit(now);
    return null;
  }
  esticar(timeToMins(seguinte.endTime));
  commit(now);
  return blocksForDay(dateKey).find((b) => b.time === endedAt) ?? null;
}
