// Casos de uso da tela de Configurações.

import { takeSafetyNet } from './backup';
import { DEFAULT_CFG } from '../domain/config';
import { recordConfigChange } from '../domain/configHistory';
import { emptyPets } from '../domain/persistence';
import { hasMissingNumbers, normalizeConfig } from '../domain/settings';
import type { ConfigDraft } from '../domain/settings';
import { dk } from '../domain/time';
import { showToast } from '../shared/toast';
import { strings } from '../shared/strings';
import { derived, notify, state } from '../store/store';
import type { SettingsRequest } from '../store/store';
import { rescheduleEndOfDayPrompt } from './dayEnd';
import { notifyPlanDelta } from './events';
import { openOnboarding } from './onboarding';
import { blocksForDay, clearBlockCache, currentDayKey, dayHasFacts, rebuildWeeks } from './plan';
import { scheduleSave } from './save';

/** O que a mudança faz com o plano: nada (só campos fora do gerador), vale de hoje, ou só de amanhã (hoje já tem fato). */
export type PlanChange = 'unchanged' | 'from-today' | 'from-tomorrow';
export type SaveSettingsResult = { ok: true; plan: PlanChange } | { ok: false; reason: 'incomplete' };

/**
 * Salva a rotina. `periodStart` é fixo por sessão: vem do estado, nunca do
 * formulário. Campo numérico vazio não é salvo — antes isso gravava NaN.
 *
 * **Ritmo e janelas novos valem de hoje em diante, nunca pra trás** (2026-09-15): a config
 * que deixa de valer vai pra `configHistory` com o último dia em que valeu, e cada dia é
 * gerado pela versão que valia nele (ver domain/configHistory.ts). Hoje só entra na
 * mudança se ainda não tem fato nenhum (`dayHasFacts`); senão fica como está e a
 * mudança vale de amanhã — e a tela avisa.
 */
export function saveSettings(draft: ConfigDraft, now: Date = new Date()): SaveSettingsResult {
  const newCfg = normalizeConfig(draft, state.config.periodStart);
  if (hasMissingNumbers(newCfg)) return { ok: false, reason: 'incomplete' };

  const visibleKey = currentDayKey();
  const before = blocksForDay(visibleKey);
  const today = dk(now);
  const change = recordConfigChange(state.configHistory, state.config, newCfg, {
    today,
    todayHasFacts: dayHasFacts(today),
    periodStart: state.config.periodStart,
  });
  if (change) state.configHistory = change.history;
  state.config = newCfg;
  rebuildWeeks();
  clearBlockCache();
  scheduleSave();
  notify();
  // Config mudou → o último bloco pode ter mudado → o prompt de fim de dia reagenda.
  rescheduleEndOfDayPrompt();
  notifyPlanDelta(visibleKey, before);
  return { ok: true, plan: !change ? 'unchanged' : change.appliesFrom === today ? 'from-today' : 'from-tomorrow' };
}

/** Zera tudo e reabre o onboarding — a única forma de redefinir o `periodStart`. */
export function cancelSession(now: Date = new Date()): void {
  // A foto vem primeiro, e de tudo — inclusive do que este caso de uso preserva. Se um dia
  // alguém acrescentar um campo aqui e esquecer de zerá-lo, a rede continua correta.
  const rede = takeSafetyNet(now);
  state.checks = {};
  state.events = {};
  state.eventSeries = [];
  state.closedDays = {};
  state.config = { ...DEFAULT_CFG };
  state.configHistory = []; // as versões antigas falam de dias que acabaram de deixar de existir
  state.pets = emptyPets();
  state.coinsSpent = 0;
  state.groups = {};
  state.notes = {};
  state.windowOverrides = {};
  state.dayModes = {};
  state.dayModeDefault = null;
  state.penalties = {};
  state.pauses = {};
  // O sininho zera junto: cada linha fala de um nível, um pet ou um dia que
  // acabaram de deixar de existir — mantê-las seria guardar um diário de mentira.
  state.notifications = [];
  // `avatar` e `tutorialSeen` ficam: o personagem é identidade e quem cancelou já conhece o app.
  // E a marcha a ré fica guardada por 30 dias: apagar o histórico deixou de ser definitivo.
  state.safetyNet = rede;
  rebuildWeeks();
  clearBlockCache();
  scheduleSave();
  notify();
  openOnboarding();
  showToast(strings.settings.cancel.done);
}

/**
 * A barra do laptop e o "Novo evento" pedem pra abrir as Configurações; a página
 * (dona do estado "aberta") atende e limpa. `focus` diz até que seção rolar.
 */
export function requestSettings(focus: SettingsRequest['focus'] = null): void {
  derived.settingsRequest = { focus };
  notify();
}

export function clearSettingsRequest(): void {
  if (!derived.settingsRequest) return;
  derived.settingsRequest = null;
  notify();
}
