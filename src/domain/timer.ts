// Regras do timer. O bloco É um intervalo do dia (time–endTime): o restante é
// sempre `fim − agora`, nunca um contador em memória — por isso sobrevive a
// reload e a aba suspensa sem esforço.
//
// Um bloco de hoje pode ser aberto antes da hora: o timer fica "em espera"
// (contagem até o início) e começa sozinho quando o relógio chega lá.

import { timeToMins } from './time';
import { dk } from './time';
import type { DateKey, StudyBlock } from './types';

export const blockDurationMin = (b: Pick<StudyBlock, 'time' | 'endTime'>): number =>
  timeToMins(b.endTime) - timeToMins(b.time);

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

/** Em espera (aberto antes da hora), rodando, ou acabou. */
export type TimerPhase = 'waiting' | 'running' | 'done';

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
}

export function timerProgress(block: Pick<StudyBlock, 'time' | 'endTime'>, now: Date): TimerProgress {
  const start = todayAt(block.time, now);
  const end = todayAt(block.endTime, now);
  const totalSec = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 1000));
  const phase: TimerPhase = now >= end ? 'done' : now < start ? 'waiting' : 'running';
  // `ceil`: em espera nunca mostra 00:00 — no segundo em que zera, já está rodando.
  const untilStartSec = phase === 'waiting' ? Math.ceil((start.getTime() - now.getTime()) / 1000) : 0;
  // Em espera o bloco ainda está inteiro: anel cheio, restante = duração toda.
  const remainingSec =
    phase === 'waiting' ? totalSec : Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
  const elapsedFraction = 1 - remainingSec / totalSec;
  return {
    phase,
    totalSec,
    remainingSec,
    display: formatMMSS(remainingSec),
    untilStartSec,
    untilStartDisplay: formatCountdown(untilStartSec),
    ending: phase !== 'waiting' && remainingSec <= 60,
    pct: Math.round(elapsedFraction * 100),
    elapsedFraction,
    done: phase === 'done',
  };
}

export type StartRefusal = { ok: false; reason: 'not-today' } | { ok: false; reason: 'ended' };

export type StartCheck = { ok: true } | StartRefusal;

/** Só dá pra iniciar um bloco de hoje que ainda não terminou — antes da hora ele fica em espera. */
export function canStartBlock(
  block: Pick<StudyBlock, 'time' | 'endTime'>,
  viewKey: DateKey,
  now: Date,
): StartCheck {
  if (viewKey !== dk(now)) return { ok: false, reason: 'not-today' };
  if (now >= todayAt(block.endTime, now)) return { ok: false, reason: 'ended' };
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

/** Posição do bloco entre os estudos/pausas da MESMA sessão (1-based). */
export function blockNumberInSession(dayBlocks: StudyBlock[], block: StudyBlock): number {
  let n = 0;
  for (const b of dayBlocks) {
    if (b.session === block.session && isPomodoroPart(b)) {
      n++;
      if (sameBlock(b, block)) break;
    }
  }
  return n;
}

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
