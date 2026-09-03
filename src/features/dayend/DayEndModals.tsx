// Os três modais do fim do dia: confirmação, resumo com os ganhos, e o prompt
// automático "passou do horário" (encerrar ou prolongar).

import { useState } from 'react';
import {
  closeDay,
  closeEndOfDayPrompt,
  closeFinishDay,
  closeSummary,
  extendDay,
  promptFinish,
} from '../../application/dayEnd';
import { suggestedExtendTime } from '../../domain/endOfDay';
import { petForm } from '../../domain/pets';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { Modal } from '../shell/Modal';

const t = strings.dayEnd;

function FinishDayConfirm({ open }: { open: boolean }) {
  return (
    <Modal id="finish-day-confirm" open={open} title={t.confirmTitle} onClose={closeFinishDay}>
      <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, lineHeight: 1.6 }}>
        {t.confirmText[0]}<strong>{t.confirmText[1]}</strong>{t.confirmText[2]}<strong>{t.confirmText[3]}</strong>{t.confirmText[4]}
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>{t.confirmFinal}</p>
      <div className="btn-row">
        <button className="reset-btn" onClick={closeFinishDay}>{t.cancel}</button>
        <button className="save-btn" onClick={() => closeDay()}>{t.confirm}</button>
      </div>
    </Modal>
  );
}

function DaySummaryModal() {
  const { summary, owned } = useAppState((s, d) => ({ summary: d.dayEnd.summary, owned: s.pets.owned }));
  return (
    <Modal id="day-summary-panel" open={!!summary} title={t.summaryTitle} onClose={closeSummary}>
      <div id="day-summary-body">
        {summary && (
          <>
            <div className="ds-hero">
              <div className="ds-stat xp"><div className="ds-val">+{summary.userXP}</div><div className="ds-label">{t.xp}</div></div>
              <div className="ds-stat coins"><div className="ds-val">+{summary.userCoins}</div><div className="ds-label">{t.coins}</div></div>
            </div>
            {summary.userLevelUp && (
              <div className="ds-levelup"><span className="ds-lu-icon">🆙</span>{t.levelUp(summary.newLevel, summary.newLevelName)}</div>
            )}
            {summary.pets.map((p) => {
              const pet = owned.find((x) => x.id === p.id);
              const form = pet ? petForm(pet) : null;
              return (
                <div className="ds-pet-row" key={p.id}>
                  {form && <img src={form.sprite(0)} alt={form.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  <div style={{ flex: 1 }}>
                    <div className="ds-pet-name">{pet?.name ?? p.id}</div>
                    <div className={'ds-pet-lv' + (p.levelUp ? ' up' : '')}>{p.levelUp ? t.petLevelUp(p.oldLevel, p.newLevel) : strings.pets.lv(p.newLevel)}</div>
                  </div>
                  <div className="ds-pet-gain">{strings.plan.xpGain(p.gain)}</div>
                </div>
              );
            })}
            {summary.empty && <div className="ds-empty-msg">{t.empty[0]}<br />{t.empty[1]}</div>}
          </>
        )}
      </div>
      <div className="btn-row" style={{ gridTemplateColumns: '1fr' }}>
        <button className="save-btn" onClick={closeSummary}>{t.continue}</button>
      </div>
    </Modal>
  );
}

function EndOfDayPrompt({ open, lastEnd }: { open: boolean; lastEnd: string }) {
  const [extending, setExtending] = useState(false);
  const [newEnd, setNewEnd] = useState('');
  const showExtend = () => {
    setNewEnd(suggestedExtendTime(new Date()));
    setExtending(true);
  };
  const close = () => {
    setExtending(false);
    closeEndOfDayPrompt();
  };
  return (
    <Modal id="day-end-prompt" open={open} title={t.promptTitle} onClose={close}>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }} id="eop-intro">{t.promptIntro(lastEnd)}</p>
      <button className="eop-choice" onClick={() => { setExtending(false); promptFinish(); }}>
        <span className="eop-icon">✓</span>
        <div className="eop-text">
          <div className="eop-title">{t.promptFinishTitle}</div>
          <div className="eop-sub">{t.promptFinishSub}</div>
        </div>
      </button>
      <button className="eop-choice" onClick={showExtend}>
        <span className="eop-icon">⏰</span>
        <div className="eop-text">
          <div className="eop-title">{t.promptExtendTitle}</div>
          <div className="eop-sub">{t.promptExtendSub}</div>
        </div>
      </button>
      <div id="eop-extend-form" className="eop-extend-form" style={{ display: extending ? 'block' : 'none' }}>
        <label>{t.newEnd}</label>
        <input type="time" id="eop-new-end" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
        <div className="btn-row">
          <button className="reset-btn" onClick={() => setExtending(false)}>{t.back}</button>
          <button className="save-btn" onClick={() => { extendDay(newEnd); setExtending(false); }}>{t.extend}</button>
        </div>
      </div>
    </Modal>
  );
}

export function DayEndModals() {
  const dayEnd = useAppState((_, d) => d.dayEnd);
  return (
    <>
      <FinishDayConfirm open={dayEnd.confirmOpen} />
      <DaySummaryModal />
      <EndOfDayPrompt open={dayEnd.promptOpen} lastEnd={dayEnd.promptLastEnd} />
    </>
  );
}
