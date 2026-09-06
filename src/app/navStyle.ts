// Experimento temporário (2026-09-06): qual estilo de aba o cabeçalho usa — "icons" (ícones em pixel),
// "underline" (texto grande sublinhado) ou "classic" (o cabeçalho de antes, sem os emojis). Fica só neste
// dispositivo (localStorage), fora do doc e do store de propósito: quando um for escolhido, este arquivo e o
// NavStyleSwitch saem juntos.

import { useSyncExternalStore } from 'react';

export type NavStyle = 'icons' | 'underline' | 'classic';

const KEY = 'study-pets:nav-style';
// Padrão = o cabeçalho de antes: é o que o Tomi quer no celular; os outros dois ficam a um toque no botão.
const DEFAULT: NavStyle = 'classic';

/** A ordem em que o botão alterna: ícones → sublinhado → original → ícones. */
export const NEXT_STYLE: Record<NavStyle, NavStyle> = { icons: 'underline', underline: 'classic', classic: 'icons' };

function isNavStyle(v: unknown): v is NavStyle {
  return v === 'icons' || v === 'underline' || v === 'classic';
}

function read(): NavStyle {
  try {
    const v = localStorage.getItem(KEY);
    return isNavStyle(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current: NavStyle = read();
const listeners = new Set<() => void>();

export function getNavStyle(): NavStyle {
  return current;
}

export function setNavStyle(style: NavStyle): void {
  current = style;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // sem storage: vale só nesta carga da página
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNavStyle(): NavStyle {
  return useSyncExternalStore(subscribe, getNavStyle, getNavStyle);
}
