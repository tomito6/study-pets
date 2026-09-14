// A conta da folha "Parar por aqui?" (features/timer/StopHereModal.tsx, `minutesSoFar`) com
// uma pausa ABERTA: ela ainda não é registro, e a folha ignorava — pausado há 20 min com 5
// estudados dizia "25 min · +50 XP", e o bloco saía com 5. Item 8 da revisão de 2026-09-14.
import { describe, expect, it } from 'vitest';
import { minutesSoFar } from '../src/features/timer/StopHereModal';

const bloco = { time: '10:00', paused: undefined as number | undefined };
const em = (hms: string) => new Date(`2026-09-02T${hms}`);

describe('minutesSoFar', () => {
  it('rodando: do início até agora, menos as pausas já registradas', () => {
    expect(minutesSoFar(bloco, em('10:12:00'))).toBe(12);
    expect(minutesSoFar({ time: '10:00', paused: 7 }, em('10:32:00'))).toBe(25);
  });

  it('pausado: desconta também a pausa aberta, em minutos cheios pra cima', () => {
    // pausou às 10:05, são 10:25: 5 estudados, 20 parados
    expect(minutesSoFar(bloco, em('10:25:00'), em('10:05:00').getTime())).toBe(5);
    // 10 s parados contam como 1 min — a régua do plano
    expect(minutesSoFar(bloco, em('10:12:10'), em('10:12:00').getTime())).toBe(11);
  });

  it('nunca negativo', () => {
    expect(minutesSoFar(bloco, em('09:59:00'))).toBe(0);
    expect(minutesSoFar(bloco, em('10:03:00'), em('10:00:30').getTime())).toBe(0);
  });
});
