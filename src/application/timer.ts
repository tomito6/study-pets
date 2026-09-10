// O timer: qual bloco está rodando, o modo foco e o áudio.
//
// O estado é só "qual bloco" (derived.timerBlock). O restante é derivado do
// relógio pelos componentes, a cada segundo, SEM passar pelo store — um
// notify() por segundo faria o app inteiro re-renderizar e recalcular stats.
// O único intervalo aqui existe pra detectar o fim do bloco.
//
// Um bloco de hoje pode ser aberto antes da hora (fica em espera até começar).
// No modo foco, o fim do bloco é uma conquista: marca o check sozinho, toca
// "deu certo" e emenda no bloco seguinte (estudo → pausa → estudo…) até o dia
// mudar de assunto (almoço, evento, gap, fim). Com o foco fechado (só a barra),
// o fim continua como sempre foi: som do tipo, notificação, e o timer some.
//
// No modo hardcore (`derived.hardcore`) o foco não tem saída livre: "Sair do foco"
// e "Parar" viram no-op — a porta é `quitHardcore`, que cobra. A emenda e o fim
// natural avisam a sessão (application/hardcoreRuntime.ts).
//
// O bloqueio de sites acompanha o timer daqui: `syncBlocking` a cada acerto de
// relógio (é ele que vê "em espera" virar "rodando") e `stopBlocking` quando o
// app encerra. Com ou sem hardcore — ver application/siteBlock.ts.
//
// Pausar (`derived.timerPausedAt`) congela o relógio: enquanto dura, o bloco não
// termina e a extensão continua bloqueando. Os verbos (pausar, retomar, a pausa
// que ficou no dispositivo) moram em application/pause.ts, que precisa daqui;
// aqui ficam só os ganchos do runtime — o mesmo arranjo do hardcore.

import { canToggleCheck, isDayClosed } from '../domain/checks';
import { isForfeited } from '../domain/hardcore';
import { pauseSessionFor } from '../domain/pauses';
import { closedCycleOf } from '../domain/cycles';
import { dk } from '../domain/time';
import { canStartBlock, chainedBlockAfter, cleanBlockName, soundForBlock, timerProgress } from '../domain/timer';
import type { StartCheck, StartContext } from '../domain/timer';
import type { DateKey, StudyBlock } from '../domain/types';
import { playSound as playSoundInfra } from '../infrastructure/audio/sounds';
import type { SoundType } from '../infrastructure/audio/sounds';
import { notify as pushNotification, requestNotificationPermission } from '../infrastructure/notifications/notifications';
import { clearPauseSession, writePauseSession } from '../infrastructure/pauseSession';
import type { Unsubscribe } from '../infrastructure/ports';
import { onVisible } from '../infrastructure/visibility';
import { reacquireWakeLockIfWanted, releaseWakeLock, requestWakeLock } from '../infrastructure/wakeLock';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { checkBlock } from './checks';
import { armHardcoreIfRunning, endHardcoreSession, hardcoreChained } from './hardcoreRuntime';
import { blocksForDay, currentDayKey } from './plan';
import { stopBlocking, syncBlocking } from './siteBlock';

let endWatcher: ReturnType<typeof setInterval> | null = null;

function clearWatcher(): void {
  if (endWatcher) clearInterval(endWatcher);
  endWatcher = null;
}

function startWatcher(): void {
  clearWatcher();
  endWatcher = setInterval(() => reconcileTimer(), 1000);
}

const uid = (): string | null => state.user?.uid ?? null;

/** Esquece a pausa em andamento (runtime e dispositivo). */
function clearPause(): void {
  derived.timerPausedAt = null;
  const u = uid();
  if (u) clearPauseSession(u);
}

/** Põe o bloco no timer, abre o foco (com a tela segura pelo Wake Lock) e fica de olho no fim. */
function runBlock(block: StudyBlock): void {
  clearPause();
  derived.timerBlock = block;
  derived.focusOpen = true;
  notify();
  void requestWakeLock();
  startWatcher();
}

/**
 * Acerta o timer com o relógio: se o bloco que está rodando já terminou, segue o
 * mesmo caminho de fim que o intervalo segue. O intervalo é estrangulado em aba
 * de fundo e congela com a tela travada, então isto roda também ao voltar pra
 * visível — e se mais de um bloco passou, a emenda resolve um por vez, porque
 * cada bloco seguinte cai no `done` de novo com o mesmo `now`.
 */
export function reconcileTimer(now: Date = new Date()): void {
  if (derived.hardcore) armHardcoreIfRunning(now); // o bloco em espera começou: a sessão passa a valer
  const pausedAt = derived.timerPausedAt;
  if (pausedAt != null && derived.timerBlock) {
    // Pausado, o bloco não termina. Só a meia-noite encerra: o dia acabou sem retomar, e nada é registrado.
    if (dk(now) !== dk(new Date(pausedAt))) {
      stopTimer();
      showToast(strings.timer.pauseMidnight);
      return;
    }
    syncBlocking(now); // a extensão continua bloqueando, com o fim que desliza
    return;
  }
  let guard = 0;
  while (derived.timerBlock && timerProgress(derived.timerBlock, now).done && guard++ < 100) finishTimer(now);
  syncBlocking(now); // "em espera" virou "rodando" (ou o bloco acabou): a extensão acompanha
}

// ---- os ganchos da pausa (application/pause.ts decide; aqui é só o runtime) ----

/** O relógio congela agora: a pausa vai pro dispositivo, a tela pode travar, a extensão segue bloqueando. */
export function pauseRuntime(now: Date): void {
  const block = derived.timerBlock;
  if (!block) return;
  derived.timerPausedAt = now.getTime();
  const u = uid();
  if (u) writePauseSession(u, pauseSessionFor(block, dk(now), now.getTime()));
  releaseWakeLock();
  syncBlocking(now);
  notify();
}

/** Retomou: o bloco em andamento passa a ser o regenerado (fim novo) e o relógio volta a correr. */
export function resumeRuntime(block: StudyBlock, now: Date): void {
  clearPause();
  derived.timerBlock = block;
  startWatcher();
  if (derived.focusOpen) void requestWakeLock();
  syncBlocking(now);
  notify();
}

/** Ao abrir o app com uma pausa aberta no dispositivo: o timer volta pausado, na barra (o foco fechado). */
export function adoptPausedBlock(block: StudyBlock, pausedAt: number): void {
  derived.timerBlock = block;
  derived.timerPausedAt = pausedAt;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  startWatcher();
  notify();
}

let visibilityWatch: Unsubscribe | null = null;

/** Registra uma vez o "voltou pra visível" → reconciliar + pedir o Wake Lock de novo. */
export function watchVisibility(): void {
  if (visibilityWatch) return;
  visibilityWatch = onVisible(() => {
    reconcileTimer();
    if (derived.focusOpen) reacquireWakeLockIfWanted();
  });
}

/** Inicia o timer no bloco (sem validar — use `tryStartTimer` a partir da UI). */
export function startTimer(block: StudyBlock, now: Date = new Date()): void {
  derived.timerCompleted = null;
  runBlock(block);
  syncBlocking(now);
  requestNotificationPermission();
}

/**
 * O contexto do bloco pro `canStartBlock`, lido do estado. Fonte única: quem
 * quiser abrir uma porta nova pro timer passa por aqui, e recusa igual às outras.
 */
export function startContextFor(block: Pick<StudyBlock, 'time'>, key: DateKey): StartContext {
  return {
    closed: isDayClosed(state.closedDays, key),
    forfeited: isForfeited(state.penalties, key, block.time),
  };
}

/** Valida contra o dia visível e o relógio; a UI mostra o motivo se recusar. */
export function tryStartTimer(block: StudyBlock, now: Date = new Date()): StartCheck {
  const key = currentDayKey();
  const check = canStartBlock(block, key, now, startContextFor(block, key));
  if (!check.ok) return check;
  startTimer(block);
  return check;
}

/**
 * Fim natural do bloco. No foco: check automático, som de "deu certo" e emenda
 * no próximo bloco — ou fecha, se a sequência acabou. Fora do foco: som do tipo
 * e notificação, e o timer some.
 */
function finishTimer(now: Date = new Date()): void {
  const block = derived.timerBlock;
  clearWatcher();
  if (!block) {
    derived.focusOpen = false;
    releaseWakeLock();
    notify();
    return;
  }
  const todayKey = dk(now);
  const n = strings.timer.notification;
  pushNotification(block.type === 'estudo' ? n.study : n.break, cleanBlockName(block.name));

  if (derived.focusOpen && canToggleCheck(todayKey, { closedDays: state.closedDays, now })) {
    const result = checkBlock(todayKey, block, now); // null = já estava marcado à mão
    playSound('sucesso');
    // Este bloco fechou a leva? Só quando o check é DESTE momento: se ele já estava
    // marcado à mão, a leva fechou lá na lista e já foi comemorada lá.
    const leva = result ? closedCycleOf(blocksForDay(todayKey), block, state.checks[todayKey]) : null;
    const completed = {
      name: cleanBlockName(block.name),
      type: block.type,
      xp: result?.xp ?? 0,
      coins: result?.coins ?? 0,
      at: now.getTime(),
      cycle: leva,
    };
    const next = chainedBlockAfter(blocksForDay(todayKey), block);
    if (next) {
      derived.timerCompleted = completed;
      runBlock(next);
      if (derived.hardcore) hardcoreChained(next, now);
      syncBlocking(now); // emendou: estudo → pausa libera, pausa → estudo bloqueia de novo
      return;
    }
    showToast(strings.timer.completed(completed));
  } else {
    playSound(soundForBlock(block));
  }
  if (derived.hardcore) endHardcoreSession(); // a sequência acabou por conta própria: nada a cobrar
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  releaseWakeLock();
  stopBlocking(); // o bloco acabou de verdade: a extensão pode liberar
  notify();
}

/** "✕ Parar": cancela sem som nem notificação. No hardcore não existe — só `quitHardcore`. */
/**
 * "Iniciar" pedido fora da lista (o cartão Agora do laptop). Quem decide o caminho é o PlanTab, que é
 * dono do consentimento do hardcore: ele lê `derived.startRequest`, chama o mesmo `startBlock` do
 * clique na linha e limpa. Assim o cartão nunca fura o hardcore.
 */
export function requestStartBlock(block: StudyBlock): void {
  derived.startRequest = block;
  notify();
}

export function clearStartRequest(): void {
  if (!derived.startRequest) return;
  derived.startRequest = null;
  notify();
}

export function stopTimer(): void {
  if (derived.hardcore) return;
  clearWatcher();
  clearPause(); // "Parar" no meio de uma pausa: nada é registrado — registro é só de bloco que continuou
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  releaseWakeLock();
  stopBlocking();
  notify();
}

/** "← Sair do foco": fecha o overlay, o timer continua (e a tela pode travar de novo). No hardcore não existe. */
export function closeFocus(): void {
  if (!derived.focusOpen || derived.hardcore) return;
  derived.focusOpen = false;
  releaseWakeLock();
  notify();
}

// ---- áudio ----

export function playSound(type: SoundType): void {
  playSoundInfra(type, derived.audio);
}

export function toggleMute(): void {
  derived.audio = { ...derived.audio, muted: !derived.audio.muted };
  notify();
}

/** Volume 0 silencia; qualquer outro valor reativa — como o slider antigo. */
export function setVolume(volume: number): void {
  derived.audio = { volume, muted: volume === 0 };
  notify();
}
