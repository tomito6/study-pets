// A geometria de arrastar um evento (src/domain/eventDrag.ts): posição na tela ↔
// minuto do dia, o dia sob o ponteiro, e o horário que o arrasto produz.

import { describe, expect, it } from 'vitest';
import {
  DRAG_STEP_MIN,
  fieldAtX,
  grabOffsetMin,
  minuteAtY,
  movedRange,
  snapMinutes,
  yAtMinute,
} from '../src/domain/eventDrag';
import type { DragAnchor } from '../src/domain/eventDrag';

/** Três linhas de 100px com 10px de vão, cobrindo 09:00–09:25, 09:25–09:30 e 09:30–09:55. */
const lista: DragAnchor[] = [
  { top: 0, bottom: 100, startMin: 540, endMin: 565 },
  { top: 110, bottom: 210, startMin: 565, endMin: 570 },
  { top: 220, bottom: 320, startMin: 570, endMin: 595 },
];

/** A Semana: uma faixa só, proporcional — 08:00–20:00 em 600px. */
const coluna: DragAnchor[] = [{ top: 0, bottom: 600, startMin: 480, endMin: 1200 }];

describe('minuteAtY', () => {
  it('sem faixa, não há minuto', () => {
    expect(minuteAtY([], 50)).toBeNull();
  });

  it('interpola dentro da faixa', () => {
    expect(minuteAtY(lista, 0)).toBe(540);
    expect(minuteAtY(lista, 50)).toBe(552.5);
    expect(minuteAtY(lista, 100)).toBe(565);
    expect(minuteAtY(coluna, 300)).toBe(840); // meio da coluna = 14:00
  });

  it('no vão entre duas linhas, interpola de uma ponta à outra', () => {
    expect(minuteAtY(lista, 105)).toBe(565); // fim da primeira = início da segunda
    expect(minuteAtY(lista, 215)).toBe(570);
  });

  it('fora das pontas, clampa', () => {
    expect(minuteAtY(lista, -500)).toBe(540);
    expect(minuteAtY(lista, 9999)).toBe(595);
  });

  it('faixa sem altura devolve o início dela, sem dividir por zero', () => {
    expect(minuteAtY([{ top: 40, bottom: 40, startMin: 600, endMin: 630 }], 40)).toBe(600);
  });
});

describe('yAtMinute', () => {
  it('é o inverso de minuteAtY dentro da faixa', () => {
    expect(yAtMinute(lista, 540)).toBe(0);
    expect(yAtMinute(lista, 552.5)).toBe(50);
    expect(yAtMinute(coluna, 840)).toBe(300);
  });

  it('no vão e fora das pontas, o mesmo tratamento', () => {
    expect(yAtMinute(lista, 565)).toBe(100);
    expect(yAtMinute(lista, 0)).toBe(0);
    expect(yAtMinute(lista, 1439)).toBe(320);
    expect(yAtMinute([], 600)).toBeNull();
  });
});

describe('fieldAtX', () => {
  const dias = [
    { key: 'seg', left: 0, right: 100, anchors: coluna },
    { key: 'ter', left: 100, right: 200, anchors: coluna },
    { key: 'qua', left: 200, right: 300, anchors: coluna },
  ];

  it('devolve a coluna sob o ponteiro', () => {
    expect(fieldAtX(dias, 150)?.key).toBe('ter');
    expect(fieldAtX(dias, 250)?.key).toBe('qua');
  });

  it('fora de todas, devolve a mais próxima — o arrasto não se perde na beira', () => {
    expect(fieldAtX(dias, -80)?.key).toBe('seg');
    expect(fieldAtX(dias, 900)?.key).toBe('qua');
    expect(fieldAtX([], 10)).toBeNull();
  });
});

describe('snapMinutes e grabOffsetMin', () => {
  it('encaixa no passo de 5 minutos', () => {
    expect(DRAG_STEP_MIN).toBe(5);
    expect(snapMinutes(552.5)).toBe(555);
    expect(snapMinutes(551)).toBe(550);
    expect(snapMinutes(551, 15)).toBe(555);
  });

  it('o ponto de pega é a fração do evento acima do dedo', () => {
    expect(grabOffsetMin({ top: 0, bottom: 100 }, 50, 60)).toBe(30);
    expect(grabOffsetMin({ top: 0, bottom: 100 }, 0, 60)).toBe(0);
    expect(grabOffsetMin({ top: 0, bottom: 0 }, 10, 60)).toBe(0);
    // Pegou fora do bloco (o dedo escorregou): clampa nas pontas.
    expect(grabOffsetMin({ top: 0, bottom: 100 }, 400, 60)).toBe(60);
  });
});

describe('movedRange', () => {
  it('mantém a duração e encaixa no passo', () => {
    expect(movedRange(60, 552.5)).toEqual({ startMin: 555, endMin: 615 });
    expect(movedRange(90, 601)).toEqual({ startMin: 600, endMin: 690 });
  });

  it('não deixa o evento vazar do dia', () => {
    expect(movedRange(60, -30)).toEqual({ startMin: 0, endMin: 60 });
    expect(movedRange(60, 1430)).toEqual({ startMin: 1380, endMin: 1440 });
  });
});
