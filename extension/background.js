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

import { ackFor, buildRules, isBlocked, isLive, isSupported } from './rules.js';

const ALARM = 'study-pets-block-expire';
const KEY = 'blocking';

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
  await chrome.storage.local.set({ [KEY]: payload });
  await replaceRules(buildRules(payload));
  await chrome.alarms.create(ALARM, { when: payload.until });
  await setBadge(true);
  await redirectOpenTabs(payload);
  return ackFor(payload);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'blocking') return false;
  apply(msg.payload)
    .then((ack) => sendResponse(ack))
    .catch((e) => {
      console.warn('[study-pets] falhou ao aplicar o bloqueio', e);
      sendResponse(null);
    });
  return true; // resposta assíncrona
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void clear();
});

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
    return;
  }
  await replaceRules(buildRules(state));
  await chrome.alarms.create(ALARM, { when: state.until });
  await setBadge(true);
}

chrome.runtime.onInstalled.addListener(() => void reconcile());
chrome.runtime.onStartup.addListener(() => void reconcile());
