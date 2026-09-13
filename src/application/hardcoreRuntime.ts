// A sessão hardcore em andamento: o que fica em `derived.hardcore` e no
// dispositivo (localStorage). Sem os verbos de entrar/desistir — esses ficam em
// `hardcore.ts`, que precisa do timer; o timer precisa daqui (emendar, terminar).
// Duas pontas, sem ciclo.
//
// Uma sessão só "vale" quando o bloco começa a rodar (`armed`): antes disso
// (em espera) não há nada a cobrar, e fechar a aba não é abandono.
//
// **Bloquear sites não é assunto daqui** desde 2026-09-08: quem fala com a
// extensão é `application/siteBlock.ts`, uma fonte só, com ou sem hardcore.

import { isForfeited, penaltyRecord, quitCost, sessionFor } from '../domain/hardcore';
import type { HardcoreSession, QuitCost } from '../domain/hardcore';
import { abandonNotice } from '../domain/progressNotices';
import { dk } from '../domain/time';
import { timerProgress } from '../domain/timer';
import type { PenaltyRecord, StudyBlock } from '../domain/types';
import { clearHardcoreSession, writeHardcoreSession } from '../infrastructure/hardcoreSession';
import { armUnloadGuard, disarmUnloadGuard } from '../infrastructure/unloadGuard';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, notify, state } from '../store/store';
import { pushNotifications } from './notifications';
import { activePet, petById } from './pets';
import { clearBlockCache, computeStatsNow } from './plan';
import { saveNow } from './save';

const uid = (): string | null => state.user?.uid ?? null;

/** Sessão nova pro bloco (ainda em espera até `armHardcoreIfRunning` ver o relógio). */
export function beginHardcoreSession(block: StudyBlock, now: Date): void {
  derived.hardcore = { ...sessionFor(block, dk(now), activePet()?.id ?? null, now), armed: false };
}

/** Uma sessão que veio do dispositivo (recarregou a página no meio do bloco). */
export function adoptHardcoreSession(session: HardcoreSession): void {
  derived.hardcore = { ...session, armed: false };
}

/**
 * O bloco começou a rodar? Então a sessão passa a valer: gravada no dispositivo
 * e — se é estudo — o guard de fechar a aba. Pausa sai de graça. Idempotente; o
 * tick do timer chama a cada segundo.
 */
export function armHardcoreIfRunning(now: Date = new Date()): void {
  const hc = derived.hardcore;
  if (!hc || hc.armed) return;
  if (timerProgress(hc, now).phase !== 'running') return;
  hc.armed = true;
  const u = uid();
  if (u) writeHardcoreSession(u, hc);
  if (hc.type === 'estudo') armUnloadGuard();
  else disarmUnloadGuard();
}

/** O foco emendou no bloco seguinte dentro do hardcore. */
export function hardcoreChained(next: StudyBlock, now: Date): void {
  const hc = derived.hardcore;
  if (!hc) return;
  derived.hardcore = { ...sessionFor(next, hc.dateKey, hc.pet, now), armed: false };
  armHardcoreIfRunning(now);
}

/** A sequência acabou (naturalmente, por desistência ou por logout): some tudo. */
export function endHardcoreSession(): void {
  derived.hardcore = null;
  const u = uid();
  if (u) clearHardcoreSession(u);
  disarmUnloadGuard();
}

// ---- a conta do abandono (o `hardcore.ts` faz o mesmo pra "Desistir") ----

/** Aplica a penalidade: registro no dia, XP do pet descontado, check do bloco removido. */
export function applyPenalty(session: HardcoreSession, cost: QuitCost, reason: PenaltyRecord['reason'], now: Date): void {
  const pet = petById(session.pet) ?? activePet();
  if (pet && cost.petXp > 0) pet.xp = Math.max(0, (pet.xp || 0) - cost.petXp);
  const day = state.penalties[session.dateKey] ?? (state.penalties[session.dateKey] = []);
  day.push(penaltyRecord(session, cost, pet?.id ?? null, reason, now));
  const checks = state.checks[session.dateKey];
  if (checks && checks[session.time]) {
    delete checks[session.time];
    if (Object.keys(checks).length === 0) delete state.checks[session.dateKey];
  }
  clearBlockCache(); // o memo de stats invalida
  void saveNow(); // sem debounce: quem fecha a aba logo depois não escapa da conta
}

/**
 * O estudo foi abandonado: a conta de desistir, cobrada agora. Um caminho só pros
 * DOIS jeitos de abandonar, que é o ponto — o app que fechou (o boot descobre) e o
 * app que ficou aberto sem ninguém (o laço de emenda descobre) são a mesma ausência,
 * e a conta não pode depender de a aba ter ficado aberta. Medido em 2026-09-13, antes
 * disto: a mesma ausência de 09:00 às 18:00 cobrava o abandono com o app fechado e
 * entregava os 32 blocos do dia (960 XP, 425 moedas) com o app aberto.
 *
 * `causa` muda só a frase: `fechou` (o app foi embora) ou `ocioso` (o app ficou
 * aberto sem ninguém) — dizer "o app fechou" pra quem está olhando a própria tela
 * aberta seria mentira. Devolve a conta aplicada, ou `null` quando não há o que
 * cobrar (pausa, bloco já abandonado, ou saldo zero). NÃO encerra a sessão nem o
 * timer — quem chama decide, porque o boot e o laço arrumam a casa diferente.
 */
export function abandonHardcore(session: HardcoreSession, now: Date, causa: 'fechou' | 'ocioso'): QuitCost | null {
  if (session.type !== 'estudo') return null;
  if (isForfeited(state.penalties, session.dateKey, session.time)) return null;
  const pet = petById(session.pet);
  // O bloco já acabou: a conta é a de um estudo rodando (nunca "em espera").
  const cost = quitCost({ block: session, now, userTotalXP: computeStatsNow(now).totalXP, petXP: pet ? pet.xp || 0 : null, phase: 'running' });
  if (cost.free) return null;
  // A linha ANTES da penalidade, de propósito: `applyPenalty` termina em `saveNow()`
  // — sem debounce, porque quem fecha a aba em seguida não pode escapar da conta. Se
  // a notificação entrasse depois, ela ficaria 800ms na fila enquanto a penalidade já
  // estaria gravada, e quem fechasse a aba nessa janela perderia a linha PRA SEMPRE:
  // no boot seguinte o bloco já está abandonado e a guarda `!isForfeited` pula tudo.
  pushNotifications([abandonNotice(session.dateKey, session, cost, pet?.name ?? null, causa === 'ocioso')], now);
  applyPenalty(session, cost, 'abandon', now);
  const frase = causa === 'ocioso' ? strings.hardcore.toast.abandonedIdle : strings.hardcore.toast.abandoned;
  showToast(frase(session.name, cost, pet?.name ?? null));
  notify();
  return cost;
}
