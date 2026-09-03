// Grupos de estudo: um nome e um objetivo em cima de um trecho do dia.
//
// O grupo é uma anotação por horário — NUNCA entra no gerador de blocos. Quem
// pertence a ele se decide na hora de olhar: bloco cujo intervalo cabe inteiro
// no do grupo. É o mesmo princípio dos checks por horário: se a config muda e
// os blocos se deslocam, o grupo continua cobrindo o mesmo trecho e pega o que
// estiver lá. Puro — sem estado, sem DOM.

import { minsToTime, timeToMins } from './time';
import type { CheckRecord, StudyBlock, StudyGroup, TimeString } from './types';

export const DEFAULT_GROUP_NAME = 'Grupo';

export interface TimeRange {
  start: TimeString;
  end: TimeString;
}

/** O bloco cabe inteiro no intervalo do grupo. */
export function blockInGroup(b: StudyBlock, g: TimeRange): boolean {
  return timeToMins(b.time) >= timeToMins(g.start) && timeToMins(b.endTime) <= timeToMins(g.end);
}

/** O grupo do bloco, se houver. Grupos não se sobrepõem (validação), então é no máximo um. */
export function groupOf(groups: StudyGroup[], b: StudyBlock): StudyGroup | null {
  return groups.find((g) => blockInGroup(b, g)) ?? null;
}

/** Estudo e evento contam pro progresso; pausa, almoço e intervalo só ocupam o espaço. */
export const countsForGroup = (b: StudyBlock): boolean => b.type === 'estudo' || b.type === 'event';

export interface GroupProgress {
  /** Estudos/eventos marcados e no total. */
  done: number;
  total: number;
  /** Minutos cumpridos e planejados (duração real dos blocos). */
  minsDone: number;
  minsTotal: number;
}

export function groupProgress(
  g: TimeRange,
  blocks: StudyBlock[],
  dayChecks: Record<TimeString, CheckRecord> | undefined,
): GroupProgress {
  const p: GroupProgress = { done: 0, total: 0, minsDone: 0, minsTotal: 0 };
  for (const b of blocks) {
    if (!countsForGroup(b) || !blockInGroup(b, g)) continue;
    const dur = timeToMins(b.endTime) - timeToMins(b.time);
    p.total++;
    p.minsTotal += dur;
    if (dayChecks && dayChecks[b.time]) {
      p.done++;
      p.minsDone += dur;
    }
  }
  return p;
}

/** Intervalo coberto por um conjunto de linhas: do início mais cedo ao fim mais tarde. */
export function rangeOf(blocks: StudyBlock[]): TimeRange | null {
  if (blocks.length === 0) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const b of blocks) {
    start = Math.min(start, timeToMins(b.time));
    end = Math.max(end, timeToMins(b.endTime));
  }
  return { start: minsToTime(start), end: minsToTime(end) };
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return timeToMins(a.start) < timeToMins(b.end) && timeToMins(b.start) < timeToMins(a.end);
}

export type GroupValidation =
  | { ok: true }
  | { ok: false; reason: 'end-before-start' | 'overlap' | 'no-study' };

/**
 * Um grupo precisa de fim depois do início, não pode se sobrepor a outro grupo
 * do dia, e precisa de pelo menos um estudo/evento dentro — senão não tem o que
 * acompanhar. `ignoreId` é o próprio grupo, ao editar.
 */
export function validateGroupRange(
  range: TimeRange,
  existing: StudyGroup[],
  blocks: StudyBlock[],
  ignoreId?: string,
): GroupValidation {
  if (timeToMins(range.end) <= timeToMins(range.start)) return { ok: false, reason: 'end-before-start' };
  if (existing.some((g) => g.id !== ignoreId && rangesOverlap(g, range))) return { ok: false, reason: 'overlap' };
  if (!blocks.some((b) => countsForGroup(b) && blockInGroup(b, range))) return { ok: false, reason: 'no-study' };
  return { ok: true };
}

export interface GroupHeaderPosition {
  group: StudyGroup;
  /** Índice do bloco antes do qual o cabeçalho aparece (`blocks.length` = depois de todos). */
  index: number;
  /** Sessão do primeiro bloco membro — dá a cor de acento ao cabeçalho. */
  session: number | undefined;
}

/**
 * Onde cada cabeçalho entra na lista: antes do primeiro bloco membro. Sem membro
 * (o plano mudou e o trecho ficou vazio), antes do primeiro bloco que começa no
 * horário do grupo ou depois — o grupo continua visível pra editar ou apagar.
 */
export function groupHeaderPositions(groups: StudyGroup[], blocks: StudyBlock[]): GroupHeaderPosition[] {
  return groups
    .map((group): GroupHeaderPosition => {
      const member = blocks.findIndex((b) => blockInGroup(b, group));
      if (member >= 0) return { group, index: member, session: blocks[member]!.session };
      const after = blocks.findIndex((b) => timeToMins(b.time) >= timeToMins(group.start));
      return { group, index: after >= 0 ? after : blocks.length, session: undefined };
    })
    .sort((a, b) => a.index - b.index || timeToMins(a.group.start) - timeToMins(b.group.start));
}

export const sortGroups = (groups: StudyGroup[]): StudyGroup[] =>
  [...groups].sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
