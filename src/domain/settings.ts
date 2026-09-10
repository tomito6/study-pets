// Regras da tela de Configurações: normalizar o formulário em config, resumir
// o dia que essa config gera, e o "Encaixar estudo" — tudo puro.

import { DEFAULT_CFG } from './config';
import { normalizeHardcoreConfig } from './hardcore';
import { normalizeSiteBlockConfig, normalizeSites } from './siteBlock';
import { calcActualEnd, generateBlocks } from './planner';
import { blockMins, timeToMins } from './time';
import type { DateKey, PlannerConfig, SiteBlockMode, StudyEvent, StudyWindow, TimeString, UserConfig } from './types';

/** O formulário como o usuário digita — números em string pra permitir campo vazio. */
export interface ConfigDraft {
  studyWindows: StudyWindow[];
  pomo: string;
  shortBreak: string;
  longBreak: string;
  periodEnd: string;
  skipWeekends: boolean;
  dailyStudyMin: string;
  hardcore: boolean;
  /** Bloqueio de sites: independente do hardcore. */
  siteBlock: boolean;
  siteBlockMode: SiteBlockMode;
  /** A lista de sites como o usuário digita (uma por linha); vira domínios ao salvar. */
  siteBlockSites: string;
}

export function draftFromConfig(cfg: UserConfig): ConfigDraft {
  const hc = normalizeHardcoreConfig(cfg.hardcore);
  const sb = normalizeSiteBlockConfig(cfg.siteBlock);
  const windows =
    Array.isArray(cfg.studyWindows) && cfg.studyWindows.length > 0
      ? cfg.studyWindows.map((w) => ({ ...w }))
      : [{ start: cfg.start || '09:00', end: cfg.end || '18:00' }];
  return {
    studyWindows: windows,
    pomo: String(cfg.pomo),
    shortBreak: String(cfg.shortBreak),
    longBreak: String(cfg.longBreak),
    periodEnd: cfg.periodEnd || '',
    skipWeekends: cfg.skipWeekends === true,
    dailyStudyMin: String(cfg.dailyStudyMin || 60),
    hardcore: hc.enabled,
    siteBlock: sb.enabled,
    siteBlockMode: sb.mode,
    siteBlockSites: sb.sites.join('\n'),
  };
}

/** "↺ Padrão": tudo volta ao default — menos o período, que é fixo por sessão. */
export function defaultDraft(): ConfigDraft {
  return {
    ...draftFromConfig(DEFAULT_CFG),
    periodEnd: '',
  };
}

/** Minutos de uma janela; null se incompleta, <= 0 se o fim vem antes. */
export function windowMinutes(w: StudyWindow): number | null {
  if (!w.start || !w.end) return null;
  return timeToMins(w.end) - timeToMins(w.start);
}

export const isValidWindow = (w: StudyWindow): boolean => (windowMinutes(w) ?? 0) > 0;

/** "1h 30min", "2h", "45min" — como aparece ao lado de cada janela. */
export function formatWindowDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
}

/** "1h30", "2h", "45min", "0min" — como aparece nos tiles do resumo. */
export function formatCompact(mins: number): string {
  if (mins <= 0) return '0min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

/** Sugestão pra janela nova: começa onde a última termina, 3h de duração (até 23:59). */
export function nextWindowAfter(windows: StudyWindow[]): StudyWindow {
  const last = windows[windows.length - 1];
  if (!last || !last.end) return { start: '09:00', end: '12:00' };
  const endMins = Math.min(timeToMins(last.end) + 180, 23 * 60 + 59);
  return {
    start: last.end,
    end: `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`,
  };
}

export function sanitizeDailyStudyMin(n: number): number {
  return Math.min(240, Math.max(15, Number.isFinite(n) ? n : 60));
}

/** `start`/`end` derivados das janelas válidas — mantidos no schema só por retrocompat. */
export function deriveStartEnd(windows: StudyWindow[]): { start: TimeString; end: TimeString } {
  const sorted = windows.filter(isValidWindow).sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  return {
    start: sorted[0]?.start ?? '09:00',
    end: sorted[sorted.length - 1]?.end ?? '18:00',
  };
}

/** O formulário vira config. Campo numérico vazio vira NaN — quem salva decide o que fazer. */
export function normalizeConfig(draft: ConfigDraft, periodStart: DateKey | null): UserConfig {
  const studyWindows = draft.studyWindows.filter(isValidWindow);
  return {
    ...deriveStartEnd(studyWindows),
    studyWindows,
    pomo: parseInt(draft.pomo, 10),
    shortBreak: parseInt(draft.shortBreak, 10),
    longBreak: parseInt(draft.longBreak, 10),
    periodStart,
    periodEnd: draft.periodEnd || null,
    skipWeekends: draft.skipWeekends,
    dailyStudyMin: sanitizeDailyStudyMin(parseInt(draft.dailyStudyMin, 10)),
    hardcore: { enabled: draft.hardcore === true },
    siteBlock: {
      enabled: draft.siteBlock === true,
      mode: draft.siteBlockMode === 'whitelist' ? 'whitelist' : 'blacklist',
      sites: normalizeSites(draft.siteBlockSites || ''),
    },
  };
}

export const hasMissingNumbers = (cfg: PlannerConfig): boolean =>
  [cfg.pomo, cfg.shortBreak, cfg.longBreak].some((n) => Number.isNaN(n));

export type ConfigSummary =
  | { kind: 'warn'; reason: 'incomplete' | 'no-windows' | 'no-blocks' }
  | {
      kind: 'ok';
      pomos: number;
      studyMins: number;
      pauseMins: number;
      totalXP: number;
      windowsCount: number;
      /** Onde o último estudo termina, e quanto isso difere do fim da última janela. */
      actualEnd: TimeString;
      end: TimeString;
      diffMins: number;
      /**
       * A sobra no fim é só a pausa que o dia não emite? O último bloco do dia é
       * sempre estudo, então a pausa final some — e o tempo dela aparece como
       * sobra. Não é desperdício: você ia estar descansando de qualquer jeito.
       * Sem isso o app pintava de laranja o próprio padrão (09:00–18:00 fecha 4
       * ciclos redondos e "sobra" a pausa longa de 20 min).
       */
      restGap: boolean;
    };

/** "Como fica o dia": um dia só com as janelas e o ritmo (sem eventos — refeição inclusive). */
export function summarizeConfig(cfg: PlannerConfig): ConfigSummary {
  if (hasMissingNumbers(cfg)) return { kind: 'warn', reason: 'incomplete' };
  const validWindows = (cfg.studyWindows || []).filter(isValidWindow);
  if (validWindows.length === 0) return { kind: 'warn', reason: 'no-windows' };
  const blocks = generateBlocks(cfg, []);
  if (blocks.length === 0) return { kind: 'warn', reason: 'no-blocks' };
  const dur = blockMins;
  const study = blocks.filter((b) => b.type === 'estudo');
  const pause = blocks.filter((b) => b.type === 'pausa');
  const actualEnd = calcActualEnd(cfg);
  const diffMins = timeToMins(actualEnd) - timeToMins(cfg.end);
  const sobra = -diffMins;
  return {
    kind: 'ok',
    restGap: sobra > 0 && sobra <= Math.max(cfg.shortBreak, cfg.longBreak),
    pomos: study.length,
    studyMins: study.reduce((s, b) => s + dur(b), 0),
    pauseMins: pause.reduce((s, b) => s + dur(b), 0),
    totalXP: blocks.reduce((s, b) => s + (b.xp || 0), 0),
    windowsCount: validWindows.length,
    actualEnd,
    end: cfg.end,
    diffMins,
  };
}

// ---------------------------------------------------------------- encaixar estudo

export interface FitIdeal {
  pomo: number;
  short: number;
  long: number;
  /** ±minutos de flexibilidade em cada parâmetro. */
  flex: number;
}

export interface FitSuggestion {
  pomo: number;
  short: number;
  long: number;
  studyTotal: number;
  /** Minutos desde a meia-noite do fim do último bloco. */
  lastEnd: number;
  studyCount: number;
  score: number;
}

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

/**
 * Varia pomo (passo 5), pausa curta (passo 1) e longa (passo 5) dentro da
 * flexibilidade, simula o dia com os eventos, e ranqueia por estudo total menos
 * uma penalidade pelo desvio do ideal (pomo pesa 1, curta 0.5, longa 0.3). Top 3.
 */
export function fitStudySuggestions(cfgBase: PlannerConfig, events: StudyEvent[], ideal: FitIdeal): FitSuggestion[] {
  const pomos = range(Math.max(15, ideal.pomo - ideal.flex), Math.min(90, ideal.pomo + ideal.flex), 5);
  const shorts = range(Math.max(3, ideal.short - ideal.flex), Math.min(20, ideal.short + ideal.flex), 1);
  const longs = range(Math.max(10, ideal.long - ideal.flex), Math.min(60, ideal.long + ideal.flex), 5);

  const candidates: FitSuggestion[] = [];
  for (const pomo of pomos) {
    for (const short of shorts) {
      for (const long of longs) {
        const blocks = generateBlocks({ ...cfgBase, pomo, shortBreak: short, longBreak: long }, events);
        const study = blocks.filter((b) => b.type === 'estudo');
        const studyTotal = study.reduce((s, b) => s + blockMins(b), 0);
        const lastEnd = blocks.length > 0 ? timeToMins(blocks[blocks.length - 1]!.endTime) : 0;
        const penalty = Math.abs(pomo - ideal.pomo) + Math.abs(short - ideal.short) * 0.5 + Math.abs(long - ideal.long) * 0.3;
        candidates.push({ pomo, short, long, studyTotal, lastEnd, studyCount: study.length, score: studyTotal - penalty * 0.5 });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3);
}
