// Ponte pro que AINDA é legado. O React chama estas funções em vez de `window.*`
// espalhado; cada uma some quando a feature correspondente migrar.
//
// O app.js registra o objeto `window.__legacy` no fim do módulo (depois de todas
// as declarações, pra não cair em TDZ) e mantém os handlers antigos em `window`.

import type { DateKey, StudyBlock } from '../domain/types';

interface LegacyExports {
  tryStartTimer(block: StudyBlock): void;
  playSound(type: string): void;
}

declare global {
  interface Window {
    __legacy?: LegacyExports;
    openEventDelete?: (dateKey: DateKey, block: StudyBlock) => void;
    openLunchPanel?: (dateKey: DateKey) => void;
    openEventPanel?: () => void;
    openFinishDay?: () => void;
  }
}

const missing = (name: string) => () => console.warn(`legado ainda não carregou: ${name}`);

export const legacy = {
  /** Timer — migra na fatia "Timer + modo foco". */
  tryStartTimer: (block: StudyBlock) => (window.__legacy?.tryStartTimer ?? missing('tryStartTimer'))(block),
  /** Áudio — migra junto com o timer. */
  playSound: (type: string) => (window.__legacy?.playSound ?? missing('playSound'))(type),
  /** Modais de evento/almoço — migram na fatia "Eventos". */
  openEventDelete: (dateKey: DateKey, block: StudyBlock) =>
    (window.openEventDelete ?? missing('openEventDelete'))(dateKey, block),
  openLunchPanel: (dateKey: DateKey) => (window.openLunchPanel ?? missing('openLunchPanel'))(dateKey),
  openEventPanel: () => (window.openEventPanel ?? missing('openEventPanel'))(),
  /** Encerrar o dia — migra na fatia "Onboarding + Encerrar o dia". */
  openFinishDay: () => (window.openFinishDay ?? missing('openFinishDay'))(),
};
