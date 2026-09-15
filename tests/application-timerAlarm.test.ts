// O alarme do fim do bloco pela extensão (src/application/timerAlarm.ts): o que o app
// publica em cada transição do timer — uma projeção do store, não uma chamada por
// transição — e quando ele se cala no fim do bloco porque a extensão já avisou.
// `window` é falso (o app publica um CustomEvent); som e notificação são espiões.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/shared/toast', () => ({ showToast: () => {} }));
vi.mock('../src/infrastructure/audio/sounds', () => ({ playSound: vi.fn(), primeAudio: vi.fn() }));
vi.mock('../src/infrastructure/notifications/notifications', () => ({
  notify: vi.fn(async () => {}),
  requestNotificationPermission: vi.fn(),
  askNotificationPermission: vi.fn(async () => 'granted'),
  notificationPermission: vi.fn(() => 'granted'),
}));

const win = new EventTarget();
const publicados: unknown[] = [];
let emFoco = true;
const doc = { documentElement: { dataset: {} as Record<string, string> }, hasFocus: () => emFoco };

Object.assign(globalThis, { window: win, document: doc, location: { origin: 'http://localhost:5174' } });

const { playSound: playSoundInfra } = await import('../src/infrastructure/audio/sounds');
const { notify: notifyInfra } = await import('../src/infrastructure/notifications/notifications');
const { EXT_QUERY_EVENT, EXT_TIMER_ACK_EVENT, EXT_TIMER_EVENT } = await import('../src/infrastructure/extensionBridge');
const { resetTimerAlarmForTests, watchTimerAlarm } = await import('../src/application/timerAlarm');
const { setVolume } = await import('../src/application/alerts');
const { pauseTimer, resumeTimer } = await import('../src/application/pause');
const { clearBlockCache, rebuildWeeks } = await import('../src/application/plan');
const { startTimer, stopTimer } = await import('../src/application/timer');
const { isChecked } = await import('../src/domain/checks');
const { emptyPersistedState } = await import('../src/domain/persistence');
const { strings } = await import('../src/shared/strings');
const { derived, notify, state } = await import('../src/store/store');
type StudyBlock = import('../src/domain/types').StudyBlock;

win.addEventListener(EXT_TIMER_EVENT, (e) => publicados.push(JSON.parse((e as CustomEvent).detail)));

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
const AGORA = em('10:10:00');
// Plano padrão (09:00, pomo 25 / pausa 5): Estudo 3 é 10:00–10:25, a pausa 10:25–10:30.
const estudo: StudyBlock = { time: '10:00', endTime: '10:25', name: '📖 Estudo 3', type: 'estudo', xp: 50, cycle: 0 };

const ultimo = () => publicados[publicados.length - 1] as Record<string, unknown>;
const tocou = () => vi.mocked(playSoundInfra).mock.calls.map((c) => c[0]);
const notificou = () => vi.mocked(notifyInfra).mock.calls.length;

/** Põe o relógio falso em `hh:mm:ss` de hoje e deixa o watcher de 1s perceber. */
function relogioEm(hms: string): void {
  vi.setSystemTime(em(hms));
  vi.advanceTimersByTime(1000);
}

/** A extensão respondeu: "armei pra este fim". */
function ackDaExtensao(endsAt: number, armed = true): void {
  win.dispatchEvent(new CustomEvent(EXT_TIMER_ACK_EVENT, { detail: JSON.stringify({ armed, endsAt: armed ? endsAt : 0 }) }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  publicados.length = 0;
  emFoco = true;
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  derived.audio = { volume: 0.7, muted: false };
  clearBlockCache();
  rebuildWeeks(AGORA);
  resetTimerAlarmForTests();
  watchTimerAlarm();
  vi.mocked(playSoundInfra).mockClear();
  vi.mocked(notifyInfra).mockClear();
});

afterEach(() => {
  stopTimer();
  resetTimerAlarmForTests();
  vi.useRealTimers();
});

describe('o que a extensão recebe', () => {
  it('iniciar publica o fim, o texto pronto, o som do foco e o volume deste dispositivo', () => {
    startTimer(estudo, AGORA);
    expect(ultimo()).toEqual({
      v: 1,
      running: true,
      endsAt: em('10:25:00').getTime(),
      title: strings.timer.notification.study,
      body: 'Estudo 3',
      sound: 'sucesso',
      audio: { volume: 0.7, muted: false },
      appUrl: 'http://localhost:5174',
    });
  });

  it('é idempotente: o tique do relógio não republica o mesmo estado', () => {
    startTimer(estudo, AGORA);
    const n = publicados.length;
    relogioEm('10:10:05');
    notify();
    expect(publicados.length).toBe(n);
  });

  it('uma carga da página que nunca armou nada não desarma (recarregar não cala o alarme)', () => {
    notify();
    stopTimer();
    expect(publicados).toEqual([]);
  });

  it('pausar desarma; retomar rearma com o fim ajustado pela duração real da parada', () => {
    startTimer(estudo, AGORA);
    relogioEm('10:15:00');
    expect(pauseTimer()).toEqual({ ok: true });
    expect(ultimo()).toEqual({ v: 1, running: false });
    relogioEm('10:15:10');
    expect(resumeTimer()).toBe('resumed');
    expect(ultimo()).toMatchObject({ running: true, endsAt: em('10:25:10').getTime(), body: 'Estudo 3' });
  });

  it('parar desarma', () => {
    startTimer(estudo, AGORA);
    stopTimer();
    expect(ultimo()).toEqual({ v: 1, running: false });
  });

  it('mudar o volume republica: a extensão toca no volume que o app tocaria', () => {
    startTimer(estudo, AGORA);
    setVolume(0.3);
    expect(ultimo()).toMatchObject({ running: true, audio: { volume: 0.3, muted: false } });
  });

  it('a pergunta da extensão republica o timer rodando; sem timer, silêncio', () => {
    win.dispatchEvent(new CustomEvent(EXT_QUERY_EVENT));
    expect(publicados).toEqual([]);
    startTimer(estudo, AGORA);
    const n = publicados.length;
    win.dispatchEvent(new CustomEvent(EXT_QUERY_EVENT));
    expect(publicados.length).toBe(n + 1);
    expect(ultimo()).toMatchObject({ running: true, endsAt: em('10:25:00').getTime() });
  });

  it('a emenda publica o bloco seguinte com o texto da pausa', () => {
    startTimer(estudo, AGORA);
    relogioEm('10:25:01');
    expect(ultimo()).toMatchObject({ running: true, endsAt: em('10:30:00').getTime(), title: strings.timer.notification.break, body: 'Pausa' });
  });
});

describe('quem avisa é um só', () => {
  it('sem ack da extensão, o app toca e notifica como sempre', () => {
    startTimer(estudo, AGORA);
    relogioEm('10:25:01');
    expect(tocou()).toEqual(['sucesso']);
    expect(notificou()).toBe(1);
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
  });

  it('com o ack pra este fim e a aba SEM foco, o app se cala — a extensão avisou na hora; o check continua', () => {
    startTimer(estudo, AGORA);
    ackDaExtensao((ultimo() as { endsAt: number }).endsAt);
    emFoco = false;
    relogioEm('10:25:01');
    expect(tocou()).toEqual([]);
    expect(notificou()).toBe(0);
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    // E o bloco seguinte já foi publicado — o alarme continua com a extensão.
    expect(ultimo()).toMatchObject({ running: true, body: 'Pausa' });
  });

  it('com o ack e a aba EM foco, o app avisa ele mesmo (a extensão se cala do lado dela)', () => {
    startTimer(estudo, AGORA);
    ackDaExtensao((ultimo() as { endsAt: number }).endsAt);
    emFoco = true;
    relogioEm('10:25:01');
    expect(tocou()).toEqual(['sucesso']);
    expect(notificou()).toBe(1);
  });

  it('ack de OUTRO fim não vale: o app avisa', () => {
    startTimer(estudo, AGORA);
    ackDaExtensao(em('10:31:00').getTime());
    emFoco = false;
    relogioEm('10:25:01');
    expect(tocou()).toEqual(['sucesso']);
  });

  it('ack "não armei" não vale: o app avisa', () => {
    startTimer(estudo, AGORA);
    ackDaExtensao(0, false);
    emFoco = false;
    relogioEm('10:25:01');
    expect(tocou()).toEqual(['sucesso']);
  });

  it('o ack vale só pro que foi publicado por último: depois de pausar e retomar, o fim novo precisa de ack novo', () => {
    startTimer(estudo, AGORA);
    ackDaExtensao((ultimo() as { endsAt: number }).endsAt);
    relogioEm('10:15:00');
    pauseTimer();
    relogioEm('10:15:10');
    resumeTimer();
    emFoco = false;
    relogioEm('10:25:11');
    expect(tocou()).toEqual(['sucesso']); // sem ack do fim ajustado, o app não confia
  });
});
