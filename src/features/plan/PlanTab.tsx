// Aba Plano: XP, stats do dia, seletor de semana/dia, blocos, grupos e "Encerrar o dia".
// Ilha montada em `.main` (#plan-root). Mesmos ids/classes do markup antigo.

import { useEffect, useRef, useState } from 'react';
import { canEditDayWindows, dayWindowsOverride } from '../../application/dayWindows';
import { findEventEditTarget } from '../../application/events';
import type { EventEditTarget } from '../../application/events';
import { canEditGroups, groupsForDay, updateGroup, validateGroup } from '../../application/groups';
import { blocksForDay, computeStatsNow, dateForWeekDay } from '../../application/plan';
import { isDayClosed } from '../../domain/checks';
import { rangeOf } from '../../domain/groups';
import { getLevelPct } from '../../domain/progression';
import { dk } from '../../domain/time';
import type { Stats } from '../../domain/stats';
import type { DateKey, StudyGroup } from '../../domain/types';
import type { Week } from '../../domain/weeks';
import { openFinishDay } from '../../application/dayEnd';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { setDay, setView, useAppState } from '../../store/store';
import { EventDeleteModal, type EventToDelete } from '../events/EventDeleteModal';
import { EventPanel } from '../events/EventPanel';
import { LunchPanel } from '../events/LunchPanel';
import { GroupPanel, type GroupTarget } from '../groups/GroupPanel';
import { SelectionRect } from '../groups/SelectionRect';
import { useGroupSelection } from '../groups/useGroupSelection';
import { BlockList, dayProgress } from './BlockList';
import { DayWindowsPanel } from './DayWindowsPanel';
import { useMinuteTick } from './useMinuteTick';

/** Qual modal do Plano está aberto. Estado local: quem abre é sempre um clique aqui dentro. */
type PlanModal =
  | { kind: 'none' }
  | { kind: 'event'; edit?: EventEditTarget }
  | { kind: 'delete'; target: EventToDelete }
  | { kind: 'lunch'; dateKey: DateKey }
  | { kind: 'windows'; dateKey: DateKey }
  | { kind: 'group'; target: GroupTarget };

const t = strings.plan;
const tg = strings.groups;
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

  const now = new Date();
  const todayKey = dk(now);
  const loaded = weeks.length > 0; // antes de carregar não há semanas
  const viewKey = loaded ? dk(dateForWeekDay(week, day)) : todayKey;
  const blocks = loaded ? blocksForDay(viewKey) : [];
  const groups = groupsForDay(viewKey);
  const canGroup = blocks.length > 0 && canEditGroups(viewKey);
  const canWindows = loaded && canEditDayWindows(viewKey, now).ok;
  const windowsEdited = loaded && dayWindowsOverride(viewKey) !== null;

  // Seleção de trecho pra grupo — o intervalo escolhido vira o modal de novo grupo.
  const selection = useGroupSelection({
    enabled: canGroup,
    onRange: (from, to) => {
      const range = rangeOf(blocks.slice(from, to + 1));
      if (!range) return;
      const v = validateGroup(viewKey, range);
      if (!v.ok) {
        showToast(tg.refusal[v.reason]);
        return;
      }
      setModal({ kind: 'group', target: { dateKey: viewKey, ...range } });
    },
    onResize: (groupId, from, to) => {
      const g = groups.find((x) => x.id === groupId);
      const range = rangeOf(blocks.slice(from, to + 1));
      if (!g || !range || (range.start === g.start && range.end === g.end)) return;
      const r = updateGroup(viewKey, groupId, { ...g, ...range });
      if (!r.ok) showToast(tg.refusal[r.reason]);
    },
    onRefuse: () => showToast(t.dayClosed),
  });
  const cancelSelection = selection.cancel;
  useEffect(() => {
    cancelSelection(); // trocou de dia: a seleção era do outro
  }, [viewKey, cancelSelection]);

  if (!loaded) return null;

  const stats = computeStatsNow(now);
  const { eD, eT, pD, pT } = dayProgress(viewKey, blocks);

  const openEditGroup = (g: StudyGroup) => {
    if (selection.active) {
      selection.cancel();
      return;
    }
    if (!canEditGroups(viewKey)) {
      showToast(t.dayClosed);
      return;
    }
    setModal({ kind: 'group', target: { dateKey: viewKey, start: g.start, end: g.end, group: g } });
  };

  const hint =
    selection.mode.kind === 'armed' ? tg.hintFirst
    : selection.mode.kind === 'anchored' && selection.mode.drag ? tg.hintDrag
    : selection.mode.kind === 'resizing' ? tg.hintResize
    : tg.hintLast;

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
        {selection.active ? (
          <div className="group-hint" id="group-hint">
            <span>{hint}</span>
            <button className="add-event-btn" onClick={selection.cancel}>{tg.cancel}</button>
          </div>
        ) : (
          <>
            {canWindows && (
              <button
                className={'add-event-btn' + (windowsEdited ? ' edited' : '')}
                id="day-windows-btn"
                onClick={() => setModal({ kind: 'windows', dateKey: viewKey })}
              >
                {windowsEdited ? t.dayWindowsEdited : t.dayWindows}
              </button>
            )}
            {canGroup && (
              <button className="add-event-btn" id="group-mode-btn" onClick={selection.arm}>{tg.button}</button>
            )}
            <button className="add-event-btn" onClick={() => setModal({ kind: 'event' })}>{t.addEvent}</button>
          </>
        )}
      </div>
      <div className={'blocks-list' + (selection.active ? ' selecting-mode' : '')} id="blocks-list" {...selection.listProps}>
        <BlockList
          dateKey={viewKey}
          blocks={blocks}
          groups={groups}
          selection={selection}
          now={now}
          timerBlock={timerBlock}
          onDeleteEvent={(dateKey, block) => setModal({ kind: 'delete', target: { dateKey, block } })}
          onEditLunch={(dateKey) => setModal({ kind: 'lunch', dateKey })}
          onEditGroup={openEditGroup}
        />
        <SelectionRect range={selection.range} listId="blocks-list" />
      </div>
      <FinishDay viewKey={viewKey} todayKey={todayKey} />

      <EventPanel open={modal.kind === 'event'} dateKey={viewKey} edit={modal.kind === 'event' ? modal.edit ?? null : null} onClose={closeModal} />
      <EventDeleteModal
        target={modal.kind === 'delete' ? modal.target : null}
        onClose={closeModal}
        onEdit={(target) => {
          const edit = findEventEditTarget(target.dateKey, target.block);
          if (!edit) {
            showToast(strings.events.panel.validation['not-found']);
            closeModal();
            return;
          }
          setModal({ kind: 'event', edit });
        }}
      />
      <LunchPanel dateKey={modal.kind === 'lunch' ? modal.dateKey : null} onClose={closeModal} />
      <DayWindowsPanel dateKey={modal.kind === 'windows' ? modal.dateKey : null} onClose={closeModal} />
      <GroupPanel target={modal.kind === 'group' ? modal.target : null} onClose={closeModal} />
    </>
  );
}
