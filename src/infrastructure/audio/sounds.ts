// Sons do app via Web Audio — sem arquivos externos. Porte fiel do original.
// Falha em silêncio onde não há áudio (headless, contexto bloqueado): som nunca
// pode derrubar o app.

/** `sucesso` = "deu certo": o bloco terminou dentro do modo foco. */
export type SoundType = 'check' | 'estudo' | 'pausa_curta' | 'pausa_longa' | 'sucesso';

export interface AudioSettings {
  volume: number;
  muted: boolean;
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio indisponível');
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function tone(ctx: AudioContext, type: OscillatorType, freq: number, shape: (g: GainNode, t: number) => void, at: number, stopAt: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  shape(g, at);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  osc.stop(stopAt);
}

export function playSound(type: SoundType, settings: AudioSettings): void {
  try {
    const ctx = getCtx();
    const vol = settings.volume;
    if (settings.muted || vol === 0) return;
    const t = ctx.currentTime;

    if (type === 'check') {
      [880, 1100].forEach((freq, i) => {
        const at = t + i * 0.1;
        tone(ctx, 'square', freq, (g) => {
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(vol * 0.3, at + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
        }, at, at + 0.13);
      });
    } else if (type === 'estudo') {
      [110, 220, 330].forEach((freq) => {
        tone(ctx, 'sawtooth', freq, (g) => {
          g.gain.setValueAtTime(vol * 0.5, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        }, t, t + 0.4);
      });
      setTimeout(() => {
        const t2 = ctx.currentTime;
        tone(ctx, 'sawtooth', 80, (g) => {
          g.gain.setValueAtTime(vol * 0.8, t2);
          g.gain.exponentialRampToValueAtTime(0.001, t2 + 0.5);
        }, t2, t2 + 0.5);
      }, 350);
    } else if (type === 'pausa_curta') {
      [523, 659].forEach((freq, i) => {
        const at = t + i * 0.25;
        tone(ctx, 'sine', freq, (g) => {
          g.gain.setValueAtTime(vol * 0.4, at);
          g.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
        }, at, at + 1.2);
      });
    } else if (type === 'pausa_longa') {
      [784, 784, 784].forEach((freq, i) => {
        const at = t + i * 0.28;
        tone(ctx, 'sine', freq, (g) => {
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(vol * 0.5, at + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
        }, at, at + 0.26);
      });
    } else if (type === 'sucesso') {
      // Arpejo maior subindo (C5 E5 G5 C6), a última nota segurada — o "deu certo".
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const at = t + i * 0.11;
        const dur = i === 3 ? 0.9 : 0.3;
        tone(ctx, 'triangle', freq, (g) => {
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(vol * 0.35, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        }, at, at + dur + 0.05);
      });
    }
  } catch {
    // sem áudio, sem drama
  }
}
