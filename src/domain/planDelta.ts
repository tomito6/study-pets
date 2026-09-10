// O que mudou no plano de um dia depois de mexer em evento/almoço/config —
// pra dizer ao usuário em uma frase, sem fazê-lo comparar listas.

import { blockMins } from './time';
import type { StudyBlock } from './types';

const studyCount = (blocks: StudyBlock[]) =>
  blocks.filter((b) => b.type === 'estudo' || b.type === 'event').length;

const lastEnd = (blocks: StudyBlock[]): string | null => {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const t = blocks[i]!.type;
    if (t === 'estudo' || t === 'pausa' || t === 'event') return blocks[i]!.endTime;
  }
  return null;
};

/** A duração que vale do último estudo do dia, ou null sem estudo. */
const lastStudyMins = (blocks: StudyBlock[]): number | null => {
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i]!.type === 'estudo') return blockMins(blocks[i]!);
  return null;
};

export interface PlanDelta {
  /** Diferença no número de blocos que rendem estudo (estudo + evento). */
  studyDelta: number;
  /** Novo horário de fim, se mudou. */
  newEnd: string | null;
  /** O último estudo mudou de tamanho (uma pausa empurrou o dia contra o fim da janela): os minutos novos. */
  lastStudyMins?: number | null;
}

export function planDelta(before: StudyBlock[], after: StudyBlock[]): PlanDelta {
  const beforeEnd = lastEnd(before);
  const afterEnd = lastEnd(after);
  const lastBefore = lastStudyMins(before);
  const lastAfter = lastStudyMins(after);
  return {
    studyDelta: studyCount(after) - studyCount(before),
    newEnd: beforeEnd !== afterEnd && afterEnd ? afterEnd : null,
    lastStudyMins: lastAfter != null && lastBefore != null && lastAfter !== lastBefore ? lastAfter : null,
  };
}

/** Os pedaços da frase ("+1 estudo", "termina às 18:00", "último estudo com 18 min"); vazio se nada relevante mudou. */
export function planDeltaParts(delta: PlanDelta): string[] {
  const parts: string[] = [];
  if (delta.studyDelta !== 0) {
    const sign = delta.studyDelta > 0 ? '+' : '';
    const word = Math.abs(delta.studyDelta) === 1 ? 'estudo' : 'estudos';
    parts.push(`${sign}${delta.studyDelta} ${word}`);
  }
  if (delta.newEnd) parts.push(`termina às ${delta.newEnd}`);
  if (delta.lastStudyMins != null) parts.push(`último estudo com ${delta.lastStudyMins} min`);
  return parts;
}

/** Frase pro toast, ou null se nada relevante mudou. */
export function describePlanDelta(delta: PlanDelta): string | null {
  const parts = planDeltaParts(delta);
  return parts.length ? `Plano reajustado: ${parts.join(' · ')}` : null;
}
