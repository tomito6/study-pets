// Feedback dopamínico ao marcar um bloco: anel expandindo + "+X XP / +Y 🪙" flutuando.
// Overlays vivem no <body> (não na linha), pra sobreviver ao re-render da lista.

import { strings } from '../../shared/strings';

export function spawnCheckRipple(rect: DOMRect): void {
  const r = document.createElement('div');
  r.className = 'check-ripple';
  r.style.left = `${rect.left + rect.width / 2}px`;
  r.style.top = `${rect.top + rect.height / 2}px`;
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 650);
}

export function spawnFloatGain(rect: DOMRect, xp: number, coins: number): void {
  const wrap = document.createElement('div');
  wrap.className = 'float-gain';
  wrap.style.left = `${rect.right + 8}px`;
  wrap.style.top = `${rect.top - 6}px`;
  const xpEl = document.createElement('div');
  xpEl.className = 'fg-xp';
  xpEl.textContent = strings.plan.floatXp(xp);
  wrap.appendChild(xpEl);
  if (coins > 0) {
    const coinEl = document.createElement('div');
    coinEl.className = 'fg-coin';
    coinEl.textContent = strings.plan.floatCoins(coins);
    wrap.appendChild(coinEl);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1400);
}

/** Quanto tempo a faixa do ciclo fica na tela (o CSS some sozinho um pouco antes). */
const CHEER_MS = 3800;
let cheerEl: HTMLElement | null = null;

/**
 * A faixa "✓ Ciclo 2 completo" quando a última linha da leva é marcada na lista.
 * É o marco intermediário entre o check de um bloco e o fim do dia — por isso
 * comemora, mas não interrompe: fica no rodapé, sem botão e sem pedir nada.
 * (No modo foco quem faz esse papel é a faixa do `FocusOverlay`.)
 */
export function spawnCycleCheer(title: string, sub: string): void {
  if (typeof document === 'undefined') return;
  cheerEl?.remove(); // uma por vez, como o toast
  const el = document.createElement('div');
  el.className = 'cycle-cheer';
  el.id = 'cycle-cheer';
  const t = document.createElement('div');
  t.className = 'sc-title';
  t.textContent = title;
  const s = document.createElement('div');
  s.className = 'sc-sub';
  s.textContent = sub;
  el.append(t, s);
  document.body.appendChild(el);
  cheerEl = el;
  setTimeout(() => {
    el.remove();
    if (cheerEl === el) cheerEl = null;
  }, CHEER_MS);
}
