// Cópia literal do gerador ANTIGO, extraída do main.js pré-migração, só pra comparação.
const timeToMins = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const minsToTime = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const blockCache = new Map();

function generateBlocks(cfg, events = []) {
  const cacheKey = JSON.stringify({ cfg, events });
  if (blockCache.has(cacheKey)) return blockCache.get(cacheKey);

  // Resolve janelas de estudo (fallback pra retrocompat se vier cfg antigo)
  const rawWindows = Array.isArray(cfg.studyWindows) && cfg.studyWindows.length > 0
    ? cfg.studyWindows
    : [{ start: cfg.start, end: cfg.end }];
  const windows = rawWindows
    .filter(w => w && w.start && w.end)
    .map(w => ({ start: timeToMins(w.start), end: timeToMins(w.end) }))
    .filter(w => w.end > w.start)
    .sort((a, b) => a.start - b.start);

  if (windows.length === 0) {
    blockCache.set(cacheKey, []);
    return [];
  }

  // Bloqueios: eventos (countsAsStudy=true→'event', false→'intervalo') + almoço.
  const blocked = [];
  for (const ev of events) {
    const counts = ev.countsAsStudy !== false;   // default true (retrocompat)
    const entry = {
      start: timeToMins(ev.start), end: timeToMins(ev.end),
      name: ev.name,
      type: counts ? 'event' : 'intervalo',
    };
    if (ev._seriesId) entry._seriesId = ev._seriesId;
    blocked.push(entry);
  }
  if (cfg.hasLunch !== false) {
    const lunchStart = timeToMins(cfg.lunch);
    blocked.push({
      start: lunchStart, end: lunchStart + cfg.lunchDur,
      name: '🍽️ Almoço', type: 'almoco'
    });
  }
  blocked.sort((a, b) => a.start - b.start);

  const blocks = [];
  let sessionN = 0;

  // Emite um bloqueio como block (almoço/evento/intervalo) preservando metadados úteis.
  function emitBlocked(b) {
    const out = {
      time: minsToTime(b.start),
      endTime: minsToTime(b.end),
      name: b.type === 'event' ? `📅 ${b.name}` : (b.type === 'intervalo' && b._seriesId ? `📅 ${b.name}` : b.name),
      type: b.type,
      xp: b.type === 'event' ? calcXP(b.end - b.start) : 0,
      session: b.type === 'event' ? sessionN : undefined,
    };
    if (b._seriesId) out._seriesId = b._seriesId;
    blocks.push(out);
  }

  // Pra cada janela, gera pomos+pausas e respeita bloqueios internos.
  // Antes de cada janela, emite bloqueios que estão entre a anterior e esta (ou antes da primeira).
  for (let wi = 0; wi < windows.length; wi++) {
    const win = windows[wi];
    const gapStart = wi === 0 ? -Infinity : windows[wi - 1].end;
    const interGap = blocked.filter(b => b.start >= gapStart && b.end <= win.start);
    for (const b of interGap) {
      emitBlocked(b);
      sessionN++;
    }

    let cur = win.start;
    const winEnd = win.end;
    let pomoCount = 0;
    const MAX = 300; let iter = 0;

    while (cur < winEnd && iter++ < MAX) {
      // Dentro de bloqueio que cruza/cai nesta janela?
      const inBlock = blocked.find(b => cur >= b.start && cur < b.end);
      if (inBlock) {
        emitBlocked(inBlock);
        cur = inBlock.end;
        pomoCount = 0;
        sessionN++;
        continue;
      }

      // Próximo bloqueio dentro desta janela
      const nextBlock = blocked.find(b => b.start > cur && b.start < winEnd);
      const nextBlockStart = nextBlock ? nextBlock.start : winEnd;
      const gap = nextBlockStart - cur;

      // Gap menor que pomo: mini ou stretch
      if (gap < cfg.pomo && gap > 0) {
        const half = cfg.pomo / 2;
        const lastStudy = [...blocks].reverse().find(b => b.type === 'estudo');
        if (gap >= half) {
          const estudoN = blocks.filter(b => b.type === 'estudo').length + 1;
          blocks.push({
            time: minsToTime(cur), endTime: minsToTime(cur + gap),
            name: `📖 Estudo ${estudoN}`, type: 'estudo',
            xp: calcXP(gap), session: sessionN, mini: true
          });
        } else if (lastStudy) {
          lastStudy.endTime = minsToTime(timeToMins(lastStudy.endTime) + gap);
          lastStudy.xp = calcXP(timeToMins(lastStudy.endTime) - timeToMins(lastStudy.time));
        }
        cur = nextBlockStart;
        continue;
      }

      // Pomodoro normal
      const estudoN = blocks.filter(b => b.type === 'estudo').length + 1;
      blocks.push({
        time: minsToTime(cur), endTime: minsToTime(cur + cfg.pomo),
        name: `📖 Estudo ${estudoN}`, type: 'estudo',
        xp: calcXP(cfg.pomo), session: sessionN
      });
      cur += cfg.pomo;
      pomoCount++;

      const isLong = pomoCount % 4 === 0;
      if (isLong) sessionN++;
      const breakDur = isLong ? cfg.longBreak : cfg.shortBreak;
      const breakName = isLong ? '☕ Pausa longa' : '🧘 Pausa';
      const bxp = Math.max(1, breakDur);
      const afterBreak = cur + breakDur;
      const nextBlockAfterBreak = blocked.find(b => b.start > cur && b.start < winEnd);
      const nextStartAfterBreak = nextBlockAfterBreak ? nextBlockAfterBreak.start : winEnd;

      if (afterBreak > nextStartAfterBreak) {
        cur = nextStartAfterBreak;
        continue;
      }
      const pausaExataAteBloqueio = afterBreak === nextStartAfterBreak;
      if (pausaExataAteBloqueio || afterBreak + cfg.pomo <= nextStartAfterBreak) {
        blocks.push({
          time: minsToTime(cur), endTime: minsToTime(afterBreak),
          name: breakName, type: 'pausa', xp: bxp, session: sessionN
        });
        cur = afterBreak;
      } else if (nextStartAfterBreak < winEnd) {
        continue;
      } else {
        break;
      }
    }

    // Próxima janela = nova sessão (separação visual)
    sessionN++;
  }

  // Bloqueios depois da última janela — emite pra não esconder do plano
  const lastWinEnd = windows[windows.length - 1].end;
  blocked.filter(b => b.start >= lastWinEnd).forEach(b => emitBlocked(b));

  // Último bloco deve ser sempre um estudo (limpa pausas finais)
  while (blocks.length > 0 && blocks[blocks.length - 1].type === 'pausa') {
    blocks.pop();
  }

  blockCache.set(cacheKey, blocks);
  if (blockCache.size > 500) {
    const toDelete = [...blockCache.keys()].slice(0, 250);
    toDelete.forEach(k => blockCache.delete(k));
  }
  return blocks;
}

function calcXP(minutes) {
  return minutes * 2;
}
export { generateBlocks };
