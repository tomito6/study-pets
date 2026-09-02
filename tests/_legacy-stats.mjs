// Cópia LITERAL do computeStats/calcStreaks pré-migração, só pra comparação.
// O corpo não foi tocado: as dependências que ele lia como variáveis livres
// (state, forEachDay, blocksForDay, ...) entram como parâmetros do wrapper.
export function makeLegacy(deps) {
  const { state, forEachDay, blocksForDay, isChecked, isDayClosed, dk, dateForWeekDay, timeToMins, xpFromCheck, coinsForBlock, dailyBonusForStreak } = deps;
function computeStats() {
  const stats = {
    totalXP: 0, totalChecks: 0,
    weekXP: {}, weekChecks: {},
    todayXP: 0, todayChecks: 0, todayCoins: 0,
    hourCounts: {},
    bestWeekChecks: 0,
    bestDayChecks: 0, bestDayLabel: '—', bestDayXP: 0,
    studyMins: 0, coins: 0,
    activeWeeks: 0,
    estudosToday: { done: 0, total: 0 },
    pausasToday: { done: 0, total: 0 },
    weekChecksOfCurrent: 0,
    dayCheckCounts: {},
    dayStudyMins: {},
    dayStudyPlanned: {},
    dayStudyDoneMins: {},
    dayMetGoal: {},
    sessionStats: {},
  };

  const todayKey = dk(new Date());
  const curDateKey = dk(dateForWeekDay(state.uiWeek, state.uiDay));
  const minDailyMins = state.config.dailyStudyMin || 60;
  let runningStreak = 0;

  forEachDay((key, d, wi) => {
    // Dia "fechado" entra nos totais: dia passado OU encerrado manualmente hoje
    const isPast = (key !== todayKey) || isDayClosed(key);
    const blocks = blocksForDay(key);
    let dayXP = 0, dayChecks = 0, dayStudyMins = 0, weekHasCheck = false;
    let dayPlanned = 0, dayDone = 0;
    stats.weekXP[wi] = stats.weekXP[wi] || 0;
    stats.weekChecks[wi] = stats.weekChecks[wi] || 0;

    blocks.forEach(b => {
      const isStudyLike = b.type === 'estudo' || b.type === 'event';
      if (isStudyLike) {
        const dur = timeToMins(b.endTime) - timeToMins(b.time);
        dayPlanned += dur;
        if (isChecked(key, b.time)) dayDone += dur;
        if (isPast) {
          const s = b.session ?? 0;
          if (!stats.sessionStats[s]) stats.sessionStats[s] = { done: 0, total: 0 };
          stats.sessionStats[s].total++;
          if (isChecked(key, b.time)) stats.sessionStats[s].done++;
        }
      }
      if (!isStudyLike && b.type !== 'pausa') return;
      if (key === curDateKey) {
        if (isStudyLike) stats.estudosToday.total++;
        else stats.pausasToday.total++;
      }
      if (isChecked(key, b.time)) {
        const dur = timeToMins(b.endTime) - timeToMins(b.time);
        // Counters do próprio dia (incluindo hoje) — usados pra streak/melhor dia
        dayChecks++;
        if (isStudyLike) dayStudyMins += dur;

        // XP efetivo do check (aplica bônus salvo no momento da marcação)
        const check = state.checks[key] && state.checks[key][b.time];
        const effXP = xpFromCheck(b, check);

        if (isPast) {
          // Agregados só de dias fechados (XP/moedas/horas/etc.)
          stats.totalChecks++;
          stats.totalXP += effXP;
          dayXP += effXP;
          weekHasCheck = true;
          stats.weekXP[wi] += effXP;
          stats.weekChecks[wi]++;
          if (isStudyLike) {
            stats.coins += coinsForBlock(b, dur);
            stats.studyMins += dur;
          }
          const hour = parseInt(b.time.split(':')[0]);
          stats.hourCounts[hour] = (stats.hourCounts[hour] || 0) + 1;
        }

        if (key === todayKey) {
          stats.todayXP += effXP;
          stats.todayChecks++;
          if (isStudyLike) stats.todayCoins += coinsForBlock(b, dur);
        }
        if (key === curDateKey) {
          if (isStudyLike) stats.estudosToday.done++;
          else stats.pausasToday.done++;
        }
      }
    });

    stats.dayCheckCounts[key] = dayChecks;
    stats.dayStudyMins[key] = dayStudyMins;
    stats.dayStudyPlanned[key] = dayPlanned;
    stats.dayStudyDoneMins[key] = dayDone;
    stats.dayMetGoal[key] = dayDone >= minDailyMins;
    if (dayStudyMins >= minDailyMins) {
      runningStreak++;
      // Bônus de streak só conta nas moedas se o dia já fechou
      if (isPast) stats.coins += dailyBonusForStreak(runningStreak);
      // Pra hoje (ainda aberto), expõe o bônus como pendente
      else if (key === todayKey) stats.todayCoins += dailyBonusForStreak(runningStreak);
    } else {
      runningStreak = 0;
    }
    if (dayChecks > stats.bestDayChecks) {
      stats.bestDayChecks = dayChecks;
      stats.bestDayLabel = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    }
    if (dayXP > stats.bestDayXP) stats.bestDayXP = dayXP;
    if (weekHasCheck) stats.activeWeeks++;
    if (stats.weekChecks[wi] > stats.bestWeekChecks) stats.bestWeekChecks = stats.weekChecks[wi];
  });

  stats.weekChecksOfCurrent = stats.weekChecks[state.uiWeek - 1] || 0;
  return stats;
}

function calcStreaks(dayStudyMins) {
  const today = dk(new Date());
  const minMins = state.config.dailyStudyMin || 60;
  let cur = 0, best = 0, temp = 0;
  const allKeys = [];
  forEachDay(key => allKeys.push(key));
  allKeys.forEach(k => {
    if ((dayStudyMins[k] || 0) >= minMins) { temp++; if (temp > best) best = temp; }
    else temp = 0;
  });
  const idx = allKeys.indexOf(today);
  if (idx >= 0) {
    for (let i = idx; i >= 0; i--) {
      if ((dayStudyMins[allKeys[i]] || 0) >= minMins) cur++;
      else break;
    }
  }
  return { cur, best };
}
  return { computeStats, calcStreaks };
}
