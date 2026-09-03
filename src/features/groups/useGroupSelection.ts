// Seleção de um intervalo de linhas do plano pra virar grupo. Uma máquina de
// estados só, com três portas de entrada: arrastar com o botão direito
// (desktop), segurar o dedo numa linha (celular) e o botão "Agrupar" (fallback
// visível). O gesto é açúcar — o que importa é "da linha A até a linha B".
//
// A seleção mora aqui, em estado React, e não no DOM: a lista re-renderiza a
// cada check e a cada minuto, e a seleção precisa sobreviver a isso.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

export type SelectionMode =
  | { kind: 'idle' }
  /** Botão "Agrupar": esperando o primeiro toque. */
  | { kind: 'armed' }
  /** Primeira linha escolhida. `drag` = veio do botão direito e segue o ponteiro até soltar. */
  | { kind: 'anchored'; anchor: number; focus: number; drag: boolean };

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;
const ROW_ATTR = 'data-row';

interface Options {
  /** false = dia encerrado ou vazio: nada aqui responde. */
  enabled: boolean;
  /** Intervalo fechado de índices de linha, já em ordem. */
  onRange: (from: number, to: number) => void;
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

export interface GroupSelection {
  mode: SelectionMode;
  /** Há seleção em andamento — cliques nas linhas viram escolha de intervalo. */
  active: boolean;
  isSelected: (idx: number) => boolean;
  isAnchor: (idx: number) => boolean;
  /** Entra no modo de seleção pelo botão. */
  arm: () => void;
  cancel: () => void;
  /** Clique numa linha. `true` = a seleção consumiu o clique. */
  handleClick: (idx: number) => boolean;
  rowProps: (idx: number) => RowSelectionProps;
  listProps: { onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void };
}

const rowIndexOf = (el: HTMLElement): number => Number(el.getAttribute(ROW_ATTR));

/** Linha sob o ponteiro — com captura, os eventos chegam na linha âncora, não na de baixo. */
function rowIndexAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest(`[${ROW_ATTR}]`);
  if (!el) return null;
  const n = Number(el.getAttribute(ROW_ATTR));
  return Number.isFinite(n) ? n : null;
}

export function useGroupSelection({ enabled, onRange, onRefuse }: Options): GroupSelection {
  const [mode, setMode] = useState<SelectionMode>({ kind: 'idle' });
  // Sempre os callbacks mais recentes, sem re-registrar handlers a cada render.
  const latest = useRef({ enabled, onRange, onRefuse });
  latest.current = { enabled, onRange, onRefuse };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Toque longo em andamento (celular).
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null);
  // Ponteiro cujo toque longo já disparou: o click que vem ao soltar o dedo não é "o último bloco".
  const pressFired = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const cancel = useCallback(() => {
    clearPress();
    pressFired.current = null;
    setMode((m) => (m.kind === 'idle' ? m : { kind: 'idle' }));
  }, []);

  const anchorAt = (idx: number, drag: boolean) => setMode({ kind: 'anchored', anchor: idx, focus: idx, drag });

  const complete = (a: number, b: number) => {
    setMode({ kind: 'idle' });
    latest.current.onRange(Math.min(a, b), Math.max(a, b));
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
    if (!enabled) cancel();
  }, [enabled, cancel]);
  useEffect(() => clearPress, []);

  const arm = useCallback(() => {
    if (!latest.current.enabled) {
      latest.current.onRefuse();
      return;
    }
    setMode({ kind: 'armed' });
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
      const timer = setTimeout(() => {
        press.current = null;
        pressFired.current = e.pointerId;
        anchorAt(idx, false);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15);
      }, LONG_PRESS_MS);
      press.current = { timer, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    }
  };

  const onPointerMove = (e: RowEvent) => {
    const m = modeRef.current;
    if (m.kind === 'anchored' && m.drag) {
      const idx = rowIndexAt(e.clientX, e.clientY);
      if (idx !== null && idx !== m.focus) setMode({ ...m, focus: idx });
      return;
    }
    const p = press.current;
    if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) {
      clearPress(); // o dedo se mexeu: era scroll, não toque longo
    }
  };

  const onPointerUp = (e: RowEvent) => {
    const m = modeRef.current;
    if (m.kind === 'anchored' && m.drag && e.button === 2) {
      complete(m.anchor, m.focus);
      return;
    }
    if (press.current?.pointerId === e.pointerId) clearPress();
    if (pressFired.current === e.pointerId) {
      pressFired.current = null;
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 350);
    }
  };

  const onPointerCancel = (e: RowEvent) => {
    if (press.current?.pointerId === e.pointerId) clearPress();
    if (modeRef.current.kind === 'anchored' && modeRef.current.drag) cancel();
  };

  // Mouse: depois do primeiro clique, passar por cima das linhas mostra o intervalo.
  const onPointerEnter = (e: RowEvent) => {
    const m = modeRef.current;
    if (m.kind !== 'anchored' || m.drag || e.pointerType !== 'mouse') return;
    const idx = rowIndexOf(e.currentTarget);
    if (idx !== m.focus) setMode({ ...m, focus: idx });
  };

  const isSelected = (idx: number): boolean =>
    mode.kind === 'anchored' && idx >= Math.min(mode.anchor, mode.focus) && idx <= Math.max(mode.anchor, mode.focus);

  return {
    mode,
    active: mode.kind !== 'idle',
    isSelected,
    isAnchor: (idx) => mode.kind === 'anchored' && mode.anchor === idx,
    arm,
    cancel,
    handleClick,
    rowProps: (idx) => ({ 'data-row': idx, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerEnter }),
    // O menu de contexto nunca tem valor em cima do plano — e o botão direito já é a seleção.
    listProps: { onContextMenu: (e) => e.preventDefault() },
  };
}
