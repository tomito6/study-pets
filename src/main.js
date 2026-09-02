// ============================================================
// STUDY PETS — refatorado
// ============================================================

// ============================================================
// FIREBASE
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyABZ4DR7v94YyKaswY8FR7T8tOVQkIR7B0",
  authDomain: "plano-estudos-bf51d.firebaseapp.com",
  projectId: "plano-estudos-bf51d",
  storageBucket: "plano-estudos-bf51d.firebasestorage.app",
  messagingSenderId: "807419074503",
  appId: "1:807419074503:web:905534d0f0ef64edf26be2"
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const provider = new GoogleAuthProvider();

// ============================================================
// CONSTANTS
// ============================================================
const DEFAULT_CFG = {
  // start/end mantidos só pra retrocompat (migração). studyWindows é a fonte da verdade.
  start:'09:00', lunch:'13:00', lunchDur:60, end:'18:00',
  studyWindows: [{ start:'09:00', end:'18:00' }],  // janelas de estudo do dia
  pomo:25, shortBreak:5, longBreak:20, hasLunch:true,
  periodStart: null, periodEnd: null, skipWeekends: false,
  dailyStudyMin: 60,
};

// Migra cfg antigo (sem studyWindows) pra novo formato. Idempotente.
function migrateConfig(cfg) {
  if (!cfg) return cfg;
  if (!Array.isArray(cfg.studyWindows) || cfg.studyWindows.length === 0) {
    cfg.studyWindows = [{ start: cfg.start || '09:00', end: cfg.end || '18:00' }];
  }
  if (cfg.extraBreaks) delete cfg.extraBreaks;   // descontinuado
  return cfg;
}

// Bônus diário por dia de streak. Ordem decrescente — primeiro match vence.
const DAILY_BONUS_TIERS = [
  [30, 25],
  [14, 18],
  [7,  12],
  [3,  8],
  [1,  5],
];
function dailyBonusForStreak(streakDay) {
  for (const [min, coins] of DAILY_BONUS_TIERS) {
    if (streakDay >= min) return coins;
  }
  return 0;
}

// Moedas por bloco "estudo-equivalente": 1 moeda por minuto (XP é 2×, moeda é 1×).
// Vale pra estudo e evento igualmente. Skills/streak podem somar bônus em cima depois.
function coinsForStudyBlock(pomoMins) {
  return pomoMins;
}
function coinsForBlock(b, durMin) {
  if (b.type === 'estudo' || b.type === 'event') return durMin;
  return 0;
}

// Saldo de moedas = total ganho - gasto. Nunca negativo.
function getCoinBalance() {
  const stats = computeStats();
  return Math.max(0, stats.coins - (state.coinsSpent || 0));
}

// ============================================================
// SKILLS — bônus de XP por pet/skill ativa
// ============================================================
// Skill Noturno: +5% XP em blocos de estudo a partir das 18h, com a coruja equipada
// e a skill ativa DESDE ANTES do bloco começar (evita exploit de equipar no final).
function noturnoBonusEligible(b, dateKey) {
  if (b.type !== 'estudo') return false;
  if (state.pets.active !== 'owl') return false;
  if (!state.skills || state.skills.owl !== 'noturno') return false;
  const hour = parseInt(b.time.split(':')[0]);
  if (hour < 18) return false;
  if (dateKey !== dk(new Date())) return false;
  const [bh, bm] = b.time.split(':').map(Number);
  const blockStartMs = new Date().setHours(bh, bm, 0, 0);
  if ((state.skills.activatedAt || 0) > blockStartMs) return false;
  return true;
}

// XP efetivo de um check: base * (1 + bonus salvo no check). Sem check ou sem bonus = base.
function xpFromCheck(b, check) {
  if (!check || !check.bonus) return b.xp;
  return Math.round(b.xp * (1 + check.bonus));
}

const FUTURE_WEEKS = 24;       // how many weeks ahead from current Monday
const DAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const SESSION_NAMES = ['Sessão 1','Sessão 2','Sessão 3','Sessão 4','Sessão 5','Sessão 6'];
const NUM_SESSIONS = 6;
const LEVELS = [
  [0,'Zero'],[250,'Iniciante'],[750,'Focado'],[1500,'Dedicado'],
  [2500,'Consistente'],[4000,'Avançado'],[6000,'Expert'],[10000,'Mestre']
];

// ============================================================
// STATE — single source of truth
// ============================================================
const state = {
  user: null,
  checks: {},          // { "2026-05-07": { "09:00": { pet: petId | null } } }   (true antigo é tratado como { pet: null })
  events: {},          // { "2026-05-07": [{name, start, end}] } — eventos avulsos por dia
  eventSeries: [],     // séries recorrentes; veja getEventsForDate. shape: {id, name, start, end, weekdays[], freq, anchor, until, exceptions[]}
  lunchOverrides: {},  // { "2026-05-07": {lunch, lunchDur} }
  closedDays: {},      // { "2026-05-07": true } — dias encerrados manualmente pelo usuário
  config: {...DEFAULT_CFG},
  pets: { owned: [], active: null, xp: {}, xpProcessedUntil: null },   // xp/level por pet. xpProcessedUntil = último dia já creditado (YYYY-MM-DD | null = "ainda não inicializado")
  skills: { owl: null, activatedAt: 0 },   // skill ativa por pet (exclusivo — só uma por pet). activatedAt = ms da última troca, usado p/ evitar exploit "ativa no final"
  coinsSpent: 0,       // total de moedas gastas (em pets, etc). Saldo = ganho - gasto.

  // UI state (not persisted)
  uiTab: 'plano',
  uiWeek: 1,
  uiDay: 0,
};

// ============================================================
// PETS REGISTRY
// ============================================================
const PETS = {
  cat:   { id: 'cat',   name: 'Gato',      emoji: '🐱', price: 150, frames: 4, sprite: i => `idle/pets/cat/${i}.png` },
  cow:   { id: 'cow',   name: 'Vaca',      emoji: '🐮', price: 150, frames: 4, sprite: i => `idle/pets/cow/${i}.png` },
  snake: { id: 'snake', name: 'Cobra',     emoji: '🐍', price: 150, frames: 4, sprite: i => `idle/pets/snake/${i}.png` },
  owl:   { id: 'owl',   name: 'Coruja',    emoji: '🦉', price: 150, frames: 4, sprite: i => `idle/pets/owl/${i}.png`,
           skills: [
             { id: 'noturno', name: 'Noturno', desc: '+5% XP em estudos a partir das 18h' },
             { id: 'voo',     name: 'Voo',     desc: 'Permite o usuário voar (placeholder)' },
           ] },
  dog:   { id: 'dog',   name: 'Cachorro',  emoji: '🐶', price: 150, frames: 4, sprite: i => `idle/pets/dog/${i}.png` },
};

let WEEKS = [];
let saveTimeout = null;
let accountDeleted = false;   // true depois que a conta foi apagada — impede save pendente de recriar o doc

// ============================================================
// DATE / TIME HELPERS
// ============================================================
const dk = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const timeToMins = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const minsToTime = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function dateForWeekDay(weekN, dayIdx) {
  const d = new Date(WEEKS[weekN-1].start);
  d.setDate(d.getDate() + dayIdx);
  return d;
}

function findWeek(date) {
  for (const w of WEEKS) if (date >= w.start && date <= w.end) return w.n;
  return 1;
}

const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

function currentWeekDayKeys() {
  const mon = mondayOf(new Date());
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(d.getDate() + i);
    keys.push(dk(d));
  }
  return keys;
}

function aggregateMins(doneObj, plannedObj, keys) {
  let done = 0, planned = 0;
  keys.forEach(k => { done += doneObj[k]||0; planned += plannedObj[k]||0; });
  return { done, planned, pct: planned > 0 ? Math.round(done/planned*100) : 0 };
}

// ============================================================
// WEEKS — dynamic, no hardcoded dates
// ============================================================
function buildWeeks() {
  const today = new Date();
  let startDate = mondayOf(today);

  // If user has data from earlier, expand backwards to include it
  const allKeys = [
    ...Object.keys(state.checks),
    ...Object.keys(state.events),
    ...Object.keys(state.lunchOverrides),
  ];
  if (allKeys.length > 0) {
    allKeys.sort();
    const earliestDate = new Date(allKeys[0] + 'T12:00:00');
    const earliestMon = mondayOf(earliestDate);
    if (earliestMon < startDate) startDate = earliestMon;
  }

  // periodStart pode empurrar startDate pra trás (mas nunca pra frente — preserva dados anteriores)
  const { periodStart, periodEnd } = state.config;
  if (periodStart) {
    const ps = mondayOf(new Date(periodStart + 'T12:00:00'));
    if (ps < startDate) startDate = ps;
  }

  // endDate: periodEnd é limite REAL (respeitado exatamente). Senão, até 31/12 do ano atual.
  let endDate;
  if (periodEnd) {
    const pe = new Date(periodEnd + 'T12:00:00');
    endDate = mondayOf(pe); endDate.setDate(endDate.getDate() + 6);
    const minEnd = new Date(today); minEnd.setDate(minEnd.getDate() + 7);
    if (endDate < minEnd) endDate = minEnd;
    // Sem expansão pra frente: user definiu o limite, app respeita.
  } else {
    const yearEnd = new Date(today.getFullYear(), 11, 31, 12, 0, 0);
    const minEnd = new Date(today); minEnd.setDate(minEnd.getDate() + 8*7);
    endDate = yearEnd > minEnd ? yearEnd : minEnd;
    // Modo "sempre": se há dados futuros, expande pra preservá-los na UI
    if (allKeys.length > 0) {
      const latestDate = new Date(allKeys[allKeys.length - 1] + 'T12:00:00');
      const latestMon = mondayOf(latestDate); latestMon.setDate(latestMon.getDate() + 6);
      if (latestMon > endDate) endDate = latestMon;
    }
  }

  const totalWeeks = Math.max(1, Math.round((endDate - startDate) / (7 * 86400000)) + 1);

  WEEKS = [];
  for (let i = 0; i < totalWeeks; i++) {
    const s = new Date(startDate); s.setDate(s.getDate() + i*7);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    WEEKS.push({ n: i+1, start: s, end: e });
  }
}

function forEachDay(callback) {
  const skip = state.config.skipWeekends === true;
  for (let wi = 0; wi < WEEKS.length; wi++) {
    for (let di = 0; di < 7; di++) {
      if (skip && di >= 5) continue; // 5 = sáb, 6 = dom (segunda = di 0)
      const d = new Date(WEEKS[wi].start); d.setDate(d.getDate() + di);
      callback(dk(d), d, wi, di);
    }
  }
}

// ============================================================
// BLOCK GENERATOR — with memoization
// ============================================================
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

function clearBlockCache() { blockCache.clear(); }

// Eventos do dia: une avulsos em state.events[dateKey] + ocorrências expandidas de state.eventSeries.
// Cada ocorrência de série herda o id da série em `_seriesId`, usado pra delete granular.
function getEventsForDate(dateKey) {
  const out = (state.events[dateKey] || []).slice();
  const series = state.eventSeries || [];
  if (series.length === 0) {
    return out.sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  }
  const date = new Date(dateKey + 'T12:00:00');
  const dow = date.getDay();
  for (const s of series) {
    if (!s || !Array.isArray(s.weekdays) || s.weekdays.length === 0) continue;
    if (s.anchor && dateKey < s.anchor) continue;
    if (s.until && dateKey > s.until) continue;
    if (Array.isArray(s.exceptions) && s.exceptions.includes(dateKey)) continue;
    if (!s.weekdays.includes(dow)) continue;
    if (s.freq === 'biweekly') {
      const aMon = mondayOf(new Date((s.anchor || dateKey) + 'T12:00:00'));
      const dMon = mondayOf(date);
      const weeksDiff = Math.round((dMon - aMon) / (7 * 24 * 60 * 60 * 1000));
      if (weeksDiff < 0 || weeksDiff % 2 !== 0) continue;
    } else if (s.freq === 'monthly') {
      const a = new Date((s.anchor || dateKey) + 'T12:00:00');
      if (date.getDate() !== a.getDate()) continue;
    }
    out.push({ name: s.name, start: s.start, end: s.end, _seriesId: s.id, countsAsStudy: s.countsAsStudy !== false });
  }
  return out.sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
}

function blocksForDay(dateKey) {
  if (state.config.skipWeekends) {
    const dow = new Date(dateKey + 'T12:00:00').getDay(); // 0=dom, 6=sáb
    if (dow === 0 || dow === 6) return [];
  }
  const events = getEventsForDate(dateKey);
  const lunchOv = state.lunchOverrides[dateKey];
  const cfg = lunchOv ? { ...state.config, ...lunchOv } : state.config;
  return generateBlocks(cfg, events);
}

function calcActualEnd(cfg) {
  const blocks = generateBlocks(cfg, []);
  const lastStudy = [...blocks].reverse().find(b => b.type === 'estudo');
  return lastStudy ? lastStudy.endTime : cfg.end;
}

// ============================================================
// CHECKS — by time string, not index
// ============================================================
function isChecked(dateKey, blockTime) {
  return !!(state.checks[dateKey] && state.checks[dateKey][blockTime]);
}

function isDayClosed(dateKey) {
  return !!(state.closedDays && state.closedDays[dateKey]);
}

function isFutureDay(dateKey) {
  return dateKey > dk(new Date());
}

function toggleCheck(dateKey, blockTime, block) {
  if (isDayClosed(dateKey)) return;   // dia encerrado: read-only
  if (isFutureDay(dateKey)) return;   // dia futuro: ainda não chegou
  if (!state.checks[dateKey]) state.checks[dateKey] = {};
  if (state.checks[dateKey][blockTime]) {
    delete state.checks[dateKey][blockTime];
    if (Object.keys(state.checks[dateKey]).length === 0) delete state.checks[dateKey];
  } else {
    // Guarda o pet equipado no momento do check (null se nenhum).
    // No fim do dia, applyPendingPetXP() credita o XP no pet certo.
    // bonus: multiplicador aditivo (ex: 0.05 = +5%) decidido no momento, baseado em skills ativas.
    let bonus = 0;
    if (block && noturnoBonusEligible(block, dateKey)) bonus = 0.05;
    state.checks[dateKey][blockTime] = { pet: state.pets.active || null, bonus };
  }
  scheduleSave();
}

function getPetXP(petId) {
  return (state.pets.xp && state.pets.xp[petId]) || 0;
}
function getPetLevel(petId) {
  return getLevelIdx(getPetXP(petId)) + 1;
}

// Lê o petId associado a um check. Retrocompat: checks antigos eram `true` (sem pet).
function checkPet(dateKey, blockTime) {
  const v = state.checks[dateKey] && state.checks[dateKey][blockTime];
  if (!v || v === true) return null;
  return v.pet || null;
}

// Processa XP de dias fechados (anteriores a hoje OU hoje se encerrado manualmente)
// creditando no pet salvo em cada check. Idempotente via xpProcessedUntil.
function applyPendingPetXP() {
  if (!state.pets) state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
  const today = dk(new Date());
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const yesterday = dk(yest);

  // Inclui hoje no processamento se foi encerrado manualmente
  const endKey = isDayClosed(today) ? today : yesterday;

  // Primeira execução depois da mudança: zera XP antigo e marca yesterday como processado.
  if (state.pets.xpProcessedUntil == null) {
    state.pets.xp = {};
    state.pets.xpProcessedUntil = yesterday;
    scheduleSave();
    // Se hoje também já tá fechado (edge case), continua pra processá-lo abaixo
  }
  if (state.pets.xpProcessedUntil >= endKey) return;

  const dayKeys = Object.keys(state.checks).filter(k =>
    k > state.pets.xpProcessedUntil && k <= endKey
  ).sort();

  dayKeys.forEach(dayKey => {
    const blocks = generateBlocks(state.config, getEventsForDate(dayKey));
    blocks.forEach(b => {
      if (b.type !== 'estudo' && b.type !== 'event') return;
      if (!isChecked(dayKey, b.time)) return;
      const petId = checkPet(dayKey, b.time);
      if (!petId) return;
      if (!state.pets.xp) state.pets.xp = {};
      const check = state.checks[dayKey] && state.checks[dayKey][b.time];
      state.pets.xp[petId] = (state.pets.xp[petId] || 0) + (xpFromCheck(b, check) || 0);
    });
  });

  state.pets.xpProcessedUntil = endKey;
  scheduleSave();
}

function dayCheckCount(dateKey) {
  return state.checks[dateKey] ? Object.keys(state.checks[dateKey]).length : 0;
}

// ============================================================
// STATS — single computation
// ============================================================
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

// ============================================================
// LEVEL HELPERS
// ============================================================
function getLevel(xp) { let lv = LEVELS[0][1]; for (const [t, n] of LEVELS) { if (xp >= t) lv = n; } return lv; }
function getLevelIdx(xp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (xp >= LEVELS[i][0]) return i;
  return 0;
}
function getLevelPct(xp) {
  let lo = 0, hi = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i][0]) { lo = LEVELS[i][0]; hi = LEVELS[i+1] ? LEVELS[i+1][0] : null; }
  }
  return hi ? Math.round(((xp - lo) / (hi - lo)) * 100) : 100;
}

// ============================================================
// FIREBASE LOAD / SAVE
// ============================================================
async function loadData(uid) {
  let isNew = false;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data();
      state.checks = d.checks || {};
      state.events = d.events || {};
      state.eventSeries = Array.isArray(d.eventSeries) ? d.eventSeries : [];
      state.lunchOverrides = d.lunchOverrides || {};
      state.config = migrateConfig({ ...DEFAULT_CFG, ...(d.config || {}) });
      state.pets = {
        owned: (d.pets && Array.isArray(d.pets.owned)) ? d.pets.owned : [],
        active: (d.pets && d.pets.active) || null,
        xp: (d.pets && d.pets.xp && typeof d.pets.xp === 'object') ? d.pets.xp : {},
        xpProcessedUntil: (d.pets && typeof d.pets.xpProcessedUntil === 'string') ? d.pets.xpProcessedUntil : null,
      };
      state.closedDays = (d.closedDays && typeof d.closedDays === 'object') ? d.closedDays : {};
      state.skills = (d.skills && typeof d.skills === 'object')
        ? { owl: d.skills.owl || null, activatedAt: d.skills.activatedAt || 0 }
        : { owl: null, activatedAt: 0 };
      state.coinsSpent = (typeof d.coinsSpent === 'number') ? d.coinsSpent : 0;
    } else {
      isNew = true;
      state.checks = {}; state.events = {}; state.eventSeries = []; state.lunchOverrides = {};
      state.closedDays = {};
      state.config = { ...DEFAULT_CFG };
      state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
      state.skills = { owl: null, activatedAt: 0 };
      state.coinsSpent = 0;
    }
  } catch (e) {
    console.error('Load failed:', e);
    showToast('⚠️ Erro ao carregar dados');
  }
  buildWeeks();
  clearBlockCache();
  return isNew;
}

function showSaveIndicator(msg = 'Salvando...', done = false) {
  const ind = document.getElementById('save-indicator');
  if (!ind) return;
  ind.textContent = msg;
  ind.classList.add('show');
  if (done) setTimeout(() => ind.classList.remove('show'), 1500);
}

function scheduleSave() {
  if (accountDeleted) return;
  showSaveIndicator('Salvando...');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (!state.user || accountDeleted) return;
    try {
      await setDoc(doc(db, 'users', state.user.uid), {
        checks: state.checks,
        events: state.events,
        eventSeries: state.eventSeries || [],
        lunchOverrides: state.lunchOverrides,
        closedDays: state.closedDays || {},
        config: state.config,
        pets: state.pets,
        skills: state.skills || { owl: null, activatedAt: 0 },
        coinsSpent: state.coinsSpent || 0,
      }, { merge: true });
      showSaveIndicator('Salvo ✓', true);
    } catch (e) {
      console.error('Save failed:', e);
      showSaveIndicator('⚠️ Erro ao salvar', true);
    }
  }, 800);
}

// ============================================================
// AUTH
// ============================================================
window.loginGoogle = async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { console.error(e); }
};
window.logoutUser = async () => { await signOut(auth); };

onAuthStateChanged(auth, async (user) => {
  if (user) {
    accountDeleted = false;
    state.user = user;
    const isNew = await loadData(user.uid);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
    if (isNew) openOnboarding();
  } else {
    state.user = null;
    state.checks = {}; state.events = {}; state.lunchOverrides = {};
    state.closedDays = {};
    state.config = { ...DEFAULT_CFG };
    state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
    state.coinsSpent = 0;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

// ============================================================
// TOAST
// ============================================================
// Spawn floating "+X XP +Y 🪙" near an element (dopamina ao marcar check)
function spawnFloatGain(anchorEl, xp, coins) {
  if (!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const wrap = document.createElement('div');
  wrap.className = 'float-gain';
  wrap.style.left = (rect.right + 8) + 'px';
  wrap.style.top = (rect.top - 6) + 'px';
  let html = '<div class="fg-xp">+' + xp + ' XP</div>';
  if (coins > 0) html += '<div class="fg-coin">+' + coins + ' 🪙</div>';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1400);
}

// Ripple verde expandindo a partir do check
function spawnCheckRipple(rect) {
  if (!rect) return;
  const r = document.createElement('div');
  r.className = 'check-ripple';
  r.style.left = (rect.left + rect.width / 2) + 'px';
  r.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 650);
}

let toastTimeout = null;
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 18px;font-size:13px;color:var(--text);z-index:500;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.style.opacity = '0', 2500);
}

// Dispara um toast com o delta entre o plano antigo (capturado antes da mudança) e o novo,
// pro dia indicado. Silencioso se nada relevante mudou.
function notifyPlanDelta(dateKey, beforeBlocks) {
  if (!beforeBlocks) return;
  const after = blocksForDay(dateKey);
  const studyCount = arr => arr.filter(b => b.type === 'estudo' || b.type === 'event').length;
  const lastEnd = arr => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const t = arr[i].type;
      if (t === 'estudo' || t === 'pausa' || t === 'event') return arr[i].endTime;
    }
    return null;
  };
  const sDelta = studyCount(after) - studyCount(beforeBlocks);
  const beforeEnd = lastEnd(beforeBlocks);
  const afterEnd = lastEnd(after);
  const parts = [];
  if (sDelta !== 0) {
    const sign = sDelta > 0 ? '+' : '';
    const word = Math.abs(sDelta) === 1 ? 'estudo' : 'estudos';
    parts.push(`${sign}${sDelta} ${word}`);
  }
  if (beforeEnd !== afterEnd && afterEnd) {
    parts.push(`termina às ${afterEnd}`);
  }
  if (parts.length === 0) return;
  showToast('Plano reajustado: ' + parts.join(' · '));
}

// ============================================================
// AUDIO
// ============================================================
let audioCtx = null;
let timerMuted = false;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(type = 'estudo') {
  try {
    const ctx = getAudioCtx();
    const slider = document.getElementById('vol-slider');
    const vol = slider ? parseFloat(slider.value) : 0.7;
    if (timerMuted || vol === 0) return;
    const t = ctx.currentTime;

    if (type === 'check') {
      [880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'square'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t + i * 0.1);
        g.gain.linearRampToValueAtTime(vol * 0.3, t + i * 0.1 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.12);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t + i * 0.1); osc.stop(t + i * 0.1 + 0.13);
      });
    } else if (type === 'estudo') {
      [110, 220, 330].forEach(freq => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        g.gain.setValueAtTime(vol * 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.4);
      });
      setTimeout(() => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = 80;
        g.gain.setValueAtTime(vol * 0.8, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
      }, 350);
    } else if (type === 'pausa_curta') {
      [523, 659].forEach((freq, i) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(vol * 0.4, t + i * 0.25);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.25 + 1.2);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t + i * 0.25); osc.stop(t + i * 0.25 + 1.2);
      });
    } else if (type === 'pausa_longa') {
      [784, 784, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t + i * 0.28);
        g.gain.linearRampToValueAtTime(vol * 0.5, t + i * 0.28 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.28 + 0.25);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t + i * 0.28); osc.stop(t + i * 0.28 + 0.26);
      });
    }
  } catch (e) {}
}

window.toggleMute = () => {
  timerMuted = !timerMuted;
  document.getElementById('vol-btn').textContent = timerMuted ? '🔕' : '🔔';
};
window.setVolume = (v) => {
  if (parseFloat(v) === 0) {
    timerMuted = true;
    document.getElementById('vol-btn').textContent = '🔕';
  } else {
    timerMuted = false;
    document.getElementById('vol-btn').textContent = '🔔';
  }
};

// ============================================================
// TIMER
// ============================================================
let timerInterval = null;
let timerBlock = null;

function startTimer(block) {
  if (timerInterval) clearInterval(timerInterval);
  timerBlock = block;
  document.getElementById('timer-bar').classList.add('active');
  document.getElementById('timer-block-name').textContent =
    block.name.replace(/📖|🧘|☕/g, '').trim();
  if (Notification && Notification.permission === 'default') Notification.requestPermission();
  openFocusMode(block);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (updateTimerDisplay()) {
      clearInterval(timerInterval);
      timerInterval = null;
      onTimerEnd();
    }
  }, 1000);
}

function updateTimerDisplay() {
  if (!timerBlock) return true;
  const now = new Date();
  const [eh, em] = timerBlock.endTime.split(':').map(Number);
  const end = new Date(); end.setHours(eh, em, 0, 0);
  const diffSec = Math.floor((end - now) / 1000);
  if (diffSec <= 0) {
    document.getElementById('timer-display').textContent = '00:00';
    updateFocusTimer();
    return true;
  }
  const m = Math.floor(diffSec / 60), s = diffSec % 60;
  const disp = document.getElementById('timer-display');
  disp.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  disp.className = 'timer-time' + (diffSec <= 60 ? ' ending' : '');
  updateFocusTimer();
  return false;
}

function onTimerEnd() {
  const soundType = timerBlock
    ? (timerBlock.type === 'estudo' ? 'estudo'
       : timerBlock.name.includes('longa') ? 'pausa_longa' : 'pausa_curta')
    : 'estudo';
  playSound(soundType);
  if (Notification && Notification.permission === 'granted' && timerBlock) {
    const emoji = timerBlock.type === 'estudo' ? '📖'
                : timerBlock.name.includes('longa') ? '☕' : '🧘';
    const label = timerBlock.type === 'estudo'
      ? 'Estudo concluído! Hora da pausa.'
      : 'Pausa concluída! Hora de estudar.';
    new Notification(`${emoji} ${label}`, {
      body: timerBlock.name.replace(/📖|🧘|☕/g, '').trim(),
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>'
    });
  }
  document.getElementById('timer-bar').classList.remove('active');
  timerBlock = null;
  closeFocusMode();
  renderAll();
}

window.stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null; timerBlock = null;
  document.getElementById('timer-bar').classList.remove('active');
  closeFocusMode();
  renderAll();
};

function tryStartTimer(b) {
  const now = new Date();
  const viewKey = dk(dateForWeekDay(state.uiWeek, state.uiDay));
  const todayKey = dk(now);
  if (viewKey !== todayKey) { showToast('Só dá pra iniciar timer em blocos de hoje 📅'); return; }
  const [sh, sm] = b.time.split(':').map(Number);
  const [eh, em] = b.endTime.split(':').map(Number);
  const blockStart = new Date(); blockStart.setHours(sh, sm, 0, 0);
  const blockEnd = new Date(); blockEnd.setHours(eh, em, 0, 0);
  if (now >= blockEnd) { showToast('Este bloco já terminou ⏎'); return; }
  if (now < blockStart) {
    const diffMin = Math.round((blockStart - now) / 60000);
    showToast(`Este bloco começa em ${diffMin} min ⏳`);
    return;
  }
  startTimer(b);
  renderAll();
}

// ============================================================
// FOCUS MODE (tela cheia ao iniciar um bloco do momento)
// ============================================================
let focusOpen = false;

function blockDurationMin(b) {
  const [sh, sm] = b.time.split(':').map(Number);
  const [eh, em] = b.endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function openFocusMode(block) {
  populateFocusMode(block);
  focusOpen = true;
  document.getElementById('focus-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  updateFocusTimer();
}

window.closeFocusMode = () => {
  focusOpen = false;
  document.getElementById('focus-overlay').classList.remove('open');
  document.body.style.overflow = '';
};

function populateFocusMode(block) {
  const isE = block.type === 'estudo';
  const isP = block.type === 'pausa';
  const key = dk(dateForWeekDay(state.uiWeek, state.uiDay));
  const dayBlocks = blocksForDay(key);

  // Número do bloco dentro da sessão atual (conta só estudo+pausa da mesma sessão)
  let blockNumInSession = 0;
  for (const b of dayBlocks) {
    if (b.session === block.session && (b.type === 'estudo' || b.type === 'pausa')) {
      blockNumInSession++;
      if (b.time === block.time && b.endTime === block.endTime) break;
    }
  }
  const sessionName = SESSION_NAMES[(block.session ?? 0) % NUM_SESSIONS] || 'Sessão';

  // Chip (verde pra estudo, azul pra pausa)
  const chip = document.getElementById('focus-chip');
  chip.className = 'focus-chip' + (isP ? ' pausa' : '');
  document.getElementById('focus-chip-text').textContent = `${sessionName} · Bloco ${blockNumInSession}`;

  // Nome limpo + subtitulo de duração
  document.getElementById('focus-block-name').textContent =
    block.name.replace(/📖|🧘|☕/g, '').trim();
  const durMin = blockDurationMin(block);
  const tipo = isE ? 'Pomodoro' : 'Pausa';
  document.getElementById('focus-pomo-label').textContent = `${tipo} de ${durMin} min`;

  // Cor do anel do timer
  document.getElementById('focus-timer-fill').classList.toggle('pausa', isP);

  // XP e moedas ao concluir
  const xp = block.xp || 0;
  const coins = isE ? coinsForStudyBlock(durMin) : 0;
  document.getElementById('focus-scene-foot').innerHTML =
    `<span class="focus-scene-xp">+${xp} XP</span> · <span class="focus-scene-coins">+${coins} 🪙</span> ao concluir`;

  // Próximo bloco no dia
  const idx = dayBlocks.findIndex(b => b.time === block.time && b.endTime === block.endTime);
  const next = idx >= 0 && idx + 1 < dayBlocks.length ? dayBlocks[idx + 1] : null;
  const nextName = document.getElementById('focus-next-name');
  const nextDur = document.getElementById('focus-next-dur');
  if (next) {
    nextName.textContent = next.name.replace(/📖|🧘|☕/g, '').trim();
    nextDur.textContent = blockDurationMin(next) + ' min';
  } else {
    nextName.textContent = 'Fim do dia 🌙';
    nextDur.textContent = '—';
  }
}

const FOCUS_CIRC = 2 * Math.PI * 45; // ≈ 282.7

function updateFocusTimer() {
  if (!focusOpen || !timerBlock) return;
  const now = new Date();
  document.getElementById('focus-clock').textContent =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  const [eh, em] = timerBlock.endTime.split(':').map(Number);
  const [sh, sm] = timerBlock.time.split(':').map(Number);
  const end = new Date(); end.setHours(eh, em, 0, 0);
  const start = new Date(); start.setHours(sh, sm, 0, 0);
  const totalSec = Math.max(1, Math.floor((end - start) / 1000));
  const remainingSec = Math.max(0, Math.floor((end - now) / 1000));
  const m = Math.floor(remainingSec / 60), s = remainingSec % 60;

  const big = document.getElementById('focus-time-big');
  big.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  big.classList.toggle('ending', remainingSec <= 60);

  const pct = Math.round((1 - remainingSec / totalSec) * 100);
  document.getElementById('focus-time-sub').textContent = `completou · ${pct}%`;

  // anel "drena" conforme o tempo passa: offset 0 = cheio, FOCUS_CIRC = vazio
  const offset = FOCUS_CIRC * (1 - remainingSec / totalSec);
  document.getElementById('focus-timer-fill').setAttribute('stroke-dashoffset', String(offset));
}

// ============================================================
// SETTINGS PANEL
// ============================================================
window.openSettings = () => {
  document.getElementById('cfg-lunch').value = state.config.lunch;
  document.getElementById('cfg-lunch-dur').value = state.config.lunchDur;
  document.getElementById('cfg-pomo').value = state.config.pomo;
  document.getElementById('cfg-short').value = state.config.shortBreak;
  document.getElementById('cfg-long').value = state.config.longBreak;
  document.getElementById('cfg-has-lunch').checked = state.config.hasLunch !== false;
  document.getElementById('cfg-period-start').value = state.config.periodStart || '';
  document.getElementById('cfg-period-end').value = state.config.periodEnd || '';
  document.getElementById('cfg-skip-weekends').checked = state.config.skipWeekends === true;
  document.getElementById('cfg-daily-study-min').value = state.config.dailyStudyMin || 60;
  populateStudyWindows();
  toggleLunchFields();
  updatePreview();
  switchSettingsTab('day');
  document.getElementById('settings-panel').classList.add('open');
};

function populateStudyWindows() {
  const c = document.getElementById('cfg-windows');
  c.innerHTML = '';
  const windows = Array.isArray(state.config.studyWindows) && state.config.studyWindows.length > 0
    ? state.config.studyWindows
    : [{ start: state.config.start || '09:00', end: state.config.end || '18:00' }];
  windows.forEach(w => addStudyWindow(w.start, w.end));
}

window.addStudyWindow = (start = '09:00', end = '12:00') => {
  const c = document.getElementById('cfg-windows');
  // Se já tem janelas, propõe começar onde a última terminou
  if (start === '09:00' && end === '12:00' && c.children.length > 0) {
    const last = c.lastElementChild;
    const lastEnd = last.querySelector('.swc-end').value;
    if (lastEnd) {
      start = lastEnd;
      const [h, m] = lastEnd.split(':').map(Number);
      const endMins = Math.min(h * 60 + m + 180, 23 * 60 + 59);
      end = `${String(Math.floor(endMins / 60)).padStart(2,'0')}:${String(endMins % 60).padStart(2,'0')}`;
    }
  }
  const row = document.createElement('div');
  row.className = 'sw-row';
  row.innerHTML = `
    <input type="time" value="${start}" class="swc-start" aria-label="Início da janela" oninput="updateSwDur(this);updatePreview()">
    <span class="sw-arrow">→</span>
    <input type="time" value="${end}" class="swc-end" aria-label="Fim da janela" oninput="updateSwDur(this);updatePreview()">
    <span class="swc-dur sw-dur"></span>
    <button type="button" class="sw-del" title="Remover janela" onclick="removeStudyWindow(this)">✕</button>
  `;
  c.appendChild(row);
  updateSwDur(row.querySelector('.swc-start'));
  updatePreview();
};

window.removeStudyWindow = (btn) => {
  const card = btn.closest('.sw-row');
  if (!card) return;
  const c = document.getElementById('cfg-windows');
  if (c.children.length <= 1) {
    showToast('Pelo menos uma janela é necessária.');
    return;
  }
  card.remove();
  updatePreview();
};

window.updateSwDur = (input) => {
  const row = input.closest('.sw-row');
  if (!row) return;
  const s = row.querySelector('.swc-start').value;
  const e = row.querySelector('.swc-end').value;
  const durEl = row.querySelector('.swc-dur');
  durEl.classList.remove('bad');
  if (!s || !e) { durEl.textContent = ''; return; }
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) { durEl.textContent = 'fim antes do início'; durEl.classList.add('bad'); return; }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  durEl.textContent = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
};

window.switchSettingsTab = (tab) => {
  document.querySelectorAll('.settings-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.settings-tab-content').forEach(c => {
    c.classList.toggle('active', c.dataset.tabContent === tab);
  });
  const sc = document.querySelector('#settings-panel .st-scroll');
  if (sc) sc.scrollTop = 0;
};
window.closeSettings = () => document.getElementById('settings-panel').classList.remove('open');

window.toggleLunchFields = () => {
  const has = document.getElementById('cfg-has-lunch').checked;
  const fields = document.getElementById('lunch-fields');
  fields.style.opacity = has ? '1' : '0.35';
  fields.style.pointerEvents = has ? 'auto' : 'none';
  document.getElementById('cfg-lunch').disabled = !has;
  document.getElementById('cfg-lunch-dur').disabled = !has;
};

window.resetSettings = () => {
  document.getElementById('cfg-lunch').value = DEFAULT_CFG.lunch;
  document.getElementById('cfg-lunch-dur').value = DEFAULT_CFG.lunchDur;
  document.getElementById('cfg-pomo').value = DEFAULT_CFG.pomo;
  document.getElementById('cfg-short').value = DEFAULT_CFG.shortBreak;
  document.getElementById('cfg-long').value = DEFAULT_CFG.longBreak;
  document.getElementById('cfg-has-lunch').checked = true;
  // periodStart NÃO é resetado — é fixo por sessão (só "Cancelar sessão" muda)
  document.getElementById('cfg-period-end').value = '';
  document.getElementById('cfg-skip-weekends').checked = false;
  document.getElementById('cfg-daily-study-min').value = DEFAULT_CFG.dailyStudyMin;
  // Reseta janelas pra default (1 janela 09:00→18:00)
  document.getElementById('cfg-windows').innerHTML = '';
  DEFAULT_CFG.studyWindows.forEach(w => addStudyWindow(w.start, w.end));
  toggleLunchFields();
  updatePreview();
};

window.clearPeriod = () => {
  // Só limpa o fim — periodStart é fixo por sessão
  document.getElementById('cfg-period-end').value = '';
};

function readCfgForm() {
  const pStart = document.getElementById('cfg-period-start').value;
  const pEnd = document.getElementById('cfg-period-end').value;
  const studyWindows = Array.from(document.querySelectorAll('#cfg-windows .sw-row'))
    .map(card => ({
      start: card.querySelector('.swc-start').value,
      end: card.querySelector('.swc-end').value,
    }))
    .filter(w => w.start && w.end && timeToMins(w.end) > timeToMins(w.start));
  // start/end derivados (retrocompat com código que ainda lê cfg.start/cfg.end)
  const sortedW = [...studyWindows].sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  const startDerived = sortedW.length > 0 ? sortedW[0].start : '09:00';
  const endDerived = sortedW.length > 0 ? sortedW[sortedW.length - 1].end : '18:00';
  return {
    start: startDerived,
    lunch: document.getElementById('cfg-lunch').value,
    lunchDur: parseInt(document.getElementById('cfg-lunch-dur').value),
    end: endDerived,
    studyWindows,
    pomo: parseInt(document.getElementById('cfg-pomo').value),
    shortBreak: parseInt(document.getElementById('cfg-short').value),
    longBreak: parseInt(document.getElementById('cfg-long').value),
    hasLunch: document.getElementById('cfg-has-lunch').checked,
    periodStart: pStart || null,
    periodEnd: pEnd || null,
    skipWeekends: document.getElementById('cfg-skip-weekends').checked,
    dailyStudyMin: Math.min(240, Math.max(15, parseInt(document.getElementById('cfg-daily-study-min').value) || 60)),
  };
}

window.updatePreview = () => {
  const el = document.getElementById('config-preview');
  const warn = (msg) => { el.innerHTML = `<div class="sts-note warn">${msg}</div>`; };
  const cfg = readCfgForm();
  if ([cfg.pomo, cfg.shortBreak, cfg.longBreak, cfg.lunchDur].some(isNaN)) return warn('Preencha todos os campos para ver o resumo.');
  const validWindows = (cfg.studyWindows || []).filter(w =>
    w.start && w.end && timeToMins(w.end) > timeToMins(w.start)
  );
  if (validWindows.length === 0) return warn('Adicione pelo menos uma janela de estudo válida.');
  const blocks = generateBlocks(cfg, []);
  if (blocks.length === 0) return warn('Essa combinação não gera nenhum bloco. Ajuste as janelas ou as durações.');
  const studyBlocks = blocks.filter(b => b.type === 'estudo');
  const pauseBlocks = blocks.filter(b => b.type === 'pausa');
  const studyMins = studyBlocks.reduce((s, b) => s + (timeToMins(b.endTime) - timeToMins(b.time)), 0);
  const pauseMins = pauseBlocks.reduce((s, b) => s + (timeToMins(b.endTime) - timeToMins(b.time)), 0);
  const totalXP = blocks.reduce((s, b) => s + (b.xp || 0), 0);
  const fmt = (mins) => {
    if (mins <= 0) return '0min';
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${m}`;
  };
  const actualEnd = calcActualEnd(cfg);
  const diff = timeToMins(actualEnd) - timeToMins(cfg.end);
  let noteCls = 'ok', note = `Fecha o dia às ${actualEnd}, certinho no fim da última janela.`;
  if (diff > 0) { noteCls = 'warn'; note = `Passa ${diff}min das ${cfg.end} — o último bloco vaza da janela.`; }
  else if (diff < 0) { noteCls = 'warn'; note = `Para às ${actualEnd}, ${Math.abs(diff)}min antes das ${cfg.end} — sobra um tempo sem bloco.`; }
  const tile = (num, lbl, cls) => `<div class="sts-tile ${cls || ''}"><div class="sts-num">${num}</div><div class="sts-lbl">${lbl}</div></div>`;
  const winLine = validWindows.length > 1
    ? `<div class="st-hint">Distribuídos em ${validWindows.length} janelas de estudo.</div>` : '';
  el.innerHTML =
    `<div class="st-summary">` +
      tile(studyBlocks.length, 'pomos') +
      tile(fmt(studyMins), 'estudo') +
      tile(fmt(pauseMins), 'pausas') +
      tile('~' + totalXP, 'XP/dia', 'accent') +
    `</div>` +
    winLine +
    `<div class="sts-note ${noteCls}">${note}</div>`;
};

// ============================================================
// FIT STUDY WIZARD — sugere config {pomo, shortBreak, longBreak} que melhor encaixa
// nas janelas livres do dia visível.
// ============================================================
window.openFitStudy = () => {
  document.getElementById('fs-pomo').value = state.config.pomo || 25;
  document.getElementById('fs-short').value = state.config.shortBreak || 5;
  document.getElementById('fs-long').value = state.config.longBreak || 20;
  document.querySelectorAll('input[name="fs-flex"]').forEach(r => r.checked = (r.value === '10'));
  document.getElementById('fs-suggestions').innerHTML = '';
  document.getElementById('fit-study-panel').classList.add('open');
};
window.closeFitStudy = () => document.getElementById('fit-study-panel').classList.remove('open');

window.runFitStudy = () => {
  const idealPomo = parseInt(document.getElementById('fs-pomo').value) || 25;
  const idealShort = parseInt(document.getElementById('fs-short').value) || 5;
  const idealLong = parseInt(document.getElementById('fs-long').value) || 20;
  const flexEl = document.querySelector('input[name="fs-flex"]:checked');
  const flex = parseInt(flexEl ? flexEl.value : 10);

  // Dia visível (ou hoje, se uiWeek/uiDay batem)
  const dateKey = dk(dateForWeekDay(state.uiWeek, state.uiDay));
  const events = getEventsForDate(dateKey);
  // Lê do form de settings (não do state) — assim respeita start/end/almoço que o usuário
  // já mexeu mas ainda não salvou.
  const cfgBase = readCfgForm();

  const pomoRange = [];
  for (let p = Math.max(15, idealPomo - flex); p <= Math.min(90, idealPomo + flex); p += 5) pomoRange.push(p);
  const shortRange = [];
  for (let s = Math.max(3, idealShort - flex); s <= Math.min(20, idealShort + flex); s += 1) shortRange.push(s);
  const longRange = [];
  for (let l = Math.max(10, idealLong - flex); l <= Math.min(60, idealLong + flex); l += 5) longRange.push(l);

  const candidates = [];
  for (const pomo of pomoRange) {
    for (const short of shortRange) {
      for (const long of longRange) {
        const combo = { ...cfgBase, pomo, shortBreak: short, longBreak: long };
        const blocks = generateBlocks(combo, events);
        const studyBlocks = blocks.filter(b => b.type === 'estudo');
        const studyTotal = studyBlocks.reduce((s, b) => s + (timeToMins(b.endTime) - timeToMins(b.time)), 0);
        const lastEnd = blocks.length > 0 ? timeToMins(blocks[blocks.length - 1].endTime) : 0;
        // Penalidade por desvio do ideal — pomo pesa mais que pausas
        const penalty = Math.abs(pomo - idealPomo) + Math.abs(short - idealShort) * 0.5 + Math.abs(long - idealLong) * 0.3;
        const score = studyTotal - penalty * 0.5;
        candidates.push({ pomo, short, long, studyTotal, lastEnd, studyCount: studyBlocks.length, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const top = [];
  for (const c of candidates) {
    const key = `${c.pomo}_${c.short}_${c.long}`;
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(c);
    if (top.length >= 3) break;
  }
  renderFitSuggestions(top);
};

function renderFitSuggestions(top) {
  const c = document.getElementById('fs-suggestions');
  c.innerHTML = '';
  if (top.length === 0) {
    c.innerHTML = '<p style="color:var(--muted);font-size:13px;">Não encontrei combinações válidas. Aumente a flexibilidade ou ajuste os ideais.</p>';
    return;
  }
  top.forEach((s, i) => {
    const studyH = Math.floor(s.studyTotal / 60);
    const studyM = s.studyTotal % 60;
    const durStr = studyH > 0 ? `${studyH}h${studyM > 0 ? studyM + 'min' : ''}` : `${studyM}min`;
    const card = document.createElement('div');
    card.className = 'fs-card' + (i === 0 ? ' fs-best' : '');
    card.innerHTML = `
      <div class="fs-head">${i === 0 ? '✨ Recomendada' : `Opção ${i + 1}`}</div>
      <div class="fs-stats">Pomo <strong>${s.pomo}</strong> · Pausa <strong>${s.short}</strong> · Longa <strong>${s.long}</strong></div>
      <div class="fs-meta">${s.studyCount} estudos · ${durStr} efetivos · termina às ${minsToTime(s.lastEnd)}</div>
      <button class="fs-apply" onclick="applyFitSuggestion(${s.pomo},${s.short},${s.long})">Aplicar</button>
    `;
    c.appendChild(card);
  });
}

window.applyFitSuggestion = (pomo, short, long) => {
  document.getElementById('cfg-pomo').value = pomo;
  document.getElementById('cfg-short').value = short;
  document.getElementById('cfg-long').value = long;
  if (typeof updatePreview === 'function') updatePreview();
  closeFitStudy();
  showToast('Sugestão preenchida — clica em Salvar pra confirmar');
};

window.saveSettings = () => {
  // periodStart fica fixo: preserva o valor atual do state (não vem do form, input está disabled)
  const visibleKey = dk(dateForWeekDay(state.uiWeek, state.uiDay));
  const before = blocksForDay(visibleKey);
  const newCfg = readCfgForm();
  newCfg.periodStart = state.config.periodStart;
  state.config = newCfg;
  closeSettings();
  buildWeeks();
  clearBlockCache();
  scheduleSave();
  renderAll();
  endPromptShown = false;     // config mudou → permite o prompt aparecer com o novo horário
  scheduleEndOfDayPrompt();
  notifyPlanDelta(visibleKey, before);
};

// ============================================================
// CANCEL SESSION
// ============================================================
window.openCancelConfirm = () => {
  document.getElementById('cancel-confirm-panel').classList.add('open');
};
window.closeCancelConfirm = () => {
  document.getElementById('cancel-confirm-panel').classList.remove('open');
};
window.confirmCancelSession = () => {
  state.checks = {};
  state.events = {};
  state.eventSeries = [];
  state.lunchOverrides = {};
  state.closedDays = {};
  state.config = { ...DEFAULT_CFG };
  state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
  state.skills = { owl: null, activatedAt: 0 };
  if ('coinsSpent' in state) state.coinsSpent = 0;
  closeCancelConfirm();
  closeSettings();
  buildWeeks();
  clearBlockCache();
  scheduleSave();
  renderAll();
  openOnboarding();
  showToast('Sessão cancelada — começando do zero');
};

// ============================================================
// DELETE ACCOUNT
// ============================================================
window.openDeleteAccount = () => {
  document.getElementById('del-acc-input').value = '';
  document.getElementById('del-acc-btn').disabled = true;
  document.getElementById('del-acc-status').textContent = '';
  document.getElementById('delete-account-panel').classList.add('open');
};
window.closeDeleteAccount = () => {
  document.getElementById('delete-account-panel').classList.remove('open');
};
window.onDeleteAccountInput = () => {
  const v = (document.getElementById('del-acc-input').value || '').trim().toUpperCase();
  document.getElementById('del-acc-btn').disabled = (v !== 'APAGAR');
};

// Apaga o doc do Firestore E o usuário do Auth. A ordem importa: o doc primeiro,
// porque depois do deleteUser não sobra credencial pra passar nas rules do Firestore.
window.confirmDeleteAccount = async () => {
  const btn = document.getElementById('del-acc-btn');
  const status = document.getElementById('del-acc-status');
  const user = auth.currentUser;
  if (!user) { showToast('Ninguém logado'); return; }

  btn.disabled = true;
  status.textContent = 'Apagando...';
  accountDeleted = true;        // trava saves pendentes pra não recriar o doc
  clearTimeout(saveTimeout);
  stopTimer();

  try {
    await deleteDoc(doc(db, 'users', user.uid));
  } catch (e) {
    console.error('Delete doc failed:', e);
    accountDeleted = false;
    btn.disabled = false;
    status.textContent = '⚠️ Não deu pra apagar seus dados. Tenta de novo.';
    return;
  }

  try {
    await deleteUser(user);
  } catch (e) {
    // Firebase exige login recente pra apagar conta — reautentica e tenta de novo.
    if (e && e.code === 'auth/requires-recent-login') {
      status.textContent = 'Confirme com o Google pra finalizar...';
      try {
        await reauthenticateWithPopup(user, provider);
        await deleteUser(user);
      } catch (e2) {
        console.error('Reauth/delete failed:', e2);
        status.textContent = '⚠️ Seus dados foram apagados, mas a conta continua. Entre de novo e repita pra concluir.';
        btn.disabled = false;
        return;
      }
    } else {
      console.error('Delete user failed:', e);
      status.textContent = '⚠️ Seus dados foram apagados, mas não deu pra remover a conta. Tenta de novo.';
      btn.disabled = false;
      return;
    }
  }

  closeDeleteAccount();
  closeSettings();
  showToast('Conta apagada. Até mais 👋');
};

// ============================================================
// ONBOARDING PANEL
// ============================================================
window.openOnboarding = () => {
  const todayKey = dk(new Date());
  document.getElementById('onb-start').value = state.config.periodStart || todayKey;
  document.getElementById('onb-end').value = state.config.periodEnd || '';
  document.getElementById('onb-skip-weekends').checked = state.config.skipWeekends === true;
  document.getElementById('onboarding-panel').classList.add('open');
};

window.onbUseAlways = () => {
  document.getElementById('onb-start').value = dk(new Date());
  document.getElementById('onb-end').value = '';
  showToast('Modo "sempre" — até o fim do ano');
};

window.finishOnboarding = () => {
  const pStart = document.getElementById('onb-start').value;
  const pEnd = document.getElementById('onb-end').value;
  // periodStart sempre marca o início (pra preservar progresso). periodEnd null = "sempre" (até fim do ano).
  let periodStart = pStart || dk(new Date());
  let periodEnd = pEnd || null;
  if (periodEnd && periodEnd < periodStart) {
    showToast('⚠️ Data fim antes da data início');
    return;
  }
  state.config = {
    ...state.config,
    periodStart,
    periodEnd,
    skipWeekends: document.getElementById('onb-skip-weekends').checked,
  };
  document.getElementById('onboarding-panel').classList.remove('open');
  buildWeeks();
  clearBlockCache();
  if (typeof scheduleSave === 'function') scheduleSave();
  renderAll();
};

// ============================================================
// EVENT PANEL
// ============================================================
window.openEventPanel = () => {
  // Resetar os campos pra defaults sempre que abre
  document.getElementById('ev-name').value = '';
  document.getElementById('ev-start').value = '11:30';
  document.getElementById('ev-end').value = '13:00';
  document.getElementById('ev-counts').checked = true;
  document.getElementById('ev-repeat').checked = false;
  document.getElementById('ev-repeat-section').classList.remove('show');
  document.getElementById('ev-until').value = '';
  document.querySelectorAll('input[name="ev-freq"]').forEach(r => r.checked = (r.value === 'weekly'));
  // Pré-seleciona o dia da semana atual (UI)
  const todayDow = dateForWeekDay(state.uiWeek, state.uiDay).getDay();
  document.querySelectorAll('#ev-weekdays .weekday-chip').forEach(chip => {
    const isToday = parseInt(chip.dataset.dow, 10) === todayDow;
    chip.classList.toggle('selected', isToday);
  });
  document.getElementById('event-panel').classList.add('open');
};
window.closeEventPanel = () => document.getElementById('event-panel').classList.remove('open');

window.toggleRepeatSection = () => {
  const on = document.getElementById('ev-repeat').checked;
  document.getElementById('ev-repeat-section').classList.toggle('show', on);
};

window.clearEvUntil = () => {
  document.getElementById('ev-until').value = '';
};

// Click nos chips de dia da semana toggla seleção
document.addEventListener('click', (e) => {
  const chip = e.target.closest('#ev-weekdays .weekday-chip');
  if (!chip) return;
  chip.classList.toggle('selected');
});

window.saveEvent = () => {
  const name = document.getElementById('ev-name').value.trim() || 'Evento';
  const start = document.getElementById('ev-start').value;
  const end = document.getElementById('ev-end').value;
  if (timeToMins(end) <= timeToMins(start)) {
    alert('O horário de fim deve ser depois do início.'); return;
  }
  const date = dateForWeekDay(state.uiWeek, state.uiDay);
  const key = dk(date);
  const repeat = document.getElementById('ev-repeat').checked;
  const countsAsStudy = document.getElementById('ev-counts').checked;
  const before = blocksForDay(key);

  if (repeat) {
    const weekdays = Array.from(document.querySelectorAll('#ev-weekdays .weekday-chip.selected'))
      .map(c => parseInt(c.dataset.dow, 10));
    if (weekdays.length === 0) {
      alert('Escolha pelo menos um dia da semana pra repetição.'); return;
    }
    const freqEl = document.querySelector('input[name="ev-freq"]:checked');
    const freq = freqEl ? freqEl.value : 'weekly';
    const untilVal = document.getElementById('ev-until').value || null;
    if (!state.eventSeries) state.eventSeries = [];
    state.eventSeries.push({
      id: 'ser_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name, start, end,
      weekdays, freq,
      anchor: key,
      until: untilVal,
      exceptions: [],
      countsAsStudy,
    });
  } else {
    if (!state.events[key]) state.events[key] = [];
    state.events[key].push({ name, start, end, countsAsStudy });
  }

  closeEventPanel();
  clearBlockCache();
  scheduleSave();
  renderAll();
  notifyPlanDelta(key, before);
};

window.deleteEvent = (key, idx) => {
  const before = blocksForDay(key);
  state.events[key].splice(idx, 1);
  if (state.events[key].length === 0) delete state.events[key];
  clearBlockCache();
  scheduleSave();
  renderAll();
  notifyPlanDelta(key, before);
};

// ============================================================
// LUNCH OVERRIDE PANEL
// ============================================================
let editingLunchKey = null;

function getLunchForDay(key) {
  return state.lunchOverrides[key] || { lunch: state.config.lunch, lunchDur: state.config.lunchDur };
}

window.openLunchPanel = (key) => {
  editingLunchKey = key;
  const ov = getLunchForDay(key);
  document.getElementById('lunch-edit-start').value = ov.lunch;
  document.getElementById('lunch-edit-dur').value = ov.lunchDur;
  document.getElementById('lunch-panel').classList.add('open');
};
window.closeLunchPanel = () => document.getElementById('lunch-panel').classList.remove('open');
window.resetLunchEdit = () => {
  document.getElementById('lunch-edit-start').value = state.config.lunch;
  document.getElementById('lunch-edit-dur').value = state.config.lunchDur;
};
window.saveLunchEdit = () => {
  if (!editingLunchKey) return;
  const before = blocksForDay(editingLunchKey);
  state.lunchOverrides[editingLunchKey] = {
    lunch: document.getElementById('lunch-edit-start').value,
    lunchDur: parseInt(document.getElementById('lunch-edit-dur').value),
  };
  const changedKey = editingLunchKey;
  closeLunchPanel();
  clearBlockCache();
  scheduleSave();
  renderAll();
  notifyPlanDelta(changedKey, before);
};

window.closeIfOutside = (e, id) => {
  if (e.target === document.getElementById(id)) document.getElementById(id).classList.remove('open');
};

// ============================================================
// TAB SWITCHING
// ============================================================
window.switchTab = (tab) => {
  state.uiTab = tab;
  ['plano','analise','perfil'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
  });
  const isPlano = tab === 'plano';
  document.querySelector('.main').style.display = isPlano ? '' : 'none';
  document.getElementById('timer-bar').style.display = isPlano && timerBlock ? 'flex' : 'none';
  document.getElementById('analytics-page').classList.toggle('visible', tab === 'analise');
  document.getElementById('profile-page').classList.toggle('visible', tab === 'perfil');
  document.getElementById('fab-config').classList.toggle('hidden', !isPlano);
  if (tab === 'analise') renderAnalytics();
  if (tab === 'perfil') renderProfile();
};

// ============================================================
// CHARACTER ANIMATION (profile tab)
// ============================================================
let charFrame = 0, charInterval = null;
const CHAR_FRAMES = 4;
function startCharAnim() {
  if (charInterval) clearInterval(charInterval);
  charInterval = setInterval(() => {
    charFrame = (charFrame + 1) % CHAR_FRAMES;
    const img = document.getElementById('char-sprite');
    if (img) img.src = `idle/user/${charFrame}.png`;
  }, 180);
}

// ============================================================
// PET ANIMATION + SHOP
// ============================================================
let petFrame = 0, petInterval = null;
function startPetAnim() {
  if (petInterval) clearInterval(petInterval);
  petInterval = null;
  const img = document.getElementById('pet-sprite');
  if (!img) return;
  const activeId = state.pets.active;
  const pet = activeId && PETS[activeId];
  if (!pet) { img.style.display = 'none'; return; }
  img.style.display = '';
  petFrame = 0;
  img.src = pet.sprite(0);
  petInterval = setInterval(() => {
    petFrame = (petFrame + 1) % pet.frames;
    img.src = pet.sprite(petFrame);
  }, 180);
}

window.openPetsShop = () => {
  renderShop();
  document.getElementById('pets-shop-panel').classList.add('open');
};
window.closePetsShop = () => {
  document.getElementById('pets-shop-panel').classList.remove('open');
};

window.openMyPets = () => {
  renderOwnedPets();
  document.getElementById('my-pets-panel').classList.add('open');
};
window.closeMyPets = () => {
  document.getElementById('my-pets-panel').classList.remove('open');
};

// Cria um card de pet pra grade. Se `showPrice` for false (aba "Meus pets"),
// não mostra preço e desativa o botão "Adotar" — só Equipar/Ativo.
function buildPetCard(pet, { showPrice }) {
  const owned = state.pets.owned.includes(pet.id);
  const active = state.pets.active === pet.id;
  const item = document.createElement('div');
  item.className = 'shop-item' + (active ? ' active-pet' : '');

  if (active) {
    const badge = document.createElement('div');
    badge.className = 'shop-item-active-badge';
    badge.textContent = 'Ativa';
    item.appendChild(badge);
  }

  const img = document.createElement('img');
  img.className = 'shop-item-img';
  img.src = pet.sprite(0);
  img.alt = pet.name;
  img.onerror = () => {
    const fallback = document.createElement('div');
    fallback.className = 'shop-item-emoji';
    fallback.textContent = pet.emoji;
    img.replaceWith(fallback);
  };

  const nameRow = document.createElement('div');
  nameRow.className = 'shop-item-name-row';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'shop-item-name';
  nameSpan.textContent = pet.name;
  nameRow.appendChild(nameSpan);
  if (owned) {
    const lv = document.createElement('span');
    lv.className = 'shop-item-lv';
    lv.textContent = 'Lv. ' + getPetLevel(pet.id);
    nameRow.appendChild(lv);
  }

  item.appendChild(img);
  item.appendChild(nameRow);

  if (showPrice && !owned) {
    const priceDiv = document.createElement('div');
    priceDiv.className = 'shop-item-price';
    priceDiv.textContent = `🪙 ${pet.price}`;
    item.appendChild(priceDiv);
  }

  const btn = document.createElement('button');
  const balance = getCoinBalance();
  const canAfford = balance >= pet.price;
  const locked = !owned && !canAfford;
  btn.className = 'shop-btn' + (active ? ' active' : owned ? ' owned' : locked ? ' locked' : '');
  btn.textContent = active ? '✓ Equipada' : owned ? 'Equipar' : 'Adotar';
  btn.onclick = () => {
    if (!owned) {
      if (!canAfford) {
        showToast('Moedas insuficientes');
        return;
      }
      openBuyConfirm(pet.id);
      return;
    }
    if (active) {
      state.pets.active = null;
    } else {
      state.pets.active = pet.id;
    }
    scheduleSave();
    renderShop();
    renderOwnedPets();
    renderProfile();
    startPetAnim();
  };
  item.appendChild(btn);

  // Skills: só na aba "Meus pets" (showPrice=false), só se o pet tem skills cadastradas, só se o usuário possui o pet
  if (!showPrice && owned && pet.skills && pet.skills.length) {
    const skillsWrap = document.createElement('div');
    skillsWrap.className = 'pet-skills-wrap';
    const header = document.createElement('div');
    header.className = 'pet-skills-header';
    header.textContent = 'Skills';
    skillsWrap.appendChild(header);

    pet.skills.forEach(skill => {
      const active = state.skills && state.skills[pet.id] === skill.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pet-skill-row' + (active ? ' active' : '');
      row.innerHTML = `
        <span class="ps-info">
          <span class="ps-name">${skill.name}</span>
          <span class="ps-desc">${skill.desc}</span>
        </span>
        <span class="ps-toggle ${active ? 'on' : ''}"><span class="ps-knob"></span></span>
      `;
      row.onclick = () => {
        if (!state.skills) state.skills = { activatedAt: 0 };
        if (state.skills[pet.id] === skill.id) {
          state.skills[pet.id] = null;
        } else {
          state.skills[pet.id] = skill.id;
        }
        state.skills.activatedAt = Date.now();
        scheduleSave();
        renderOwnedPets();
      };
      skillsWrap.appendChild(row);
    });

    item.appendChild(skillsWrap);
  }

  return item;
}

function renderShop() {
  const grid = document.getElementById('pets-shop');
  if (!grid) return;
  grid.innerHTML = '';
  Object.values(PETS).forEach(pet => {
    grid.appendChild(buildPetCard(pet, { showPrice: true }));
  });
}

function renderOwnedPets() {
  ['my-pets-grid'].forEach(id => {
    const grid = document.getElementById(id);
    if (!grid) return;
    grid.innerHTML = '';
    const owned = state.pets.owned;
    if (!owned || owned.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'my-pets-empty';
      empty.innerHTML = '<div class="mpe-icon">🐾</div>Nenhum pet ainda.<br>Visite a loja pra adotar um!';
      grid.appendChild(empty);
      return;
    }
    owned.forEach(petId => {
      const pet = PETS[petId];
      if (!pet) return;
      grid.appendChild(buildPetCard(pet, { showPrice: false }));
    });
  });
}

// === BUY CONFIRMATION MODAL ===
let pendingBuy = null;

window.openBuyConfirm = (petId) => {
  const pet = PETS[petId];
  if (!pet) return;
  pendingBuy = petId;
  const body = document.getElementById('buy-confirm-body');
  body.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'buy-confirm-img';
  img.src = pet.sprite(0);
  img.alt = pet.name;
  img.onerror = () => {
    const fallback = document.createElement('div');
    fallback.className = 'buy-confirm-emoji';
    fallback.textContent = pet.emoji;
    img.replaceWith(fallback);
  };
  const text = document.createElement('div');
  text.className = 'buy-confirm-text';
  text.innerHTML = `Adotar <b>${pet.name}</b> por 🪙 <b>${pet.price}</b>?`;
  body.appendChild(img);
  body.appendChild(text);
  document.getElementById('pet-buy-confirm').classList.add('open');
};

window.closeBuyConfirm = () => {
  pendingBuy = null;
  document.getElementById('pet-buy-confirm').classList.remove('open');
};

window.confirmBuy = () => {
  const petId = pendingBuy;
  if (!petId) return;
  const pet = PETS[petId];
  if (!pet) { closeBuyConfirm(); return; }
  if (state.pets.owned.includes(pet.id)) { closeBuyConfirm(); return; }
  if (getCoinBalance() < pet.price) {
    showToast('Moedas insuficientes');
    closeBuyConfirm();
    return;
  }
  state.pets.owned.push(pet.id);
  state.pets.active = pet.id;
  state.coinsSpent = (state.coinsSpent || 0) + pet.price;
  scheduleSave();
  closeBuyConfirm();
  renderShop();
  renderOwnedPets();
  renderProfile();
  startPetAnim();
  showToast(`${pet.name} adotado! 🎉`);
};

// ============================================================
// RENDERING
// ============================================================
function initApp() {
  buildWeeks();
  applyPendingPetXP();   // credita XP de dias passados nos pets equipados na hora de cada check
  setTimeout(scheduleEndOfDayPrompt, 600);   // agenda o prompt pro horário exato do último bloco de estudo
  const today = new Date();
  document.getElementById('today-label').textContent =
    today.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
  state.uiWeek = findWeek(today);

  const sel = document.getElementById('week-select');
  sel.innerHTML = '';
  WEEKS.forEach(w => {
    const o = document.createElement('option');
    o.value = w.n;
    o.textContent = `Semana ${w.n}  ·  ${w.start.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} – ${w.end.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
    if (w.n === state.uiWeek) o.selected = true;
    sel.appendChild(o);
  });

  state.uiDay = Math.min(6, Math.max(0,
    Math.floor((today - WEEKS[state.uiWeek - 1].start) / 86400000)
  ));
  renderAll();
  startNowTick();
}

// Re-renderiza a aba Plano a cada virada de minuto, pra manter o destaque "agora" alinhado com o relógio real.
let nowTickInterval = null;
function startNowTick() {
  if (nowTickInterval) return;
  const tick = () => {
    if (state.uiTab === 'plano' && document.getElementById('app').style.display !== 'none') {
      renderBlocks();
    }
  };
  const msToNextMinute = 60000 - (Date.now() % 60000);
  setTimeout(() => { tick(); nowTickInterval = setInterval(tick, 60000); }, msToNextMinute);
}

window.onWeekChange = () => {
  state.uiWeek = parseInt(document.getElementById('week-select').value);
  state.uiDay = 0;
  renderAll();
};

function renderAll() { renderTabs(); renderBlocks(); renderFinishDay(); renderXP(); }

// === FINISH DAY ===
function renderFinishDay() {
  const wrap = document.getElementById('finish-day-wrap');
  if (!wrap) return;
  const viewKey = dk(dateForWeekDay(state.uiWeek, state.uiDay));
  const todayKey = dk(new Date());
  wrap.innerHTML = '';
  if (viewKey !== todayKey) return;          // só mostra hoje
  if (isDayClosed(viewKey)) {
    wrap.innerHTML = `<div class="finish-day-banner"><span class="fdb-check">✓</span>Dia encerrado</div>`;
    return;
  }
  const btn = document.createElement('button');
  btn.className = 'finish-day-btn';
  btn.innerHTML = '<span>✓</span><span>Encerrar o dia</span>';
  btn.onclick = openFinishDay;
  wrap.appendChild(btn);
}

window.openFinishDay = () => {
  document.getElementById('finish-day-confirm').classList.add('open');
};
window.closeFinishDay = () => {
  document.getElementById('finish-day-confirm').classList.remove('open');
};

// Snapshot dos stats antes/depois pra montar o resumo do dia
function snapshotForSummary() {
  const stats = computeStats();
  return {
    totalXP: stats.totalXP,
    coins: stats.coins,
    userLevelIdx: getLevelIdx(stats.totalXP),
    petXP: JSON.parse(JSON.stringify(state.pets.xp || {})),
  };
}

function renderDaySummary(before, after) {
  const userXP = after.totalXP - before.totalXP;
  const userCoins = after.coins - before.coins;
  const userLevelUp = after.userLevelIdx > before.userLevelIdx;

  const body = document.getElementById('day-summary-body');
  let html = `
    <div class="ds-hero">
      <div class="ds-stat xp"><div class="ds-val">+${userXP}</div><div class="ds-label">XP</div></div>
      <div class="ds-stat coins"><div class="ds-val">+${userCoins}</div><div class="ds-label">Moedas</div></div>
    </div>
  `;

  if (userLevelUp) {
    const newLevelName = LEVELS[after.userLevelIdx][1];
    html += `<div class="ds-levelup"><span class="ds-lu-icon">🆙</span>Subiu pro nível ${after.userLevelIdx + 1} — ${newLevelName}!</div>`;
  }

  const petsWithGain = [];
  for (const id of Object.keys(after.petXP)) {
    const oldXP = before.petXP[id] || 0;
    const newXP = after.petXP[id] || 0;
    const gain = newXP - oldXP;
    if (gain > 0) {
      petsWithGain.push({
        id,
        gain,
        oldLevel: getLevelIdx(oldXP) + 1,
        newLevel: getLevelIdx(newXP) + 1,
      });
    }
  }

  if (petsWithGain.length > 0) {
    petsWithGain.forEach(p => {
      const pet = PETS[p.id];
      if (!pet) return;
      const lvUp = p.newLevel > p.oldLevel;
      const lvText = lvUp
        ? `Lv. ${p.oldLevel} → ${p.newLevel} ✨`
        : `Lv. ${p.newLevel}`;
      html += `
        <div class="ds-pet-row">
          <img src="${pet.sprite(0)}" alt="${pet.name}" onerror="this.style.display='none'">
          <div style="flex:1">
            <div class="ds-pet-name">${pet.name}</div>
            <div class="ds-pet-lv${lvUp ? ' up' : ''}">${lvText}</div>
          </div>
          <div class="ds-pet-gain">+${p.gain} XP</div>
        </div>
      `;
    });
  }

  if (userXP === 0 && userCoins === 0 && petsWithGain.length === 0) {
    html += `<div class="ds-empty-msg">Nenhum bloco marcado hoje.<br>Dia encerrado sem ganhos.</div>`;
  }

  body.innerHTML = html;
}

window.openDaySummary = () => {
  document.getElementById('day-summary-panel').classList.add('open');
};
window.closeDaySummary = () => {
  document.getElementById('day-summary-panel').classList.remove('open');
};

window.confirmFinishDay = () => {
  const todayKey = dk(new Date());
  const before = snapshotForSummary();
  if (!state.closedDays) state.closedDays = {};
  state.closedDays[todayKey] = true;
  applyPendingPetXP();   // credita o XP do pet imediatamente
  scheduleSave();
  closeFinishDay();
  if (endPromptTimeout) { clearTimeout(endPromptTimeout); endPromptTimeout = null; }
  const after = snapshotForSummary();
  renderDaySummary(before, after);
  renderAll();
  if (state.uiTab === 'perfil') renderProfile();
  openDaySummary();
};

// === END-OF-DAY AUTO PROMPT ===
let endPromptShown = false;
let endPromptTimeout = null;

// Retorna o endTime ("HH:MM") do último bloco de estudo de hoje, ou null se não houver
function lastStudyEndToday() {
  const todayKey = dk(new Date());
  const blocks = blocksForDay(todayKey);
  let latest = null;
  let latestMins = -1;
  for (const b of blocks) {
    if (b.type !== 'estudo') continue;
    const [eh, em] = b.endTime.split(':').map(Number);
    const m = eh * 60 + em;
    if (m > latestMins) { latestMins = m; latest = b.endTime; }
  }
  return latest;
}

function checkEndOfDayPrompt() {
  if (endPromptShown) return;
  const todayKey = dk(new Date());
  if (isDayClosed(todayKey)) return;
  const hasCheckToday = !!(state.checks[todayKey] && Object.keys(state.checks[todayKey]).length > 0);
  if (!hasCheckToday) return;
  const lastEnd = lastStudyEndToday();
  if (!lastEnd) return;   // nenhum bloco de estudo hoje
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [eh, em] = lastEnd.split(':').map(Number);
  const lastEndMins = eh * 60 + em;
  if (nowMins < lastEndMins) return;
  endPromptShown = true;
  openEndOfDayPrompt();
}

// Agenda o prompt pra disparar no momento exato em que o último bloco de estudo termina.
// Chamado em initApp, ao prolongar e ao salvar settings (já que o último bloco pode mudar).
function scheduleEndOfDayPrompt() {
  if (endPromptTimeout) { clearTimeout(endPromptTimeout); endPromptTimeout = null; }
  if (endPromptShown) return;
  const todayKey = dk(new Date());
  if (isDayClosed(todayKey)) return;
  const lastEnd = lastStudyEndToday();
  if (!lastEnd) return;
  const now = new Date();
  const [eh, em] = lastEnd.split(':').map(Number);
  const target = new Date(); target.setHours(eh, em, 0, 0);
  const delay = target.getTime() - now.getTime();
  if (delay <= 0) {
    // Já passou — checa imediatamente (condições internas decidem se mostra)
    checkEndOfDayPrompt();
    return;
  }
  endPromptTimeout = setTimeout(() => {
    endPromptTimeout = null;
    checkEndOfDayPrompt();
  }, delay);
}

window.openEndOfDayPrompt = () => {
  const lastEnd = lastStudyEndToday() || (state.config.end || '18:00');
  document.getElementById('eop-intro').textContent =
    `O último bloco de estudo (${lastEnd}) já passou. O que você quer fazer?`;
  document.getElementById('eop-extend-form').style.display = 'none';
  document.getElementById('day-end-prompt').classList.add('open');
};
window.closeEndOfDayPrompt = () => {
  document.getElementById('day-end-prompt').classList.remove('open');
};
window.endPromptFinish = () => {
  closeEndOfDayPrompt();
  openFinishDay();
};
window.endPromptShowExtend = () => {
  const now = new Date();
  // Sugere o horário atual + 1h arredondado, como ponto de partida
  const suggested = new Date(now.getTime() + 60 * 60 * 1000);
  const hh = String(suggested.getHours()).padStart(2, '0');
  const mm = String(suggested.getMinutes()).padStart(2, '0');
  document.getElementById('eop-new-end').value = `${hh}:${mm}`;
  document.getElementById('eop-extend-form').style.display = 'block';
};
window.endPromptHideExtend = () => {
  document.getElementById('eop-extend-form').style.display = 'none';
};
window.endPromptSaveExtend = () => {
  const newEnd = document.getElementById('eop-new-end').value;
  if (!newEnd) return;
  state.config.end = newEnd;
  // Estende a última janela de estudo até o novo horário
  if (Array.isArray(state.config.studyWindows) && state.config.studyWindows.length > 0) {
    const sorted = [...state.config.studyWindows].sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
    const last = sorted[sorted.length - 1];
    last.end = newEnd;
  }
  clearBlockCache();
  scheduleSave();
  closeEndOfDayPrompt();
  renderAll();
  endPromptShown = false;          // novo horário, permite o prompt aparecer de novo quando esse passar
  scheduleEndOfDayPrompt();        // reagenda pro novo horário do último bloco
  showToast(`Fim do dia: ${newEnd} ⏰`);
};

function renderTabs() {
  const c = document.getElementById('day-tabs');
  c.innerHTML = '';
  DAYS.forEach((label, i) => {
    const date = new Date(WEEKS[state.uiWeek - 1].start);
    date.setDate(date.getDate() + i);
    const done = dayCheckCount(dk(date));
    const btn = document.createElement('button');
    btn.className = 'day-tab' + (i === state.uiDay ? ' active' : '') + (done > 0 ? ' has-progress' : '');
    btn.innerHTML = label + '<span class="dot"></span>';
    btn.onclick = () => { state.uiDay = i; renderAll(); };
    c.appendChild(btn);
  });
}

let _eventToDelete = null;
window.openEventDelete = (dateKey, block) => {
  const seriesId = block && block._seriesId ? block._seriesId : null;
  const cleanName = (block.name || '').replace(/^📅\s*/, '');
  _eventToDelete = { key: dateKey, startTime: block.time, seriesId, name: cleanName };
  document.getElementById('event-delete-name').textContent = cleanName;
  const onceBtn = document.getElementById('event-delete-once-btn');
  const mainBtn = document.getElementById('event-delete-main-btn');
  const text = document.getElementById('event-delete-text');
  if (seriesId) {
    onceBtn.style.display = '';
    mainBtn.textContent = 'Apagar a série';
    text.innerHTML = `Este evento faz parte de uma série recorrente (<strong>${cleanName}</strong>). Quer apagar só este dia ou toda a série?`;
  } else {
    onceBtn.style.display = 'none';
    mainBtn.textContent = 'Apagar';
    text.innerHTML = `Vai apagar o evento <strong>${cleanName}</strong>. Os checks ligados a ele somem junto.`;
  }
  document.getElementById('event-delete-confirm').classList.add('open');
};
window.closeEventDeleteConfirm = () => {
  _eventToDelete = null;
  document.getElementById('event-delete-confirm').classList.remove('open');
};
window.confirmEventDeleteOnce = () => {
  if (!_eventToDelete || !_eventToDelete.seriesId) return;
  const { key, seriesId } = _eventToDelete;
  const before = blocksForDay(key);
  const s = (state.eventSeries || []).find(x => x.id === seriesId);
  if (s) {
    if (!Array.isArray(s.exceptions)) s.exceptions = [];
    if (!s.exceptions.includes(key)) s.exceptions.push(key);
  }
  clearBlockCache();
  scheduleSave();
  renderAll();
  closeEventDeleteConfirm();
  notifyPlanDelta(key, before);
};
window.confirmEventDelete = () => {
  if (!_eventToDelete) return;
  const { key, startTime, seriesId } = _eventToDelete;
  const before = blocksForDay(key);
  if (seriesId) {
    state.eventSeries = (state.eventSeries || []).filter(x => x.id !== seriesId);
  } else {
    const events = state.events[key] || [];
    const idx = events.findIndex(ev => ev.start === startTime);
    if (idx >= 0) {
      events.splice(idx, 1);
      if (events.length === 0) delete state.events[key];
    }
  }
  clearBlockCache();
  scheduleSave();
  renderAll();
  closeEventDeleteConfirm();
  notifyPlanDelta(key, before);
};

function renderBlocks() {
  const date = dateForWeekDay(state.uiWeek, state.uiDay);
  const key = dk(date);
  const blocks = blocksForDay(key);
  const c = document.getElementById('blocks-list');
  c.innerHTML = '';

  if (blocks.length === 0) {
    c.innerHTML = '<div class="empty-day">🌴 Dia livre</div>';
    document.getElementById('stat-e').textContent = '0/0';
    document.getElementById('stat-p').textContent = '0/0';
    return;
  }

  let eD=0, eT=0, pD=0, pT=0;
  const checkSvg = `<svg viewBox="0 0 10 10" fill="none" stroke="#0e0e0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>`;
  const now = new Date();
  const isToday = key === dk(now);
  let lastSession = -1;

  blocks.forEach(b => {
    const isE = b.type === 'estudo', isP = b.type === 'pausa';
    const isA = b.type === 'almoco', isEv = b.type === 'event';
    const isI = b.type === 'intervalo';
    if (isE) eT++; else if (isP) pT++;
    const done = isChecked(key, b.time);
    if (done) { if (isE) eD++; else if (isP) pD++; }
    const sIdx = b.session !== undefined ? b.session % NUM_SESSIONS : 0;

    // Is this block currently happening?
    const [sh, sm] = b.time.split(':').map(Number);
    const [eh, em] = b.endTime.split(':').map(Number);
    const bStart = new Date(); bStart.setHours(sh, sm, 0, 0);
    const bEnd = new Date(); bEnd.setHours(eh, em, 0, 0);
    const isNow = isToday && (isE || isP || isA || isI) && now >= bStart && now < bEnd;

    // Session divider
    if ((isE || isP) && b.session !== undefined && b.session !== lastSession) {
      lastSession = b.session;
      const sessionHasNow = isToday && blocks.some(bl => {
        if (bl.session !== b.session || (bl.type !== 'estudo' && bl.type !== 'pausa')) return false;
        const [bsh, bsm] = bl.time.split(':').map(Number);
        const [beh, bem] = bl.endTime.split(':').map(Number);
        const s2 = new Date(); s2.setHours(bsh, bsm, 0, 0);
        const e2 = new Date(); e2.setHours(beh, bem, 0, 0);
        return now >= s2 && now < e2;
      });
      const div = document.createElement('div');
      div.className = `session-divider s${sIdx}` + (sessionHasNow ? ' now-session' : '');
      div.innerHTML = `<div class="sd-line"></div><span class="sd-label">${SESSION_NAMES[sIdx] || 'Sessão'}</span><div class="sd-line"></div>`;
      c.appendChild(div);
    }

    const row = document.createElement('div');
    const sessionClass = (isE || isP || isEv) ? ` session-block s${sIdx}` : '';
    const nowClass = isNow ? ' now-block' : '';
    const timerClass = (timerBlock && timerBlock.time === b.time && timerBlock.endTime === b.endTime) ? ' timer-active' : '';
    const closedClass = isDayClosed(key) ? ' day-closed' : '';
    const futureClass = isFutureDay(key) ? ' day-future' : '';
    row.className = 'block-row' + (isP?' pausa-row':'') + ((isA || isI)?' almoco-row':'') + (isEv?' event-row':'')
      + (done && (isE || isP || isEv) ? ' done' : '') + sessionClass + nowClass + timerClass + closedClass + futureClass;

    let xpLabel = '';
    if (isE || isP) xpLabel = `<span class="block-xp session-xp">+${b.xp} XP</span>`;
    else if (isA) xpLabel = `<span class="block-xp almoco-xp" style="cursor:pointer">${state.lunchOverrides[key]?'✏️ editado':'✏️ editar'}</span>`;
    else if (isI) xpLabel = `<span class="block-xp almoco-xp">livre</span>`;
    else xpLabel = `<span class="block-xp event-xp">+${b.xp} XP</span>`;

    const checkHtml = (isA || isI) ? '' : `<div class="check ${done?'checked':''}">${checkSvg}</div>`;
    row.innerHTML = `${checkHtml}<span class="block-time">${b.time}–${b.endTime}</span><span class="block-name">${b.name}</span>${xpLabel}`;

    if (isE || isP || isEv || isI) {
      const dayClosed = isDayClosed(key);
      const dayFuture = isFutureDay(key);
      if (isE || isP) {
        row.onclick = (e) => {
          if (e.target.closest('.check')) return;
          if (dayFuture) { showToast('Ainda não chegou 🔮'); return; }
          if (dayClosed) { showToast('Dia encerrado 🔒'); return; }
          tryStartTimer(b);
        };
      } else if (isEv || isI) {
        // Intervalo vem de evento sem countsAsStudy. Click apaga igual evento.
        row.style.cursor = 'pointer';
        row.title = 'Clique pra apagar este evento';
        row.onclick = (e) => {
          if (e.target.closest('.check')) return;
          if (dayFuture) { showToast('Ainda não chegou 🔮'); return; }
          if (dayClosed) { showToast('Dia encerrado 🔒'); return; }
          openEventDelete(key, b);
        };
      }
      const checkEl = row.querySelector('.check');
      if (checkEl) {
        checkEl.onclick = (e) => {
          e.stopPropagation();
          if (dayFuture) { showToast('Ainda não chegou 🔮'); return; }
          if (dayClosed) { showToast('Dia encerrado 🔒'); return; }
          const wasChecked = isChecked(key, b.time);
          if (!wasChecked) {
            // Captura a posição ANTES do renderAll (que destrói o nó)
            const rect = checkEl.getBoundingClientRect();
            const dur = timeToMins(b.endTime) - timeToMins(b.time);
            const coins = coinsForBlock(b, dur);
            // XP efetivo já considerando bônus (decidido agora pelas regras de skill)
            const eligibleBonus = noturnoBonusEligible(b, key) ? 0.05 : 0;
            const effXP = Math.round(b.xp * (1 + eligibleBonus));
            playSound('check');
            spawnCheckRipple(rect);
            spawnFloatGain(checkEl, effXP, coins);
          }
          toggleCheck(key, b.time, b);
          renderAll();
        };
      }
    }
    if (isA) {
      row.style.cursor = 'pointer';
      row.title = 'Clique para editar o almoço de hoje';
      row.onclick = () => openLunchPanel(key);
    }
    c.appendChild(row);
  });

  document.getElementById('stat-e').textContent = eD + '/' + eT;
  document.getElementById('stat-p').textContent = pD + '/' + pT;
}

let _prevPendingToday = null;
function renderXP() {
  const stats = computeStats();
  document.getElementById('xp-total').textContent = stats.totalXP;
  document.getElementById('top-xp').textContent = stats.totalXP + ' XP';
  document.getElementById('top-level').textContent = getLevel(stats.totalXP);
  document.getElementById('xp-bar').style.width = getLevelPct(stats.totalXP) + '%';
  document.getElementById('week-xp-val').textContent = 'Semana: ' + (stats.weekXP[state.uiWeek - 1] || 0) + ' XP';
  renderTodayPending(stats);
  document.getElementById('stat-w').textContent = stats.weekChecksOfCurrent + ' ✓';
}

function renderTodayPending(stats) {
  const el = document.getElementById('today-xp-val');
  if (!el) return;
  const todayKey = dk(new Date());
  if (isDayClosed(todayKey)) {
    el.textContent = '✓ Hoje encerrado';
    el.className = 'today-xp today-closed';
    _prevPendingToday = null;
    return;
  }
  if (stats.todayXP > 0 || stats.todayCoins > 0) {
    el.textContent = 'Hoje: +' + stats.todayXP + ' XP · +' + stats.todayCoins + ' 🪙';
    el.className = 'today-xp today-pending';
    const cur = stats.todayXP * 1000 + stats.todayCoins;
    if (_prevPendingToday !== null && cur > _prevPendingToday) {
      el.classList.remove('flash');
      void el.offsetWidth; // reinicia animação
      el.classList.add('flash');
    }
    _prevPendingToday = cur;
  } else {
    el.textContent = 'Hoje: —';
    el.className = 'today-xp';
    _prevPendingToday = 0;
  }
}

// ============================================================
// ANALYTICS RENDER
// ============================================================
function renderAnalytics() {
  const stats = computeStats();
  renderAnalyticsProfile(stats);
  renderAdherenceCards(stats);
  renderGoalWeekDots(stats);
  renderAnalyticsStats(stats);
  renderHeatmapGH(stats);
  renderHourChart(stats);
  renderDropoffChart(stats);
  renderSparkline(stats);
  setupAnalyticsSubnav();
}

let _anSubnavBound = false;
function setupAnalyticsSubnav() {
  if (_anSubnavBound) return;
  const nav = document.getElementById('an-subnav');
  if (!nav) return;
  nav.addEventListener('click', e => {
    const chip = e.target.closest('.subnav-chip');
    if (!chip) return;
    const view = chip.dataset.view;
    nav.querySelectorAll('.subnav-chip').forEach(c => c.classList.toggle('active', c.dataset.view === view));
    document.querySelectorAll('#analytics-page .subview').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  });
  _anSubnavBound = true;
}

function renderAnalyticsProfile(stats) {
  const totalXP = stats.totalXP;
  const level = getLevel(totalXP);
  const pct = getLevelPct(totalXP);
  const nextLvl = LEVELS.find(([t]) => t > totalXP);
  document.getElementById('an-level-name').textContent = level;
  document.getElementById('an-level-sub').textContent = nextLvl
    ? `Faltam ${nextLvl[0] - totalXP} XP para ${nextLvl[1]}`
    : 'Nível máximo atingido! 🏆';
  document.getElementById('an-xp-label').textContent = totalXP + ' XP';
  document.getElementById('an-xp-next').textContent = nextLvl ? nextLvl[0] + ' XP' : '';
  document.getElementById('an-xp-bar').style.width = pct + '%';
}

function renderAnalyticsStats(stats) {
  document.getElementById('an-total-checks').textContent = stats.totalChecks;
  document.getElementById('an-best-week').textContent = stats.bestWeekChecks;
  document.getElementById('an-best-day').textContent = stats.bestDayChecks > 0
    ? `${stats.bestDayLabel} (${stats.bestDayChecks})` : '—';
  document.getElementById('an-best-xp').textContent = stats.bestDayXP + ' XP';
  const { cur, best } = calcStreaks(stats.dayStudyMins);
  document.getElementById('an-streak').textContent = cur;
  document.getElementById('an-cur-streak').textContent = cur + ' dias';
  document.getElementById('an-best-streak').textContent = best + ' dias';
}

function setAdhCard(id, agg) {
  const card = document.getElementById(id);
  card.classList.remove('low','zero');
  if (agg.planned === 0) card.classList.add('zero');
  else if (agg.pct < 20) card.classList.add('low');
  card.querySelector('.adh-val').textContent = agg.planned > 0
    ? `${agg.done} / ${agg.planned} min`
    : '— / — min';
  const sub = card.querySelector('.adh-sub');
  if (agg.planned === 0) sub.textContent = 'sem dados ainda';
  else sub.textContent = `${Math.round(agg.done/60*10)/10}h de ${Math.round(agg.planned/60*10)/10}h`;
  card.querySelector('.bar-fill').style.width = Math.min(100, agg.pct) + '%';
  card.querySelector('.adh-pct').textContent = agg.pct + '%';
}

function renderAdherenceCards(stats) {
  const today = dk(new Date());
  const weekKeys = currentWeekDayKeys();
  const allKeys = Object.keys(stats.dayStudyPlanned).filter(k => k <= today);
  setAdhCard('adherence-today', aggregateMins(stats.dayStudyDoneMins, stats.dayStudyPlanned, [today]));
  setAdhCard('adherence-week',  aggregateMins(stats.dayStudyDoneMins, stats.dayStudyPlanned, weekKeys));
  setAdhCard('adherence-geral', aggregateMins(stats.dayStudyDoneMins, stats.dayStudyPlanned, allKeys));
}

function renderGoalWeekDotsTo(stats, headlineId, containerId, opts) {
  opts = opts || {};
  const headline = document.getElementById(headlineId);
  const container = document.getElementById(containerId);
  if (!headline || !container) return;
  const weekKeys = currentWeekDayKeys();          // Mon..Sun
  const todayKey = dk(new Date());
  const skip = !!state.config.skipWeekends;
  const dayLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const considered = weekKeys.filter((k, i) => !(skip && i >= 5));
  const passedConsidered = considered.filter(k => k <= todayKey);
  const metCount = passedConsidered.filter(k => stats.dayMetGoal[k]).length;
  const totalDays = considered.length;
  const min = state.config.dailyStudyMin || 60;
  headline.innerHTML = `Você bateu a meta de ${min}min em <strong>${metCount} de ${totalDays}</strong> ${totalDays === 1 ? 'dia' : 'dias'} esta semana`;
  container.innerHTML = '';
  weekKeys.forEach((k, i) => {
    const dot = document.createElement('span');
    dot.className = 'goal-dot';
    const done = stats.dayStudyDoneMins[k] || 0;
    if (skip && i >= 5) {
      dot.classList.add('weekend');
      dot.title = `${dayLabels[i]} — fim de semana pausado`;
    } else if (k > todayKey) {
      dot.classList.add('future');
      dot.title = `${dayLabels[i]} — futuro`;
    } else if (stats.dayMetGoal[k]) {
      dot.classList.add('met');
      dot.title = `${dayLabels[i]}: ${done} min ✓`;
    } else {
      dot.classList.add('miss');
      dot.title = `${dayLabels[i]}: ${done} min (meta ${min})`;
    }
    if (opts.highlightToday && k === todayKey) dot.classList.add('today');
    dot.textContent = dayLabels[i][0];
    container.appendChild(dot);
  });
}

function renderGoalWeekDots(stats) {
  renderGoalWeekDotsTo(stats, 'goal-week-headline-h', 'goal-week-dots-h', { highlightToday: true });
  renderGoalWeekDotsTo(stats, 'goal-week-headline',   'goal-week-dots',   {});
}

function renderHeatmapGH(stats) {
  const N_WEEKS = 16;
  const heatColors = ['var(--bg3)', '#1a3a20', '#2d6b35', '#65a30d', '#a3e635'];
  const goal = state.config.dailyStudyMin || 60;
  const skip = !!state.config.skipWeekends;
  const todayDate = new Date(); todayDate.setHours(0,0,0,0);
  const todayKey = dk(todayDate);
  const startMon = mondayOf(todayDate);
  startMon.setDate(startMon.getDate() - 7 * (N_WEEKS - 1));
  const grid = document.getElementById('heatmap-grid-gh');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${N_WEEKS}, 1fr)`;
  for (let col = 0; col < N_WEEKS; col++) {
    for (let row = 0; row < 7; row++) {
      const d = new Date(startMon);
      d.setDate(d.getDate() + col * 7 + row);
      const key = dk(d);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const dow = d.getDay();
      if (d > todayDate) {
        cell.classList.add('future');
        cell.title = `${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} — futuro`;
      } else if (skip && (dow === 0 || dow === 6)) {
        cell.classList.add('weekend-off');
        cell.title = `${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} — fim de semana`;
      } else {
        const done = stats.dayStudyDoneMins[key] || 0;
        let intensity;
        if (goal <= 0) intensity = done > 0 ? 4 : 0;
        else {
          const pct = (done / goal) * 100;
          intensity = pct >= 100 ? 4 : Math.min(4, Math.floor(pct / 25));
        }
        cell.style.background = heatColors[intensity];
        const pctTxt = goal > 0 ? Math.round((done/goal)*100) : (done>0?100:0);
        const label = key === todayKey ? ' (hoje)' : '';
        cell.title = `${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}${label}: ${done} de ${goal} min (${pctTxt}%)`;
      }
      grid.appendChild(cell);
    }
  }
}

function renderHourChart(stats) {
  const startH = parseInt(state.config.start.split(':')[0]);
  const endH = parseInt(state.config.end.split(':')[0]) + 1;
  const hours = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  const maxHour = Math.max(...hours.map(h => stats.hourCounts[h] || 0), 1);
  const chart = document.getElementById('hour-bar-chart');
  chart.innerHTML = '';
  hours.forEach(h => {
    const count = stats.hourCounts[h] || 0;
    const pctH = Math.round((count / maxHour) * 100);
    const wrap = document.createElement('div');
    wrap.className = 'bar-wrap';
    wrap.innerHTML = `
      <div class="bar-fill-an${count===0?' empty':''}" style="height:${Math.max(pctH,3)}%"></div>
      <span class="bar-label">${h}h</span>
    `;
    wrap.title = `${h}h: ${count} blocos concluídos`;
    chart.appendChild(wrap);
  });
}

function renderDropoffChart(stats) {
  const wrap = document.getElementById('dropoff-chart');
  wrap.innerHTML = '';
  const keys = Object.keys(stats.sessionStats)
    .map(Number).sort((a,b) => a - b)
    .filter(s => stats.sessionStats[s].total > 0);
  if (keys.length === 0) {
    wrap.innerHTML = '<div class="dropoff-empty">Ainda não há dados suficientes.</div>';
    return;
  }
  keys.forEach(s => {
    const { done, total } = stats.sessionStats[s];
    const pct = total > 0 ? Math.round(done/total*100) : 0;
    const row = document.createElement('div');
    row.className = 'dropoff-row';
    row.innerHTML = `
      <div class="do-label">Sessão ${s + 1}</div>
      <div class="do-bar"><div class="do-fill${pct < 50 ? ' low' : ''}" style="width:${pct}%"></div></div>
      <div class="do-pct">${pct}%</div>
      <div class="do-count">${done}/${total}</div>
    `;
    wrap.appendChild(row);
  });
}

function renderSparkline(stats) {
  const svg = document.getElementById('an-sparkline');
  if (!svg) return;
  const byWeek = {};
  Object.entries(stats.dayStudyDoneMins).forEach(([key, mins]) => {
    if (!mins) return;
    const d = new Date(key + 'T00:00:00');
    const wk = dk(mondayOf(d));
    byWeek[wk] = (byWeek[wk] || 0) + mins;
  });
  const todayMon = mondayOf(new Date());
  const series = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(todayMon); d.setDate(d.getDate() - i * 7);
    const wk = dk(d);
    series.push({ wk, mins: byWeek[wk] || 0 });
  }
  const max = Math.max(...series.map(s => s.mins), 1);
  const W = 120, H = 24, pad = 2;
  const stepX = (W - pad*2) / (series.length - 1);
  const points = series.map((s, i) => {
    const x = pad + i * stepX;
    const y = H - pad - (s.mins / max) * (H - pad*2);
    return [x, y];
  });
  const poly = points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  svg.innerHTML = `
    <polyline points="${poly}" stroke="var(--accent)" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.2" fill="var(--accent)"/>
  `;
  svg.parentElement.title = `Últimas 8 semanas: ${series.map(s => s.mins + 'min').join(' · ')}`;
}

// ============================================================
// PROFILE RENDER
// ============================================================
function renderProfile() {
  startCharAnim();
  startPetAnim();
  applyPendingPetXP();   // se atravessou a meia-noite, credita XP do dia fechado
  const stats = computeStats();
  const totalXP = stats.totalXP;
  const level = getLevel(totalXP);
  const pct = getLevelPct(totalXP);
  const lvlIdx = getLevelIdx(totalXP);
  const nextLvl = LEVELS.find(([t]) => t > totalXP);

  document.getElementById('char-level-badge').textContent = 'Lv. ' + (lvlIdx + 1);
  document.getElementById('char-name').textContent = 'Estudante';

  // Subtitle: só o nível do usuário (info do pet vive no card destacado abaixo)
  document.getElementById('char-title-sub').textContent = level;

  // Próximo XP label
  document.getElementById('char-xp-next-val').textContent = nextLvl ? (nextLvl[0] - totalXP) + ' XP' : 'MÁX';
  document.getElementById('char-xp-bar').style.width = pct + '%';

  // Stats 4-col
  document.getElementById('ps-xp').textContent = totalXP;
  document.getElementById('ps-blocks').textContent = stats.totalChecks;
  const h = Math.floor(stats.studyMins / 60), m = stats.studyMins % 60;
  document.getElementById('ps-hours').textContent = h + 'h' + (m > 0 ? m + 'min' : '');
  document.getElementById('char-coins').textContent = getCoinBalance();

  // Card do pet ativo + contador no botão "Meus pets"
  renderActivePetCard();
  const totalPets = Object.keys(PETS).length;
  const ownedCount = (state.pets.owned || []).length;
  document.getElementById('my-pets-count').textContent = `${ownedCount}/${totalPets} ✨`;
}

function renderActivePetCard() {
  const activeId = state.pets.active;
  const pet = activeId && PETS[activeId];
  const card = document.getElementById('active-pet-card');
  const empty = document.getElementById('no-active-pet');
  if (!pet) {
    card.style.display = 'none';
    empty.style.display = '';
    return;
  }
  card.style.display = '';
  empty.style.display = 'none';

  const sprite = document.getElementById('ap-sprite');
  sprite.src = pet.sprite(0);
  sprite.alt = pet.name;
  sprite.onerror = () => { sprite.style.display = 'none'; };
  sprite.style.display = '';

  document.getElementById('ap-name').textContent = pet.name;
  const petXP = getPetXP(activeId);
  const lvl = getPetLevel(activeId);
  document.getElementById('ap-lv').textContent = 'Lv. ' + lvl;

  const lvlIdx = lvl - 1;
  const curThreshold = LEVELS[lvlIdx] ? LEVELS[lvlIdx][0] : 0;
  const nextEntry = LEVELS[lvlIdx + 1];
  const fill = document.getElementById('ap-bar-fill');
  const xpLabel = document.getElementById('ap-xp');
  if (!nextEntry) {
    fill.style.width = '100%';
    xpLabel.textContent = `${petXP} XP · nível máximo`;
  } else {
    const nextThreshold = nextEntry[0];
    const inLevel = petXP - curThreshold;
    const span = nextThreshold - curThreshold;
    const pct = Math.min(100, Math.round((inLevel / span) * 100));
    fill.style.width = pct + '%';
    xpLabel.textContent = `${petXP} / ${nextThreshold} XP · faltam ${nextThreshold - petXP} pro Lv. ${lvl + 1}`;
  }
}

