// Dias de descanso: fim de semana pausado (`skipWeekends`) e dia declarado livre. O que
// muda quando o usuário abre janelas num sábado mesmo assim (dia bônus): o plano volta só
// nele, o dia conta, e a sequência nunca fica pior do que se ele tivesse descansado.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDayWindows, effectiveWindows, isRestDayKey, restKindKey, setDayOff, setDayWindows } from '../src/application/dayWindows';
import { allDays, blocksForDay, calcStreaksNow, clearBlockCache, computeStatsNow, rebuildWeeks } from '../src/application/plan';
import { isBonusDay, restDayKind, windowsForDay } from '../src/domain/dayWindows';
import { emptyPersistedState } from '../src/domain/persistence';
import { computeStats } from '../src/domain/stats';
import type { StatsInput } from '../src/domain/stats';
import { isWeekendKey } from '../src/domain/time';
import type { StudyBlock } from '../src/domain/types';
import { derived, state } from '../src/store/store';

const w = (start: string, end: string) => ({ start, end });

describe('domínio: o que é dia de descanso', () => {
  const cfg = { studyWindows: [w('09:00', '18:00')], skipWeekends: true };
  const janelas = { studyWindows: [w('10:00', '12:00')] };

  it('fim de semana pausado descansa; janelas abertas nele desfazem a pausa só daquele dia', () => {
    expect(restDayKind({ skipWeekends: true, isWeekend: true, override: null })).toBe('weekend');
    expect(restDayKind({ skipWeekends: true, isWeekend: true, override: janelas })).toBeNull();
    expect(restDayKind({ skipWeekends: false, isWeekend: true, override: null })).toBeNull();
    expect(restDayKind({ skipWeekends: true, isWeekend: false, override: null })).toBeNull();
  });

  it('dia declarado livre descansa em qualquer dia da semana', () => {
    expect(restDayKind({ skipWeekends: false, isWeekend: false, override: { studyWindows: [] } })).toBe('off');
    expect(restDayKind({ skipWeekends: true, isWeekend: true, override: { studyWindows: [] } })).toBe('off');
  });

  it('dia bônus = fim de semana pausado com janelas abertas, e só ele', () => {
    expect(isBonusDay({ skipWeekends: true, isWeekend: true, override: janelas })).toBe(true);
    expect(isBonusDay({ skipWeekends: true, isWeekend: true, override: null })).toBe(false);
    expect(isBonusDay({ skipWeekends: true, isWeekend: true, override: { studyWindows: [] } })).toBe(false);
    expect(isBonusDay({ skipWeekends: false, isWeekend: true, override: janelas })).toBe(false);
    expect(isBonusDay({ skipWeekends: true, isWeekend: false, override: janelas })).toBe(false);
  });

  it('as janelas do dia: as editadas, nenhuma no fim de semana pausado, senão as da rotina', () => {
    expect(windowsForDay(cfg, janelas, true)).toEqual(janelas.studyWindows);
    expect(windowsForDay(cfg, null, true)).toEqual([]);
    expect(windowsForDay(cfg, null, false)).toEqual(cfg.studyWindows);
    expect(windowsForDay({ ...cfg, skipWeekends: false }, null, true)).toEqual(cfg.studyWindows);
  });

  it('isWeekendKey: sábado e domingo', () => {
    expect(isWeekendKey('2026-09-05')).toBe(true);
    expect(isWeekendKey('2026-09-06')).toBe(true);
    expect(isWeekendKey('2026-09-04')).toBe(false);
    expect(isWeekendKey('2026-09-07')).toBe(false);
  });
});

describe('domínio: dia bônus na sequência do bônus diário de moedas', () => {
  const dia = (key: string, bonus = false) => ({ key, date: new Date(`${key}T12:00:00`), weekIdx: 0, bonus });
  const estudo: StudyBlock = { time: '09:00', endTime: '10:00', name: '📖 Estudo', type: 'estudo', xp: 120, cycle: 0 };
  const feito = { '09:00': { pet: null, bonus: 0 } };
  const entrada = (days: StatsInput['days'], checks: StatsInput['checks']): StatsInput => ({
    days,
    getBlocks: () => [estudo],
    checks,
    dayClosed: () => false,
    todayKey: '2026-09-09',
    currentDayKey: '2026-09-09',
    currentWeekIdx: 0,
    dailyStudyMin: 60,
  });
  const QUI = '2026-09-03';
  const SEX = '2026-09-04';
  const SAB = '2026-09-05';
  const SEG = '2026-09-07';

  it('sem meta não zera a sequência; com meta, é um dia a mais', () => {
    const descansou = computeStats(entrada([dia(QUI), dia(SEX), dia(SEG)], { [QUI]: feito, [SEX]: feito, [SEG]: feito }));
    const sabSemMeta = computeStats(entrada([dia(QUI), dia(SEX), dia(SAB, true), dia(SEG)], { [QUI]: feito, [SEX]: feito, [SEG]: feito }));
    expect(sabSemMeta.coins).toBe(descansou.coins); // igual a ter descansado
    const sabComMeta = computeStats(
      entrada([dia(QUI), dia(SEX), dia(SAB, true), dia(SEG)], { [QUI]: feito, [SEX]: feito, [SAB]: feito, [SEG]: feito }),
    );
    expect(sabComMeta.coins).toBeGreaterThan(descansou.coins); // as moedas do sábado, e a segunda vira o 4º dia seguido
    // Dia comum sem meta zera a sequência, como sempre.
    const diaComumPerdido = computeStats(entrada([dia(QUI), dia(SEX), dia(SAB), dia(SEG)], { [QUI]: feito, [SEX]: feito, [SEG]: feito }));
    expect(diaComumPerdido.coins).toBeLessThan(descansou.coins);
  });
});

describe('aplicação: fim de semana pausado', () => {
  const AGORA = new Date('2026-09-02T10:07:00'); // quarta
  const HOJE = '2026-09-02';
  const SAB = '2026-09-05';
  const DOM = '2026-09-06';
  const SAB_PASSADO = '2026-08-29';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
    state.config.skipWeekends = true;
    derived.weeks = [];
    clearBlockCache();
    rebuildWeeks(AGORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem janelas do dia, o sábado descansa: sem blocos, sem janelas, fora dos dias que contam', () => {
    expect(restKindKey(SAB)).toBe('weekend');
    expect(isRestDayKey(SAB)).toBe(true);
    expect(blocksForDay(SAB)).toEqual([]);
    expect(effectiveWindows(SAB)).toEqual([]);
    expect(allDays().some((d) => d.key === SAB)).toBe(false);
    expect(restKindKey(HOJE)).toBeNull();
    expect(isRestDayKey(HOJE)).toBe(false);
  });

  it('abrir janelas no sábado traz o plano de volta só nele; o domingo e o sábado seguinte continuam livres', () => {
    expect(setDayWindows(SAB, [w('10:00', '12:00')], AGORA)).toEqual({ ok: true });
    expect(restKindKey(SAB)).toBeNull();
    expect(blocksForDay(SAB)[0]).toMatchObject({ time: '10:00', type: 'estudo' });
    expect(effectiveWindows(SAB)).toEqual([w('10:00', '12:00')]);
    expect(blocksForDay(DOM)).toEqual([]);
    expect(blocksForDay('2026-09-12')).toEqual([]);
    expect(allDays().find((d) => d.key === SAB)).toMatchObject({ bonus: true });
    expect(allDays().find((d) => d.key === HOJE)).toMatchObject({ bonus: false });
    // 4 pomos de 25 nas 2h + os 5 min que sobravam, que desde 2026-09-10 esticam o último
    expect(computeStatsNow(AGORA).dayStudyPlanned[SAB]).toBe(105);
  });

  it('"Restaurar rotina" e "Dia livre" devolvem a folga', () => {
    setDayWindows(SAB, [w('10:00', '12:00')], AGORA);
    expect(clearDayWindows(SAB, AGORA)).toEqual({ ok: true });
    expect(restKindKey(SAB)).toBe('weekend');
    expect(blocksForDay(SAB)).toEqual([]);
    setDayWindows(SAB, [w('10:00', '12:00')], AGORA);
    expect(setDayOff(SAB, AGORA)).toEqual({ ok: true });
    expect(restKindKey(SAB)).toBe('off');
    expect(blocksForDay(SAB)).toEqual([]);
  });

  it('com skipWeekends desligado, janelas no sábado são só um dia editado — não é bônus', () => {
    state.config.skipWeekends = false;
    clearBlockCache();
    setDayWindows(SAB, [w('10:00', '12:00')], AGORA);
    expect(allDays().find((d) => d.key === SAB)).toMatchObject({ bonus: false });
    expect(restKindKey(DOM)).toBeNull();
  });

  it('o sábado aberto entra nas estatísticas como um dia fechado qualquer', () => {
    state.windowOverrides[SAB_PASSADO] = { studyWindows: [w('10:00', '12:00')] };
    state.checks[SAB_PASSADO] = { '10:00': { pet: null, bonus: 0 } };
    clearBlockCache();
    rebuildWeeks(AGORA);
    const stats = computeStatsNow(AGORA);
    expect(stats.totalXP).toBe(50);
    expect(stats.dayStudyDoneMins[SAB_PASSADO]).toBe(25);
    expect(stats.dayStudyPlanned[SAB_PASSADO]).toBe(105); // idem: a janela de 2h fecha inteira
  });

  it('dia bônus na sequência: conta se bateu a meta, e não quebra se não bateu', () => {
    // Sábado 29/08 com janelas abertas; sexta, segunda, terça e hoje com a meta batida.
    state.windowOverrides[SAB_PASSADO] = { studyWindows: [w('10:00', '12:00')] };
    clearBlockCache();
    rebuildWeeks(AGORA);
    const base = { '2026-08-28': 60, '2026-08-31': 60, '2026-09-01': 60, [HOJE]: 60 };
    expect(calcStreaksNow(base, AGORA)).toEqual({ cur: 4, best: 4 }); // sábado sem estudo: como se tivesse descansado
    expect(calcStreaksNow({ ...base, [SAB_PASSADO]: 30 }, AGORA)).toEqual({ cur: 4, best: 4 }); // estudou pouco: idem
    expect(calcStreaksNow({ ...base, [SAB_PASSADO]: 60 }, AGORA)).toEqual({ cur: 5, best: 5 }); // bateu: um dia a mais
    // Sem as janelas, o sábado nem entra — mesmo com minutos registrados.
    delete state.windowOverrides[SAB_PASSADO];
    clearBlockCache();
    expect(calcStreaksNow({ ...base, [SAB_PASSADO]: 60 }, AGORA)).toEqual({ cur: 4, best: 4 });
  });
});
