// A coluna da direita do Plano no laptop: o XP pendente de hoje e a meta diária com os dots da semana.
// Só existe em tela grande (o App só monta a partir de 1100px). A barra do timer fica logo acima, via CSS.
// Rótulo e valor, sem cartão: a única caixa da coluna é o timer.

import { computeStatsNow, restKindOf } from '../../application/plan';
import { goalWeek } from '../../domain/analytics';
import { isDayClosed } from '../../domain/checks';
import { dk } from '../../domain/time';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

export function PlanSidebar() {
  const now = new Date();
  const todayKey = dk(now);
  const { min, closed } = useAppState((s) => ({
    min: s.config.dailyStudyMin || 60,
    closed: isDayClosed(s.closedDays, todayKey),
  }));
  const stats = computeStatsNow(now);
  const goal = goalWeek(stats, { now, restKind: restKindOf });
  const done = stats.dayStudyDoneMins[todayKey] || 0;
  const pending = stats.todayXP > 0 || stats.todayCoins > 0;
  const t = strings.plan.side;
  const days = strings.plan.days;

  return (
    <aside className="plan-side" id="plan-side">
      <div className="side-item">
        <div className="side-k">{t.today}</div>
        {closed ? (
          <div className="side-v side-closed">{t.closed}</div>
        ) : pending ? (
          <div className="side-v side-pending">
            {strings.plan.xpGain(stats.todayXP)}
            <small>{t.pendingCoins(stats.todayCoins)}</small>
          </div>
        ) : (
          <div className="side-v side-none">{t.none}</div>
        )}
      </div>
      <div className="side-item">
        <div className="side-k">{t.goal(min)}</div>
        <div className="side-v">
          {done}
          <small>{t.goalDays(goal.metCount, goal.totalDays)}</small>
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${Math.min(100, Math.round((done / min) * 100))}%` }} />
        </div>
        <div className="side-dots">
          {goal.dots.map((d) => (
            <span key={d.key} className={'side-dot ' + d.kind + (d.isToday ? ' today' : '')} title={days[d.dayIdx]}>
              {days[d.dayIdx]![0]}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
