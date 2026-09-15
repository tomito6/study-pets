// O gesto que abre a folha de um bloco: botão direito no mouse, dedo segurado no
// celular. Nada de arrasto — o gesto numa linha significa "sobre este bloco", e só.
//
// Até 2026-09-15 esses dois gestos começavam a seleção de grupo, um atalho escondido
// pro que o botão "Agrupar" já faz. Grupo ficou só no botão (uma porta, visível, igual
// nos dois aparelhos); o gesto ganhou a folha: horário, duração, XP, grupo, e a nota.
//
// A folha abre no instante em que o toque longo dispara (não ao soltar): se esperasse o
// dedo levantar, um dedo que escorrega vira scroll e o navegador cancela o ponteiro —
// e a folha não abriria. O clique que o navegador dispara ao soltar o dedo depois disso
// é engolido (`consumeClick`), senão ele tocaria na linha e abriria o foco por cima.

import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

type Pointer = ReactPointerEvent<HTMLElement>;

export interface BlockGestureProps {
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onPointerDown: (e: Pointer) => void;
  onPointerMove: (e: Pointer) => void;
  onPointerUp: (e: Pointer) => void;
  onPointerCancel: (e: Pointer) => void;
}

export interface BlockGesture {
  props: BlockGestureProps;
  /** `true` = este clique é o rastro de um toque longo, e não conta. */
  consumeClick: () => boolean;
}

export function useBlockGesture(onOpen: () => void, enabled: boolean): BlockGesture {
  const latest = useRef({ onOpen, enabled });
  latest.current = { onOpen, enabled };
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointerId: number } | null>(null);
  const lastPointerType = useRef<string>('mouse');
  const suppress = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const eatNextClick = () => {
    if (suppress.current) clearTimeout(suppress.current);
    suppress.current = setTimeout(() => {
      suppress.current = null;
    }, 1000);
  };

  return {
    consumeClick: () => {
      if (!suppress.current) return false;
      clearTimeout(suppress.current);
      suppress.current = null;
      return true;
    },
    props: {
      onContextMenu: (e) => {
        // O menu do navegador nunca tem valor em cima do plano. No mouse, o botão direito é a
        // folha; no toque, quem abre é o toque longo abaixo (o Android também dispara isto ali).
        e.preventDefault();
        if (!latest.current.enabled || lastPointerType.current === 'touch') return;
        latest.current.onOpen();
      },
      onPointerDown: (e) => {
        lastPointerType.current = e.pointerType;
        if (!latest.current.enabled || e.pointerType !== 'touch' || e.button !== 0) return;
        clearPress();
        const el = e.currentTarget;
        const pointerId = e.pointerId;
        const timer = setTimeout(() => {
          press.current = null;
          try {
            el.setPointerCapture(pointerId); // o soltar chega aqui, e não na folha que acabou de abrir
          } catch {
            // dedo já saiu da tela
          }
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(15);
          eatNextClick();
          latest.current.onOpen();
        }, LONG_PRESS_MS);
        press.current = { timer, x: e.clientX, y: e.clientY, pointerId };
      },
      onPointerMove: (e) => {
        const p = press.current;
        if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) {
          clearPress(); // o dedo se mexeu antes do toque longo: era scroll
        }
      },
      onPointerUp: (e) => {
        if (press.current?.pointerId === e.pointerId) clearPress();
      },
      onPointerCancel: (e) => {
        if (press.current?.pointerId === e.pointerId) clearPress();
      },
    },
  };
}
