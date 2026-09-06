// O service worker da extensão (extension/background.js) com um `chrome.*` falso:
// a mensagem do content script vira estado guardado + regras + alarme + redirect
// das abas já abertas; o alarme e o estado vencido limpam tudo. O que o Chrome
// faz com as regras em si (declarativeNetRequest) só um navegador de verdade
// mostra — aqui é a cola.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRules } from '../extension/rules.js';
import type { DnrRule, HardcoreExtPayload } from '../extension/rules.js';

type Listener = (...args: unknown[]) => unknown;

interface FakeTab { id: number; url: string }

function makeChrome() {
  const store: Record<string, unknown> = {};
  let rules: DnrRule[] = [];
  const alarms: Record<string, { when: number }> = {};
  const tabs: FakeTab[] = [];
  const updates: { id: number; url: string }[] = [];
  const listeners = { message: [] as Listener[], alarm: [] as Listener[], installed: [] as Listener[], startup: [] as Listener[] };
  const chrome = {
    runtime: {
      onMessage: { addListener: (l: Listener) => listeners.message.push(l) },
      onInstalled: { addListener: (l: Listener) => listeners.installed.push(l) },
      onStartup: { addListener: (l: Listener) => listeners.startup.push(l) },
      getURL: (p: string) => `chrome-extension://abc/${p}`,
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
    },
  };
  const reset = () => {
    for (const k of Object.keys(store)) delete store[k];
    rules = [];
    for (const k of Object.keys(alarms)) delete alarms[k];
    tabs.length = 0;
    updates.length = 0;
  };
  return { chrome, store, rules: () => rules, alarms, tabs, updates, listeners, reset };
}

const fake = makeChrome();
const ALARM = 'study-pets-hardcore-expire';

const payload = (over: Partial<HardcoreExtPayload> = {}): HardcoreExtPayload => ({
  v: 1,
  active: true,
  until: Date.now() + 15 * 60_000,
  mode: 'blacklist',
  sites: ['youtube.com'],
  block: { name: 'Estudo 3', endTime: '10:25' },
  pet: null,
  appUrl: 'http://localhost:5174',
  ...over,
});

/** Manda a mensagem como o content script manda e espera o `sendResponse`. */
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
  });

  it('estado ativo: guarda, aplica as regras, marca o alarme pro fim e redireciona as abas da lista', async () => {
    const p = payload();
    fake.tabs.push({ id: 1, url: 'https://www.youtube.com/watch?v=1' }, { id: 2, url: 'http://localhost:5174/' }, { id: 3, url: 'https://wikipedia.org/' }, { id: 4, url: 'chrome://extensions' });
    await send({ type: 'hardcore', payload: p });
    expect(fake.store.hardcore).toEqual(p);
    expect(fake.rules()).toEqual(buildRules(p));
    expect(fake.alarms[ALARM]).toEqual({ when: p.until });
    expect(fake.updates).toEqual([{ id: 1, url: 'chrome-extension://abc/blocked.html?from=youtube.com' }]);
  });

  it('estado novo substitui as regras antigas em vez de acumular', async () => {
    await send({ type: 'hardcore', payload: payload({ sites: ['youtube.com', 'instagram.com'] }) });
    expect(fake.rules()).toHaveLength(2);
    await send({ type: 'hardcore', payload: payload({ sites: ['twitch.tv'] }) });
    expect(fake.rules()).toHaveLength(1);
    expect(fake.rules()[0]!.condition.requestDomains).toEqual(['twitch.tv']);
  });

  it('estado inativo (pausa, desistiu, acabou): limpa tudo', async () => {
    await send({ type: 'hardcore', payload: payload() });
    await send({ type: 'hardcore', payload: { v: 1, active: false } });
    expect(fake.store.hardcore).toBeUndefined();
    expect(fake.rules()).toEqual([]);
    expect(fake.alarms[ALARM]).toBeUndefined();
  });

  it('estado já vencido não aplica nada', async () => {
    await send({ type: 'hardcore', payload: payload({ until: Date.now() - 1000 }) });
    expect(fake.rules()).toEqual([]);
    expect(fake.store.hardcore).toBeUndefined();
  });

  it('mensagem de outro tipo é ignorada, de forma síncrona', async () => {
    expect(await send({ type: 'outra' })).toBe('sync');
    expect(fake.rules()).toEqual([]);
  });
});

describe('o alarme e o acordar', () => {
  it('o alarme do fim do bloco limpa as regras mesmo com o app fechado', async () => {
    await send({ type: 'hardcore', payload: payload() });
    await fake.listeners.alarm[0]!({ name: ALARM });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toEqual([]);
    expect(fake.store.hardcore).toBeUndefined();
  });

  it('outro alarme não mexe em nada', async () => {
    await send({ type: 'hardcore', payload: payload() });
    await fake.listeners.alarm[0]!({ name: 'qualquer' });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toHaveLength(1);
  });

  it('ao acordar com estado válido guardado, reaplica as regras e o alarme', async () => {
    const p = payload();
    fake.store.hardcore = p;
    await fake.listeners.startup[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toEqual(buildRules(p));
    expect(fake.alarms[ALARM]).toEqual({ when: p.until });
  });

  it('ao acordar com estado vencido, limpa', async () => {
    fake.store.hardcore = payload({ until: Date.now() - 1 });
    await fake.listeners.installed[0]!();
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rules()).toEqual([]);
    expect(fake.store.hardcore).toBeUndefined();
  });
});
