// O fim do bloco avisado PELA EXTENSÃO, quando ela está aí.
//
// O aviso do próprio app (som + notificação, em `timer.ts`) nasce de um `setInterval`
// na página — e a página em segundo plano é estrangulada pelo navegador (um tique por
// minuto depois de 5 min escondida), congelada, ou simplesmente descartada da memória
// (o "economizador" do Chrome, as "abas dormindo" do Edge): aí o timer some junto e
// ninguém avisa nada. O service worker da extensão tem `chrome.alarms`, que dispara na
// hora certa em qualquer um desses estados, com a aba do app onde estiver.
//
// **É uma projeção do estado do timer, não mais uma transição.** Em vez de cada caso de
// uso (iniciar, emendar, pausar, retomar, parar, desistir, encerrar o dia) lembrar de
// avisar a extensão, isto escuta o store e publica quando o que ela precisa saber muda.
// Uma transição nova não tem como esquecer — e `notify()` já é chamado em todas.
//
// O que ela recebe é o aviso PRONTO: quando, o título e o texto (as mesmas strings da
// notificação do app), o som e o volume deste dispositivo. A extensão continua burra.
// Pausado não há fim: `running: false` e o alarme some; retomar publica o fim ajustado.
//
// **Quem avisa é um só.** Com a extensão armada pra este fim e a aba SEM foco, o app se
// cala no fim do bloco (`alarmDelegated`): a extensão avisou na hora exata, e o app,
// chegando até um minuto atrasado pelo estrangulamento, só repetiria. Com a aba em foco
// é o app que avisa, como sempre — e a extensão se cala (ela confere a janela focada e a
// aba ativa antes de tocar). Sem extensão, ou sem o ack dela, nada muda.
//
// **Uma carga da página que nunca armou nada não desarma.** É a mesma regra do bloqueio
// de sites (`siteBlock.ts`): recarregar no meio do estudo — ou a aba ter sido descartada
// e voltado — não pode calar o alarme que a carga anterior armou. Esse é justamente o
// caso em que só a extensão sabe que o bloco terminou.

import { cleanBlockName, soundForBlock, timerEnd } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { onExtensionQuery, onTimerAck, publishTimer } from '../infrastructure/extensionBridge';
import type { TimerPayload } from '../infrastructure/extensionBridge';
import type { Unsubscribe } from '../infrastructure/ports';
import { strings } from '../shared/strings';
import { derived, subscribe } from '../store/store';

const IDLE: TimerPayload = { v: 1, running: false };

/** A assinatura do último payload publicado NESTA carga da página. `null` = nunca publicamos nada. */
let published: string | null = null;
/** O fim (ms) que a extensão confirmou ter armado; `null` = nada confirmado. */
let armedUntil: number | null = null;

const appUrl = (): string => (typeof location !== 'undefined' ? location.origin : '');

/** O que a extensão deveria ter armado neste instante. */
export function desiredTimerPayload(now: Date = new Date()): TimerPayload {
  const block = derived.timerBlock;
  if (!block || derived.timerPausedAt != null) return IDLE;
  const n = strings.timer.notification;
  return {
    v: 1,
    running: true,
    endsAt: timerEnd(block, now, derived.timerEndsAt).getTime(),
    title: block.type === 'estudo' ? n.study : n.break,
    body: cleanBlockName(block.name),
    // O mesmo som que o app tocaria: "deu certo" dentro do foco, o do tipo fora dele.
    sound: derived.focusOpen ? 'sucesso' : soundForBlock(block),
    audio: { volume: derived.audio.volume, muted: derived.audio.muted },
    appUrl: appUrl(),
  };
}

function send(payload: TimerPayload): void {
  published = JSON.stringify(payload);
  armedUntil = null; // até o ack do que acabou de sair, ninguém confirmou nada
  publishTimer(payload);
}

/** Acerta a extensão com o timer de agora. Idempotente: só publica quando muda. */
export function syncTimerAlarm(now: Date = new Date()): void {
  const payload = desiredTimerPayload(now);
  if (!payload.running && published === null) return; // esta carga nunca armou nada: não desarma
  const sig = JSON.stringify(payload);
  if (sig === published) return;
  send(payload);
}

/** A página está em frente? Sem `document` (Node) conta como sim: na dúvida, o app avisa. */
function pageFocused(): boolean {
  if (typeof document === 'undefined' || typeof document.hasFocus !== 'function') return true;
  try {
    return document.hasFocus();
  } catch {
    return true;
  }
}

/**
 * O fim deste bloco fica por conta da extensão? Sim quando ela confirmou o alarme pra
 * este mesmo fim E a página não está em frente. `timer.ts` pergunta no fim do bloco e,
 * se sim, não toca nem notifica — a extensão já fez os dois na hora exata.
 */
export function alarmDelegated(block: Pick<StudyBlock, 'endTime'>, now: Date = new Date()): boolean {
  if (armedUntil == null) return false;
  const endsAt = timerEnd(block, now, derived.timerEndsAt).getTime();
  if (Math.abs(armedUntil - endsAt) > 1000) return false;
  return !pageFocused();
}

let watches: Unsubscribe[] = [];

/** Registra uma vez, no boot: escuta o store, a pergunta da extensão e o ack dela. */
export function watchTimerAlarm(): void {
  if (watches.length > 0) return;
  watches = [
    subscribe(() => syncTimerAlarm()),
    // A extensão perguntou (recarregou, foi instalada agora): com timer rodando, republica;
    // sem, silêncio — o que ela tem armado continua valendo.
    onExtensionQuery(() => {
      const payload = desiredTimerPayload();
      if (payload.running) send(payload);
    }),
    onTimerAck((ack) => {
      armedUntil = ack.armed ? ack.endsAt : null;
    }),
  ];
}

/** Só pros testes: esquece o que foi publicado nesta "carga da página". */
export function resetTimerAlarmForTests(): void {
  published = null;
  armedUntil = null;
  for (const off of watches) off();
  watches = [];
}
