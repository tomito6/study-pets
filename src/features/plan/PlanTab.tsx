// Aba Plano: XP, stats do dia, seletor de semana/dia, blocos e "Encerrar o dia".
// Ilha montada em `.main` (#plan-root). Mesmos ids/classes do markup antigo.

import { useEffect, useRef, useState } from 'react';
import { blocksForDay, computeStatsNow, dateForWeekDay } from '../../application/plan';
import { isDayClosed } from '../../domain/checks';
import { getLevelPct } from '../../domain/progression';
import { dk } from '../../domain/time';
import type { Stats } from '../../domain/stats';
import type { DateKey } from '../../domain/types';
import type { Week } from '../../domain/weeks';
import { openFinishDay } from '../../application/dayEnd';
import { strings } from '../../shared/strings';
import { setDay, setView, useAppState } from '../../store/store';
import { EventDeleteModal, type EventToDelete } from '../events/EventDeleteModal';
import { EventPanel } from '../events/EventPanel';
import { LunchPanel } from '../events/LunchPanel';
import { BlockList, dayProgress } from './BlockList';
import { useMinuteTick } from './useMinuteTick';

/** Qual modal do Plano está aberto. Estado local: quem abre é sempre um clique aqui dentro. */
type PlanModal =
  | { kind: 'none' }
  | { kind: 'event' }
  | { kind: 'delete'; target: EventToDelete }
  | { kind: 'lunch'; dateKey: DateKey };

const t = strings.plan;
const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function TodayPending({ stats, todayKey }: { stats: Stats; todayKey: string }) {
  const closed = useAppState((s) => isDayClosed(s.closedDays, todayKey));
  // Pulsa quando o valor pendente sobe (remontar o span reinicia a animação CSS).
  const cur = stats.todayXP * 1000 + stats.todayCoins;
  const prev = useRef<number | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (prev.current !== null && cur > prev.current) setFlashKey((k) => k + 1);
    prev.current = closed ? null : cur;
  }, [cur, closed]);

  if (closed) return <div className="today-xp today-closed" id="today-xp-val">{t.todayClosed}</div>;
  if (stats.todayXP > 0 || stats.todayCoins > 0) {
    return (
      <div key={flashKey} className={'today-xp today-pending' + (flashKey > 0 ? ' flash' : '')} id="today-xp-val">
        {t.todayPending(stats.todayXP, stats.todayCoins)}
      </div>
    );
  }
  return <div className="today-xp" id="today-xp-val">{t.todayNone}</div>;
}

function XpCard({ stats, weekIdx, todayKey }: { stats: Stats; weekIdx: number; todayKey: string }) {
  return (
    <div className="xp-card">
      <div className="xp-row">
        <div>
          <div className="xp-sub">{t.xpTotal}</div>
          <div className="xp-num" id="xp-total">{stats.totalXP}</div>
        </div>
        <div className="xp-right">
          <div className="week-xp" id="week-xp-val">{t.weekXp(stats.weekXP[weekIdx] || 0)}</div>
          <TodayPending stats={stats} todayKey={todayKey} />
        </div>
      </div>
      <div className="bar-track">
        <div className="bar-fill" id="xp-bar" style={{ width: `${getLevelPct(stats.totalXP)}%` }} />
      </div>
    </div>
  );
}

function WeekDayPicker({ weeks, week, day }: { weeks: Week[]; week: number; day: number }) {
  const checksByDay = useAppState((s) => s.checks);
  const current = weeks[week - 1];
  return (
    <>
      <div className="week-row">
        <select id="week-select" value={week} onChange={(e) => setView(Number(e.target.value), 0)}>
          {weeks.map((w) => (
            <option key={w.n} value={w.n}>{t.weekOption(w.n, fmtDay(w.start), fmtDay(w.end))}</option>
          ))}
        </select>
      </div>
      <div className="day-tabs" id="day-tabs">
        {t.days.map((label, i) => {
          const d = current ? new Date(current.start) : new Date();
          d.setDate(d.getDate() + i);
          const done = Object.keys(checksByDay[dk(d)] ?? {}).length;
          return (
            <button
              key={label}
              className={'day-tab' + (i === day ? ' active' : '') + (done > 0 ? ' has-progress' : '')}
              onClick={() => setDay(i)}
            >
              {label}
              <span className="dot" />
            </button>
          );
        })}
      </div>
    </>
  );
}

function FinishDay({ viewKey, todayKey }: { viewKey: string; todayKey: string }) {
  const closed = useAppState((s) => isDayClosed(s.closedDays, viewKey));
  if (viewKey !== todayKey) return <div className="finish-day-wrap" id="finish-day-wrap" />;
  return (
    <div className="finish-day-wrap" id="finish-day-wrap">
      {closed ? (
        <div className="finish-day-banner"><span className="fdb-check">✓</span>{t.dayClosedBanner}</div>
      ) : (
        <button className="finish-day-btn" onClick={openFinishDay}>
          <span>✓</span><span>{t.finishDay}</span>
        </button>
      )}
    </div>
  );
}

export function PlanTab() {
  useMinuteTick();
  const { weeks, week, day, timerBlock } = useAppState((s, d) => ({
    weeks: d.weeks,
    week: s.uiWeek,
    day: s.uiDay,
    timerBlock: d.timerBlock,
  }));
  const [modal, setModal] = useState<PlanModal>({ kind: 'none' });
  const closeModal = () => setModal({ kind: 'none' });
  if (weeks.length === 0) return null; // antes de carregar

  const now = new Date();
  const todayKey = dk(now);
  const viewKey = dk(dateForWeekDay(week, day));
  const blocks = blocksForDay(viewKey);
  const stats = computeStatsNow(now);
  const { eD, eT, pD, pT } = dayProgress(viewKey, blocks);

  return (
    <>
      <XpCard stats={stats} weekIdx={week - 1} todayKey={todayKey} />
      <div className="stats-row">
        <div className="stat-box"><div className="s-label">{t.stats.estudos}</div><div className="s-val" id="stat-e">{eD}/{eT}</div></div>
        <div className="stat-box"><div className="s-label">{t.stats.pausas}</div><div className="s-val" id="stat-p">{pD}/{pT}</div></div>
        <div className="stat-box"><div className="s-label">{t.stats.semana}</div><div className="s-val" id="stat-w">{t.weekChecks(stats.weekChecksOfCurrent)}</div></div>
      </div>
      <WeekDayPicker weeks={weeks} week={week} day={day} />
      <div className="day-events-bar">
        <button className="add-event-btn" onClick={() => setModal({ kind: 'event' })}>{t.addEvent}</button>
      </div>
      <div className="blocks-list" id="blocks-list">
        <BlockList
          dateKey={viewKey}
          blocks={blocks}
          now={now}
          timerBlock={timerBlock}
          onDeleteEvent={(dateKey, block) => setModal({ kind: 'delete', target: { dateKey, block } })}
          onEditLunch={(dateKey) => setModal({ kind: 'lunch', dateKey })}
        />
      </div>
      <FinishDay viewKey={viewKey} todayKey={todayKey} />

      <EventPanel open={modal.kind === 'event'} dateKey={viewKey} onClose={closeModal} />
      <EventDeleteModal target={modal.kind === 'delete' ? modal.target : null} onClose={closeModal} />
      <LunchPanel dateKey={modal.kind === 'lunch' ? modal.dateKey : null} onClose={closeModal} />
    </>
  );
}
