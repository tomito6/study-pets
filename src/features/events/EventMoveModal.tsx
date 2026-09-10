// Arrastou uma ocorrência de série: vale só pra este dia ou pra série inteira?
// É a mesma pergunta do chip "Aplicar a" no painel de edição, e a mesma do modal
// de apagar — só que feita depois do gesto, com o horário novo já escolhido.
// Evento avulso não passa por aqui: não há o que perguntar.

import { moveEvent } from '../../application/events';
import type { DropTarget, DragSource } from './useEventDrag';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { Modal } from '../shell/Modal';

const t = strings.events.move;

export interface PendingMove {
  source: DragSource;
  to: DropTarget;
}

interface Props {
  move: PendingMove | null;
  onClose: () => void;
}

export function EventMoveModal({ move, onClose }: Props) {
  const name = (move?.source.block.name ?? '').replace(/^📅\s*/, '');

  const apply = (scope: 'day' | 'series') => {
    if (move) {
      const { source, to } = move;
      const r = moveEvent(source.dateKey, source.block, { toDateKey: to.dateKey, start: to.start, end: to.end }, scope);
      if (!r.ok) showToast(t.refusal[r.reason]);
    }
    onClose();
  };

  return (
    <Modal id="event-move-scope" open={!!move} title={t.title} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, lineHeight: 1.5 }} id="event-move-text">
        {move && t.text(name, move.to.start, move.to.end)}
      </p>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="reset-btn" id="event-move-series" onClick={() => apply('series')}>{t.series}</button>
        <button className="save-btn" id="event-move-day" onClick={() => apply('day')}>{t.onlyToday}</button>
      </div>
    </Modal>
  );
}
