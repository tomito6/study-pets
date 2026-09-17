// "Como fica a semana" (Configurações → Estrutura da rotina): os sete dias da semana
// de hoje, em dois modos.
//
// `rotina` é o MOLDE: o que a config — o rascunho que está sendo editado, então a
// semana reage antes do Salvar — e as séries recorrentes dão em qualquer semana. Sem
// avulso, sem janela editada, sem pausa registrada. As datas desta semana servem de
// amostra (é o que resolve a quinzenal e o "até").
//
// `semana` é a semana de verdade, pelo MESMO `blocksForDay` do Plano: os avulsos, as
// janelas só do dia, o dia livre, as corridas do modo ao vivo. Um dia com janela
// editada ou evento avulso ganha a marca "diferente da rotina".

import { currentWeekKeys } from '../domain/analytics';
import { expandEventsForDate } from '../domain/events';
import { hasMissingNumbers, isValidWindow } from '../domain/settings';
import { isWeekendKey } from '../domain/time';
import type { DateKey, UserConfig } from '../domain/types';
import type { WeekPreviewDay } from '../domain/weekPreview';
import { state } from '../store/store';
import { blocksForDay, generateBlocks, restKindOf } from './plan';

export type WeekPreviewMode = 'rotina' | 'semana';

/** A config dá pra gerar? (campo vazio ou nenhuma janela válida = ainda não). */
export const weekPreviewValid = (cfg: UserConfig): boolean =>
  !hasMissingNumbers(cfg) && (cfg.studyWindows || []).some(isValidWindow);

export function weekPreview(mode: WeekPreviewMode, cfg: UserConfig, now: Date = new Date()): WeekPreviewDay[] {
  return currentWeekKeys(now).map((key, dayIdx) => (mode === 'rotina' ? routineDay(key, dayIdx, cfg) : realDay(key, dayIdx)));
}

function routineDay(key: DateKey, dayIdx: number, cfg: UserConfig): WeekPreviewDay {
  if (cfg.skipWeekends && isWeekendKey(key)) return { key, dayIdx, rest: 'weekend', blocks: [], changed: false };
  const events = expandEventsForDate(key, {}, state.eventSeries || []); // só as séries: o avulso não é rotina
  return { key, dayIdx, rest: null, blocks: generateBlocks(cfg, events), changed: false };
}

function realDay(key: DateKey, dayIdx: number): WeekPreviewDay {
  const changed = !!state.windowOverrides[key] || (state.events[key]?.length ?? 0) > 0;
  return { key, dayIdx, rest: restKindOf(key), blocks: blocksForDay(key), changed };
}
