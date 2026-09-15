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
//
// O relógio volta de onde parou, no segundo: o plano só sabe esticar em minutos
// cheios (e arredonda pra cima, a favor de quem pausou), então quem manda no
// relógio depois de retomar é `derived.timerEndsAt` — ver `timerEnd`.

import { isDayClosed } from '../domain/checks';
import { rhythmOf } from '../domain/configHistory';
import { stopDayAt } from '../domain/dayWindows';
import { addPause, parsePauseSession, pauseRecordFor, pauseRemap, remapChecksForPause, remapGroupsForPause } from '../domain/pauses';
import { planDelta, planDeltaParts } from '../domain/planDelta';
import { dk, timeToMins } from '../domain/time';
import { timerEnd, timerProgress } from '../domain/timer';
import type { StudyBlock } from '../domain/types';
import { clearPauseSession, readPauseSession } from '../infrastructure/pauseSession';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { checkBlock } from './checks';
import { rescheduleEndOfDayPrompt, suspendEndOfDayPrompt } from './dayEnd';
import { effectiveWindows } from './dayWindows';
import { growLiveForPause } from './live';
import { blocksForDay, clearBlockCache, configAtDay, dayModeOf, rebuildWeeks } from './plan';
import { saveNow } from './save';
import { adoptPausedBlock, pauseRuntime, reopenFocus, resumeRuntime, stopTimer } from './timer';

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
  if (timerProgress(block, now, null, derived.timerEndsAt).phase !== 'running') return { ok: false, reason: 'not-running' };
  if (isDayClosed(state.closedDays, dk(now))) return { ok: false, reason: 'day-closed' };
  pauseRuntime(now);
  return { ok: true };
}

export type StopHereRefusal = 'no-timer' | 'hardcore' | 'not-today' | 'day-closed' | 'nothing-lived';
export type StopHereResult = { ok: true; block: StudyBlock | null; at: string } | { ok: false; reason: StopHereRefusal };

/**
 * "■ Parar por aqui": o dia acaba agora, e **os minutos que passaram valem**.
 *
 * Até aqui sair no meio de um bloco não rendia nada — o bloco ficava inteiro no plano,
 * sem check, e os 12 minutos estudados sumiam. Isso nunca foi uma decisão: é consequência
 * de o XP sair do plano (`calcXP` sobre a duração do bloco) e o check não guardar duração.
 * Como XP e moeda são lineares, basta o plano ter o bloco do tamanho certo — e é o que
 * `stopDayAt` faz, aparando as janelas no minuto da parada e marcando-as como corrida.
 * Zero campo novo no documento.
 *
 * A pausa aberta é registrada ANTES do corte (retomando), senão os minutos parados
 * sumiriam — é a mesma regra do "✕ Parar", só que aqui há o que preservar.
 *
 * **Não passa por `setDayWindows`** de propósito: o `commit` dele dispara
 * `notifyPlanDelta`, e parar pra almoçar mostraria "Plano reajustado: −8 estudos ·
 * termina às 10:12" — contabilidade de perda no segundo em que o app deveria estar
 * calado. O dia não foi mexido, foi vivido.
 */
export function stopHere(now: Date = new Date()): StopHereResult {
  const block = derived.timerBlock;
  if (!block) return { ok: false, reason: 'no-timer' };
  if (derived.hardcore) return { ok: false, reason: 'hardcore' }; // lá a porta é "Desistir", e cobra
  const todayKey = dk(now);
  if (isDayClosed(state.closedDays, todayKey)) return { ok: false, reason: 'day-closed' };
  if (timerProgress(block, now, derived.timerPausedAt, derived.timerEndsAt).phase === 'waiting') {
    return { ok: false, reason: 'no-timer' }; // em espera não há o que parar: a saída é Cancelar
  }
  if (derived.timerPausedAt != null && dk(new Date(derived.timerPausedAt)) !== todayKey) {
    return { ok: false, reason: 'not-today' };
  }

  // A pausa aberta vira registro antes de o dia fechar. `resumeTimer` faz isso inteiro
  // (registro, remapeamento de checks e grupos, save) — e se ela atravessou o fim do
  // bloco ele já para sozinho, e não há o que aparar.
  if (derived.timerPausedAt != null && resumeTimer(now) === 'ended') {
    return { ok: true, block: null, at: minuto(now) };
  }

  // O ritmo é o do DIA (a config que valia hoje), não o da config atual: quem mudou o pomodoro
  // à tarde com a manhã já marcada tem a manhã gerada pela versão de antes — e é ela que a
  // corrida carimba. Janela que já é corrida guarda o ritmo dela (ver `stopDayAt`).
  const corte = stopDayAt(effectiveWindows(todayKey), now, rhythmOf(configAtDay(todayKey)));
  if (!corte.ok) {
    // Nada vivido: a parada caiu no primeiro minuto do primeiro bloco do dia. Num dia ao vivo
    // isso é a corrida recém-aberta — e ela tem que SUMIR, senão o bloco de 25 min fica inteiro
    // no plano, sem check, com "▶ Iniciar" na linha e a faixa escondida atrás dele (a janela
    // ainda cobre agora). O dia volta a "não começou". Numa rotina não há o que aparar.
    if (dayModeOf(todayKey) === 'live') {
      const agoraMin = now.getHours() * 60 + now.getMinutes();
      const antes = (state.windowOverrides[todayKey]?.studyWindows ?? []).filter((w) => timeToMins(w.start) < agoraMin);
      if (antes.length > 0) state.windowOverrides[todayKey] = { studyWindows: antes };
      else delete state.windowOverrides[todayKey];
      clearBlockCache();
      rebuildWeeks(now);
      void saveNow();
    }
    stopTimer();
    return { ok: false, reason: 'nothing-lived' };
  }

  state.windowOverrides[todayKey] = { studyWindows: corte.windows };
  clearBlockCache();
  rebuildWeeks(now); // a data ganha dados — e notifica
  void saveNow(); // sem debounce: um F5 logo depois não pode perder o corte
  suspendEndOfDayPrompt(); // parar é decisão explícita: o prompt não volta a perguntar no mesmo segundo

  // O bloco parcial é o último do dia agora. Pode não existir (a parada caiu no primeiro
  // minuto de um bloco, e `place` não emite nada com menos de 1 min que valha).
  const parcial = blocksForDay(todayKey).filter((b) => b.type === 'estudo').pop() ?? null;
  const meu = parcial && parcial.time === block.time ? parcial : null;
  // E ele sai MARCADO. Sem isto o corte acontecia — o bloco encolhia pros minutos vividos —
  // mas ninguém os creditava: a folha prometia "+24 XP", o Plano dizia "Hoje: —" e o dia
  // fechava com zero. `checkBlock` passa pelo `canCheckBlock` de sempre (dia aberto, bloco
  // já começado) e não remarca o que já estava marcado.
  if (meu) checkBlock(todayKey, meu, now);
  stopTimer();
  return { ok: true, block: meu, at: minuto(now) };
}

const minuto = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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

  // O relógio volta de onde parou: o fim anda a duração REAL da parada, enquanto o plano
  // anda em minutos cheios (pra cima). Sem isso, pausar 10s devolvia o bloco 50s mais gordo.
  // `timerEnd` corta no fim do plano, então um bloco sem pra onde crescer encurta mesmo.
  const endsAt = timerEnd(block, now, derived.timerEndsAt).getTime() + (now.getTime() - pausedAt);

  const record = pauseRecordFor(new Date(pausedAt), now);
  const before = blocksForDay(todayKey);
  state.pauses[todayKey] = addPause(state.pauses[todayKey], record);
  clearBlockCache();
  // Num dia ao vivo a janela é a corrida, e ela acaba no fim do bloco em andamento: o bloco
  // esticado pela pausa bateria nesse fim e seria cortado. Esticar vem ANTES do remapeamento
  // porque é ele que decide quais blocos existem — e só acrescenta espaço DEPOIS do bloco
  // pausado, então nada do que veio antes se move.
  const after = growLiveForPause(todayKey, block, blocksForDay(todayKey), now) ?? blocksForDay(todayKey);

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
  if (!regenerated || timerProgress(regenerated, now, null, endsAt).done) {
    // A pausa atravessou o fim do bloco (um evento fixo, o fim da janela): para sem marcar — quem quiser marca à mão.
    derived.timerPausedAt = null;
    if (regenerated) derived.timerBlock = regenerated;
    stopTimer();
    showToast(strings.timer.pauseEnded);
    return 'ended';
  }
  resumeRuntime(regenerated, now, endsAt);
  // Quanto o dia andou DE FATO: os minutos que o bloco cresceu. Com os segundos somados
  // antes de arredondar, uma pausa curta atrás da outra pode não mexer no plano nenhuma vez.
  const deslocou = (regenerated.paused ?? 0) - (block.paused ?? 0);
  showToast(strings.timer.pauseRecorded(record.secs, deslocou, planDeltaParts(planDelta(before, after)), dropped));
  return 'resumed';
}

/**
 * "▶ Continuar": a porta de volta pro bloco em andamento — a mesma da linha do plano e do
 * cartão do laptop. Pausado, retomar já reabre o foco (`resumeRuntime`); rodando (só dá
 * pra estar fora do foco assim num estado de boot antigo), só reabre. Nunca passa por
 * `runBlock`, que reiniciaria o bloco e comeria a pausa.
 */
export function continueBlock(now: Date = new Date()): ResumeOutcome {
  if (!derived.timerBlock) return 'none';
  if (derived.timerPausedAt != null) return resumeTimer(now);
  reopenFocus();
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
