// O balão do tour contextual: um por vez, ancorado no elemento real da aba, sem
// bloquear nada (não há backdrop; só o próprio balão recebe cliques). Se o elemento
// não existe naquele momento, vira um cartão fixo no rodapé, sem seta.
//
// Qual área está com o tour é derivado do store (`activeTourArea`); qual balão da
// área está aberto é `useState` daqui — é presentação, como a sub-aba da Análise:
// trocar de aba ou "Ver o tour de novo" recomeça a área do primeiro balão.
//
// Posição: coordenadas do documento (o balão rola junto com o elemento), medidas a
// cada render e em resize/relayout — a lista muda de tamanho quando a barra do
// timer aparece, quando o dia troca, quando o pet inicial carrega.

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { finishTour } from '../../application/tutorial';
import { activeTourArea, nextTourStep, placeBalloon, tourSteps } from '../../domain/tutorial';
import type { BalloonPlacement, Rect } from '../../domain/tutorial';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.tutorial;

type Pos = { mode: 'card' } | { mode: 'anchored'; place: BalloonPlacement; ring: Rect };

function samePos(a: Pos | null, b: Pos): boolean {
  if (!a || a.mode !== b.mode) return false;
  if (a.mode === 'card' || b.mode === 'card') return true;
  const p = a.place;
  const q = b.place;
  const r = a.ring;
  const s = b.ring;
  return (
    p.side === q.side && p.top === q.top && p.left === q.left && p.arrowX === q.arrowX &&
    r.top === s.top && r.left === s.left && r.width === s.width && r.height === s.height
  );
}

/** Retângulo do elemento em coordenadas do documento (viewport + scroll). */
function docRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top + window.scrollY),
    left: Math.round(r.left + window.scrollX),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

export function TourBalloon() {
  const { area, seen } = useAppState((s, d) => ({
    area: activeTourArea(s.tutorialSeen, s.uiTab, { onboardingOpen: d.onboardingOpen, loaded: !!s.user && d.weeks.length > 0 }),
    seen: s.tutorialSeen,
  }));
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [, relayout] = useReducer((n: number) => n + 1, 0);

  // Trocou de área, ou "Ver o tour de novo" zerou o visto: recomeça do primeiro balão.
  useEffect(() => {
    setIndex(0);
  }, [area, seen]);

  const steps = area ? tourSteps(area) : [];
  const step = steps[Math.min(index, steps.length - 1)] ?? null;

  // Mede e posiciona depois de cada render: se nada mudou, `samePos` segura o re-render.
  useLayoutEffect(() => {
    if (!step || !ref.current) return;
    const el = document.querySelector(step.anchor);
    const anchor = el ? docRect(el) : null;
    let next: Pos;
    if (!anchor || anchor.width === 0 || anchor.height === 0) {
      next = { mode: 'card' };
    } else {
      const b = ref.current.getBoundingClientRect();
      const hl = step.highlight ? document.querySelector(step.highlight) : null;
      const ring = hl ? docRect(hl) : anchor;
      next = {
        mode: 'anchored',
        place: placeBalloon(anchor, { width: b.width, height: b.height }, window.innerWidth, step),
        ring: ring.width > 0 && ring.height > 0 ? ring : anchor,
      };
    }
    setPos((cur) => (samePos(cur, next) ? cur : next));
  });

  useEffect(() => {
    if (!step) return;
    window.addEventListener('resize', relayout);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => relayout()) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener('resize', relayout);
      ro?.disconnect();
    };
  }, [step]);

  if (!area || !step) return null;

  const text = t.steps[step.id];
  const last = nextTourStep(area, index) === null;
  const advance = () => {
    const n = nextTourStep(area, index);
    if (n === null) finishTour(area);
    else setIndex(n);
  };
  const anchored = pos?.mode === 'anchored' ? pos : null;
  const className =
    'tour-balloon ' + (anchored ? (anchored.place.side === 'above' ? 'tour-above' : 'tour-below') : 'tour-card');

  return (
    <>
      {anchored && (
        <div
          className="tour-ring"
          style={{ top: anchored.ring.top, left: anchored.ring.left, width: anchored.ring.width, height: anchored.ring.height }}
        />
      )}
      <div
        ref={ref}
        id="tour-balloon"
        className={className}
        data-step={step.id}
        role="dialog"
        aria-label={text.title}
        style={{
          ...(anchored ? { top: anchored.place.top, left: anchored.place.left } : {}),
          // Antes da primeira medida o balão existe, mas não aparece — sem piscar no (0,0).
          visibility: pos ? undefined : 'hidden',
        }}
      >
        {anchored && <div className="tour-arrow" style={{ left: anchored.place.arrowX }} />}
        <div className="tour-head">
          <div className="tour-title">{text.title}</div>
          {steps.length > 1 && <div className="tour-count">{t.counter(index + 1, steps.length)}</div>}
        </div>
        <div className="tour-text">{text.text}</div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" id="tour-skip" onClick={() => finishTour(area)}>{t.skip}</button>
          <button type="button" className="tour-next" id="tour-next" onClick={advance}>{last ? t.done : t.next}</button>
        </div>
      </div>
    </>
  );
}
