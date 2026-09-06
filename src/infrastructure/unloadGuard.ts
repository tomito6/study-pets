// "Certeza que quer sair?" ao fechar a aba, recarregar ou navegar com um estudo
// hardcore rodando. O texto é o do navegador — nenhum browser moderno aceita
// mensagem própria no `beforeunload`; só dá pra pedir a confirmação. Quem confirma
// e volta depois que o bloco acabou cai no abandono (ver application/hardcore.ts).
// Sem `window` (Node), só o flag.

let wanted = false;
let listening = false;

function onBeforeUnload(e: BeforeUnloadEvent): void {
  e.preventDefault();
  // Browsers antigos exigem `returnValue`; o texto é ignorado por todos os atuais.
  e.returnValue = '';
}

export function armUnloadGuard(): void {
  wanted = true;
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('beforeunload', onBeforeUnload);
  listening = true;
}

export function disarmUnloadGuard(): void {
  wanted = false;
  if (!listening || typeof window === 'undefined') return;
  window.removeEventListener('beforeunload', onBeforeUnload);
  listening = false;
}

/** Só pra testes. */
export const unloadGuardArmed = (): boolean => wanted;
