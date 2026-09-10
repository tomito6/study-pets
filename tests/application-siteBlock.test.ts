// O bloqueio de sites, o caso de uso: o que a extensão recebe em cada transição
// do timer. `window` é falso (o app publica um CustomEvent), então dá pra ler o
// payload exato sem navegador nenhum.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O `document` falso abaixo só tem o <html> que a extensão marca; o toast (que retomar a pausa mostra) fica mudo.
vi.mock('../src/shared/toast', () => ({ showToast: () => {} }));

const win = new EventTarget();
const publicados: unknown[] = [];
const doc = { documentElement: { dataset: {} as Record<string, string> } };

Object.assign(globalThis, { window: win, document: doc, location: { origin: 'http://localhost:5174' } });

const { EXT_ACK_EVENT, EXT_QUERY_EVENT, EXT_STATE_EVENT } = await import('../src/infrastructure/extensionBridge');
const { blockingNow, resetBlockingForTests, startSiteBlockTest, stopSiteBlockTest, watchExtension } = await import('../src/application/siteBlock');
const { startHardcore } = await import('../src/application/hardcore');
const { rebuildWeeks } = await import('../src/application/plan');
const { reconcileTimer, startTimer, stopTimer } = await import('../src/application/timer');
const { emptyPersistedState } = await import('../src/domain/persistence');
const { derived, state } = await import('../src/store/store');
type StudyBlock = import('../src/domain/types').StudyBlock;

win.addEventListener(EXT_STATE_EVENT, (e) => publicados.push(JSON.parse((e as CustomEvent).detail)));

const HOJE = '2026-09-02';
const AGORA = new Date(`${HOJE}T10:10:00`);
const estudo: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };
const pausa: StudyBlock = { time: '10:25', endTime: '10:30', name: '🧘 Pausa', type: 'pausa', xp: 5, cycle: 0 };

const ultimo = () => publicados[publicados.length - 1] as Record<string, unknown>;

function relogioEm(hms: string): void {
  vi.setSystemTime(new Date(`${HOJE}T${hms}`));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  publicados.length = 0;
  doc.documentElement.dataset.studyPetsExt = '0.2.0';
  Object.assign(state, emptyPersistedState(), { uiWeek: 1, uiDay: 2 });
  state.config.siteBlock = { enabled: true, mode: 'blacklist', sites: ['chess.com', 'youtube.com'] };
  derived.timerBlock = null;
  derived.focusOpen = false;
  derived.hardcore = null;
  resetBlockingForTests();
  rebuildWeeks(AGORA);
});

afterEach(() => {
  derived.hardcore = null;
  stopTimer();
  resetBlockingForTests();
  vi.useRealTimers();
});

describe('quando o bloqueio vale', () => {
  it('estudo rodando: publica ativo, com a lista expandida pelos apelidos', () => {
    startTimer(estudo, AGORA);
    const p = ultimo();
    expect(p).toMatchObject({ v: 2, active: true, mode: 'blacklist', hardcore: false, test: false });
    expect(p.sites).toEqual(['chess.com', 'youtube.com', 'youtu.be']);
    expect(p.block).toEqual({ name: 'Estudo 3', endTime: '10:25' });
    expect(p.until).toBe(new Date(`${HOJE}T10:25:00`).getTime());
    expect(p.appUrl).toBe('http://localhost:5174');
  });

  it('bloco aberto antes da hora: nada é publicado até ele começar de verdade', () => {
    const futuro = { ...estudo, time: '10:30', endTime: '10:55', name: '📖 Estudo 4' };
    startTimer(futuro, AGORA);
    expect(publicados).toHaveLength(0); // em espera não bloqueia
    relogioEm('10:30:01');
    expect(ultimo()).toMatchObject({ active: true, block: { name: 'Estudo 4', endTime: '10:55' } });
  });

  it('estudo pausado continua bloqueando, com o fim deslizando minuto a minuto; retomar publica o fim novo', async () => {
    const { pauseTimer, resumeTimer } = await import('../src/application/pause');
    startTimer(estudo, AGORA);
    expect(ultimo()).toMatchObject({ active: true, until: new Date(`${HOJE}T10:25:00`).getTime() });
    expect(pauseTimer(AGORA)).toEqual({ ok: true });
    // O fim projetado arredonda pra cima ao minuto: nunca cai no passado (a extensão limparia as regras), e muda uma vez por minuto.
    relogioEm('10:10:30');
    expect(ultimo()).toMatchObject({ active: true, until: new Date(`${HOJE}T10:26:00`).getTime(), block: { name: 'Estudo 3', endTime: '10:26' } });
    const antes = publicados.length;
    relogioEm('10:10:50');
    expect(publicados.length).toBe(antes); // dentro do mesmo minuto nada muda
    relogioEm('10:11:01');
    expect(ultimo()).toMatchObject({ active: true, until: new Date(`${HOJE}T10:27:00`).getTime(), block: { endTime: '10:27' } });
    // Retomou às 10:13: a pausa vira 3 min, o bloco vai até 10:28, e é isso que a extensão recebe.
    vi.setSystemTime(new Date(`${HOJE}T10:13:00`));
    expect(resumeTimer(new Date(`${HOJE}T10:13:00`))).toBe('resumed');
    expect(ultimo()).toMatchObject({ active: true, until: new Date(`${HOJE}T10:28:00`).getTime(), block: { endTime: '10:28' } });
    relogioEm('10:27:58'); // 10:27:59 — ainda falta 1s
    expect(ultimo()).toMatchObject({ active: true });
    relogioEm('10:27:59'); // 10:28:00
    expect(ultimo()).toEqual({ v: 2, active: false, reason: 'stopped' }); // acabou → emendou na pausa
  });

  it('pausa não bloqueia: a emenda estudo → pausa manda parar', () => {
    startTimer(estudo, AGORA);
    expect(ultimo()).toMatchObject({ active: true });
    startTimer(pausa, new Date(`${HOJE}T10:25:00`));
    expect(ultimo()).toEqual({ v: 2, active: false, reason: 'stopped' });
  });

  it('"✕ Parar" libera na hora', () => {
    startTimer(estudo, AGORA);
    stopTimer();
    expect(ultimo()).toEqual({ v: 2, active: false, reason: 'stopped' });
  });

  it('desligado não publica nada', () => {
    state.config.siteBlock = { enabled: false, mode: 'blacklist', sites: ['chess.com'] };
    startTimer(estudo, AGORA);
    expect(publicados).toHaveLength(0);
  });

  it('lista negra vazia não publica nada', () => {
    state.config.siteBlock = { enabled: true, mode: 'blacklist', sites: [] };
    startTimer(estudo, AGORA);
    expect(publicados).toHaveLength(0);
  });

  it('lista branca com lista vazia ainda vale: bloqueia tudo menos o app', () => {
    state.config.siteBlock = { enabled: true, mode: 'whitelist', sites: [] };
    startTimer(estudo, AGORA);
    expect(ultimo()).toMatchObject({ active: true, mode: 'whitelist', sites: [] });
  });

  it('não republica o mesmo estado a cada segundo', () => {
    startTimer(estudo, AGORA);
    expect(publicados).toHaveLength(1);
    relogioEm('10:11:00');
    relogioEm('10:12:00');
    expect(publicados).toHaveLength(1);
  });

  it('no hardcore o payload diz que é hardcore (a tela do pet muda a frase de saída)', () => {
    state.config.hardcore = { enabled: true };
    startHardcore(estudo, AGORA);
    expect(ultimo()).toMatchObject({ active: true, hardcore: true });
  });
});

describe('recarregar não é escapar', () => {
  it('a pergunta da extensão sem estudo rodando responde `unknown`, nunca `stopped`', () => {
    watchExtension();
    win.dispatchEvent(new CustomEvent(EXT_QUERY_EVENT));
    expect(ultimo()).toEqual({ v: 2, active: false, reason: 'unknown' });
  });

  it('a pergunta com estudo rodando responde o estado ativo', () => {
    watchExtension();
    startTimer(estudo, AGORA);
    publicados.length = 0;
    win.dispatchEvent(new CustomEvent(EXT_QUERY_EVENT));
    expect(ultimo()).toMatchObject({ active: true, block: { name: 'Estudo 3' } });
  });

  it('uma carga da página que nunca armou nada não manda parar (o tick do relógio não libera o site)', () => {
    reconcileTimer(AGORA);
    expect(publicados).toHaveLength(0);
  });
});

describe('▶ Testar por 1 min', () => {
  it('publica a lista do rascunho por 60 s, marcada como teste, e para sozinho', () => {
    const r = startSiteBlockTest('blacklist', ['chess.com'], AGORA);
    expect(r).toEqual({ ok: true });
    const p = ultimo();
    expect(p).toMatchObject({ active: true, test: true, block: null, hardcore: false });
    expect(p.until).toBe(AGORA.getTime() + 60_000);
    vi.advanceTimersByTime(60_000);
    expect(ultimo()).toEqual({ v: 2, active: false, reason: 'stopped' });
  });

  it('"■ Parar teste" para antes da hora', () => {
    startSiteBlockTest('blacklist', ['chess.com'], AGORA);
    stopSiteBlockTest(AGORA);
    expect(ultimo()).toEqual({ v: 2, active: false, reason: 'stopped' });
  });

  it('recusa sem extensão, e recusa lista negra vazia', () => {
    delete doc.documentElement.dataset.studyPetsExt;
    expect(startSiteBlockTest('blacklist', ['chess.com'], AGORA)).toEqual({ ok: false, reason: 'no-extension' });
    doc.documentElement.dataset.studyPetsExt = '0.2.0';
    expect(startSiteBlockTest('blacklist', [], AGORA)).toEqual({ ok: false, reason: 'no-sites' });
    expect(publicados).toHaveLength(0);
  });

  it('um estudo de verdade vence o teste', () => {
    startSiteBlockTest('blacklist', ['chess.com'], AGORA);
    startTimer(estudo, AGORA);
    expect(ultimo()).toMatchObject({ active: true, test: false, block: { name: 'Estudo 3' } });
  });
});

describe('o ack da extensão', () => {
  it('vira o "bloqueando agora" que as Configurações mostram', () => {
    watchExtension();
    const until = AGORA.getTime() + 900_000;
    win.dispatchEvent(new CustomEvent(EXT_ACK_EVENT, { detail: JSON.stringify({ applied: true, until, sites: 3, mode: 'blacklist', test: false }) }));
    expect(blockingNow(AGORA)).toEqual({ sites: 3, until, test: false });
    // Vencido não conta mais.
    expect(blockingNow(new Date(until + 1))).toBeNull();
  });

  it('ack que não aplicou nada não vira "bloqueando"', () => {
    watchExtension();
    win.dispatchEvent(new CustomEvent(EXT_ACK_EVENT, { detail: JSON.stringify({ applied: false, until: 0, sites: 0, mode: null, test: false }) }));
    expect(blockingNow(AGORA)).toBeNull();
  });
});
