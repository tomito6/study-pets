// Os avisos do fim do bloco (src/application/alerts.ts): o som toca nos DOIS modos do
// dia, o volume é preferência do dispositivo e sobrevive ao boot, e os gestos que
// começam ou retomam um bloco preparam o contexto de áudio — que criado fora de um
// gesto nasce mudo. Sem DOM: a infra de som é trocada por um espião.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/infrastructure/audio/sounds', () => ({
  playSound: vi.fn(),
  primeAudio: vi.fn(),
}));

import { playSound as playSoundInfra, primeAudio as primeAudioInfra } from '../src/infrastructure/audio/sounds';
import {
  DEFAULT_AUDIO,
  initAudio,
  notificationStatus,
  previewSound,
  setMuted,
  setVolume,
  toggleMute,
} from '../src/application/alerts';
import { setDayMode } from '../src/application/dayWindows';
import { startLive } from '../src/application/live';
import { resumeTimer, pauseTimer } from '../src/application/pause';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { reopenFocus, closeFocus, startTimer, stopTimer } from '../src/application/timer';
import { stopHereNow } from '../src/features/timer/StopHereModal';
import { isChecked } from '../src/domain/checks';
import { emptyPersistedState } from '../src/domain/persistence';
import { clearAudioPrefs, readAudioPrefs, writeAudioPrefs } from '../src/infrastructure/audioPrefs';
import { derived, state } from '../src/store/store';

const HOJE = '2026-09-02';
const em = (hms: string) => new Date(`${HOJE}T${hms}`);
const AGORA = em('10:10:00');

const tocou = () => vi.mocked(playSoundInfra).mock.calls.map((c) => c[0]);

/** Põe o relógio falso em `hh:mm:ss` de hoje e deixa o watcher de 1s perceber. */
function relogioEm(hms: string): void {
  vi.setSystemTime(em(hms));
  vi.advanceTimersByTime(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 2 });
  derived.timerBlock = null;
  derived.timerPausedAt = null;
  derived.timerEndsAt = null;
  derived.focusOpen = false;
  derived.timerCompleted = null;
  derived.hardcore = null;
  derived.audio = { ...DEFAULT_AUDIO };
  clearAudioPrefs();
  clearBlockCache();
  rebuildWeeks(AGORA);
  vi.mocked(playSoundInfra).mockClear();
  vi.mocked(primeAudioInfra).mockClear();
});

afterEach(() => {
  stopTimer();
  vi.useRealTimers();
});

describe('o volume é preferência do dispositivo', () => {
  it('mudo alterna; volume 0 silencia e volume > 0 reativa — e cada mudança fica gravada', () => {
    toggleMute();
    expect(derived.audio.muted).toBe(true);
    expect(readAudioPrefs()).toEqual({ volume: 0.7, muted: true });
    toggleMute();
    expect(derived.audio.muted).toBe(false);
    setVolume(0);
    expect(derived.audio).toEqual({ volume: 0, muted: true });
    setVolume(0.4);
    expect(derived.audio).toEqual({ volume: 0.4, muted: false });
    expect(readAudioPrefs()).toEqual({ volume: 0.4, muted: false });
  });

  it('ligar de novo com o volume em zero sobe pro padrão — senão "ligado" seria silêncio', () => {
    setVolume(0);
    setMuted(false);
    expect(derived.audio).toEqual({ volume: DEFAULT_AUDIO.volume, muted: false });
  });

  it('o boot traz a preferência gravada; sem nada gravado (ou com lixo) vale o padrão', () => {
    writeAudioPrefs({ volume: 0.25, muted: false });
    expect(initAudio()).toEqual({ volume: 0.25, muted: false });
    expect(derived.audio).toEqual({ volume: 0.25, muted: false });
    clearAudioPrefs();
    expect(initAudio()).toEqual(DEFAULT_AUDIO);
  });

  it('o slider recebe o que vier, e o que fica é 0..1', () => {
    setVolume(1.7);
    expect(derived.audio.volume).toBe(1);
    setVolume(Number.NaN);
    expect(derived.audio.volume).toBe(DEFAULT_AUDIO.volume);
  });

  it('o som que toca usa o volume de agora', () => {
    setVolume(0.3);
    previewSound('sucesso');
    expect(playSoundInfra).toHaveBeenLastCalledWith('sucesso', { volume: 0.3, muted: false });
  });
});

describe('o contexto de áudio é preparado nos gestos', () => {
  it('iniciar, pausar/retomar e reabrir o foco preparam; mudar o volume e ouvir também', () => {
    const bloco = blocksForDay(HOJE).find((b) => b.time === '10:00')!;
    startTimer(bloco, AGORA);
    expect(primeAudioInfra).toHaveBeenCalledTimes(1);
    expect(pauseTimer(AGORA)).toEqual({ ok: true });
    closeFocus(em('10:11:00'));
    reopenFocus();
    expect(primeAudioInfra).toHaveBeenCalledTimes(2);
    expect(resumeTimer(em('10:12:00'))).toBe('resumed');
    expect(primeAudioInfra).toHaveBeenCalledTimes(3);
    setVolume(0.5);
    previewSound();
    expect(primeAudioInfra).toHaveBeenCalledTimes(5);
  });
});

describe('o fim do bloco soa igual nos dois modos do dia', () => {
  it('rotina: o fim do estudo no foco toca "deu certo" e emenda na pausa', () => {
    const bloco = blocksForDay(HOJE).find((b) => b.time === '10:00')!;
    startTimer(bloco, AGORA);
    expect(tocou()).toEqual([]);
    relogioEm('10:25:00');
    expect(tocou()).toEqual(['sucesso']);
    expect(isChecked(state.checks, HOJE, '10:00')).toBe(true);
    expect(derived.timerBlock?.type).toBe('pausa');
  });

  it('ao vivo: o mesmo "deu certo" no fim do pomodoro, e a emenda gera o bloco seguinte', () => {
    setDayMode(HOJE, 'live', AGORA);
    expect(blocksForDay(HOJE)).toEqual([]);
    const r = startLive(HOJE, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    startTimer(r.block, AGORA);
    expect(tocou()).toEqual([]);
    relogioEm('10:35:00'); // 10:10 + 25
    expect(tocou()).toEqual(['sucesso']);
    expect(isChecked(state.checks, HOJE, '10:10')).toBe(true);
    expect(derived.timerBlock?.type).toBe('pausa');
    // e a pausa também fecha com som, como na rotina
    relogioEm('10:40:00');
    expect(tocou()).toEqual(['sucesso', 'sucesso']);
    expect(derived.timerBlock?.type).toBe('estudo');
  });

  it('"Parar por aqui" credita o parcial com o som do check — é assim que uma corrida costuma acabar', () => {
    setDayMode(HOJE, 'live', AGORA);
    const r = startLive(HOJE, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    startTimer(r.block, AGORA);
    vi.setSystemTime(em('10:22:00'));
    stopHereNow();
    expect(tocou()).toEqual(['check']);
    expect(isChecked(state.checks, HOJE, '10:10')).toBe(true);
    expect(derived.timerBlock).toBeNull();
  });

  it('parar no primeiro minuto não credita nada — e não toca nada', () => {
    const bloco = blocksForDay(HOJE).find((b) => b.time === '10:00')!;
    vi.setSystemTime(em('10:00:20'));
    startTimer(bloco, em('10:00:20'));
    stopHereNow();
    expect(tocou()).toEqual([]);
  });
});

describe('a notificação do navegador', () => {
  it('sem a API o status é "unsupported"', () => {
    expect(notificationStatus()).toBe('unsupported');
  });
});
