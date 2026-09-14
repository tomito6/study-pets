import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from '../src/domain/config';
import { configForDay, isDayOff, routineAfter, stopDayAt, validateDayWindows } from '../src/domain/dayWindows';
import { modeForDay } from '../src/domain/dayMode';
import { extendDayTo, extendWindowsTo } from '../src/domain/endOfDay';

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

// ─────────────────────────────────────────────────────────────────────────────
// "■ Parar por aqui": o dia acaba onde a pessoa parou, e os minutos que passaram
// valem. A prova de que o passado não se mexe está em tests/planner.test.ts e na
// varredura de 2146 cortes reais — aqui é a forma das janelas.
// ─────────────────────────────────────────────────────────────────────────────
const R = { pomo: 25, shortBreak: 5, longBreak: 15 };
const em = (hm: string) => new Date(`2026-09-02T${hm}:00`);

describe('stopDayAt — parar no meio do dia', () => {
  it('apara a janela no minuto da parada e a marca como corrida', () => {
    const r = stopDayAt([{ start: '09:00', end: '18:00' }], em('10:12'), R);
    expect(r).toEqual({ ok: true, windows: [{ start: '09:00', end: '10:12', live: R }] });
  });

  it('a janela que ainda não começou some — ela não aconteceu', () => {
    const r = stopDayAt([{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }], em('10:12'), R);
    expect(r).toEqual({ ok: true, windows: [{ start: '09:00', end: '10:12', live: R }] });
  });

  it('a janela da manhã que já fechou fica inteira, e a da tarde é aparada', () => {
    const r = stopDayAt([{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }], em('15:02'), R);
    expect(r).toEqual({
      ok: true,
      windows: [{ start: '09:00', end: '12:00', live: R }, { start: '14:00', end: '15:02', live: R }],
    });
  });

  it('parar antes de qualquer janela não deixa registro — e NÃO vira dia livre', () => {
    // Lista vazia seria lida como `isDayOff`, que é outra coisa: "hoje eu descanso".
    expect(stopDayAt([{ start: '09:00', end: '18:00' }], em('08:30'), R)).toEqual({ ok: false, reason: 'nothing-lived' });
  });

  it('o ritmo que rodou vai junto, congelado no fato', () => {
    const outro = { pomo: 50, shortBreak: 10, longBreak: 20 };
    const r = stopDayAt([{ start: '09:00', end: '18:00' }], em('10:12'), outro);
    expect(r.ok && r.windows[0]!.live).toEqual(outro);
  });
});

describe('routineAfter — "Voltar ao padrão" não desfaz o que foi vivido', () => {
  const corrida = [{ start: '09:00', end: '10:12', live: R }];
  const rotina = [{ start: '09:00', end: '18:00' }];

  it('a corrida fica intacta e a rotina volta a partir de agora', () => {
    const r = routineAfter(corrida, rotina, em('13:30'));
    expect(r).toEqual({ ok: true, windows: [{ start: '09:00', end: '10:12', live: R }, { start: '13:30', end: '18:00' }] });
  });

  it('sem isto, o bloco parcial seria curado: a rotina NUNCA volta pra trás', () => {
    // Voltar às 10:20 não pode reabrir 10:00–10:25 e transformar os 12 min vividos em 25.
    const r = routineAfter(corrida, rotina, em('10:20'));
    expect(r.ok && r.windows[1]).toEqual({ start: '10:20', end: '18:00' });
  });

  it('a rotina que já acabou não volta', () => {
    const r = routineAfter(corrida, [{ start: '09:00', end: '12:00' }], em('13:30'));
    expect(r).toEqual({ ok: true, windows: corrida });
  });

  it('voltar antes do fim da corrida não sobrepõe: a rotina começa onde ela acabou', () => {
    const r = routineAfter(corrida, rotina, em('09:40'));
    expect(r.ok && r.windows[1]!.start).toBe('10:12');
  });
});

describe('modeForDay — o padrão e a trava do `since`', () => {
  const HOJE = '2026-09-13';
  const ONTEM = '2026-09-12';
  const AMANHA = '2026-09-14';

  it('sem padrão nenhum, tudo é rotina — como o app sempre funcionou', () => {
    expect(modeForDay(HOJE, {}, null)).toBe('rotina');
    expect(modeForDay(ONTEM, {}, null)).toBe('rotina');
  });

  it('o padrão vale de `since` em diante, e NUNCA pra trás', () => {
    const padrao = { mode: 'live' as const, since: HOJE };
    expect(modeForDay(ONTEM, {}, padrao)).toBe('rotina'); // o passado não se mexe
    expect(modeForDay(HOJE, {}, padrao)).toBe('live');
    expect(modeForDay(AMANHA, {}, padrao)).toBe('live');
  });

  it('sem isso, virar a chave apagaria o histórico da tela', () => {
    // Um dia de setembro sem janela editada continua devolvendo o plano da rotina — é o
    // que mantém XP, nível, sequência e heatmap de pé depois de um clique.
    expect(modeForDay('2026-09-01', {}, { mode: 'live', since: HOJE })).toBe('rotina');
  });

  it('a escolha de um dia vence o padrão, nos dois sentidos', () => {
    expect(modeForDay(HOJE, { [HOJE]: 'rotina' }, { mode: 'live', since: HOJE })).toBe('rotina');
    expect(modeForDay(HOJE, { [HOJE]: 'live' }, { mode: 'rotina', since: HOJE })).toBe('live');
  });
});
