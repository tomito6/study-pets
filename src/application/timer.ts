// O timer: qual bloco está rodando, o modo foco e o áudio.
//
// O estado é só "qual bloco" (derived.timerBlock). O restante é derivado do
// relógio pelos componentes, a cada segundo, SEM passar pelo store — um
// notify() por segundo faria o app inteiro re-renderizar e recalcular stats.
// O único intervalo aqui existe pra detectar o fim e disparar som/notificação.

import { canStartBlock, cleanBlockName, soundForBlock, timerProgress } from '../domain/timer';
import type { StartCheck } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { playSound as playSoundInfra } from '../infrastructure/audio/sounds';
import type { SoundType } from '../infrastructure/audio/sounds';
import { notify as pushNotification, requestNotificationPermission } from '../infrastructure/notifications/notifications';
import { strings } from '../shared/strings';
import { derived, notify } from '../store/store';
import { currentDayKey } from './plan';

let endWatcher: ReturnType<typeof setInterval> | null = null;

function clearWatcher(): void {
  if (endWatcher) clearInterval(endWatcher);
  endWatcher = null;
}

/** Inicia o timer no bloco (sem validar — use `tryStartTimer` a partir da UI). */
export function startTimer(block: StudyBlock): void {
  clearWatcher();
  derived.timerBlock = block;
  derived.focusOpen = true;
  requestNotificationPermission();
  notify();
  endWatcher = setInterval(() => {
    if (derived.timerBlock && timerProgress(derived.timerBlock, new Date()).done) finishTimer();
  }, 1000);
}

/** Valida contra o dia visível e o relógio; a UI mostra o motivo se recusar. */
export function tryStartTimer(block: StudyBlock, now: Date = new Date()): StartCheck {
  const check = canStartBlock(block, currentDayKey(), now);
  if (!check.ok) return check;
  startTimer(block);
  return check;
}

/** Fim natural do bloco: som, notificação, e o timer some. */
function finishTimer(): void {
  const block = derived.timerBlock;
  clearWatcher();
  if (block) {
    playSound(soundForBlock(block));
    const t = strings.timer.notification;
    pushNotification(block.type === 'estudo' ? t.study : t.break, cleanBlockName(block.name));
  }
  derived.timerBlock = null;
  derived.focusOpen = false;
  notify();
}

/** "✕ Parar": cancela sem som nem notificação. */
export function stopTimer(): void {
  clearWatcher();
  derived.timerBlock = null;
  derived.focusOpen = false;
  notify();
}

/** "← Sair do foco": fecha o overlay, o timer continua. */
export function closeFocus(): void {
  if (!derived.focusOpen) return;
  derived.focusOpen = false;
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
