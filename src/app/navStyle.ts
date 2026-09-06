// Experimento temporário (2026-09-06): qual estilo de aba o cabeçalho usa — "icons" (ícones em pixel)
// ou "underline" (texto grande sublinhado). Fica só neste dispositivo (localStorage), fora do doc e do
// store de propósito: quando um dos dois for escolhido, este arquivo e o NavStyleSwitch saem juntos.

import { useSyncExternalStore } from 'react';

export type NavStyle = 'icons' | 'underline';

const KEY = 'study-pets:nav-style';
const DEFAULT: NavStyle = 'icons';

function read(): NavStyle {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'icons' || v === 'underline' ? v : DEFAULT;
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
