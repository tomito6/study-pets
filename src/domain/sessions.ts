// A sessão como unidade que fecha: quantos estudos ela tem, quanto já vale, e se
// acabou de ficar completa. Puro — sem estado, sem DOM.
//
// Sessão aqui é a leva de pomodoros entre duas pausas longas (o gerador numera
// em `block.session`; um evento herda o número da leva em que cai). Ela é o
// marco que faltava entre o check de um bloco e o fim do dia: quem estuda das 9
// às 18 colhia feedback de bloco a bloco e só via o agregado — XP creditado, pet
// subindo — nove horas depois.
//
// Fechar uma sessão **não credita nada**: o XP continua entrando só quando o dia
// fecha, que é o que impede marcar e desmarcar pra repagar (ver `computeStats`).
// O que ela dá é reconhecimento. Por isso também não trava check nenhum — quem
// marcou tarde não perde a sessão, ela só fica completa depois.

import { xpFromCheck } from './progression';
import { blockMins } from './time';
import type { CheckRecord, StudyBlock, TimeString } from './types';

/** Estudo e evento fecham a sessão; pausa e bloqueio só ocupam o espaço (igual aos grupos). */
export const countsForSession = (b: StudyBlock): boolean => b.type === 'estudo' || b.type === 'event';

/**
 * Quantos blocos uma sessão precisa ter pra valer uma comemoração. Uma linha só
 * não é uma leva — o check dela já tem o próprio feedback (anel + "+X XP"), e uma
 * faixa por cima disso seria barulho. Acontece de verdade: um evento entre duas
 * janelas nasce sozinho numa sessão só dele.
 */
export const MIN_BLOCKS_TO_CHEER = 2;

export interface SessionSummary {
  session: number;
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

/** O que a sessão `session` tem e quanto dela já foi cumprido. */
export function sessionSummary(
  blocks: StudyBlock[],
  session: number,
  dayChecks: Record<TimeString, CheckRecord> | undefined,
): SessionSummary {
  const s: SessionSummary = { session, done: 0, total: 0, minsDone: 0, xp: 0, coins: 0, complete: false };
  for (const b of blocks) {
    if (b.session !== session || !countsForSession(b)) continue;
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
 * A sessão deste bloco está completa e vale ser comemorada? Devolve o resumo, ou
 * `null`.
 *
 * A pergunta é sobre a sessão inteira, não sobre "este bloco foi o último" — quem
 * marca fora de ordem fecha a leva no penúltimo horário, e o app precisa
 * reconhecer isso do mesmo jeito. A diferença pro `completesGroup` das skills
 * (que é posicional de propósito) é que aqui não há XP em jogo: o pior caso de
 * desmarcar e remarcar é ver a animação de novo.
 */
export function closedSessionOf(
  blocks: StudyBlock[],
  block: StudyBlock,
  dayChecks: Record<TimeString, CheckRecord> | undefined,
): SessionSummary | null {
  if (block.session === undefined || !countsForSession(block)) return null;
  const s = sessionSummary(blocks, block.session, dayChecks);
  if (!s.complete || s.total < MIN_BLOCKS_TO_CHEER) return null;
  return s;
}
