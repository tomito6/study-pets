// Gerador do plano do dia: transforma config + eventos (+ as pausas registradas do dia)
// numa lista de blocos. Função pura — a memoização vive fora daqui, em quem chama.

import type { BlockType, PauseRecord, PlannerConfig, StudyBlock, StudyEvent, TimeString } from './types';
import { startsWithEmoji } from './eventPresets';
import { pausedMinutes } from './pauses';
import { blockMins, minsToTime, timeToMins } from './time';
import { calcXP } from './progression';

interface BlockedSpan {
  start: number;
  end: number;
  name: string;
  type: BlockType;
  _seriesId?: string;
}

/** Uma pausa registrada: o minuto do dia em que começou, e quanto durou em segundos. */
interface PauseSpan {
  at: number;
  secs: number;
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
 *   último estudo — antes de um evento E no fim da janela;
 * - no fim da janela a pausa do pomodoro só é emitida se ainda couber meio pomo de
 *   estudo depois dela: senão ela seria o último bloco do dia, descartada no fim e
 *   levando o tempo junto (era daí que vinham os 20 min mortos do dia padrão);
 * - o último estudo só é esticado se termina exatamente onde a sobra começa — senão
 *   ele passaria por cima da pausa ou do evento que está entre os dois;
 * - o último bloco do dia nunca é pausa.
 *
 * **Pausas registradas** (`pauses`, ver `PauseRecord`): chegam em SEGUNDOS, e o bloco que contém o minuto
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
    .map((w) => ({ start: timeToMins(w.start), end: timeToMins(w.end), live: w.live }))
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
    .filter((p) => p && isTime(p.at) && Number.isInteger(p.secs) && p.secs >= 1)
    .map((p) => ({ at: timeToMins(p.at), secs: p.secs }))
    .sort((a, b) => a.at - b.at);

  const blocks: StudyBlock[] = [];
  let cycleN = 0;

  /**
   * Coloca um estudo/pausa de `len` minutos que valem a partir de `start`: cada pausa
   * registrada que cai dentro dele estica o fim (uma segunda pausa pode cair no
   * trecho já esticado — por isso o laço olha o fim que cresce), e `limit` (o
   * próximo bloqueio ou o fim da janela) corta o que passar dele.
   *
   * **O arredondamento é do TOTAL, não de cada pausa** (2026-09-13): as pausas chegam em
   * segundos e o que estica o bloco é `pausedMinutes` da SOMA, então dez toques em
   * Pausar/Retomar dentro de sete segundos esticam um minuto, não dez. Cada pausa recebe
   * só a diferença que ela completou (`add`, muitas vezes zero), e é essa diferença que o
   * corte usa — assim um registro que não virou minuto nenhum também não ocupa espaço.
   * Registro antigo (minutos × 60) devolve exatamente os minutos de antes, um a um.
   */
  function place(start: number, len: number, limit: number): Placed {
    let end = start + len;
    let secs = 0; // segundos pausados acumulados dentro deste bloco
    let mins = 0; // quantos minutos eles já valeram
    const inside: { at: number; mins: number }[] = [];
    for (const p of pauseSpans) {
      if (p.at < start) continue;
      if (p.at >= end) break; // ordenadas: nenhuma depois cabe
      secs += p.secs;
      const total = pausedMinutes(secs);
      const add = total - mins;
      mins = total;
      end += add;
      inside.push({ at: p.at, mins: add });
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
      cycle: cycleN,
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
      cycle: cycleN,
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

  /**
   * O último estudo emitido, se ele termina exatamente em `at` E começou dentro da janela
   * atual — o único que pode ser esticado. O recorte por janela importa: com duas janelas
   * coladas (09:00–12:00 e 12:00–12:20, que `validateDayWindows` aceita), o último estudo da
   * primeira termina exatamente na fronteira e virava candidato a esticar pela segunda,
   * atravessando as duas. Bug antigo, e ficou mais fácil de encostar nele agora que a janela
   * fecha exata quase sempre.
   */
  const studyEndingAt = (at: number, winStart: number): StudyBlock | null => {
    const last = [...blocks].reverse().find((b) => b.type === 'estudo');
    if (!last || timeToMins(last.endTime) !== at) return null;
    return timeToMins(last.time) >= winStart ? last : null;
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
      cycle: b.type === 'event' ? cycleN : undefined,
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
      cycleN++;
    }

    let cur = win.start;
    const winEnd = win.end;
    // O ritmo é da JANELA quando ela é uma corrida do modo ao vivo (ver `StudyWindow.live`);
    // senão é o da config, como sempre. `half` desce pra cá junto, porque depende dele.
    const live = win.live;
    const pomo = live ? live.pomo : cfg.pomo;
    const shortBreak = live ? live.shortBreak : cfg.shortBreak;
    const longBreak = live ? live.longBreak : cfg.longBreak;
    const half = pomo / 2;
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
        cycleN++;
        continue;
      }

      // Próximo bloqueio dentro desta janela
      const nextBlock = blocked.find((b) => b.start > cur && b.start < winEnd);
      const nextBlockStart = nextBlock ? nextBlock.start : winEnd;
      const gap = nextBlockStart - cur;

      // Gap menor que pomo: mini ou stretch. Sobra pequena que não encosta em estudo
      // nenhum (logo depois de um bloqueio, ou no começo de uma janela) fica livre.
      if (gap < pomo && gap > 0) {
        if (live) {
          // Numa corrida, a sobra É o que aconteceu: vira estudo da duração real. Nunca
          // `mini` (que é uma categoria do plano, não um fato) e nunca `stretch`, que
          // reescreveria um bloco que já foi vivido.
          pushStudy(cur, gap, nextBlockStart, false);
        } else {
          const lastStudy = studyEndingAt(cur, win.start);
          if (gap >= half) pushStudy(cur, gap, nextBlockStart, true);
          else if (lastStudy) stretch(lastStudy, gap, nextBlockStart);
        }
        cur = nextBlockStart;
        continue;
      }

      // Pomodoro normal
      const study = pushStudy(cur, pomo, nextBlockStart, false);
      cur = study.end;
      if (study.effective <= 0) continue; // a pausa registrada comeu o bloco inteiro: segue do corte
      pomoCount++;

      const isLong = pomoCount % 4 === 0;
      const breakDur = isLong ? longBreak : shortBreak;
      const breakName = isLong ? '☕ Pausa longa' : '🧘 Pausa';
      const afterBreak = cur + breakDur;
      // `>=`: um bloqueio que começa exatamente onde o pomo terminou também conta.
      // Senão a pausa era emitida por cima do evento (bug anterior à migração).
      const nextBlockAfterBreak = blocked.find((b) => b.start >= cur && b.start < winEnd);

      if (nextBlockAfterBreak) {
        // ---- Antes de um bloqueio (evento, refeição): nada muda. ----
        // A pausa que encosta exatamente nele é descanso de verdade, e a que não cabe some
        // pra caber um estudo inteiro (decisão de 2026-09-03) — inclusive deixando dois
        // estudos colados, que é comportamento registrado e não acidente.
        const ate = nextBlockAfterBreak.start;
        if (isLong) cycleN++;
        if (afterBreak > ate) {
          cur = ate;
          continue;
        }
        if (afterBreak === ate || afterBreak + pomo <= ate) {
          cur = pushBreak(cur, breakDur, ate, breakName).end;
        }
        continue;
      }

      // ---- Fim da janela ----
      // A pausa do pomodoro existe pra separar dois estudos. Se depois dela não couber pelo
      // menos meio pomo, ela seria o último bloco do dia — emitida aqui e jogada fora no laço
      // final ("o último bloco é sempre estudo"), levando o tempo dela junto. Era exatamente
      // daí que vinham os 20 minutos mortos do dia padrão: 09:00–18:00 fecha 4 ciclos redondos,
      // a pausa longa das 17:40 preenchia até as 18:00 e era descartada. A condição de "encosta
      // exatamente no limite" nasceu pro caso do EVENTO e vazava pra cá, onde não há nada em
      // que encostar. Sem pausa, não há ciclo novo: senão o último estudo do dia nasceria
      // sozinho num divisor só dele.
      // A conta é com `place` porque uma pausa registrada do timer que caia dentro da pausa do
      // pomodoro também a estica.
      // DESLIGAMENTO 2 (corrida): a guarda abaixo existe pra não emitir uma pausa que
      // seria o último bloco do dia e acabaria descartada. Numa corrida ela atrapalha: a
      // pausa aconteceu, e sem isto uma janela 09:00–09:40 devolveria só o estudo de 25 e
      // comeria os 15 minutos restantes — pior do que hoje.
      const fimDaPausa = place(cur, breakDur, winEnd).end;
      if (live || winEnd - fimDaPausa >= half) {
        if (isLong) cycleN++;
        cur = pushBreak(cur, breakDur, winEnd, breakName).end;
        continue;
      }

      // O pomo já encostou no fim da janela (uma pausa registrada pode ter esticado ele até lá):
      // não há sobra, e não há o que decidir. Sem esta guarda o `stretch` de baixo seria chamado
      // com `extra` zero — e não é no-op: ele reposiciona o bloco, e uma pausa que começa
      // exatamente no fim dele deixa de ser contada, encolhendo o bloco e sumindo com o `paused`.
      if (cur >= winEnd) break;

      // Sem pausa, a sobra é resolvida AQUI, e não voltando pro topo do laço: lá a decisão é em
      // minutos de relógio, e uma pausa registrada que cubra a sobra inteira faria o mini nascer
      // vazio — o tempo morreria de novo, um nível abaixo. `effective` é o que de fato vale.
      const sobra = place(cur, winEnd - cur, winEnd);
      const ultimo = studyEndingAt(cur, win.start);
      // DESLIGAMENTO 3 (corrida): mesma razão do 1 — o que sobrou é tempo que passou.
      if (live) pushStudy(cur, winEnd - cur, winEnd, false);
      else if (sobra.effective >= half) pushStudy(cur, winEnd - cur, winEnd, true);
      else if (ultimo) stretch(ultimo, winEnd - cur, winEnd);
      cur = winEnd;
    }

    // Próxima janela = novo ciclo (separação visual)
    cycleN++;
  }

  // Bloqueios depois da última janela — emite pra não esconder do plano
  const lastWinEnd = windows[windows.length - 1]!.end;
  blocked.filter((b) => b.start >= lastWinEnd).forEach((b) => emitBlocked(b));

  // Último bloco deve ser sempre um estudo (limpa pausas finais).
  //
  // DESLIGAMENTO 4 (corrida): a última janela ser uma corrida muda isso. Parar no meio
  // de uma pausa é um fato, e descartá-la apagaria minutos que aconteceram — além de
  // fazer o plano discordar do que a pessoa viu na tela. A pergunta é sobre a ÚLTIMA
  // janela porque os blocos saem em ordem: o último bloco é dela.
  const ultimaAoVivo = !!windows[windows.length - 1]!.live;
  while (!ultimaAoVivo && blocks.length > 0 && blocks[blocks.length - 1]!.type === 'pausa') {
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
