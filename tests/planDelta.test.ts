import { describe, expect, it } from 'vitest';
import { describePlanDelta, planDelta, planDeltaParts } from '../src/domain/planDelta';
import type { StudyBlock } from '../src/domain/types';

const estudo = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'e', type: 'estudo', xp: 50 });
const pausa = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'p', type: 'pausa', xp: 5 });
const evento = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'ev', type: 'event', xp: 100 });
const almoco = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'a', type: 'intervalo', xp: 0 });

describe('planDelta / describePlanDelta', () => {
  it('conta estudos e eventos, ignora pausas', () => {
    const antes = [estudo('09:00', '09:25'), pausa('09:25', '09:30'), estudo('09:30', '09:55')];
    const depois = [estudo('09:00', '09:25'), evento('09:30', '11:00')];
    expect(planDelta(antes, depois).studyDelta).toBe(0);
    expect(planDelta(antes, [estudo('09:00', '09:25')]).studyDelta).toBe(-1);
  });

  it('o fim é o último estudo/pausa/evento, não o almoço', () => {
    const antes = [estudo('09:00', '09:25'), almoco('13:00', '14:00')];
    const depois = [estudo('09:00', '09:25'), estudo('14:00', '14:25'), almoco('13:00', '14:00')];
    expect(planDelta(antes, depois).newEnd).toBe('14:25');
  });

  it('fim igual não vira frase', () => {
    const a = [estudo('09:00', '09:25')];
    expect(planDelta(a, [estudo('09:00', '09:25')]).newEnd).toBeNull();
  });

  it('monta a frase com singular, plural e horário', () => {
    expect(describePlanDelta({ studyDelta: 1, newEnd: null })).toBe('Plano reajustado: +1 estudo');
    expect(describePlanDelta({ studyDelta: -2, newEnd: '17:40' })).toBe('Plano reajustado: -2 estudos · termina às 17:40');
    expect(describePlanDelta({ studyDelta: 0, newEnd: '18:05' })).toBe('Plano reajustado: termina às 18:05');
  });

  it('sem mudança relevante, nada de toast', () => {
    expect(describePlanDelta({ studyDelta: 0, newEnd: null })).toBeNull();
  });

  it('o último estudo que mudou de tamanho (uma pausa empurrou o dia) entra na frase', () => {
    const antes = [estudo('09:00', '09:25'), estudo('17:00', '17:25')];
    const depois = [{ ...estudo('09:00', '09:32'), paused: 7 }, estudo('17:07', '17:30')];
    const d = planDelta(antes, depois);
    expect(d).toMatchObject({ studyDelta: 0, newEnd: '17:30', lastStudyMins: 23 });
    expect(planDeltaParts(d)).toEqual(['termina às 17:30', 'último estudo com 23 min']);
    expect(planDelta(antes, antes).lastStudyMins).toBeNull();
  });
});
