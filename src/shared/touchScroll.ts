// Os dois arrastos do plano (selecionar trecho pra grupo, mover evento) precisam
// das mesmas duas coisas do navegador: segurar o scroll enquanto o dedo arrasta, e
// rolar a página sozinho quando o ponteiro chega na beira da tela.

/** Faixa perto da borda da tela em que o arrasto rola a página sozinho. */
export const EDGE_PX = 64;
export const EDGE_STEP_PX = 12;

/**
 * Segura o scroll da página enquanto o dedo arrasta. Devolve o "solta".
 * Precisa ser listener nativo não passivo — o do React é passivo e não cancela scroll.
 */
export function lockTouchScroll(): () => void {
  const block = (ev: TouchEvent) => ev.preventDefault();
  document.addEventListener('touchmove', block, { passive: false });
  return () => document.removeEventListener('touchmove', block);
}

/** Quanto rolar por quadro, dado o y do ponteiro na tela. 0 = fora da faixa da borda. */
export function edgeScrollStep(clientY: number): number {
  if (clientY < EDGE_PX) return -EDGE_STEP_PX;
  if (clientY > window.innerHeight - EDGE_PX) return EDGE_STEP_PX;
  return 0;
}
