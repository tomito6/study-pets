// "Apagar evento?": avulso tem um botão; série tem "Só este dia" e "Apagar a série".

import { deleteEvent, deleteSeries, deleteSeriesOccurrence } from '../../application/events';
import type { DateKey, StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';
import { Modal } from '../shell/Modal';

const t = strings.events.remove;

export interface EventToDelete {
  dateKey: DateKey;
  block: StudyBlock;
}

interface Props {
  target: EventToDelete | null;
  onClose: () => void;
}

export function EventDeleteModal({ target, onClose }: Props) {
  const seriesId = target?.block._seriesId ?? null;
  const name = (target?.block.name ?? '').replace(/^📅\s*/, '');

  const removeOnce = () => {
    if (target && seriesId) deleteSeriesOccurrence(seriesId, target.dateKey);
    onClose();
  };
  const removeMain = () => {
    if (target) {
      if (seriesId) deleteSeries(seriesId, target.dateKey);
      else deleteEvent(target.dateKey, target.block.time);
    }
    onClose();
  };

  return (
    <Modal id="event-delete-confirm" open={!!target} title={t.title} onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, lineHeight: 1.5 }} id="event-delete-text">
        {seriesId ? (
          <>{t.seriesText[0]}<strong id="event-delete-name">{name}</strong>{t.seriesText[1]}</>
        ) : (
          <>{t.singleText[0]}<strong id="event-delete-name">{name}</strong>{t.singleText[1]}</>
        )}
      </p>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        {seriesId && (
          <button className="reset-btn" id="event-delete-once-btn" onClick={removeOnce}>{t.onlyToday}</button>
        )}
        <button className="danger-btn" id="event-delete-main-btn" onClick={removeMain}>
          {seriesId ? t.deleteSeries : t.delete}
        </button>
      </div>
    </Modal>
  );
}
