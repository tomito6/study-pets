// A altura real da barra do topo em `--topbar-h`, no `#app`.
//
// O CLAUDE.md sempre disse que a altura "vai em `--topbar-h` no #app, que a barra
// do timer usa pra grudar logo abaixo em vez de um top fixo" — mas o valor era um
// `76px` cravado no CSS. Numa tela estreita (360, 375, e com o sininho também 393
// e 412) o conteúdo da direita quebra em duas linhas, a barra fica com 94–113px, e
// a `.timer-bar` — que é sticky em `top: var(--topbar-h)` — encosta 20 a 40px
// debaixo dela. Medir fecha isso pra qualquer largura, agora e depois.

import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useTopbarHeight(ref: RefObject<HTMLDivElement | null>, deps: unknown[] = []): void {
  useEffect(() => {
    const el = ref.current;
    const app = document.getElementById('app');
    if (!el || !app) return;
    const escrever = () => app.style.setProperty('--topbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    escrever();
    if (typeof ResizeObserver === 'undefined') return; // ambiente sem a API: fica o valor do CSS
    const ro = new ResizeObserver(escrever);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
