// Ponte pro que AINDA é legado. O React chama estas funções em vez de `window.*`
// espalhado; cada uma some quando a feature correspondente migrar.
//
// O app.js mantém os handlers antigos em `window` (os onclick do index.html usam).

declare global {
  interface Window {
    openFinishDay?: () => void;
  }
}

const missing = (name: string) => () => console.warn(`legado ainda não carregou: ${name}`);

export const legacy = {
  /** Encerrar o dia — migra na fatia "Onboarding + Encerrar o dia". */
  openFinishDay: () => (window.openFinishDay ?? missing('openFinishDay'))(),
};
