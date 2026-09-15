// Seleção de um intervalo de linhas do plano pra virar grupo — e o ajuste do
// trecho de um grupo que já existe, puxando a alça na borda da caixa. Uma
// máquina de estados só, com duas portas: o botão "Agrupar" (toca no primeiro,
// toca no último; com mouse, passar por cima mostra o intervalo) e as alças.
// O gesto é açúcar — o que importa é "da linha A até a linha B".
//
// O botão direito e o dedo segurado numa linha SAÍRAM daqui em 2026-09-15: eram um
// atalho escondido pro que o botão já faz, e passaram a abrir a folha do bloco (ver
// useBlockGesture). Grupo ficou numa porta só, visível, igual nos dois aparelhos.
//
// A seleção mora aqui, em estado React, e não no DOM: a lista re-renderiza a
// cada check e a cada minuto, e a seleção precisa sobreviver a isso.
//
// No celular, o navegador quer transformar o dedo em scroll. Quando o dedo pega uma
// alça, um listener nativo de `touchmove` (não passivo — o do React é passivo e não
// cancela scroll) segura a página, e o ponteiro é capturado; a partir daí o dedo
// estica o trecho, e perto da borda da tela a página rola sozinha.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { edgeScrollStep, lockTouchScroll } from '../../shared/touchScroll';

export type GroupEdge = 'start' | 'end';

export type SelectionMode =
  | { kind: 'idle' }
  /** Botão "Agrupar": esperando o primeiro toque. */
  | { kind: 'armed' }
  /** Primeira linha escolhida; `focus` acompanha o mouse até o segundo toque. */
  | { kind: 'anchored'; anchor: number; focus: number }
  /** Puxando a alça de um grupo: `fixed` é a linha da outra borda, que não se mexe. */
  | { kind: 'resizing'; groupId: string; edge: GroupEdge; fixed: number; focus: number };

export interface Range {
  from: number;
  to: number;
}

const ROW_ATTR = 'data-row';

interface Options {
  /** false = dia encerrado ou vazio: nada aqui responde. */
  enabled: boolean;
  /** Intervalo fechado de índices de linha, já em ordem. */
  onRange: (from: number, to: number) => void;
  /** Soltou a alça de um grupo: o novo intervalo fechado de índices. */
  onResize: (groupId: string, from: number, to: number) => void;
  /** Tentou selecionar com `enabled` false (ex.: a alça num dia encerrado). */
  onRefuse: () => void;
}

type RowEvent = ReactPointerEvent<HTMLElement>;

export interface RowSelectionProps {
  'data-row': number;
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

  // Alça em andamento no toque: o Android abre o menu de contexto no dedo segurado — bloqueado
  // onde quer que dispare, inclusive fora da lista.
  const blockContextMenu = useRef(false);
  // Arrasto da alça: trava de scroll, última posição do ponteiro e o loop de borda.
  const unlockScroll = useRef<(() => void) | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const edgeLoop = useRef<number | null>(null);

  const releaseContextMenu = () => {
    setTimeout(() => {
      blockContextMenu.current = false;
    }, 300);
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
    endDrag();
    if (modeRef.current.kind !== 'idle') setModeNow({ kind: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só toca em refs
  }, []);

  const complete = (a: number, b: number) => {
    endDrag();
    setModeNow({ kind: 'idle' });
    latest.current.onRange(Math.min(a, b), Math.max(a, b));
  };

  /** Durante o arrasto da alça, a linha sob o ponteiro vira a borda móvel. */
  const focusAt = (x: number, y: number) => {
    const m = modeRef.current;
    if (m.kind !== 'resizing') return;
    const idx = rowIndexAt(x, y);
    if (idx === null) return;
    // A alça de baixo não passa da linha de cima, e vice-versa: o grupo nunca vira do avesso.
    const focus = m.edge === 'end' ? Math.max(idx, m.fixed) : Math.min(idx, m.fixed);
    if (focus !== m.focus) setModeNow({ ...m, focus });
  };

  // Perto da borda da tela, rola a página e vai estendendo o trecho — até o ponteiro sair da faixa.
  const edgeStep = () => {
    edgeLoop.current = null;
    const p = lastPointer.current;
    if (!p || modeRef.current.kind !== 'resizing') return;
    const dy = edgeScrollStep(p.y);
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
    () => () => endDrag(),
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
    const m = modeRef.current;
    if (m.kind === 'armed') {
      setModeNow({ kind: 'anchored', anchor: idx, focus: idx });
      return true;
    }
    if (m.kind === 'anchored') {
      complete(m.anchor, idx);
      return true;
    }
    return false;
  };

  // Mouse: depois do primeiro clique, passar por cima das linhas mostra o intervalo.
  const onPointerEnter = (e: RowEvent) => {
    const m = modeRef.current;
    if (m.kind !== 'anchored' || e.pointerType !== 'mouse') return;
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
    rowProps: (idx) => ({ 'data-row': idx, onPointerEnter }),
    gripProps,
    // O menu de contexto nunca tem valor em cima do plano — e o botão direito numa linha é a folha do bloco.
    listProps: { onContextMenu: (e) => e.preventDefault() },
  };
}
