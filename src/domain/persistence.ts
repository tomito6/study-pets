// Formato do documento salvo em `users/{uid}` e a ponte entre ele e o estado do app.
//
// Duas funções puras:
// - `hydrateUserDoc`: documento cru (possivelmente antigo, com campos faltando) → estado.
//   É a função explícita de migração: tudo que o Firestore já tem precisa passar por aqui.
// - `serializeState`: estado → documento pra salvar.
//
// `SCHEMA_VERSION` é gravado no doc a partir de agora. Docs sem o campo são v0 — o
// formato que existia antes da migração — e são lidos normalmente.

import { DEFAULT_CFG, migrateConfig } from './config';
import { DEFAULT_GROUP_NAME } from './groups';
import type {
  ChecksByDate,
  DateKey,
  GroupsByDate,
  PetId,
  RecurringEventSeries,
  StudyEvent,
  TimeString,
  UserConfig,
} from './types';

export const SCHEMA_VERSION = 1;

export interface PetsState {
  owned: PetId[];
  active: PetId | null;
  /** XP acumulado por pet, creditado quando o dia do check fecha. */
  xp: Record<PetId, number>;
  /** Último dia já processado. `null` = ainda não inicializado. */
  xpProcessedUntil: DateKey | null;
}

export interface SkillsState {
  /** Skill ativa da coruja — só uma por vez. */
  owl: string | null;
  /** ms da última troca; valida a elegibilidade do bônus no check. */
  activatedAt: number;
}

export interface LunchOverride {
  lunch?: TimeString;
  lunchDur?: number;
  hasLunch?: boolean;
}

/** A parte do `state` que vai pro Firestore. Nada de UI aqui. */
export interface PersistedState {
  checks: ChecksByDate;
  events: Record<DateKey, StudyEvent[]>;
  eventSeries: RecurringEventSeries[];
  lunchOverrides: Record<DateKey, LunchOverride>;
  closedDays: Record<DateKey, boolean>;
  config: UserConfig;
  pets: PetsState;
  skills: SkillsState;
  coinsSpent: number;
  /** Grupos de estudo por dia (nome + objetivo num trecho). */
  groups: GroupsByDate;
}

/** O documento como é escrito. */
export interface UserDoc extends PersistedState {
  schemaVersion: number;
}

/** Estado de uma conta nova (documento inexistente). */
export function emptyPersistedState(): PersistedState {
  return {
    checks: {},
    events: {},
    eventSeries: [],
    lunchOverrides: {},
    closedDays: {},
    config: { ...DEFAULT_CFG },
    pets: { owned: [], active: null, xp: {}, xpProcessedUntil: null },
    skills: { owl: null, activatedAt: 0 },
    coinsSpent: 0,
    groups: {},
  };
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);

/** Grupos: só entradas com id/start/end de verdade; nome e objetivo ganham default. */
function hydrateGroups(raw: unknown): GroupsByDate {
  if (!isObj(raw)) return {};
  const out: GroupsByDate = {};
  for (const [day, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const groups = list.filter(isObj).flatMap((g) =>
      typeof g.id === 'string' && typeof g.start === 'string' && typeof g.end === 'string'
        ? [{
            id: g.id,
            start: g.start,
            end: g.end,
            name: typeof g.name === 'string' && g.name.trim() ? g.name : DEFAULT_GROUP_NAME,
            goal: typeof g.goal === 'string' ? g.goal : '',
          }]
        : [],
    );
    if (groups.length > 0) out[day] = groups;
  }
  return out;
}

/**
 * Lê um documento cru com tolerância a tudo que já existiu no Firestore: campos
 * ausentes, config sem `studyWindows`, checks como `true`, pets sem `xp`, etc.
 * Comportamento idêntico ao `loadData` original — só que testável.
 */
export function hydrateUserDoc(raw: unknown): PersistedState {
  const d: Raw = isObj(raw) ? raw : {};
  const pets = isObj(d.pets) ? d.pets : {};
  const skills = isObj(d.skills) ? d.skills : null;

  return {
    checks: (d.checks as ChecksByDate) || {},
    events: (d.events as Record<DateKey, StudyEvent[]>) || {},
    eventSeries: Array.isArray(d.eventSeries) ? (d.eventSeries as RecurringEventSeries[]) : [],
    lunchOverrides: (d.lunchOverrides as Record<DateKey, LunchOverride>) || {},
    // Migra ANTES de aplicar os defaults: se o doc antigo só tem start/end, a janela
    // nasce deles. (O código original fazia ao contrário e a janela padrão 09–18
    // engolia os horários reais do usuário — corrigido na Fase 4.)
    config: { ...DEFAULT_CFG, ...migrateConfig(isObj(d.config) ? d.config : {}) } as UserConfig,
    pets: {
      owned: Array.isArray(pets.owned) ? (pets.owned as PetId[]) : [],
      active: (pets.active as PetId) || null,
      xp: isObj(pets.xp) ? (pets.xp as Record<PetId, number>) : {},
      xpProcessedUntil: typeof pets.xpProcessedUntil === 'string' ? pets.xpProcessedUntil : null,
    },
    closedDays: isObj(d.closedDays) ? (d.closedDays as Record<DateKey, boolean>) : {},
    skills: skills
      ? { owl: (skills.owl as string) || null, activatedAt: (skills.activatedAt as number) || 0 }
      : { owl: null, activatedAt: 0 },
    coinsSpent: typeof d.coinsSpent === 'number' ? d.coinsSpent : 0,
    groups: hydrateGroups(d.groups),
  };
}

/** Monta o documento a salvar. Espelha o `setDoc` original, mais o `schemaVersion`. */
export function serializeState(s: PersistedState): UserDoc {
  return {
    schemaVersion: SCHEMA_VERSION,
    checks: s.checks,
    events: s.events,
    eventSeries: s.eventSeries || [],
    lunchOverrides: s.lunchOverrides,
    closedDays: s.closedDays || {},
    config: s.config,
    pets: s.pets,
    skills: s.skills || { owl: null, activatedAt: 0 },
    coinsSpent: s.coinsSpent || 0,
    groups: s.groups || {},
  };
}
