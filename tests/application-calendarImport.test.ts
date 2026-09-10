import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyIcsImport, countChosen, loadIcsFile } from '../src/application/calendarImport';
import type { ImportChoice } from '../src/application/calendarImport';
import { blocksForDay, clearBlockCache, rebuildWeeks } from '../src/application/plan';
import { readIcs } from '../src/domain/ics';
import type { IcsImportPlan } from '../src/domain/ics';
import { emptyPersistedState, hydrateUserDoc, serializeState } from '../src/domain/persistence';
import { derived, state } from '../src/store/store';

const AGORA = new Date('2026-09-10T09:00:00'); // quinta
const HOJE = '2026-09-10';
const RANGE = { from: HOJE, to: '2026-12-31' };

const ics = (...body: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...body, 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];

const AULA = ics(
  ...vevent(
    'UID:aula@tum',
    'SUMMARY:Análise II',
    'DTSTART:20260915T100000',
    'DTEND:20260915T113000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU',
  ),
  ...vevent('UID:medico@pessoal', 'SUMMARY:Dentista', 'DTSTART:20260917T140000', 'DTEND:20260917T150000'),
);

const planOf = (text: string): IcsImportPlan => readIcs(text, RANGE);
const takeAll = (plan: IcsImportPlan, countsAsStudy = false): Record<string, ImportChoice> =>
  Object.fromEntries(plan.items.map((i) => [i.uid, { include: true, countsAsStudy }]));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  Object.assign(state, emptyPersistedState(), { user: { uid: 'u', displayName: null, email: null }, uiWeek: 1, uiDay: 4 });
  derived.weeks = [];
  clearBlockCache();
  rebuildWeeks(AGORA);
});

describe('loadIcsFile', () => {
  it('recusa arquivo que não é calendário', async () => {
    const r = await loadIcsFile(new Blob(['isto é um txt qualquer']));
    expect(r).toEqual({ ok: false, reason: 'not-ics' });
  });

  it('recusa calendário sem nenhum evento', async () => {
    const r = await loadIcsFile(new Blob([ics()]));
    expect(r).toEqual({ ok: false, reason: 'empty' });
  });

  it('lê um calendário de verdade', async () => {
    const r = await loadIcsFile(new Blob([AULA]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.items).toHaveLength(2);
  });

  it('não traz o passado: o horizonte começa hoje', async () => {
    const antigo = ics(...vevent('UID:v@x', 'SUMMARY:Aula de agosto', 'DTSTART:20260805T100000', 'DTEND:20260805T110000'));
    const r = await loadIcsFile(new Blob([antigo]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.items).toHaveLength(0);
      expect(r.plan.skipped[0].reason).toBe('out-of-range');
    }
  });
});

describe('applyIcsImport', () => {
  it('série vira eventSeries e avulso vira events, com o carimbo de origem', () => {
    const plan = planOf(AULA);
    const result = applyIcsImport(plan, takeAll(plan));
    expect(result).toEqual({ series: 1, events: 1, replaced: 0 });
    expect(state.eventSeries[0].name).toBe('Análise II');
    expect(state.eventSeries[0].externalId).toBe('ics:aula@tum');
    expect(state.events['2026-09-17'][0].externalId).toBe('ics:medico@pessoal');
  });

  it('só entra o que foi marcado', () => {
    const plan = planOf(AULA);
    const choices = takeAll(plan);
    choices['medico@pessoal'].include = false;
    applyIcsImport(plan, choices);
    expect(state.eventSeries).toHaveLength(1);
    expect(state.events['2026-09-17']).toBeUndefined();
  });

  it('o evento importado aparece no plano do dia', () => {
    const plan = planOf(AULA);
    applyIcsImport(plan, takeAll(plan));
    const nomes = blocksForDay('2026-09-15').map((b) => b.name);
    expect(nomes.some((n) => n.includes('Análise II'))).toBe(true);
  });

  it('XP é escolha: sem marcar, o evento só reserva o tempo', () => {
    const plan = planOf(AULA);
    applyIcsImport(plan, takeAll(plan, false));
    const aula = blocksForDay('2026-09-15').find((b) => b.name.includes('Análise II'));
    expect(aula?.type).toBe('intervalo');

    Object.assign(state, emptyPersistedState());
    clearBlockCache();
    applyIcsImport(planOf(AULA), takeAll(planOf(AULA), true));
    const comXp = blocksForDay('2026-09-15').find((b) => b.name.includes('Análise II'));
    expect(comXp?.type).toBe('event');
  });

  it('reimportar o mesmo arquivo substitui em vez de duplicar', () => {
    const plan = planOf(AULA);
    applyIcsImport(plan, takeAll(plan));
    const again = applyIcsImport(planOf(AULA), takeAll(planOf(AULA)));
    expect(again.replaced).toBe(2);
    expect(state.eventSeries).toHaveLength(1);
    expect(state.events['2026-09-17']).toHaveLength(1);
  });

  it('não encosta em evento digitado à mão', () => {
    state.events['2026-09-17'] = [{ name: 'Almoço com a Ana', start: '12:00', end: '13:00', countsAsStudy: false }];
    const plan = planOf(AULA);
    applyIcsImport(plan, takeAll(plan));
    applyIcsImport(planOf(AULA), takeAll(planOf(AULA)));
    const nomes = state.events['2026-09-17'].map((e) => e.name);
    expect(nomes).toContain('Almoço com a Ana');
    expect(nomes.filter((n) => n === 'Dentista')).toHaveLength(1);
  });

  it('importar outro calendário não apaga o primeiro', () => {
    const plan = planOf(AULA);
    applyIcsImport(plan, takeAll(plan));
    const outro = planOf(ics(...vevent('UID:treino@app', 'SUMMARY:Treino', 'DTSTART:20260916T070000', 'DTEND:20260916T080000')));
    const r = applyIcsImport(outro, takeAll(outro));
    expect(r.replaced).toBe(0);
    expect(state.eventSeries).toHaveLength(1);
    expect(state.events['2026-09-16']).toHaveLength(1);
    expect(state.events['2026-09-17']).toHaveLength(1);
  });

  it('nada marcado não mexe em nada', () => {
    const plan = planOf(AULA);
    const nenhum = Object.fromEntries(plan.items.map((i) => [i.uid, { include: false, countsAsStudy: false }]));
    expect(applyIcsImport(plan, nenhum)).toEqual({ series: 0, events: 0, replaced: 0 });
    expect(state.eventSeries).toHaveLength(0);
  });
});

describe('countChosen', () => {
  it('conta compromissos, não linhas: a série vale as ocorrências dela', () => {
    const plan = planOf(AULA);
    const total = countChosen(plan, takeAll(plan));
    const serie = plan.items.find((i) => i.kind === 'series');
    expect(serie && serie.kind === 'series' ? serie.occurrences : 0).toBeGreaterThan(10);
    expect(total).toBe((serie && serie.kind === 'series' ? serie.occurrences : 0) + 1);
  });
});

describe('persistência do carimbo', () => {
  it('externalId sobrevive ao salvar e carregar', () => {
    const plan = planOf(AULA);
    applyIcsImport(plan, takeAll(plan));
    const back = hydrateUserDoc(JSON.parse(JSON.stringify(serializeState(state))));
    expect(back.eventSeries[0].externalId).toBe('ics:aula@tum');
    expect(back.events['2026-09-17'][0].externalId).toBe('ics:medico@pessoal');
  });

  it('documento antigo, sem carimbo nenhum, continua carregando', () => {
    const back = hydrateUserDoc({
      events: { '2026-09-17': [{ name: 'Aula', start: '10:00', end: '11:00' }] },
      eventSeries: [{ id: 's1', name: 'Ginástica', start: '07:00', end: '08:00', weekdays: [1], freq: 'weekly' }],
    });
    expect(back.events['2026-09-17'][0].externalId).toBeUndefined();
    expect(back.eventSeries[0].externalId).toBeUndefined();
  });
});
