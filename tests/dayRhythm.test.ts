// O ritmo só de um dia (src/domain/dayRhythm.ts) e a troca de ritmo no meio do dia dentro
// do gerador (`rhythmChanges`, src/domain/planner.ts). Puro.
//
// A promessa que este arquivo cobra: mudar o ritmo às 14h não mexe na manhã. Tudo que
// COMEÇOU antes da troca sai igual ao plano sem ela — é o que mantém os checks batendo.

import { describe, expect, it } from 'vitest';
import {
  changeInEffect,
  isValidRhythm,
  normalizeDayRhythms,
  parseRhythmDraft,
  rhythmChangeFrom,
  rhythmInEffect,
  wholeDayRhythm,
  withDayRhythm,
} from '../src/domain/dayRhythm';
import { DEFAULT_CFG } from '../src/domain/config';
import { generateBlocks } from '../src/domain/planner';
import { minsToTime, timeToMins } from '../src/domain/time';
import type { PauseRecord, PlannerConfig, StudyBlock, StudyEvent, StudyWindow } from '../src/domain/types';

const R25 = { pomo: 25, shortBreak: 5, longBreak: 20 };
const R50 = { pomo: 50, shortBreak: 10, longBreak: 20 };
const R90 = { pomo: 90, shortBreak: 20, longBreak: 30 };
const cfg = (windows: StudyWindow[], r = R25): PlannerConfig => ({
  studyWindows: windows,
  start: windows[0]!.start,
  end: windows[windows.length - 1]!.end,
  ...r,
});
const DIA = [{ start: '09:00', end: '18:00' }];
const ALMOCO: StudyEvent = { name: '🍽️ Almoço', start: '13:00', end: '14:00', countsAsStudy: false };
const linha = (b: StudyBlock) => `${b.time}–${b.endTime} ${b.type}`;
const antesDe = (bs: StudyBlock[], t: string) => bs.filter((b) => b.time < t);

describe('gerador: o ritmo muda no meio do dia', () => {
  it('sem troca nenhuma (ou com a lista vazia) o plano é o de sempre', () => {
    const base = generateBlocks(cfg(DIA), [ALMOCO]);
    expect(generateBlocks({ ...cfg(DIA), rhythmChanges: [] }, [ALMOCO])).toEqual(base);
  });

  it('às 14:00 passa a 50 · 10: a manhã fica igual, a tarde nasce no ritmo novo', () => {
    const sem = generateBlocks(cfg(DIA), [ALMOCO]);
    const com = generateBlocks({ ...cfg(DIA), rhythmChanges: [{ at: '14:00', ...R50 }] }, [ALMOCO]);
    expect(antesDe(com, '14:00')).toEqual(antesDe(sem, '14:00'));
    const tarde = com.filter((b) => b.time >= '14:00').map(linha);
    expect(tarde.slice(0, 4)).toEqual(['14:00–14:50 estudo', '14:50–15:00 pausa', '15:00–15:50 estudo', '15:50–16:00 pausa']);
  });

  it('o estudo em andamento termina como estava, e a pausa que o segue ainda é a dele', () => {
    // 10:07: o Estudo 3 (10:00–10:25) está rodando. O ritmo novo entra depois da pausa das 10:25.
    const com = generateBlocks({ ...cfg(DIA), rhythmChanges: [{ at: '10:07', ...R50 }] });
    expect(com.slice(0, 8).map(linha)).toEqual([
      '09:00–09:25 estudo',
      '09:25–09:30 pausa',
      '09:30–09:55 estudo',
      '09:55–10:00 pausa',
      '10:00–10:25 estudo',
      '10:25–10:30 pausa', // a pausa curta de 5, do ritmo de antes
      '10:30–11:20 estudo', // o primeiro de 50
      '11:20–11:40 pausa', // é o quarto pomo do ciclo: a contagem continua, e a pausa é a longa
    ]);
  });

  it('a sobra colada no estudo de antes ainda é dele: o estudo de 35 min não volta a ter 25', () => {
    // Aula às 10:05: sem troca, o estudo das 09:30 estica até lá (25 + a sobra de 10).
    const aula: StudyEvent = { name: 'Aula', start: '10:05', end: '11:50', countsAsStudy: true };
    const sem = generateBlocks(cfg(DIA), [aula]);
    expect(sem.find((b) => b.time === '09:30')).toMatchObject({ endTime: '10:05', xp: 70 });
    // A troca cai exatamente no minuto em que o pomo "terminaria" (09:55) — e no meio da sobra.
    for (const at of ['09:55', '10:00']) {
      const com = generateBlocks({ ...cfg(DIA), rhythmChanges: [{ at, ...R50 }] }, [aula]);
      expect(com.find((b) => b.time === '09:30')).toMatchObject({ endTime: '10:05', xp: 70 });
      // Depois da aula, o ritmo novo.
      expect(com.find((b) => b.time === '11:50')).toMatchObject({ type: 'estudo', endTime: '12:40' });
    }
  });

  it('onde não cabe nem meio pomo novo, o trecho segue no ritmo de antes — nada de tempo morto nem pausa apagada', () => {
    // 17:20, no meio da pausa das 17:15: faltam 40 min pro fim da janela, e meio pomo de 90 são 45.
    const sem = generateBlocks(cfg(DIA));
    const com = generateBlocks({ ...cfg(DIA), rhythmChanges: [{ at: '17:20', ...R90 }] });
    expect(com).toEqual(sem);
    expect(com[com.length - 1]).toMatchObject({ type: 'estudo', endTime: '18:00' });
  });

  it('um estudo de antes nunca é esticado por uma decisão do ritmo novo', () => {
    // Janela curta (09:00–12:00) e um ritmo novo grande (90): em qualquer minuto da troca, a sobra
    // que o ritmo novo não sabe usar nunca vira minuto a mais num estudo que começou antes dela.
    const manha = [{ start: '09:00', end: '12:00' }];
    const sem = generateBlocks(cfg(manha));
    for (let t = timeToMins('09:00'); t <= timeToMins('12:00'); t += 5) {
      const com = generateBlocks({ ...cfg(manha), rhythmChanges: [{ at: minsToTime(t), ...R90 }] });
      expect(antesDe(com, minsToTime(t))).toEqual(antesDe(sem, minsToTime(t)));
    }
  });

  it('varredura: janelas × eventos × pausas × horário da troca — o que começou antes não se mexe, e nada se sobrepõe', () => {
    const janelas: StudyWindow[][] = [DIA, [{ start: '09:00', end: '12:00' }, { start: '15:00', end: '20:00' }], [{ start: '08:10', end: '17:35' }]];
    const eventos: StudyEvent[][] = [
      [],
      [ALMOCO],
      [{ name: 'Aula', start: '10:05', end: '11:50', countsAsStudy: true }, ALMOCO, { name: 'Yoga', start: '17:00', end: '18:00', countsAsStudy: false }],
      [{ name: 'Reunião', start: '10:25', end: '10:55', countsAsStudy: false }],
    ];
    const pausas: PauseRecord[][] = [[], [{ at: '09:10', secs: 420 }, { at: '15:20', secs: 61 }]];
    let n = 0;
    for (const w of janelas) for (const e of eventos) for (const p of pausas) for (const [de, para] of [[R25, R50], [R50, R25], [R25, R90]] as const) {
      const sem = generateBlocks(cfg(w, de), e, p);
      for (let t = 8 * 60; t <= 20 * 60; t += 13) {
        const at = minsToTime(t);
        const com = generateBlocks({ ...cfg(w, de), rhythmChanges: [{ at, ...para }] }, e, p);
        expect(antesDe(com, at), `${JSON.stringify(w)} ${de.pomo}→${para.pomo} às ${at}`).toEqual(antesDe(sem, at));
        expect(new Set(com.map((b) => b.time)).size).toBe(com.length); // a chave do check continua única
        for (let i = 1; i < com.length; i++) expect(com[i]!.time >= com[i - 1]!.endTime).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(3000);
  });

  it('duas trocas no mesmo dia valem cada uma do seu minuto em diante', () => {
    const com = generateBlocks({ ...cfg(DIA), rhythmChanges: [{ at: '14:00', ...R50 }, { at: '16:00', ...R25 }] }, [ALMOCO]);
    expect(com.find((b) => b.time === '14:00')).toMatchObject({ endTime: '14:50' });
    const depois = com.filter((b) => b.type === 'estudo' && b.time >= '16:00');
    expect(depois[0]).toMatchObject({ time: '16:00', endTime: '16:25' });
  });

  it('dentro de uma corrida a base é o ritmo da janela, e a troca entra por cima dele', () => {
    const corrida = [{ start: '09:00', end: '11:00', live: { ...R25 } }];
    const sem = generateBlocks(cfg(corrida, R90));
    const com = generateBlocks({ ...cfg(corrida, R90), rhythmChanges: [{ at: '10:00', ...R50 }] });
    expect(antesDe(com, '10:00')).toEqual(antesDe(sem, '10:00'));
    expect(com.find((b) => b.time === '10:00')).toMatchObject({ type: 'estudo', endTime: '10:50' });
  });
});

describe('o ritmo do dia como dado', () => {
  const rotina = { ...DEFAULT_CFG };

  it('sem entrada nenhuma a config do dia é a própria rotina', () => {
    expect(withDayRhythm(rotina, undefined)).toBe(rotina);
    expect(withDayRhythm(rotina, [])).toBe(rotina);
    expect(rhythmInEffect(R25, null)).toEqual(R25);
  });

  it('a entrada do dia inteiro troca a base; a troca com horário vira `rhythmChanges`', () => {
    const c = withDayRhythm(rotina, [{ ...R50 }, { ...R90, from: '14:00' }]);
    expect(c).toMatchObject({ ...R50, rhythmChanges: [{ at: '14:00', ...R90 }] });
    expect(c.studyWindows).toBe(rotina.studyWindows);
    expect(rotina.pomo).toBe(25); // a rotina não foi tocada
  });

  it('o ritmo em vigor: a troca mais recente até o minuto; sem minuto, a última do dia', () => {
    const entradas = [{ ...R50 }, { ...R90, from: '14:00' }, { ...R25, from: '16:00' }];
    expect(rhythmInEffect(R25, entradas, timeToMins('09:00'))).toEqual(R50);
    expect(rhythmInEffect(R25, entradas, timeToMins('14:00'))).toEqual(R90);
    expect(rhythmInEffect(R25, entradas)).toEqual(R25);
    expect(changeInEffect(entradas, timeToMins('13:59'))).toBeNull();
    expect(changeInEffect(entradas, timeToMins('15:00'))).toEqual(R90);
  });

  it('o dia inteiro igual ao da rotina não é ritmo próprio: o dia volta a seguir a rotina', () => {
    expect(wholeDayRhythm(R25, R25)).toBeNull();
    expect(wholeDayRhythm(R50, R25)).toEqual([R50]);
  });

  it('trocar a partir de um minuto guarda o que veio antes e substitui o que nunca chegou a valer', () => {
    const a = rhythmChangeFrom([{ ...R50 }], '14:00', R90);
    expect(a).toEqual([{ ...R50 }, { ...R90, from: '14:00' }]);
    // De novo no mesmo minuto: a troca anterior nunca valeu pra bloco nenhum.
    expect(rhythmChangeFrom(a, '14:00', R25)).toEqual([{ ...R50 }, { ...R25, from: '14:00' }]);
    expect(rhythmChangeFrom(null, '10:07', R50)).toEqual([{ ...R50, from: '10:07' }]);
  });

  it('o rascunho só vira ritmo com os três campos inteiros, de 1 a 600', () => {
    expect(parseRhythmDraft({ pomo: '50', shortBreak: '10', longBreak: '20' })).toEqual(R50);
    expect(parseRhythmDraft({ pomo: '', shortBreak: '10', longBreak: '20' })).toBeNull();
    expect(parseRhythmDraft({ pomo: '0', shortBreak: '10', longBreak: '20' })).toBeNull();
    expect(parseRhythmDraft({ pomo: '25.5', shortBreak: '10', longBreak: '20' })).toBeNull();
    expect(parseRhythmDraft({ pomo: '601', shortBreak: '10', longBreak: '20' })).toBeNull();
    expect(isValidRhythm({ pomo: 600, shortBreak: 1, longBreak: 1 })).toBe(true);
  });

  it('a leitura do documento descarta lixo, guarda uma entrada de dia inteiro e ordena as trocas', () => {
    expect(normalizeDayRhythms(undefined)).toEqual({});
    expect(normalizeDayRhythms('x')).toEqual({});
    const lido = normalizeDayRhythms({
      '2026-09-02': [{ ...R90, from: '16:00' }, { ...R50 }, { pomo: 10, shortBreak: 2, longBreak: 5 }, { ...R25, from: '14:00' }, { pomo: -1, shortBreak: 5, longBreak: 5 }, 'x', { ...R25, from: 'tarde' }],
      'não-é-dia': [{ ...R50 }],
      '2026-09-03': [],
      '2026-09-04': 'x',
    });
    expect(lido).toEqual({ '2026-09-02': [{ ...R50 }, { ...R25, from: '14:00' }, { ...R90, from: '16:00' }] });
  });
});
