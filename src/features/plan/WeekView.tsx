// A Semana no laptop: um dia por coluna, da primeira à última hora com bloco, cada bloco na altura da
// duração. É o modo de planejar — olhar onde cabe um evento, que dia está leve, o que já foi feito.
// Clicar num dia abre o Dia dele (o de sempre). Só existe em tela grande; o PlanTab decide quando mostrar.
// Os blocos vêm de `blocksForDay` (memoizado) — a Semana não gera nada por conta própria.

import type { KeyboardEvent } from 'react';
import { blocksForDay, dateForWeekDay, restKindOf } from '../../application/plan';
import { isChecked } from '../../domain/checks';
import { dk, timeToMins } from '../../domain/time';
import { cleanBlockName } from '../../domain/timer';
import type { StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import type { EventDrag } from '../events/useEventDrag';

const NUM_SESSIONS = 6;
/** Pausa com esta duração ou mais é "longa" (a curta tem 3–5 min) — só muda a cor. */
const LONG_BREAK_MIN = 10;
/** Altura da grade em px (a mesma de --wv-h no CSS): decide a partir de que duração o nome cabe. */
const GRID_PX = 560;
const MIN_LABEL_PX = 16;

interface Props {
  /** A semana visível (1-based, como `state.uiWeek`). */
  week: number;
  now: Date;
  /** Arrastar evento: aqui ele muda de horário e também de dia. */
  drag: EventDrag;
  onPickDay: (dayIdx: number) => void;
}

const kindOf = (b: StudyBlock): string =>
  b.type === 'pausa' && timeToMins(b.endTime) - timeToMins(b.time) >= LONG_BREAK_MIN ? 'longa' : b.type;

export function WeekView({ week, now, drag, onPickDay }: Props) {
  const checks = useAppState((s) => s.checks);
  const t = strings.plan;
  const todayKey = dk(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const days = t.days.map((label, i) => {
    const date = dateForWeekDay(week, i);
    const key = dk(date);
    const rest = restKindOf(key); // fim de semana pausado ou dia livre: coluna vazia
    return { i, label, date, key, rest, blocks: rest ? [] : blocksForDay(key), isToday: key === todayKey };
  });

  // A faixa de horas: da primeira à última hora com bloco na semana (mínimo 4h), em horas cheias.
  let h0 = Infinity;
  let h1 = -Infinity;
  for (const d of days) {
    for (const b of d.blocks) {
      h0 = Math.min(h0, timeToMins(b.time));
      h1 = Math.max(h1, timeToMins(b.endTime));
    }
  }
  if (!Number.isFinite(h0)) {
    h0 = 9 * 60;
    h1 = 19 * 60;
  }
  h0 = Math.floor(h0 / 60) * 60;
  h1 = Math.ceil(h1 / 60) * 60;
  if (h1 - h0 < 4 * 60) h1 = h0 + 4 * 60;
  const span = h1 - h0;
  const pct = (m: number) => `${((m - h0) / span) * 100}%`;
  const hours: number[] = [];
  for (let h = h0; h <= h1; h += 60) hours.push(h / 60);

  // Onde o evento arrastado cai agora — em minutos, pra desenhar na mesma régua.
  const p = drag.preview;
  const ghost = p ? { dateKey: p.dateKey, from: timeToMins(p.start), to: timeToMins(p.end), label: p.start } : null;

  const pick = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPickDay(i);
    }
  };

  return (
    <div className="week-view" id="week-view">
      <div className="wv-head">
        <div />
        {days.map((d) => (
          <button key={d.key} className={'wv-day' + (d.isToday ? ' today' : '')} onClick={() => onPickDay(d.i)}>
            {d.label}
            <b>{d.date.getDate()}</b>
          </button>
        ))}
      </div>
      <div className="wv-grid">
        <div className="wv-axis">
          {hours.map((h) => (
            <span key={h} style={{ top: pct(h * 60) }}>{t.week.hour(h)}</span>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.key}
            className={'wv-col' + (d.isToday ? ' today' : '') + (d.rest ? ' off' : '')}
            role="button"
            tabIndex={0}
            title={t.week.open(d.label)}
            onClick={() => {
              if (drag.consumeClick()) return; // soltou o evento aqui: não é "abrir o dia"
              onPickDay(d.i);
            }}
            onKeyDown={pick(d.i)}
            {...(d.rest ? {} : { 'data-day-key': d.key, 'data-from': h0, 'data-to': h1 })}
          >
            {d.rest ? (
              <span className="wv-rest">{t.week.rest[d.rest]}</span>
            ) : (
              <>
                {hours.slice(1, -1).map((h) => (
                  <div key={h} className="wv-hl" style={{ top: pct(h * 60) }} />
                ))}
                {d.blocks.map((b) => {
                  const s = timeToMins(b.time);
                  const e = timeToMins(b.endTime);
                  const done = b.type !== 'intervalo' && isChecked(checks, d.key, b.time);
                  const sIdx = b.session !== undefined ? b.session % NUM_SESSIONS : 0;
                  const label = ((e - s) / span) * GRID_PX >= MIN_LABEL_PX ? cleanBlockName(b.name) : '';
                  // Estudo e pausa são gerados pelo planner — o que se arrasta é evento.
                  const movable = !d.rest && (b.type === 'event' || b.type === 'intervalo');
                  return (
                    <div
                      key={`${b.type}-${b.time}`}
                      className={
                        `wv-blk ${kindOf(b)} s${sIdx}` +
                        (done ? ' done' : '') +
                        (movable ? ' movable' : '') +
                        (drag.isDragging(d.key, b) ? ' dragging' : '')
                      }
                      style={{ top: pct(s), height: `${((e - s) / span) * 100}%` }}
                      title={movable ? t.week.drag : `${b.time}–${b.endTime} ${cleanBlockName(b.name)}`}
                      {...(movable ? drag.handleProps({ dateKey: d.key, block: b }) : {})}
                    >
                      {label}
                    </div>
                  );
                })}
                {ghost && ghost.dateKey === d.key && (
                  <div
                    className="wv-blk wv-ghost"
                    id="wv-ghost"
                    style={{ top: pct(ghost.from), height: `${((ghost.to - ghost.from) / span) * 100}%` }}
                  >
                    {ghost.label}
                  </div>
                )}
                {d.isToday && nowMins >= h0 && nowMins <= h1 && <div className="wv-now" style={{ top: pct(nowMins) }} />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
