// Caso de uso: o parabéns pela sequência.
//
// Quem chama é o CHECK (`application/checks.ts`), e só ele: mede a sequência antes de
// marcar, marca, e passa o "antes" pra cá. Assim o pop-up cobre as três portas por onde
// um bloco é marcado — o toque na lista, o fim do bloco no foco e o "■ Parar por aqui" —
// e nenhuma das que mexem no número sem ninguém ter estudado agora (mudar a meta diária,
// o documento que chega de outro aparelho, a virada do dia).
//
// A regra (cresceu? já comemorou?) é do domínio; aqui ficam o estado e o relógio.

import { previousBestStreak, streakCheerFor } from '../domain/streakCheer';
import { dk } from '../domain/time';
import type { DateKey } from '../domain/types';
import { derived, notify, state } from '../store/store';
import { allDays, calcStreaksNow, computeStatsNow } from './plan';

/** A sequência de agora: dias seguidos batendo a meta, contando hoje (0 enquanto hoje não bateu). */
export function streakNow(now: Date = new Date()): number {
  return calcStreaksNow(computeStatsNow(now).dayStudyMins, now).cur;
}

/**
 * Chamado logo depois de um check, com a sequência de ANTES dele. Se ela cresceu e esse
 * número ainda não foi comemorado hoje, abre o pop-up e grava a marca — que viaja no
 * mesmo save que o check já agendou.
 *
 * Precisa rodar DEPOIS do `notify()` do check: o memo do `computeStatsNow` é por versão
 * do store, e sem a versão nova a leitura abaixo devolveria os números de antes.
 */
export function cheerStreakIfGrew(before: number, now: Date = new Date()): void {
  const stats = computeStatsNow(now);
  const after = calcStreaksNow(stats.dayStudyMins, now).cur;
  if (after <= before) return;
  const today = dk(now);
  const min = state.config.dailyStudyMin || 60;
  // Os mesmos dias que `calcStreaksNow` conta: folga fica de fora, e o dia bônus só entra se bateu a meta.
  const keys: DateKey[] = allDays()
    .filter((d) => !d.bonus || (stats.dayStudyMins[d.key] || 0) >= min)
    .map((d) => d.key);
  const cheer = streakCheerFor({
    before,
    after,
    previousBest: previousBestStreak(stats.dayStudyMins, keys, today, min, after),
    today,
    mark: state.streakCheered ?? null,
  });
  if (!cheer) return;
  state.streakCheered = { day: today, n: cheer.n };
  derived.streakCheer = { ...cheer, at: now.getTime() };
  notify();
}

/** Fechar o pop-up (o ✕, o toque nele, Esc, ou o tempo dele que acabou). */
export function dismissStreakCheer(): void {
  if (!derived.streakCheer) return;
  derived.streakCheer = null;
  notify();
}
