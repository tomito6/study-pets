// Teste de equivalência: o gerador extraído pro domínio produz exatamente o mesmo
// resultado que o gerador antigo, numa matriz de configurações e eventos.
//
// `_legacy-planner.mjs` é uma cópia literal do código pré-migração. Este arquivo
// existe pra provar que a Fase 3 não mudou comportamento; quando o legado sair do
// repo, este teste sai junto.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — módulo JS legado sem tipos, de propósito.
import { generateBlocks as legacyGenerateBlocks } from './_legacy-planner.mjs';
import { generateBlocks } from '../src/domain/planner';
import type { PlannerConfig, StudyEvent } from '../src/domain/types';

const pomos = [20, 25, 30, 50];
const shorts = [3, 5, 10];
const longs = [15, 20, 30];

const janelas: Array<{ start: string; end: string }[]> = [
  [{ start: '09:00', end: '18:00' }],
  [{ start: '08:00', end: '12:00' }],
  [{ start: '09:00', end: '12:00' }, { start: '15:00', end: '20:00' }],
  [{ start: '07:30', end: '11:15' }, { start: '13:45', end: '17:20' }],
  [{ start: '15:00', end: '18:00' }, { start: '09:00', end: '12:00' }], // fora de ordem
  [{ start: '18:00', end: '09:00' }], // inválida
  [],
];

const conjuntosDeEventos: StudyEvent[][] = [
  [],
  [{ name: 'Aula', start: '10:00', end: '11:30' }],
  [{ name: 'Aula', start: '10:00', end: '11:30', countsAsStudy: false }],
  [
    { name: 'A', start: '10:00', end: '11:30' },
    { name: 'B', start: '11:00', end: '12:00' },
  ],
  [{ name: 'Curto', start: '09:45', end: '10:00' }],
  [{ name: 'Cedo', start: '07:00', end: '08:00' }],
  [{ name: 'Tarde da noite', start: '21:00', end: '22:00' }],
  [
    { name: 'Serie', start: '14:00', end: '15:00', _seriesId: 'ser_x' },
    { name: 'Outro', start: '16:00', end: '16:20', countsAsStudy: false },
  ],
];

const almocos: Array<{ hasLunch: boolean; lunch: string; lunchDur: number }> = [
  { hasLunch: true, lunch: '13:00', lunchDur: 60 },
  { hasLunch: true, lunch: '12:00', lunchDur: 30 },
  { hasLunch: true, lunch: '11:45', lunchDur: 90 },
  { hasLunch: false, lunch: '13:00', lunchDur: 60 },
];

function todosOsCasos(): Array<{ nome: string; cfg: PlannerConfig; eventos: StudyEvent[] }> {
  const casos: Array<{ nome: string; cfg: PlannerConfig; eventos: StudyEvent[] }> = [];
  for (const pomo of pomos) {
    for (const shortBreak of shorts) {
      for (const longBreak of longs) {
        for (let ji = 0; ji < janelas.length; ji++) {
          for (let ai = 0; ai < almocos.length; ai++) {
            for (let ei = 0; ei < conjuntosDeEventos.length; ei++) {
              const almoco = almocos[ai]!;
              const studyWindows = janelas[ji]!;
              const cfg: PlannerConfig = {
                studyWindows,
                start: studyWindows[0]?.start ?? '09:00',
                end: studyWindows[studyWindows.length - 1]?.end ?? '18:00',
                pomo,
                shortBreak,
                longBreak,
                ...almoco,
              };
              casos.push({
                nome: `pomo=${pomo} short=${shortBreak} long=${longBreak} janelas=${ji} almoco=${ai} eventos=${ei}`,
                cfg,
                eventos: conjuntosDeEventos[ei]!,
              });
            }
          }
        }
      }
    }
  }
  return casos;
}

describe('equivalência com o gerador antigo', () => {
  const casos = todosOsCasos();

  it('cobre uma matriz grande de configurações', () => {
    expect(casos.length).toBeGreaterThan(4000);
  });

  it('produz saída idêntica em todos os casos', () => {
    const divergentes: string[] = [];
    for (const { nome, cfg, eventos } of casos) {
      const antigo = JSON.stringify(legacyGenerateBlocks(cfg, eventos));
      const novo = JSON.stringify(generateBlocks(cfg, eventos));
      if (antigo !== novo) divergentes.push(nome);
    }
    expect(divergentes).toEqual([]);
  });
});
