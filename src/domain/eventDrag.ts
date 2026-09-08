// Arrastar um evento pra outro horário (ou outro dia): a geometria do gesto, pura.
// Nada aqui sabe de DOM, React ou estado — recebe as faixas já medidas na tela e
// devolve minutos do dia.
//
// A mesma função serve as duas telas porque as duas viram a mesma coisa: uma
// lista de faixas verticais que cobrem um intervalo de tempo. No Dia é uma faixa
// por linha do plano (que NÃO é proporcional à duração: uma pausa de 5 min e um
// estudo de 25 ocupam quase a mesma altura); na Semana é uma faixa só, a coluna
// inteira, que aí é proporcional. Interpolar dentro da faixa resolve as duas.

/** Uma faixa da tela e o intervalo de tempo que ela cobre. `top`/`bottom` em px, na mesma origem. */
export interface DragAnchor {
  top: number;
  bottom: number;
  startMin: number;
  endMin: number;
}

/** Um dia arrastável: onde ele fica na horizontal e as faixas dele. */
export interface DragField<K = string> {
  key: K;
  left: number;
  right: number;
  anchors: DragAnchor[];
}

/** O arrasto anda de 5 em 5 minutos — o mesmo passo do "Começar agora". */
export const DRAG_STEP_MIN = 5;

const MINS_IN_DAY = 24 * 60;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const ratio = (value: number, from: number, to: number): number =>
  to === from ? 0 : Math.min(1, Math.max(0, (value - from) / (to - from)));

/**
 * O minuto do dia sob uma posição vertical. Dentro de uma faixa, interpola; no
 * vão entre duas, interpola de uma ponta à outra; fora, clampa nas extremidades.
 */
export function minuteAtY(anchors: DragAnchor[], y: number): number | null {
  if (anchors.length === 0) return null;
  const first = anchors[0]!;
  if (y <= first.top) return first.startMin;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    if (y <= a.bottom) {
      if (y >= a.top) return lerp(a.startMin, a.endMin, ratio(y, a.top, a.bottom));
      // Vão entre a faixa anterior e esta (margem entre linhas).
      const prev = anchors[i - 1]!;
      return lerp(prev.endMin, a.startMin, ratio(y, prev.bottom, a.top));
    }
  }
  return anchors[anchors.length - 1]!.endMin;
}

/** O inverso: onde desenhar o fantasma de um horário. */
export function yAtMinute(anchors: DragAnchor[], min: number): number | null {
  if (anchors.length === 0) return null;
  const first = anchors[0]!;
  if (min <= first.startMin) return first.top;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    if (min <= a.endMin) {
      if (min >= a.startMin) return lerp(a.top, a.bottom, ratio(min, a.startMin, a.endMin));
      const prev = anchors[i - 1]!;
      return lerp(prev.bottom, a.top, ratio(min, prev.endMin, a.startMin));
    }
  }
  return anchors[anchors.length - 1]!.bottom;
}

/** O dia sob o ponteiro: a coluna que contém o x, ou a mais próxima dele. */
export function fieldAtX<K>(fields: DragField<K>[], x: number): DragField<K> | null {
  if (fields.length === 0) return null;
  let best = fields[0]!;
  let bestDist = Infinity;
  for (const f of fields) {
    if (x >= f.left && x <= f.right) return f;
    const dist = x < f.left ? f.left - x : x - f.right;
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return best;
}

export const snapMinutes = (min: number, step: number = DRAG_STEP_MIN): number =>
  Math.round(min / step) * step;

/** Quanto do evento fica acima do dedo, em minutos — o ponto onde ele foi pego. */
export function grabOffsetMin(rect: { top: number; bottom: number }, y: number, durationMin: number): number {
  return ratio(y, rect.top, rect.bottom) * durationMin;
}

export interface MinuteRange {
  startMin: number;
  endMin: number;
}

/**
 * O novo horário de um evento arrastado: mantém a duração, encaixa no passo e não
 * deixa vazar do dia. Evento maior que o dia (não existe hoje) fica começando em 0.
 */
export function movedRange(durationMin: number, targetStartMin: number, step: number = DRAG_STEP_MIN): MinuteRange {
  const snapped = snapMinutes(targetStartMin, step);
  const startMin = Math.max(0, Math.min(snapped, MINS_IN_DAY - durationMin));
  return { startMin, endMin: startMin + durationMin };
}
