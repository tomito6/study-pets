// Sessão: entrar, sair, e o boot do app a cada mudança de usuário.
// Era o callback de onAuthStateChanged + loadData + initApp do app antigo.

import { AuthError, isValidEmail, isValidPassword } from '../domain/auth';
import type { AuthErrorReason } from '../domain/auth';
import { DEFAULT_CFG } from '../domain/config';
import { emptyPersistedState, emptyPets, hydrateUserDoc } from '../domain/persistence';
import { auth, users } from '../infrastructure';
import { showToast } from '../shared/toast';
import { strings } from '../shared/strings';
import { derived, markAuthReady, notify, state } from '../store/store';
import { scheduleEndOfDayPrompt } from './dayEnd';
import { openOnboarding } from './onboarding';
import { applyPendingPetXP } from './pets';
import { clearBlockCache, findWeek, rebuildWeeks } from './plan';
import { blockSaves } from './save';

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

/** Carrega o documento do usuário. Devolve `true` se é conta nova (doc não existe). */
export async function loadUserData(uid: string, now: Date = new Date()): Promise<boolean> {
  let isNew = false;
  try {
    const raw = await users.load(uid);
    if (raw) {
      // Qualquer formato antigo: a migração vive em src/domain/persistence.ts.
      Object.assign(state, hydrateUserDoc(raw));
    } else {
      isNew = true;
      Object.assign(state, emptyPersistedState());
    }
  } catch (e) {
    console.error('Load failed:', e);
    showToast(strings.session.loadError);
  }
  rebuildWeeks(now);
  clearBlockCache();
  return isNew;
}

/** O que acontece depois de carregar: XP pendente, prompt de fim de dia, dia visível. */
export function initAfterLoad(now: Date = new Date()): void {
  applyPendingPetXP(now);
  setTimeout(() => scheduleEndOfDayPrompt(), 600);
  state.uiWeek = findWeek(now);
  const week = derived.weeks[state.uiWeek - 1];
  state.uiDay = week ? Math.min(6, Math.max(0, Math.floor((now.getTime() - week.start.getTime()) / 86400000))) : 0;
  notify();
}

function resetToLoggedOut(): void {
  state.user = null;
  state.checks = {};
  state.events = {};
  state.lunchOverrides = {};
  state.closedDays = {};
  state.config = { ...DEFAULT_CFG };
  state.pets = emptyPets();
  state.coinsSpent = 0;
}

let started = false;

/** Registra o listener de auth uma vez. Chamado no boot. */
export function startSession(): void {
  if (started) return;
  started = true;
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      blockSaves(false);
      state.user = user;
      markAuthReady();
      notify();
      const isNew = await loadUserData(user.uid);
      initAfterLoad();
      if (isNew) openOnboarding();
    } else {
      resetToLoggedOut();
      markAuthReady();
      notify();
    }
  });
}
