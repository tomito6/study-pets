// Onboarding: aparece na primeira vez (doc não existe) e ao cancelar a sessão.
// Escolhe o pet inicial (quando não há pet nenhum), o período de uso e se pula
// fins de semana; o resto é editável depois.

import { PETS, normalizePetName } from '../domain/pets';
import { dk } from '../domain/time';
import type { DateKey, PetId } from '../domain/types';
import { derived, notify, state } from '../store/store';
import { adoptStarter, needsStarter } from './pets';
import { clearBlockCache, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

export function openOnboarding(): void {
  derived.onboardingOpen = true;
  notify();
}

export function closeOnboarding(): void {
  derived.onboardingOpen = false;
  notify();
}

export interface StarterChoice {
  species: PetId;
  name: string;
}

export interface OnboardingInput {
  periodStart: DateKey;
  periodEnd: DateKey | null;
  skipWeekends: boolean;
  /** Obrigatório quando o usuário ainda não tem pet (ver `needsStarter`). */
  starter?: StarterChoice | null;
}

export type OnboardingRefusal = 'end-before-start' | 'no-starter' | 'unknown-species' | 'invalid-name';
export type OnboardingResult = { ok: true } | { ok: false; reason: OnboardingRefusal };

/**
 * `periodStart` sempre marca o começo (pra preservar progresso); `periodEnd` null
 * é o modo "sempre" (até o fim do ano). Valida tudo antes de mudar qualquer coisa.
 */
export function finishOnboarding(input: OnboardingInput, now: Date = new Date()): OnboardingResult {
  const periodStart = input.periodStart || dk(now);
  const periodEnd = input.periodEnd || null;
  if (periodEnd && periodEnd < periodStart) return { ok: false, reason: 'end-before-start' };

  const starter = needsStarter() ? input.starter ?? null : null;
  if (needsStarter()) {
    if (!starter) return { ok: false, reason: 'no-starter' };
    if (!PETS[starter.species]) return { ok: false, reason: 'unknown-species' };
    if (!normalizePetName(starter.name)) return { ok: false, reason: 'invalid-name' };
  }

  if (starter) adoptStarter(starter.species, starter.name, now);
  state.config = { ...state.config, periodStart, periodEnd, skipWeekends: input.skipWeekends };
  derived.onboardingOpen = false;
  rebuildWeeks(now);
  clearBlockCache();
  scheduleSave();
  notify();
  return { ok: true };
}
