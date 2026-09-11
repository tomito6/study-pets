// De acontecimento a notificação: as regras de "isso merece uma linha no sininho".
//
// Puro. Quem descobre os números é a camada de aplicação (`application/dayEnd.ts`,
// `application/pets.ts`); aqui só se decide o que vira notificação e com que id.
//
// A regra do id é a mesma em todos: ele deriva do ACONTECIMENTO, nunca do relógio.
// `pet-nivel:dog:5` é o mesmo id no dispositivo que encerrou o dia e no que só
// abriu o app depois — então a mesma novidade nunca vira duas linhas.

import type { NewNotification } from './notifications';
import { DAILY_BONUS_TIERS, LEVELS, dailyBonusForStreak, getLevelIdx } from './progression';
import type { DateKey, PetInstanceId } from './types';

/** Um pet visto de fora: o que basta pra saber se ele avançou. */
export interface PetProgress {
  id: PetInstanceId;
  name: string;
  level: number;
  /** Tem evolução disponível AGORA (nível alcançado e caminho por escolher/avançar). */
  canEvolve: boolean;
}

/**
 * O que mudou nos pets entre antes e depois de creditar o XP dos dias fechados.
 * É o mesmo caminho no encerramento do dia e no boot — `applyPendingPetXP` roda
 * nos dois —, e é por isso que o pet que subiu de nível enquanto o app estava
 * fechado não passa em branco.
 */
export function petNotices(before: readonly PetProgress[], after: readonly PetProgress[]): NewNotification[] {
  const out: NewNotification[] = [];
  for (const a of after) {
    const b = before.find((p) => p.id === a.id);
    if (!b) continue; // pet adotado agora: não "subiu" de nada
    if (a.level > b.level) {
      out.push({ id: `pet-nivel:${a.id}:${a.level}`, kind: 'pet-nivel', data: { nome: a.name, n: a.level } });
    }
    // A evolução vem depois do nível de propósito: entra na lista por cima dele,
    // que é a ordem em que a notícia importa.
    if (a.canEvolve && !b.canEvolve) {
      out.push({ id: `pet-evolucao:${a.id}:${a.level}`, kind: 'pet-evolucao', data: { nome: a.name, n: a.level } });
    }
  }
  return out;
}

/** Os marcos de sequência que rendem bônus (os degraus de `DAILY_BONUS_TIERS`), sem o de 1 dia. */
const MARCOS: readonly number[] = DAILY_BONUS_TIERS.map(([dias]) => dias).filter((d) => d > 1).sort((a, b) => a - b);

/** Um dia é marco se cai num degrau, ou a cada 30 dias depois do último. */
export function isStreakMilestone(streak: number): boolean {
  if (streak <= 1) return false;
  if (MARCOS.includes(streak)) return true;
  const ultimo = MARCOS[MARCOS.length - 1] ?? 30;
  return streak > ultimo && streak % ultimo === 0;
}

/** Um dia que acabou de entrar na conta: o XP e as moedas dele viraram totais agora. */
export interface CreditedDay {
  dia: DateKey;
  xp: number;
  coins: number;
  /** Dias seguidos batendo a meta, contando este dia. */
  streak: number;
}

export interface CreditContext {
  /** XP total DEPOIS de os dias entrarem (o que `computeStats` devolve agora). */
  totalXP: number;
  /** Melhor dia em XP contando SÓ os dias que já estavam na conta. */
  bestDayXPBefore: number;
  /** Saldo de moedas DEPOIS de os dias entrarem. */
  balanceAfter: number;
  /** Preço do pet mais barato da loja. */
  cheapestPet: number;
  /** Quantas linhas de "dia encerrado" no máximo (as mais recentes). */
  maxDias?: number;
}

/** Voltar de duas semanas fora não deve encher o painel de "dia encerrado". */
export const MAX_DIAS_NO_LOTE = 3;

/**
 * O que um ou mais dias que entraram na conta deixam no sininho.
 *
 * **Um caminho só, de propósito.** Um dia entra na conta de duas formas: o botão
 * "Encerrar o dia", e a virada da meia-noite (`computeStats` conta todo dia
 * passado, com ou sem `closedDays`). A segunda é a mais comum — a pessoa fecha o
 * laptop e pronto — e é exatamente a que não tinha tela nenhuma contando.
 * `applyPendingPetXP` é o único lugar por onde as duas passam, então é de lá que
 * isto é chamado.
 *
 * `dias` vem em ordem cronológica. A ordem de emissão importa: quem é emitido por
 * último fica no topo da lista, então o nível sai no fim.
 */
export function creditedDaysNotices(dias: readonly CreditedDay[], ctx: CreditContext): NewNotification[] {
  const comGanho = dias.filter((d) => d.xp > 0 || d.coins > 0);
  if (comGanho.length === 0) return [];

  const out: NewNotification[] = [];
  const maxDias = ctx.maxDias ?? MAX_DIAS_NO_LOTE;
  const recentes = new Set(comGanho.slice(-maxDias).map((d) => d.dia));

  const xpDosDias = comGanho.reduce((n, d) => n + d.xp, 0);
  const moedasDosDias = comGanho.reduce((n, d) => n + d.coins, 0);
  const xpAntes = Math.max(0, ctx.totalXP - xpDosDias);
  let saldo = Math.max(0, ctx.balanceAfter - moedasDosDias);
  let melhorDia = ctx.bestDayXPBefore;

  for (const d of comGanho) {
    if (recentes.has(d.dia)) {
      out.push({ id: `dia:${d.dia}`, kind: 'dia', data: { dia: d.dia, xp: d.xp, coins: d.coins } });
    }

    // Recorde só existe contra um dia anterior — no primeiro dia da conta, "melhor
    // dia até agora" é aritmética, não notícia.
    if (melhorDia > 0 && d.xp > melhorDia) {
      out.push({ id: `recorde-dia:${d.dia}`, kind: 'recorde-dia', data: { dia: d.dia, xp: d.xp } });
    }
    if (d.xp > melhorDia) melhorDia = d.xp;

    // O saldo CRUZOU o preço do pet mais barato. Sem o cruzamento seria um lembrete
    // diário de gastar — que é exatamente o que este app não faz.
    const saldoAntes = saldo;
    saldo += d.coins;
    if (ctx.cheapestPet > 0 && saldoAntes < ctx.cheapestPet && saldo >= ctx.cheapestPet) {
      out.push({ id: `moedas:${d.dia}`, kind: 'moedas', data: { dia: d.dia, coins: saldo } });
    }

    if (isStreakMilestone(d.streak)) {
      out.push({
        id: `sequencia:${d.dia}:${d.streak}`,
        kind: 'sequencia',
        data: { dia: d.dia, n: d.streak, coins: dailyBonusForStreak(d.streak) },
      });
    }
  }

  // Uma linha só pro nível, do nível efetivamente alcançado: voltar de uma semana
  // fora e subir dois níveis não merece duas linhas dizendo a mesma coisa.
  const idxAntes = getLevelIdx(xpAntes);
  const idxDepois = getLevelIdx(ctx.totalXP);
  if (idxDepois > idxAntes) {
    out.push({ id: `nivel:${idxDepois + 1}`, kind: 'nivel', data: { n: idxDepois + 1, nome: LEVELS[idxDepois]?.[1] ?? '' } });
  }

  return out;
}

/** O abandono cobrado ao abrir o app (modo hardcore). Ver `application/hardcore.ts`. */
export function abandonNotice(
  dia: DateKey,
  block: { time: string; name: string },
  cost: { userXp: number; petXp: number },
  pet: string | null,
): NewNotification {
  return {
    id: `abandono:${dia}:${block.time}`,
    kind: 'abandono',
    data: {
      dia,
      nome: block.name.replace(/📖|🧘|☕/g, '').trim(),
      xp: cost.userXp,
      ...(pet && cost.petXp > 0 ? { pet, petXp: cost.petXp } : {}),
    },
  };
}
