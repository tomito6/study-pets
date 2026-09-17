// A linha do tempo de um plano: cada bloco vira um segmento numa régua de horas,
// pra ver "como fica o dia" sem ler a lista. Só geometria — quem desenha é a UI. Puro.
//
// Desde 2026-09-17 também a SEMANA: sete dias na mesma régua (`weekTimelineOf`), pra
// "Como fica a semana" nas Configurações — a aula de terça e o yoga de quarta caem no
// horário deles, alinhados coluna a coluna com os outros dias.

import { timeToMins } from './time';
import type { StudyBlock } from './types';

export type TimelineKind = 'study' | 'pause' | 'event' | 'interval';

export interface TimelineSegment {
  kind: TimelineKind;
  name: string;
  startMin: number;
  endMin: number;
  /** Posição e largura em % da régua. */
  left: number;
  width: number;
}

export interface Timeline {
  /** Limites da régua, em minutos desde a meia-noite (horas cheias). */
  fromMin: number;
  toMin: number;
  segments: TimelineSegment[];
  /** Horas marcadas na régua, com a posição em %. */
  hours: Array<{ hour: number; left: number }>;
}

/** A régua compartilhada de vários dias: os mesmos limites, uma linha de segmentos por dia. */
export interface WeekTimeline {
  fromMin: number;
  toMin: number;
  rows: TimelineSegment[][];
  hours: Array<{ hour: number; left: number }>;
}

/** Régua mínima: um dia curto não vira uma barra gigante. */
export const TIMELINE_MIN_SPAN_MIN = 4 * 60;

const kindOf = (t: StudyBlock['type']): TimelineKind =>
  t === 'estudo' ? 'study' : t === 'pausa' ? 'pause' : t === 'event' ? 'event' : 'interval';

/** Da hora cheia antes do primeiro bloco à hora cheia depois do último, com o mínimo. */
function axisOf(blocks: StudyBlock[]): { fromMin: number; toMin: number } {
  const starts = blocks.map((b) => timeToMins(b.time));
  const ends = blocks.map((b) => timeToMins(b.endTime));
  const fromMin = Math.floor(Math.min(...starts) / 60) * 60;
  let toMin = Math.ceil(Math.max(...ends) / 60) * 60;
  if (toMin - fromMin < TIMELINE_MIN_SPAN_MIN) toMin = Math.min(24 * 60, fromMin + TIMELINE_MIN_SPAN_MIN);
  return { fromMin, toMin };
}

function segmentsOn(blocks: StudyBlock[], fromMin: number, toMin: number): TimelineSegment[] {
  const span = Math.max(1, toMin - fromMin);
  const pct = (m: number) => ((m - fromMin) / span) * 100;
  return blocks.map((b) => {
    const s = timeToMins(b.time);
    const e = timeToMins(b.endTime);
    return { kind: kindOf(b.type), name: b.name, startMin: s, endMin: e, left: pct(s), width: pct(e) - pct(s) };
  });
}

/** As marcas de hora em passo inteiro, no máximo `maxLabels` delas. */
function hoursOn(fromMin: number, toMin: number, maxLabels: number): Timeline['hours'] {
  const span = Math.max(1, toMin - fromMin);
  const pct = (m: number) => ((m - fromMin) / span) * 100;
  const labels = Math.max(2, maxLabels);
  const step = Math.max(1, Math.ceil(span / 60 / (labels - 1)));
  const hours: Timeline['hours'] = [];
  for (let m = fromMin; m <= toMin; m += step * 60) hours.push({ hour: m / 60, left: pct(m) });
  return hours;
}

/**
 * Da hora cheia antes do primeiro bloco até a hora cheia depois do último. As marcas
 * de hora ficam em passo inteiro, no máximo `maxLabels` delas. `null` sem blocos.
 */
export function timelineOf(blocks: StudyBlock[], opts: { maxLabels?: number } = {}): Timeline | null {
  if (blocks.length === 0) return null;
  const { fromMin, toMin } = axisOf(blocks);
  return { fromMin, toMin, segments: segmentsOn(blocks, fromMin, toMin), hours: hoursOn(fromMin, toMin, opts.maxLabels ?? 7) };
}

/**
 * Vários dias na MESMA régua: os limites saem do primeiro e do último bloco da semana
 * inteira, e cada dia vira uma linha de segmentos em % dessa régua — um dia sem bloco
 * (folga) é uma linha vazia. `null` se nenhum dia tem bloco.
 */
export function weekTimelineOf(days: StudyBlock[][], opts: { maxLabels?: number } = {}): WeekTimeline | null {
  const all = days.flat();
  if (all.length === 0) return null;
  const { fromMin, toMin } = axisOf(all);
  return {
    fromMin,
    toMin,
    rows: days.map((blocks) => segmentsOn(blocks, fromMin, toMin)),
    hours: hoursOn(fromMin, toMin, opts.maxLabels ?? 5),
  };
}

/** Posição (%) de um instante na régua, ou null se ele cai fora dela. */
export function timelinePosition(tl: Pick<Timeline, 'fromMin' | 'toMin'>, mins: number): number | null {
  if (mins < tl.fromMin || mins > tl.toMin) return null;
  return ((mins - tl.fromMin) / Math.max(1, tl.toMin - tl.fromMin)) * 100;
}
