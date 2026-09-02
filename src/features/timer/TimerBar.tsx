// A barra fixa "Em andamento" com o restante, o volume e o "✕ Parar".
// O elemento existe sempre (como no markup antigo); `.active` mostra.

import { setVolume, stopTimer, toggleMute } from '../../application/timer';
import { cleanBlockName, timerProgress } from '../../domain/timer';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { useSecondTick } from './useSecondTick';

export function TimerBar() {
  const { block, tab, audio } = useAppState((s, d) => ({ block: d.timerBlock, tab: s.uiTab, audio: d.audio }));
  const active = !!block && tab === 'plano';
  useSecondTick(!!block);

  const progress = block ? timerProgress(block, new Date()) : null;
  const t = strings.timer;

  return (
    <div className={'timer-bar' + (active ? ' active' : '')} id="timer-bar">
      <div>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {t.inProgress}
        </div>
        <div className="timer-block-name" id="timer-block-name">{block ? cleanBlockName(block.name) : '—'}</div>
      </div>
      <div className={'timer-time' + (progress?.ending ? ' ending' : '')} id="timer-display">
        {progress ? progress.display : '00:00'}
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
      <button className="timer-stop" onClick={stopTimer}>{t.stop}</button>
    </div>
  );
}
