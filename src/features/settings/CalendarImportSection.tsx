// Configurações → Geral → "Importar calendário".
//
// Duas coisas mandam no desenho desta tela:
//
// 1. **Nada entra sem o usuário ver.** Escolher o arquivo não importa nada — abre
//    a revisão, com uma linha por compromisso, o que o app entendeu da repetição,
//    e o que ficou de fora com o motivo. Importação silenciosa encheria o plano
//    de aniversário e feriado.
// 2. **XP é escolha, não suposição.** O .ics não sabe distinguir aula de consulta
//    médica, e XP inflado corrompe stats e moedas pra sempre. Então o padrão é
//    "só reserva o tempo", e o botão de massa faz a grade inteira virar estudo
//    num clique.

import { useRef, useState } from 'react';
import { applyIcsImport, countChosen, loadIcsFile } from '../../application/calendarImport';
import type { ImportChoice } from '../../application/calendarImport';
import type { IcsImportPlan, IcsItem, IcsSkipReason } from '../../domain/ics';
import { strings } from '../../shared/strings';
import { showToast } from '../../shared/toast';
import { Modal } from '../shell/Modal';

const t = strings.calendarImport.settings;
const r = strings.calendarImport.review;

/** "2026-09-15" → "15/09". */
const br = (key: string): string => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const weekdayOf = (key: string): string => r.weekdays[new Date(`${key}T12:00:00`).getDay()];

function whenText(item: IcsItem): string {
  if (item.kind === 'series') {
    const everyDay = item.weekdays.length === 7;
    const days = everyDay ? null : item.weekdays.map((d) => r.weekdays[d]).join(', ');
    const freq = everyDay && item.freq === 'weekly' ? r.everyDay : r.freq[item.freq];
    const parts = [days, freq, r.times(item.occurrences)].filter(Boolean) as string[];
    if (item.until) parts.push(r.until(br(item.until)));
    return parts.join(' · ');
  }
  if (item.dates.length === 1) return `${weekdayOf(item.dates[0])} ${br(item.dates[0])}`;
  return `${r.dates(item.dates.length)} · ${br(item.dates[0])} → ${br(item.dates[item.dates.length - 1])}`;
}

const allChosen = (plan: IcsImportPlan, countsAsStudy: boolean): Record<string, ImportChoice> =>
  Object.fromEntries(plan.items.map((i) => [i.uid, { include: true, countsAsStudy }]));

export function CalendarImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<IcsImportPlan | null>(null);
  const [choices, setChoices] = useState<Record<string, ImportChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    const result = await loadIcsFile(file);
    setReading(false);
    // Zera o input: escolher o mesmo arquivo de novo precisa disparar de novo.
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) {
      setError(t.errors[result.reason]);
      return;
    }
    setPlan(result.plan);
    setChoices(allChosen(result.plan, false));
  };

  const close = () => setPlan(null);

  const patch = (uid: string, p: Partial<ImportChoice>) =>
    setChoices((prev) => ({ ...prev, [uid]: { ...(prev[uid] ?? { include: true, countsAsStudy: false }), ...p } }));

  const setAll = (p: Partial<ImportChoice>) =>
    setChoices((prev) => Object.fromEntries(Object.entries(prev).map(([uid, c]) => [uid, { ...c, ...p }])));

  const confirm = () => {
    if (!plan) return;
    const total = countChosen(plan, choices);
    if (total === 0) {
      showToast(r.empty);
      return;
    }
    const done = applyIcsImport(plan, choices);
    close();
    showToast(r.done(total, done.replaced));
  };

  const chosenCount = plan ? countChosen(plan, choices) : 0;
  const skippedByReason = new Map<IcsSkipReason, number>();
  for (const s of plan?.skipped ?? []) skippedByReason.set(s.reason, (skippedByReason.get(s.reason) ?? 0) + 1);

  return (
    <div className="st-section">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-section-desc">{t.desc}</div>
      <div className="st-card">
        <div className="st-action-row">
          <div>
            <div className="ar-title">{t.rowTitle}</div>
            <div className="ar-desc">{t.rowDesc}</div>
          </div>
          <button
            type="button"
            className="st-action-btn"
            id="ics-import-btn"
            disabled={reading}
            onClick={() => fileRef.current?.click()}
          >
            {reading ? t.reading : t.button}
          </button>
        </div>
        <input
          ref={fileRef}
          id="ics-file"
          type="file"
          accept=".ics,text/calendar"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {error && <div className="sts-note warn" id="ics-error">{error}</div>}
        <details className="ics-how">
          <summary>{t.howTitle}</summary>
          <ul>{t.howSteps.map((step) => <li key={step}>{step}</li>)}</ul>
        </details>
      </div>

      <Modal id="ics-review-panel" open={!!plan} title={r.title} onClose={close}>
        {plan && (
          <div className="ics-review">
            <div className="ics-from">{r.from(plan.calendarName)}</div>
            {plan.items.length === 0 ? (
              <div className="sts-note warn">{r.nothing}</div>
            ) : (
              <>
                <div className="ics-intro">{r.intro}</div>
                <div className="ics-bulk">
                  <button className="ics-bulk-btn" onClick={() => setAll({ include: true })}>{r.all}</button>
                  <button className="ics-bulk-btn" onClick={() => setAll({ include: false })}>{r.none}</button>
                  <button className="ics-bulk-btn xp" id="ics-all-xp" onClick={() => setAll({ countsAsStudy: true })}>
                    ✦ {r.xp}
                  </button>
                </div>
                <div className="ics-list">
                  {plan.items.map((item) => {
                    const choice = choices[item.uid];
                    const on = !!choice?.include;
                    return (
                      <label key={item.uid} className={'ics-item' + (on ? '' : ' off')}>
                        <input type="checkbox" checked={on} onChange={(e) => patch(item.uid, { include: e.target.checked })} />
                        <div className="ics-item-body">
                          <div className="ics-item-name">{item.name}</div>
                          <div className="ics-item-when">
                            {item.start}–{item.end} · {whenText(item)}
                          </div>
                          {item.notes.length > 0 && (
                            <div className="ics-item-note">{item.notes.map((n) => r.notes[n]).join(' · ')}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          className={'ics-xp' + (choice?.countsAsStudy ? ' on' : '')}
                          title={r.xpHint}
                          onClick={(e) => {
                            e.preventDefault();
                            patch(item.uid, { countsAsStudy: !choice?.countsAsStudy });
                          }}
                        >
                          {r.xp}
                        </button>
                      </label>
                    );
                  })}
                </div>
                <div className="ics-xp-hint">{r.xpHint}</div>
              </>
            )}

            {skippedByReason.size > 0 && (
              <details className="ics-skipped">
                <summary>{r.skippedTitle(plan.skipped.length)}</summary>
                <ul>
                  {[...skippedByReason].map(([reason, n]) => (
                    <li key={reason}>{n} · {r.skipped[reason]}</li>
                  ))}
                </ul>
              </details>
            )}

            <div className="ics-actions">
              <button className="ics-cancel" onClick={close}>{r.cancel}</button>
              <button className="ics-confirm" id="ics-import-confirm" disabled={chosenCount === 0} onClick={confirm}>
                {r.submit(chosenCount)}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
