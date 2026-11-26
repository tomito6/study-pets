// O pop-up de parabéns pela sequência: um cartão que aparece no meio da tela quando o
// check que bate a meta do dia faz a sequência crescer, e vai embora sozinho.
//
// Fica no meio (pedido do Tomi em 2026-11-26; nasceu no topo) e mesmo assim não é modal:
// o véu atrás dele é só luz, não segura clique nem prende o foco do teclado. Quem decide
// SE ele aparece é o caso de uso (`application/streakCheer.ts`, uma vez por aumento);
// aqui é só QUANDO e COMO:
//
// - espera o feedback do próprio check passar (o anel e o "+X XP" da lista; no foco, a
//   faixa "✓ … concluído") — uma comemoração de cada vez;
// - fica alguns segundos, e o relógio dele só anda com a página visível: o bloco que
//   bate a meta costuma terminar com a pessoa olhando o caderno. (No topo o mouse em
//   cima também segurava o relógio; no meio da tela o mouse descansa ali sem ninguém
//   ter pedido, e o cartão nunca iria embora);
// - fecha no ✕, num toque em qualquer lugar — nele ou fora dele —, ou com Esc. O toque
//   de fora não é engolido: quem clicou num check por baixo marcou o check;
// - com `prefers-reduced-motion`, aparece e some sem movimento e o sprite fica parado.

import { useCallback, useEffect, useRef, useState } from 'react';
import { currentAvatarSprites } from '../../application/avatar';
import { activePet } from '../../application/pets';
import { dismissStreakCheer } from '../../application/streakCheer';
import { AVATAR_FRAMES } from '../../domain/avatar';
import { petForm } from '../../domain/pets';
import { streakTrail } from '../../domain/streakCheer';
import { strings } from '../../shared/strings';
import { useDismiss } from '../../shared/useDismiss';
import { useReducedMotion } from '../../shared/useReducedMotion';
import { useAppState } from '../../store/store';
import { useSpriteFrame } from '../profile/useSpriteFrame';
import { COMPLETED_BANNER_MS, CYCLE_BANNER_MS } from '../timer/FocusOverlay';

const t = strings.streak;

/** O tempo do feedback do check na lista (o anel e o ganho flutuante) antes de o cartão entrar. */
const ENTER_DELAY_MS = 700;
/** Folga depois da faixa "concluído" do foco. */
const AFTER_BANNER_MS = 400;
/** Quanto tempo fica na tela — contado só com a página visível. No meio ele cobre o plano, então é curto. */
export const STREAK_POP_MS = 7000;
const TICK_MS = 250;
/** A saída animada (o CSS dura um pouco menos). */
const LEAVE_MS = 220;

export function StreakPop() {
  const { cheer, focusOpen, completed, loggedIn } = useAppState((s, d) => ({
    cheer: d.streakCheer,
    focusOpen: d.focusOpen,
    completed: d.timerCompleted,
    loggedIn: !!s.user,
  }));
  const reduced = useReducedMotion();
  /** O `at` do parabéns que já entrou na tela (o atraso de entrada passou). */
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  // O que o atraso de entrada precisa saber do foco, lido na hora em que o parabéns chega.
  const foco = useRef({ focusOpen, completed });
  foco.current = { focusOpen, completed };

  const at = cheer?.at ?? null;
  const visible = at != null && shownAt === at;

  // A entrada: depois do feedback do check — e, no foco, depois da faixa "concluído".
  useEffect(() => {
    setLeaving(false);
    if (at == null) {
      setShownAt(null);
      return;
    }
    let delay = ENTER_DELAY_MS;
    const { focusOpen: noFoco, completed: feito } = foco.current;
    if (noFoco && feito) {
      const faixa = (feito.cycle ? CYCLE_BANNER_MS : COMPLETED_BANNER_MS) - (Date.now() - feito.at);
      delay = Math.max(delay, faixa + AFTER_BANNER_MS);
    }
    const id = setTimeout(() => setShownAt(at), delay);
    return () => clearTimeout(id);
  }, [at]);

  const close = useCallback(() => {
    if (reduced) {
      dismissStreakCheer();
      return;
    }
    setLeaving(true);
  }, [reduced]);

  // A saída animada termina fechando de verdade.
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(dismissStreakCheer, LEAVE_MS);
    return () => clearTimeout(id);
  }, [leaving]);

  // O tempo de tela: só anda com a página visível.
  useEffect(() => {
    if (!visible || leaving) return;
    let elapsed = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      elapsed += TICK_MS;
      if (elapsed >= STREAK_POP_MS) close();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [visible, leaving, close]);

  // Esc fecha e clicar fora fecha — sem roubar o foco do teclado e sem engolir o clique.
  const cardRef = useDismiss<HTMLDivElement>(visible, close);

  const pet = useAppState(() => activePet());
  const form = pet ? petForm(pet) : null;
  const charSprites = useAppState(() => currentAvatarSprites());
  const frames = form?.frames ?? AVATAR_FRAMES;
  const frame = useSpriteFrame(frames, visible && !reduced);
  const sprite = form ? form.sprite(reduced ? 0 : frame % frames) : charSprites[reduced ? 0 : frame % AVATAR_FRAMES];

  if (!loggedIn) return null;

  const title = cheer ? t.title(cheer.n) : null;
  const trail = cheer ? streakTrail(cheer.n) : null;

  return (
    // A região viva existe antes do conteúdo: é assim que o leitor de tela anuncia o que entra nela.
    <div className="streak-slot" role="status" aria-live="polite">
      {visible && cheer && title && trail && <i className={'sp-veil' + (leaving ? ' leaving' : '')} aria-hidden="true" />}
      {visible && cheer && title && trail && (
        <div
          ref={cardRef}
          className={'streak-pop' + (leaving ? ' leaving' : '') + (form ? '' : ' no-pet')}
          id="streak-pop"
          data-n={cheer.n}
          onClick={close}
        >
          <div className="sp-scene" aria-hidden="true">
            <i className="sp-sun" />
            <i className="sp-hill" />
            <i className="sp-ground" />
            {sprite && <img className="sp-sprite" src={sprite} alt="" />}
          </div>
          <div className="sp-body">
            <div className="sp-kicker" aria-hidden="true">{t.kicker}</div>
            <div className="sp-title" id="streak-pop-title">
              <span className="sp-spoken">{t.spoken(cheer.n)}</span>
              <span aria-hidden="true">
                {title.antes}
                <span className="sp-roll">
                  {cheer.n > 1 && <span className="sp-old">{cheer.n - 1}</span>}
                  <span className="sp-new" id="streak-pop-n">{cheer.n}</span>
                </span>
                {title.depois}
              </span>
            </div>
            <p className="sp-sub" id="streak-pop-sub">{t.sub(cheer, pet?.name ?? null)}</p>
            <div className="sp-foot">
              <div className={'sp-trail' + (trail.more ? ' more' : '')} id="streak-pop-trail" aria-hidden="true" title={trail.more ? t.more : undefined}>
                {Array.from({ length: trail.dots }, (_, i) => (
                  <i key={i} className={'sp-dot' + (i === trail.dots - 1 ? ' head' : '')} />
                ))}
              </div>
              {cheer.coins > 0 && <span className="sp-bonus" id="streak-pop-bonus">{t.bonus(cheer.coins)}</span>}
            </div>
          </div>
          <button
            type="button"
            className="sp-close"
            id="streak-pop-close"
            aria-label={t.close}
            onClick={(e) => { e.stopPropagation(); close(); }}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
