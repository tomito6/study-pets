// Pausar o bloco em andamento e retomar. A vida interrompe (campainha, café,
// banheiro): o relógio congela e, ao retomar, os minutos parados entram no bloco
// — que fica mais longo — e empurram o resto do dia. Eventos e o fim da janela
// não se movem, então o último estudo é o que encolhe (ou some). A pausa vira um
// registro do dia (`state.pauses`), e é assim que ela aparece no histórico: o dia
// é regenerado com ela, e a linha do bloco mostra "⏸ 7 min".
//
// O que NÃO existe de propósito: pular um bloco (pular é fugir do plano, não a
// vida atrapalhando) e pausar no modo hardcore (o modo é o compromisso; o botão
// some). Retomar com o bloco já terminado (a pausa atravessou o fim) não marca o
// check sozinho — marcar algo que a pessoa não viu acabar seria desonesto.
//
// A pausa aberta fica no dispositivo (application/timer.ts grava): recarregar a
// página volta o timer pausado, na barra, com "Retomar" e "Parar".

import { isDayClosed } from '../domain/checks';
import { addPause, parsePauseSession, pauseRecordFor, pauseRemap, remapChecksForPause, remapGroupsForPause } from '../domain/pauses';
import { planDelta, planDeltaParts } from '../domain/planDelta';
import { dk } from '../domain/time';
import { timerProgress } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { clearPauseSession, readPauseSession } from '../infrastructure/pauseSession';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { blocksForDay, clearBlockCache, rebuildWeeks } from './plan';
import { saveNow } from './save';
import { adoptPausedBlock, pauseRuntime, resumeRuntime, stopTimer } from './timer';

export type PauseRefusal = 'no-timer' | 'hardcore' | 'not-running' | 'day-closed';
export type PauseResult = { ok: true } | { ok: false; reason: PauseRefusal };

const isPomodoroPart = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'estudo' || b.type === 'pausa';

export const timerPaused = (): boolean => derived.timerPausedAt != null;

/** "⏸ Pausar": só um estudo/pausa rodando (em espera não há o que congelar), fora do hardcore, num dia aberto. */
export function pauseTimer(now: Date = new Date()): PauseResult {
  const block = derived.timerBlock;
  if (!block) return { ok: false, reason: 'no-timer' };
  if (derived.hardcore) return { ok: false, reason: 'hardcore' };
  if (derived.timerPausedAt != null) return { ok: true }; // já está
  if (timerProgress(block, now).phase !== 'running') return { ok: false, reason: 'not-running' };
  if (isDayClosed(state.closedDays, dk(now))) return { ok: false, reason: 'day-closed' };
  pauseRuntime(now);
  return { ok: true };
}

export type ResumeOutcome = 'resumed' | 'ended' | 'none';

/**
 * "▶ Retomar": a pausa vira registro, o dia é regenerado, checks e grupos
 * acompanham os blocos que deslizaram, e o timer segue no bloco regenerado
 * (mesmo início, fim novo). Se o bloco já acabou durante a pausa (empurrado
 * contra um evento ou o fim da janela), o timer para sem check nem som.
 */
export function resumeTimer(now: Date = new Date()): ResumeOutcome {
  const block = derived.timerBlock;
  const pausedAt = derived.timerPausedAt;
  if (!block || pausedAt == null) return 'none';
  const todayKey = dk(now);
  if (dk(new Date(pausedAt)) !== todayKey || isDayClosed(state.closedDays, todayKey)) {
    stopTimer(); // o dia acabou (ou foi encerrado) no meio da pausa: nada a registrar
    return 'ended';
  }

  const record = pauseRecordFor(new Date(pausedAt), now);
  const before = blocksForDay(todayKey);
  state.pauses[todayKey] = addPause(state.pauses[todayKey], record);
  clearBlockCache();
  const after = blocksForDay(todayKey);

  let dropped = 0;
  const pairs = pauseRemap(before, after, record.at);
  if (pairs) {
    const c = remapChecksForPause(state.checks[todayKey], pairs);
    dropped = c.dropped;
    if (Object.keys(c.checks).length > 0) state.checks[todayKey] = c.checks;
    else delete state.checks[todayKey];
    const groups = state.groups[todayKey];
    if (groups && groups.length > 0) state.groups[todayKey] = remapGroupsForPause(groups, pairs);
  }
  rebuildWeeks(now); // a data ganha dados (a pausa) — e notifica
  void saveNow(); // sem debounce: o registro e os checks remapeados vão juntos, e um F5 logo depois não perde a pausa
  rescheduleEndOfDayPrompt(now); // o último estudo de hoje mudou (ou sumiu)

  const regenerated = after.find((b) => isPomodoroPart(b) && b.time === block.time) ?? null;
  if (!regenerated || timerProgress(regenerated, now).done) {
    // A pausa atravessou o fim do bloco (um evento fixo, o fim da janela): para sem marcar — quem quiser marca à mão.
    derived.timerPausedAt = null;
    if (regenerated) derived.timerBlock = regenerated;
    stopTimer();
    showToast(strings.timer.pauseEnded);
    return 'ended';
  }
  resumeRuntime(regenerated, now);
  showToast(strings.timer.pauseRecorded(record.mins, planDeltaParts(planDelta(before, after)), dropped));
  return 'resumed';
}

export type PauseBootResolution = 'none' | 'resumed' | 'expired';

/**
 * Ao abrir o app: a pausa que ficou aberta neste dispositivo. De hoje, com o bloco
 * ainda em pé → o timer volta pausado (na barra: Retomar ou Parar). De outro dia,
 * ou se o hardcore já retomou a sessão dele → esquecida.
 */
export function resumePauseOnBoot(now: Date = new Date()): PauseBootResolution {
  const uid = state.user?.uid;
  if (!uid) return 'none';
  const session = parsePauseSession(readPauseSession(uid));
  if (!session) return 'none';
  const forget = (): PauseBootResolution => {
    clearPauseSession(uid);
    return 'expired';
  };
  if (derived.hardcore || derived.timerBlock) return forget();
  if (session.dateKey !== dk(now) || isDayClosed(state.closedDays, session.dateKey)) return forget();
  const block =
    blocksForDay(session.dateKey).find((b) => isPomodoroPart(b) && b.time === session.block.time && b.type === session.block.type) ??
    session.block;
  // O plano pode ter mudado por baixo (outro dispositivo): se o bloco já tinha acabado quando pausou, não há o que retomar.
  if (timerProgress(block, new Date(session.pausedAt)).phase !== 'running') return forget();
  adoptPausedBlock(block, session.pausedAt);
  notify();
  return 'resumed';
}
