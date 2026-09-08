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

import { canToggleCheck } from '../domain/checks';
import { dk } from '../domain/time';
import { canStartBlock, chainedBlockAfter, cleanBlockName, soundForBlock, timerProgress } from '../domain/timer';
import type { StartCheck } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { playSound as playSoundInfra } from '../infrastructure/audio/sounds';
import type { SoundType } from '../infrastructure/audio/sounds';
import { notify as pushNotification, requestNotificationPermission } from '../infrastructure/notifications/notifications';
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

/** Põe o bloco no timer, abre o foco (com a tela segura pelo Wake Lock) e fica de olho no fim. */
function runBlock(block: StudyBlock): void {
  clearWatcher();
  derived.timerBlock = block;
  derived.focusOpen = true;
  notify();
  void requestWakeLock();
  endWatcher = setInterval(() => reconcileTimer(), 1000);
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
  let guard = 0;
  while (derived.timerBlock && timerProgress(derived.timerBlock, now).done && guard++ < 100) finishTimer(now);
  syncBlocking(now); // "em espera" virou "rodando" (ou o bloco acabou): a extensão acompanha
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

/** Valida contra o dia visível e o relógio; a UI mostra o motivo se recusar. */
export function tryStartTimer(block: StudyBlock, now: Date = new Date()): StartCheck {
  const check = canStartBlock(block, currentDayKey(), now);
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
    const completed = {
      name: cleanBlockName(block.name),
      type: block.type,
      xp: result?.xp ?? 0,
      coins: result?.coins ?? 0,
      at: now.getTime(),
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
