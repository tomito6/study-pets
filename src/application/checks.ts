// Caso de uso: marcar/desmarcar um bloco.

import { canCheckBlock, previousCountingDay, previousDayKey } from '../domain/checks';
import { blockInGroup, countsForGroup, groupOf } from '../domain/groups';
import { petLevel } from '../domain/pets';
import { bonusForCheck, coinsForBlock, xpFromCheck } from '../domain/progression';
import { blockMins, dk } from '../domain/time';
import { timerProgress } from '../domain/timer';
import type { CheckRecord, DateKey, StudyBlock, TimeString } from '../domain/types';
import { strings } from '../shared/strings';
import { showToast } from '../shared/toast';
import { derived, state } from '../store/store';
import { isRestDayKey } from './dayWindows';
import { activePet } from './pets';
import { blocksForDay, isBonusDayKey } from './plan';
import { scheduleSave } from './save';

export interface CheckResult {
  /** Estado depois do toggle. */
  checked: boolean;
  /** XP efetivo do check (já com bônus de skill), pro feedback visual. */
  xp: number;
  coins: number;
}

const mins = blockMins;

const isStudyish = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'estudo' || b.type === 'event';

/**
 * O que as regras de skill precisam saber do dia. Tudo sai do plano do dia e dos
 * checks que já estão lá — nenhum campo novo no documento salvo.
 *
 * Três grupos: o que já foi marcado hoje (Fiel, Maratona, Constância), a posição
 * do bloco no plano (Ponto final, Retomada, Preguiça, Rumina) e o feitio do dia
 * (Recomeço, Descansado, Hora extra) mais os grupos de estudo (Afinco, Empenho).
 */
function dayContext(dateKey: DateKey, block: StudyBlock, day: Record<TimeString, CheckRecord>) {
  const blocks = blocksForDay(dateKey);
  const idx = blocks.findIndex((b) => b.time === block.time);
  const prev = idx > 0 ? blocks[idx - 1]! : null;
  const done = blocks.filter((b) => isStudyish(b) && day[b.time]);
  const studyish = blocks.filter(isStudyish);
  const last = studyish[studyish.length - 1];
  // O que já foi feito ANTES deste bloco no plano — não "o que está marcado agora".
  // É o que impede desmarcar e remarcar de repagar bônus (ver SkillContext).
  const doneBefore = done.filter((b) => b.time < block.time);

  // O grupo do bloco: dentro dele (Afinco) e se este é o que fecha (Empenho).
  // "Fecha" é posicional — o último membro do grupo no plano — mais a exigência
  // de que os anteriores estejam marcados. Assim só um bloco por grupo pode
  // receber, mesmo remarcando os outros.
  const group = groupOf(state.groups[dateKey] ?? [], block);
  const members = group ? blocks.filter((b) => countsForGroup(b) && blockInGroup(b, group)) : [];
  const lastMember = members[members.length - 1];
  const faltando = members.filter((b) => b.time !== block.time && !day[b.time]);

  // Ontem foi folga? E o último dia que contava ficou em branco?
  const yesterday = previousDayKey(dateKey);
  const lastCounting = previousCountingDay(dateKey, isRestDayKey, { notBefore: state.config.periodStart });

  return {
    studiesCheckedToday: done.length,
    studiesCheckedBefore: doneBefore.length,
    studyMinsBefore: doneBefore.reduce((sum, b) => sum + mins(b), 0),
    prevBlock: prev ? { type: prev.type, mins: mins(prev) } : null,
    isLastStudy: !!last && last.time === block.time,
    inGroup: !!group,
    completesGroup: !!lastMember && lastMember.time === block.time && faltando.length === 0,
    // "Em branco" é dia sem ESTUDO — uma pausa marcada sozinha não conta como dia cumprido.
    comebackDay: !!lastCounting && !blocksForDay(lastCounting).some((b) => isStudyish(b) && state.checks[lastCounting]?.[b.time]),
    afterRestDay: isRestDayKey(yesterday),
    bonusDay: isBonusDayKey(dateKey),
  };
}

/** Grava o check com o pet equipado e o bônus de skill decidido AGORA. */
function markBlock(dateKey: DateKey, block: StudyBlock, day: Record<TimeString, CheckRecord>, now: Date): CheckResult {
  const pet = activePet();
  const bonus = bonusForCheck(block, dateKey, {
    activeSkill: pet?.skill ?? null,
    // A skill vale desde a troca dela OU desde que o pet foi equipado — o mais recente.
    activatedAt: Math.max(pet?.skillActivatedAt ?? 0, state.pets.activeSince ?? 0),
    // O nível pelo XP já creditado: o de hoje só entra quando o dia fecha (anti-exploit).
    petLevel: pet ? petLevel(pet) : 1,
    ...dayContext(dateKey, block, day),
    dailyStudyMin: state.config.dailyStudyMin ?? 0,
    longBreakMins: state.config.longBreak,
    now,
  });
  const record = { pet: pet?.id ?? null, bonus };
  day[block.time] = record;
  scheduleSave();
  return { checked: true, xp: xpFromCheck(block, record), coins: coinsForBlock(block, mins(block)) };
}

/**
 * Marca ou desmarca o bloco. Devolve `null` se o dia não aceita mudança (encerrado
 * ou futuro) ou o bloco foi abandonado no hardcore. Ao marcar, grava o pet equipado
 * e o bônus decidido AGORA — o XP do pet é creditado só quando o dia fechar (ver
 * `computePendingPetXP`).
 */
/**
 * O bloco que está RODANDO agora no timer. Marcar à mão um bloco em andamento levava
 * o bloco **cheio** no minuto 1, enquanto o "■ Parar por aqui" aos 12 minutos paga 24
 * XP — o caminho honesto rendia menos que o atalho. Ele se fecha sozinho no fim (pelo
 * foco) ou pelo "Parar por aqui", que paga o proporcional.
 *
 * A recusa vale só pra MARCAR: desmarcar continua livre, porque tirar não é ganhar.
 * E vive só aqui, no caminho manual — `checkBlock`, que é o fim do bloco no foco,
 * marca o mesmo bloco de propósito e não pode passar por esta guarda.
 */
const emAndamento = (dateKey: DateKey, block: StudyBlock, now: Date): boolean => {
  const t = derived.timerBlock;
  if (!t || dateKey !== dk(now) || t.time !== block.time) return false;
  // Pausado conta: o bloco continua sendo o que você está vivendo, e liberar a marca
  // na pausa devolveria o mesmo atalho pela porta de trás (pausar no minuto 1, marcar,
  // levar o bloco cheio). Em espera NÃO conta — ali nada começou.
  if (derived.timerPausedAt != null) return true;
  return timerProgress(t, now, null, derived.timerEndsAt).phase === 'running';
};

export function toggleBlockCheck(dateKey: DateKey, block: StudyBlock, now: Date = new Date()): CheckResult | null {
  if (!canCheckBlock(dateKey, block.time, { closedDays: state.closedDays, penalties: state.penalties, now })) return null;

  const day = state.checks[dateKey] ?? (state.checks[dateKey] = {});
  if (!day[block.time] && emAndamento(dateKey, block, now)) {
    showToast(strings.plan.checkRunning);
    return null;
  }
  if (day[block.time]) {
    delete day[block.time];
    if (Object.keys(day).length === 0) delete state.checks[dateKey];
    scheduleSave();
    return { checked: false, xp: 0, coins: 0 };
  }
  return markBlock(dateKey, block, day, now);
}

/**
 * Marca o bloco só se ainda não está marcado — o fim de um bloco no modo foco usa
 * isto, e um check feito à mão no meio do bloco não pode ser desfeito por ele.
 * `null` = nada mudou (já marcado, ou o dia não aceita).
 */
export function checkBlock(dateKey: DateKey, block: StudyBlock, now: Date = new Date()): CheckResult | null {
  if (!canCheckBlock(dateKey, block.time, { closedDays: state.closedDays, penalties: state.penalties, now })) return null;
  if (state.checks[dateKey]?.[block.time]) return null;
  const day = state.checks[dateKey] ?? (state.checks[dateKey] = {});
  return markBlock(dateKey, block, day, now);
}
