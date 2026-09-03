// Onboarding: aparece na primeira vez (doc não existe) e ao cancelar a sessão.
// Define o período de uso e se pula fins de semana; o resto é editável depois.

import { dk } from '../domain/time';
import type { DateKey } from '../domain/types';
import { derived, notify, state } from '../store/store';
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

export interface OnboardingInput {
  periodStart: DateKey;
  periodEnd: DateKey | null;
  skipWeekends: boolean;
}

export type OnboardingResult = { ok: true } | { ok: false; reason: 'end-before-start' };

/**
 * `periodStart` sempre marca o começo (pra preservar progresso); `periodEnd` null
 * é o modo "sempre" (até o fim do ano).
 */
export function finishOnboarding(input: OnboardingInput, now: Date = new Date()): OnboardingResult {
  const periodStart = input.periodStart || dk(now);
  const periodEnd = input.periodEnd || null;
  if (periodEnd && periodEnd < periodStart) return { ok: false, reason: 'end-before-start' };
  state.config = { ...state.config, periodStart, periodEnd, skipWeekends: input.skipWeekends };
  derived.onboardingOpen = false;
  rebuildWeeks(now);
  clearBlockCache();
  scheduleSave();
  notify();
  return { ok: true };
}
