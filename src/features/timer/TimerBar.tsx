// A barra fixa "Em andamento" com o restante, o volume e o "✕ Parar".
// O elemento existe sempre (como no markup antigo); `.active` mostra.
// Bloco aberto antes da hora: "Começa em" e a contagem até o início. Pausado: "Pausado · há N",
// o restante congelado, e o botão vira "▶ Retomar" (no hardcore não há pausa — o botão some).
// Em tela grande (layout B7), sem timer rodando ela vira o cartão "Agora · Iniciar": o bloco de hoje
// que está acontecendo (ou o próximo) e um botão pra entrar nele — a mesma porta do clique na lista.

import { pauseTimer, resumeTimer } from '../../application/pause';
import { blocksForDay } from '../../application/plan';
import { requestStartBlock, setVolume, startContextFor, stopTimer, toggleMute } from '../../application/timer';
import { blockDurationMin, canStartBlock, cleanBlockName, timerProgress } from '../../domain/timer';
import { dk } from '../../domain/time';
import type { StudyBlock } from '../../domain/types';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { useWide } from '../../shared/useWide';
import { useAppState } from '../../store/store';
import { useMinuteTick } from '../plan/useMinuteTick';
import { SiteBlockBadge } from './SiteBlockBadge';
import { useSecondTick } from './useSecondTick';

/** O estudo/pausa de hoje em andamento, ou o próximo que ainda dá pra iniciar. */
function agoraBlock(now: Date): StudyBlock | null {
  const key = dk(now);
  for (const b of blocksForDay(key)) {
    if (b.type !== 'estudo' && b.type !== 'pausa') continue;
    if (canStartBlock(b, key, now, startContextFor(b, key)).ok) return b;
  }
  return null;
}

export function TimerBar() {
  const { block, tab, audio, hardcore, pausedAt } = useAppState((s, d) => ({
    block: d.timerBlock,
    tab: s.uiTab,
    audio: d.audio,
    hardcore: !!d.hardcore,
    pausedAt: d.timerPausedAt,
  }));
  const wide = useWide();
  const active = !!block && tab === 'plano';
  useSecondTick(!!block);
  useMinuteTick(); // o "Agora / Próximo" acompanha o relógio

  const now = new Date();
  const progress = block ? timerProgress(block, now, pausedAt) : null;
  const waiting = progress?.phase === 'waiting';
  const paused = progress?.phase === 'paused';
  const t = strings.timer;
  const togglePause = () => {
    if (paused) {
      resumeTimer();
      return;
    }
    const r = pauseTimer();
    if (!r.ok) showToast(t.pauseRefusal(r));
  };

  // Tela grande sem timer: o cartão do bloco de agora (só no Plano, e só se houver bloco de hoje pela frente).
  if (wide && !block && tab === 'plano') {
    const b = agoraBlock(now);
    if (!b) return <div className="timer-bar" id="timer-bar" />;
    const running = timerProgress(b, now).phase === 'running';
    // O PlanTab atende: com hardcore ligado abre o consentimento, senão inicia (e mostra o motivo se recusar).
    const start = () => requestStartBlock(b);
    return (
      <div className="timer-bar idle" id="timer-bar">
        <div className="agora-k">{running ? t.now.kicker(b.time) : t.now.next(b.time)}</div>
        <div className="timer-block-name" id="timer-block-name">{cleanBlockName(b.name)}</div>
        <div className="agora-dur">{t.now.dur(blockDurationMin(b), b.type)}</div>
        <button className="agora-start" id="agora-start" onClick={start}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3" /></svg>
          <span>{t.now.start}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={'timer-bar' + (active ? ' active' : '')} id="timer-bar">
      <div>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {paused && progress ? t.pausedFor(progress.pausedDisplay) : waiting ? t.startsIn : t.inProgress}
        </div>
        <div className="timer-block-name" id="timer-block-name">{block ? cleanBlockName(block.name) : '—'}</div>
        <SiteBlockBadge id="timer-site-block" className="site-block-badge bar-sb" />
      </div>
      <div className={'timer-time' + (progress?.ending ? ' ending' : '') + (waiting ? ' waiting' : '') + (paused ? ' paused' : '')} id="timer-display">
        {progress ? (waiting ? progress.untilStartDisplay : progress.display) : '00:00'}
      </div>
      <div className="volume-wrap">
        <button className="vol-btn" id="vol-btn" onClick={toggleMute} aria-label={t.mute}>
          {audio.muted ? '🔕' : '🔔'}
        </button>
        <input
          type="range"
          className="vol-slider"
          id="vol-slider"
          min="0"
          max="1"
          step="0.05"
          value={audio.volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </div>
      {/* No hardcore o foco cobre tudo, e nem "Pausar" nem "Parar" existem — a saída é "Desistir" lá dentro. */}
      {!hardcore && progress && !waiting && (
        <button className="timer-pause" id="timer-pause" onClick={togglePause}>{paused ? t.resume : t.pause}</button>
      )}
      {!hardcore && <button className="timer-stop" onClick={stopTimer}>{t.stop}</button>}
    </div>
  );
}
