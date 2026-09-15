// O service worker: recebe o estado do bloqueio (via content.js), guarda, aplica
// as regras, responde com o **ack** do que aplicou, marca a badge "ON", cria um
// alarme pro fim do bloco (as regras somem sozinhas, mesmo com a aba do app
// fechada), redireciona as abas já abertas e vigia as que navegam depois.
// Sem estado ativo, não há regra nenhuma.
//
// Duas formas de "inativo" chegam do app e a diferença importa:
// - `stopped` = "acabou, pode liberar" → limpa tudo.
// - `unknown` = "não sei" (o app recarregou e não tem estudo rodando) → NÃO limpa;
//   o que está aplicado continua até o alarme do `until` vencer. Senão recarregar
//   a página do app seria a porta de escape.
//
// E, desde a 0.3.0, **o alarme do fim do bloco** (`timer`): o app publica "avise às
// 10:25 com este título, este som, neste volume", e é o alarme daqui que avisa — com
// som (página offscreen, `alarm.html`) e notificação do sistema — porque o `setInterval`
// do app não chega com a aba em segundo plano, estrangulada ou descartada. Se o próprio
// Study Pets está em frente (janela focada, aba ativa), quem avisa é ele: aqui, silêncio.

import { ackFor, buildRules, isAppUrl, isBlocked, isLive, isSupported, isTimerDue, isTimerLive, isTimerSupported, timerAckFor } from './rules.js';

const ALARM = 'study-pets-block-expire';
const KEY = 'blocking';
const TIMER_ALARM = 'study-pets-timer-end';
const TIMER_KEY = 'timer';
const APP_URL_KEY = 'appUrl';
const NOTIFICATION_ID = 'study-pets-timer';
const DEFAULT_APP_URL = 'https://plano-estudos-one.vercel.app';
/** Fim vencido há mais que isto quando o navegador acorda não é avisado: seria um aviso de horas atrás. */
const LATE_MAX_MS = 30 * 60_000;

async function readState() {
  const { [KEY]: state } = await chrome.storage.local.get(KEY);
  return isLive(state, Date.now()) ? state : null;
}

async function replaceRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules: rules });
}

/** A badge diz, sem abrir nada, que o bloqueio está de pé. */
async function setBadge(on) {
  try {
    await chrome.action.setBadgeText({ text: on ? 'ON' : '' });
    if (on) await chrome.action.setBadgeBackgroundColor({ color: '#7BB661' });
  } catch {
    // sem `action` no manifest (ou API indisponível): a badge é enfeite, segue o jogo
  }
}

async function clear() {
  await chrome.storage.local.remove(KEY);
  await replaceRules([]);
  await chrome.alarms.clear(ALARM);
  await setBadge(false);
}

const blockedUrl = (url) => chrome.runtime.getURL('blocked.html') + '?from=' + encodeURIComponent(new URL(url).hostname.replace(/^www\./, ''));

/** Abas já abertas num site da lista viram a tela do pet — o bloqueio não é só pra quem abre agora. */
async function redirectOpenTabs(state) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !isBlocked(tab.url, state)) continue;
    chrome.tabs.update(tab.id, { url: blockedUrl(tab.url) }).catch(() => {});
  }
}

/** Onde o app mora, pra abrir no clique da notificação (o último que ele disse). */
async function rememberAppUrl(url) {
  if (typeof url === 'string' && url) await chrome.storage.local.set({ [APP_URL_KEY]: url });
}

/** Aplica o payload e devolve o ack. `null` = payload de outra versão, ignorado. */
async function apply(payload) {
  if (!isSupported(payload)) return null;
  if (!payload.active) {
    // "não sei": mantém o que está aplicado (recarregar o app não libera nada).
    if (payload.reason === 'unknown') return ackFor(await readState());
    await clear();
    return ackFor(null);
  }
  if (typeof payload.until !== 'number' || payload.until <= Date.now()) {
    await clear();
    return ackFor(null);
  }
  await rememberAppUrl(payload.appUrl);
  await chrome.storage.local.set({ [KEY]: payload });
  await replaceRules(buildRules(payload));
  await chrome.alarms.create(ALARM, { when: payload.until });
  await setBadge(true);
  await redirectOpenTabs(payload);
  return ackFor(payload);
}

// ---------------------------------------------------------------- o alarme do fim do bloco

async function readTimer() {
  const { [TIMER_KEY]: timer } = await chrome.storage.local.get(TIMER_KEY);
  return timer && timer.running === true && typeof timer.endsAt === 'number' ? timer : null;
}

async function clearTimer() {
  await chrome.storage.local.remove(TIMER_KEY);
  await chrome.alarms.clear(TIMER_ALARM);
}

/** O Study Pets está em frente — a janela do navegador focada E a aba ativa é a dele? Aí ele mesmo avisa. */
async function appInFront(appUrl) {
  try {
    const win = await chrome.windows.getLastFocused();
    if (!win || !win.focused) return false; // o navegador nem está na frente (a pessoa está no PDF, no editor…)
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return !!tab && isAppUrl(tab.url, appUrl);
  } catch {
    return false; // na dúvida, avisa
  }
}

/** Dá pra tocar o nosso som (volume, mudo, e a API da página offscreen)? */
const canPlay = (audio) => !!audio && !audio.muted && audio.volume > 0 && !!chrome.offscreen;

/** O som do fim do bloco, pela página offscreen: um service worker não tem áudio. */
async function playSound(timer) {
  const audio = timer.audio || {};
  if (!canPlay(audio)) return;
  try {
    const has = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
    if (!has) {
      await chrome.offscreen.createDocument({
        url: 'alarm.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Tocar o som do fim do bloco com a aba do Study Pets em segundo plano',
      });
    }
  } catch {
    // já existe (dois avisos quase juntos) ou a API recusou: tenta tocar mesmo assim
  }
  try {
    await chrome.runtime.sendMessage({ type: 'play', sound: timer.sound, volume: audio.volume });
  } catch {
    // sem página offscreen ninguém responde; a notificação já saiu
  }
}

/** Os fins já avisados nesta vida do service worker: o alarme e a mensagem seguinte do app podem chegar juntos. */
const alerted = new Set();

/** Avisa o fim do bloco — uma vez —, a menos que o app esteja em frente e avise ele mesmo. */
async function alert(timer) {
  if (alerted.has(timer.endsAt)) return;
  alerted.add(timer.endsAt);
  await chrome.storage.local.remove(TIMER_KEY);
  if (await appInFront(timer.appUrl)) return;
  const audio = timer.audio || {};
  try {
    await chrome.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'icon-192.png',
      title: timer.title || 'Study Pets',
      message: timer.body || '',
      priority: 2,
      // O som é o nosso (o do app, no volume dele). O do sistema só entra se o nosso não puder tocar — e nunca com o app no mudo.
      silent: !!audio.muted || !(audio.volume > 0) || canPlay(audio),
    });
  } catch {
    // sem a permissão de notificação (ou API indisponível): o som ainda sai
  }
  await playSound(timer);
}

/**
 * O timer que o app publicou. Antes de trocar, o fim anterior que já venceu e ainda não
 * foi avisado é avisado AGORA: o app em frente termina o bloco um segundo depois do fim e
 * já manda o seguinte, e o `create` abaixo substituiria o alarme velho antes de ele disparar.
 */
async function applyTimer(payload) {
  if (!isTimerSupported(payload)) return null;
  const now = Date.now();
  const before = await readTimer();
  if (isTimerDue(before, now)) await alert(before);
  if (!payload.running || !isTimerLive(payload, now)) {
    await clearTimer();
    return timerAckFor(null);
  }
  await rememberAppUrl(payload.appUrl);
  await chrome.storage.local.set({ [TIMER_KEY]: payload });
  await chrome.alarms.create(TIMER_ALARM, { when: payload.endsAt });
  return timerAckFor(payload);
}

async function fireTimer(alarm) {
  const timer = await readTimer();
  if (!timer) return; // já avisado pela mensagem seguinte do app, ou desarmado
  // Disparo atrasado de um alarme que já foi substituído: não é deste fim.
  if (typeof alarm.scheduledTime === 'number' && Math.abs(alarm.scheduledTime - timer.endsAt) > 1000) return;
  await alert(timer);
}

/** O clique na notificação traz o app: a aba dele, se há uma, senão uma nova. */
async function openApp() {
  try {
    await chrome.notifications.clear(NOTIFICATION_ID);
  } catch {
    // já sumiu
  }
  const { [APP_URL_KEY]: stored } = await chrome.storage.local.get(APP_URL_KEY);
  const appUrl = typeof stored === 'string' && stored ? stored : DEFAULT_APP_URL;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: [appUrl.replace(/\/$/, '') + '/*'] });
  } catch {
    tabs = [];
  }
  const tab = tabs.find((t) => t.id != null);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return;
  }
  await chrome.tabs.create({ url: appUrl });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || (msg.type !== 'blocking' && msg.type !== 'timer')) return false;
  const job = msg.type === 'blocking' ? apply(msg.payload) : applyTimer(msg.payload);
  job
    .then((ack) => sendResponse(ack))
    .catch((e) => {
      console.warn('[study-pets] falhou ao aplicar', msg.type, e);
      sendResponse(null);
    });
  return true; // resposta assíncrona
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void clear();
  if (alarm.name === TIMER_ALARM) void fireTimer(alarm);
});

if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((id) => {
    if (id === NOTIFICATION_ID) void openApp();
  });
}

/**
 * A aba navegou pra um site da lista depois que o bloqueio armou. As regras do
 * declarativeNetRequest já pegam a navegação normal; isto cobre o que escapa
 * dela (voltar pelo histórico/bfcache, prerender, aba que estava carregando).
 */
async function guardTab(tabId, url) {
  const state = await readState();
  if (!state || !isBlocked(url, state)) return;
  chrome.tabs.update(tabId, { url: blockedUrl(url) }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || (info.status === 'loading' && tab ? tab.url : null);
  if (!url) return;
  void guardTab(tabId, url);
});

/** Ao acordar (instalação, navegador aberto): o que ficou guardado ainda vale? */
async function reconcile() {
  const state = await readState();
  if (!state) {
    await clear();
  } else {
    await replaceRules(buildRules(state));
    await chrome.alarms.create(ALARM, { when: state.until });
    await setBadge(true);
  }
  // O timer: rearma o que ainda vem; o que venceu enquanto o navegador estava fechado é
  // avisado se foi há pouco (o mesmo teto de atraso do app), e esquecido se foi há horas.
  const timer = await readTimer();
  const now = Date.now();
  if (!timer) return;
  if (isTimerLive(timer, now)) await chrome.alarms.create(TIMER_ALARM, { when: timer.endsAt });
  else if (now - timer.endsAt <= LATE_MAX_MS) await alert(timer);
  else await clearTimer();
}

chrome.runtime.onInstalled.addListener(() => void reconcile());
chrome.runtime.onStartup.addListener(() => void reconcile());
