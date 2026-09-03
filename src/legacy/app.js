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
import { state, derived, notify, subscribe, setTab, markAuthReady } from '../store/store';
import { stopTimer } from '../application/timer';
import { notifyPlanDelta } from '../application/events';
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

// ============================================================
// AUDIO / TIMER / FOCO — migraram pra src/application/timer.ts e src/features/timer
// ============================================================

// ============================================================
// CONFIGURAÇÕES / ENCAIXAR / CANCELAR SESSÃO / APAGAR CONTA — migraram pra src/features/settings
// ============================================================

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
// (almoço do dia, eventos e apagar evento migraram pra src/application/events.ts e src/features/events)
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
  document.getElementById('profile-page').classList.toggle('visible', tab === 'perfil');
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


// ============================================================
// ANÁLISE — migrou pra src/features/analytics e src/domain/analytics.ts
// ============================================================

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

// Salvar configurações (React) reagenda o prompt de fim de dia com o novo horário.
window.rescheduleEndOfDayPrompt = () => { endPromptShown = false; scheduleEndOfDayPrompt(); };
