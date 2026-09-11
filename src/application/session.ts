// Sessão: entrar, sair, e o boot do app a cada mudança de usuário.
// Era o callback de onAuthStateChanged + loadData + initApp do app antigo.

import { AuthError, isValidEmail, isValidPassword } from '../domain/auth';
import type { AuthErrorReason } from '../domain/auth';
import { emptyPersistedState, hydrateUserDoc } from '../domain/persistence';
import { auth, users } from '../infrastructure';
import { showToast } from '../shared/toast';
import { strings } from '../shared/strings';
import { derived, markAuthReady, notify, state } from '../store/store';
import { scheduleEndOfDayPrompt } from './dayEnd';
import { startDayRollover, stopDayRollover } from './dayRollover';
import { resumeHardcoreOnBoot } from './hardcore';
import { endHardcoreSession } from './hardcoreRuntime';
import { resumePauseOnBoot } from './pause';
import { stopBlocking, watchExtension } from './siteBlock';
import { openOnboarding } from './onboarding';
import { applyPendingPetXP } from './pets';
import { clearBlockCache, findWeek, rebuildWeeks } from './plan';
import { blockSaves } from './save';
import { rememberDoc, subscribeRemote, unsubscribeRemote } from './sync';
import { stopTimer, watchVisibility } from './timer';

export async function signIn(): Promise<void> {
  try {
    await auth.signIn();
  } catch (e) {
    // Popup fechado, rede fora… o usuário tenta de novo; não é erro fatal.
    console.error(e);
  }
}

export type AuthActionResult = { ok: true } | { ok: false; reason: AuthErrorReason };

const reasonOf = (e: unknown): AuthErrorReason => (e instanceof AuthError ? e.reason : 'unknown');

export async function signUpWithEmail(email: string, password: string): Promise<AuthActionResult> {
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid-email' };
  // O Firebase aceita 6 caracteres; pedimos 8 — checagem nossa, antes de chamar a infra.
  if (!isValidPassword(password)) return { ok: false, reason: 'weak-password' };
  try {
    await auth.signUpWithEmail(email.trim(), password);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthActionResult> {
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid-email' };
  try {
    await auth.signInWithEmail(email.trim(), password);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

/**
 * Dispara o e-mail de redefinição. Sempre resolve `ok: true` quando o e-mail
 * tem formato válido — mesmo que a conta não exista — pra não revelar contas
 * cadastradas (ver decisão em plans/2026-09-03_2000_login-email-senha.md).
 */
export async function resetPassword(email: string): Promise<AuthActionResult> {
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid-email' };
  try {
    await auth.sendPasswordReset(email.trim());
  } catch (e) {
    console.error(e);
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await auth.signOut();
}

/** Conta nova, documento lido, ou leitura que falhou — o boot trata os três diferente. */
export type LoadOutcome = 'new' | 'loaded' | 'failed';

/**
 * Carrega o documento do usuário.
 *
 * O save é destravado AQUI, e só no caminho feliz. O motivo: `users.save` substitui
 * o documento inteiro (setDoc sem merge), e antes desta função o `state` é o estado
 * vazio do módulo — ou, num logout seguido de login, o que sobrou da conta anterior.
 * Se a leitura falha e o app segue rodando, o primeiro `scheduleSave()` grava esse
 * vazio por cima do histórico de verdade, com ack do servidor e sem desfazer. Havia
 * até um caminho sem clique nenhum: `resumeHardcoreOnBoot` cobra a penalidade e
 * chama `saveNow()` dentro do próprio boot.
 */
export async function loadUserData(uid: string, now: Date = new Date()): Promise<LoadOutcome> {
  let outcome: LoadOutcome = 'loaded';
  try {
    const raw = await users.load(uid);
    rememberDoc(raw); // a primeira emissão do snapshot repete este doc — o sync ignora
    if (raw) {
      // Qualquer formato antigo: a migração vive em src/domain/persistence.ts.
      Object.assign(state, hydrateUserDoc(raw));
    } else {
      outcome = 'new';
      Object.assign(state, emptyPersistedState());
    }
    blockSaves(false); // o estado agora é o desta conta: pode escrever
  } catch (e) {
    console.error('Load failed:', e);
    outcome = 'failed';
    // Trava aqui também, e não só no boot: assim a garantia é da própria função —
    // depois dela, ou o estado é o desta conta, ou ninguém escreve.
    blockSaves(true);
    // Estado vazio é sempre mais seguro que estado herdado: o que sobrou da conta
    // anterior não pode viajar pro documento desta.
    Object.assign(state, emptyPersistedState());
    derived.loadFailed = true;
    showToast(strings.session.loadError);
  }
  rebuildWeeks(now);
  clearBlockCache();
  return outcome;
}

/** O que acontece depois de carregar: dia visível, o que ficou no dispositivo, XP pendente. */
export function initAfterLoad(now: Date = new Date()): void {
  setTimeout(() => scheduleEndOfDayPrompt(), 600);
  state.uiWeek = findWeek(now);
  const week = derived.weeks[state.uiWeek - 1];
  state.uiDay = week ? Math.min(6, Math.max(0, Math.floor((now.getTime() - week.start.getTime()) / 86400000))) : 0;
  notify();
  resumeHardcoreOnBoot(now); // a sessão hardcore que ficou neste dispositivo: volta pro foco, ou cobra o abandono
  resumePauseOnBoot(now); // a pausa que ficou aberta neste dispositivo: o timer volta pausado
  // DEPOIS da penalidade do abandono, nunca antes: ela apaga o check do bloco e
  // desconta XP do usuário e do pet. Creditando primeiro, o sininho anunciaria o
  // ganho e o nível de um dia que a cobrança desfaz segundos depois — e os ids
  // queimados impediriam a linha certa de aparecer pra sempre.
  applyPendingPetXP(now);
  startDayRollover(now); // o app aberto atravessando a meia-noite: o dia entra na conta e o sininho conta
}

function resetToLoggedOut(): void {
  stopDayRollover();
  if (derived.hardcore) endHardcoreSession(); // antes de perder o uid: limpa a sessão do dispositivo
  if (derived.timerPausedAt != null) stopTimer(); // idem a pausa aberta
  stopBlocking(); // saiu da conta: a extensão libera na hora
  state.user = null;
  derived.loadFailed = false;
  // O estado inteiro, não uma lista de campos. A lista existia e esquecia cinco:
  // eventSeries, groups, windowOverrides, avatar e tutorialSeen ficavam com o
  // conteúdo de quem saiu — e as séries são justamente onde moram as aulas e
  // consultas importadas de um .ics. Num navegador compartilhado isso viajava
  // pro documento da próxima pessoa. `emptyPersistedState` nunca esquece um campo
  // novo, porque é a mesma função que define o que uma conta nova tem.
  Object.assign(state, emptyPersistedState());
}

let started = false;

/** Registra o listener de auth uma vez. Chamado no boot. */
export function startSession(): void {
  if (started) return;
  started = true;
  watchVisibility(); // o timer se acerta com o relógio ao voltar pra aba / destravar o celular
  watchExtension(); // a extensão pergunta o estado ao carregar, e confirma o que aplicou
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      blockSaves(true); // travado até a leitura confirmar que o estado é o desta conta
      derived.loadFailed = false;
      state.user = user;
      markAuthReady();
      notify();
      const outcome = await loadUserData(user.uid);
      if (outcome === 'failed') {
        notify(); // a tela de falha assume a partir daqui; o boot não continua
        return;
      }
      initAfterLoad();
      if (outcome === 'new') openOnboarding();
      subscribeRemote(user.uid); // depois do load: o que mudar no servidor daqui em diante entra sozinho
    } else {
      unsubscribeRemote();
      resetToLoggedOut();
      markAuthReady();
      notify();
    }
  });
}
