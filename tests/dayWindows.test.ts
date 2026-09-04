import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from '../src/domain/config';
import { configForDay, isDayOff, roundUpToStep, startNowWindows, validateDayWindows } from '../src/domain/dayWindows';
import { extendDayTo, extendWindowsTo } from '../src/domain/endOfDay';

const at = (hm: string) => new Date(`2026-09-02T${hm}:00`);
const w = (start: string, end: string) => ({ start, end });

describe('configForDay', () => {
  it('sem override, é a própria config', () => {
    expect(configForDay(DEFAULT_CFG, null)).toBe(DEFAULT_CFG);
    expect(configForDay(DEFAULT_CFG, undefined)).toBe(DEFAULT_CFG);
  });

  it('com override, as janelas são as do dia e start/end vêm delas', () => {
    const cfg = configForDay(DEFAULT_CFG, { studyWindows: [w('15:00', '20:00'), w('10:00', '12:00')] });
    expect(cfg.studyWindows).toEqual([w('15:00', '20:00'), w('10:00', '12:00')]);
    expect(cfg.start).toBe('10:00');
    expect(cfg.end).toBe('20:00');
    expect(cfg.pomo).toBe(DEFAULT_CFG.pomo); // o resto continua da rotina
  });

  it('dia livre = lista vazia', () => {
    expect(isDayOff({ studyWindows: [] })).toBe(true);
    expect(isDayOff({ studyWindows: [w('09:00', '12:00')] })).toBe(false);
    expect(isDayOff(null)).toBe(false);
    expect(isDayOff(undefined)).toBe(false);
  });
});

describe('validateDayWindows', () => {
  it('vazio, fim antes do início e sobreposição são recusados', () => {
    expect(validateDayWindows([])).toEqual({ ok: false, reason: 'empty' });
    expect(validateDayWindows([w('10:00', '10:00')])).toEqual({ ok: false, reason: 'invalid-window' });
    expect(validateDayWindows([w('10:00', '12:00'), w('11:30', '13:00')])).toEqual({ ok: false, reason: 'overlap' });
  });

  it('janelas válidas passam, em qualquer ordem; encostadas não se sobrepõem', () => {
    expect(validateDayWindows([w('15:00', '20:00'), w('09:00', '12:00')])).toEqual({ ok: true });
    expect(validateDayWindows([w('09:00', '12:00'), w('12:00', '13:00')])).toEqual({ ok: true });
  });
});

describe('startNowWindows — "começar agora"', () => {
  it('arredonda pro próximo múltiplo de 5 min (o próprio, se já for)', () => {
    expect(roundUpToStep(607)).toBe(610);
    expect(roundUpToStep(610)).toBe(610);
    expect(roundUpToStep(0)).toBe(0);
  });

  it('dentro da janela: ela passa a começar agora', () => {
    expect(startNowWindows([w('09:00', '18:00')], at('10:07'))).toEqual({ ok: true, windows: [w('10:10', '18:00')], start: '10:10' });
    expect(startNowWindows([w('09:00', '18:00')], at('10:10'))).toEqual({ ok: true, windows: [w('10:10', '18:00')], start: '10:10' });
  });

  it('antes da primeira janela: ela é puxada pra agora', () => {
    expect(startNowWindows([w('09:00', '18:00')], at('08:03'))).toEqual({ ok: true, windows: [w('08:05', '18:00')], start: '08:05' });
  });

  it('num gap entre janelas: a que já passou fica, a próxima começa agora', () => {
    const r = startNowWindows([w('15:00', '20:00'), w('09:00', '12:00')], at('13:20'));
    expect(r).toEqual({ ok: true, windows: [w('09:00', '12:00'), w('13:20', '20:00')], start: '13:20' });
  });

  it('depois de tudo, ou com só uns minutos sobrando na última: não sobrou nada', () => {
    expect(startNowWindows([w('09:00', '18:00')], at('18:00'))).toEqual({ ok: false, reason: 'nothing-left' });
    expect(startNowWindows([w('09:00', '18:00')], at('20:30'))).toEqual({ ok: false, reason: 'nothing-left' });
    expect(startNowWindows([w('09:00', '10:09')], at('10:07'))).toEqual({ ok: false, reason: 'nothing-left' }); // 10:10 já passa do fim
  });

  it('janela que acaba nos próximos minutos some e a seguinte começa agora', () => {
    const r = startNowWindows([w('09:00', '10:09'), w('15:00', '20:00')], at('10:07'));
    expect(r).toEqual({ ok: true, windows: [w('10:10', '20:00')], start: '10:10' });
  });

  it('janela inválida é ignorada; sem nenhuma válida não há o que começar', () => {
    expect(startNowWindows([w('12:00', '10:00')], at('09:00'))).toEqual({ ok: false, reason: 'nothing-left' });
  });
});

describe('prolongar', () => {
  it('extendWindowsTo estica a janela que começa mais tarde, sem mexer nas outras', () => {
    expect(extendWindowsTo([w('09:00', '12:00'), w('15:00', '18:00')], '19:30')).toEqual([w('09:00', '12:00'), w('15:00', '19:30')]);
    expect(extendWindowsTo([], '19:30')).toEqual([]);
  });

  it('extendDayTo continua mudando end e a última janela da rotina', () => {
    const cfg = extendDayTo(DEFAULT_CFG, '19:00');
    expect(cfg.end).toBe('19:00');
    expect(cfg.studyWindows).toEqual([w('09:00', '19:00')]);
  });
});
