// O content script da extensão (extension/content.js) com `window`/`document`
// falsos: se anuncia no <html>, repassa o estado que o app publica, e pergunta o
// estado ao carregar (mais de uma vez, porque o app pode ainda não ter carregado).

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EXT_ATTR, EXT_QUERY_EVENT, EXT_STATE_EVENT } from '../src/infrastructure/extensionBridge';

const sent: unknown[] = [];
const win = new EventTarget();
let asked = 0;
const doc = { documentElement: { dataset: {} as Record<string, string> } };

beforeAll(async () => {
  vi.useFakeTimers();
  win.addEventListener(EXT_QUERY_EVENT, () => asked++);
  Object.assign(globalThis, {
    window: win,
    document: doc,
    chrome: { runtime: { sendMessage: (m: unknown) => { sent.push(m); return Promise.resolve(); } } },
  });
  await import('../extension/content.js');
});

describe('content.js', () => {
  it('se anuncia no <html> — é o que Configurações lê', () => {
    expect(doc.documentElement.dataset[EXT_ATTR]).toBe('1');
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
    const payload = { v: 1, active: true, until: 1, mode: 'blacklist', sites: ['youtube.com'] };
    win.dispatchEvent(new CustomEvent(EXT_STATE_EVENT, { detail: JSON.stringify(payload) }));
    expect(sent).toEqual([{ type: 'hardcore', payload }]);
  });

  it('ignora detail que não é JSON', () => {
    win.dispatchEvent(new CustomEvent(EXT_STATE_EVENT, { detail: 'lixo' }));
    win.dispatchEvent(new CustomEvent(EXT_STATE_EVENT));
    expect(sent).toHaveLength(1);
  });
});
