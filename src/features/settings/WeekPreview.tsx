// "Como fica a semana" (Configurações → Estrutura da rotina): sete réguas na mesma
// escala, uma por dia, com o compromisso no horário dele e o total de estudo na ponta.
// A Direção A de prototypes/estrutura-da-rotina.html, escolhida pelo Tomi em 2026-09-17.
//
// O chip "Rotina · Esta semana" troca o molde (config + séries, reagindo ao rascunho
// antes do Salvar) pela semana de verdade (o mesmo blocksForDay do Plano). O compromisso
// é dito pelo NOME — dentro do segmento quando cabe, senão só na legenda. Nunca por
// emoji: o app não sabe o ícone de "Dentista".

import { useState } from 'react';
import { weekPreview, weekPreviewValid } from '../../application/weekPreview';
import type { WeekPreviewMode } from '../../application/weekPreview';
import { formatCompact } from '../../domain/settings';
import { minsToTime } from '../../domain/time';
import { weekTimelineOf } from '../../domain/timeline';
import type { UserConfig } from '../../domain/types';
import { eventDisplayName, summarizeWeekDay, weekEventLines, weekTotals } from '../../domain/weekPreview';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.settings.week;

/** Largura mínima (% da régua) pra um compromisso carregar o nome dentro do segmento. */
export const LABEL_MIN_WIDTH_PCT = 12;

const dm = (key: string): string => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

interface Props {
  /** A config do rascunho, já normalizada — a mesma do "Como fica o dia". */
  cfg: UserConfig;
  sectionClass: string;
}

export function WeekPreview({ cfg, sectionClass }: Props) {
  const [mode, setMode] = useState<WeekPreviewMode>('rotina');
  // Séries, avulsos e janelas do dia mudam a semana; a versão do store cobre os três.
  useAppState((s) => s.eventSeries);

  const valid = weekPreviewValid(cfg);
  const days = valid ? weekPreview(mode, cfg) : [];
  const tl = weekTimelineOf(days.map((d) => d.blocks));
  const lines = weekEventLines(days);
  const tot = weekTotals(days);
  const desc = mode === 'rotina' || days.length === 0 ? t.desc : t.descWeek(dm(days[0]!.key), dm(days[6]!.key));

  return (
    <div className={sectionClass} id="st-sec-week">
      <div className="st-section-head">
        <div className="st-section-title">{t.title}</div>
        <div className="wk-mode" id="week-mode">
          <button type="button" className={mode === 'rotina' ? 'on' : ''} id="week-mode-rotina" onClick={() => setMode('rotina')}>{t.modeRoutine}</button>
          <button type="button" className={mode === 'semana' ? 'on' : ''} id="week-mode-semana" onClick={() => setMode('semana')}>{t.modeWeek}</button>
        </div>
      </div>
      <div className="st-section-desc">{desc}</div>
      <div className="st-card" id="week-preview">
        {!valid ? (
          <div className="sts-note warn">{t.warn}</div>
        ) : (
          <>
            <div className="wk-rows">
              {days.map((d, i) => {
                const s = summarizeWeekDay(d);
                const rest = d.rest !== null;
                const segs = tl?.rows[i] ?? [];
                return (
                  <div className={'wk-row' + (rest ? ' rest' : '')} data-day={i} key={d.key}>
                    <span className="wk-day">
                      {t.days[i]}
                      {d.changed && <i className="wk-dot" title={t.changed} />}
                    </span>
                    <div className="wk-track">
                      {rest ? (
                        <em>{t.rest}</em>
                      ) : (
                        segs.map((sg, j) => (
                          <span
                            key={`${sg.startMin}-${j}`}
                            className={`wk-seg ${sg.kind}`}
                            style={{ left: `${sg.left}%`, width: `${sg.width}%` }}
                            title={`${eventDisplayName(sg.name)} · ${minsToTime(sg.startMin)}–${minsToTime(sg.endMin)}`}
                          >
                            {(sg.kind === 'event' || sg.kind === 'interval') && sg.width >= LABEL_MIN_WIDTH_PCT && (
                              <i>{eventDisplayName(sg.name)}</i>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                    <span className="wk-total">
                      {rest ? '—' : formatCompact(s.studyMins)}
                      {!rest && s.eventMins > 0 && <small>+{formatCompact(s.eventMins)}</small>}
                    </span>
                  </div>
                );
              })}
              <div className="wk-row axis">
                <span />
                <div className="dtl-hours">
                  {tl?.hours.map((h) => (
                    <span key={h.hour} style={{ left: `${h.left}%` }}>{h.hour}h</span>
                  ))}
                </div>
                <span />
              </div>
            </div>
            {lines.length > 0 && (
              <div className="wk-legend" id="week-legend">
                <span className="k">{mode === 'rotina' ? t.legendTitle : t.legendTitleWeek}</span>
                {lines.map((l) => (
                  <span className={'wk-ev' + (l.countsAsStudy ? ' xp' : '')} key={`${l.name}|${l.start}|${l.end}`}>
                    <i />
                    {l.name} · {l.everyDay ? t.everyDay : l.days.map((i) => t.daysShort[i]).join(', ')} {l.start}–{l.end}
                    {l.countsAsStudy && ` · ${t.countsAsStudy}`}
                  </span>
                ))}
              </div>
            )}
            <div className="wk-sum" id="week-total">
              <b>{formatCompact(tot.studyMins)}</b> {t.total(tot.pomos, tot.eventMins > 0 ? formatCompact(tot.eventMins) : null, tot.totalXP)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
