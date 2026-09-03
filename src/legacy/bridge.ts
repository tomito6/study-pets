// Ponte pro que AINDA é legado. O React chama estas funções em vez de `window.*`
// espalhado; cada uma some quando a feature correspondente migrar.
//
// O app.js mantém os handlers antigos em `window` (os onclick do index.html usam).
// Em Node (testes) não há `window`: as chamadas viram no-op.

declare global {
  interface Window {
    openFinishDay?: () => void;
    openOnboarding?: () => void;
    rescheduleEndOfDayPrompt?: () => void;
  }
}

function call(name: 'openFinishDay' | 'openOnboarding' | 'rescheduleEndOfDayPrompt'): void {
  if (typeof window === 'undefined') return;
  const fn = window[name];
  if (fn) fn();
  else console.warn(`legado ainda não carregou: ${name}`);
}

export const legacy = {
  /** Encerrar o dia — migra na fatia "Onboarding + Encerrar o dia". */
  openFinishDay: () => call('openFinishDay'),
  /** Onboarding — mesma fatia. Cancelar sessão reabre. */
  openOnboarding: () => call('openOnboarding'),
  /** Prompt automático de fim de dia — mesma fatia. Salvar configurações reagenda. */
  rescheduleEndOfDayPrompt: () => call('rescheduleEndOfDayPrompt'),
};
