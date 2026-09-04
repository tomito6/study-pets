// Aba Análise: "tô fazendo o que planejei?" — diagnóstico, não vitrine.
// Cartão de perfil + sparkline sempre visíveis; abaixo, quatro vistas (Hoje /
// Semana / Geral / Recordes). Mesmos ids/classes do markup antigo.

import { useState } from 'react';
import { calcStreaksNow, computeStatsNow } from '../../application/plan';
import {
  HEAT_COLORS,
  currentWeekKeys,
  dropoff,
  goalWeek,
  heatmap,
  hourBars,
  nextLevel,
  sparkline,
} from '../../domain/analytics';
import type { GoalWeek } from '../../domain/analytics';
import { getLevel, getLevelPct } from '../../domain/progression';
import type { Stats } from '../../domain/stats';
import { aggregateMins, dk } from '../../domain/time';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.analytics;
type View = 'hoje' | 'semana' | 'geral' | 'recordes';
const VIEWS: View[] = ['hoje', 'semana', 'geral', 'recordes'];
const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const hours1 = (mins: number) => Math.round((mins / 60) * 10) / 10;

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
      <div className="sparkline-wrap" title={t.sparklineTitle(sp.series.map((s) => s.mins))}>
        <span className="sparkline-label">{t.sparkline}</span>
        <svg id="an-sparkline" viewBox="0 0 120 24" preserveAspectRatio="none">
          <polyline points={sp.polyline} stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={sp.last[0].toFixed(1)} cy={sp.last[1].toFixed(1)} r="2.2" fill="var(--accent)" />
        </svg>
      </div>
    </div>
  );
}

function AdherenceCard({ id, label, agg, big }: { id: string; label: string; agg: { done: number; planned: number; pct: number }; big?: boolean }) {
  const cls = 'adh-card' + (big ? ' adh-big' : '') + (agg.planned === 0 ? ' zero' : agg.pct < 20 ? ' low' : '');
  return (
    <div className={cls} id={id}>
      <div className="adh-label">{label}</div>
      <div className="adh-val">{agg.planned > 0 ? t.adhVal(agg.done, agg.planned) : t.adhValNone}</div>
      <div className="adh-sub">{agg.planned === 0 ? t.noData : t.adhSub(hours1(agg.done), hours1(agg.planned))}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, agg.pct)}%` }} /></div>
      <div className="adh-pct">{agg.pct}%</div>
    </div>
  );
}

function GoalWeekCard({ goal, min, headlineId, dotsId, highlightToday }: { goal: GoalWeek; min: number; headlineId: string; dotsId: string; highlightToday: boolean }) {
  return (
    <div className="goal-week-card">
      <div className="goal-week-headline" id={headlineId}>
        {t.goalHeadline[0]}{min}{t.goalHeadline[1]}<strong>{goal.metCount} de {goal.totalDays}</strong>{' '}
        {goal.totalDays === 1 ? t.day : t.days}{t.goalHeadline[2]}
      </div>
      <div className="goal-week-dots" id={dotsId}>
        {goal.dots.map((d) => {
          const label = strings.plan.days[d.dayIdx]!;
          const title =
            d.kind === 'weekend' ? t.dotWeekend(label)
              : d.kind === 'off' ? t.dotOff(label)
              : d.kind === 'future' ? t.dotFuture(label)
                : d.kind === 'met' ? t.dotMet(label, d.done)
                  : t.dotMiss(label, d.done, min);
          return (
            <span key={d.key} className={'goal-dot ' + d.kind + (highlightToday && d.isToday ? ' today' : '')} title={title}>
              {label[0]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsTab() {
  const { tab, config } = useAppState((s) => ({ tab: s.uiTab, config: s.config }));
  const [view, setView] = useState<View>('hoje');
  const visible = tab === 'analise';

  const now = new Date();
  const stats = computeStatsNow(now);
  const todayKey = dk(now);
  const weekKeys = currentWeekKeys(now);
  const allKeys = Object.keys(stats.dayStudyPlanned).filter((k) => k <= todayKey);
  const skip = config.skipWeekends === true;
  const min = config.dailyStudyMin || 60;
  // ALTERNATIVA: dia livre não é neutro — aparece como dia sem meta batida (miss) nos dots e no heatmap.
  const goal = goalWeek(stats, { now, skipWeekends: skip });
  const streaks = calcStreaksNow(stats.dayStudyMins, now);
  const cells = heatmap(stats.dayStudyDoneMins, { now, goal: min, skipWeekends: skip });
  const bars = hourBars(stats.hourCounts, config.start, config.end);
  const rows = dropoff(stats.sessionStats);

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
        <AdherenceCard id="adherence-today" label={t.adhToday} agg={aggregateMins(stats.dayStudyDoneMins, stats.dayStudyPlanned, [todayKey])} big />
        <GoalWeekCard goal={goal} min={min} headlineId="goal-week-headline-h" dotsId="goal-week-dots-h" highlightToday />
      </div>

      <div className={'subview' + (view === 'semana' ? ' active' : '')} data-view="semana">
        <AdherenceCard id="adherence-week" label={t.adhWeek} agg={aggregateMins(stats.dayStudyDoneMins, stats.dayStudyPlanned, weekKeys)} />
        <GoalWeekCard goal={goal} min={min} headlineId="goal-week-headline" dotsId="goal-week-dots" highlightToday={false} />
        <div className="chart-card">
          <div className="section-title">{t.dropoffTitle} <span className="historic-tag">{t.historic}</span></div>
          <div id="dropoff-chart">
            {rows.length === 0 ? (
              <div className="dropoff-empty">{t.dropoffEmpty}</div>
            ) : (
              rows.map((r) => (
                <div className="dropoff-row" key={r.session}>
                  <div className="do-label">{t.session(r.session + 1)}</div>
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
        <AdherenceCard id="adherence-geral" label={t.adhAll} agg={aggregateMins(stats.dayStudyDoneMins, stats.dayStudyPlanned, allKeys)} />
        <div className="chart-card">
          <div className="section-title">{t.heatmapTitle}</div>
          <div className="heatmap-gh" id="heatmap-grid-gh" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
            {cells.map((c) => {
              const day = fmtDay(c.date);
              if (c.kind === 'future') return <div key={c.key} className="heatmap-cell future" title={t.cellFuture(day)} />;
              if (c.kind === 'weekend-off') return <div key={c.key} className="heatmap-cell weekend-off" title={t.cellWeekend(day)} />;
              if (c.kind === 'day-off') return <div key={c.key} className="heatmap-cell weekend-off day-off" title={t.cellOff(day)} />;
              return (
                <div
                  key={c.key}
                  className="heatmap-cell"
                  style={{ background: HEAT_COLORS[c.intensity] }}
                  title={t.cellValue(day, c.isToday, c.done, min, c.pct)}
                />
              );
            })}
          </div>
          <div className="heatmap-legend">
            <span>0%</span>
            {HEAT_COLORS.map((color) => <div key={color} className="lc" style={{ background: color }} />)}
            <span>100%+</span>
          </div>
        </div>
        <div className="chart-card">
          <div className="section-title">{t.hoursTitle}</div>
          <div className="bar-chart" id="hour-bar-chart">
            {bars.map((b) => (
              <div className="bar-wrap" key={b.hour} title={t.hourTitle(b.hour, b.count)}>
                <div className={'bar-fill-an' + (b.count === 0 ? ' empty' : '')} style={{ height: `${Math.max(b.pct, 3)}%` }} />
                <span className="bar-label">{b.hour}h</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px' }}>
            {['09h', '12h', '15h', '18h'].map((h) => <span key={h} style={{ fontSize: 9, color: 'var(--muted)' }}>{h}</span>)}
          </div>
        </div>
      </div>

      <div className={'subview' + (view === 'recordes' ? ' active' : '')} data-view="recordes">
        <div className="an-stats">
          <div className="an-stat"><div className="as-val" id="an-total-checks">{stats.totalChecks}</div><div className="as-label">{t.blocksDone}</div></div>
          <div className="an-stat"><div className="as-val" id="an-streak">{streaks.cur}</div><div className="as-label">{t.daysInRow}</div></div>
          <div className="an-stat"><div className="as-val" id="an-best-week">{stats.bestWeekChecks}</div><div className="as-label">{t.bestWeek}</div></div>
        </div>
        <div className="chart-card">
          <div className="streak-row"><span className="streak-label">{t.curStreak}</span><span className="streak-val" id="an-cur-streak">{t.daysCount(streaks.cur)}</span></div>
          <div className="streak-row"><span className="streak-label">{t.bestStreak}</span><span className="streak-val" id="an-best-streak">{t.daysCount(streaks.best)}</span></div>
          <div className="streak-row"><span className="streak-label">{t.bestDay}</span><span className="streak-val" id="an-best-day">{stats.bestDayChecks > 0 ? `${stats.bestDayLabel} (${stats.bestDayChecks})` : '—'}</span></div>
          <div className="streak-row"><span className="streak-label">{t.bestXp}</span><span className="streak-val" id="an-best-xp">{strings.header.xp(stats.bestDayXP)}</span></div>
        </div>
      </div>
    </div>
  );
}
