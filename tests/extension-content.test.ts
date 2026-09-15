// O content script da extensão (extension/content.js) com `window`/`document`
// falsos: se anuncia no <html> com a versão, repassa o estado que o app publica,
// devolve o ack pra página, e pergunta o estado ao carregar (mais de uma vez,
// porque o app pode ainda não ter carregado).

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EXT_ACK_EVENT, EXT_ATTR, EXT_QUERY_EVENT, EXT_STATE_EVENT, EXT_TIMER_ACK_EVENT, EXT_TIMER_EVENT, parseBlockingAck } from '../src/infrastructure/extensionBridge';

const sent: unknown[] = [];
const acks: unknown[] = [];
const win = new EventTarget();
let asked = 0;
const doc = { documentElement: { dataset: {} as Record<string, string> } };
const ACK = { applied: true, until: 123, sites: 2, mode: 'blacklist', test: false };

beforeAll(async () => {
  vi.useFakeTimers();
  win.addEventListener(EXT_QUERY_EVENT, () => asked++);
  win.addEventListener(EXT_ACK_EVENT, (e) => acks.push((e as CustomEvent).detail));
  Object.assign(globalThis, {
    window: win,
    document: doc,
    chrome: {
      runtime: {
        getManifest: () => ({ version: '0.2.0' }),
        sendMessage: (m: unknown) => {
          sent.push(m);
          return Promise.resolve(ACK);
        },
      },
    },
  });
  await import('../extension/content.js');
});

describe('content.js', () => {
  it('se anuncia no <html> com a versão — é o que Configurações lê', () => {
    expect(doc.documentElement.dataset[EXT_ATTR]).toBe('0.2.0');
  });

  it('pergunta o estado ao carregar, e de novo depois (o app pode ainda não ter carregado)', () => {
    expect(asked).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(asked).toBe(2);
    vi.advanceTimersByTime(6000);
    expect(asked).toBe(3);
    vi.advanceTimersByTime(60_000);
    expect(asked).toBe(3);
  });

  it('repassa o estado publicado pelo app (JSON em string) pro service worker', () => {
    const payload = { v: 2, active: true, until: 1, mode: 'blacklist', sites: ['youtube.com'] };
    win.dispatchEvent(new CustomEvent(EXT_STATE_EVENT, { detail: JSON.stringify(payload) }));
    expect(sent).toEqual([{ type: 'blocking', payload }]);
  });

  it('devolve pra página o ack com o que a extensão aplicou', async () => {
    await vi.advanceTimersByTimeAsync(0); // a resposta do sendMessage é uma promise
    expect(acks).toHaveLength(1);
    expect(parseBlockingAck(acks[0])).toEqual(ACK);
  });

  it('ignora detail que não é JSON', () => {
    win.dispatchEvent(new CustomEvent(EXT_STATE_EVENT, { detail: 'lixo' }));
    win.dispatchEvent(new CustomEvent(EXT_STATE_EVENT));
    expect(sent).toHaveLength(1);
  });
});

describe('content.js — o timer', () => {
  it('repassa o timer publicado pelo app pro service worker e devolve o ack pra página', async () => {
    const acksTimer: unknown[] = [];
    win.addEventListener(EXT_TIMER_ACK_EVENT, (e) => acksTimer.push((e as CustomEvent).detail));
    const payload = { v: 1, running: true, endsAt: 5, title: 't', body: 'Estudo 3', sound: 'sucesso', audio: { volume: 0.7, muted: false }, appUrl: 'http://localhost:5174' };
    win.dispatchEvent(new CustomEvent(EXT_TIMER_EVENT, { detail: JSON.stringify(payload) }));
    expect(sent.at(-1)).toEqual({ type: 'timer', payload });
    await vi.advanceTimersByTimeAsync(0);
    expect(acksTimer).toHaveLength(1);
    expect(typeof acksTimer[0]).toBe('string'); // JSON: os dois mundos não trocam objetos
  });

  it('detail que não é JSON (ou não é objeto) não é repassado', () => {
    const antes = sent.length;
    win.dispatchEvent(new CustomEvent(EXT_TIMER_EVENT, { detail: 'nada' }));
    win.dispatchEvent(new CustomEvent(EXT_TIMER_EVENT, { detail: '7' }));
    expect(sent.length).toBe(antes);
  });
});
