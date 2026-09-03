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

/** Forma de um pet: o que aparece na tela (sprite) e quais skills ela pode ter. */
export type FormId = string;
export type SkillId = string;
/** Id de um pet adotado (instância). Legado: igual ao id da espécie ("cat"). */
export type PetInstanceId = string;

export interface PetForm {
  id: FormId;
  /** Nome da forma em pt-BR ("Cachorro", "Lobo"). */
  name: string;
  /** Fallback visual quando o sprite não carrega. */
  emoji: string;
  frames: number;
  sprite: (frame: number) => string;
  /** Skills que um pet nesta forma pode ativar. */
  skills: SkillId[];
}

export interface EvolutionStage {
  /** Nível do pet em que este estágio fica disponível. */
  level: number;
  form: FormId;
}

/** Um caminho de evolução: a escolha que o usuário faz, e os estágios que vêm dela. */
export interface EvolutionPath {
  id: string;
  name: string;
  desc: string;
  /** Em ordem crescente de nível. */
  stages: EvolutionStage[];
}

/** Uma espécie: o que a loja vende. */
export interface PetSpecies {
  id: PetId;
  price: number;
  /** Forma com que o pet nasce. */
  form: FormId;
  /** Vazio = essa espécie não evolui (ainda). */
  paths: EvolutionPath[];
  /** Sugestões de nome, sorteadas ao adotar. */
  names: string[];
}

/**
 * Um pet adotado. É a instância que tem nome, XP e caminho — a espécie é só o
 * catálogo. Dá pra ter dois cachorros: cada um é uma instância.
 */
export interface PetInstance {
  id: PetInstanceId;
  species: PetId;
  name: string;
  /** XP acumulado, creditado quando o dia do check fecha. */
  xp: number;
  /** Caminho de evolução escolhido; `null` = ainda não escolheu. */
  path: string | null;
  /** Quantos estágios do caminho já foram aplicados (0 = forma base). */
  stage: number;
  /** Skill ativa — uma por pet. */
  skill: SkillId | null;
  /** ms da última troca de skill; o bônus só vale pra blocos que começam depois. */
  skillActivatedAt: number;
  /** ms da adoção (0 em pets migrados do formato antigo). */
  adoptedAt: number;
}
