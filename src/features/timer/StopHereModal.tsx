// A folha do "■ Parar por aqui": o dia acaba agora, e o bloco em andamento entra com
// a duração real. Ela só aparece quando há algo a contar — parar um bloco que nem
// completou um minuto para e pronto, sem cerimônia.
//
// É filha do `#focus-overlay` (z-300 contra o z-200 do `.panel-overlay`), como o
// `HardcoreQuitModal` — senão ela abriria ATRÁS do foco.

import { openFinishDay } from '../../application/dayEnd';
import { stopHere } from '../../application/pause';
import { calcXP, coinsForBlock } from '../../domain/progression';
import { cleanBlockName } from '../../domain/timer';
import type { StudyBlock } from '../../domain/types';
import { Modal } from '../shell/Modal';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useSecondTick } from './useSecondTick';

const t = strings.timer;

/** Minutos que o bloco em andamento já valeu, do início até agora (nunca negativo). */
export function minutesSoFar(block: Pick<StudyBlock, 'time' | 'paused'>, now: Date): number {
  const [h, m] = block.time.split(':').map(Number);
  const inicio = (h as number) * 60 + (m as number);
  const agora = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, agora - inicio - (block.paused ?? 0));
}

interface Props {
  open: boolean;
  block: StudyBlock;
  onClose: () => void;
}

export function StopHereModal({ open, block, onClose }: Props) {
  // Tique de minuto pela via do segundo: a conta muda na tela enquanto a folha está
  // aberta, senão o número envelhece na cara de quem está decidindo.
  useSecondTick(open);
  const now = new Date();
  const mins = minutesSoFar(block, now);
  const nome = cleanBlockName(block.name);
  const conta =
    mins >= 1 && block.type === 'estudo'
      ? t.stopSheet.count(nome, mins, calcXP(mins), coinsForBlock(block, mins))
      : t.stopSheet.nothing;

  const parar = (): void => {
    onClose();
    const r = stopHere();
    if (!r.ok) return;
    showToast(
      r.block
        ? t.stopped(r.at, cleanBlockName(r.block.name), mins, r.block.xp)
        : t.stoppedBare(r.at),
    );
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
