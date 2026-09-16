// O timer: qual bloco está rodando e o modo foco. (O áudio mora em application/alerts.ts;
// daqui ele só é tocado — e preparado nos gestos que começam ou retomam um bloco.)
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
import { canStartBlock, chainedBlockAfter, cleanBlockName, finishesAsFocus, soundForBlock, timerEnd, timerProgress } from '../domain/timer';
import type { StartCheck, StartContext } from '../domain/timer';
import type { DateKey, StudyBlock } from '../domain/types';
import { notify as pushNotification, requestNotificationPermission } from '../infrastructure/notifications/notifications';
import { clearPauseSession, writePauseSession } from '../infrastructure/pauseSession';
import type { Unsubscribe } from '../infrastructure/ports';
import { onVisible } from '../infrastructure/visibility';
import { reacquireWakeLockIfWanted, releaseWakeLock, requestWakeLock } from '../infrastructure/wakeLock';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { playSound, primeAudio } from './alerts';
import { alarmDelegated } from './timerAlarm';
import { checkBlock } from './checks';
import { abandonHardcore, armHardcoreIfRunning, endHardcoreSession, hardcoreChained } from './hardcoreRuntime';
import { chainLive } from './live';
import { blocksForDay, currentDayKey, dayModeOf } from './plan';
import { stopBlocking, syncBlocking } from './siteBlock';

/**
 * Quanto tempo depois do fim de um bloco o app ainda o fecha sozinho.
 *
 * O laço de emenda existe pra aba em segundo plano e celular travado, e o CLAUDE.md
 * diz que ele deve resolver "um bloco por vez se vários passaram" — isso continua
 * valendo. Sem teto, porém, ele vira cascata: medido em 2026-09-13, com a config
 * padrão, ficar fora 1h30 marcava 6 blocos (90 min que ninguém estudou) e deixar o
 * app aberto o dia inteiro marcava os 32 do plano — 540 minutos, 960 XP e 425 moedas,
 * com o pet subindo de nível por cima.
 *
 * O número é 30 e não é arbitrário: ele tem que ser MAIOR que a maior ausência
 * legítima (a tela travada durante um pomodoro inteiro mais a pausa: ~30 min, e aí o
 * primeiro bloco volta ~25 min atrasado) e MENOR que a menor ausência que já não é
 * mais "eu estava aqui" (uma refeição, uma aula). Aos 5 min, que foi o primeiro
 * palpite, ele reprovava o caso de 21 minutos que o CLAUDE.md registra como certo.
 *
 * Passando daqui, o timer encerra no bloco que estava rodando e ele fica na lista SEM
 * check: perde-se no máximo um bloco que a pessoa talvez tenha terminado, e ela marca
 * à mão. A alternativa inventava horas.
 */
export const ATRASO_MAX_MIN = 30;

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

/** Esquece a pausa em andamento (runtime e dispositivo) e o ajuste de relógio que ela deixou. */
function clearPause(): void {
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  const u = uid();
  if (u) clearPauseSession(u);
}

/** Põe o bloco no timer, abre o foco (com a tela segura pelo Wake Lock) e fica de olho no fim. */
function runBlock(block: StudyBlock, now: Date = new Date()): void {
  clearPause();
  derived.timerBlock = block;
  derived.timerDay = dk(now);
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
  // O dia virou com o bloco rodando. `timerProgress` compara só o HORÁRIO, então o
  // bloco de ontem voltaria a "começa em" no mesmo horário de hoje — e `finishTimer`
  // marcaria o check no dia de HOJE, num bloco que era de ontem. É a mesma regra que
  // a pausa já seguia acima.
  if (derived.timerBlock && derived.timerDay && derived.timerDay !== dk(now)) {
    encerrarSemNinguem(now);
    return;
  }
  let guard = 0;
  while (derived.timerBlock && timerProgress(derived.timerBlock, now, null, derived.timerEndsAt).done && guard++ < 100) {
    // O bloco acabou faz muito tempo? Então ninguém estava aqui, e marcar seria inventar.
    const atrasoMs = now.getTime() - timerEnd(derived.timerBlock, now, derived.timerEndsAt).getTime();
    if (atrasoMs > ATRASO_MAX_MIN * 60_000) {
      encerrarSemNinguem(now);
      break;
    }
    finishTimer(now);
  }
  syncBlocking(now); // "em espera" virou "rodando" (ou o bloco acabou): a extensão acompanha
}

/**
 * Ninguém estava aqui: o bloco acabou faz mais de `ATRASO_MAX_MIN`, ou o dia virou
 * com ele rodando. Encerra sem check, sem som e sem emenda.
 *
 * **No hardcore isto CUSTA**, e custa o mesmo que teria custado com o app fechado.
 * Enquanto a guarda pulava o hardcore, a mesma ausência tinha dois preços opostos:
 * medido em 2026-09-13, sumir das 09:00 às 18:00 com o app fechado cobrava o abandono
 * (−100 XP, o pet caindo de nível) e com o app ABERTO entregava os 32 blocos do plano
 * — 540 min, 960 XP, 425 moedas. O modo que existe pra cobrar era o único que pagava
 * por ir embora, e pagava mais que o modo normal, que ganhou o teto primeiro.
 *
 * Uma pausa (ou uma sessão que nunca chegou a rodar) sai de graça, como no boot:
 * `resolveSession` também só cobra estudo.
 */
function encerrarSemNinguem(now: Date): void {
  const hc = derived.hardcore;
  if (!hc) {
    stopTimer();
    showToast(strings.timer.staleStop);
    return;
  }
  const cobrado = hc.armed ? abandonHardcore(hc, now, 'ocioso') : null;
  endHardcoreSession(); // antes do stopTimer: com sessão viva ele é no-op (o foco hardcore não tem saída livre)
  stopTimer();
  if (!cobrado) showToast(strings.timer.staleStop);
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

/**
 * Retomou: o bloco em andamento passa a ser o regenerado (fim novo) e o relógio volta
 * a correr de onde parou — `endsAt` é o fim ajustado pela pausa real (ver `timerEnd`),
 * porque o plano só estica em minutos cheios. O foco volta junto: relógio correndo
 * implica foco aberto (ver `closeFocus`).
 */
export function resumeRuntime(block: StudyBlock, now: Date, endsAt: number | null = null): void {
  primeAudio(); // "▶ Retomar" / "▶ Continuar" são gestos: o contexto de áudio acorda aqui
  clearPause();
  derived.timerEndsAt = endsAt;
  derived.timerBlock = block;
  derived.timerDay = dk(now);
  derived.focusOpen = true;
  startWatcher();
  void requestWakeLock();
  syncBlocking(now);
  notify();
}

/** Ao abrir o app com uma pausa aberta no dispositivo: o timer volta pausado, na barra (o foco fechado). */
export function adoptPausedBlock(block: StudyBlock, pausedAt: number): void {
  derived.timerBlock = block;
  derived.timerDay = dk(new Date(pausedAt));
  derived.timerPausedAt = pausedAt;
  derived.timerEndsAt = null; // o ajuste de uma pausa anterior morreu com a carga da página: vale o fim do plano
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
  // Começar OUTRO bloco com uma pausa aberta larga a pausa: registro é só de bloco que
  // continuou (a mesma regra do "✕ Parar"). Silencioso, porém, isso some do histórico sem
  // ninguém ver — e desde que o foco só se fecha pausado, é o estado normal da lista.
  if (derived.timerPausedAt != null && derived.timerBlock) showToast(strings.timer.pauseDropped);
  // Iniciar vem de um gesto (a linha, o cartão Agora, o "▶ Começar" do ao vivo, o consentimento
  // do hardcore): é a hora de criar o contexto de áudio, senão o fim do bloco toca em silêncio.
  // No boot (a sessão hardcore que voltou) não há gesto e isto não faz mal — ver `primeAudio`.
  primeAudio();
  derived.timerCompleted = null;
  runBlock(block, now);
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
 *
 * A pausa é a exceção (2026-09-16): dela dá pra sair do foco com o relógio correndo
 * (ver `closeFocus`), e o fim dela com o foco fechado é o MESMO fim do foco aberto —
 * marca, emenda no estudo e o foco volta junto com ele (`runBlock` abre). Senão sair
 * pra olhar o plano na pausa custaria a emenda e o check dela, um preço escondido.
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
  // A extensão armou o alarme pra este fim e a aba não está em frente: ela já avisou na hora
  // exata, com som e notificação, e este código pode estar chegando um minuto atrasado pelo
  // estrangulamento da aba de fundo. Quem avisa é um só — ver `timerAlarm.ts`.
  const delegated = alarmDelegated(block, now);
  if (!delegated) void pushNotification(block.type === 'estudo' ? n.study : n.break, cleanBlockName(block.name));

  if (finishesAsFocus(block, derived.focusOpen) && canToggleCheck(todayKey, { closedDays: state.closedDays, now })) {
    const result = checkBlock(todayKey, block, now); // null = já estava marcado à mão
    if (!delegated) playSound('sucesso');
    // No modo ao vivo o plano não tem futuro: a emenda GERA o bloco seguinte esticando a
    // corrida, em vez de procurá-lo numa lista que acaba agora. Sem isto o tracker pararia
    // sozinho a cada pomodoro — o oposto exato da feature. Vem ANTES da leva porque é ela
    // que diz se a leva fechou de verdade.
    const aoVivo = dayModeOf(todayKey) === 'live' || !!block.live;
    const next = aoVivo ? chainLive(todayKey, block.endTime, now) : chainedBlockAfter(blocksForDay(todayKey), block);
    // Este bloco fechou a leva? Só quando o check é DESTE momento: se ele já estava
    // marcado à mão, a leva fechou lá na lista e já foi comemorada lá.
    // E num dia ao vivo TUDO que existe no plano já aconteceu e está marcado, então o
    // ciclo estaria sempre completo e a faixa dispararia a cada estudo a partir do
    // segundo — o marco que reconhece a leva viraria ruído de 30 em 30 minutos. Ali ele
    // fecha onde a leva de fato fecha: quando o próximo bloco é a pausa longa.
    const podeComemorar = !aoVivo || (!!next && next.type === 'pausa' && next.name.includes('longa'));
    const leva = result && podeComemorar ? closedCycleOf(blocksForDay(todayKey), block, state.checks[todayKey]) : null;
    const completed = {
      name: cleanBlockName(block.name),
      type: block.type,
      xp: result?.xp ?? 0,
      coins: result?.coins ?? 0,
      at: now.getTime(),
      cycle: leva,
    };
    if (next) {
      derived.timerCompleted = completed;
      runBlock(next, now);
      if (derived.hardcore) hardcoreChained(next, now);
      syncBlocking(now); // emendou: estudo → pausa libera, pausa → estudo bloqueia de novo
      return;
    }
    showToast(strings.timer.completed(completed));
  } else if (!delegated) {
    playSound(soundForBlock(block));
  }
  if (derived.hardcore) endHardcoreSession(); // a sequência acabou por conta própria: nada a cobrar
  derived.timerBlock = null;
  derived.timerDay = null; // o bloco acabou no dia dele; deixar a âncora faria a virada da meia-noite avisar de um timer que não existe
  derived.timerEndsAt = null;
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
  derived.timerDay = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  releaseWakeLock();
  stopBlocking();
  notify();
}

/**
 * "← Sair do foco": fecha o overlay, o timer continua (e a tela pode travar de novo).
 *
 * **Num estudo, só pausado** (2026-09-12). Enquanto o relógio corre, o foco É o
 * compromisso — sair dali não servia a nada que a própria tela não mostre (o próximo
 * bloco, o ganho, o relógio), e servia a tudo que o app pede pra fazer de olhos abertos:
 * mexer no plano no meio de um estudo. Quem precisa mexer pausa antes, e a pausa é
 * honesta — vira registro e o dia desliza. Em espera a saída é "✕ Cancelar" (`stopTimer`),
 * que desarma o timer: não há o que congelar antes da hora. No hardcore nada disso existe.
 *
 * **Numa pausa rodando, é livre** (2026-09-16, pedido do Tomi: "sair do modo foco durante
 * a pausa sem ter que pausar a pausa"). O compromisso é com o estudo; a pausa é a vida
 * entrando — e obrigar a congelar uma pausa pra olhar o plano era o app cobrando por um
 * café. O relógio segue: quando a pausa acaba, ela marca, emenda no estudo e o foco volta
 * com ele (ver `finishTimer`). Em espera continua sendo Cancelar.
 */
export function closeFocus(now: Date = new Date()): void {
  if (!derived.focusOpen || derived.hardcore) return;
  const block = derived.timerBlock;
  if (block) {
    const phase = timerProgress(block, now, derived.timerPausedAt, derived.timerEndsAt).phase;
    const pausaRodando = block.type === 'pausa' && phase === 'running';
    if (phase !== 'paused' && !pausaRodando) return;
  }
  derived.focusOpen = false;
  releaseWakeLock();
  notify();
}

/** O bloco em andamento é este? Por horário, como todo o resto do app (o objeto é outro a cada geração). */
export const isTimerBlock = (b: Pick<StudyBlock, 'time' | 'endTime'>): boolean =>
  !!derived.timerBlock && derived.timerBlock.time === b.time && derived.timerBlock.endTime === b.endTime;

/**
 * O foco volta, e só isso: não toca no bloco, na pausa aberta, no ajuste do relógio nem
 * no watcher. É o espelho de `closeFocus` — e existe porque o caminho que parecia óbvio
 * (tocar de novo na linha) passa por `runBlock`, que começa com `clearPause()` e jogava
 * a pausa fora sem registrar. Pausado, o Wake Lock fica solto: a tela pode dormir.
 */
export function reopenFocus(): void {
  if (!derived.timerBlock || derived.focusOpen) return;
  primeAudio();
  derived.focusOpen = true;
  if (derived.timerPausedAt == null) void requestWakeLock();
  notify();
}
