// O service worker da extensão (extension/background.js) com um `chrome.*` falso:
// a mensagem do content script vira estado guardado + regras + alarme + badge +
// redirect das abas já abertas, e responde com o ack; o alarme e o `stopped`
// limpam tudo, e o `unknown` NÃO limpa (recarregar o app não é escapar). O que o
// Chrome faz com as regras em si (declarativeNetRequest) só um navegador de
// verdade mostra — isso é o `npm run test:ext`; aqui é a cola.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../extension/rules.js';
import type { BlockingExtPayload, DnrRule } from '../extension/rules.js';

type Listener = (...args: unknown[]) => unknown;

interface FakeTab { id: number; url: string }

function makeChrome() {
  const store: Record<string, unknown> = {};
  let rules: DnrRule[] = [];
  let badge = '';
  const alarms: Record<string, { when: number }> = {};
  const tabs: FakeTab[] = [];
  const updates: { id: number; url: string }[] = [];
  const listeners = { message: [] as Listener[], alarm: [] as Listener[], installed: [] as Listener[], startup: [] as Listener[], tabUpdated: [] as Listener[] };
  const chrome = {
    runtime: {
      onMessage: { addListener: (l: Listener) => listeners.message.push(l) },
      onInstalled: { addListener: (l: Listener) => listeners.installed.push(l) },
      onStartup: { addListener: (l: Listener) => listeners.startup.push(l) },
      getURL: (p: string) => `chrome-extension://abc/${p}`,
    },
    action: {
      setBadgeText: async ({ text }: { text: string }) => { badge = text; },
      setBadgeBackgroundColor: async () => {},
    },
    storage: {
      local: {
        get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
        set: async (o: Record<string, unknown>) => { Object.assign(store, o); },
        remove: async (k: string) => { delete store[k]; },
      },
    },
    declarativeNetRequest: {
      getDynamicRules: async () => rules,
      updateDynamicRules: async ({ removeRuleIds, addRules }: { removeRuleIds: number[]; addRules?: DnrRule[] }) => {
        rules = rules.filter((r) => !removeRuleIds.includes(r.id)).concat(addRules ?? []);
      },
    },
    alarms: {
      create: async (name: string, info: { when: number }) => { alarms[name] = info; },
      clear: async (name: string) => { delete alarms[name]; },
      onAlarm: { addListener: (l: Listener) => listeners.alarm.push(l) },
    },
    tabs: {
      query: async () => tabs,
      update: async (id: number, { url }: { url: string }) => { updates.push({ id, url }); },
      onUpdated: { addListener: (l: Listener) => listeners.tabUpdated.push(l) },
    },
  };
  const reset = () => {
    for (const k of Object.keys(store)) delete store[k];
    rules = [];
    badge = '';
    for (const k of Object.keys(alarms)) delete alarms[k];
    tabs.length = 0;
    updates.length = 0;
  };
  return { chrome, store, rules: () => rules, badge: () => badge, alarms, tabs, updates, listeners, reset };
}

const fake = makeChrome();
const ALARM = 'study-pets-block-expire';

const payload = (over: Partial<BlockingExtPayload> = {}): BlockingExtPayload => ({
  v: 2,
  active: true,
  until: Date.now() + 15 * 60_000,
  mode: 'blacklist',
  sites: ['youtube.com'],
  block: { name: 'Estudo 3', endTime: '10:25' },
  pet: null,
  appUrl: 'http://localhost:5174',
  hardcore: false,
  test: false,
  ...over,
});

/** Manda a mensagem como o content script manda e espera o `sendResponse` (o ack). */
function send(msg: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const handled = fake.listeners.message[0]!(msg, {}, resolve);
    if (handled !== true) resolve('sync');
  });
}

beforeAll(async () => {
  (globalThis as { chrome?: unknown }).chrome = fake.chrome;
  await import('../extension/background.js');
});

beforeEach(() => fake.reset());

describe('a mensagem do app', () => {
  it('registra os listeners ao carregar', () => {
    expect(fake.listeners.message).toHaveLength(1);
    expect(fake.listeners.alarm).toHaveLength(1);
    expect(fake.listeners.installed).toHaveLength(1);
    expect(fake.listeners.startup).toHaveLength(1);
    expect(fake.listeners.tabUpdated).toHaveLength(1);
  });

  it('estado ativo: guarda, aplica as regras, marca o alarme e a badge, e redireciona as abas da lista', async () => {
    const p = payload();
    fake.tabs.push({ id: 1, url: 'https://www.youtube.com/watch?v=1' }, { id: 2, url: 'http://localhost:5174/' }, { id: 3, url: 'https://wikipedia.org/' }, { id: 4, url: 'chrome://extensions' });
    const ack = await send({ type: 'blocking', payload: p });
    expect(fake.store.blocking).toEqual(p);
    expect(fake.rules()).toEqual(buildRules(p));
    expect(fake.alarms[ALARM]).toEqual({ when: p.until });
    expect(fake.badge()).toBe('ON');
    expect(fake.updates).toEqual([{ id: 1, url: 'chrome-extension://abc/blocked.html?from=youtube.com' }]);
    expect(ack).toEqual({ applied: true, until: p.until, sites: 1, mode: 'blacklist', test: false });
  });

  it('estado novo substitui as regras antigas em vez de acumular', async () => {
    await send({ type: 'blocking', payload: payload({ sites: ['youtube.com', 'instagram.com'] }) });
    expect(fake.rules()).toHaveLength(2);
    await send({ type: 'blocking', payload: payload({ sites: ['twitch.tv'] }) });
    expect(fake.rules()).toHaveLength(1);
    expect(fake.rules()[0]!.condition.requestDomains).toEqual(['twitch.tv']);
  });

  it('`stopped` (o app encerrou): limpa tudo e apaga a badge', async () => {
    await send({ type: 'blocking', payload: payload() });
    const ack = await send({ type: 'blocking', payload: { v: 2, active: false, reason: 'stopped' } });
    expect(fake.store.blocking).toBeUndefined();
    expect(fake.rules()).toEqual([]);
    expect(fake.alarms[ALARM]).toBeUndefined();
    expect(fake.badge()).toBe('');
    expect(ack).toEqual({ applied: false, until: 0, sites: 0, mode: null, test: false });
  });

  it('`unknown` (o app recarregou) NÃO limpa: o bloqueio segue até o alarme', async () => {
    const p = payload();
    await send({ type: 'blocking', payload: p });
    const ack = await send({ type: 'blocking', payload: { v: 2, active: false, reason: 'unknown' } });
    expect(fake.store.blocking).toEqual(p);
    expect(fake.rules()).toEqual(buildRules(p));
    expect(ack).toMatchObject({ applied: true, sites: 1 });
  });

  it('estado já vencido não aplica nada', async () => {
    await send({ type: 'blocking', payload: payload({ until: Date.now() - 1000 }) });
    expect(fake.rules()).toEqual([]);
    expect(fake.store.blocking).toBeUndefined();
  });

  it('payload da versão antiga é ignorado, sem ack', async () => {
    await send({ type: 'blocking', payload: { ...payload(), v: 1 } });
    expect(fake.rules()).toEqual([]);
    expect(await send({ type: 'blocking', payload: { ...payload(), v: 1 } })).toBeNull();
  });

  it('mensagem de outro tipo é ignorada, de forma síncrona', async () => {
    expect(await send({ type: 'outra' })).toBe('sync');
    expect(fake.rules()).toEqual([]);
  });
});

describe('a aba que navega depois de armar', () => {
  const fireUpdate = async (id: number, info: unknown, tab?: unknown) => {
    await fake.listeners.tabUpdated[0]!(id, info, tab);
    await new Promise((r) => setTimeout(r, 0));
  };

  it('cai na tela do pet (cobre voltar pelo histórico, prerender, aba carregando)', async () => {
    await send({ type: 'blocking', payload: payload() });
    fake.updates.length = 0;
    await fireUpdate(7, { url: 'https://m.youtube.com/feed' });
    expect(fake.updates).toEqual([{ id: 7, url: 'chrome-extension://abc/blocked.html?from=m.youtube.com' }]);
  });

  it('site fora da lista passa, e sem bloqueio ativo ninguém é redirecionado', async () => {
    await send({ type: 'blocking', payload: payload() });
    fake.updates.length = 0;
    await fireUpdate(8, { status: 'loading' }, { url: 'https://wikipedia.org/' });
    expect(fake.updates).toEqual([]);
    await send({ type: 'blocking', payload: { v: 2, active: false, reason: 'stopped' } });
    await fireUpdate(9, { url: 'https://youtube.com/' });
    expect(fake.updates).toEqual([]);
  });
});

describe('o alarme e o acordar', () => {
  it('o alarme do fim do bloco limpa as regras mesmo com o app fechado', async () => {
    await send({ type: 'blocking', payload: payload() });
    await fake.listeners.alarm[0]!({ name: ALARM });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toEqual([]);
    expect(fake.store.blocking).toBeUndefined();
    expect(fake.badge()).toBe('');
  });

  it('outro alarme não mexe em nada', async () => {
    await send({ type: 'blocking', payload: payload() });
    await fake.listeners.alarm[0]!({ name: 'qualquer' });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toHaveLength(1);
  });

  it('ao acordar com estado válido guardado, reaplica as regras, o alarme e a badge', async () => {
    const p = payload();
    fake.store.blocking = p;
    await fake.listeners.startup[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toEqual(buildRules(p));
    expect(fake.alarms[ALARM]).toEqual({ when: p.until });
    expect(fake.badge()).toBe('ON');
  });

  it('ao acordar com estado vencido, limpa', async () => {
    fake.store.blocking = payload({ until: Date.now() - 1 });
    await fake.listeners.installed[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toEqual([]);
    expect(fake.store.blocking).toBeUndefined();
  });
});
