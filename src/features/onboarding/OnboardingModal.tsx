// "Bem-vindo!": período de uso e fins de semana. Sem botão de fechar — só "Começar".

import { useEffect, useState } from 'react';
import { finishOnboarding } from '../../application/onboarding';
import { dk } from '../../domain/time';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useAppState } from '../../store/store';

const t = strings.onboarding;

export function OnboardingModal() {
  const { open, config } = useAppState((s, d) => ({ open: d.onboardingOpen, config: s.config }));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStart(config.periodStart || dk(new Date()));
    setEnd(config.periodEnd || '');
    setSkip(config.skipWeekends === true);
  }, [open, config.periodStart, config.periodEnd, config.skipWeekends]);

  const useAlways = () => {
    setStart(dk(new Date()));
    setEnd('');
    showToast(t.alwaysToast);
  };

  const begin = () => {
    const r = finishOnboarding({ periodStart: start, periodEnd: end || null, skipWeekends: skip });
    if (!r.ok) showToast(t.endBeforeStart);
  };

  return (
    <div className={'panel-overlay center' + (open ? ' open' : '')} id="onboarding-panel">
      <div className="panel-sheet">
        <div className="panel-header"><h2>{t.title}</h2></div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>{t.intro}</p>
        <div className="field-group">
          <label>{t.period}</label>
          <div className="field-row">
            <div><div className="field-sublabel">{t.start}</div><input type="date" id="onb-start" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><div className="field-sublabel">{t.end}</div><input type="date" id="onb-end" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <button type="button" className="ghost-btn" onClick={useAlways} style={{ marginTop: 8 }}>{t.useAlways}</button>
        </div>
        <div className="field-group">
          <div className="checkbox-row">
            <input type="checkbox" id="onb-skip-weekends" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
            <label htmlFor="onb-skip-weekends" style={{ fontSize: 13 }}>{t.skipWeekends}</label>
          </div>
        </div>
        <div className="btn-row">
          <button className="save-btn" onClick={begin} style={{ width: '100%' }}>{t.begin}</button>
        </div>
      </div>
    </div>
  );
}
