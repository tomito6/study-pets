// Screen Wake Lock: a tela não trava enquanto o modo foco está aberto — o caso
// mais comum de perder o fim do bloco no celular. Tudo guardado: sem a API
// (Safari antigo, Firefox, Node) nada acontece; se o browser recusar, silêncio.
//
// O browser solta o lock sozinho quando a página some (aba em segundo plano,
// tela travada); `reacquireIfWanted` é chamado ao voltar pra visível.

let sentinel: WakeLockSentinel | null = null;
/** O app quer o lock (foco aberto) — sobrevive ao browser soltar sozinho. */
let wanted = false;

const api = (): WakeLock | null =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator ? navigator.wakeLock : null;

export async function requestWakeLock(): Promise<void> {
  wanted = true;
  const wakeLock = api();
  if (!wakeLock) return;
  if (sentinel && !sentinel.released) return;
  try {
    const s = await wakeLock.request('screen');
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
    // Se o foco fechou enquanto o pedido estava em voo, não fica com o lock preso.
    if (!wanted) {
      void s.release().catch(() => {});
      return;
    }
    sentinel = s;
  } catch {
    // Recusado (bateria baixa, aba escondida, permissão) — o app segue sem.
  }
}

export function releaseWakeLock(): void {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  if (s && !s.released) void s.release().catch(() => {});
}

/** Ao voltar pra visível: o browser soltou o lock sozinho; se o foco ainda quer, pede de novo. */
export function reacquireWakeLockIfWanted(): void {
  if (wanted) void requestWakeLock();
}

/** Só pra testes. */
export const wakeLockWanted = (): boolean => wanted;
