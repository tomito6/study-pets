// Casos de uso da tela de Configurações.

import { DEFAULT_CFG } from '../domain/config';
import { hasMissingNumbers, normalizeConfig } from '../domain/settings';
import type { ConfigDraft } from '../domain/settings';
import { legacy } from '../legacy/bridge';
import { showToast } from '../shared/toast';
import { strings } from '../shared/strings';
import { notify, state } from '../store/store';
import { notifyPlanDelta } from './events';
import { blocksForDay, clearBlockCache, currentDayKey, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

export type SaveSettingsResult = { ok: true } | { ok: false; reason: 'incomplete' };

/**
 * Salva a rotina. `periodStart` é fixo por sessão: vem do estado, nunca do
 * formulário. Campo numérico vazio não é salvo — antes isso gravava NaN.
 */
export function saveSettings(draft: ConfigDraft): SaveSettingsResult {
  const newCfg = normalizeConfig(draft, state.config.periodStart);
  if (hasMissingNumbers(newCfg)) return { ok: false, reason: 'incomplete' };

  const visibleKey = currentDayKey();
  const before = blocksForDay(visibleKey);
  state.config = newCfg;
  rebuildWeeks();
  clearBlockCache();
  scheduleSave();
  notify();
  // Config mudou → o último bloco pode ter mudado → o prompt de fim de dia reagenda.
  legacy.rescheduleEndOfDayPrompt();
  notifyPlanDelta(visibleKey, before);
  return { ok: true };
}

/** Zera tudo e reabre o onboarding — a única forma de redefinir o `periodStart`. */
export function cancelSession(): void {
  state.checks = {};
  state.events = {};
  state.eventSeries = [];
  state.lunchOverrides = {};
  state.closedDays = {};
  state.config = { ...DEFAULT_CFG };
  state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
  state.skills = { owl: null, activatedAt: 0 };
  state.coinsSpent = 0;
  rebuildWeeks();
  clearBlockCache();
  scheduleSave();
  notify();
  legacy.openOnboarding();
  showToast(strings.settings.cancel.done);
}
