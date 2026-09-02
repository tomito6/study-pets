// "Editar Almoço": horário e duração só deste dia. "↺ Padrão" volta pros valores da config.

import { useEffect, useState } from 'react';
import { lunchForDay, setLunchOverride } from '../../application/events';
import type { DateKey } from '../../domain/types';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { Modal } from '../shell/Modal';

const t = strings.events.lunch;

interface Props {
  /** Dia sendo editado; null = fechado. */
  dateKey: DateKey | null;
  onClose: () => void;
}

export function LunchPanel({ dateKey, onClose }: Props) {
  const config = useAppState((s) => s.config);
  const [start, setStart] = useState(config.lunch);
  const [dur, setDur] = useState(String(config.lunchDur));

  useEffect(() => {
    if (!dateKey) return;
    const cur = lunchForDay(dateKey);
    setStart(cur.lunch);
    setDur(String(cur.lunchDur));
  }, [dateKey]);

  const reset = () => {
    setStart(config.lunch);
    setDur(String(config.lunchDur));
  };
  const save = () => {
    if (!dateKey) return;
    setLunchOverride(dateKey, start, parseInt(dur, 10));
    onClose();
  };

  return (
    <Modal id="lunch-panel" open={!!dateKey} title={t.title} onClose={onClose}>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{t.onlyThisDay}</p>
      <div className="field-group">
        <label>{t.timeAndDuration}</label>
        <div className="field-row">
          <div><div className="field-sublabel">{t.start}</div><input type="time" id="lunch-edit-start" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><div className="field-sublabel">{t.duration}</div><input type="number" id="lunch-edit-dur" min="15" max="180" step="5" value={dur} onChange={(e) => setDur(e.target.value)} /></div>
        </div>
      </div>
      <div className="btn-row">
        <button className="reset-btn" onClick={reset}>{t.reset}</button>
        <button className="save-btn" onClick={save}>{t.save}</button>
      </div>
    </Modal>
  );
}
