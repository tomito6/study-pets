// A janela `whole` (domain/types.ts, `RunRhythm`): a janela de ROTINA que rodou até o fim
// que a rotina deu a ela, congelada como fato pelo corte (`stopDayAt`) — mas gerada como
// a rotina que foi. Nasceu de um caso medido em 2026-11-26: carimbar como corrida uma
// janela inteira ligava os desligamentos da corrida no rabo dela, e no dia 09:00–18:00
// sem refeição o mini-estudo das 17:40 (40 XP) virava pausa longa (20 XP) depois de um
// "▶ Estudar agora" ou de um "■ Parar por aqui" à noite.

import { describe, expect, it } from 'vitest';
import { normalizeStudyWindows } from '../src/domain/configHistory';
import { DEFAULT_CFG } from '../src/domain/config';
import { stopDayAt } from '../src/domain/dayWindows';
import { generateBlocks } from '../src/domain/planner';
import type { LiveRhythm, PlannerConfig, StudyEvent, StudyWindow } from '../src/domain/types';

const em = (hm: string) => new Date(`2026-09-02T${hm}:00`);
const RITMO: LiveRhythm = { pomo: 25, shortBreak: 5, longBreak: 20 };

const cfgCom = (janelas: StudyWindow[], r: LiveRhythm = RITMO): PlannerConfig => ({
  ...DEFAULT_CFG,
  ...r,
  studyWindows: janelas,
  start: janelas[0]!.start,
  end: janelas[janelas.length - 1]!.end,
});

describe('stopDayAt — a janela que o corte nem alcança sai inteira', () => {
  it('rotina que já acabou: `whole`, com o ritmo do dia e o fim que tinha', () => {
    const r = stopDayAt([{ start: '09:00', end: '18:00' }], em('21:10'), RITMO);
    expect(r).toEqual({ ok: true, windows: [{ start: '09:00', end: '18:00', live: { ...RITMO, whole: true } }] });
  });

  it('o corte exatamente no fim da janela também é "acabou"', () => {
    const r = stopDayAt([{ start: '09:00', end: '18:00' }], em('18:00'), RITMO);
    expect(r.ok && r.windows[0]!.live).toEqual({ ...RITMO, whole: true });
  });

  it('a janela que o corte atravessa continua sendo corrida, sem a marca', () => {
    const r = stopDayAt(
      [
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '20:00' },
      ],
      em('16:07'),
      RITMO,
    );
    expect(r).toEqual({
      ok: true,
      windows: [
        { start: '09:00', end: '12:00', live: { ...RITMO, whole: true } },
        { start: '15:00', end: '16:07', live: RITMO },
      ],
    });
  });

  it('janela que já é fato guarda o que tinha: corrida não vira inteira, inteira não perde a marca', () => {
    const corrida: StudyWindow = { start: '09:00', end: '10:12', live: { pomo: 50, shortBreak: 10, longBreak: 30 } };
    const inteira: StudyWindow = { start: '11:00', end: '12:00', live: { ...RITMO, whole: true } };
    const r = stopDayAt([corrida, inteira], em('21:00'), RITMO);
    expect(r).toEqual({ ok: true, windows: [corrida, inteira] });
  });
});

describe('o gerador trata a janela inteira como rotina', () => {
  const JANELAS: StudyWindow[][] = [
    [{ start: '09:00', end: '18:00' }],
    [{ start: '08:30', end: '12:10' }],
    [
      { start: '09:00', end: '12:00' },
      { start: '15:00', end: '20:00' },
    ],
    [{ start: '19:00', end: '22:35' }],
    [{ start: '07:15', end: '11:50' }, { start: '13:05', end: '17:40' }],
  ];
  const RITMOS: LiveRhythm[] = [
    RITMO,
    { pomo: 50, shortBreak: 10, longBreak: 30 },
    { pomo: 30, shortBreak: 5, longBreak: 15 },
    { pomo: 45, shortBreak: 15, longBreak: 15 },
    { pomo: 13, shortBreak: 2, longBreak: 7 },
  ];
  const EVENTOS: StudyEvent[][] = [
    [],
    [{ name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false }],
    [{ name: 'Aula', start: '10:05', end: '11:35' }],
    [
      { name: 'Aula', start: '10:05', end: '11:35' },
      { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false },
      { name: 'Yoga', start: '17:00', end: '18:00', countsAsStudy: false },
    ],
  ];

  it('byte a byte igual à rotina — janelas × ritmos × eventos', () => {
    let planos = 0;
    for (const janelas of JANELAS)
      for (const r of RITMOS)
        for (const eventos of EVENTOS) {
          const rotina = generateBlocks(cfgCom(janelas, r), eventos);
          const inteiras = janelas.map((w) => ({ ...w, live: { ...r, whole: true as const } }));
          // A config de fora leva OUTRO ritmo: o da janela é que tem de valer.
          const congelado = generateBlocks(cfgCom(inteiras, { pomo: 90, shortBreak: 1, longBreak: 2 }), eventos);
          expect(JSON.stringify(congelado)).toBe(JSON.stringify(rotina));
          planos++;
        }
    expect(planos).toBe(100);
  });

  it('e a corrida que nasce depois dela não mexe em nada do que veio antes', () => {
    for (const janelas of JANELAS)
      for (const r of RITMOS)
        for (const eventos of EVENTOS) {
          const rotina = generateBlocks(cfgCom(janelas, r), eventos);
          const inteiras = janelas.map((w) => ({ ...w, live: { ...r, whole: true as const } }));
          const comCorrida = generateBlocks(cfgCom([...inteiras, { start: '22:40', end: '23:05', live: RITMO }], r), eventos);
          const antes = comCorrida.filter((b) => b.time < '22:40');
          // O ciclo da corrida é outro, mas nada do dia vivido muda de horário, tipo, nome ou XP.
          expect(JSON.stringify(antes)).toBe(JSON.stringify(rotina));
          expect(comCorrida.filter((b) => b.time >= '22:40').map((b) => `${b.time}–${b.endTime} ${b.type}`)).toEqual(['22:40–23:05 estudo']);
        }
  });

  it('o caso que motivou: 09:00–18:00 sem refeição — o mini das 17:40 continua estudo', () => {
    const rotina = generateBlocks(cfgCom([{ start: '09:00', end: '18:00' }]), []);
    expect(rotina[rotina.length - 1]).toMatchObject({ time: '17:40', endTime: '18:00', type: 'estudo', xp: 40 });
    // Como corrida (o que o corte fazia antes), o mesmo trecho vira pausa:
    const comoCorrida = generateBlocks(cfgCom([{ start: '09:00', end: '18:00', live: RITMO }]), []);
    expect(comoCorrida[comoCorrida.length - 1]).toMatchObject({ time: '17:40', endTime: '18:00', type: 'pausa' });
    // Inteira, não:
    const inteira = generateBlocks(cfgCom([{ start: '09:00', end: '18:00', live: { ...RITMO, whole: true } }]), []);
    expect(JSON.stringify(inteira)).toBe(JSON.stringify(rotina));
  });

  it('bloco de janela inteira não é bloco de corrida (`live` fica de fora)', () => {
    const blocos = generateBlocks(cfgCom([{ start: '09:00', end: '12:00', live: { ...RITMO, whole: true } }]), []);
    expect(blocos.some((b) => b.live)).toBe(false);
  });
});

describe('a marca sobrevive ao documento', () => {
  it('normalizeStudyWindows guarda `whole: true` e ignora qualquer outro valor', () => {
    expect(
      normalizeStudyWindows([
        { start: '09:00', end: '18:00', live: { ...RITMO, whole: true } },
        { start: '19:00', end: '19:25', live: { ...RITMO, whole: 'sim' } },
        { start: '20:00', end: '20:25', live: RITMO },
      ]),
    ).toEqual([
      { start: '09:00', end: '18:00', live: { ...RITMO, whole: true } },
      { start: '19:00', end: '19:25', live: RITMO },
      { start: '20:00', end: '20:25', live: RITMO },
    ]);
  });
});
