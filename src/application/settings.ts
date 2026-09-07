// Casos de uso da tela de Configurações.

import { DEFAULT_CFG } from '../domain/config';
import { emptyPets } from '../domain/persistence';
import { hasMissingNumbers, normalizeConfig } from '../domain/settings';
import type { ConfigDraft } from '../domain/settings';
import { showToast } from '../shared/toast';
import { strings } from '../shared/strings';
import { notify, state } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { notifyPlanDelta } from './events';
import { openOnboarding } from './onboarding';
import { blocksForDay, clearBlockCache, currentDayKey, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

export type SaveSettingsResult = { ok: true } | { ok: false; reason: 'incomplete' };

/**
 * Salva a rotina. `periodStart` é fixo por sessão e `theme` é preferência (o card
 * Aparência aplica e salva na hora): os dois vêm do estado, nunca do formulário.
 * Campo numérico vazio não é salvo — antes isso gravava NaN.
 */
export function saveSettings(draft: ConfigDraft): SaveSettingsResult {
  const newCfg = normalizeConfig(draft, state.config.periodStart, state.config.theme);
  if (hasMissingNumbers(newCfg)) return { ok: false, reason: 'incomplete' };

  const visibleKey = currentDayKey();
  const before = blocksForDay(visibleKey);
  state.config = newCfg;
  rebuildWeeks();
  clearBlockCache();
  scheduleSave();
  notify();
  // Config mudou → o último bloco pode ter mudado → o prompt de fim de dia reagenda.
  rescheduleEndOfDayPrompt();
  notifyPlanDelta(visibleKey, before);
  return { ok: true };
}

/** Zera tudo e reabre o onboarding — a única forma de redefinir o `periodStart`. */
export function cancelSession(): void {
  state.checks = {};
  state.events = {};
  state.eventSeries = [];
  state.closedDays = {};
  state.config = { ...DEFAULT_CFG, theme: state.config.theme }; // a aparência é preferência: fica, como o tour visto
  state.pets = emptyPets();
  state.coinsSpent = 0;
  state.groups = {};
  state.windowOverrides = {};
  state.penalties = {};
  rebuildWeeks();
  clearBlockCache();
  scheduleSave();
  notify();
  openOnboarding();
  showToast(strings.settings.cancel.done);
}
