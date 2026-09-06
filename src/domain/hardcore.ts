// Modo hardcore: sair de um estudo no modo foco custa XP — pro usuário e pro pet
// equipado. Dificuldade escolhida, nunca padrão: liga em Configurações, e cada
// sequência começa com o custo escrito na cara. Puro.
//
// A conta: desistir de um estudo custa 2× o XP do bloco, na hora (não espera o
// dia fechar), pra quem tem XP a perder — nunca abaixo de zero. Nível pode cair,
// do usuário e do pet; a forma do pet fica (evolução é definitiva). Pausa é
// saída livre, e antes do bloco começar (em espera) também. O bloco abandonado
// perde o check e não pode ser marcado depois — senão desistir seria de graça.

import { petLevelFromXP } from './pets';
import { getLevelIdx } from './progression';
import { dk } from './time';
import { timerProgress } from './timer';
import type { DateKey, HardcoreConfig, HardcoreMode, PenaltiesByDate, PenaltyRecord, PetInstanceId, StudyBlock, TimeString } from './types';

/** Quantas vezes o XP do bloco se perde ao desistir. */
export const HARDCORE_MULTIPLIER = 2;

export const defaultHardcore = (): HardcoreConfig => ({ enabled: false, mode: 'blacklist', sites: [] });

// ---------------------------------------------------------------- sites

/**
 * "https://www.YouTube.com/watch?v=x" → "youtube.com". Só o domínio: sem esquema,
 * sem `www.`, sem caminho/porta. `null` se não parece um domínio.
 */
export function normalizeSite(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split(/[/?#:]/)[0] ?? '';
  s = s.replace(/^\.+|\.+$/g, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

/** A lista como o usuário digita (uma por linha, vírgula ou espaço) ou já em lista → domínios únicos, na ordem. */
export function normalizeSites(input: string | readonly string[]): string[] {
  const parts = typeof input === 'string' ? input.split(/[\n,\s]+/) : input;
  const out: string[] = [];
  for (const p of parts) {
    if (typeof p !== 'string') continue;
    const site = normalizeSite(p);
    if (site && !out.includes(site)) out.push(site);
  }
  return out;
}

const isMode = (v: unknown): v is HardcoreMode => v === 'blacklist' || v === 'whitelist';

/** `config.hardcore` em qualquer formato (ausente, parcial, lixo) → config válida. */
export function normalizeHardcoreConfig(raw: unknown): HardcoreConfig {
  const d = defaultHardcore();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const r = raw as { enabled?: unknown; mode?: unknown; sites?: unknown };
  return {
    enabled: r.enabled === true,
    mode: isMode(r.mode) ? r.mode : d.mode,
    sites: Array.isArray(r.sites) ? normalizeSites(r.sites as string[]) : [],
  };
}

// ---------------------------------------------------------------- sessão

/**
 * A sequência hardcore em andamento: o bloco que está rodando. Fica no
 * dispositivo (não no doc): recarregar a página volta pro foco; reabrir depois
 * que o bloco acabou é abandono.
 */
export interface HardcoreSession {
  dateKey: DateKey;
  time: TimeString;
  endTime: TimeString;
  type: 'estudo' | 'pausa';
  name: string;
  xp: number;
  session: number | undefined;
  /** Pet equipado quando a sessão passou a valer — é ele que perde XP no abandono. */
  pet: PetInstanceId | null;
  startedAt: number;
}

/** A sessão como vive em `derived.hardcore` enquanto o timer roda. */
export interface HardcoreRuntime extends HardcoreSession {
  /** O bloco já começou a rodar: sessão persistida, guard armado, extensão avisada. */
  armed: boolean;
}

export function sessionFor(block: StudyBlock, dateKey: DateKey, pet: PetInstanceId | null, now: Date): HardcoreSession {
  return {
    dateKey,
    time: block.time,
    endTime: block.endTime,
    type: block.type === 'pausa' ? 'pausa' : 'estudo',
    name: block.name,
    xp: block.xp || 0,
    session: block.session,
    pet,
    startedAt: now.getTime(),
  };
}

/** O bloco de volta a partir da sessão (quando o plano do dia não tem mais o original). */
export function blockFromSession(s: HardcoreSession): StudyBlock {
  return { time: s.time, endTime: s.endTime, name: s.name, type: s.type, xp: s.xp, session: s.session };
}

const isTime = (v: unknown): v is TimeString => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

/** A sessão guardada no dispositivo, validada. `null` se não tem ou está corrompida. */
export function parseHardcoreSession(raw: unknown): HardcoreSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.dateKey)) return null;
  if (!isTime(r.time) || !isTime(r.endTime)) return null;
  if (r.type !== 'estudo' && r.type !== 'pausa') return null;
  return {
    dateKey: r.dateKey,
    time: r.time,
    endTime: r.endTime,
    type: r.type,
    name: typeof r.name === 'string' ? r.name : '',
    xp: typeof r.xp === 'number' && Number.isFinite(r.xp) ? r.xp : 0,
    session: typeof r.session === 'number' ? r.session : undefined,
    pet: typeof r.pet === 'string' && r.pet ? r.pet : null,
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : 0,
  };
}

export type SessionResolution = 'resume' | 'abandon' | 'expired-free';

/**
 * O que fazer com a sessão que ficou no dispositivo: o bloco ainda não acabou →
 * volta pro foco (recarregar não é sair); acabou sem o app aberto → abandono, se
 * era estudo; pausa que acabou é só esquecer.
 */
export function resolveSession(session: HardcoreSession, now: Date): SessionResolution {
  const gone = session.dateKey !== dk(now) || timerProgress(session, now).done;
  if (!gone) return 'resume';
  return session.type === 'estudo' ? 'abandon' : 'expired-free';
}

// ---------------------------------------------------------------- a conta

/** O que desistir de um bloco custa antes de olhar o saldo: 2× o XP de um estudo; pausa é livre. */
export const penaltyFor = (block: Pick<StudyBlock, 'type' | 'xp'>): number =>
  block.type === 'estudo' ? (block.xp || 0) * HARDCORE_MULTIPLIER : 0;

export interface QuitCost {
  /** Sem custo: pausa, ou bloco que ainda nem começou. */
  free: boolean;
  /** O que seria descontado com saldo infinito. */
  full: number;
  /** O que de fato sai do usuário (limitado ao que ele tem). */
  userXp: number;
  userLevelBefore: number;
  userLevelAfter: number;
  /** O que sai do pet (0 sem pet equipado). */
  petXp: number;
  petLevelBefore: number | null;
  petLevelAfter: number | null;
}

/**
 * A conta de desistir AGORA. `phase` vem do relógio: em espera é livre, porque
 * nada foi investido. XP nunca fica negativo — quem tem 30 XP perde 30.
 */
export function quitCost(input: {
  block: Pick<StudyBlock, 'type' | 'xp' | 'time' | 'endTime'>;
  now: Date;
  userTotalXP: number;
  /** XP do pet equipado, ou null sem pet. */
  petXP: number | null;
  /** Força a fase (o abandono cobra um bloco que já acabou como se estivesse rodando). */
  phase?: 'waiting' | 'running';
}): QuitCost {
  const { block, now, userTotalXP, petXP } = input;
  const waiting = (input.phase ?? timerProgress(block, now).phase) === 'waiting';
  const full = penaltyFor(block);
  const free = waiting || full === 0;
  const userXp = free ? 0 : Math.min(full, Math.max(0, userTotalXP));
  const petXp = free || petXP == null ? 0 : Math.min(full, Math.max(0, petXP));
  return {
    free,
    full,
    userXp,
    userLevelBefore: getLevelIdx(userTotalXP) + 1,
    userLevelAfter: getLevelIdx(Math.max(0, userTotalXP - userXp)) + 1,
    petXp,
    petLevelBefore: petXP == null ? null : petLevelFromXP(petXP),
    petLevelAfter: petXP == null ? null : petLevelFromXP(Math.max(0, petXP - petXp)),
  };
}

// ---------------------------------------------------------------- registros

/** O bloco foi abandonado no hardcore: sem check, e não pode ser marcado depois. */
export function isForfeited(penalties: PenaltiesByDate | undefined, dateKey: DateKey, time: TimeString): boolean {
  return !!penalties?.[dateKey]?.some((p) => p.time === time);
}

export function penaltyRecord(
  session: Pick<HardcoreSession, 'time' | 'endTime' | 'name'>,
  cost: Pick<QuitCost, 'userXp' | 'petXp'>,
  pet: PetInstanceId | null,
  reason: PenaltyRecord['reason'],
  now: Date,
): PenaltyRecord {
  return {
    time: session.time,
    endTime: session.endTime,
    name: session.name.replace(/📖|🧘|☕/g, '').trim(),
    xp: cost.userXp,
    pet,
    petXp: cost.petXp,
    at: now.getTime(),
    reason,
  };
}

/** `penalties` em qualquer formato → só registros válidos. */
export function normalizePenalties(raw: unknown): PenaltiesByDate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PenaltiesByDate = {};
  for (const [day, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const records = list.flatMap((p): PenaltyRecord[] => {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
      const r = p as Record<string, unknown>;
      if (!isTime(r.time)) return [];
      return [{
        time: r.time,
        endTime: isTime(r.endTime) ? r.endTime : r.time,
        name: typeof r.name === 'string' ? r.name : '',
        xp: typeof r.xp === 'number' && Number.isFinite(r.xp) ? Math.max(0, r.xp) : 0,
        pet: typeof r.pet === 'string' && r.pet ? r.pet : null,
        petXp: typeof r.petXp === 'number' && Number.isFinite(r.petXp) ? Math.max(0, r.petXp) : 0,
        at: typeof r.at === 'number' ? r.at : 0,
        reason: r.reason === 'abandon' ? 'abandon' : 'quit',
      }];
    });
    if (records.length > 0) out[day] = records;
  }
  return out;
}
