// "A página voltou a ficar visível" — aba trazida pra frente, celular destravado,
// volta do bfcache. A camada de aplicação escuta isto pra reconciliar o timer
// (o setInterval é estrangulado em segundo plano e congela com a tela travada).
// Sem `document` (Node, testes), é no-op.

import type { Unsubscribe } from './ports';

export function onVisible(cb: () => void): Unsubscribe {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  const onChange = () => {
    if (document.visibilityState === 'visible') cb();
  };
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('pageshow', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('pageshow', onChange);
  };
}
