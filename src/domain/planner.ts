// Gerador do plano do dia: transforma config + eventos (+ as pausas registradas do dia)
// numa lista de blocos. Função pura — a memoização vive fora daqui, em quem chama.

import type { BlockType, PauseRecord, PlannerConfig, StudyBlock, StudyEvent, TimeString } from './types';
import { startsWithEmoji } from './eventPresets';
import { blockMins, minsToTime, timeToMins } from './time';
import { calcXP } from './progression';

interface BlockedSpan {
  start: number;
  end: number;
  name: string;
  type: BlockType;
  _seriesId?: string;
}

/** Uma pausa registrada, em minutos desde a meia-noite. */
interface PauseSpan {
  at: number;
  mins: number;
}

/** O que sobrou depois de colocar um estudo/pausa: onde terminou e quanto dele foi pausa. */
interface Placed {
  end: number;
  paused: number;
  /** Minutos que valem (do início ao fim, menos a pausa). Zero = não há o que emitir. */
  effective: number;
}

const isTime = (v: unknown): v is TimeString => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

/**
 * Gera os blocos de um dia.
 *
 * Regras que o comportamento original garante e que os testes protegem:
 * - as janelas de estudo são a fonte da verdade; `start`/`end` só entram como
 *   fallback pra config antiga sem `studyWindows`;
 * - eventos bloqueiam tempo e quebram a sessão (a refeição é um deles — o almoço
 *   saiu da config em 2026-09-06);
 * - evento com `countsAsStudy !== false` vira bloco 'event' (dá XP); senão vira
 *   'intervalo' (só ocupa o espaço);
 * - sobra menor que um pomo vira mini-estudo (se >= metade do pomo) ou estica o
 *   último estudo — antes de um evento E no fim da janela (até 2026-09-10 a sobra
 *   no fim da janela era jogada fora: 20 min sobrando com pomo de 25 não viravam nada);
 * - o último estudo só é esticado se termina exatamente onde a sobra começa — senão
 *   ele passaria por cima da pausa ou do evento que está entre os dois;
 * - o último bloco do dia nunca é pausa.
 *
 * **Pausas registradas** (`pauses`, ver `PauseRecord`): o bloco que contém o minuto
 * `at` fica `mins` mais longo (o cursor anda junto, então tudo que vem depois no dia
 * desliza); eventos e o fim da janela não se movem, então um bloco empurrado contra
 * eles é cortado ali — o último estudo do dia encolhe, ou some. O bloco continua um
 * só (mesma chave de check, mesmo "Estudo N"), com `paused` dizendo quanto do
 * intervalo foi pausa; a duração que vale é `blockMins`. Pausa que não cai em
 * estudo/pausa nenhum (o dia foi reeditado depois) é ignorada em silêncio.
 */
export function generateBlocks(cfg: PlannerConfig, events: StudyEvent[] = [], pauses: PauseRecord[] = []): StudyBlock[] {
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

  // Bloqueios: eventos (countsAsStudy=true→'event', false→'intervalo').
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
  blocked.sort((a, b) => a.start - b.start);

  const pauseSpans: PauseSpan[] = pauses
    .filter((p) => p && isTime(p.at) && Number.isInteger(p.mins) && p.mins >= 1)
    .map((p) => ({ at: timeToMins(p.at), mins: p.mins }))
    .sort((a, b) => a.at - b.at);

  const blocks: StudyBlock[] = [];
  let sessionN = 0;
  const half = cfg.pomo / 2;

  /**
   * Coloca um estudo/pausa de `len` minutos que valem a partir de `start`: cada pausa
   * registrada que cai dentro dele estica o fim (uma segunda pausa pode cair no
   * trecho já esticado — por isso o laço olha o fim que cresce), e `limit` (o
   * próximo bloqueio ou o fim da janela) corta o que passar dele.
   */
  function place(start: number, len: number, limit: number): Placed {
    let end = start + len;
    const inside: PauseSpan[] = [];
    for (const p of pauseSpans) {
      if (p.at < start) continue;
      if (p.at >= end) break; // ordenadas: nenhuma depois cabe
      end += p.mins;
      inside.push(p);
    }
    const cut = Math.min(end, limit);
    let paused = 0;
    for (const p of inside) paused += Math.max(0, Math.min(p.at + p.mins, cut) - p.at);
    return { end: cut, paused, effective: cut - start - paused };
  }

  const nextStudyName = (): string => `📖 Estudo ${blocks.filter((b) => b.type === 'estudo').length + 1}`;

  /** Emite um estudo; devolve onde ele terminou (o `limit`, se a pausa comeu tudo e nada foi emitido). */
  function pushStudy(start: number, len: number, limit: number, mini: boolean): Placed {
    const r = place(start, len, limit);
    if (r.effective <= 0) return r;
    const out: StudyBlock = {
      time: minsToTime(start),
      endTime: minsToTime(r.end),
      name: nextStudyName(),
      type: 'estudo',
      xp: calcXP(r.effective),
      session: sessionN,
    };
    if (mini) out.mini = true;
    if (r.paused > 0) out.paused = r.paused;
    blocks.push(out);
    return r;
  }

  function pushBreak(start: number, len: number, limit: number, name: string): Placed {
    const r = place(start, len, limit);
    if (r.effective <= 0) return r;
    const out: StudyBlock = {
      time: minsToTime(start),
      endTime: minsToTime(r.end),
      name,
      type: 'pausa',
      xp: Math.max(1, r.effective),
      session: sessionN,
    };
    if (r.paused > 0) out.paused = r.paused;
    blocks.push(out);
    return r;
  }

  /** Estica o estudo em `extra` minutos que valem, refazendo a conta das pausas dele. */
  function stretch(study: StudyBlock, extra: number, limit: number): void {
    const start = timeToMins(study.time);
    const r = place(start, blockMins(study) + extra, limit);
    study.endTime = minsToTime(r.end);
    study.xp = calcXP(r.effective);
    if (r.paused > 0) study.paused = r.paused;
    else delete study.paused;
  }

  /** O último estudo emitido, se ele termina exatamente em `at` — o único que pode ser esticado. */
  const studyEndingAt = (at: number): StudyBlock | null => {
    const last = [...blocks].reverse().find((b) => b.type === 'estudo');
    return last && timeToMins(last.endTime) === at ? last : null;
  };

  // Emite um bloqueio como block (evento/intervalo) preservando metadados úteis.
  // Evento (e intervalo vindo de série) ganha 📅 na frente — a menos que o nome já traga o
  // próprio ícone ("🍽️ Refeição"). Intervalo avulso fica com o nome cru (comportamento antigo).
  function emitBlocked(b: BlockedSpan): void {
    const prefix = (b.type === 'event' || (b.type === 'intervalo' && b._seriesId)) && !startsWithEmoji(b.name);
    const out: StudyBlock = {
      time: minsToTime(b.start),
      endTime: minsToTime(b.end),
      name: prefix ? `📅 ${b.name}` : b.name,
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

      // Gap menor que pomo: mini ou stretch. Sobra pequena que não encosta em estudo
      // nenhum (logo depois de um bloqueio, ou no começo de uma janela) fica livre.
      if (gap < cfg.pomo && gap > 0) {
        const lastStudy = studyEndingAt(cur);
        if (gap >= half) pushStudy(cur, gap, nextBlockStart, true);
        else if (lastStudy) stretch(lastStudy, gap, nextBlockStart);
        cur = nextBlockStart;
        continue;
      }

      // Pomodoro normal
      const study = pushStudy(cur, cfg.pomo, nextBlockStart, false);
      cur = study.end;
      if (study.effective <= 0) continue; // a pausa registrada comeu o bloco inteiro: segue do corte
      pomoCount++;

      const isLong = pomoCount % 4 === 0;
      if (isLong) sessionN++;
      const breakDur = isLong ? cfg.longBreak : cfg.shortBreak;
      const breakName = isLong ? '☕ Pausa longa' : '🧘 Pausa';
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
        cur = pushBreak(cur, breakDur, nextStartAfterBreak, breakName).end;
      } else if (nextStartAfterBreak < winEnd) {
        // Antes de um evento a pausa some pra caber um estudo inteiro (ou um mini) — decisão de 2026-09-03.
        continue;
      } else if (winEnd - afterBreak >= half) {
        // Fim da janela: cabe a pausa e ainda sobra pelo menos meio pomo — a sobra vira um mini.
        cur = pushBreak(cur, breakDur, winEnd, breakName).end;
      } else {
        // Sobra menor que isso: sem pausa, o último estudo vai até o fim da janela.
        const last = studyEndingAt(cur);
        if (last) stretch(last, winEnd - cur, winEnd);
        cur = winEnd;
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
