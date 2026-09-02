// Ponte pro que AINDA é legado. O React chama estas funções em vez de `window.*`
// espalhado; cada uma some quando a feature correspondente migrar.
//
// O app.js mantém os handlers antigos em `window` (os onclick do index.html usam).

import type { DateKey, StudyBlock } from '../domain/types';

declare global {
  interface Window {
    openEventDelete?: (dateKey: DateKey, block: StudyBlock) => void;
    openLunchPanel?: (dateKey: DateKey) => void;
    openEventPanel?: () => void;
    openFinishDay?: () => void;
  }
}

const missing = (name: string) => () => console.warn(`legado ainda não carregou: ${name}`);

export const legacy = {
  /** Modais de evento/almoço — migram na fatia "Eventos". */
  openEventDelete: (dateKey: DateKey, block: StudyBlock) =>
    (window.openEventDelete ?? missing('openEventDelete'))(dateKey, block),
  openLunchPanel: (dateKey: DateKey) => (window.openLunchPanel ?? missing('openLunchPanel'))(dateKey),
  openEventPanel: () => (window.openEventPanel ?? missing('openEventPanel'))(),
  /** Encerrar o dia — migra na fatia "Onboarding + Encerrar o dia". */
  openFinishDay: () => (window.openFinishDay ?? missing('openFinishDay'))(),
};
