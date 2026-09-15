// O ciclo como unidade que fecha: quantos estudos ele tem, quanto já vale, e se
// acabou de ficar completo. Puro — sem estado, sem DOM.
//
// Ciclo é a leva de pomodoros entre duas pausas longas — o nome clássico do
// Pomodoro (4 pomos + uma pausa longa); o gerador numera em `block.cycle`, e um
// evento herda o número da leva em que cai. Chamava-se "sessão" até 2026-09-11,
// nome que o app já usava pra outra coisa: "Cancelar sessão" é a conta inteira.
//
// O ciclo é o marco que faltava entre o check de um bloco e o fim do dia: quem
// estuda das 9 às 18 colhia feedback de bloco a bloco e só via o agregado — XP
// creditado, pet subindo — nove horas depois.
//
// Fechar um ciclo **não credita nada**: o XP continua entrando só quando o dia
// fecha, que é o que impede marcar e desmarcar pra repagar (ver `computeStats`).
// O que ele dá é reconhecimento. Por isso também não trava check nenhum — quem
// marcou tarde não perde o ciclo, ele só fica completo depois.

import { xpFromCheck } from './progression';
import { blockMins, dk, timeToMins } from './time';
import type { CheckRecord, DateKey, StudyBlock, TimeString } from './types';

/** Estudo e evento fecham o ciclo; pausa e bloqueio só ocupam o espaço (igual aos grupos). */
export const countsForCycle = (b: StudyBlock): boolean => b.type === 'estudo' || b.type === 'event';

/**
 * Quantos blocos um ciclo precisa ter pra valer uma comemoração. Uma linha só
 * não é uma leva — o check dela já tem o próprio feedback (anel + "+X XP"), e uma
 * faixa por cima disso seria barulho. Acontece de verdade: um evento entre duas
 * janelas nasce sozinho num ciclo só dele.
 */
export const MIN_BLOCKS_TO_CHEER = 2;

export interface CycleSummary {
  cycle: number;
  /** Estudos/eventos marcados e no total. */
  done: number;
  total: number;
  /** Minutos cumpridos (duração real, já sem o tempo pausado). */
  minsDone: number;
  /** XP e moedas do que foi marcado — o XP já com o bônus de skill gravado no check. */
  xp: number;
  coins: number;
  /** Todos os membros marcados (e há pelo menos um). */
  complete: boolean;
}

/** O que o ciclo `cycle` tem e quanto dele já foi cumprido. */
export function cycleSummary(
  blocks: StudyBlock[],
  cycle: number,
  dayChecks: Record<TimeString, CheckRecord> | undefined,
): CycleSummary {
  const s: CycleSummary = { cycle, done: 0, total: 0, minsDone: 0, xp: 0, coins: 0, complete: false };
  for (const b of blocks) {
    if (b.cycle !== cycle || !countsForCycle(b)) continue;
    s.total++;
    const check = dayChecks?.[b.time];
    if (!check) continue;
    const dur = blockMins(b);
    s.done++;
    s.minsDone += dur;
    s.xp += xpFromCheck(b, check);
    s.coins += dur; // 1 moeda por minuto, estudo e evento (ver coinsForBlock)
  }
  s.complete = s.total > 0 && s.done === s.total;
  return s;
}

/**
 * O ciclo deste bloco está completo e vale ser comemorado? Devolve o resumo, ou
 * `null`.
 *
 * A pergunta é sobre o ciclo inteiro, não sobre "este bloco foi o último" — quem
 * marca fora de ordem fecha a leva no penúltimo horário, e o app precisa
 * reconhecer isso do mesmo jeito. A diferença pro `completesGroup` das skills
 * (que é posicional de propósito) é que aqui não há XP em jogo: o pior caso de
 * desmarcar e remarcar é ver a animação de novo.
 */
export function closedCycleOf(
  blocks: StudyBlock[],
  block: StudyBlock,
  dayChecks: Record<TimeString, CheckRecord> | undefined,
): CycleSummary | null {
  if (block.cycle === undefined || !countsForCycle(block)) return null;
  const s = cycleSummary(blocks, block.cycle, dayChecks);
  if (!s.complete || s.total < MIN_BLOCKS_TO_CHEER) return null;
  return s;
}

/**
 * O ciclo inteiro já ficou pra trás? Em dia passado, sempre; em dia futuro, nunca; hoje,
 * quando o último bloco dele (pausa longa inclusive, e o evento que caiu na leva) já
 * terminou. É o que deixa o divisor virar um botão de recolher (ver BlockList): o que
 * já passou pode encolher; o que está acontecendo, e o que vem, fica aberto.
 */
export function cycleHasPassed(blocks: StudyBlock[], cycle: number, dateKey: DateKey, now: Date): boolean {
  const today = dk(now);
  if (dateKey !== today) return dateKey < today;
  const agora = now.getHours() * 60 + now.getMinutes();
  const membros = blocks.filter((b) => b.cycle === cycle);
  return membros.length > 0 && membros.every((b) => timeToMins(b.endTime) <= agora);
}
