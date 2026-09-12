// Aba Plano: XP, stats do dia, seletor de semana/dia, blocos, grupos e "Encerrar o dia".
// Ilha montada em `.main` (#plan-root). Mesmos ids/classes do markup antigo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { canEditDayWindows, dayWindowsOverride, restKindKey } from '../../application/dayWindows';
import { canMoveEvents, findEventEditTarget, moveEvent, moveNeedsScope } from '../../application/events';
import type { EventEditTarget } from '../../application/events';
import { canEditGroups, groupsForDay, updateGroup, validateGroup } from '../../application/groups';
import { hardcoreEnabled } from '../../application/hardcore';
import { blocksForDay, computeStatsNow, dateForWeekDay } from '../../application/plan';
import { continueBlock } from '../../application/pause';
import { clearStartRequest, isTimerBlock, startContextFor, tryStartTimer } from '../../application/timer';
import { isDayClosed } from '../../domain/checks';
import type { DragAnchor, DragField } from '../../domain/eventDrag';
import { rangeOf } from '../../domain/groups';
import { getLevelPct } from '../../domain/progression';
import { dk, timeToMins } from '../../domain/time';
import { canStartBlock } from '../../domain/timer';
import type { Stats } from '../../domain/stats';
import type { DateKey, StudyBlock, StudyGroup } from '../../domain/types';
import type { Week } from '../../domain/weeks';
import { openFinishDay } from '../../application/dayEnd';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useWide } from '../../shared/useWide';
import { setDay, setView, useAppState } from '../../store/store';
import { EventDeleteModal, type EventToDelete } from '../events/EventDeleteModal';
import { EventMoveModal, type PendingMove } from '../events/EventMoveModal';
import { EventPanel } from '../events/EventPanel';
import { useEventDrag } from '../events/useEventDrag';
import type { DragSource, DropTarget } from '../events/useEventDrag';
import { GroupPanel, type GroupTarget } from '../groups/GroupPanel';
import { SelectionRect } from '../groups/SelectionRect';
import { useGroupSelection } from '../groups/useGroupSelection';
import { HardcoreStartModal } from '../timer/HardcoreModals';
import { BlockList, dayProgress } from './BlockList';
import { DayWindowsPanel } from './DayWindowsPanel';
import { EventDragGhost } from './EventDragGhost';
import { useMinuteTick } from './useMinuteTick';
import { WeekView } from './WeekView';

/** Qual modal do Plano está aberto. Estado local: quem abre é sempre um clique aqui dentro. */
type PlanModal =
  | { kind: 'none' }
  | { kind: 'event'; edit?: EventEditTarget }
  | { kind: 'delete'; target: EventToDelete }
  | { kind: 'windows'; dateKey: DateKey }
  | { kind: 'group'; target: GroupTarget }
  /** Arrastou uma ocorrência de série: só este dia ou a série inteira? */
  | { kind: 'move'; move: PendingMove }
  /** Modo hardcore ligado: o consentimento antes de abrir o foco. */
  | { kind: 'hardcore'; block: StudyBlock };

/** Dia (a lista de sempre) ou Semana (a agenda inteira). Só em tela grande; abaixo de 1100px é sempre Dia. */
type ViewMode = 'day' | 'week';

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

interface PickerProps {
  weeks: Week[];
  week: number;
  day: number;
  /** Tela grande: o toggle Dia · Semana e o número do dia em cada aba. */
  wide: boolean;
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
  /** Na Semana as abas dos dias somem — a grade tem os dias em cima. */
  weekMode: boolean;
}

function WeekDayPicker({ weeks, week, day, wide, mode, onMode, weekMode }: PickerProps) {
  const checksByDay = useAppState((s) => s.checks);
  const current = weeks[week - 1];
  return (
    <>
      <div className="week-row">
        <select id="week-select" aria-label={t.weekLabel} value={week} onChange={(e) => setView(Number(e.target.value), 0)}>
          {weeks.map((w) => (
            <option key={w.n} value={w.n}>{t.weekOption(w.n, fmtDay(w.start), fmtDay(w.end))}</option>
          ))}
        </select>
        {wide && (
          <div className="view-mode" id="view-mode">
            <button className={'vm-btn' + (mode === 'day' ? ' on' : '')} id="view-day" onClick={() => onMode('day')}>{t.view.day}</button>
            <button className={'vm-btn' + (mode === 'week' ? ' on' : '')} id="view-week" onClick={() => onMode('week')}>{t.view.week}</button>
          </div>
        )}
      </div>
      {!weekMode && (
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
                {wide && <b className="day-num">{d.getDate()}</b>}
                <span className="dot" />
              </button>
            );
          })}
        </div>
      )}
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
  const wide = useWide();
  const [mode, setMode] = useState<ViewMode>('day');
  const weekMode = wide && mode === 'week';

  const now = new Date();
  const todayKey = dk(now);
  const loaded = weeks.length > 0; // antes de carregar não há semanas
  const viewKey = loaded ? dk(dateForWeekDay(week, day)) : todayKey;
  const blocks = loaded ? blocksForDay(viewKey) : [];
  const groups = groupsForDay(viewKey);
  const canGroup = blocks.length > 0 && canEditGroups(viewKey);
  const canWindows = loaded && canEditDayWindows(viewKey, now).ok;
  const windowsEdited = loaded && dayWindowsOverride(viewKey) !== null;
  const rest = loaded ? restKindKey(viewKey) : null; // dia sem blocos: fim de semana pausado ou dia livre

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

  // Arrastar evento. A geometria é medida no início do gesto, na tela que estiver
  // aberta: a lista do Dia (uma faixa por linha) ou as colunas da Semana (uma faixa
  // por dia, proporcional). Coordenadas do documento, pra aguentar a rolagem.
  const measureDrag = useCallback((): DragField<DateKey>[] => {
    if (weekMode) return measureWeekColumns();
    const list = document.getElementById('blocks-list');
    if (!list) return [];
    const anchors: DragAnchor[] = [];
    for (const el of list.querySelectorAll('[data-row]')) {
      const b = blocks[Number(el.getAttribute('data-row'))];
      if (!b) continue;
      const r = el.getBoundingClientRect();
      anchors.push({
        top: r.top + window.scrollY,
        bottom: r.bottom + window.scrollY,
        startMin: timeToMins(b.time),
        endMin: timeToMins(b.endTime),
      });
    }
    // A lista inteira é o dia visível: qualquer x cai nela.
    return anchors.length ? [{ key: viewKey, left: -Infinity, right: Infinity, anchors }] : [];
  }, [weekMode, blocks, viewKey]);

  const onDrop = useCallback((source: DragSource, to: DropTarget) => {
    // Numa série, mover é a mesma pergunta de sempre: este dia ou todos?
    if (moveNeedsScope(source.block, to.dateKey === source.dateKey)) {
      setModal({ kind: 'move', move: { source, to } });
      return;
    }
    const r = moveEvent(source.dateKey, source.block, { toDateKey: to.dateKey, start: to.start, end: to.end });
    if (!r.ok) showToast(strings.events.move.refusal[r.reason]);
  }, []);

  const drag = useEventDrag({ measure: measureDrag, onDrop });
  // Durante a seleção de trecho, tocar numa linha é escolher — não arrastar.
  const dayDrag = canMoveEvents(viewKey) && !selection.active ? drag : null;

  // Tocar num estudo/pausa: com o hardcore ligado, o consentimento vem antes; senão, o foco abre direto.
  const startBlock = (b: StudyBlock, at: Date) => {
    // Já é o bloco em andamento? Então isto é "▶ Continuar", não "começar de novo" — e a
    // diferença não é cosmética: o caminho de começar passa por `runBlock`, que descartava
    // uma pausa aberta sem registrar (os minutos parados sumiam e o dia não deslizava).
    // Vem antes de tudo: antes da recusa (um bloco pausado além do fim do plano é recusado
    // com `ended`) e antes do consentimento (que converteria em hardcore no meio da corrida).
    // `viewKey === hoje` porque `isTimerBlock` compara só horário: a linha 10:00–10:25 de um
    // dia passado é outro bloco, e clicar nela não pode mexer no timer de hoje.
    if (viewKey === dk(at) && isTimerBlock(b)) {
      // Sem o `at` do render, de propósito: ele é do último re-render (a lista vira no minuto),
      // e retomar com um relógio velho encurtaria a pausa registrada — minutos que o dia perde.
      continueBlock();
      return;
    }
    // A recusa vem ANTES do consentimento: abrir "sair antes do fim custa XP" pra um
    // bloco que nem pode começar (dia encerrado, já terminou) é pedir compromisso com nada.
    const can = canStartBlock(b, viewKey, at, startContextFor(b, viewKey));
    if (!can.ok) {
      showToast(strings.timer.refusal(can));
      return;
    }
    if (hardcoreEnabled()) {
      setModal({ kind: 'hardcore', block: b });
      return;
    }
    const r = tryStartTimer(b, at);
    if (!r.ok) showToast(strings.timer.refusal(r));
  };

  // O cartão Agora (laptop) pede o início pelo store; aqui ele vira o mesmo caminho do clique na linha.
  const startRequest = useAppState((_s, d) => d.startRequest);
  useEffect(() => {
    if (!startRequest || !loaded) return;
    clearStartRequest();
    startBlock(startRequest, new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startRequest]);

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
      <WeekDayPicker weeks={weeks} week={week} day={day} wide={wide} mode={mode} onMode={setMode} weekMode={weekMode} />
      {weekMode ? (
        <WeekView
          week={week}
          now={now}
          drag={drag}
          onPickDay={(i) => {
            setDay(i);
            setMode('day');
          }}
        />
      ) : (
        <>
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
            <button className="add-event-btn" id="add-event-btn" onClick={() => setModal({ kind: 'event' })}>{t.addEvent}</button>
          </>
        )}
      </div>
      <div className={'blocks-list' + (selection.active ? ' selecting-mode' : '')} id="blocks-list" {...selection.listProps}>
        <BlockList
          dateKey={viewKey}
          blocks={blocks}
          groups={groups}
          selection={selection}
          drag={dayDrag}
          now={now}
          timerBlock={timerBlock}
          empty={{ label: rest === 'weekend' ? t.freeWeekend : t.freeDay, hint: canWindows ? t.freeDayHint : null }}
          onDeleteEvent={(dateKey, block) => setModal({ kind: 'delete', target: { dateKey, block } })}
          onEditGroup={openEditGroup}
          onStartBlock={startBlock}
        />
        <SelectionRect range={selection.range} listId="blocks-list" />
        <EventDragGhost preview={drag.preview} listId="blocks-list" />
      </div>
      <FinishDay viewKey={viewKey} todayKey={todayKey} />
        </>
      )}

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
      <DayWindowsPanel dateKey={modal.kind === 'windows' ? modal.dateKey : null} onClose={closeModal} />
      <GroupPanel target={modal.kind === 'group' ? modal.target : null} onClose={closeModal} />
      <EventMoveModal move={modal.kind === 'move' ? modal.move : null} onClose={closeModal} />
      <HardcoreStartModal block={modal.kind === 'hardcore' ? modal.block : null} onClose={closeModal} />
    </>
  );
}

/**
 * As colunas da Semana, em coordenadas do documento. Os dados vêm de atributos que
 * a própria `WeekView` escreve (`data-day-key` e a faixa de horas), então a medida
 * não precisa saber como ela calcula a grade — e dia de descanso, que não tem os
 * atributos, fica de fora: soltar um evento lá o esconderia do plano.
 */
function measureWeekColumns(): DragField<DateKey>[] {
  const out: DragField<DateKey>[] = [];
  for (const el of document.querySelectorAll('#week-view .wv-col[data-day-key]')) {
    const key = el.getAttribute('data-day-key');
    const from = Number(el.getAttribute('data-from'));
    const to = Number(el.getAttribute('data-to'));
    if (!key || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    const r = el.getBoundingClientRect();
    out.push({
      key,
      left: r.left + window.scrollX,
      right: r.right + window.scrollX,
      anchors: [{ top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, startMin: from, endMin: to }],
    });
  }
  return out;
}
