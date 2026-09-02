// Eventos do dia: une os avulsos com as ocorrências expandidas das séries recorrentes.

import type { DateKey, RecurringEventSeries, StudyEvent } from './types';
import { dateFromKey, mondayOf, timeToMins } from './time';

/**
 * Todos os eventos de um dia, ordenados por horário de início.
 *
 * Cada ocorrência vinda de série herda o id da série em `_seriesId`, usado pelo
 * delete granular ("só este dia" vs "apagar a série").
 *
 * Detalhes de recorrência preservados do comportamento original:
 * - `biweekly` conta a paridade pela semana da âncora (segunda a segunda);
 * - `monthly` bate o dia do mês da âncora — dias 29–31 pulam meses curtos, por design.
 */
export function expandEventsForDate(
  dateKey: DateKey,
  eventsByDate: Record<DateKey, StudyEvent[]>,
  series: RecurringEventSeries[] = [],
): StudyEvent[] {
  const out: StudyEvent[] = (eventsByDate[dateKey] || []).slice();
  if (!series || series.length === 0) {
    return out.sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
  }
  const date = dateFromKey(dateKey);
  const dow = date.getDay();
  for (const s of series) {
    if (!s || !Array.isArray(s.weekdays) || s.weekdays.length === 0) continue;
    if (s.anchor && dateKey < s.anchor) continue;
    if (s.until && dateKey > s.until) continue;
    if (Array.isArray(s.exceptions) && s.exceptions.includes(dateKey)) continue;
    if (!s.weekdays.includes(dow)) continue;
    if (s.freq === 'biweekly') {
      const aMon = mondayOf(dateFromKey(s.anchor || dateKey));
      const dMon = mondayOf(date);
      const weeksDiff = Math.round((dMon.getTime() - aMon.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksDiff < 0 || weeksDiff % 2 !== 0) continue;
    } else if (s.freq === 'monthly') {
      const a = dateFromKey(s.anchor || dateKey);
      if (date.getDate() !== a.getDate()) continue;
    }
    out.push({
      name: s.name,
      start: s.start,
      end: s.end,
      _seriesId: s.id,
      countsAsStudy: s.countsAsStudy !== false,
    });
  }
  return out.sort((a, b) => timeToMins(a.start) - timeToMins(b.start));
}
