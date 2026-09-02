// A lista de blocos do dia: divisores de sessão e linhas com check.
// Mesmas classes do markup antigo — o CSS e o smoke test dependem delas.

import type { MouseEvent } from 'react';
import { toggleBlockCheck } from '../../application/checks';
import { playSound, tryStartTimer } from '../../application/timer';
import { isChecked, isDayClosed, isFutureDay } from '../../domain/checks';
import { dk, timeToMins } from '../../domain/time';
import type { DateKey, StudyBlock } from '../../domain/types';
import { legacy } from '../../legacy/bridge';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { state } from '../../store/store';
import { spawnCheckRipple, spawnFloatGain } from './feedback';

const NUM_SESSIONS = 6;

const isPomodoroPart = (b: StudyBlock) => b.type === 'estudo' || b.type === 'pausa';

function isHappeningNow(b: StudyBlock, now: Date): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= timeToMins(b.time) && mins < timeToMins(b.endTime);
}

/** Por que um clique é recusado, se for. */
function refusal(dateKey: DateKey, now: Date): string | null {
  if (isFutureDay(dateKey, now)) return strings.plan.notYet;
  if (isDayClosed(state.closedDays, dateKey)) return strings.plan.dayClosed;
  return null;
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 10 10" fill="none" stroke="#0e0e0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1.5,5 4,7.5 8.5,2.5" />
    </svg>
  );
}

interface RowProps {
  dateKey: DateKey;
  block: StudyBlock;
  now: Date;
  isToday: boolean;
  timerBlock: StudyBlock | null;
}

function BlockRow({ dateKey, block: b, now, isToday, timerBlock }: RowProps) {
  const t = strings.plan;
  const isE = b.type === 'estudo';
  const isP = b.type === 'pausa';
  const isA = b.type === 'almoco';
  const isEv = b.type === 'event';
  const isI = b.type === 'intervalo';
  const done = isChecked(state.checks, dateKey, b.time);
  const sIdx = b.session !== undefined ? b.session % NUM_SESSIONS : 0;
  const isNow = isToday && (isE || isP || isA || isI) && isHappeningNow(b, now);
  const timerActive = !!timerBlock && timerBlock.time === b.time && timerBlock.endTime === b.endTime;
  const closed = isDayClosed(state.closedDays, dateKey);
  const future = isFutureDay(dateKey, now);

  const className =
    'block-row' +
    (isP ? ' pausa-row' : '') +
    (isA || isI ? ' almoco-row' : '') +
    (isEv ? ' event-row' : '') +
    (done && (isE || isP || isEv) ? ' done' : '') +
    (isE || isP || isEv ? ` session-block s${sIdx}` : '') +
    (isNow ? ' now-block' : '') +
    (timerActive ? ' timer-active' : '') +
    (closed ? ' day-closed' : '') +
    (future ? ' day-future' : '');

  const onRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.check')) return;
    if (isA) {
      legacy.openLunchPanel(dateKey);
      return;
    }
    const why = refusal(dateKey, now);
    if (why) {
      showToast(why);
      return;
    }
    if (isE || isP) {
      const r = tryStartTimer(b, now);
      if (!r.ok) showToast(strings.timer.refusal(r));
    } else if (isEv || isI) legacy.openEventDelete(dateKey, b);
  };

  const onCheckClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const why = refusal(dateKey, now);
    if (why) {
      showToast(why);
      return;
    }
    // A posição é capturada ANTES do toggle: o re-render pode mexer na linha.
    const rect = e.currentTarget.getBoundingClientRect();
    const result = toggleBlockCheck(dateKey, b, now);
    if (result?.checked) {
      playSound('check');
      spawnCheckRipple(rect);
      spawnFloatGain(rect, result.xp, result.coins);
    }
  };

  let xpLabel: React.ReactNode;
  if (isE || isP) xpLabel = <span className="block-xp session-xp">{t.xpGain(b.xp)}</span>;
  else if (isA)
    xpLabel = (
      <span className="block-xp almoco-xp" style={{ cursor: 'pointer' }}>
        {state.lunchOverrides[dateKey] ? t.lunchEdited : t.lunchEdit}
      </span>
    );
  else if (isI) xpLabel = <span className="block-xp almoco-xp">{t.free}</span>;
  else xpLabel = <span className="block-xp event-xp">{t.xpGain(b.xp)}</span>;

  const clickable = isA || isEv || isI;
  const title = isA ? t.lunchTitle : isEv || isI ? t.eventTitle : undefined;

  return (
    <div
      className={className}
      onClick={onRowClick}
      style={clickable ? { cursor: 'pointer' } : undefined}
      title={title}
    >
      {!(isA || isI) && (
        <div className={'check' + (done ? ' checked' : '')} onClick={onCheckClick}>
          <CheckIcon />
        </div>
      )}
      <span className="block-time">
        {b.time}–{b.endTime}
      </span>
      <span className="block-name">{b.name}</span>
      {xpLabel}
    </div>
  );
}

interface ListProps {
  dateKey: DateKey;
  blocks: StudyBlock[];
  now: Date;
  timerBlock: StudyBlock | null;
}

export function BlockList({ dateKey, blocks, now, timerBlock }: ListProps) {
  if (blocks.length === 0) return <div className="empty-day">{strings.plan.freeDay}</div>;

  const isToday = dateKey === dk(now);
  const items: React.ReactNode[] = [];
  let lastSession = -1;

  blocks.forEach((b, i) => {
    if (isPomodoroPart(b) && b.session !== undefined && b.session !== lastSession) {
      lastSession = b.session;
      const sIdx = b.session % NUM_SESSIONS;
      const sessionHasNow =
        isToday && blocks.some((bl) => bl.session === b.session && isPomodoroPart(bl) && isHappeningNow(bl, now));
      items.push(
        <div key={`s-${b.session}-${i}`} className={`session-divider s${sIdx}` + (sessionHasNow ? ' now-session' : '')}>
          <div className="sd-line" />
          <span className="sd-label">{strings.plan.sessions[sIdx] ?? strings.plan.sessionFallback}</span>
          <div className="sd-line" />
        </div>,
      );
    }
    items.push(
      <BlockRow key={`${b.type}-${b.time}-${b.endTime}`} dateKey={dateKey} block={b} now={now} isToday={isToday} timerBlock={timerBlock} />,
    );
  });

  return <>{items}</>;
}

/** Contagem de estudos/pausas feitos vs total, pro StatsRow. */
export function dayProgress(dateKey: DateKey, blocks: StudyBlock[]) {
  let eD = 0, eT = 0, pD = 0, pT = 0;
  for (const b of blocks) {
    const done = isChecked(state.checks, dateKey, b.time);
    if (b.type === 'estudo') { eT++; if (done) eD++; }
    else if (b.type === 'pausa') { pT++; if (done) pD++; }
  }
  return { eD, eT, pD, pT };
}
