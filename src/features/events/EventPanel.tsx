// "Novo Evento": avulso ou série recorrente, com atalhos no topo (refeição, reunião,
// café, deslocamento) que só preenchem o formulário. Reabre sempre com os defaults,
// pré-selecionando o dia da semana do dia visível. Com `edit`, vira "Editar evento":
// os campos vêm preenchidos e Salvar substitui o avulso — ou, numa série, só este
// dia (o dia vira exceção e ganha um avulso) ou a série inteira, como o usuário escolher.

import { useEffect, useState } from 'react';
import {
  addEvent,
  addEventSeries,
  updateEvent,
  updateSeries,
  updateSeriesOccurrence,
  validateEvent,
  validateSeries,
} from '../../application/events';
import type { EventEditTarget } from '../../application/events';
import { ALL_WEEKDAYS, EVENT_PRESETS, presetFields, presetLabel } from '../../domain/eventPresets';
import type { EventPresetId } from '../../domain/eventPresets';
import { dateFromKey } from '../../domain/time';
import type { DateKey, RecurrenceFreq } from '../../domain/types';
import { strings } from '../../shared/strings';
import { Modal } from '../shell/Modal';

const t = strings.events.panel;
const CHIPS: Array<{ dow: number; label: string }> = [
  { dow: 1, label: 'Seg' }, { dow: 2, label: 'Ter' }, { dow: 3, label: 'Qua' }, { dow: 4, label: 'Qui' },
  { dow: 5, label: 'Sex' }, { dow: 6, label: 'Sáb' }, { dow: 0, label: 'Dom' },
];
/** Editando uma série: só a ocorrência deste dia, ou a série inteira. */
type EditScope = 'day' | 'series';

interface Props {
  open: boolean;
  /** Dia visível no Plano — onde o evento avulso entra, e a âncora da série. */
  dateKey: DateKey;
  /** Presente = modo edição. */
  edit?: EventEditTarget | null;
  onClose: () => void;
}

export function EventPanel({ open, dateKey, edit = null, onClose }: Props) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('11:30');
  const [end, setEnd] = useState('13:00');
  const [counts, setCounts] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [freq, setFreq] = useState<RecurrenceFreq>('weekly');
  const [until, setUntil] = useState('');
  const [preset, setPreset] = useState<EventPresetId | null>(null);
  const [scope, setScope] = useState<EditScope>('day');

  useEffect(() => {
    if (!open) return;
    setPreset(null);
    setScope('day');
    if (edit?.kind === 'single') {
      setName(edit.event.name);
      setStart(edit.event.start);
      setEnd(edit.event.end);
      setCounts(edit.event.countsAsStudy !== false);
      setRepeat(false);
      setWeekdays([]);
      setFreq('weekly');
      setUntil('');
      return;
    }
    if (edit?.kind === 'series') {
      setName(edit.series.name);
      setStart(edit.series.start);
      setEnd(edit.series.end);
      setCounts(edit.series.countsAsStudy !== false);
      setRepeat(true);
      setWeekdays([...edit.series.weekdays]);
      setFreq(edit.series.freq);
      setUntil(edit.series.until || '');
      return;
    }
    setName('');
    setStart('11:30');
    setEnd('13:00');
    setCounts(true);
    setRepeat(false);
    setWeekdays([dateFromKey(dateKey).getDay()]);
    setFreq('weekly');
    setUntil('');
  }, [open, dateKey, edit]);

  const toggleWeekday = (dow: number) =>
    setWeekdays((w) => (w.includes(dow) ? w.filter((d) => d !== dow) : [...w, dow]));

  /** Um atalho preenche o formulário; "Outro" volta aos defaults. Nada é salvo aqui. */
  const applyPreset = (id: EventPresetId | null) => {
    setPreset(id);
    const p = EVENT_PRESETS.find((x) => x.id === id);
    if (!p) {
      setName('');
      setStart('11:30');
      setEnd('13:00');
      setCounts(true);
      setRepeat(false);
      setWeekdays([dateFromKey(dateKey).getDay()]);
      setFreq('weekly');
      setUntil('');
      return;
    }
    const f = presetFields(p);
    setName(f.name);
    setStart(f.start);
    setEnd(f.end);
    setCounts(f.countsAsStudy);
    setRepeat(f.repeatDaily);
    setWeekdays(f.repeatDaily ? [...ALL_WEEKDAYS] : [dateFromKey(dateKey).getDay()]);
    setFreq('weekly');
    setUntil('');
  };

  const save = () => {
    const base = { name, start, end, countsAsStudy: counts };
    if (edit?.kind === 'single') {
      const r = updateEvent(edit.dateKey, edit.event.start, base);
      if (!r.ok) { alert(t.validation[r.reason]); return; }
    } else if (edit?.kind === 'series') {
      const r =
        scope === 'day'
          ? updateSeriesOccurrence(edit.series.id, dateKey, base)
          : updateSeries(edit.series.id, { ...base, weekdays, freq, until: until || null }, dateKey);
      if (!r.ok) { alert(t.validation[r.reason]); return; }
    } else if (repeat) {
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

  const editing = edit !== null;
  const editingSeries = edit?.kind === 'series';
  const showRecurrence = editing ? editingSeries && scope === 'series' : repeat;

  return (
    <Modal id="event-panel" open={open} title={editing ? t.editTitle : t.title} onClose={onClose}>
      {!editing && (
        <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          💡 <strong style={{ color: 'var(--text)' }}>{t.tip1Title}</strong> {t.tip1}
          <br /><br />
          ⏱️ <strong style={{ color: 'var(--text)' }}>{t.tip2Title}</strong> {t.tip2}
        </div>
      )}
      {!editing && (
        <div className="field-group">
          <label>{t.presets}</label>
          <div className="preset-row" id="ev-presets">
            {EVENT_PRESETS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={'weekday-chip preset-chip' + (preset === p.id ? ' selected' : '')}
                data-preset={p.id}
                onClick={() => applyPreset(p.id)}
              >
                {presetLabel(p)}
              </button>
            ))}
            <button
              type="button"
              className={'weekday-chip preset-chip' + (preset === null ? ' selected' : '')}
              data-preset="other"
              onClick={() => applyPreset(null)}
            >
              {t.presetOther}
            </button>
          </div>
        </div>
      )}
      {editingSeries && (
        <div className="field-group">
          <label>{t.scope}</label>
          <div className="preset-row" id="ev-scope" role="radiogroup">
            {(['day', 'series'] as const).map((s) => (
              <button
                type="button"
                key={s}
                role="radio"
                aria-checked={scope === s}
                className={'weekday-chip' + (scope === s ? ' selected' : '')}
                data-scope={s}
                onClick={() => setScope(s)}
              >
                {s === 'day' ? t.scopeDay : t.scopeSeries}
              </button>
            ))}
          </div>
          <div className="field-sublabel" style={{ marginTop: 8, lineHeight: 1.5 }} id="ev-edit-series-note">
            {scope === 'day' ? t.editDayNote : t.editSeriesNote}
          </div>
        </div>
      )}
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
        {!editing && (
          <div className="checkbox-row">
            <input type="checkbox" id="ev-repeat" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <label htmlFor="ev-repeat" style={{ fontSize: 13 }}>{t.repeat}</label>
          </div>
        )}
        <div className={'recurrence-section' + (showRecurrence ? ' show' : '')} id="ev-repeat-section">
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
        <button className="save-btn" id="ev-save" onClick={save}>{editing ? t.save : t.add}</button>
      </div>
    </Modal>
  );
}
