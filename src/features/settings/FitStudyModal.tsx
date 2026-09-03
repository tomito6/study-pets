// Wizard "Encaixar estudo": o usuário diz os ideais e a flexibilidade; mostramos
// as 3 combinações que mais enchem o dia visível. "Aplicar" só preenche o
// formulário — o usuário confirma com Salvar, como no fluxo normal.

import { useEffect, useState } from 'react';
import { currentDayKey, getEventsForDate } from '../../application/plan';
import { fitStudySuggestions, formatCompact } from '../../domain/settings';
import type { FitSuggestion } from '../../domain/settings';
import { minsToTime } from '../../domain/time';
import type { PlannerConfig } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { state } from '../../store/store';
import { Modal } from '../shell/Modal';

const t = strings.settings.fit;

interface Props {
  open: boolean;
  /** A config como está no formulário (não salva) — respeita o que o usuário já mexeu. */
  cfgBase: PlannerConfig;
  onApply: (pomo: number, short: number, long: number) => void;
  onClose: () => void;
}

export function FitStudyModal({ open, cfgBase, onApply, onClose }: Props) {
  const [pomo, setPomo] = useState('25');
  const [short, setShort] = useState('5');
  const [long, setLong] = useState('20');
  const [flex, setFlex] = useState(10);
  const [top, setTop] = useState<FitSuggestion[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setPomo(String(state.config.pomo || 25));
    setShort(String(state.config.shortBreak || 5));
    setLong(String(state.config.longBreak || 20));
    setFlex(10);
    setTop(null);
  }, [open]);

  const run = () => {
    const ideal = {
      pomo: parseInt(pomo, 10) || 25,
      short: parseInt(short, 10) || 5,
      long: parseInt(long, 10) || 20,
      flex,
    };
    const key = currentDayKey();
    setTop(fitStudySuggestions(cfgBase, getEventsForDate(key), ideal));
  };

  const apply = (s: FitSuggestion) => {
    onApply(s.pomo, s.short, s.long);
    onClose();
    showToast(t.applied);
  };

  return (
    <Modal id="fit-study-panel" open={open} title={t.title} onClose={onClose}>
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        {t.intro}
      </div>
      <div className="field-group">
        <label>{t.pomo}</label>
        <input type="number" id="fs-pomo" min="15" max="90" step="5" value={pomo} onChange={(e) => setPomo(e.target.value)} />
      </div>
      <div className="field-group">
        <label>{t.short}</label>
        <input type="number" id="fs-short" min="3" max="20" step="1" value={short} onChange={(e) => setShort(e.target.value)} />
      </div>
      <div className="field-group">
        <label>{t.long}</label>
        <input type="number" id="fs-long" min="10" max="60" step="5" value={long} onChange={(e) => setLong(e.target.value)} />
      </div>
      <div className="field-group">
        <label>{t.flex}</label>
        <div className="freq-row">
          {[5, 10, 15].map((n) => (
            <label key={n}>
              <input type="radio" name="fs-flex" value={n} checked={flex === n} onChange={() => setFlex(n)} /> {t.flexOption(n)}
            </label>
          ))}
        </div>
      </div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="reset-btn" onClick={onClose}>{t.cancel}</button>
        <button className="save-btn" onClick={run}>{t.run}</button>
      </div>
      <div id="fs-suggestions" style={{ marginTop: 20 }}>
        {top && top.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t.none}</p>}
        {top?.map((s, i) => (
          <div className={'fs-card' + (i === 0 ? ' fs-best' : '')} key={`${s.pomo}-${s.short}-${s.long}`}>
            <div className="fs-head">{i === 0 ? t.best : t.option(i + 1)}</div>
            <div className="fs-stats">
              {t.stats.pomo} <strong>{s.pomo}</strong> · {t.stats.short} <strong>{s.short}</strong> · {t.stats.long} <strong>{s.long}</strong>
            </div>
            <div className="fs-meta">{t.meta(s.studyCount, formatCompact(s.studyTotal).replace(/(\d)h(\d+)$/, '$1h$2min'), minsToTime(s.lastEnd))}</div>
            <button className="fs-apply" onClick={() => apply(s)}>{t.apply}</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
