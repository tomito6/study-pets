// Config padrão e migração de configs antigas.

import type { PlannerConfig, StudyWindow, UserConfig } from './types';

export const DEFAULT_CFG: UserConfig = {
  // start/end mantidos só pra retrocompat (migração). studyWindows é a fonte da verdade.
  start: '09:00',
  lunch: '13:00',
  lunchDur: 60,
  end: '18:00',
  studyWindows: [{ start: '09:00', end: '18:00' }],
  pomo: 25,
  shortBreak: 5,
  longBreak: 20,
  hasLunch: true,
  periodStart: null,
  periodEnd: null,
  skipWeekends: false,
  dailyStudyMin: 60,
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
  const out = { ...cfg } as T & { studyWindows?: StudyWindow[]; extraBreaks?: unknown };
  if (!Array.isArray(out.studyWindows) || out.studyWindows.length === 0) {
    out.studyWindows = [{ start: cfg.start || '09:00', end: cfg.end || '18:00' }];
  }
  if (out.extraBreaks) delete out.extraBreaks; // descontinuado
  return out as Migrated;
}
