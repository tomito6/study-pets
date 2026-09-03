// Gerador do plano do dia: transforma config + eventos numa lista de blocos.
// Função pura — a memoização vive fora daqui, em quem chama.

import type { BlockType, PlannerConfig, StudyBlock, StudyEvent, TimeString } from './types';
import { minsToTime, timeToMins } from './time';
import { calcXP } from './progression';

interface BlockedSpan {
  start: number;
  end: number;
  name: string;
  type: BlockType;
  _seriesId?: string;
}

/**
 * Gera os blocos de um dia.
 *
 * Regras que o comportamento original garante e que os testes protegem:
 * - as janelas de estudo são a fonte da verdade; `start`/`end` só entram como
 *   fallback pra config antiga sem `studyWindows`;
 * - almoço e eventos bloqueiam tempo e quebram a sessão;
 * - evento com `countsAsStudy !== false` vira bloco 'event' (dá XP); senão vira
 *   'intervalo' (só ocupa o espaço);
 * - sobra menor que um pomo vira mini-estudo (se >= metade do pomo) ou estica o
 *   último estudo;
 * - o último bloco do dia nunca é pausa.
 */
export function generateBlocks(cfg: PlannerConfig, events: StudyEvent[] = []): StudyBlock[] {
  // Resolve janelas de estudo (fallback pra retrocompat se vier cfg antigo)
  const rawWindows =
    Array.isArray(cfg.studyWindows) && cfg.studyWindows.length > 0
      ? cfg.studyWindows
      : [{ start: cfg.start, end: cfg.end }];
  const windows = rawWindows
    .filter((w) => w && w.start && w.end)
    .map((w) => ({ start: timeToMins(w.start), end: timeToMins(w.end) }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start);

  if (windows.length === 0) return [];

  // Bloqueios: eventos (countsAsStudy=true→'event', false→'intervalo') + almoço.
  const blocked: BlockedSpan[] = [];
  for (const ev of events) {
    const counts = ev.countsAsStudy !== false; // default true (retrocompat)
    const entry: BlockedSpan = {
      start: timeToMins(ev.start),
      end: timeToMins(ev.end),
      name: ev.name,
      type: counts ? 'event' : 'intervalo',
    };
    if (ev._seriesId) entry._seriesId = ev._seriesId;
    blocked.push(entry);
  }
  if (cfg.hasLunch !== false) {
    const lunchStart = timeToMins(cfg.lunch);
    blocked.push({
      start: lunchStart,
      end: lunchStart + cfg.lunchDur,
      name: '🍽️ Almoço',
      type: 'almoco',
    });
  }
  blocked.sort((a, b) => a.start - b.start);

  const blocks: StudyBlock[] = [];
  let sessionN = 0;

  // Emite um bloqueio como block (almoço/evento/intervalo) preservando metadados úteis.
  function emitBlocked(b: BlockedSpan): void {
    const out: StudyBlock = {
      time: minsToTime(b.start),
      endTime: minsToTime(b.end),
      name:
        b.type === 'event'
          ? `📅 ${b.name}`
          : b.type === 'intervalo' && b._seriesId
            ? `📅 ${b.name}`
            : b.name,
      type: b.type,
      xp: b.type === 'event' ? calcXP(b.end - b.start) : 0,
      session: b.type === 'event' ? sessionN : undefined,
    };
    if (b._seriesId) out._seriesId = b._seriesId;
    blocks.push(out);
  }

  // Pra cada janela, gera pomos+pausas e respeita bloqueios internos.
  // Antes de cada janela, emite bloqueios que estão entre a anterior e esta (ou antes da primeira).
  for (let wi = 0; wi < windows.length; wi++) {
    const win = windows[wi]!;
    const gapStart = wi === 0 ? -Infinity : windows[wi - 1]!.end;
    const interGap = blocked.filter((b) => b.start >= gapStart && b.end <= win.start);
    for (const b of interGap) {
      emitBlocked(b);
      sessionN++;
    }

    let cur = win.start;
    const winEnd = win.end;
    let pomoCount = 0;
    const MAX = 300;
    let iter = 0;

    while (cur < winEnd && iter++ < MAX) {
      // Dentro de bloqueio que cruza/cai nesta janela?
      const inBlock = blocked.find((b) => cur >= b.start && cur < b.end);
      if (inBlock) {
        emitBlocked(inBlock);
        cur = inBlock.end;
        pomoCount = 0;
        sessionN++;
        continue;
      }

      // Próximo bloqueio dentro desta janela
      const nextBlock = blocked.find((b) => b.start > cur && b.start < winEnd);
      const nextBlockStart = nextBlock ? nextBlock.start : winEnd;
      const gap = nextBlockStart - cur;

      // Gap menor que pomo: mini ou stretch
      if (gap < cfg.pomo && gap > 0) {
        const half = cfg.pomo / 2;
        const lastStudy = [...blocks].reverse().find((b) => b.type === 'estudo');
        if (gap >= half) {
          const estudoN = blocks.filter((b) => b.type === 'estudo').length + 1;
          blocks.push({
            time: minsToTime(cur),
            endTime: minsToTime(cur + gap),
            name: `📖 Estudo ${estudoN}`,
            type: 'estudo',
            xp: calcXP(gap),
            session: sessionN,
            mini: true,
          });
        } else if (lastStudy) {
          lastStudy.endTime = minsToTime(timeToMins(lastStudy.endTime) + gap);
          lastStudy.xp = calcXP(timeToMins(lastStudy.endTime) - timeToMins(lastStudy.time));
        }
        cur = nextBlockStart;
        continue;
      }

      // Pomodoro normal
      const estudoN = blocks.filter((b) => b.type === 'estudo').length + 1;
      blocks.push({
        time: minsToTime(cur),
        endTime: minsToTime(cur + cfg.pomo),
        name: `📖 Estudo ${estudoN}`,
        type: 'estudo',
        xp: calcXP(cfg.pomo),
        session: sessionN,
      });
      cur += cfg.pomo;
      pomoCount++;

      const isLong = pomoCount % 4 === 0;
      if (isLong) sessionN++;
      const breakDur = isLong ? cfg.longBreak : cfg.shortBreak;
      const breakName = isLong ? '☕ Pausa longa' : '🧘 Pausa';
      const bxp = Math.max(1, breakDur);
      const afterBreak = cur + breakDur;
      // `>=`: um bloqueio que começa exatamente onde o pomo terminou também conta.
      // Senão a pausa era emitida por cima do evento (bug anterior à migração).
      const nextBlockAfterBreak = blocked.find((b) => b.start >= cur && b.start < winEnd);
      const nextStartAfterBreak = nextBlockAfterBreak ? nextBlockAfterBreak.start : winEnd;

      if (afterBreak > nextStartAfterBreak) {
        cur = nextStartAfterBreak;
        continue;
      }
      const pausaExataAteBloqueio = afterBreak === nextStartAfterBreak;
      if (pausaExataAteBloqueio || afterBreak + cfg.pomo <= nextStartAfterBreak) {
        blocks.push({
          time: minsToTime(cur),
          endTime: minsToTime(afterBreak),
          name: breakName,
          type: 'pausa',
          xp: bxp,
          session: sessionN,
        });
        cur = afterBreak;
      } else if (nextStartAfterBreak < winEnd) {
        continue;
      } else {
        break;
      }
    }

    // Próxima janela = nova sessão (separação visual)
    sessionN++;
  }

  // Bloqueios depois da última janela — emite pra não esconder do plano
  const lastWinEnd = windows[windows.length - 1]!.end;
  blocked.filter((b) => b.start >= lastWinEnd).forEach((b) => emitBlocked(b));

  // Último bloco deve ser sempre um estudo (limpa pausas finais)
  while (blocks.length > 0 && blocks[blocks.length - 1]!.type === 'pausa') {
    blocks.pop();
  }

  return blocks;
}

/** Horário em que o dia realmente termina (fim do último estudo gerado). */
export function calcActualEnd(cfg: PlannerConfig): TimeString {
  const blocks = generateBlocks(cfg, []);
  const lastStudy = [...blocks].reverse().find((b) => b.type === 'estudo');
  return lastStudy ? lastStudy.endTime : cfg.end;
}
