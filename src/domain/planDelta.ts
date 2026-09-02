// O que mudou no plano de um dia depois de mexer em evento/almoço/config —
// pra dizer ao usuário em uma frase, sem fazê-lo comparar listas.

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

export interface PlanDelta {
  /** Diferença no número de blocos que rendem estudo (estudo + evento). */
  studyDelta: number;
  /** Novo horário de fim, se mudou. */
  newEnd: string | null;
}

export function planDelta(before: StudyBlock[], after: StudyBlock[]): PlanDelta {
  const beforeEnd = lastEnd(before);
  const afterEnd = lastEnd(after);
  return {
    studyDelta: studyCount(after) - studyCount(before),
    newEnd: beforeEnd !== afterEnd && afterEnd ? afterEnd : null,
  };
}

/** Frase pro toast, ou null se nada relevante mudou. */
export function describePlanDelta(delta: PlanDelta): string | null {
  const parts: string[] = [];
  if (delta.studyDelta !== 0) {
    const sign = delta.studyDelta > 0 ? '+' : '';
    const word = Math.abs(delta.studyDelta) === 1 ? 'estudo' : 'estudos';
    parts.push(`${sign}${delta.studyDelta} ${word}`);
  }
  if (delta.newEnd) parts.push(`termina às ${delta.newEnd}`);
  return parts.length ? `Plano reajustado: ${parts.join(' · ')}` : null;
}
