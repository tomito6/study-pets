// O fim do dia: quando o último estudo termina, quando vale perguntar "encerrar ou
// prolongar?", e como prolongar. Puro.

import { minsToTime, timeToMins } from './time';
import type { StudyBlock, StudyWindow, TimeString, UserConfig } from './types';

/** Fim do último bloco de ESTUDO do dia (não pausa, não evento), ou null. */
export function lastStudyEnd(blocks: StudyBlock[]): TimeString | null {
  let latest: TimeString | null = null;
  let latestMins = -1;
  for (const b of blocks) {
    if (b.type !== 'estudo') continue;
    const m = timeToMins(b.endTime);
    if (m > latestMins) {
      latestMins = m;
      latest = b.endTime;
    }
  }
  return latest;
}

/**
 * O prompt só faz sentido se o dia ainda está aberto, já houve pelo menos um
 * check hoje (senão não há o que encerrar), existe estudo no plano, e o último
 * estudo já passou.
 */
export function shouldPromptEndOfDay(opts: {
  dayClosed: boolean;
  hasCheckToday: boolean;
  lastEnd: TimeString | null;
  now: Date;
}): boolean {
  if (opts.dayClosed || !opts.hasCheckToday || !opts.lastEnd) return false;
  const nowMins = opts.now.getHours() * 60 + opts.now.getMinutes();
  return nowMins >= timeToMins(opts.lastEnd);
}

/** Milissegundos até "HH:MM" de hoje (negativo se já passou). */
export function msUntil(time: TimeString, now: Date): number {
  const [h, m] = time.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h as number, m as number, 0, 0);
  return target.getTime() - now.getTime();
}

/** Ponto de partida pro "Prolongar": agora + 1h. */
export function suggestedExtendTime(now: Date): TimeString {
  const d = new Date(now.getTime() + 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A última janela (a que começa mais tarde) passa a terminar em `newEnd`. */
export function extendWindowsTo(windows: StudyWindow[], newEnd: TimeString): StudyWindow[] {
  const out = windows.map((w) => ({ ...w }));
  if (out.length > 0) {
    const last = out.reduce((a, b) => (timeToMins(b.start) >= timeToMins(a.start) ? b : a));
    last.end = newEnd;
  }
  return out;
}

/** Estende o dia na rotina: `end` e o fim da última janela de estudo. */
export function extendDayTo(config: UserConfig, newEnd: TimeString): UserConfig {
  return { ...config, end: newEnd, studyWindows: extendWindowsTo(config.studyWindows, newEnd) };
}

/** Só pra manter a simetria de import; útil em testes. */
export const fmtMins = minsToTime;
