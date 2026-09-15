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

interface FakeTab { id: number; url: string; active?: boolean; windowId?: number }

function makeChrome() {
  const store: Record<string, unknown> = {};
  let rules: DnrRule[] = [];
  let badge = '';
  const alarms: Record<string, { when: number }> = {};
  const tabs: FakeTab[] = [];
  const updates: { id: number; url?: string; active?: boolean }[] = [];
  const outbox: unknown[] = []; // o que o service worker manda pras páginas da extensão (a offscreen do som)
  const notes: { id: string; opts: Record<string, unknown> }[] = [];
  const created: { url: string }[] = [];
  const winUpdates: { id: number; focused?: boolean }[] = [];
  const focusedWin = { id: 1, focused: false };
  let offscreen = false;
  const listeners = { message: [] as Listener[], alarm: [] as Listener[], installed: [] as Listener[], startup: [] as Listener[], tabUpdated: [] as Listener[], notifClick: [] as Listener[] };
  const chrome = {
    runtime: {
      onMessage: { addListener: (l: Listener) => listeners.message.push(l) },
      onInstalled: { addListener: (l: Listener) => listeners.installed.push(l) },
      onStartup: { addListener: (l: Listener) => listeners.startup.push(l) },
      getURL: (p: string) => `chrome-extension://abc/${p}`,
      sendMessage: async (m: unknown) => { outbox.push(m); },
    },
    notifications: {
      create: async (id: string, opts: Record<string, unknown>) => { notes.push({ id, opts }); return id; },
      clear: async () => {},
      onClicked: { addListener: (l: Listener) => listeners.notifClick.push(l) },
    },
    offscreen: {
      hasDocument: async () => offscreen,
      createDocument: async () => { offscreen = true; },
    },
    windows: {
      getLastFocused: async () => ({ ...focusedWin }),
      update: async (id: number, info: { focused?: boolean }) => { winUpdates.push({ id, ...info }); },
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
      query: async (q?: { active?: boolean }) => (q && q.active ? tabs.filter((t) => t.active) : tabs),
      update: async (id: number, info: { url?: string; active?: boolean }) => { updates.push({ id, ...info }); },
      create: async (o: { url: string }) => { created.push(o); },
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
    outbox.length = 0;
    notes.length = 0;
    created.length = 0;
    winUpdates.length = 0;
    focusedWin.focused = false;
    offscreen = false;
  };
  return { chrome, store, rules: () => rules, badge: () => badge, alarms, tabs, updates, outbox, notes, created, winUpdates, focusedWin, offscreen: () => offscreen, listeners, reset };
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
    expect(fake.listeners.notifClick).toHaveLength(1);
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

describe('o alarme do fim do bloco', () => {
  const TIMER_ALARM = 'study-pets-timer-end';
  const NOTE = 'study-pets-timer';
  // Fins diferentes por teste: o worker lembra, nesta vida dele, os fins que já avisou.
  let seq = 0;
  const timer = (over: Partial<Record<string, unknown>> = {}) => ({
    v: 1,
    running: true,
    endsAt: Date.now() + (15 + seq++) * 60_000,
    title: '📖 Estudo concluído! Hora da pausa.',
    body: 'Estudo 3',
    sound: 'sucesso',
    audio: { volume: 0.7, muted: false },
    appUrl: 'http://localhost:5174',
    ...over,
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const fire = async (endsAt: number) => {
    await fake.listeners.alarm[0]!({ name: TIMER_ALARM, scheduledTime: endsAt });
    await tick();
  };
  // Um fim que já venceu. A base é fixa (não `Date.now()` na hora): o worker lembra os fins já
  // avisados por valor, e "agora menos um contador" colidia entre dois testes sempre que o relógio
  // andava exatamente o que o contador andou — um flake de 1 em 3.
  const BASE = Date.now();
  const vencido = () => BASE - 1000 - seq++ * 10;

  it('arma o alarme pro fim, guarda o aviso pronto e confirma no ack', async () => {
    const t = timer();
    const ack = await send({ type: 'timer', payload: t });
    expect(fake.store.timer).toEqual(t);
    expect(fake.alarms[TIMER_ALARM]).toEqual({ when: t.endsAt });
    expect(ack).toEqual({ armed: true, endsAt: t.endsAt });
    expect(fake.store.appUrl).toBe('http://localhost:5174');
  });

  it('`running: false` (pausou, parou) desarma', async () => {
    await send({ type: 'timer', payload: timer() });
    const ack = await send({ type: 'timer', payload: { v: 1, running: false } });
    expect(fake.store.timer).toBeUndefined();
    expect(fake.alarms[TIMER_ALARM]).toBeUndefined();
    expect(ack).toEqual({ armed: false, endsAt: 0 });
  });

  it('fim já passado não arma nada; versão desconhecida é ignorada sem ack', async () => {
    expect(await send({ type: 'timer', payload: timer({ endsAt: Date.now() - 1000 }) })).toEqual({ armed: false, endsAt: 0 });
    expect(fake.alarms[TIMER_ALARM]).toBeUndefined();
    expect(await send({ type: 'timer', payload: { ...timer(), v: 9 } })).toBeNull();
  });

  it('o alarme avisa: notificação do sistema + o som pela página offscreen, no volume do app — e o guardado some', async () => {
    const t = timer();
    await send({ type: 'timer', payload: t });
    await fire(t.endsAt);
    expect(fake.notes).toEqual([{ id: NOTE, opts: expect.objectContaining({ type: 'basic', title: t.title, message: 'Estudo 3', silent: true }) }]);
    expect(fake.offscreen()).toBe(true);
    expect(fake.outbox).toEqual([{ type: 'play', sound: 'sucesso', volume: 0.7 }]);
    expect(fake.store.timer).toBeUndefined();
  });

  it('com o Study Pets em frente (janela focada E a aba ativa é a dele), a extensão se cala: o app avisa', async () => {
    const t = timer();
    await send({ type: 'timer', payload: t });
    fake.focusedWin.focused = true;
    fake.tabs.push({ id: 2, url: 'http://localhost:5174/', active: true, windowId: 1 }, { id: 3, url: 'https://wikipedia.org/', active: false, windowId: 1 });
    await fire(t.endsAt);
    expect(fake.notes).toEqual([]);
    expect(fake.outbox).toEqual([]);
    expect(fake.store.timer).toBeUndefined(); // avisado (por ele), não pendente
  });

  it('navegador focado mas em OUTRA aba: avisa. Navegador sem foco (a pessoa está no PDF): avisa', async () => {
    const a = timer();
    await send({ type: 'timer', payload: a });
    fake.focusedWin.focused = true;
    fake.tabs.push({ id: 2, url: 'http://localhost:5174/', active: false, windowId: 1 }, { id: 3, url: 'https://wikipedia.org/', active: true, windowId: 1 });
    await fire(a.endsAt);
    expect(fake.notes).toHaveLength(1);
    const b = timer();
    await send({ type: 'timer', payload: b });
    fake.focusedWin.focused = false;
    fake.tabs.length = 0;
    fake.tabs.push({ id: 2, url: 'http://localhost:5174/', active: true, windowId: 1 });
    await fire(b.endsAt);
    expect(fake.notes).toHaveLength(2);
  });

  it('no mudo: a notificação sai silenciosa e nenhum som é pedido', async () => {
    const t = timer({ audio: { volume: 0.7, muted: true } });
    await send({ type: 'timer', payload: t });
    await fire(t.endsAt);
    expect(fake.notes[0]!.opts.silent).toBe(true);
    expect(fake.outbox).toEqual([]);
    expect(fake.offscreen()).toBe(false);
  });

  it('o fim que venceu e ainda não foi avisado é avisado na mensagem seguinte, ANTES de trocar o alarme', async () => {
    const velho = timer({ endsAt: vencido() });
    await fake.chrome.storage.local.set({ timer: velho }); // como se tivesse sido armado antes e o alarme ainda não disparou
    const novo = timer();
    await send({ type: 'timer', payload: novo });
    expect(fake.notes).toEqual([{ id: NOTE, opts: expect.objectContaining({ title: velho.title }) }]);
    expect(fake.store.timer).toEqual(novo);
    expect(fake.alarms[TIMER_ALARM]).toEqual({ when: novo.endsAt });
    // O disparo atrasado do alarme velho não é deste fim: ignorado.
    await fire(velho.endsAt);
    expect(fake.notes).toHaveLength(1);
  });

  it('o mesmo fim nunca é avisado duas vezes: alarme e `running: false` chegando juntos', async () => {
    const t = timer({ endsAt: vencido() });
    await fake.chrome.storage.local.set({ timer: t });
    await fire(t.endsAt);
    expect(fake.notes).toHaveLength(1);
    await send({ type: 'timer', payload: { v: 1, running: false } });
    expect(fake.notes).toHaveLength(1);
  });

  it('o clique na notificação traz a aba do app (ativa, janela focada); sem aba, abre uma', async () => {
    await send({ type: 'timer', payload: timer() });
    fake.tabs.push({ id: 5, url: 'http://localhost:5174/', windowId: 3 });
    await fake.listeners.notifClick[0]!(NOTE);
    await tick();
    expect(fake.updates).toEqual([{ id: 5, active: true }]);
    expect(fake.winUpdates).toEqual([{ id: 3, focused: true }]);
    fake.tabs.length = 0;
    await fake.listeners.notifClick[0]!(NOTE);
    await tick();
    expect(fake.created).toEqual([{ url: 'http://localhost:5174' }]);
    await fake.listeners.notifClick[0]!('outra');
    await tick();
    expect(fake.created).toHaveLength(1);
  });

  it('ao acordar: rearma o que ainda vem, avisa o que venceu há pouco, esquece o que venceu há horas', async () => {
    const vivo = timer();
    await fake.chrome.storage.local.set({ timer: vivo });
    await fake.listeners.startup[0]!();
    await tick();
    expect(fake.alarms[TIMER_ALARM]).toEqual({ when: vivo.endsAt });
    expect(fake.notes).toEqual([]);

    await fake.chrome.storage.local.set({ timer: timer({ endsAt: Date.now() - 5 * 60_000 - seq++ }) });
    await fake.listeners.startup[0]!();
    await tick();
    expect(fake.notes).toHaveLength(1);

    await fake.chrome.storage.local.set({ timer: timer({ endsAt: Date.now() - 2 * 3_600_000 - seq++ }) });
    await fake.listeners.startup[0]!();
    await tick();
    expect(fake.notes).toHaveLength(1);
    expect(fake.store.timer).toBeUndefined();
  });
});
