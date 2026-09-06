// A linha do tempo de um plano: cada bloco vira um segmento numa régua de horas,
// pra ver "como fica o dia" sem ler a lista. Só geometria — quem desenha é a UI. Puro.

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

/** Régua mínima: um dia curto não vira uma barra gigante. */
export const TIMELINE_MIN_SPAN_MIN = 4 * 60;

const kindOf = (t: StudyBlock['type']): TimelineKind =>
  t === 'estudo' ? 'study' : t === 'pausa' ? 'pause' : t === 'event' ? 'event' : 'interval';

/**
 * Da hora cheia antes do primeiro bloco até a hora cheia depois do último. As marcas
 * de hora ficam em passo inteiro, no máximo `maxLabels` delas. `null` sem blocos.
 */
export function timelineOf(blocks: StudyBlock[], opts: { maxLabels?: number } = {}): Timeline | null {
  if (blocks.length === 0) return null;
  const starts = blocks.map((b) => timeToMins(b.time));
  const ends = blocks.map((b) => timeToMins(b.endTime));
  const fromMin = Math.floor(Math.min(...starts) / 60) * 60;
  let toMin = Math.ceil(Math.max(...ends) / 60) * 60;
  if (toMin - fromMin < TIMELINE_MIN_SPAN_MIN) toMin = Math.min(24 * 60, fromMin + TIMELINE_MIN_SPAN_MIN);
  const span = Math.max(1, toMin - fromMin);
  const pct = (m: number) => ((m - fromMin) / span) * 100;

  const segments: TimelineSegment[] = blocks.map((b) => {
    const s = timeToMins(b.time);
    const e = timeToMins(b.endTime);
    return { kind: kindOf(b.type), name: b.name, startMin: s, endMin: e, left: pct(s), width: pct(e) - pct(s) };
  });

  const maxLabels = Math.max(2, opts.maxLabels ?? 7);
  const step = Math.max(1, Math.ceil(span / 60 / (maxLabels - 1)));
  const hours: Timeline['hours'] = [];
  for (let m = fromMin; m <= toMin; m += step * 60) hours.push({ hour: m / 60, left: pct(m) });

  return { fromMin, toMin, segments, hours };
}

/** Posição (%) de um instante na régua, ou null se ele cai fora dela. */
export function timelinePosition(tl: Timeline, mins: number): number | null {
  if (mins < tl.fromMin || mins > tl.toMin) return null;
  return ((mins - tl.fromMin) / Math.max(1, tl.toMin - tl.fromMin)) * 100;
}
