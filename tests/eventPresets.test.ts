// Atalhos do Novo evento (src/domain/eventPresets.ts): o que cada um preenche, o ícone
// no nome, a refeição de todo dia e a migração do almoço antigo pra eventos.

import { describe, expect, it } from 'vitest';
import {
  ALL_WEEKDAYS,
  EVENT_PRESETS,
  LUNCH_NAME,
  LUNCH_SERIES_ID,
  addMinutes,
  mealSeries,
  migrateLunch,
  presetFields,
  presetLabel,
  startsWithEmoji,
} from '../src/domain/eventPresets';
import { generateBlocks } from '../src/domain/planner';
import { DEFAULT_CFG } from '../src/domain/config';
import { expandEventsForDate } from '../src/domain/events';

describe('presets', () => {
  it('um só de comida (Refeição), e ele repete todo dia; os outros são pontuais', () => {
    expect(EVENT_PRESETS.map((p) => p.id)).toEqual(['meal', 'meeting', 'coffee', 'commute']);
    expect(EVENT_PRESETS.filter((p) => p.repeatDaily).map((p) => p.id)).toEqual(['meal']);
  });

  it('preenche nome com ícone, horário típico, duração, e nunca conta como estudo', () => {
    const meal = EVENT_PRESETS[0]!;
    expect(presetLabel(meal)).toBe('🍽️ Refeição');
    expect(presetFields(meal)).toEqual({ name: '🍽️ Refeição', start: '13:00', end: '14:00', countsAsStudy: false, repeatDaily: true });
    const coffee = EVENT_PRESETS.find((p) => p.id === 'coffee')!;
    expect(presetFields(coffee)).toMatchObject({ start: '16:00', end: '16:20', repeatDaily: false });
  });

  it('addMinutes não passa de 23:59', () => {
    expect(addMinutes('13:00', 60)).toBe('14:00');
    expect(addMinutes('23:30', 60)).toBe('23:59');
  });

  it('startsWithEmoji: o ícone do nome vale, texto não', () => {
    expect(startsWithEmoji('🍽️ Refeição')).toBe(true);
    expect(startsWithEmoji('☕ Café')).toBe(true);
    expect(startsWithEmoji('Aula de Álgebra')).toBe(false);
    expect(startsWithEmoji('')).toBe(false);
  });

  it('no plano, evento com ícone próprio não ganha 📅; sem ícone ganha', () => {
    const blocks = generateBlocks(DEFAULT_CFG, [
      { name: '🍽️ Refeição', start: '13:00', end: '14:00', countsAsStudy: false, _seriesId: 'ser_1' },
      { name: 'Aula', start: '10:00', end: '11:00' },
      { name: 'Consulta', start: '15:00', end: '15:30', countsAsStudy: false },
    ]);
    expect(blocks.find((b) => b.time === '13:00')).toMatchObject({ type: 'intervalo', name: '🍽️ Refeição' });
    expect(blocks.find((b) => b.time === '10:00')).toMatchObject({ type: 'event', name: '📅 Aula' });
    expect(blocks.find((b) => b.time === '15:00')).toMatchObject({ type: 'intervalo', name: 'Consulta' }); // avulso: nome cru, como sempre
  });
});

describe('a refeição de todo dia', () => {
  it('é uma série semanal em todos os dias, sem XP, sem âncora (vale pros dias passados)', () => {
    const s = mealSeries('13:00', 60);
    expect(s).toMatchObject({ id: LUNCH_SERIES_ID, name: LUNCH_NAME, start: '13:00', end: '14:00', freq: 'weekly', countsAsStudy: false, exceptions: [] });
    expect(s.weekdays).toEqual([...ALL_WEEKDAYS]);
    expect(s.anchor).toBeUndefined();
    expect(expandEventsForDate('2020-01-01', {}, [s])).toHaveLength(1);
    expect(expandEventsForDate('2026-09-06', {}, [s])[0]).toMatchObject({ start: '13:00', _seriesId: LUNCH_SERIES_ID, countsAsStudy: false });
  });

  it('aceita id, nome e âncora próprios', () => {
    const s = mealSeries('19:00', 45, { id: 'ser_x', name: '🍝 Janta', anchor: '2026-09-01' });
    expect(s).toMatchObject({ id: 'ser_x', name: '🍝 Janta', end: '19:45', anchor: '2026-09-01' });
  });
});

describe('migrateLunch — o almoço antigo vira eventos', () => {
  it('almoço na config vira a série; cada dia editado vira exceção + avulso daquele dia', () => {
    const m = migrateLunch({
      hasLunch: true,
      lunch: '13:00',
      lunchDur: 60,
      overrides: { '2026-09-01': { lunch: '12:00', lunchDur: 30 }, '2026-09-03': { lunch: '12:30' } },
    });
    expect(m.series).toMatchObject({ id: LUNCH_SERIES_ID, start: '13:00', end: '14:00' });
    expect(m.series!.exceptions).toEqual(['2026-09-01', '2026-09-03']);
    expect(m.events).toEqual({
      '2026-09-01': [{ name: LUNCH_NAME, start: '12:00', end: '12:30', countsAsStudy: false }],
      '2026-09-03': [{ name: LUNCH_NAME, start: '12:30', end: '13:30', countsAsStudy: false }], // duração da rotina
    });
  });

  it('um dia que desligou o almoço vira só exceção', () => {
    const m = migrateLunch({ hasLunch: true, lunch: '13:00', lunchDur: 60, overrides: { '2026-09-01': { hasLunch: false } } });
    expect(m.series!.exceptions).toEqual(['2026-09-01']);
    expect(m.events).toEqual({});
  });

  it('sem almoço na rotina: nenhuma série; só um dia que ligou à mão vira avulso', () => {
    const m = migrateLunch({ hasLunch: false, lunch: '13:00', lunchDur: 60, overrides: { '2026-09-01': { hasLunch: true, lunch: '12:00' } } });
    expect(m.series).toBeNull();
    expect(m.events).toEqual({ '2026-09-01': [{ name: LUNCH_NAME, start: '12:00', end: '13:00', countsAsStudy: false }] });
  });

  it('o plano do dia editado sai igual ao de antes: refeição no horário editado, nos outros dias no da rotina', () => {
    const m = migrateLunch({ hasLunch: true, lunch: '13:00', lunchDur: 60, overrides: { '2026-09-01': { lunch: '12:00', lunchDur: 30 } } });
    const series = [m.series!];
    const editado = generateBlocks(DEFAULT_CFG, expandEventsForDate('2026-09-01', m.events, series));
    const normal = generateBlocks(DEFAULT_CFG, expandEventsForDate('2026-09-02', m.events, series));
    expect(editado.find((b) => b.type === 'intervalo')).toMatchObject({ time: '12:00', endTime: '12:30', name: LUNCH_NAME });
    expect(editado.filter((b) => b.type === 'intervalo')).toHaveLength(1);
    expect(normal.find((b) => b.type === 'intervalo')).toMatchObject({ time: '13:00', endTime: '14:00', name: LUNCH_NAME });
  });
});
