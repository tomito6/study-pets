// Seleção de um intervalo de linhas do plano pra virar grupo — e o ajuste do
// trecho de um grupo que já existe, puxando a alça na borda da caixa. Uma
// máquina de estados só, com as portas de entrada: arrastar com o botão direito
// (desktop), segurar o dedo numa linha e arrastar (celular), o botão "Agrupar"
// (fallback visível: toca no primeiro, toca no último) e as alças da caixa.
// O gesto é açúcar — o que importa é "da linha A até a linha B".
//
// A seleção mora aqui, em estado React, e não no DOM: a lista re-renderiza a
// cada check e a cada minuto, e a seleção precisa sobreviver a isso.
//
// No celular, o navegador quer transformar o dedo em scroll. Quando o toque
// longo dispara (ou o dedo pega uma alça), um listener nativo de `touchmove`
// (não passivo — o do React é passivo e não cancela scroll) segura a página, e o
// ponteiro é capturado; a partir daí o dedo estica a seleção, e perto da borda
// da tela a página rola sozinha. Soltar sem arrastar cai no modo de tocar no
// último bloco.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

export type GroupEdge = 'start' | 'end';

export type SelectionMode =
  | { kind: 'idle' }
  /** Botão "Agrupar": esperando o primeiro toque. */
  | { kind: 'armed' }
  /** Primeira linha escolhida. `drag` = a seleção segue o ponteiro até soltar. */
  | { kind: 'anchored'; anchor: number; focus: number; drag: boolean }
  /** Puxando a alça de um grupo: `fixed` é a linha da outra borda, que não se mexe. */
  | { kind: 'resizing'; groupId: string; edge: GroupEdge; fixed: number; focus: number };

export interface Range {
  from: number;
  to: number;
}

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;
const ROW_ATTR = 'data-row';
/** Faixa perto da borda da tela em que o arrasto rola a página sozinho. */
const EDGE_PX = 64;
const EDGE_STEP_PX = 12;

interface Options {
  /** false = dia encerrado ou vazio: nada aqui responde. */
  enabled: boolean;
  /** Intervalo fechado de índices de linha, já em ordem. */
  onRange: (from: number, to: number) => void;
  /** Soltou a alça de um grupo: o novo intervalo fechado de índices. */
  onResize: (groupId: string, from: number, to: number) => void;
  /** Tentou selecionar com `enabled` false (ex.: botão direito num dia encerrado). */
  onRefuse: () => void;
}

type RowEvent = ReactPointerEvent<HTMLElement>;

export interface RowSelectionProps {
  'data-row': number;
  onPointerDown: (e: RowEvent) => void;
  onPointerMove: (e: RowEvent) => void;
  onPointerUp: (e: RowEvent) => void;
  onPointerCancel: (e: RowEvent) => void;
  onPointerEnter: (e: RowEvent) => void;
}

export interface GripProps {
  onPointerDown: (e: RowEvent) => void;
  onPointerMove: (e: RowEvent) => void;
  onPointerUp: (e: RowEvent) => void;
  onPointerCancel: (e: RowEvent) => void;
}

export interface GroupSelection {
  mode: SelectionMode;
  enabled: boolean;
  /** Há seleção ou ajuste em andamento — cliques nas linhas viram escolha de intervalo. */
  active: boolean;
  /** Intervalo selecionado (índices, em ordem) — o retângulo na lista desenha isto. */
  range: Range | null;
  isSelected: (idx: number) => boolean;
  isAnchor: (idx: number) => boolean;
  /** Entra no modo de seleção pelo botão. */
  arm: () => void;
  cancel: () => void;
  /** Clique numa linha. `true` = a seleção consumiu o clique. */
  handleClick: (idx: number) => boolean;
  rowProps: (idx: number) => RowSelectionProps;
  /** Alça de um grupo: `first`/`last` são as linhas membros nas pontas. */
  gripProps: (groupId: string, edge: GroupEdge, first: number, last: number) => GripProps;
  listProps: { onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void };
}

const rowIndexOf = (el: HTMLElement): number => Number(el.getAttribute(ROW_ATTR));

/** Linha sob o ponteiro — com captura, os eventos chegam em quem capturou, não na linha de baixo. */
function rowIndexAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest(`[${ROW_ATTR}]`);
  if (!el) return null;
  const n = Number(el.getAttribute(ROW_ATTR));
  return Number.isFinite(n) ? n : null;
}

/** Segura o scroll da página enquanto o dedo arrasta. Devolve o "solta". */
function lockTouchScroll(): () => void {
  const block = (ev: TouchEvent) => ev.preventDefault();
  document.addEventListener('touchmove', block, { passive: false });
  return () => document.removeEventListener('touchmove', block);
}

const isDragging = (m: SelectionMode): boolean => (m.kind === 'anchored' && m.drag) || m.kind === 'resizing';

function rangeOfMode(m: SelectionMode): Range | null {
  if (m.kind === 'anchored') return { from: Math.min(m.anchor, m.focus), to: Math.max(m.anchor, m.focus) };
  if (m.kind === 'resizing') return { from: Math.min(m.fixed, m.focus), to: Math.max(m.fixed, m.focus) };
  return null;
}

export function useGroupSelection({ enabled, onRange, onResize, onRefuse }: Options): GroupSelection {
  const [mode, setMode] = useState<SelectionMode>({ kind: 'idle' });
  // Sempre os callbacks mais recentes, sem re-registrar handlers a cada render.
  const latest = useRef({ enabled, onRange, onResize, onRefuse });
  latest.current = { enabled, onRange, onResize, onRefuse };
  // Espelho síncrono do modo: os handlers de ponteiro e o loop de rolagem leem daqui,
  // sem esperar o React renderizar.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Toque longo em andamento (celular).
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null);
  // O click que vem ao soltar o dedo depois de um toque longo não é "o último bloco".
  const suppressClick = useRef(false);
  // Botão direito (ou toque longo) em andamento: o menu de contexto do browser é bloqueado onde
  // quer que dispare — inclusive em cima do modal que abre no pointerup, fora da lista.
  const blockContextMenu = useRef(false);
  // Arrasto em andamento: trava de scroll, última posição do ponteiro e o loop de borda.
  const unlockScroll = useRef<(() => void) | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const edgeLoop = useRef<number | null>(null);

  const releaseContextMenu = () => {
    setTimeout(() => {
      blockContextMenu.current = false;
    }, 300);
  };
  const eatNextClick = () => {
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 350);
  };
  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const stopEdgeLoop = () => {
    if (edgeLoop.current !== null) cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = null;
  };
  const endDrag = () => {
    stopEdgeLoop();
    unlockScroll.current?.();
    unlockScroll.current = null;
    lastPointer.current = null;
  };
  const lockScrollFor = (pointerType: string) => {
    if (pointerType !== 'touch') return;
    unlockScroll.current?.();
    unlockScroll.current = lockTouchScroll();
  };

  const setModeNow = (m: SelectionMode) => {
    modeRef.current = m;
    setMode(m);
  };

  const cancel = useCallback(() => {
    clearPress();
    endDrag();
    if (modeRef.current.kind !== 'idle') setModeNow({ kind: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só toca em refs
  }, []);

  const anchorAt = (idx: number, drag: boolean) => setModeNow({ kind: 'anchored', anchor: idx, focus: idx, drag });

  const complete = (a: number, b: number) => {
    endDrag();
    setModeNow({ kind: 'idle' });
    latest.current.onRange(Math.min(a, b), Math.max(a, b));
  };

  /** Durante o arrasto, a linha sob o ponteiro vira a borda móvel. */
  const focusAt = (x: number, y: number) => {
    const m = modeRef.current;
    if (!isDragging(m)) return;
    const idx = rowIndexAt(x, y);
    if (idx === null) return;
    if (m.kind === 'anchored') {
      if (idx !== m.focus) setModeNow({ ...m, focus: idx });
    } else if (m.kind === 'resizing') {
      // A alça de baixo não passa da linha de cima, e vice-versa: o grupo nunca vira do avesso.
      const focus = m.edge === 'end' ? Math.max(idx, m.fixed) : Math.min(idx, m.fixed);
      if (focus !== m.focus) setModeNow({ ...m, focus });
    }
  };

  // Perto da borda da tela, rola a página e vai estendendo a seleção — até o ponteiro sair da faixa.
  const edgeStep = () => {
    edgeLoop.current = null;
    const p = lastPointer.current;
    if (!p || !isDragging(modeRef.current)) return;
    const dy = p.y < EDGE_PX ? -EDGE_STEP_PX : p.y > window.innerHeight - EDGE_PX ? EDGE_STEP_PX : 0;
    if (dy === 0) return;
    window.scrollBy(0, dy);
    focusAt(p.x, p.y);
    edgeLoop.current = requestAnimationFrame(edgeStep);
  };
  const trackPointer = (e: RowEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    focusAt(e.clientX, e.clientY);
    if (edgeLoop.current === null) edgeLoop.current = requestAnimationFrame(edgeStep);
  };

  // Esc cancela; dia que deixa de aceitar seleção (encerrado, vazio) também.
  useEffect(() => {
    if (mode.kind === 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode.kind, cancel]);
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (!blockContextMenu.current) return;
      e.preventDefault();
      blockContextMenu.current = false;
    };
    document.addEventListener('contextmenu', onContextMenu, true);
    return () => document.removeEventListener('contextmenu', onContextMenu, true);
  }, []);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);
  useEffect(
    () => () => {
      clearPress();
      endDrag();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- limpeza no unmount, só refs
    [],
  );

  const arm = useCallback(() => {
    if (!latest.current.enabled) {
      latest.current.onRefuse();
      return;
    }
    setModeNow({ kind: 'armed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só toca em refs
  }, []);

  const handleClick = (idx: number): boolean => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return true;
    }
    const m = modeRef.current;
    if (m.kind === 'armed') {
      anchorAt(idx, false);
      return true;
    }
    if (m.kind === 'anchored' && !m.drag) {
      complete(m.anchor, idx);
      return true;
    }
    return false;
  };

  const onPointerDown = (e: RowEvent) => {
    const idx = rowIndexOf(e.currentTarget);
    if (e.button === 2) {
      // Botão direito: começa (ou recomeça) uma seleção que segue o ponteiro.
      if (!latest.current.enabled) {
        latest.current.onRefuse();
        return;
      }
      blockContextMenu.current = true;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ponteiro já inativo — o arrasto simplesmente não segue
      }
      anchorAt(idx, true);
      return;
    }
    if (e.pointerType === 'touch' && e.button === 0 && modeRef.current.kind === 'idle' && latest.current.enabled) {
      clearPress();
      blockContextMenu.current = true; // Android abre menu no toque longo
      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const timer = setTimeout(() => {
        press.current = null;
        // Daqui em diante o dedo estica a seleção, não rola a página.
        lockScrollFor('touch');
        try {
          el.setPointerCapture(pointerId);
        } catch {
          // dedo já saiu da tela
        }
        anchorAt(idx, true);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15);
      }, LONG_PRESS_MS);
      press.current = { timer, x: e.clientX, y: e.clientY, pointerId };
    }
  };

  const onPointerMove = (e: RowEvent) => {
    const m = modeRef.current;
    if (m.kind === 'anchored' && m.drag) {
      trackPointer(e);
      return;
    }
    const p = press.current;
    if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) {
      clearPress(); // o dedo se mexeu antes do toque longo: era scroll
    }
  };

  const onPointerUp = (e: RowEvent) => {
    const m = modeRef.current;
    releaseContextMenu();
    if (press.current?.pointerId === e.pointerId) clearPress();
    if (m.kind !== 'anchored' || !m.drag) return;
    if (e.pointerType === 'touch') {
      endDrag();
      eatNextClick();
      // Soltou sem arrastar: vale o jeito de antes — tocar no último bloco.
      if (m.focus === m.anchor) setModeNow({ ...m, drag: false });
      else complete(m.anchor, m.focus);
      return;
    }
    if (e.button === 2) complete(m.anchor, m.focus);
  };

  const onPointerCancel = (e: RowEvent) => {
    if (press.current?.pointerId === e.pointerId) clearPress();
    releaseContextMenu();
    if (modeRef.current.kind === 'anchored' && modeRef.current.drag) cancel();
  };

  // Mouse: depois do primeiro clique, passar por cima das linhas mostra o intervalo.
  const onPointerEnter = (e: RowEvent) => {
    const m = modeRef.current;
    if (m.kind !== 'anchored' || m.drag || e.pointerType !== 'mouse') return;
    const idx = rowIndexOf(e.currentTarget);
    if (idx !== m.focus) setModeNow({ ...m, focus: idx });
  };

  // ---- alças da caixa de grupo ----
  const gripProps = (groupId: string, edge: GroupEdge, first: number, last: number): GripProps => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!latest.current.enabled) {
        latest.current.onRefuse();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      blockContextMenu.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ponteiro já inativo
      }
      lockScrollFor(e.pointerType);
      setModeNow({
        kind: 'resizing',
        groupId,
        edge,
        fixed: edge === 'end' ? first : last,
        focus: edge === 'end' ? last : first,
      });
    },
    onPointerMove: (e) => {
      if (modeRef.current.kind === 'resizing') trackPointer(e);
    },
    onPointerUp: () => {
      const m = modeRef.current;
      releaseContextMenu();
      if (m.kind !== 'resizing') return;
      endDrag();
      setModeNow({ kind: 'idle' });
      latest.current.onResize(m.groupId, Math.min(m.fixed, m.focus), Math.max(m.fixed, m.focus));
    },
    onPointerCancel: () => {
      releaseContextMenu();
      if (modeRef.current.kind === 'resizing') cancel();
    },
  });

  const range = rangeOfMode(mode);

  return {
    mode,
    enabled,
    active: mode.kind !== 'idle',
    range,
    isSelected: (idx) => range !== null && idx >= range.from && idx <= range.to,
    isAnchor: (idx) => mode.kind === 'anchored' && mode.anchor === idx,
    arm,
    cancel,
    handleClick,
    rowProps: (idx) => ({ 'data-row': idx, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerEnter }),
    gripProps,
    // O menu de contexto nunca tem valor em cima do plano — e o botão direito já é a seleção.
    listProps: { onContextMenu: (e) => e.preventDefault() },
  };
}
