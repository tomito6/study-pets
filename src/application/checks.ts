// Caso de uso: marcar/desmarcar um bloco.

import { canToggleCheck } from '../domain/checks';
import { bonusForCheck, coinsForBlock, xpFromCheck } from '../domain/progression';
import { timeToMins } from '../domain/time';
import type { CheckRecord, DateKey, StudyBlock, TimeString } from '../domain/types';
import { state } from '../store/store';
import { activePet } from './pets';
import { blocksForDay } from './plan';
import { scheduleSave } from './save';

export interface CheckResult {
  /** Estado depois do toggle. */
  checked: boolean;
  /** XP efetivo do check (já com bônus de skill), pro feedback visual. */
  xp: number;
  coins: number;
}

const mins = (b: Pick<StudyBlock, 'time' | 'endTime'>): number => timeToMins(b.endTime) - timeToMins(b.time);

/** O que as regras de skill precisam saber do dia: o que já foi marcado e o bloco anterior. */
function dayContext(dateKey: DateKey, block: StudyBlock, day: Record<TimeString, CheckRecord>) {
  const blocks = blocksForDay(dateKey);
  const idx = blocks.findIndex((b) => b.time === block.time);
  const prev = idx > 0 ? blocks[idx - 1]! : null;
  const done = blocks.filter((b) => (b.type === 'estudo' || b.type === 'event') && day[b.time]);
  return {
    studiesCheckedToday: done.length,
    studyMinsToday: done.reduce((sum, b) => sum + mins(b), 0),
    prevBlock: prev ? { type: prev.type, mins: mins(prev) } : null,
  };
}

/**
 * Marca ou desmarca o bloco. Devolve `null` se o dia não aceita mudança (encerrado
 * ou futuro). Ao marcar, grava o pet equipado e o bônus decidido AGORA — o XP do
 * pet é creditado só quando o dia fechar (ver `computePendingPetXP`).
 */
export function toggleBlockCheck(dateKey: DateKey, block: StudyBlock, now: Date = new Date()): CheckResult | null {
  if (!canToggleCheck(dateKey, { closedDays: state.closedDays, now })) return null;

  const day = state.checks[dateKey] ?? (state.checks[dateKey] = {});
  const dur = mins(block);

  if (day[block.time]) {
    delete day[block.time];
    if (Object.keys(day).length === 0) delete state.checks[dateKey];
    scheduleSave();
    return { checked: false, xp: 0, coins: 0 };
  }

  const pet = activePet();
  const bonus = bonusForCheck(block, dateKey, {
    activeSkill: pet?.skill ?? null,
    // A skill vale desde a troca dela OU desde que o pet foi equipado — o mais recente.
    activatedAt: Math.max(pet?.skillActivatedAt ?? 0, state.pets.activeSince ?? 0),
    ...dayContext(dateKey, block, day),
    dailyStudyMin: state.config.dailyStudyMin ?? 0,
    longBreakMins: state.config.longBreak,
    now,
  });
  const record = { pet: pet?.id ?? null, bonus };
  day[block.time] = record;
  scheduleSave();
  return { checked: true, xp: xpFromCheck(block, record), coins: coinsForBlock(block, dur) };
}
