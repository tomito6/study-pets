import { describe, expect, it } from 'vitest';
import {
  canToggleCheck,
  computePendingPetXP,
  isChecked,
  isDayClosed,
  isFutureDay,
} from '../src/domain/checks';
import type { ChecksByDate, StudyBlock } from '../src/domain/types';

const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';
const AMANHA = '2026-09-03';
const agora = new Date('2026-09-02T14:00:00');

const estudo = (time: string, endTime: string, xp = 50): StudyBlock => ({
  time,
  endTime,
  name: `📖 Estudo ${time}`,
  type: 'estudo',
  xp,
  session: 0,
});

describe('isChecked', () => {
  const checks: ChecksByDate = { [ONTEM]: { '09:00': { pet: 'cat', bonus: 0 } } };

  it('acha o check pelo horário do bloco', () => {
    expect(isChecked(checks, ONTEM, '09:00')).toBe(true);
  });

  it('é falso pra horário não marcado', () => {
    expect(isChecked(checks, ONTEM, '10:00')).toBe(false);
  });

  it('é falso pra dia sem nenhum check', () => {
    expect(isChecked(checks, HOJE, '09:00')).toBe(false);
  });

  it('reconhece check antigo salvo como `true`', () => {
    expect(isChecked({ [ONTEM]: { '09:00': true } }, ONTEM, '09:00')).toBe(true);
  });
});

describe('isDayClosed', () => {
  it('reconhece dia encerrado', () => {
    expect(isDayClosed({ [ONTEM]: true }, ONTEM)).toBe(true);
  });

  it('é falso pra dia aberto e pra closedDays ausente', () => {
    expect(isDayClosed({ [ONTEM]: true }, HOJE)).toBe(false);
    expect(isDayClosed(undefined, HOJE)).toBe(false);
  });
});

describe('isFutureDay', () => {
  it('só é verdade depois de hoje', () => {
    expect(isFutureDay(AMANHA, agora)).toBe(true);
    expect(isFutureDay(HOJE, agora)).toBe(false);
    expect(isFutureDay(ONTEM, agora)).toBe(false);
  });
});

describe('canToggleCheck — o que pode ser marcado', () => {
  it('permite marcar hoje e dias passados', () => {
    expect(canToggleCheck(HOJE, { closedDays: {}, now: agora })).toBe(true);
    expect(canToggleCheck(ONTEM, { closedDays: {}, now: agora })).toBe(true);
  });

  it('dia encerrado fica somente leitura', () => {
    expect(canToggleCheck(ONTEM, { closedDays: { [ONTEM]: true }, now: agora })).toBe(false);
  });

  it('hoje encerrado manualmente também fica somente leitura', () => {
    expect(canToggleCheck(HOJE, { closedDays: { [HOJE]: true }, now: agora })).toBe(false);
  });

  it('dia futuro não aceita check', () => {
    expect(canToggleCheck(AMANHA, { closedDays: {}, now: agora })).toBe(false);
  });

  it('funciona sem closedDays definido', () => {
    expect(canToggleCheck(HOJE, { now: agora })).toBe(true);
  });
});

describe('computePendingPetXP — XP dos pets em dias fechados', () => {
  const blocos = [estudo('09:00', '09:25', 50), estudo('10:00', '10:25', 50)];
  const getBlocks = () => blocos;
  const semDiaFechado = () => false;

  const entrada = (over: Partial<Parameters<typeof computePendingPetXP>[0]> = {}) => ({
    checks: { [ONTEM]: { '09:00': { pet: 'cat', bonus: 0 } } } as ChecksByDate,
    xpProcessedUntil: '2026-08-31',
    todayKey: HOJE,
    yesterdayKey: ONTEM,
    dayClosed: semDiaFechado,
    getBlocks,
    ...over,
  });

  it('credita o XP no pet que estava equipado no momento do check', () => {
    const r = computePendingPetXP(entrada())!;
    expect(r.gains).toEqual({ cat: 50 });
    expect(r.processedUntil).toBe(ONTEM);
  });

  it('soma os blocos marcados do dia', () => {
    const checks: ChecksByDate = {
      [ONTEM]: { '09:00': { pet: 'cat', bonus: 0 }, '10:00': { pet: 'cat', bonus: 0 } },
    };
    expect(computePendingPetXP(entrada({ checks }))!.gains).toEqual({ cat: 100 });
  });

  it('aplica o bônus salvo no check', () => {
    const checks: ChecksByDate = { [ONTEM]: { '09:00': { pet: 'owl', bonus: 0.05 } } };
    expect(computePendingPetXP(entrada({ checks }))!.gains).toEqual({ owl: 53 });
  });

  it('não credita ninguém quando o check foi feito sem pet equipado', () => {
    const checks: ChecksByDate = { [ONTEM]: { '09:00': { pet: null, bonus: 0 } } };
    expect(computePendingPetXP(entrada({ checks }))!.gains).toEqual({});
  });

  it('ignora check antigo salvo como `true` (não tem pet)', () => {
    const checks: ChecksByDate = { [ONTEM]: { '09:00': true } };
    expect(computePendingPetXP(entrada({ checks }))!.gains).toEqual({});
  });

  it('não credita pausa', () => {
    const pausa: StudyBlock = { time: '09:00', endTime: '09:05', name: '🧘 Pausa', type: 'pausa', xp: 5 };
    const r = computePendingPetXP(entrada({ getBlocks: () => [pausa] }))!;
    expect(r.gains).toEqual({});
  });

  it('credita evento marcado, igual a estudo', () => {
    const evento: StudyBlock = { time: '09:00', endTime: '10:30', name: '📅 Aula', type: 'event', xp: 180 };
    const r = computePendingPetXP(entrada({ getBlocks: () => [evento] }))!;
    expect(r.gains).toEqual({ cat: 180 });
  });
});

describe('computePendingPetXP — não dá pra duplicar recompensa', () => {
  const blocos = [estudo('09:00', '09:25', 50)];
  const base = {
    checks: { [ONTEM]: { '09:00': { pet: 'cat', bonus: 0 } } } as ChecksByDate,
    todayKey: HOJE,
    yesterdayKey: ONTEM,
    dayClosed: () => false,
    getBlocks: () => blocos,
  };

  it('rodar de novo com o mesmo processedUntil não credita nada', () => {
    const primeira = computePendingPetXP({ ...base, xpProcessedUntil: '2026-08-31' })!;
    expect(primeira.gains).toEqual({ cat: 50 });

    // Segunda execução, já com o processedUntil avançado pela primeira.
    const segunda = computePendingPetXP({ ...base, xpProcessedUntil: primeira.processedUntil });
    expect(segunda).toBeNull();
  });

  it('devolve null quando já processou até ontem', () => {
    expect(computePendingPetXP({ ...base, xpProcessedUntil: ONTEM })).toBeNull();
  });

  it('não olha dias que ainda não fecharam', () => {
    const checks: ChecksByDate = { [HOJE]: { '09:00': { pet: 'cat', bonus: 0 } } };
    const r = computePendingPetXP({ ...base, checks, xpProcessedUntil: ONTEM });
    expect(r).toBeNull();
  });
});

describe('computePendingPetXP — primeira execução e dia encerrado à mão', () => {
  const blocos = [estudo('09:00', '09:25', 50)];

  it('na primeira vez (processedUntil null) zera o XP e não aplica o passado', () => {
    const r = computePendingPetXP({
      checks: { '2026-08-20': { '09:00': { pet: 'cat', bonus: 0 } } },
      xpProcessedUntil: null,
      todayKey: HOJE,
      yesterdayKey: ONTEM,
      dayClosed: () => false,
      getBlocks: () => blocos,
    })!;
    expect(r.resetXp).toBe(true);
    expect(r.gains).toEqual({});
    expect(r.processedUntil).toBe(ONTEM);
  });

  it('inclui hoje quando o dia foi encerrado manualmente', () => {
    const r = computePendingPetXP({
      checks: { [HOJE]: { '09:00': { pet: 'cat', bonus: 0 } } },
      xpProcessedUntil: ONTEM,
      todayKey: HOJE,
      yesterdayKey: ONTEM,
      dayClosed: (k) => k === HOJE,
      getBlocks: () => blocos,
    })!;
    expect(r.gains).toEqual({ cat: 50 });
    expect(r.processedUntil).toBe(HOJE);
  });

  it('encerrar hoje e reprocessar não credita de novo', () => {
    const entrada = {
      checks: { [HOJE]: { '09:00': { pet: 'cat', bonus: 0 } } } as ChecksByDate,
      todayKey: HOJE,
      yesterdayKey: ONTEM,
      dayClosed: (k: string) => k === HOJE,
      getBlocks: () => blocos,
    };
    const primeira = computePendingPetXP({ ...entrada, xpProcessedUntil: ONTEM })!;
    expect(computePendingPetXP({ ...entrada, xpProcessedUntil: primeira.processedUntil })).toBeNull();
  });
});
