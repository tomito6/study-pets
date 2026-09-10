// Arrastar um evento pra outro horário — o gesto, compartilhado pelo Dia e pela Semana.
//
// As duas telas mostram o tempo de jeitos diferentes (a lista do Dia não é
// proporcional; a coluna da Semana é), então nenhuma das duas manda na conta: cada
// uma **mede** as faixas que tem e entrega a `domain/eventDrag`, que devolve
// minutos. Aqui fica só a máquina do ponteiro.
//
// A geometria é medida uma vez, quando o arrasto começa, e não muda até soltar.
// Isso é de propósito: mover o evento mexe no plano inteiro em volta, e re-medir a
// cada quadro faria o alvo fugir do dedo. As coordenadas são do **documento** (com
// o scroll somado), pra sobreviverem à rolagem automática da borda.
//
// Quem inicia: a alça (`immediate`, qualquer ponteiro) ou o bloco inteiro no
// mouse, depois de andar uns pixels — assim o clique continua abrindo o modal de
// sempre e, no celular, o dedo continua rolando a página e segurando pra agrupar.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { fieldAtX, grabOffsetMin, minuteAtY, movedRange, yAtMinute } from '../../domain/eventDrag';
import type { DragField } from '../../domain/eventDrag';
import { minsToTime, timeToMins } from '../../domain/time';
import type { DateKey, StudyBlock, TimeString } from '../../domain/types';
import { edgeScrollStep, lockTouchScroll } from '../../shared/touchScroll';

/** Quanto o mouse precisa andar em cima do bloco pra virar arrasto (abaixo disso é clique). */
const MOVE_TOLERANCE_PX = 6;

export interface DragSource {
  dateKey: DateKey;
  block: StudyBlock;
}

/** Onde o evento cairia se soltasse agora. `top`/`bottom` em coordenadas do documento. */
export interface DragPreview {
  source: DragSource;
  dateKey: DateKey;
  start: TimeString;
  end: TimeString;
  top: number;
  bottom: number;
}

export interface DropTarget {
  dateKey: DateKey;
  start: TimeString;
  end: TimeString;
}

interface Options {
  /** Mede os dias arrastáveis, em coordenadas do documento. Chamada no início do arrasto. */
  measure: () => DragField<DateKey>[];
  /** Soltou em outro horário (ou outro dia). Não é chamado se nada mudou. */
  onDrop: (source: DragSource, to: DropTarget) => void;
}

export interface HandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface EventDrag {
  /** Onde o evento cairia agora — quem desenha o fantasma é cada tela. */
  preview: DragPreview | null;
  dragging: boolean;
  /** Este bloco é o que está sendo arrastado (fica fantasma no lugar antigo). */
  isDragging: (dateKey: DateKey, block: StudyBlock) => boolean;
  /** `immediate` = a alça: pega no primeiro toque. Sem ele, só o mouse e só depois de andar. */
  handleProps: (source: DragSource, immediate?: boolean) => HandleProps;
  /** O clique que vem logo depois de um arrasto não deve abrir o modal do evento. */
  consumeClick: () => boolean;
}

interface Press {
  pointerId: number;
  /** Onde o dedo/mouse encostou, em coordenadas do documento. */
  x: number;
  y: number;
  source: DragSource;
  /** O retângulo do próprio bloco, pro ponto de pega. */
  rect: { top: number; bottom: number };
  immediate: boolean;
}

interface Live {
  press: Press;
  fields: DragField<DateKey>[];
  /** Minutos do evento acima do ponto de pega. */
  grabMin: number;
  durationMin: number;
}

const docPoint = (e: { clientX: number; clientY: number }) => ({
  x: e.clientX + window.scrollX,
  y: e.clientY + window.scrollY,
});

const docRect = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
};

export function useEventDrag({ measure, onDrop }: Options): EventDrag {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const latest = useRef({ measure, onDrop });
  latest.current = { measure, onDrop };

  const press = useRef<Press | null>(null);
  const live = useRef<Live | null>(null);
  const previewRef = useRef<DragPreview | null>(null);
  const unlockScroll = useRef<(() => void) | null>(null);
  const lastPointer = useRef<{ x: number; y: number; clientY: number } | null>(null);
  const edgeLoop = useRef<number | null>(null);
  const swallowClick = useRef(false);

  const setPreviewNow = (p: DragPreview | null) => {
    previewRef.current = p;
    setPreview(p);
  };

  const stopEdgeLoop = () => {
    if (edgeLoop.current !== null) cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = null;
  };

  const finish = () => {
    stopEdgeLoop();
    unlockScroll.current?.();
    unlockScroll.current = null;
    lastPointer.current = null;
    live.current = null;
    press.current = null;
    if (previewRef.current) setPreviewNow(null);
  };

  const cancel = useCallback(finish, []);

  /** Onde o evento cai, dado o ponteiro em coordenadas do documento. */
  const previewAt = (x: number, y: number): DragPreview | null => {
    const l = live.current;
    if (!l) return null;
    const field = fieldAtX(l.fields, x);
    if (!field) return null;
    const minute = minuteAtY(field.anchors, y);
    if (minute === null) return null;
    const { startMin, endMin } = movedRange(l.durationMin, minute - l.grabMin);
    const top = yAtMinute(field.anchors, startMin);
    const bottom = yAtMinute(field.anchors, endMin);
    return {
      source: l.press.source,
      dateKey: field.key,
      start: minsToTime(startMin),
      end: minsToTime(endMin),
      top: top ?? 0,
      bottom: bottom ?? 0,
    };
  };

  const track = (x: number, y: number) => {
    const next = previewAt(x, y);
    const cur = previewRef.current;
    if (!next) return;
    // Só re-renderiza quando o resultado muda de verdade (o passo é de 5 min).
    if (cur && cur.dateKey === next.dateKey && cur.start === next.start) return;
    setPreviewNow(next);
  };

  // Perto da borda da tela, a página rola sozinha e o alvo acompanha.
  const edgeStep = () => {
    edgeLoop.current = null;
    const p = lastPointer.current;
    if (!p || !live.current) return;
    const dy = edgeScrollStep(p.clientY);
    if (dy === 0) return;
    window.scrollBy(0, dy);
    lastPointer.current = { ...p, y: p.y + dy };
    track(p.x, p.y + dy);
    edgeLoop.current = requestAnimationFrame(edgeStep);
  };

  const begin = (p: Press, x: number, y: number, pointerType: string, el: HTMLElement) => {
    const fields = latest.current.measure();
    if (fields.length === 0) return;
    const durationMin = timeToMins(p.source.block.endTime) - timeToMins(p.source.block.time);
    live.current = { press: p, fields, durationMin, grabMin: grabOffsetMin(p.rect, p.y, durationMin) };
    if (pointerType === 'touch') {
      unlockScroll.current?.();
      unlockScroll.current = lockTouchScroll();
    }
    try {
      el.setPointerCapture(p.pointerId);
    } catch {
      // ponteiro já inativo — o arrasto simplesmente não segue
    }
    track(x, y);
  };

  const onPointerDown = (source: DragSource, immediate: boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || live.current) return;
    if (!immediate && e.pointerType !== 'mouse') return; // dedo no corpo da linha continua rolando/agrupando
    const { x, y } = docPoint(e);
    // A alça é filha da linha: o retângulo que interessa é o do bloco inteiro.
    const el = e.currentTarget;
    const blockEl = (immediate ? el.closest('[data-drag-block]') : el) ?? el;
    const p: Press = { pointerId: e.pointerId, x, y, source, rect: docRect(blockEl), immediate };
    press.current = p;
    if (!immediate) return;
    e.preventDefault();
    e.stopPropagation();
    begin(p, x, y, e.pointerType, el);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const { x, y } = docPoint(e);
    lastPointer.current = { x, y, clientY: e.clientY };
    if (!live.current) {
      // Soltou o botão fora da linha: o "pressionado" ficou pendurado. Sem botão, não há arrasto.
      if (e.buttons === 0) {
        press.current = null;
        return;
      }
      if (Math.hypot(x - p.x, y - p.y) <= MOVE_TOLERANCE_PX) return;
      begin(p, x, y, e.pointerType, e.currentTarget);
      return;
    }
    e.preventDefault();
    track(x, y);
    if (edgeLoop.current === null) edgeLoop.current = requestAnimationFrame(edgeStep);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const l = live.current;
    const target = previewRef.current;
    finish();
    if (!l || !target) return;
    swallowClick.current = true;
    setTimeout(() => {
      swallowClick.current = false;
    }, 350);
    const b = p.source.block;
    if (target.dateKey === p.source.dateKey && target.start === b.time) return; // soltou onde estava
    latest.current.onDrop(p.source, { dateKey: target.dateKey, start: target.start, end: target.end });
  };

  const onPointerCancel = () => cancel();

  // Esc desiste no meio do caminho; sair da tela também.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, cancel]);
  useEffect(() => () => finish(), []);

  return {
    preview,
    dragging: preview !== null,
    isDragging: (dateKey, block) =>
      !!preview && preview.source.dateKey === dateKey && preview.source.block.time === block.time,
    handleProps: (source, immediate = false) => ({
      onPointerDown: onPointerDown(source, immediate),
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    }),
    consumeClick: () => {
      if (!swallowClick.current) return false;
      swallowClick.current = false;
      return true;
    },
  };
}
