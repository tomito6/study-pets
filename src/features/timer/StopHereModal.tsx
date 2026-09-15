// A folha do "■ Parar por aqui": o dia acaba agora, e o bloco em andamento entra com
// a duração real. Ela só aparece quando há algo a contar — parar um bloco que nem
// completou um minuto para e pronto, sem cerimônia.
//
// É filha do `#focus-overlay` (z-300 contra o z-200 do `.panel-overlay`), como o
// `HardcoreQuitModal` — senão ela abriria ATRÁS do foco.

import { playSound } from '../../application/alerts';
import { openFinishDay } from '../../application/dayEnd';
import { stopHere } from '../../application/pause';
import { calcXP, coinsForBlock } from '../../domain/progression';
import { pausedMinutes } from '../../domain/pauses';
import { blockMins } from '../../domain/time';
import { cleanBlockName } from '../../domain/timer';
import type { StudyBlock } from '../../domain/types';
import { Modal } from '../shell/Modal';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useSecondTick } from './useSecondTick';

const t = strings.timer;

/**
 * Minutos que o bloco em andamento já valeu, do início até agora (nunca negativo).
 *
 * Desconta as pausas já REGISTRADAS (`block.paused`) e a pausa ABERTA agora (`pausedAt`),
 * que ainda não é registro: sem a segunda, pausado há 20 min com 5 estudados a folha dizia
 * "25 min · +50 XP" e o bloco saía com 5 — `stopHere` registra a pausa antes do corte. A
 * pausa aberta entra em minutos cheios, pra cima, como o plano fará (`pausedMinutes`).
 */
export function minutesSoFar(block: Pick<StudyBlock, 'time' | 'paused'>, now: Date, pausedAt: number | null = null): number {
  const [h, m] = block.time.split(':').map(Number);
  const inicio = (h as number) * 60 + (m as number);
  const agora = now.getHours() * 60 + now.getMinutes();
  const aberta = pausedAt != null ? pausedMinutes(Math.round((now.getTime() - pausedAt) / 1000)) : 0;
  return Math.max(0, agora - inicio - (block.paused ?? 0) - aberta);
}

/**
 * "■ Parar por aqui" de verdade: o corte, e o toast que conta o ganho (nunca a perda). Serve a
 * folha e o ✕ da barra do timer num dia ao vivo — parar pelo ✕ deixava o bloco INTEIRO no
 * plano, sem check, o oposto exato do que a folha faz. O toast conta os minutos do bloco que
 * ficou (`blockMins`), não os da conta da folha: com uma pausa aberta os dois divergiam.
 */
export function stopHereNow(): void {
  const r = stopHere();
  if (!r.ok) return; // sem timer, em espera, dia encerrado, nada vivido: o timer já parou, e não há o que contar
  // O bloco parcial entrou marcado: é um check como o da lista, e soa como ele. Num dia ao
  // vivo é assim que a maioria das corridas termina — sem isto o modo inteiro acabava mudo,
  // enquanto o fim natural de um bloco na rotina toca o "deu certo".
  if (r.block) playSound('check');
  showToast(r.block ? t.stopped(r.at, cleanBlockName(r.block.name), blockMins(r.block), r.block.xp) : t.stoppedBare(r.at));
}

interface Props {
  open: boolean;
  block: StudyBlock;
  /** ms de quando o bloco foi pausado; null rodando (`derived.timerPausedAt`). */
  pausedAt: number | null;
  onClose: () => void;
}

export function StopHereModal({ open, block, pausedAt, onClose }: Props) {
  // Tique de minuto pela via do segundo: a conta muda na tela enquanto a folha está
  // aberta, senão o número envelhece na cara de quem está decidindo.
  useSecondTick(open);
  const now = new Date();
  const mins = minutesSoFar(block, now, pausedAt);
  const nome = cleanBlockName(block.name);
  const conta =
    mins >= 1 && block.type === 'estudo'
      ? t.stopSheet.count(nome, mins, calcXP(mins), coinsForBlock(block, mins))
      : t.stopSheet.nothing;

  const parar = (): void => {
    onClose();
    stopHereNow();
  };

  const encerrar = (): void => {
    parar();
    openFinishDay(); // a folha sugere; quem executa continua sendo o #finish-day-confirm
  };

  return (
    <Modal id="stop-here-confirm" open={open} title={t.stopSheet.title} onClose={onClose}>
      <p className="stop-count" id="stop-here-count">{conta}</p>
      <button className="stop-door" id="stop-here-btn" onClick={parar}>
        <span className="sd-t">{t.stopSheet.stop}</span>
        <span className="sd-s">{t.stopSheet.stopSub}</span>
      </button>
      <button className="stop-door" id="stop-here-finish" onClick={encerrar}>
        <span className="sd-t">{t.stopSheet.finish}</span>
        <span className="sd-s">{t.stopSheet.finishSub}</span>
      </button>
      <div className="btn-row stop-back">
        <button type="button" className="stop-back-btn" onClick={onClose}>{t.stopSheet.back}</button>
      </div>
    </Modal>
  );
}
