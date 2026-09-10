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
  pomo: number;
  shortBreak: number;
  longBreak: number;
  periodStart: DateKey | null;
  periodEnd: DateKey | null;
  skipWeekends: boolean;
  /** Minutos de estudo/dia pra contar streak e bônus. */
  dailyStudyMin: number;
  /** Modo hardcore: sair de um estudo no foco custa XP (ver domain/hardcore.ts). */
  hardcore: HardcoreConfig;
  /** Bloqueio de sites durante o estudo — independente do hardcore (ver domain/siteBlock.ts). */
  siteBlock: SiteBlockConfig;
}

/**
 * Modo hardcore: só a penalidade. A lista de sites saiu daqui em 2026-09-08 e
 * virou `siteBlock` — bloquear site funciona com ou sem hardcore.
 */
export interface HardcoreConfig {
  enabled: boolean;
}

export type SiteBlockMode = 'blacklist' | 'whitelist';

/** O que o usuário escolheu em Configurações → Geral → Bloqueio de sites. */
export interface SiteBlockConfig {
  enabled: boolean;
  /** `blacklist` = bloquear os sites da lista durante o estudo; `whitelist` = permitir só eles. */
  mode: SiteBlockMode;
  /** Domínios normalizados ("youtube.com"). Só a extensão do navegador aplica. */
  sites: string[];
}

/**
 * O que `generateBlocks` realmente lê da config. `studyWindows` é opcional porque
 * configs antigas (pré-migração) só tinham `start`/`end`.
 */
export interface PlannerConfig {
  studyWindows?: StudyWindow[];
  start: TimeString;
  end: TimeString;
  pomo: number;
  shortBreak: number;
  longBreak: number;
}

/** `almoco` deixou de existir em 2026-09-06: a refeição é um evento sem XP, tipo `intervalo`. */
export type BlockType = 'estudo' | 'pausa' | 'event' | 'intervalo';

/** Um bloco do plano do dia. Gerado, nunca persistido. */
export interface StudyBlock {
  time: TimeString;
  endTime: TimeString;
  name: string;
  type: BlockType;
  xp: number;
  /** Índice da sessão colorida. Ausente em intervalo. */
  cycle?: number | undefined;
  /** Estudo menor que um pomo, encaixado num gap. */
  mini?: boolean;
  /**
   * Minutos em que o timer ficou pausado dentro deste bloco (ver `PauseRecord`). O
   * `endTime` já inclui esse tempo: um pomo de 25 min com 7 de pausa vai de 09:00
   * a 09:32. A duração que vale (XP, moedas, meta) é `blockMins`, que desconta isto.
   */
  paused?: number;
  /** Presente quando o bloco veio de uma série recorrente. */
  _seriesId?: string;
}

/**
 * Uma pausa do timer que acabou, salva em `users/{uid}.pauses[dia]`: o minuto do
 * relógio em que começou e quanto durou. O gerador estica o bloco que contém `at`
 * e empurra o resto do dia; eventos e o fim da janela continuam fixos. Só `at` e
 * `mins`: o bloco que a contém sai do próprio plano, sem chave que envelheça.
 */
export interface PauseRecord {
  at: TimeString;
  /** Inteiro, mínimo 1 (segundos arredondados pra cima — quem pausou nunca perde tempo). */
  mins: number;
}

/** Pausas por dia, em ordem de `at`. */
export type PausesByDate = Record<DateKey, PauseRecord[]>;

/** Compromisso do usuário — avulso ou expandido de uma série. */
export interface StudyEvent {
  name: string;
  start: TimeString;
  end: TimeString;
  /** `false` = só bloqueia o tempo (tipo 'intervalo'). Ausente = true (retrocompat). */
  countsAsStudy?: boolean;
  /**
   * De onde veio, quando não foi digitado aqui: `ics:<UID>` pra evento importado
   * de calendário. É o que deixa reimportar o mesmo arquivo substituir em vez de
   * duplicar. Ausente = é do usuário, e nenhuma importação encosta nele.
   */
  externalId?: string;
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
  /** Origem externa — ver `StudyEvent.externalId`. */
  externalId?: string;
}

/**
 * Registro de um bloco marcado. `true` é o formato antigo (sem pet, sem bônus) e
 * ainda existe em dados salvos — por isso continua no tipo.
 */
export type CheckRecord = { pet: PetId | null; bonus?: number } | true;

/** Checks por dia e por horário do bloco. */
export type ChecksByDate = Record<DateKey, Record<TimeString, CheckRecord>>;

/**
 * Grupo de estudo: nome e objetivo sobre um trecho do dia, salvo em `users/{uid}.groups`.
 * É anotação por horário — nunca entra no gerador de blocos (ver `domain/groups.ts`).
 */
export interface StudyGroup {
  id: string;
  start: TimeString;
  end: TimeString;
  name: string;
  /** Texto livre; vazio = sem objetivo. */
  goal: string;
}

/** Grupos por dia. */
export type GroupsByDate = Record<DateKey, StudyGroup[]>;

/**
 * Uma desistência no modo hardcore, salva em `users/{uid}.penalties`. É o único
 * XP negativo do app: entra no total na hora (não espera o dia fechar). `xp` e
 * `petXp` são o que de fato saiu — limitados ao saldo que havia.
 */
export interface PenaltyRecord {
  time: TimeString;
  endTime: TimeString;
  /** Nome do bloco sem emoji ("Estudo 3"). */
  name: string;
  xp: number;
  /** Pet equipado na hora (instância), ou null. */
  pet: PetInstanceId | null;
  petXp: number;
  /** ms de quando aconteceu. */
  at: number;
  /** `quit` = "Desistir" no foco; `abandon` = o app foi fechado e o bloco acabou sem ele. */
  reason: 'quit' | 'abandon';
}

/** Desistências por dia. Um bloco com registro aqui está abandonado: sem check, e não pode ser marcado. */
export type PenaltiesByDate = Record<DateKey, PenaltyRecord[]>;

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
