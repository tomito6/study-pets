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

  // A única diferença aceita em relação ao gerador antigo (corrigida em 2026-09-03, era o item 1
  // do PENDENCIAS.md): quando um pomo terminava exatamente no minuto em que um bloqueio (evento
  // ou almoço) começava, o antigo não enxergava o bloqueio. Ou emitia a pausa por cima dele, ou,
  // perto do fim da janela, deixava o bloqueio fora do plano. Nos casos em que isso não acontece
  // a saída tem que ser idêntica; nos outros, o novo só pode tirar essa pausa e devolver o bloqueio.
  type Bloco = { time: string; endTime: string; type: string; name: string; xp: number; mini?: boolean; session: number };
  const BLOQUEIOS = ['event', 'intervalo', 'almoco'];
  // Sem `session`: devolver um bloqueio que o antigo perdia abre uma sessão a mais depois dele.
  const chave = (b: Bloco) => `${b.time}-${b.endTime} ${b.type} ${b.name} ${b.xp}${b.mini ? ' mini' : ''}`;
  const so = (bs: Bloco[], tipos: string[]) => bs.filter((b) => tipos.includes(b.type)).map(chave);
  const inicioDeBloqueio = (cfg: PlannerConfig, eventos: StudyEvent[]) =>
    new Set([...eventos.map((e) => e.start), ...(cfg.hasLunch ? [cfg.lunch] : [])]);

  // O "tropeço" do antigo: um pomo termina exatamente onde um bloqueio começa, e o antigo
  // (a) emite a pausa por cima do bloqueio, ou (b) perde o bloqueio de vez — nesse caso, com
  // uma pausa longa maior que um evento curto, o evento sumia e a manhã seguia como se ele
  // não existisse. O novo mostra o bloqueio e recomeça depois dele, como faz com qualquer
  // evento; por isso, a partir do tropeço, os horários podem mudar.
  function tropecoDoAntigo(antigo: Bloco[], inicios: Set<string>): string | null {
    const bloqueios = so(antigo, BLOQUEIOS);
    for (let i = 0; i < antigo.length; i++) {
      const b = antigo[i]!;
      if (b.type !== 'estudo' || !inicios.has(b.endTime)) continue;
      const proximo = antigo[i + 1];
      const pausaPorCima = proximo?.type === 'pausa' && proximo.time === b.endTime;
      const bloqueioPerdido = !bloqueios.some((k) => k.startsWith(`${b.endTime}-`));
      if (pausaPorCima || bloqueioPerdido) return b.endTime;
    }
    return null;
  }

  it('só diverge do antigo onde ele tropeçava; até lá é idêntico, e o bloqueio volta pro plano', () => {
    const problemas: string[] = [];
    let divergentes = 0;
    for (const { nome, cfg, eventos } of casos) {
      const antigo = legacyGenerateBlocks(cfg, eventos) as Bloco[];
      const novo = generateBlocks(cfg, eventos) as Bloco[];
      if (JSON.stringify(antigo) === JSON.stringify(novo)) continue;
      divergentes++;
      const inicios = inicioDeBloqueio(cfg, eventos);
      const tropeco = tropecoDoAntigo(antigo, inicios);
      if (!tropeco) {
        problemas.push(`${nome}: divergiu sem o antigo ter tropeçado`);
        continue;
      }

      const ate = (bs: Bloco[]) => bs.filter((b) => b.time < tropeco).map(chave);
      if (JSON.stringify(ate(antigo)) !== JSON.stringify(ate(novo))) problemas.push(`${nome}: diferente antes do tropeço das ${tropeco}`);

      const bloqN = so(novo, BLOQUEIOS);
      if (!bloqN.some((k) => k.startsWith(`${tropeco}-`))) problemas.push(`${nome}: o bloqueio das ${tropeco} não voltou`);
      for (const k of so(antigo, BLOQUEIOS)) if (!bloqN.includes(k)) problemas.push(`${nome}: perdeu o bloqueio ${k}`);
      if (novo.some((b) => b.type === 'pausa' && b.time === tropeco)) problemas.push(`${nome}: ainda há pausa às ${tropeco}`);
    }
    expect(problemas).toEqual([]);
    // A matriz foi feita pra bater nessa borda (eventos em hora redonda com todo tipo de pomo),
    // então o tropeço aparece em ~1 a cada 6 casos aqui. Na vida real é raro.
    expect(divergentes).toBeGreaterThan(0);
  });

  it('o gerador novo nunca emite pausa por cima do bloco seguinte', () => {
    const invasoes: string[] = [];
    for (const { nome, cfg, eventos } of casos) {
      const blocks = generateBlocks(cfg, eventos);
      blocks.forEach((b, i) => {
        const next = blocks[i + 1];
        if (b.type === 'pausa' && next && next.time < b.endTime) invasoes.push(`${nome}: ${b.time}-${b.endTime} pausa invade ${next.time}`);
      });
    }
    expect(invasoes).toEqual([]);
  });
});
