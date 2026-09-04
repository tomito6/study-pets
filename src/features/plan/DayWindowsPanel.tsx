// "Janelas do dia": as janelas de estudo só deste dia — o mesmo editor das
// Configurações, num modal. Mais os atalhos: "Começar agora" (só hoje), "Dia livre"
// (com confirmação curta) e "Restaurar rotina" quando o dia está editado.

import { useEffect, useState } from 'react';
import {
  clearDayWindows,
  dayWindowsOverride,
  effectiveWindows,
  isDayOffKey,
  setDayOff,
  setDayWindows,
  startNow,
} from '../../application/dayWindows';
import type { DayWindowsRefusal } from '../../application/dayWindows';
import { dk } from '../../domain/time';
import type { DateKey, StudyWindow } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { StudyWindowsEditor, appendWindow } from '../settings/StudyWindowsEditor';
import { Modal } from '../shell/Modal';

const t = strings.dayWindows;

interface Props {
  /** Dia sendo editado; null = fechado. */
  dateKey: DateKey | null;
  onClose: () => void;
}

export function DayWindowsPanel({ dateKey, onClose }: Props) {
  const [windows, setWindows] = useState<StudyWindow[]>([]);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    if (!dateKey) return;
    setWindows(effectiveWindows(dateKey).map((w) => ({ ...w })));
    setConfirmOff(false);
  }, [dateKey]);

  const key = dateKey ?? '';
  const isToday = key === dk(new Date());
  const off = key ? isDayOffKey(key) : false;
  const edited = key ? dayWindowsOverride(key) !== null : false;
  const refuse = (reason: DayWindowsRefusal) => showToast(t.refusal[reason]);

  const save = () => {
    const r = setDayWindows(key, windows);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.saved);
    onClose();
  };
  const doStartNow = () => {
    const r = startNow(key);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.startedNow(r.start));
    onClose();
  };
  const doOff = () => {
    const r = setDayOff(key);
    setConfirmOff(false);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.dayOffSet);
    onClose();
  };
  const restore = () => {
    const r = clearDayWindows(key);
    if (!r.ok) {
      refuse(r.reason);
      return;
    }
    showToast(t.restored);
    onClose();
  };

  return (
    <Modal id="day-windows-panel" open={!!dateKey} title={t.title} onClose={onClose}>
      <p className="dw-intro">{t.intro}</p>
      {windows.length > 0 ? (
        <div className="field-group">
          <div className="dw-head">
            <label>{t.windowsLabel}</label>
            <button type="button" className="add-block-btn" id="day-windows-add" onClick={() => setWindows(appendWindow(windows))}>{t.add}</button>
          </div>
          <StudyWindowsEditor windows={windows} onChange={setWindows} />
        </div>
      ) : (
        <div className="field-group">
          <div className="dw-off-note" id="day-windows-off-note">{t.offNote}</div>
          <button type="button" className="ghost-btn" id="day-windows-add" onClick={() => setWindows(appendWindow([]))}>{t.add}</button>
        </div>
      )}
      <div className="dw-actions">
        {isToday && !off && (
          <button type="button" className="ghost-btn" id="day-windows-start-now" onClick={doStartNow}>{t.startNow}</button>
        )}
        {!off && !confirmOff && (
          <button type="button" className="ghost-btn" id="day-windows-off" onClick={() => setConfirmOff(true)}>{t.dayOff}</button>
        )}
        {confirmOff && (
          <div className="dw-confirm" id="day-windows-off-confirm-box">
            <span>{t.dayOffConfirm}</span>
            <div className="btn-row">
              <button type="button" className="reset-btn" onClick={() => setConfirmOff(false)}>{t.back}</button>
              <button type="button" className="save-btn" id="day-windows-off-confirm" onClick={doOff}>{t.dayOffYes}</button>
            </div>
          </div>
        )}
        {edited && (
          <button type="button" className="ghost-btn" id="day-windows-restore" onClick={restore}>{t.restore}</button>
        )}
      </div>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button type="button" className="save-btn" id="day-windows-save" onClick={save} disabled={windows.length === 0}>{t.save}</button>
      </div>
    </Modal>
  );
}
