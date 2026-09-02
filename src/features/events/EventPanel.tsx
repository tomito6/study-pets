// "Novo Evento": avulso ou série recorrente. Reabre sempre com os defaults,
// pré-selecionando o dia da semana do dia visível.

import { useEffect, useState } from 'react';
import { addEvent, addEventSeries, validateEvent, validateSeries } from '../../application/events';
import { dateFromKey } from '../../domain/time';
import type { DateKey, RecurrenceFreq } from '../../domain/types';
import { strings } from '../../shared/strings';
import { Modal } from '../shell/Modal';

const t = strings.events.panel;
const CHIPS: Array<{ dow: number; label: string }> = [
  { dow: 1, label: 'Seg' }, { dow: 2, label: 'Ter' }, { dow: 3, label: 'Qua' }, { dow: 4, label: 'Qui' },
  { dow: 5, label: 'Sex' }, { dow: 6, label: 'Sáb' }, { dow: 0, label: 'Dom' },
];

interface Props {
  open: boolean;
  /** Dia visível no Plano — onde o evento avulso entra, e a âncora da série. */
  dateKey: DateKey;
  onClose: () => void;
}

export function EventPanel({ open, dateKey, onClose }: Props) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('11:30');
  const [end, setEnd] = useState('13:00');
  const [counts, setCounts] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [freq, setFreq] = useState<RecurrenceFreq>('weekly');
  const [until, setUntil] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setStart('11:30');
    setEnd('13:00');
    setCounts(true);
    setRepeat(false);
    setWeekdays([dateFromKey(dateKey).getDay()]);
    setFreq('weekly');
    setUntil('');
  }, [open, dateKey]);

  const toggleWeekday = (dow: number) =>
    setWeekdays((w) => (w.includes(dow) ? w.filter((d) => d !== dow) : [...w, dow]));

  const save = () => {
    const base = { name, start, end, countsAsStudy: counts };
    if (repeat) {
      const input = { ...base, weekdays, freq, until: until || null };
      const v = validateSeries(input);
      if (!v.ok) { alert(t.validation[v.reason]); return; }
      addEventSeries(dateKey, input);
    } else {
      const v = validateEvent(base);
      if (!v.ok) { alert(t.validation[v.reason]); return; }
      addEvent(dateKey, base);
    }
    onClose();
  };

  return (
    <Modal id="event-panel" open={open} title={t.title} onClose={onClose}>
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        💡 <strong style={{ color: 'var(--text)' }}>{t.tip1Title}</strong> {t.tip1}
        <br /><br />
        ⏱️ <strong style={{ color: 'var(--text)' }}>{t.tip2Title}</strong> {t.tip2}
      </div>
      <div className="field-group">
        <label>{t.name}</label>
        <input type="text" id="ev-name" placeholder={t.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field-group">
        <label>{t.time}</label>
        <div className="field-row">
          <div><div className="field-sublabel">{t.start}</div><input type="time" id="ev-start" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><div className="field-sublabel">{t.end}</div><input type="time" id="ev-end" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
      </div>
      <div className="field-group" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
        <div className="checkbox-row">
          <input type="checkbox" id="ev-counts" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
          <label htmlFor="ev-counts" style={{ fontSize: 13 }}>{t.counts}</label>
        </div>
        <div className="field-sublabel" style={{ marginTop: 6, lineHeight: 1.5 }}>{t.countsHint}</div>
      </div>
      <div className="field-group">
        <div className="checkbox-row">
          <input type="checkbox" id="ev-repeat" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
          <label htmlFor="ev-repeat" style={{ fontSize: 13 }}>{t.repeat}</label>
        </div>
        <div className={'recurrence-section' + (repeat ? ' show' : '')} id="ev-repeat-section">
          <div className="field-sublabel">{t.weekdays}</div>
          <div className="weekday-row" id="ev-weekdays">
            {CHIPS.map((c) => (
              <button
                type="button"
                key={c.dow}
                className={'weekday-chip' + (weekdays.includes(c.dow) ? ' selected' : '')}
                data-dow={c.dow}
                onClick={() => toggleWeekday(c.dow)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="field-sublabel" style={{ marginTop: 12 }}>{t.freq}</div>
          <div className="freq-row">
            {(['weekly', 'biweekly', 'monthly'] as const).map((f) => (
              <label key={f}>
                <input type="radio" name="ev-freq" value={f} checked={freq === f} onChange={() => setFreq(f)} /> {t.freqs[f]}
              </label>
            ))}
          </div>
          <div className="field-sublabel" style={{ marginTop: 12 }}>{t.until}</div>
          <div className="field-row" style={{ alignItems: 'center' }}>
            <input type="date" id="ev-until" value={until} onChange={(e) => setUntil(e.target.value)} />
            <button type="button" className="ghost-btn" onClick={() => setUntil('')}>{t.noEnd}</button>
          </div>
        </div>
      </div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" onClick={save}>{t.add}</button>
      </div>
    </Modal>
  );
}
