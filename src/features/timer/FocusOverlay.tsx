// Modo foco: tela cheia com o anel que drena, o próximo bloco e o ganho ao concluir.
// Sem controles centrais (sem pausar, sem pular) — decisão consciente do produto.
// "← Sair do foco" só fecha o overlay; o timer segue na barra.
//
// Aberto antes da hora, mostra a contagem até o início (anel cheio, apagado) e
// começa sozinho. Quando um bloco acaba aqui dentro, o caso de uso emenda no
// seguinte e deixa em `timerCompleted` o que foi ganho — a faixa "✓ … concluído"
// fica uns segundos na tela, derivada do relógio (sem timeout próprio).

import { useEffect } from 'react';
import { blocksForDay, currentDayKey } from '../../application/plan';
import { closeFocus } from '../../application/timer';
import { coinsForStudyBlock } from '../../domain/progression';
import {
  blockDurationMin,
  blockNumberInSession,
  cleanBlockName,
  formatClock,
  nextBlockAfter,
  timerProgress,
} from '../../domain/timer';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';
import { useSecondTick } from './useSecondTick';

const FOCUS_CIRC = 2 * Math.PI * 45; // ≈ 282.7, o perímetro do círculo do SVG
const NUM_SESSIONS = 6;
/** Quanto tempo a faixa "concluído" fica na tela depois de emendar no próximo bloco. */
const COMPLETED_BANNER_MS = 4000;

export function FocusOverlay() {
  const { block, open, completed } = useAppState((_, d) => ({
    block: d.timerBlock,
    open: d.focusOpen,
    completed: d.timerCompleted,
  }));
  const showing = open && !!block;
  useSecondTick(showing);

  useEffect(() => {
    document.body.style.overflow = showing ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showing]);

  const t = strings.timer.focus;
  const now = new Date();

  // Sem timer, o overlay existe fechado (mesmo DOM do markup antigo) com placeholders.
  if (!block) {
    return (
      <div className="focus-overlay" id="focus-overlay">
        <div className="focus-inner" />
      </div>
    );
  }

  const isPausa = block.type === 'pausa';
  const dayBlocks = blocksForDay(currentDayKey());
  const sessionName = strings.plan.sessions[(block.session ?? 0) % NUM_SESSIONS] ?? strings.plan.sessionFallback;
  const durMin = blockDurationMin(block);
  const coins = block.type === 'estudo' ? coinsForStudyBlock(durMin) : 0;
  const next = nextBlockAfter(dayBlocks, block);
  const p = timerProgress(block, now);
  const waiting = p.phase === 'waiting';

  return (
    <div className={'focus-overlay' + (showing ? ' open' : '')} id="focus-overlay">
      <div className="focus-inner">
        <div className="focus-topbar">
          <span id="focus-clock">{formatClock(now)}</span>
          <button className="focus-exit" onClick={closeFocus}>{t.exit}</button>
        </div>
        {completed && now.getTime() - completed.at < COMPLETED_BANNER_MS && (
          <div className="focus-done" id="focus-done">{strings.timer.completed(completed)}</div>
        )}
        <div className="focus-header">
          <div className={'focus-chip' + (isPausa ? ' pausa' : '')} id="focus-chip">
            <span className="fc-dot" />
            <span id="focus-chip-text">{t.chip(sessionName, blockNumberInSession(dayBlocks, block))}</span>
          </div>
          <div className="focus-block-name" id="focus-block-name">{cleanBlockName(block.name)}</div>
          <div className="focus-pomo-label" id="focus-pomo-label">
            {isPausa ? t.breakOf(durMin) : t.pomodoroOf(durMin)}
          </div>
        </div>
        <div className="focus-timer-wrap">
          <svg viewBox="0 0 100 100">
            <circle className="focus-timer-track" cx="50" cy="50" r="45" />
            <circle
              className={'focus-timer-fill' + (isPausa ? ' pausa' : '') + (waiting ? ' waiting' : '')}
              id="focus-timer-fill"
              cx="50"
              cy="50"
              r="45"
              strokeDasharray={FOCUS_CIRC.toFixed(1)}
              strokeDashoffset={FOCUS_CIRC * p.elapsedFraction}
            />
          </svg>
          <div className="focus-timer-center">
            <div className={'focus-time-big' + (p.ending ? ' ending' : '') + (waiting ? ' waiting' : '')} id="focus-time-big">
              {waiting ? p.untilStartDisplay : p.display}
            </div>
            <div className="focus-time-sub" id="focus-time-sub">
              {waiting ? t.startsAt(block.time) : t.completed(p.pct)}
            </div>
          </div>
        </div>
        <div className="focus-scene">
          <div className="focus-scene-stage" id="focus-scene-stage" />
          <div className="focus-scene-foot" id="focus-scene-foot">
            <span className="focus-scene-xp">{strings.plan.xpGain(block.xp || 0)}</span>
            {' · '}
            <span className="focus-scene-coins">{strings.plan.floatCoins(coins)}</span>
            {t.onComplete}
          </div>
        </div>
        <div className="focus-next" id="focus-next">
          <div className="focus-next-label">{t.next}</div>
          <div className="focus-next-sep" />
          <div className="focus-next-name" id="focus-next-name">{next ? cleanBlockName(next.name) : t.endOfDay}</div>
          <div className="focus-next-dur" id="focus-next-dur">{next ? t.minutes(blockDurationMin(next)) : '—'}</div>
        </div>
      </div>
    </div>
  );
}
