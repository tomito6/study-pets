// Casos de uso dos grupos de estudo. Um grupo não mexe no plano — nada de
// clearBlockCache: salva, notifica e pronto. Dia encerrado é somente leitura;
// dia futuro pode, porque planejar o amanhã é exatamente o ponto.

import { isDayClosed } from '../domain/checks';
import { DEFAULT_GROUP_NAME, sortGroups, validateGroupRange } from '../domain/groups';
import type { GroupValidation, TimeRange } from '../domain/groups';
import type { DateKey, StudyGroup } from '../domain/types';
import { notify, state } from '../store/store';
import { blocksForDay } from './plan';
import { scheduleSave } from './save';

export interface GroupInput extends TimeRange {
  name: string;
  goal: string;
}

export type GroupRefusal = 'closed' | 'not-found' | Extract<GroupValidation, { ok: false }>['reason'];
export type GroupResult = { ok: true; group: StudyGroup } | { ok: false; reason: GroupRefusal };

export const groupsForDay = (dateKey: DateKey): StudyGroup[] => state.groups[dateKey] ?? [];

export const canEditGroups = (dateKey: DateKey): boolean => !isDayClosed(state.closedDays, dateKey);

/** Valida um trecho contra o plano e os grupos do dia. `ignoreId` = o próprio grupo, ao editar. */
export function validateGroup(dateKey: DateKey, range: TimeRange, ignoreId?: string): GroupValidation {
  return validateGroupRange(range, groupsForDay(dateKey), blocksForDay(dateKey), ignoreId);
}

const cleanName = (name: string): string => name.trim() || DEFAULT_GROUP_NAME;
const newGroupId = (): string => `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function commit(): void {
  scheduleSave();
  notify();
}

export function addGroup(dateKey: DateKey, input: GroupInput): GroupResult {
  if (!canEditGroups(dateKey)) return { ok: false, reason: 'closed' };
  const v = validateGroup(dateKey, input);
  if (!v.ok) return v;
  const group: StudyGroup = {
    id: newGroupId(),
    start: input.start,
    end: input.end,
    name: cleanName(input.name),
    goal: input.goal.trim(),
  };
  state.groups[dateKey] = sortGroups([...groupsForDay(dateKey), group]);
  commit();
  return { ok: true, group };
}

export function updateGroup(dateKey: DateKey, id: string, input: GroupInput): GroupResult {
  if (!canEditGroups(dateKey)) return { ok: false, reason: 'closed' };
  const current = groupsForDay(dateKey).find((g) => g.id === id);
  if (!current) return { ok: false, reason: 'not-found' };
  const v = validateGroup(dateKey, input, id);
  if (!v.ok) return v;
  const group: StudyGroup = {
    ...current,
    start: input.start,
    end: input.end,
    name: cleanName(input.name),
    goal: input.goal.trim(),
  };
  state.groups[dateKey] = sortGroups(groupsForDay(dateKey).map((g) => (g.id === id ? group : g)));
  commit();
  return { ok: true, group };
}

/** Devolve false se o grupo não existia ou o dia está encerrado. */
export function deleteGroup(dateKey: DateKey, id: string): boolean {
  if (!canEditGroups(dateKey)) return false;
  const before = groupsForDay(dateKey);
  const rest = before.filter((g) => g.id !== id);
  if (rest.length === before.length) return false;
  if (rest.length === 0) delete state.groups[dateKey];
  else state.groups[dateKey] = rest;
  commit();
  return true;
}
