// De acontecimento a notificação: as regras de "isso merece uma linha no sininho".
//
// Puro. Quem descobre os números é a camada de aplicação (`application/dayEnd.ts`,
// `application/pets.ts`); aqui só se decide o que vira notificação e com que id.
//
// A regra do id é a mesma em todos: ele deriva do ACONTECIMENTO, nunca do relógio.
// `pet-nivel:dog:5` é o mesmo id no dispositivo que encerrou o dia e no que só
// abriu o app depois — então a mesma novidade nunca vira duas linhas.

import type { DaySummary } from './daySummary';
import type { NewNotification } from './notifications';
import { DAILY_BONUS_TIERS, dailyBonusForStreak } from './progression';
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

/** Tudo que o encerramento do dia sabe. Quem monta é `application/dayEnd.ts`. */
export interface DayCloseFacts {
  dia: DateKey;
  summary: DaySummary;
  /** Dias seguidos batendo a meta, contando o dia que acabou de fechar. */
  streak: number;
  /** Melhor dia em XP antes e depois de fechar — o recorde é a diferença entre os dois. */
  bestDayXPBefore: number;
  bestDayXPAfter: number;
  /** Saldo de moedas antes e depois, e o pet mais barato da loja. */
  balanceBefore: number;
  balanceAfter: number;
  cheapestPet: number;
}

/**
 * O que o fim do dia deixa no sininho. O resumo que aparece na hora é um modal
 * que some; isto é o que fica.
 *
 * A ordem importa: a mais importante é emitida por último, porque é a última
 * emitida que fica no topo da lista.
 */
export function dayCloseNotices(f: DayCloseFacts): NewNotification[] {
  const out: NewNotification[] = [];
  const { summary } = f;

  // Dia sem nada marcado não vira linha: encerrar um dia em branco é uma decisão
  // legítima e o app não tem nada a comemorar nem a cobrar por ela.
  if (summary.empty) return out;

  out.push({ id: `dia:${f.dia}`, kind: 'dia', data: { dia: f.dia, xp: summary.userXP, coins: summary.userCoins } });

  // Recorde só existe contra um dia anterior — no primeiro dia fechado, "melhor
  // dia até agora" não é notícia, é aritmética.
  if (f.bestDayXPBefore > 0 && f.bestDayXPAfter > f.bestDayXPBefore) {
    out.push({ id: `recorde-dia:${f.dia}`, kind: 'recorde-dia', data: { dia: f.dia, xp: f.bestDayXPAfter } });
  }

  // O saldo CRUZOU o preço do pet mais barato hoje. Sem o cruzamento seria um
  // lembrete diário de gastar — que é exatamente o que este app não faz.
  if (f.cheapestPet > 0 && f.balanceBefore < f.cheapestPet && f.balanceAfter >= f.cheapestPet) {
    out.push({ id: `moedas:${f.dia}`, kind: 'moedas', data: { dia: f.dia, coins: f.balanceAfter } });
  }

  if (isStreakMilestone(f.streak)) {
    out.push({
      id: `sequencia:${f.dia}:${f.streak}`,
      kind: 'sequencia',
      data: { dia: f.dia, n: f.streak, coins: dailyBonusForStreak(f.streak) },
    });
  }

  if (summary.userLevelUp) {
    out.push({ id: `nivel:${summary.newLevel}`, kind: 'nivel', data: { n: summary.newLevel, nome: summary.newLevelName } });
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
