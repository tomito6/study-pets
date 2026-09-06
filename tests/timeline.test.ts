// A linha do tempo (src/domain/timeline.ts): régua em horas cheias, um segmento por
// bloco em %, marcas de hora com passo inteiro, e a posição do "agora".

import { describe, expect, it } from 'vitest';
import { TIMELINE_MIN_SPAN_MIN, timelineOf, timelinePosition } from '../src/domain/timeline';
import type { StudyBlock } from '../src/domain/types';

const b = (time: string, endTime: string, type: StudyBlock['type'] = 'estudo'): StudyBlock => ({
  time, endTime, name: type, type, xp: 0, session: 0,
});

describe('timelineOf', () => {
  it('sem blocos, nada', () => {
    expect(timelineOf([])).toBeNull();
  });

  it('a régua vai da hora cheia antes do primeiro bloco à hora cheia depois do último', () => {
    const tl = timelineOf([b('09:15', '09:40'), b('09:40', '09:45', 'pausa'), b('17:30', '17:55')])!;
    expect(tl.fromMin).toBe(9 * 60);
    expect(tl.toMin).toBe(18 * 60);
  });

  it('cada bloco vira um segmento em % da régua, com o tipo traduzido', () => {
    const tl = timelineOf([b('09:00', '09:30'), b('09:30', '09:35', 'pausa'), b('10:00', '11:00', 'event'), b('12:00', '13:00', 'intervalo')])!;
    expect(tl.fromMin).toBe(540);
    expect(tl.toMin).toBe(780); // 09h–13h = 4h
    expect(tl.segments.map((s) => s.kind)).toEqual(['study', 'pause', 'event', 'interval']);
    expect(tl.segments[0]).toMatchObject({ left: 0, width: 12.5, startMin: 540, endMin: 570 });
    expect(tl.segments[2]!.left).toBeCloseTo(25);
    expect(tl.segments[3]!.left + tl.segments[3]!.width).toBeCloseTo(100);
  });

  it('um dia curto não vira uma barra gigante: régua mínima de 4h', () => {
    const tl = timelineOf([b('09:00', '09:25')])!;
    expect(tl.toMin - tl.fromMin).toBe(TIMELINE_MIN_SPAN_MIN);
    expect(tl.segments[0]!.width).toBeCloseTo((25 / 240) * 100);
  });

  it('as marcas de hora ficam em passo inteiro, no máximo o pedido', () => {
    const dia = timelineOf([b('07:00', '07:25'), b('21:30', '21:55')], { maxLabels: 7 })!; // 07h–22h = 15h → passo 3h
    expect(dia.hours.map((h) => h.hour)).toEqual([7, 10, 13, 16, 19, 22]);
    expect(dia.hours[0]!.left).toBe(0);
    expect(dia.hours[dia.hours.length - 1]!.left).toBe(100);
    const curto = timelineOf([b('09:00', '09:25'), b('11:30', '11:55')])!; // 09h–12h → mínimo 4h → 09..13, passo 1
    expect(curto.hours.map((h) => h.hour)).toEqual([9, 10, 11, 12, 13]);
  });

  it('timelinePosition: dentro da régua vira %, fora vira null', () => {
    const tl = timelineOf([b('09:00', '09:25'), b('12:35', '13:00')])!; // 09h–13h
    expect(timelinePosition(tl, 9 * 60)).toBe(0);
    expect(timelinePosition(tl, 11 * 60)).toBe(50);
    expect(timelinePosition(tl, 13 * 60)).toBe(100);
    expect(timelinePosition(tl, 8 * 60)).toBeNull();
    expect(timelinePosition(tl, 14 * 60)).toBeNull();
  });
});
