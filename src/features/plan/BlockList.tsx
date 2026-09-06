// A lista de blocos do dia: divisores de sessão, caixas de grupo e linhas com check.
// Mesmas classes do markup antigo — o CSS e o smoke test dependem delas.

import type { MouseEvent, ReactNode } from 'react';
import { toggleBlockCheck } from '../../application/checks';
import { playSound } from '../../application/timer';
import { isChecked, isDayClosed, isFutureDay } from '../../domain/checks';
import { isForfeited } from '../../domain/hardcore';
import { blockInGroup, groupHeaderPositions, groupProgress } from '../../domain/groups';
import type { GroupHeaderPosition } from '../../domain/groups';
import { dk, timeToMins } from '../../domain/time';
import type { DateKey, StudyBlock, StudyGroup } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { state } from '../../store/store';
import { GroupBox } from '../groups/GroupBox';
import type { GroupSelection } from '../groups/useGroupSelection';
import { spawnCheckRipple, spawnFloatGain } from './feedback';

const NUM_SESSIONS = 6;
const GROUP_COLORS = 6;

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

/** O que o Plano faz quando uma linha pede um modal — ou quer iniciar o timer (o Plano decide se é hardcore). */
export interface BlockActions {
  onDeleteEvent: (dateKey: DateKey, block: StudyBlock) => void;
  onEditGroup: (group: StudyGroup) => void;
  onStartBlock: (block: StudyBlock, now: Date) => void;
}

interface RowProps extends BlockActions {
  dateKey: DateKey;
  block: StudyBlock;
  /** Posição na lista — é o que a seleção de grupo usa. */
  idx: number;
  inGroup: boolean;
  selection: GroupSelection;
  now: Date;
  isToday: boolean;
  timerBlock: StudyBlock | null;
}

function BlockRow({ dateKey, block: b, idx, inGroup, selection, now, isToday, timerBlock, onDeleteEvent, onStartBlock }: RowProps) {
  const t = strings.plan;
  const isE = b.type === 'estudo';
  const isP = b.type === 'pausa';
  const isEv = b.type === 'event';
  const isI = b.type === 'intervalo'; // refeição, consulta, reunião: só ocupa o tempo
  const done = isChecked(state.checks, dateKey, b.time);
  const sIdx = b.session !== undefined ? b.session % NUM_SESSIONS : 0;
  const isNow = isToday && (isE || isP || isI) && isHappeningNow(b, now);
  const timerActive = !!timerBlock && timerBlock.time === b.time && timerBlock.endTime === b.endTime;
  const closed = isDayClosed(state.closedDays, dateKey);
  const future = isFutureDay(dateKey, now);
  // Abandonado no modo hardcore: sem check, sem timer, e fica marcado como "desistiu".
  const forfeited = (isE || isP) && isForfeited(state.penalties, dateKey, b.time);

  const className =
    'block-row' +
    (isP ? ' pausa-row' : '') +
    (isI ? ' almoco-row' : '') +
    (isEv ? ' event-row' : '') +
    (done && (isE || isP || isEv) ? ' done' : '') +
    (isE || isP || isEv ? ` session-block s${sIdx}` : '') +
    (isNow ? ' now-block' : '') +
    (timerActive ? ' timer-active' : '') +
    (closed ? ' day-closed' : '') +
    (future ? ' day-future' : '') +
    (forfeited ? ' forfeited' : '') +
    (inGroup ? ' in-group' : '') +
    (selection.isSelected(idx) ? ' selecting' : '') +
    (selection.isAnchor(idx) ? ' selecting-anchor' : '');

  const onRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if (selection.handleClick(idx)) return;
    if ((e.target as HTMLElement).closest('.check')) return;
    const why = refusal(dateKey, now);
    if (why) {
      showToast(why);
      return;
    }
    if (forfeited) {
      showToast(strings.hardcore.plan.forfeitedToast);
      return;
    }
    if (isE || isP) onStartBlock(b, now);
    else if (isEv || isI) onDeleteEvent(dateKey, b);
  };

  const onCheckClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // Em modo de seleção, tocar no check escolhe a linha — não marca.
    if (selection.handleClick(idx)) return;
    const why = refusal(dateKey, now);
    if (why) {
      showToast(why);
      return;
    }
    if (forfeited) {
      showToast(strings.hardcore.plan.forfeitedToast);
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

  let xpLabel: ReactNode;
  if (forfeited) xpLabel = <span className="block-xp forfeited-xp">{strings.hardcore.plan.forfeited}</span>;
  else if (isE || isP) xpLabel = <span className="block-xp session-xp">{t.xpGain(b.xp)}</span>;
  else if (isI) xpLabel = <span className="block-xp almoco-xp">{t.free}</span>;
  else xpLabel = <span className="block-xp event-xp">{t.xpGain(b.xp)}</span>;

  const clickable = isEv || isI;
  const title = clickable ? t.eventTitle : undefined;

  return (
    <div
      className={className}
      onClick={onRowClick}
      style={clickable ? { cursor: 'pointer' } : undefined}
      title={title}
      {...selection.rowProps(idx)}
    >
      {!isI && (
        <div className={'check' + (done ? ' checked' : '') + (forfeited ? ' forfeited' : '')} onClick={onCheckClick}>
          {forfeited ? <span className="check-x">✕</span> : <CheckIcon />}
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

interface ListProps extends BlockActions {
  dateKey: DateKey;
  blocks: StudyBlock[];
  groups: StudyGroup[];
  selection: GroupSelection;
  now: Date;
  timerBlock: StudyBlock | null;
  /** Dia sem blocos: o título (dia livre / fim de semana) e, se o dia é editável, como estudar mesmo assim. */
  empty: { label: string; hint: string | null };
}

export function BlockList({ dateKey, blocks, groups, selection, now, timerBlock, empty, onDeleteEvent, onEditGroup, onStartBlock }: ListProps) {
  if (blocks.length === 0) {
    return (
      <div className="empty-day">
        <div>{empty.label}</div>
        {empty.hint && <div className="empty-day-hint">{empty.hint}</div>}
      </div>
    );
  }

  const isToday = dateKey === dk(now);
  const dayChecks = state.checks[dateKey];
  const items: ReactNode[] = [];
  let lastSession = -1;

  // Grupos com membro abrem uma caixa no primeiro bloco membro; os membros são contíguos
  // (blocos são sequenciais e grupos não se sobrepõem), então a caixa fecha no primeiro bloco
  // de fora. Grupo sem membro (o plano mudou) vira só o cabeçalho, na posição do horário.
  const startsAt = new Map<number, GroupHeaderPosition>();
  const emptyAt = new Map<number, GroupHeaderPosition[]>();
  for (const pos of groupHeaderPositions(groups, blocks)) {
    if (pos.empty) emptyAt.set(pos.index, [...(emptyAt.get(pos.index) ?? []), pos]);
    else startsAt.set(pos.index, pos);
  }
  // Cor pela ordem do grupo no dia (`groups` vem ordenado por horário): até 6 grupos, 6 cores.
  const boxFor = (group: StudyGroup, empty: boolean, children?: ReactNode[], rows?: { first: number; last: number }) => (
    <GroupBox
      key={`g-${group.id}`}
      group={group}
      progress={groupProgress(group, blocks, dayChecks)}
      empty={empty}
      grips={
        rows && selection.enabled
          ? {
              top: selection.gripProps(group.id, 'start', rows.first, rows.last),
              bottom: selection.gripProps(group.id, 'end', rows.first, rows.last),
            }
          : undefined
      }
      colorClass={`gc-${Math.max(0, groups.indexOf(group)) % GROUP_COLORS}`}
      onEdit={() => onEditGroup(group)}
    >
      {children}
    </GroupBox>
  );
  const pushEmpty = (index: number) => {
    for (const { group } of emptyAt.get(index) ?? []) items.push(boxFor(group, true));
  };

  let box: { group: StudyGroup; first: number; last: number; children: ReactNode[] } | null = null;
  const closeBox = () => {
    if (box) items.push(boxFor(box.group, false, box.children, { first: box.first, last: box.last }));
    box = null;
  };

  blocks.forEach((b, i) => {
    if (box && !blockInGroup(b, box.group)) closeBox();
    pushEmpty(i);

    let divider: ReactNode = null;
    if (isPomodoroPart(b) && b.session !== undefined && b.session !== lastSession) {
      lastSession = b.session;
      const sIdx = b.session % NUM_SESSIONS;
      const sessionHasNow =
        isToday && blocks.some((bl) => bl.session === b.session && isPomodoroPart(bl) && isHappeningNow(bl, now));
      divider = (
        <div key={`s-${b.session}-${i}`} className={`session-divider s${sIdx}` + (sessionHasNow ? ' now-session' : '')}>
          <div className="sd-line" />
          <span className="sd-label">{strings.plan.sessions[sIdx] ?? strings.plan.sessionFallback}</span>
          <div className="sd-line" />
        </div>
      );
    }

    const start = startsAt.get(i);
    if (start) {
      // Sessão nova começando junto com o grupo: o divisor fica fora da caixa (sessão > grupo).
      if (divider) items.push(divider);
      box = { group: start.group, first: i, last: i, children: [] };
    } else if (divider) {
      (box ? box.children : items).push(divider);
    }

    if (box) box.last = i;
    (box ? box.children : items).push(
      <BlockRow
        key={`${b.type}-${b.time}-${b.endTime}`}
        dateKey={dateKey}
        block={b}
        idx={i}
        inGroup={box !== null}
        selection={selection}
        now={now}
        isToday={isToday}
        timerBlock={timerBlock}
        onDeleteEvent={onDeleteEvent}
        onEditGroup={onEditGroup}
        onStartBlock={onStartBlock}
      />,
    );
  });
  closeBox();
  pushEmpty(blocks.length);

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
