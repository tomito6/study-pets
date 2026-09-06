// O service worker: recebe o estado do hardcore (via content.js), guarda, aplica
// as regras de bloqueio, marca um alarme pro fim do bloco (as regras somem
// sozinhas, mesmo com a aba do app fechada) e redireciona as abas já abertas
// que caem na lista. Sem estado ativo, não há regra nenhuma.

import { buildRules, isBlocked } from './rules.js';

const ALARM = 'study-pets-hardcore-expire';
const KEY = 'hardcore';

async function readState() {
  const { [KEY]: state } = await chrome.storage.local.get(KEY);
  return state && state.active && typeof state.until === 'number' ? state : null;
}

async function replaceRules(rules) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules: rules });
}

async function clear() {
  await chrome.storage.local.remove(KEY);
  await replaceRules([]);
  await chrome.alarms.clear(ALARM);
}

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
    const from = new URL(tab.url).hostname.replace(/^www\./, '');
    chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('blocked.html') + '?from=' + encodeURIComponent(from) }).catch(() => {});
  }
}

async function apply(payload) {
  if (!payload || payload.v !== 1) return;
  if (!payload.active || typeof payload.until !== 'number' || payload.until <= Date.now()) {
    await clear();
    return;
  }
  await chrome.storage.local.set({ [KEY]: payload });
  await replaceRules(buildRules(payload));
  await chrome.alarms.create(ALARM, { when: payload.until });
  await redirectOpenTabs(payload);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'hardcore') return false;
  apply(msg.payload)
    .catch((e) => console.warn('[study-pets] falhou ao aplicar o hardcore', e))
    .finally(() => sendResponse({ ok: true }));
  return true; // resposta assíncrona
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void clear();
});

/** Ao acordar (instalação, navegador aberto): o que ficou guardado ainda vale? */
async function reconcile() {
  const state = await readState();
  if (!state || state.until <= Date.now()) {
    await clear();
    return;
  }
  await replaceRules(buildRules(state));
  await chrome.alarms.create(ALARM, { when: state.until });
}

chrome.runtime.onInstalled.addListener(() => void reconcile());
chrome.runtime.onStartup.addListener(() => void reconcile());
