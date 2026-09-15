// Sons do app via Web Audio — sem arquivos externos. Porte fiel do original.
// Falha em silêncio onde não há áudio (headless, contexto bloqueado): som nunca
// pode derrubar o app.
//
// **O contexto nasce num gesto, ou nasce mudo.** O navegador só deixa um
// `AudioContext` tocar se ele foi criado (ou retomado) a partir de uma interação da
// pessoa; criado de dentro de um `setInterval` — que é exatamente onde o fim do bloco
// acontece — ele vem `suspended`, e todo som dali em diante é silêncio sem erro
// nenhum. No dia de rotina isso raramente aparecia, porque o clique num check já tinha
// criado o contexto; no modo ao vivo não há check à mão, o primeiro som do dia é o
// fim do primeiro pomodoro, e a pessoa ouvia nada. `primeAudio` é chamado nos gestos
// que começam ou retomam um bloco (e nos controles de volume) pra criar o contexto
// enquanto o navegador está disposto; `playSound` ainda tenta um `resume()` se o
// achar suspenso, que o Chrome aceita depois de qualquer interação com a página.

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

/**
 * Cria o contexto (se ainda não existe) e o retoma se estiver suspenso. Chamar de dentro
 * de um gesto da pessoa — clique, toque, tecla —, que é quando o navegador deixa. Fora de
 * um gesto não faz mal: no pior caso o contexto fica como estava. Nunca lança.
 */
export function primeAudio(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  } catch {
    // sem Web Audio: nada a preparar
  }
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
    // Suspenso (criado fora de um gesto, ou o navegador o dormiu): tenta acordar. Os
    // osciladores abaixo ficam agendados em `currentTime`, que não anda enquanto o
    // contexto dorme — se o `resume()` passar, eles tocam em seguida; se não, nada quebra.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
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
