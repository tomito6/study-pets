// Regras do timer. O bloco É um intervalo do dia (time–endTime): o restante é
// sempre `fim − agora`, nunca um contador em memória — por isso sobrevive a
// reload e a aba suspensa sem esforço.
//
// Um bloco de hoje pode ser aberto antes da hora: o timer fica "em espera"
// (contagem até o início) e começa sozinho quando o relógio chega lá.
//
// Pausado (`pausedAt`): o restante é `fim − pausedAt`, congelado; o bloco não
// termina enquanto a pausa durar. Quem estica o `endTime` do bloco ao retomar é
// o gerador, com o registro da pausa (ver domain/pauses.ts).

import { blockMins, dk } from './time';
import type { DateKey, StudyBlock } from './types';

/** A duração que vale de um bloco (a mesma conta de `blockMins`: sem o tempo pausado). */
export const blockDurationMin = blockMins;

/** Nome sem os emojis de tipo — como aparece no timer e na notificação. */
export const cleanBlockName = (name: string): string => name.replace(/📖|🧘|☕/g, '').trim();

/** Um `Date` de hoje (segundo `now`) no horário "HH:MM". */
export function todayAt(time: string, now: Date): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h as number, m as number, 0, 0);
  return d;
}

export const formatMMSS = (sec: number): string =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** Contagem regressiva: "MM:SS" até uma hora, "H:MM:SS" a partir daí (espera longa). */
export function formatCountdown(sec: number): string {
  if (sec < 3600) return formatMMSS(sec);
  const h = Math.floor(sec / 3600);
  return `${h}:${formatMMSS(sec - h * 3600)}`;
}

export const formatClock = (now: Date): string =>
  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

/** Em espera (aberto antes da hora), rodando, pausado, ou acabou. */
export type TimerPhase = 'waiting' | 'running' | 'paused' | 'done';

export interface TimerProgress {
  phase: TimerPhase;
  totalSec: number;
  /** Restante do bloco — o bloco inteiro enquanto espera. */
  remainingSec: number;
  /** "MM:SS" do restante. */
  display: string;
  /** Segundos até o bloco começar (0 se já começou). */
  untilStartSec: number;
  /** Contagem até o início — o que o timer mostra enquanto espera. */
  untilStartDisplay: string;
  /** Último minuto. */
  ending: boolean;
  /** 0–100, quanto já passou. */
  pct: number;
  /** Fração 0–1 já passada — o anel do modo foco usa isto. */
  elapsedFraction: number;
  done: boolean;
  /** Há quanto tempo está pausado (0 fora da pausa). */
  pausedSec: number;
  /** "MM:SS" (ou "H:MM:SS") da pausa em andamento. */
  pausedDisplay: string;
}

/**
 * O relógio do bloco. `pausedAt` (ms) congela o restante naquele instante — o bloco
 * fica em `paused` até retomar, mesmo que o relógio de parede já tenha passado do
 * fim. O total é a duração que vale (sem o tempo já pausado, que o `endTime` inclui),
 * então o anel drena sobre os minutos de estudo, não sobre a parede.
 */
export function timerProgress(
  block: Pick<StudyBlock, 'time' | 'endTime'> & { paused?: number | undefined },
  now: Date,
  pausedAt: number | null = null,
): TimerProgress {
  const start = todayAt(block.time, now);
  const end = todayAt(block.endTime, now);
  const totalSec = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 1000) - (block.paused ?? 0) * 60);
  const paused = pausedAt != null && pausedAt >= start.getTime() && pausedAt < end.getTime();
  const ref = paused ? new Date(pausedAt) : now;
  const phase: TimerPhase = paused ? 'paused' : now >= end ? 'done' : now < start ? 'waiting' : 'running';
  // `ceil`: em espera nunca mostra 00:00 — no segundo em que zera, já está rodando.
  const untilStartSec = phase === 'waiting' ? Math.ceil((start.getTime() - now.getTime()) / 1000) : 0;
  // Em espera o bloco ainda está inteiro: anel cheio, restante = duração toda.
  const remainingSec =
    phase === 'waiting' ? totalSec : Math.max(0, Math.floor((end.getTime() - ref.getTime()) / 1000));
  const elapsedFraction = Math.max(0, Math.min(1, 1 - remainingSec / totalSec));
  const pausedSec = paused ? Math.max(0, Math.floor((now.getTime() - pausedAt) / 1000)) : 0;
  return {
    phase,
    totalSec,
    remainingSec,
    display: formatMMSS(remainingSec),
    untilStartSec,
    untilStartDisplay: formatCountdown(untilStartSec),
    ending: phase === 'running' && remainingSec <= 60,
    pct: Math.round(elapsedFraction * 100),
    elapsedFraction,
    done: phase === 'done',
    pausedSec,
    pausedDisplay: formatCountdown(pausedSec),
  };
}

export type StartRefusal =
  | { ok: false; reason: 'not-today' }
  | { ok: false; reason: 'ended' }
  /** O dia foi encerrado à mão: o check está travado, então começar não renderia nada. */
  | { ok: false; reason: 'day-closed' }
  /** Abandonado no modo hardcore: sem check e sem timer, o bloco já era. */
  | { ok: false; reason: 'forfeited' };

export type StartCheck = { ok: true } | StartRefusal;

/**
 * O que o domínio não tem como descobrir sozinho sobre o bloco. **Obrigatório de
 * propósito**: enquanto isto era um parâmetro opcional, o "Iniciar" do cartão
 * Agora (laptop) passava direto e o foco abria num dia encerrado, prometendo um
 * XP que o check travado nunca ia pagar. Porta nova é obrigada a responder.
 */
export interface StartContext {
  /** `closedDays[dia]` — encerrado à mão. */
  closed: boolean;
  /** Tem registro de desistência no modo hardcore. */
  forfeited: boolean;
}

/** Só dá pra iniciar um bloco de hoje que ainda não terminou — antes da hora ele fica em espera. */
export function canStartBlock(
  block: Pick<StudyBlock, 'time' | 'endTime'>,
  viewKey: DateKey,
  now: Date,
  ctx: StartContext,
): StartCheck {
  if (viewKey !== dk(now)) return { ok: false, reason: 'not-today' };
  if (now >= todayAt(block.endTime, now)) return { ok: false, reason: 'ended' };
  if (ctx.closed) return { ok: false, reason: 'day-closed' };
  if (ctx.forfeited) return { ok: false, reason: 'forfeited' };
  return { ok: true };
}

export type TimerSound = 'estudo' | 'pausa_curta' | 'pausa_longa';

/** Som do fim do bloco: pausa longa é detectada pelo nome, como no original. */
export function soundForBlock(block: Pick<StudyBlock, 'type' | 'name'>): TimerSound {
  if (block.type === 'estudo') return 'estudo';
  return block.name.includes('longa') ? 'pausa_longa' : 'pausa_curta';
}

const sameBlock = (a: Pick<StudyBlock, 'time' | 'endTime'>, b: Pick<StudyBlock, 'time' | 'endTime'>) =>
  a.time === b.time && a.endTime === b.endTime;

const isPomodoroPart = (b: Pick<StudyBlock, 'type'>): boolean => b.type === 'estudo' || b.type === 'pausa';

/** O bloco seguinte no dia, ou null se este é o último. */
export function nextBlockAfter(dayBlocks: StudyBlock[], block: StudyBlock): StudyBlock | null {
  const idx = dayBlocks.findIndex((b) => sameBlock(b, block));
  return idx >= 0 && idx + 1 < dayBlocks.length ? dayBlocks[idx + 1]! : null;
}

/**
 * O bloco em que o modo foco emenda quando este acaba: o seguinte do dia, se é
 * estudo/pausa e começa exatamente quando este termina. Almoço, evento, um gap
 * entre janelas ou o fim do dia encerram a sequência.
 */
export function chainedBlockAfter(dayBlocks: StudyBlock[], block: StudyBlock): StudyBlock | null {
  const next = nextBlockAfter(dayBlocks, block);
  return next && isPomodoroPart(next) && next.time === block.endTime ? next : null;
}
