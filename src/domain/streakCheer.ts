// O parabéns pela sequência: quando ele aparece, e o que ele diz. Puro.
//
// A sequência do app só existe a partir de HOJE: `calcStreaks` anda pra trás desde
// hoje e para no primeiro dia sem meta, então ela vale 0 até a meta de hoje ser batida
// e pula pra N no check que a bate. É esse o "aumentou" — o momento em que a pessoa
// acabou de fazer alguma coisa, e por isso o parabéns nasce do CHECK (ver
// `application/streakCheer.ts`), nunca de uma leitura do estado: mudar a meta nas
// Configurações ou receber o documento de outro aparelho também mexem no número, e
// nenhum dos dois é conquista de agora.
//
// O que NÃO mora aqui, de propósito: nenhuma frase sobre o que acontece se a pessoa
// faltar amanhã. Sequência no Study Pets é pra comemorar, não pra cobrar.

import { dailyBonusForStreak } from './progression';
import { isStreakMilestone } from './progressNotices';
import { calcStreaks } from './stats';
import type { DateKey } from './types';

/**
 * A última sequência já comemorada: o dia em que foi e até que número.
 *
 * É o que faz "uma vez por aumento" valer. Desmarcar o bloco que bateu a meta e
 * marcar de novo devolve a sequência ao MESMO número — não é aumento novo, e a
 * marca recusa. Já completar à noite um bloco de ontem que emenda duas sequências
 * (de 1 pra 5) passa: o número é maior do que o que foi comemorado.
 */
export interface StreakCheerMark {
  day: DateKey;
  n: number;
}

/** O que o pop-up precisa saber pra se desenhar. */
export interface StreakCheer {
  /** Dias seguidos batendo a meta, contando hoje. */
  n: number;
  /** Passou AGORA da maior sequência anterior (que precisa ter existido de verdade). */
  record: boolean;
  /** Cai num degrau do bônus (3, 7, 14, 30, 60…). */
  milestone: boolean;
  /** O bônus de moedas que este dia rende quando fechar. */
  coins: number;
}

export interface StreakCheerInput {
  /** A sequência antes e depois do check. */
  before: number;
  after: number;
  /** A maior sequência que já tinha ACABADO antes da atual começar (ver `previousBestStreak`). */
  previousBest: number;
  today: DateKey;
  mark: StreakCheerMark | null;
}

/** Recorde só existe contra uma sequência de verdade: passar de "1 dia" não é notícia. */
const MIN_RECORD = 2;

/**
 * O check acabou de mexer na sequência: isso merece o pop-up?
 *
 * `null` quando ela não cresceu, ou quando o crescimento até este número já foi
 * comemorado hoje.
 */
export function streakCheerFor(input: StreakCheerInput): StreakCheer | null {
  const { before, after, previousBest, today, mark } = input;
  if (after <= 0 || after <= before) return null;
  if (mark && mark.day === today && after <= mark.n) return null;
  // De onde a sequência vinha: num dia comum ela valia 0 até o check (hoje ainda não
  // contava), mas o que a pessoa tinha ontem era `after - 1`. É contra isso que o
  // recorde se mede — senão todo dia depois do recorde seria recorde de novo.
  const vinhaDe = before > 0 ? before : after - 1;
  return {
    n: after,
    record: previousBest >= MIN_RECORD && vinhaDe <= previousBest && after > previousBest,
    milestone: isStreakMilestone(after),
    coins: dailyBonusForStreak(after),
  };
}

/**
 * A maior sequência entre as que já tinham acabado quando a atual começou.
 *
 * `calcStreaks().best` não serve: ele inclui a sequência em andamento, então numa
 * sequência que só cresce o "recorde" seria batido todo santo dia. `dayKeys` são os
 * dias que contam, em ordem; `current` é a sequência atual, já com hoje.
 */
export function previousBestStreak(
  dayStudyMins: Record<DateKey, number>,
  dayKeys: readonly DateKey[],
  todayKey: DateKey,
  minMins: number,
  current: number,
): number {
  const idx = dayKeys.indexOf(todayKey);
  if (idx < 0) return 0;
  const antes = dayKeys.slice(0, Math.max(0, idx - current + 1));
  return calcStreaks(dayStudyMins, antes as DateKey[], todayKey, minMins).best;
}

/** Quantos pontos a trilha desenha no máximo — uma semana. */
export const TRAIL_MAX = 7;

/**
 * A trilha do pop-up: um ponto por dia da sequência, o último maior (é o de hoje).
 * Passando de uma semana ela mostra só os últimos dias e avisa que vem de antes.
 */
export function streakTrail(n: number, max: number = TRAIL_MAX): { dots: number; more: boolean } {
  const dias = Math.max(0, Math.floor(n));
  return { dots: Math.min(dias, max), more: dias > max };
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Leitura do documento: qualquer coisa que não seja a marca inteira vira "nunca comemorou". */
export function normalizeStreakCheerMark(raw: unknown): StreakCheerMark | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { day, n } = raw as { day?: unknown; n?: unknown };
  if (typeof day !== 'string' || !DIA.test(day)) return null;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
  return { day: day as DateKey, n };
}
