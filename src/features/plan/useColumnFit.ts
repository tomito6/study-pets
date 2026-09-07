// A coluna da esquerda do laptop cabe na altura da janela por ESCALA, não por corte: mede a altura natural
// da coluna (em escala 1) e põe em `--col-k` no #app a razão "altura disponível ÷ altura natural", com teto
// em 1. O CSS usa `--col-k` no zoom da coluna e na largura da faixa do grid — então tudo encolhe junto,
// com as proporções, e a lista ganha a largura que sobra.
// Remede quando a janela muda de tamanho e quando o conteúdo da coluna muda de altura (o cartão Agora
// aparece/some no render do timer, o pet muda, o dia encerra) — por ResizeObserver, não por render.

import { useLayoutEffect } from 'react';

const MIN_K = 0.5;
const MAX_K = 1;
let measuring = false;

function fit(): void {
  if (measuring) return;
  const app = document.getElementById('app');
  const col = document.getElementById('plan-col');
  const side = document.getElementById('plan-side');
  const timer = document.getElementById('timer-bar');
  if (!app || !col || !side || !timer) return;
  measuring = true;
  try {
    const topbarH = parseFloat(getComputedStyle(app).getPropertyValue('--topbar-h')) || 68;
    const before = app.style.getPropertyValue('--col-k');
    // mede em escala 1 (dentro do mesmo frame: nada é pintado no meio)
    app.style.setProperty('--col-k', '1');
    const tm = getComputedStyle(timer);
    const natural = side.scrollHeight + timer.offsetHeight + parseFloat(tm.marginTop) + parseFloat(tm.marginBottom);
    const available = window.innerHeight - topbarH;
    const k = natural > 0 ? Math.min(MAX_K, Math.max(MIN_K, available / natural)) : 1;
    const next = k.toFixed(3);
    app.style.setProperty('--col-k', next);
    if (before !== next) { /* mudou: o ResizeObserver pode disparar de novo, e o guard acima segura */ }
  } finally {
    measuring = false;
  }
}

export function useColumnFit(): void {
  useLayoutEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    const side = document.getElementById('plan-side');
    const timer = document.getElementById('timer-bar');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fit()) : null;
    if (ro) {
      if (side) ro.observe(side);
      if (timer) ro.observe(timer);
      // o conteúdo da coluna (cards) muda de altura sem a coluna mudar: observa os filhos também
      if (side) for (const el of Array.from(side.children)) ro.observe(el);
    }
    return () => {
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      document.getElementById('app')?.style.removeProperty('--col-k');
    };
  }, []);
  // qualquer render da coluna (store mudou) também remede — barato, e cobre o que o observer não vê
  useLayoutEffect(() => {
    fit();
  });
}
