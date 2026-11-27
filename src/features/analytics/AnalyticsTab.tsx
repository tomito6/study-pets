// Aba Análise: "tô fazendo o que planejei?" — diagnóstico, não vitrine.
// Cartão de perfil + sparkline sempre visíveis; abaixo, quatro vistas (Hoje /
// Semana / Geral / Recordes). Mesmos ids/classes do markup antigo.

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { computeStatsNow, currentStreak } from '../../application/plan';
import {
  HEAT_COLORS,
  adherence,
  currentWeekKeys,
  dropoff,
  goalWeek,
  heatmap,
  hourBars,
  nextLevel,
  sparkline,
} from '../../domain/analytics';
import type { Adherence, GoalWeek } from '../../domain/analytics';
import { restDayKind } from '../../domain/dayWindows';
import { getLevel, getLevelPct } from '../../domain/progression';
import { formatCompact } from '../../domain/settings';
import type { Stats } from '../../domain/stats';
import { dk, isWeekendKey } from '../../domain/time';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.analytics;
type View = 'hoje' | 'semana' | 'geral' | 'recordes';
const VIEWS: View[] = ['hoje', 'semana', 'geral', 'recordes'];
const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * O que faz de um ponto, de uma célula ou de uma barra um botão: toque, Enter e Espaço
 * mostram na linha de detalhe o que antes só existia no `title` — e `title` só aparece
 * passando o mouse, que no celular não existe.
 */
function tapProps(label: string, selected: boolean, onPick: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    title: label,
    'aria-label': label,
    'aria-pressed': selected,
    onClick: onPick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick();
      }
    },
  };
}

/** Vazia enquanto nada foi tocado: sem frase ensinando o gesto (o Tomi não quer texto explicativo na tela). */
function Detail({ id, text }: { id: string; text: string | null }) {
  return <div className={'an-detail' + (text ? ' on' : '')} id={id} aria-live="polite">{text}</div>;
}

function ProfileCard({ stats, now }: { stats: Stats; now: Date }) {
  const next = nextLevel(stats.totalXP);
  const sp = sparkline(stats.dayStudyDoneMins, now);
  return (
    <div className="profile-card">
      <div className="profile-top">
        <div className="profile-avatar">🎓</div>
        <div className="profile-info">
          <h2 id="an-level-name">{getLevel(stats.totalXP)}</h2>
          <div className="profile-level" id="an-level-sub">
            {next ? t.toNext(next.threshold - stats.totalXP, next.name) : t.maxLevel}
          </div>
        </div>
      </div>
      <div className="profile-xp-row">
        <span id="an-xp-label">{strings.header.xp(stats.totalXP)}</span>
        <span id="an-xp-next">{next ? strings.header.xp(next.threshold) : ''}</span>
      </div>
      <div className="bar-track"><div className="bar-fill" id="an-xp-bar" style={{ width: `${getLevelPct(stats.totalXP)}%` }} /></div>
      <div className="sparkline-wrap" title={t.sparklineTitle(sp.series.map((s) => formatCompact(s.mins)))}>
        <span className="sparkline-label">{t.sparkline}</span>
        <svg id="an-sparkline" viewBox="0 0 120 24" preserveAspectRatio="none">
          <polyline points={sp.polyline} stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={sp.last[0].toFixed(1)} cy={sp.last[1].toFixed(1)} r="2.2" fill="var(--accent)" />
        </svg>
      </div>
    </div>
  );
}

function AdherenceCard({ id, label, agg, big }: { id: string; label: string; agg: Adherence; big?: boolean }) {
  // A meta é a régua; o plano do período fica na linha de baixo, como contexto.
  const cls =
    'adh-card' + (big ? ' adh-big' : '') +
    (agg.empty ? ' zero' : agg.met ? ' met' : agg.pct < 20 ? ' low' : '');
  return (
    <div className={cls} id={id}>
      <div className="adh-label">{label}</div>
      <div className="adh-val" data-done={agg.done} data-goal={agg.goal}>
        {agg.empty ? t.adhValNone : t.adhVal(formatCompact(agg.done), formatCompact(agg.goal))}
      </div>
      <div className="adh-sub">{agg.empty ? t.noData : t.adhSub(formatCompact(agg.done), formatCompact(agg.planned))}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, agg.pct)}%` }} /></div>
      <div className="adh-pct">{agg.empty ? '' : t.adhPct(agg.pct, agg.met)}</div>
    </div>
  );
}

function GoalWeekCard({ goal, min, headlineId, dotsId, detailId, highlightToday }: { goal: GoalWeek; min: number; headlineId: string; dotsId: string; detailId: string; highlightToday: boolean }) {
  const [sel, setSel] = useState<string | null>(null);
  let detail: string | null = null;
  return (
    <div className="goal-week-card">
      <div className="goal-week-headline" id={headlineId}>
        {t.goalHeadline[0]}{formatCompact(min)}{t.goalHeadline[1]}<strong>{goal.metCount} de {goal.totalDays}</strong>{' '}
        {goal.totalDays === 1 ? t.day : t.days}{t.goalHeadline[2]}
      </div>
      <div className="goal-week-dots" id={dotsId}>
        {goal.dots.map((d) => {
          const label = strings.plan.days[d.dayIdx]!;
          const title =
            d.kind === 'before' ? t.dotBefore(label)
              : d.kind === 'weekend' ? t.dotWeekend(label)
              : d.kind === 'off' ? t.dotOff(label)
              : d.kind === 'future' ? t.dotFuture(label)
                : d.kind === 'met' ? t.dotMet(label, formatCompact(d.done))
                  : t.dotMiss(label, formatCompact(d.done), formatCompact(min));
          const on = sel === d.key;
          if (on) detail = title;
          return (
            <span
              key={d.key}
              className={'goal-dot ' + d.kind + (highlightToday && d.isToday ? ' today' : '') + (on ? ' sel' : '')}
              {...tapProps(title, on, () => setSel(on ? null : d.key))}
            >
              {label[0]}
            </span>
          );
        })}
      </div>
      <Detail id={detailId} text={detail} />
    </div>
  );
}

export function AnalyticsTab() {
  const { tab, config, windowOverrides } = useAppState((s) => ({ tab: s.uiTab, config: s.config, windowOverrides: s.windowOverrides }));
  const [view, setView] = useState<View>('hoje');
  const [selCell, setSelCell] = useState<string | null>(null);
  const [selHour, setSelHour] = useState<number | null>(null);
  const visible = tab === 'analise';

  const now = new Date();
  const stats = computeStatsNow(now);
  const todayKey = dk(now);
  const weekKeys = currentWeekKeys(now);
  const allKeys = Object.keys(stats.dayStudyPlanned).filter((k) => k <= todayKey);
  const skip = config.skipWeekends === true;
  const min = config.dailyStudyMin || 60;
  // Fim de semana pausado e dia declarado livre são neutros; um sábado com janelas abertas é dia normal.
  const restKind = (key: string) => restDayKind({ skipWeekends: skip, isWeekend: isWeekendKey(key), override: windowOverrides[key] });
  const startedAt = config.periodStart ?? null;
  const goal = goalWeek(stats, { now, restKind, startedAt });
  const adhOpts = { now, dailyGoal: min, restKind, startedAt };
  const streaks = currentStreak(stats.dayStudyMins, now);
  const cells = heatmap(stats.dayStudyDoneMins, { now, goal: min, restKind, startedAt });
  const bars = hourBars(stats.hourStudyMins, config.start, config.end);
  const goalText = formatCompact(min);
  let cellDetail: string | null = null;
  const hourText = (b: { hour: number; mins: number }) => t.hourTitle(b.hour, b.mins > 0 ? formatCompact(b.mins) : null);
  const hourSel = bars.find((b) => b.hour === selHour);
  const rows = dropoff(stats.cycleStats);

  return (
    <div className={'analytics-page' + (visible ? ' visible' : '')} id="analytics-page">
      <ProfileCard stats={stats} now={now} />

      <div className="subnav" id="an-subnav">
        {VIEWS.map((v) => (
          <button key={v} className={'subnav-chip' + (view === v ? ' active' : '')} data-view={v} onClick={() => setView(v)}>
            {t.views[v]}
          </button>
        ))}
      </div>

      <div className={'subview' + (view === 'hoje' ? ' active' : '')} data-view="hoje">
        <AdherenceCard id="adherence-today" label={t.adhToday} agg={adherence(stats, [todayKey], adhOpts)} big />
        <GoalWeekCard goal={goal} min={min} headlineId="goal-week-headline-h" dotsId="goal-week-dots-h" detailId="goal-week-detail-h" highlightToday />
      </div>

      <div className={'subview' + (view === 'semana' ? ' active' : '')} data-view="semana">
        <AdherenceCard id="adherence-week" label={t.adhWeek} agg={adherence(stats, weekKeys, adhOpts)} />
        <GoalWeekCard goal={goal} min={min} headlineId="goal-week-headline" dotsId="goal-week-dots" detailId="goal-week-detail" highlightToday={false} />
        <div className="chart-card">
          <div className="section-title">{t.dropoffTitle} <span className="historic-tag">{t.historic}</span></div>
          <div id="dropoff-chart">
            {rows.length === 0 ? (
              <div className="dropoff-empty">{t.dropoffEmpty}</div>
            ) : (
              rows.map((r) => (
                <div className="dropoff-row" key={r.cycle}>
                  <div className="do-label">{t.cycle(r.cycle + 1)}</div>
                  <div className="do-bar"><div className={'do-fill' + (r.pct < 50 ? ' low' : '')} style={{ width: `${r.pct}%` }} /></div>
                  <div className="do-pct">{r.pct}%</div>
                  <div className="do-count">{r.done}/{r.total}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className={'subview' + (view === 'geral' ? ' active' : '')} data-view="geral">
        <AdherenceCard id="adherence-geral" label={t.adhAll} agg={adherence(stats, allKeys, adhOpts)} />
        <div className="chart-card">
          <div className="section-title">{t.heatmapTitle}</div>
          <div className="heatmap-gh" id="heatmap-grid-gh" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
            {cells.map((c) => {
              const day = fmtDay(c.date);
              if (c.kind === 'future') return <div key={c.key} className="heatmap-cell future" title={t.cellFuture(day)} />;
              if (c.kind === 'before') return <div key={c.key} className="heatmap-cell weekend-off before" title={t.cellBefore(day)} />;
              // Futuro e "antes de você começar" não têm o que contar: ficam fora do toque e do Tab.
              const on = selCell === c.key;
              const label =
                c.kind === 'weekend-off' ? t.cellWeekend(day)
                  : c.kind === 'day-off' ? t.cellOff(day)
                    : t.cellValue(day, c.isToday, formatCompact(c.done), goalText, c.pct);
              if (on) cellDetail = label;
              const tap = tapProps(label, on, () => setSelCell(on ? null : c.key));
              const sel = on ? ' sel' : '';
              if (c.kind === 'weekend-off') return <div key={c.key} className={'heatmap-cell weekend-off tap' + sel} {...tap} />;
              if (c.kind === 'day-off') return <div key={c.key} className={'heatmap-cell weekend-off day-off tap' + sel} {...tap} />;
              return <div key={c.key} className={'heatmap-cell tap' + sel} style={{ background: HEAT_COLORS[c.intensity] }} {...tap} />;
            })}
          </div>
          <Detail id="heatmap-detail" text={cellDetail} />
          <div className="heatmap-legend">
            <span>0%</span>
            {HEAT_COLORS.map((color) => <div key={color} className="lc" style={{ background: color }} />)}
            <span>100%+</span>
          </div>
        </div>
        <div className="chart-card">
          <div className="section-title">{t.hoursTitle} <span className="historic-tag">{t.hoursUnit}</span></div>
          <div className={'bar-chart' + (hourSel ? ' has-sel' : '')} id="hour-bar-chart">
            {bars.map((b) => {
              const on = selHour === b.hour;
              return (
                <div
                  className={'bar-wrap' + (on ? ' sel' : '')}
                  key={b.hour}
                  data-hour={b.hour}
                  {...tapProps(hourText(b), on, () => setSelHour(on ? null : b.hour))}
                >
                  <div className={'bar-fill-an' + (b.mins === 0 ? ' empty' : '')} style={{ height: `${Math.max(b.pct, 3)}%` }} />
                  <span className="bar-label">{b.hour}h</span>
                </div>
              );
            })}
          </div>
          <Detail id="hour-detail" text={hourSel ? hourText(hourSel) : null} />
        </div>
      </div>

      <div className={'subview' + (view === 'recordes' ? ' active' : '')} data-view="recordes">
        <div className="an-stats">
          <div className="an-stat"><div className="as-val" id="an-total-checks">{stats.totalChecks}</div><div className="as-label">{t.blocksDone}</div></div>
          <div className="an-stat"><div className="as-val" id="an-streak">{streaks.cur}</div><div className="as-label">{t.daysInRow}</div></div>
          <div className="an-stat"><div className="as-val" id="an-best-week">{stats.bestWeekChecks}</div><div className="as-label">{t.bestWeek}</div></div>
        </div>
        <div className="chart-card">
          <div className="streak-row"><span className="streak-label">{t.curStreak}{streaks.todayOpen && <span className="streak-note" id="an-streak-open">{t.streakOpen}</span>}</span><span className="streak-val" id="an-cur-streak">{t.daysCount(streaks.cur)}</span></div>
          <div className="streak-row"><span className="streak-label">{t.bestStreak}</span><span className="streak-val" id="an-best-streak">{t.daysCount(streaks.best)}</span></div>
          <div className="streak-row"><span className="streak-label">{t.bestDay}</span><span className="streak-val" id="an-best-day">{stats.bestDayChecks > 0 ? `${stats.bestDayLabel} (${stats.bestDayChecks})` : '—'}</span></div>
          <div className="streak-row"><span className="streak-label">{t.bestXp}</span><span className="streak-val" id="an-best-xp">{strings.header.xp(stats.bestDayXP)}</span></div>
        </div>
      </div>
    </div>
  );
}
