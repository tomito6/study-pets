import { describe, expect, it } from 'vitest';
import { describePlanDelta, planDelta } from '../src/domain/planDelta';
import type { StudyBlock } from '../src/domain/types';

const estudo = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'e', type: 'estudo', xp: 50 });
const pausa = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'p', type: 'pausa', xp: 5 });
const evento = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'ev', type: 'event', xp: 100 });
const almoco = (time: string, endTime: string): StudyBlock => ({ time, endTime, name: 'a', type: 'almoco', xp: 0 });

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
});
