// ============================================================
// STUDY PETS — refatorado
// ============================================================

// ============================================================
// INFRAESTRUTURA — auth e persistência, escolhidas por ambiente
// ============================================================
// O main.js não conhece o Firebase: fala com as portas de src/infrastructure/ports.ts.
// VITE_PERSISTENCE=memory (npm run dev:teste) troca tudo por versões em memória.
import { auth, users, persistenceMode, DeleteAccountError } from '../infrastructure';
import { hydrateUserDoc, serializeState, emptyPersistedState } from '../domain/persistence';
// Estado compartilhado com o React (mesmo objeto). Depois de mutar, notify().
import { state, derived, notify, subscribe, setTab, markAuthReady, publishTimerBlock } from '../store/store';
// O plano (semanas, blocos do dia, stats) e o save saíram daqui. Ver src/application.
import {
  rebuildWeeks, forEachDay, dateForWeekDay, findWeek,
  blocksForDay, getEventsForDate, generateBlocks, clearBlockCache,
  computeStatsNow as computeStats, calcStreaksNow as calcStreaks,
} from '../application/plan';
import { scheduleSave, blockSaves, cancelPendingSave } from '../application/save';
import { showToast } from '../shared/toast';
if (persistenceMode === 'memory') {
  console.info('%cStudy Pets em MODO TESTE — sem Firebase; os dados vivem só nesta aba.', 'color:#c8f542');
}

// ---- Domínio puro (sem DOM, sem Firebase, testado em tests/) ----
import { DEFAULT_CFG, migrateConfig } from '../domain/config';
import { dk, timeToMins, minsToTime, mondayOf, aggregateMins } from '../domain/time';
import {
  LEVELS, calcXP, coinsForBlock, coinsForStudyBlock, dailyBonusForStreak,
  getLevel, getLevelIdx, getLevelPct, xpFromCheck, checkPetOf,
  noturnoBonusEligible as noturnoBonusEligiblePure,
} from '../domain/progression';
import { expandEventsForDate } from '../domain/events';
import { generateBlocks as generateBlocksPure, calcActualEnd } from '../domain/planner';
import {
  canToggleCheck, computePendingPetXP,
  isChecked as isCheckedPure, isDayClosed as isDayClosedPure, isFutureDay as isFutureDayPure,
} from '../domain/checks';
import { computeStats as computeStatsPure, calcStreaks as calcStreaksPure } from '../domain/stats';

// ============================================================
// CONSTANTS
// ============================================================
// DEFAULT_CFG, migrateConfig, dailyBonusForStreak, coinsForBlock e coinsForStudyBlock
// agora vivem em src/domain/ (config.ts e progression.ts), importados no topo.

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
// A regra vive em src/domain/progression.ts. Aqui só ligamos ela ao estado atual.
function skillContext() {
  return {
    activePet: state.pets.active || null,
    owlSkill: (state.skills && state.skills.owl) || null,
    activatedAt: (state.skills && state.skills.activatedAt) || 0,
    now: new Date(),
  };
}
function noturnoBonusEligible(b, dateKey) {
  return noturnoBonusEligiblePure(b, dateKey, skillContext());
}
// xpFromCheck vem do domínio (importado no topo).

const DAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const SESSION_NAMES = ['Sessão 1','Sessão 2','Sessão 3','Sessão 4','Sessão 5','Sessão 6'];
const NUM_SESSIONS = 6;
// LEVELS vem de src/domain/progression.ts (importado no topo).

// ============================================================
// STATE — single source of truth
// ============================================================
// `state` agora vem de src/store/store.ts — mesmo objeto, mesmos campos.

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


// ============================================================
// DATE / TIME HELPERS
// ============================================================
// dk, timeToMins, minsToTime e mondayOf vêm de src/domain/time.ts (importados no topo).



function currentWeekDayKeys() {
  const mon = mondayOf(new Date());
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(d.getDate() + i);
    keys.push(dk(d));
  }
  return keys;
}

// aggregateMins vem de src/domain/time.ts (importado no topo).

// ============================================================
// derived.weeks — dynamic, no hardcoded dates
// ============================================================


// ============================================================
// BLOCK GENERATOR — with memoization
// ============================================================

// A geração em si vive em src/domain/planner.ts (pura). Aqui fica só a memoização,
// que é preocupação de performance da UI, não regra de domínio.


// Eventos do dia: une avulsos em state.events[dateKey] + ocorrências expandidas de state.eventSeries.
// Cada ocorrência de série herda o id da série em `_seriesId`, usado pra delete granular.


// calcActualEnd vem de src/domain/planner.ts (importado no topo).

// ============================================================
// CHECKS — by time string, not index
// ============================================================
// As regras estão em src/domain/checks.ts; aqui só ligamos ao state.
function isChecked(dateKey, blockTime) {
  return isCheckedPure(state.checks, dateKey, blockTime);
}

function isDayClosed(dateKey) {
  return isDayClosedPure(state.closedDays, dateKey);
}

function isFutureDay(dateKey) {
  return isFutureDayPure(dateKey, new Date());
}


function getPetXP(petId) {
  return (state.pets.xp && state.pets.xp[petId]) || 0;
}
function getPetLevel(petId) {
  return getLevelIdx(getPetXP(petId)) + 1;
}

// Lê o petId associado a um check. Retrocompat: checks antigos eram `true` (sem pet).
function checkPet(dateKey, blockTime) {
  return checkPetOf(state.checks[dateKey] && state.checks[dateKey][blockTime]);
}

// Processa XP de dias fechados (anteriores a hoje OU hoje se encerrado manualmente)
// creditando no pet salvo em cada check. Idempotente via xpProcessedUntil.
function applyPendingPetXP() {
  if (!state.pets) state.pets = { owned: [], active: null, xp: {}, xpProcessedUntil: null };
  const today = dk(new Date());
  const yest = new Date(); yest.setDate(yest.getDate() - 1);

  // O cálculo (e a idempotência) vive em src/domain/checks.ts.
  const pending = computePendingPetXP({
    checks: state.checks,
    xpProcessedUntil: state.pets.xpProcessedUntil,
    todayKey: today,
    yesterdayKey: dk(yest),
    dayClosed: isDayClosed,
    getBlocks: dayKey => generateBlocks(state.config, getEventsForDate(dayKey)),
  });
  if (!pending) return;

  if (pending.resetXp) state.pets.xp = {};
  if (!state.pets.xp) state.pets.xp = {};
  for (const petId of Object.keys(pending.gains)) {
    state.pets.xp[petId] = (state.pets.xp[petId] || 0) + pending.gains[petId];
  }
  state.pets.xpProcessedUntil = pending.processedUntil;
  scheduleSave();
}

function dayCheckCount(dateKey) {
  return state.checks[dateKey] ? Object.keys(state.checks[dateKey]).length : 0;
}

// ============================================================
// STATS — single computation
// ============================================================
// O cálculo em si vive em src/domain/stats.ts (uma passada só sobre os dias).
// Aqui montamos a lista de dias a partir de derived.weeks e passamos o resto do contexto.


// ============================================================
// LEVEL HELPERS
// ============================================================
// getLevel, getLevelIdx e getLevelPct vêm de src/domain/progression.ts (importados no topo).

// ============================================================
// FIREBASE LOAD / SAVE
// ============================================================
async function loadData(uid) {
  let isNew = false;
  try {
    const raw = await users.load(uid);
    if (raw) {
      // Documento existente (em qualquer formato antigo): a migração vive em src/domain/persistence.ts.
      Object.assign(state, hydrateUserDoc(raw));
    } else {
      isNew = true;
      Object.assign(state, emptyPersistedState());
    }
  } catch (e) {
    console.error('Load failed:', e);
    showToast('⚠️ Erro ao carregar dados');
  }
  rebuildWeeks();
  clearBlockCache();
  return isNew;
}



// ============================================================
// AUTH
// ============================================================
// Entrar/sair viraram casos de uso em src/application/session.ts, chamados pelo React.

auth.onAuthStateChanged(async (user) => {
  if (user) {
    blockSaves(false);
    state.user = user;
    markAuthReady();
    notify();
    const isNew = await loadData(user.uid);
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
    document.getElementById('app').style.display = 'none';
    markAuthReady();
    notify();
  }
});

// ============================================================
// TOAST
// ============================================================
// Spawn floating "+X XP +Y 🪙" near an element (dopamina ao marcar check)

// Ripple verde expandindo a partir do check


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
  timerBlock = block; publishTimerBlock(block);
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
  timerBlock = null; publishTimerBlock(null);
  closeFocusMode();
  renderAll();
}

window.stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null; timerBlock = null; publishTimerBlock(null);
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
  rebuildWeeks();
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
  rebuildWeeks();
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
  const user = auth.currentUser();
  if (!user) { showToast('Ninguém logado'); return; }

  btn.disabled = true;
  status.textContent = 'Apagando...';
  blockSaves(true);        // trava saves pendentes pra não recriar o doc
  cancelPendingSave();
  stopTimer();

  try {
    await users.delete(user.uid);
  } catch (e) {
    console.error('Delete doc failed:', e);
    blockSaves(false);
    btn.disabled = false;
    status.textContent = '⚠️ Não deu pra apagar seus dados. Tenta de novo.';
    return;
  }

  try {
    await auth.deleteCurrentUser({
      // Firebase exige login recente pra apagar conta — a infra reautentica; a UI só avisa.
      onReauthRequired: () => { status.textContent = 'Confirme com o Google pra finalizar...'; },
    });
  } catch (e) {
    if (e instanceof DeleteAccountError && e.stage === 'reauth') {
      console.error('Reauth/delete failed:', e.cause);
      status.textContent = '⚠️ Seus dados foram apagados, mas a conta continua. Entre de novo e repita pra concluir.';
    } else {
      console.error('Delete user failed:', e instanceof DeleteAccountError ? e.cause : e);
      status.textContent = '⚠️ Seus dados foram apagados, mas não deu pra remover a conta. Tenta de novo.';
    }
    btn.disabled = false;
    return;
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
  rebuildWeeks();
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
// A aba ativa vive no store; o cabeçalho React muda o store. Aqui só aplicamos
// no DOM legado o que cada aba mostra/esconde, quando ela muda.
window.switchTab = (tab) => setTab(tab);

// Começa com a aba atual como "já aplicada": só reage a MUDANÇA, como o switchTab antigo.
// (Aplicar na carga gravava display:none inline na timer-bar e escondia o timer pra sempre.)
let appliedTab = state.uiTab;
function applyTab(tab) {
  const isPlano = tab === 'plano';
  document.querySelector('.main').style.display = isPlano ? '' : 'none';
  document.getElementById('timer-bar').style.display = isPlano && timerBlock ? 'flex' : 'none';
  document.getElementById('analytics-page').classList.toggle('visible', tab === 'analise');
  document.getElementById('profile-page').classList.toggle('visible', tab === 'perfil');
  document.getElementById('fab-config').classList.toggle('hidden', !isPlano);
  if (tab === 'analise') renderAnalytics();
  if (tab === 'perfil') renderProfile();
}
subscribe(() => {
  if (state.uiTab === appliedTab) return;
  appliedTab = state.uiTab;
  applyTab(state.uiTab);
});

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
  rebuildWeeks();
  applyPendingPetXP();   // credita XP de dias passados nos pets equipados na hora de cada check
  setTimeout(scheduleEndOfDayPrompt, 600);   // agenda o prompt pro horário exato do último bloco de estudo
  const today = new Date();
  state.uiWeek = findWeek(today);


  state.uiDay = Math.min(6, Math.max(0,
    Math.floor((today - derived.weeks[state.uiWeek - 1].start) / 86400000)
  ));
  renderAll();
}

// Re-renderiza a aba Plano a cada virada de minuto, pra manter o destaque "agora" alinhado com o relógio real.


// O Plano é React: qualquer mudança só precisa avisar o store.
function renderAll() { notify(); }
function renderBlocks() { notify(); }
function renderXP() { notify(); }

// === FINISH DAY ===

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

// ============================================================
// PONTE PRO REACT — some conforme as features migram (ver src/legacy/bridge.ts)
// ============================================================
window.__legacy = { tryStartTimer, playSound };
