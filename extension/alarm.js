// A página offscreen que toca o som do fim do bloco. Um service worker não tem Web
// Audio; o `background.js` cria esta página (`chrome.offscreen`, motivo AUDIO_PLAYBACK)
// e manda `{ type: 'play', sound, volume }`. Porte dos quatro sons do fim do bloco de
// `src/infrastructure/audio/sounds.ts` — se mudar lá, mude aqui. Falha em silêncio.

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio indisponível');
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function tone(ctx, type, freq, shape, at, stopAt) {
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

function play(sound, vol) {
  const ctx = getCtx();
  const t = ctx.currentTime;
  if (sound === 'estudo') {
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
  } else if (sound === 'pausa_curta') {
    [523, 659].forEach((freq, i) => {
      const at = t + i * 0.25;
      tone(ctx, 'sine', freq, (g) => {
        g.gain.setValueAtTime(vol * 0.4, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
      }, at, at + 1.2);
    });
  } else if (sound === 'pausa_longa') {
    [784, 784, 784].forEach((freq, i) => {
      const at = t + i * 0.28;
      tone(ctx, 'sine', freq, (g) => {
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(vol * 0.5, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
      }, at, at + 0.26);
    });
  } else {
    // 'sucesso' (e qualquer nome desconhecido): o arpejo do "deu certo".
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
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'play') return false;
  const vol = Math.min(1, Math.max(0, Number(msg.volume) || 0));
  if (vol === 0) return false;
  try {
    const ctx = getCtx();
    // Página de extensão não passa pela política de autoplay, mas um contexto pode nascer
    // suspenso mesmo assim: acorda antes de agendar, senão as notas ficam presas no tempo zero.
    const go = () => {
      try {
        play(msg.sound, vol);
      } catch {
        // sem áudio, sem drama
      }
    };
    if (ctx.state === 'suspended') ctx.resume().then(go, go);
    else go();
  } catch {
    // sem Web Audio nesta página: a notificação já saiu
  }
  return false;
});
