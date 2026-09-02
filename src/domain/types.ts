// Tipos do domínio do Study Pets.
// Estes tipos descrevem os dados como eles existem hoje no Firestore — inclusive
// os formatos antigos que ainda precisam carregar. Nada aqui conhece DOM, React,
// Firebase ou estado global.

/** Horário no formato "HH:MM" (relógio local do usuário). */
export type TimeString = string;

/** Dia no formato "YYYY-MM-DD" (data local, nunca UTC). */
export type DateKey = string;

export type PetId = string;

/** Janela de estudo: um intervalo do dia em que o app gera pomodoros. */
export interface StudyWindow {
  start: TimeString;
  end: TimeString;
}

/** Config do usuário, como salva em `users/{uid}.config`. */
export interface UserConfig {
  /** Fonte da verdade das janelas de estudo. */
  studyWindows: StudyWindow[];
  /** Derivados da primeira/última janela — mantidos só pra retrocompat. */
  start: TimeString;
  end: TimeString;
  lunch: TimeString;
  lunchDur: number;
  hasLunch: boolean;
  pomo: number;
  shortBreak: number;
  longBreak: number;
  periodStart: DateKey | null;
  periodEnd: DateKey | null;
  skipWeekends: boolean;
  /** Minutos de estudo/dia pra contar streak e bônus. */
  dailyStudyMin: number;
}

/**
 * O que `generateBlocks` realmente lê da config. `studyWindows` é opcional porque
 * configs antigas (pré-migração) só tinham `start`/`end`.
 */
export interface PlannerConfig {
  studyWindows?: StudyWindow[];
  start: TimeString;
  end: TimeString;
  lunch: TimeString;
  lunchDur: number;
  hasLunch?: boolean;
  pomo: number;
  shortBreak: number;
  longBreak: number;
}

export type BlockType = 'estudo' | 'pausa' | 'almoco' | 'event' | 'intervalo';

/** Um bloco do plano do dia. Gerado, nunca persistido. */
export interface StudyBlock {
  time: TimeString;
  endTime: TimeString;
  name: string;
  type: BlockType;
  xp: number;
  /** Índice da sessão colorida. Ausente em almoço/intervalo. */
  session?: number | undefined;
  /** Estudo menor que um pomo, encaixado num gap. */
  mini?: boolean;
  /** Presente quando o bloco veio de uma série recorrente. */
  _seriesId?: string;
}

/** Compromisso do usuário — avulso ou expandido de uma série. */
export interface StudyEvent {
  name: string;
  start: TimeString;
  end: TimeString;
  /** `false` = só bloqueia o tempo (tipo 'intervalo'). Ausente = true (retrocompat). */
  countsAsStudy?: boolean;
  _seriesId?: string;
}

export type RecurrenceFreq = 'weekly' | 'biweekly' | 'monthly';

/** Série recorrente de eventos, salva em `users/{uid}.eventSeries`. */
export interface RecurringEventSeries {
  id: string;
  name: string;
  start: TimeString;
  end: TimeString;
  /** Dias da semana no formato de `Date.getDay()` — 0 = domingo. */
  weekdays: number[];
  freq: RecurrenceFreq;
  anchor?: DateKey;
  until?: DateKey | null;
  exceptions?: DateKey[];
  countsAsStudy?: boolean;
}

/**
 * Registro de um bloco marcado. `true` é o formato antigo (sem pet, sem bônus) e
 * ainda existe em dados salvos — por isso continua no tipo.
 */
export type CheckRecord = { pet: PetId | null; bonus?: number } | true;

/** Checks por dia e por horário do bloco. */
export type ChecksByDate = Record<DateKey, Record<TimeString, CheckRecord>>;

export interface PetDefinition {
  id: PetId;
  name: string;
  emoji: string;
  price: number;
  frames: number;
  sprite: (frame: number) => string;
  skills?: Array<{ id: string; name: string; desc: string }>;
}
