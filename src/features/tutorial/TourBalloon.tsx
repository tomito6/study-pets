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
import { activeTourArea, nextTourStep, placeBalloon, scrollToShow, tourSteps } from '../../domain/tutorial';
import type { BalloonPlacement, Rect, TourViewport } from '../../domain/tutorial';
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

/**
 * As barras grudadas no topo da janela. A `.topbar` é sticky em qualquer largura e a
 * `.timer-bar` gruda logo abaixo dela enquanto um bloco roda — as duas cobrem o topo
 * da tela, e o balão precisa saber disso pra não nascer atrás delas.
 */
const TOP_CHROME = '.topbar, .timer-bar';

/** Quantos pixels do alto da janela estão cobertos por barra fixa agora. */
function topInset(): number {
  const barras = [...document.querySelectorAll(TOP_CHROME)]
    .filter((el) => {
      const pos = getComputedStyle(el).position;
      return pos === 'sticky' || pos === 'fixed';
    })
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .sort((a, b) => a.top - b.top);
  // Empilhadas: cada uma só conta se começa onde a anterior terminou (uma barra
  // que ainda está longe do topo não cobre nada).
  let inset = 0;
  for (const r of barras) if (r.top <= inset + 1) inset = Math.max(inset, r.bottom);
  return Math.max(0, Math.round(inset));
}

/** A faixa visível do documento, já descontada a barra do topo. */
function tourViewport(): TourViewport {
  return {
    width: window.innerWidth,
    top: window.scrollY + topInset(),
    bottom: window.scrollY + window.innerHeight,
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

  // Antes de medir: traz o elemento pra vista se ele estiver fora dela. Precisa vir
  // antes do efeito abaixo (layout effects rodam na ordem em que são declarados) —
  // o lado do balão é decidido contra a faixa visível, então a página tem que já
  // estar no lugar quando a medida acontece. Rolagem instantânea de propósito: com
  // rolagem suave a medida aconteceria no meio do caminho.
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.anchor);
    if (!el) return;
    const alvo = scrollToShow(docRect(el), tourViewport(), window.scrollY);
    if (alvo !== null) window.scrollTo({ top: alvo });
  }, [step]);

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
        place: placeBalloon(anchor, { width: b.width, height: b.height }, tourViewport(), step),
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
