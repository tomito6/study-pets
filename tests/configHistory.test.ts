// A história da config (src/domain/configHistory.ts): mudar o ritmo do pomodoro ou as
// janelas vale de hoje em diante (ou de amanhã, se hoje já tem fato), e nunca pra trás.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CFG } from '../src/domain/config';
import {
  configAt,
  generatorPart,
  normalizeConfigHistory,
  normalizeStudyWindows,
  recordConfigChange,
  rhythmOf,
  sameGeneratorConfig,
} from '../src/domain/configHistory';
import type { ConfigHistory } from '../src/domain/configHistory';
import { generateBlocks } from '../src/domain/planner';
import { blockMins } from '../src/domain/time';
import type { UserConfig } from '../src/domain/types';

const w = (start: string, end: string) => ({ start, end });
const cfg = (patch: Partial<UserConfig> = {}): UserConfig => ({ ...DEFAULT_CFG, periodStart: '2026-08-01', ...patch });
const HOJE = '2026-09-02';
const ONTEM = '2026-09-01';
const AMANHA = '2026-09-03';

describe('configAt — a config que valia num dia', () => {
  const antiga = { until: ONTEM, studyWindows: [w('10:00', '16:00')], pomo: 25, shortBreak: 5, longBreak: 20 };
  const atual = cfg({ pomo: 50, shortBreak: 10, longBreak: 30, studyWindows: [w('09:00', '18:00')] });

  it('sem história, é a própria config', () => {
    expect(configAt(atual, [], HOJE)).toBe(atual);
  });

  it('dia coberto por uma versão antiga sai com o ritmo E as janelas dela, e start/end derivados', () => {
    const c = configAt(atual, [antiga], ONTEM);
    expect(rhythmOf(c)).toEqual({ pomo: 25, shortBreak: 5, longBreak: 20 });
    expect(c.studyWindows).toEqual([w('10:00', '16:00')]);
    expect(c.start).toBe('10:00');
    expect(c.end).toBe('16:00');
    expect(c.dailyStudyMin).toBe(atual.dailyStudyMin); // o que o gerador não lê continua da config atual
  });

  it('o `until` é inclusivo: o dia seguinte já é a config atual', () => {
    expect(configAt(atual, [antiga], HOJE)).toBe(atual);
    expect(configAt(atual, [antiga], '2026-08-15').pomo).toBe(25);
  });

  it('com várias versões, vale a mais antiga que ainda cobre o dia', () => {
    const h: ConfigHistory = [
      { until: '2026-08-10', studyWindows: [w('09:00', '18:00')], pomo: 20, shortBreak: 5, longBreak: 20 },
      { until: ONTEM, studyWindows: [w('09:00', '18:00')], pomo: 25, shortBreak: 5, longBreak: 20 },
    ];
    expect(configAt(atual, h, '2026-08-05').pomo).toBe(20);
    expect(configAt(atual, h, '2026-08-10').pomo).toBe(20);
    expect(configAt(atual, h, '2026-08-11').pomo).toBe(25);
    expect(configAt(atual, h, HOJE).pomo).toBe(50);
  });

  it('o passado sai byte a byte igual ao plano de antes da mudança', () => {
    const antes = generateBlocks(cfg({ pomo: 25 }));
    const depois = generateBlocks(configAt(atual, [{ until: ONTEM, ...generatorPart(cfg({ pomo: 25 })) }], ONTEM));
    expect(depois).toEqual(antes);
    expect(depois.filter((b) => b.type === 'estudo').reduce((s, b) => s + blockMins(b), 0)).toBeGreaterThan(0);
  });
});

describe('recordConfigChange — a partir de quando a mudança vale', () => {
  const de = cfg({ pomo: 25 });
  const para = cfg({ pomo: 50 });
  const base = { today: HOJE, periodStart: '2026-08-01' };

  it('mudança que não toca o gerador (meta, período, hardcore) não guarda nada', () => {
    expect(recordConfigChange([], de, cfg({ pomo: 25, dailyStudyMin: 90, periodEnd: '2026-12-31' }), { ...base, todayHasFacts: true })).toBeNull();
    expect(sameGeneratorConfig(de, cfg({ pomo: 25, hardcore: { enabled: true } }))).toBe(true);
  });

  it('hoje sem fato nenhum: vale de hoje, e ontem pra trás fica com a versão antiga', () => {
    const r = recordConfigChange([], de, para, { ...base, todayHasFacts: false });
    expect(r?.appliesFrom).toBe(HOJE);
    expect(r?.history).toEqual([{ until: ONTEM, ...generatorPart(de) }]);
  });

  it('hoje já com fato: hoje fica como está, e a mudança vale de amanhã', () => {
    const r = recordConfigChange([], de, para, { ...base, todayHasFacts: true });
    expect(r?.appliesFrom).toBe(AMANHA);
    expect(r?.history).toEqual([{ until: HOJE, ...generatorPart(de) }]);
    expect(configAt(para, r!.history, HOJE).pomo).toBe(25);
    expect(configAt(para, r!.history, AMANHA).pomo).toBe(50);
  });

  it('a janela de estudo também é guardada — mudá-la reescreveria o passado do mesmo jeito', () => {
    const r = recordConfigChange([], cfg({ studyWindows: [w('09:00', '18:00')] }), cfg({ studyWindows: [w('10:00', '12:00')] }), { ...base, todayHasFacts: true });
    expect(r?.history[0]?.studyWindows).toEqual([w('09:00', '18:00')]);
  });

  it('mudar duas vezes no mesmo dia guarda a versão que de fato gerou aqueles dias (a primeira), e joga fora a do meio', () => {
    const r1 = recordConfigChange([], de, cfg({ pomo: 30 }), { ...base, todayHasFacts: true });
    const r2 = recordConfigChange(r1!.history, cfg({ pomo: 30 }), para, { ...base, todayHasFacts: true });
    expect(r2?.history).toEqual(r1?.history);
    expect(configAt(para, r2!.history, HOJE).pomo).toBe(25);
    expect(r2?.appliesFrom).toBe(AMANHA);
  });

  it('mudou de manhã sem fato, marcou um bloco, mudou de novo à tarde: ontem tem a primeira versão, hoje a segunda', () => {
    const r1 = recordConfigChange([], de, cfg({ pomo: 30 }), { ...base, todayHasFacts: false });
    const r2 = recordConfigChange(r1!.history, cfg({ pomo: 30 }), para, { ...base, todayHasFacts: true });
    expect(r2?.history.map((s) => [s.until, s.pomo])).toEqual([[ONTEM, 25], [HOJE, 30]]);
    expect(configAt(para, r2!.history, ONTEM).pomo).toBe(25);
    expect(configAt(para, r2!.history, HOJE).pomo).toBe(30);
    expect(configAt(para, r2!.history, AMANHA).pomo).toBe(50);
  });

  it('antes do início da conta nenhum dia conta: conta criada hoje, sem fato, não guarda nada', () => {
    const r = recordConfigChange([], de, para, { today: HOJE, todayHasFacts: false, periodStart: HOJE });
    expect(r).toEqual({ history: [], appliesFrom: HOJE });
  });

  it('a história sai ordenada por `until`, venha a mudança na ordem que vier', () => {
    const h: ConfigHistory = [{ until: '2026-09-10', ...generatorPart(de) }];
    const r = recordConfigChange(h, cfg({ pomo: 30 }), para, { ...base, todayHasFacts: true });
    expect(r?.history.map((s) => s.until)).toEqual([HOJE, '2026-09-10']);
  });

  it('a versão guardada é uma cópia: mexer na config depois não muda a história', () => {
    const origem = cfg({ studyWindows: [w('09:00', '18:00')] });
    const r = recordConfigChange([], origem, para, { ...base, todayHasFacts: true });
    origem.studyWindows[0]!.end = '20:00';
    expect(r?.history[0]?.studyWindows).toEqual([w('09:00', '18:00')]);
  });
});

describe('leitura do documento', () => {
  it('normalizeConfigHistory: lixo vira vazio; entrada sem data ou sem ritmo positivo cai; ordena; until repetido, a primeira vence', () => {
    expect(normalizeConfigHistory(undefined)).toEqual([]);
    expect(normalizeConfigHistory('x')).toEqual([]);
    expect(normalizeConfigHistory({ until: HOJE })).toEqual([]);
    const h = normalizeConfigHistory([
      { until: '2026-09-10', studyWindows: [w('09:00', '18:00')], pomo: 30, shortBreak: 5, longBreak: 20 },
      { until: 'ontem', pomo: 25, shortBreak: 5, longBreak: 20 },
      { until: ONTEM, studyWindows: [w('09:00', '18:00')], pomo: 0, shortBreak: 5, longBreak: 20 },
      { until: ONTEM, studyWindows: [w('09:00', '12:00'), 'lixo', { start: 1 }], pomo: 25, shortBreak: 5, longBreak: 20 },
      { until: ONTEM, studyWindows: [], pomo: 99, shortBreak: 9, longBreak: 9 },
      'lixo',
    ]);
    expect(h).toEqual([
      { until: ONTEM, studyWindows: [w('09:00', '12:00')], pomo: 25, shortBreak: 5, longBreak: 20 },
      { until: '2026-09-10', studyWindows: [w('09:00', '18:00')], pomo: 30, shortBreak: 5, longBreak: 20 },
    ]);
  });

  it('normalizeStudyWindows: guarda o `live` da corrida só com os três números positivos', () => {
    expect(normalizeStudyWindows([{ start: '09:00', end: '10:12', live: { pomo: 25, shortBreak: 5, longBreak: 20 } }])).toEqual([
      { start: '09:00', end: '10:12', live: { pomo: 25, shortBreak: 5, longBreak: 20 } },
    ]);
    expect(normalizeStudyWindows([{ start: '09:00', end: '10:12', live: { pomo: 25, shortBreak: 0, longBreak: 20 } }])).toEqual([w('09:00', '10:12')]);
    expect(normalizeStudyWindows([{ start: '09:00', end: '10:12', live: 'x' }])).toEqual([w('09:00', '10:12')]);
    expect(normalizeStudyWindows(null)).toEqual([]);
  });
});
