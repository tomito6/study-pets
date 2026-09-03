import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from '../src/domain/config';
import {
  defaultDraft,
  deriveStartEnd,
  draftFromConfig,
  fitStudySuggestions,
  formatCompact,
  formatWindowDuration,
  nextWindowAfter,
  normalizeConfig,
  sanitizeDailyStudyMin,
  summarizeConfig,
} from '../src/domain/settings';

describe('rascunho ↔ config', () => {
  it('config vira rascunho com números em string e janelas copiadas', () => {
    const d = draftFromConfig({ ...DEFAULT_CFG, pomo: 50, periodEnd: '2026-12-31' });
    expect(d.pomo).toBe('50');
    expect(d.periodEnd).toBe('2026-12-31');
    expect(d.studyWindows).toEqual([{ start: '09:00', end: '18:00' }]);
    expect(d.studyWindows).not.toBe(DEFAULT_CFG.studyWindows);
  });

  it('config antiga sem studyWindows vira uma janela start→end', () => {
    const d = draftFromConfig({ ...DEFAULT_CFG, studyWindows: [], start: '08:00', end: '12:00' });
    expect(d.studyWindows).toEqual([{ start: '08:00', end: '12:00' }]);
  });

  it('normalizar preserva o periodStart passado e deriva start/end das janelas válidas', () => {
    const cfg = normalizeConfig(
      { ...defaultDraft(), studyWindows: [{ start: '15:00', end: '18:00' }, { start: '09:00', end: '12:00' }, { start: '20:00', end: '19:00' }] },
      '2026-09-01',
    );
    expect(cfg.periodStart).toBe('2026-09-01');
    expect(cfg.studyWindows).toHaveLength(2); // a inválida cai fora
    expect(cfg.start).toBe('09:00');
    expect(cfg.end).toBe('18:00');
    expect(cfg.periodEnd).toBeNull();
  });

  it('campo numérico vazio vira NaN (quem salva decide)', () => {
    expect(Number.isNaN(normalizeConfig({ ...defaultDraft(), pomo: '' }, null).pomo)).toBe(true);
  });

  it('meta diária é grampeada em 15–240 e cai em 60 se não for número', () => {
    expect(sanitizeDailyStudyMin(5)).toBe(15);
    expect(sanitizeDailyStudyMin(999)).toBe(240);
    expect(sanitizeDailyStudyMin(NaN)).toBe(60);
    expect(sanitizeDailyStudyMin(90)).toBe(90);
  });

  it('"↺ Padrão" volta tudo ao default, sem data de fim', () => {
    const d = defaultDraft();
    expect(d.pomo).toBe('25');
    expect(d.periodEnd).toBe('');
    expect(d.studyWindows).toEqual([{ start: '09:00', end: '18:00' }]);
  });
});

describe('janelas', () => {
  it('formata a duração ao lado da janela', () => {
    expect(formatWindowDuration(90)).toBe('1h 30min');
    expect(formatWindowDuration(120)).toBe('2h');
    expect(formatWindowDuration(45)).toBe('45min');
  });

  it('a janela nova começa onde a última terminou, com 3h (até 23:59)', () => {
    expect(nextWindowAfter([{ start: '09:00', end: '12:00' }])).toEqual({ start: '12:00', end: '15:00' });
    expect(nextWindowAfter([{ start: '09:00', end: '22:00' }])).toEqual({ start: '22:00', end: '23:59' });
    expect(nextWindowAfter([])).toEqual({ start: '09:00', end: '12:00' });
  });

  it('deriva start/end com defaults quando não há janela válida', () => {
    expect(deriveStartEnd([])).toEqual({ start: '09:00', end: '18:00' });
  });
});

describe('resumo do dia', () => {
  it('avisa quando falta número, quando não há janela e quando não gera bloco', () => {
    expect(summarizeConfig({ ...DEFAULT_CFG, pomo: NaN })).toEqual({ kind: 'warn', reason: 'incomplete' });
    expect(summarizeConfig({ ...DEFAULT_CFG, studyWindows: [{ start: '12:00', end: '09:00' }] })).toEqual({ kind: 'warn', reason: 'no-windows' });
    expect(summarizeConfig({ ...DEFAULT_CFG, studyWindows: [{ start: '13:00', end: '13:10' }], hasLunch: false, pomo: 25 })).toEqual({ kind: 'warn', reason: 'no-blocks' });
  });

  it('conta pomos, minutos, XP e diz onde o dia termina', () => {
    const s = summarizeConfig({ ...DEFAULT_CFG, hasLunch: false, studyWindows: [{ start: '09:00', end: '10:00' }], start: '09:00', end: '10:00' });
    expect(s.kind).toBe('ok');
    if (s.kind !== 'ok') return;
    expect(s.pomos).toBe(2);
    expect(s.studyMins).toBe(50);
    expect(s.pauseMins).toBe(5);
    expect(s.totalXP).toBe(105);
    expect(s.actualEnd).toBe('09:55');
    expect(s.diffMins).toBe(-5); // para 5min antes do fim da janela
  });

  it('formato compacto dos tiles', () => {
    expect(formatCompact(0)).toBe('0min');
    expect(formatCompact(45)).toBe('45min');
    expect(formatCompact(120)).toBe('2h');
    expect(formatCompact(90)).toBe('1h30');
  });
});

describe('encaixar estudo', () => {
  const base = { ...DEFAULT_CFG, hasLunch: false, studyWindows: [{ start: '09:00', end: '12:00' }], start: '09:00', end: '12:00' };

  it('devolve até 3 sugestões, a melhor primeiro, dentro da flexibilidade', () => {
    const top = fitStudySuggestions(base, [], { pomo: 25, short: 5, long: 20, flex: 10 });
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.score).toBeGreaterThanOrEqual(top[i]!.score);
    for (const s of top) {
      expect(s.pomo).toBeGreaterThanOrEqual(15);
      expect(s.pomo).toBeLessThanOrEqual(35);
      expect(s.short).toBeGreaterThanOrEqual(3);
      expect(s.short).toBeLessThanOrEqual(15);
    }
  });

  it('respeita os eventos do dia', () => {
    const semEvento = fitStudySuggestions(base, [], { pomo: 25, short: 5, long: 20, flex: 5 })[0]!;
    const comEvento = fitStudySuggestions(base, [{ name: 'Aula', start: '10:00', end: '11:00', countsAsStudy: false }], { pomo: 25, short: 5, long: 20, flex: 5 })[0]!;
    expect(comEvento.studyTotal).toBeLessThan(semEvento.studyTotal);
  });
});
