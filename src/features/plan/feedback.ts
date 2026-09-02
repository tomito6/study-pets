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
