// Config padrão e migração de configs antigas.

import { DEFAULT_THEME } from './theme';
import type { PlannerConfig, StudyWindow, UserConfig } from './types';

export const DEFAULT_CFG: UserConfig = {
  // start/end mantidos só pra retrocompat (migração). studyWindows é a fonte da verdade.
  start: '09:00',
  end: '18:00',
  studyWindows: [{ start: '09:00', end: '18:00' }],
  pomo: 25,
  shortBreak: 5,
  longBreak: 20,
  periodStart: null,
  periodEnd: null,
  skipWeekends: false,
  dailyStudyMin: 60,
  hardcore: { enabled: false, mode: 'blacklist', sites: [] },
  theme: DEFAULT_THEME,
};

/**
 * Migra cfg antigo (sem `studyWindows`) pro formato novo. Idempotente.
 * Retorna um objeto novo — não mexe no que recebeu.
 */
export function migrateConfig<T extends Partial<PlannerConfig>>(
  cfg: T,
): T & { studyWindows: StudyWindow[] } {
  type Migrated = T & { studyWindows: StudyWindow[] };
  if (!cfg) return cfg as Migrated;
  const out = { ...cfg } as T & { studyWindows?: StudyWindow[] } & Record<string, unknown>;
  if (!Array.isArray(out.studyWindows) || out.studyWindows.length === 0) {
    out.studyWindows = [{ start: cfg.start || '09:00', end: cfg.end || '18:00' }];
  }
  // Descontinuados: `extraBreaks` (viraram eventos sem XP) e o almoço na config (virou uma
  // série de evento em 2026-09-06 — quem converte o valor antigo é `hydrateUserDoc`).
  for (const k of ['extraBreaks', 'lunch', 'lunchDur', 'hasLunch']) if (k in out) delete out[k];
  return out as Migrated;
}
