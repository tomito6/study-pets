// Leitura de calendário no formato iCalendar (.ics) — o que o Google Calendar, o
// Outlook, o Apple Calendar e os sistemas de universidade exportam.
//
// Puro: entra texto, sai um **plano de importação** — o que vira série do app, o
// que vira evento avulso, e o que ficou de fora com o motivo. Quem aplica é
// `application/calendarImport.ts`; quem escolhe é o usuário, na tela de revisão.
//
// Três decisões que valem explicar:
//
// 1. **O horizonte é obrigatório.** Um .ics de semestre tem aula desde agosto;
//    importar o passado mexeria em dias já fechados. Só entra de `from` em diante.
// 2. **Série quando dá, datas quando não dá.** A série do app é `weekdays` +
//    `weekly | biweekly | monthly`, e cobre a maioria esmagadora do que uma grade
//    de aulas usa. O que não cabe (a cada 3 semanas, "terceira quinta do mês",
//    anual) não é perdido nem torto: vira uma lista de datas, expandida aqui.
// 3. **Fuso é resolvido na leitura.** O app é local em todo lugar ("nunca UTC"),
//    então um `DTSTART` em UTC ou com `TZID` vira horário local aqui — senão a
//    aula das 10h em Munique chegaria às 8h.

import { dk, dateFromKey } from './time';
import type { DateKey, RecurrenceFreq, TimeString } from './types';

/** Fim do mundo pra expansão: uma regra com COUNT é expandida até completar a conta. */
const FAR = '9999-12-31';

/** Teto de ocorrências expandidas por evento — um .ics malformado não trava a aba. */
const MAX_OCCURRENCES = 400;

/** Observação sobre um item importado: não impede, mas o usuário merece saber. */
export type IcsNote =
  /** O evento acaba no dia seguinte; foi cortado às 23:59 (o plano é de um dia). */
  | 'crosses-midnight'
  /** A repetição não cabe na série do app e virou uma lista de datas. */
  | 'expanded';

/** Por que um evento do arquivo não virou nada. */
export type IcsSkipReason =
  /** Dia inteiro (sem horário) — bloquearia o dia todo. */
  | 'all-day'
  /** `STATUS:CANCELLED`. */
  | 'cancelled'
  /** Sem `DTSTART` legível. */
  | 'no-start'
  /** Sem `DTEND`/`DURATION`, ou duração zero. */
  | 'no-end'
  /** Existe, mas nenhuma ocorrência cai no horizonte. */
  | 'out-of-range';

export interface IcsSkipped {
  name: string;
  reason: IcsSkipReason;
}

interface IcsItemBase {
  /** `UID` do VEVENT — a identidade que permite reimportar sem duplicar. */
  uid: string;
  name: string;
  start: TimeString;
  end: TimeString;
  notes: IcsNote[];
}

/** Vira uma `RecurringEventSeries`. */
export interface IcsSeriesItem extends IcsItemBase {
  kind: 'series';
  weekdays: number[];
  freq: RecurrenceFreq;
  anchor: DateKey;
  until: DateKey | null;
  exceptions: DateKey[];
  /** Quantas ocorrências caem no horizonte — o que a tela de revisão mostra. */
  occurrences: number;
}

/** Vira um evento avulso por data (um evento único, ou uma repetição expandida). */
export interface IcsDatesItem extends IcsItemBase {
  kind: 'dates';
  dates: DateKey[];
}

export type IcsItem = IcsSeriesItem | IcsDatesItem;

export interface IcsImportPlan {
  /** `X-WR-CALNAME`, quando o arquivo traz. */
  calendarName: string | null;
  items: IcsItem[];
  skipped: IcsSkipped[];
}

export interface IcsRange {
  /** Primeiro dia que pode entrar (normalmente hoje). */
  from: DateKey;
  /** Último dia que pode entrar. */
  to: DateKey;
}

// ---------------------------------------------------------------------------
// Formato: desdobrar linhas, ler propriedades
// ---------------------------------------------------------------------------

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

/**
 * Desdobra as linhas continuadas (RFC 5545: a continuação começa com espaço ou
 * tab). Sem isso, um SUMMARY longo chega picado.
 */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (out.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

/** Separa por `sep` ignorando o que está entre aspas (um TZID pode ter `:` dentro). */
function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quoted = false;
  for (const c of s) {
    if (c === '"') quoted = !quoted;
    else if (c === sep && !quoted) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  out.push(buf);
  return out;
}

function parseLine(line: string): RawProp | null {
  if (!line || !line.trim()) return null;
  let cut = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) {
      cut = i;
      break;
    }
  }
  if (cut < 0) return null;
  const segments = splitOutsideQuotes(line.slice(0, cut), ';');
  const params: Record<string, string> = {};
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    params[seg.slice(0, eq).trim().toUpperCase()] = seg.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return { name: segments[0].trim().toUpperCase(), params, value: line.slice(cut + 1) };
}

const unescapeText = (v: string): string =>
  v.replace(/\\([\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

/** Os VEVENTs de nível 1 — sub-componentes (VALARM) e VTIMEZONE ficam de fora. */
function readCalendar(text: string): { events: RawProp[][]; calendarName: string | null } {
  const events: RawProp[][] = [];
  let calendarName: string | null = null;
  let current: RawProp[] | null = null;
  let nested = 0;
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      if (p.value.trim().toUpperCase() === 'VEVENT' && !current) current = [];
      else if (current) nested++;
      continue;
    }
    if (p.name === 'END') {
      if (p.value.trim().toUpperCase() === 'VEVENT' && current && nested === 0) {
        events.push(current);
        current = null;
      } else if (current && nested > 0) nested--;
      continue;
    }
    if (current && nested === 0) current.push(p);
    else if (!current && p.name === 'X-WR-CALNAME') calendarName = unescapeText(p.value).trim() || null;
  }
  return { events, calendarName };
}

// ---------------------------------------------------------------------------
// Data e hora: tudo chega em horário local
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

interface Stamp {
  key: DateKey;
  time: TimeString;
  ms: number;
}

const stampOf = (ms: number): Stamp => {
  const d = new Date(ms);
  return { key: dk(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ms };
};

/** Deslocamento do fuso `tz` no instante `ms`, em milissegundos. */
function tzOffsetMs(ms: number, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - ms;
}

/**
 * Horário de parede num fuso nomeado → instante. Duas passadas porque o
 * deslocamento depende do instante (horário de verão) e o instante depende do
 * deslocamento.
 */
function zonedToMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number | null {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const guess = wall - tzOffsetMs(wall, tz);
    return wall - tzOffsetMs(guess, tz);
  } catch {
    return null; // fuso que este navegador não conhece: cai pro horário local
  }
}

const DT = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;

type Resolved = { allDay: true; key: DateKey } | { allDay: false; stamp: Stamp };

function resolveDate(p: RawProp): Resolved | null {
  const m = DT.exec(p.value.trim());
  if (!m) return null;
  const [, ys, mos, ds, hs, mis, ss, z] = m;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  if (!hs || p.params.VALUE === 'DATE') return { allDay: true, key: `${ys}-${mos}-${ds}` };
  const h = Number(hs);
  const mi = Number(mis);
  const s = ss ? Number(ss) : 0;
  if (z) return { allDay: false, stamp: stampOf(Date.UTC(y, mo - 1, d, h, mi, s)) };
  const tz = p.params.TZID;
  if (tz) {
    const ms = zonedToMs(y, mo, d, h, mi, s, tz);
    if (ms !== null) return { allDay: false, stamp: stampOf(ms) };
  }
  // Horário flutuante (ou fuso desconhecido): é o relógio local, sem conversão.
  return { allDay: false, stamp: stampOf(new Date(y, mo - 1, d, h, mi, s).getTime()) };
}

/** `PT1H30M`, `P1DT2H` → minutos. */
function durationMins(v: string): number | null {
  const m = /^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, w, d, h, mi, s] = m;
  const mins =
    (w ? Number(w) * 7 * 24 * 60 : 0) +
    (d ? Number(d) * 24 * 60 : 0) +
    (h ? Number(h) * 60 : 0) +
    (mi ? Number(mi) : 0) +
    (s ? Math.floor(Number(s) / 60) : 0);
  return mins > 0 ? mins : null;
}

// ---------------------------------------------------------------------------
// Recorrência
// ---------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Um item de `BYDAY`: dia da semana e, quando tem, a posição no mês ("3TH", "-1FR"). */
interface ByDay {
  day: number;
  pos: number | null;
}

interface Rrule {
  freq: string;
  interval: number;
  byday: number[];
  /** Os mesmos dias, com a posição no mês quando existe. */
  bydays: ByDay[];
  /** `BYDAY` com posição ("3TH") — a série do app não expressa, mas o expansor sabe. */
  positional: boolean;
  bymonthday: number | null;
  count: number | null;
  until: DateKey | null;
}

function parseRrule(p: RawProp): Rrule | null {
  const parts: Record<string, string> = {};
  for (const seg of p.value.split(';')) {
    const eq = seg.indexOf('=');
    if (eq > 0) parts[seg.slice(0, eq).trim().toUpperCase()] = seg.slice(eq + 1).trim();
  }
  if (!parts.FREQ) return null;
  const bydays: ByDay[] = [];
  const byday: number[] = [];
  let positional = false;
  if (parts.BYDAY) {
    for (const raw of parts.BYDAY.split(',')) {
      const token = raw.trim().toUpperCase();
      const day = WEEKDAYS[token.slice(-2)];
      if (day === undefined) continue;
      const prefix = token.slice(0, -2);
      const pos = prefix ? Number(prefix) : null;
      if (pos !== null && Number.isFinite(pos) && pos !== 0) positional = true;
      bydays.push({ day, pos: pos !== null && Number.isFinite(pos) && pos !== 0 ? pos : null });
      if (!byday.includes(day)) byday.push(day);
    }
  }
  let until: DateKey | null = null;
  if (parts.UNTIL) {
    const r = resolveDate({ name: 'UNTIL', params: {}, value: parts.UNTIL });
    if (r) until = r.allDay ? r.key : r.stamp.key;
  }
  const interval = Math.max(1, Number(parts.INTERVAL || 1) || 1);
  const bymonthday = parts.BYMONTHDAY ? Number(parts.BYMONTHDAY.split(',')[0]) : null;
  return {
    freq: parts.FREQ.toUpperCase(),
    interval,
    byday: byday.sort((a, b) => a - b),
    bydays,
    positional,
    bymonthday: Number.isFinite(bymonthday) ? bymonthday : null,
    count: parts.COUNT ? Number(parts.COUNT) || null : null,
    until,
  };
}

const addDays = (key: DateKey, n: number): DateKey => {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + n);
  return dk(d);
};

/**
 * Todas as ocorrências da regra, a partir do primeiro dia, até `limit` (ou até o
 * `COUNT`/`UNTIL` da própria regra). Ordenadas, sem repetição.
 */
function expandRule(startKey: DateKey, rule: Rrule | null, limit: DateKey): DateKey[] {
  if (!rule) return [startKey];
  const stop = rule.until && rule.until < limit ? rule.until : limit;
  const out: DateKey[] = [];
  const seen = new Set<DateKey>();
  const push = (key: DateKey) => {
    if (key < startKey || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  if (rule.freq === 'WEEKLY') {
    const days = rule.byday.length > 0 ? rule.byday : [dateFromKey(startKey).getDay()];
    // A semana da primeira ocorrência é a origem da paridade (como o app faz).
    const weekStart = addDays(startKey, -dateFromKey(startKey).getDay());
    for (let w = 0; out.length < MAX_OCCURRENCES; w += rule.interval) {
      const base = addDays(weekStart, w * 7);
      if (base > stop && addDays(base, 6) > stop) break;
      for (const day of days) {
        const key = addDays(base, day);
        if (key >= startKey && key <= stop) push(key);
      }
      if (rule.count && out.length >= rule.count) break;
    }
  } else if (rule.freq === 'DAILY') {
    for (let i = 0; out.length < MAX_OCCURRENCES; i += rule.interval) {
      const key = addDays(startKey, i);
      if (key > stop) break;
      push(key);
      if (rule.count && out.length >= rule.count) break;
    }
  } else if ((rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') && rule.positional) {
    // "Terceira quinta do mês": a posição manda, não o dia do mês da primeira
    // ocorrência — importar isso como "todo dia 17" cairia em dias errados.
    const first = dateFromKey(startKey);
    const step = rule.freq === 'YEARLY' ? rule.interval * 12 : rule.interval;
    for (let i = 0; out.length < MAX_OCCURRENCES; i += step) {
      const probe = new Date(first.getFullYear(), first.getMonth() + i, 1, 12, 0, 0);
      const daysInMonth = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
      let passedStop = true;
      for (const { day, pos } of rule.bydays) {
        if (pos === null) continue;
        let date: number;
        if (pos > 0) {
          const firstHit = 1 + ((day - probe.getDay() + 7) % 7);
          date = firstHit + (pos - 1) * 7;
        } else {
          const lastDow = new Date(probe.getFullYear(), probe.getMonth(), daysInMonth, 12, 0, 0).getDay();
          const lastHit = daysInMonth - ((lastDow - day + 7) % 7);
          date = lastHit + (pos + 1) * 7;
        }
        if (date < 1 || date > daysInMonth) continue;
        const key = dk(new Date(probe.getFullYear(), probe.getMonth(), date, 12, 0, 0));
        if (key <= stop) passedStop = false;
        if (key >= startKey && key <= stop) push(key);
      }
      if (passedStop && dk(probe) > stop) break;
      if (rule.count && out.length >= rule.count) break;
    }
  } else if (rule.freq === 'MONTHLY' || rule.freq === 'YEARLY') {
    const first = dateFromKey(startKey);
    const day = rule.bymonthday ?? first.getDate();
    const step = rule.freq === 'YEARLY' ? rule.interval * 12 : rule.interval;
    for (let i = 0; out.length < MAX_OCCURRENCES; i += step) {
      const probe = new Date(first.getFullYear(), first.getMonth() + i, 1, 12, 0, 0);
      // Mês curto simplesmente não tem a ocorrência (mesma regra do app pro dia 31).
      const last = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
      if (day <= last) {
        const key = dk(new Date(probe.getFullYear(), probe.getMonth(), day, 12, 0, 0));
        if (key > stop) break;
        push(key);
        if (rule.count && out.length >= rule.count) break;
      } else if (dk(new Date(probe.getFullYear(), probe.getMonth(), last, 12, 0, 0)) > stop) break;
    }
  } else {
    push(startKey);
  }
  const sorted = out.sort();
  return rule.count ? sorted.slice(0, rule.count) : sorted;
}

/** A regra cabe na série do app (`weekdays` + weekly/biweekly/monthly)? */
function asSeriesFreq(rule: Rrule): RecurrenceFreq | null {
  if (rule.freq === 'WEEKLY') {
    if (rule.interval === 1) return 'weekly';
    if (rule.interval === 2) return 'biweekly';
    return null;
  }
  if (rule.freq === 'DAILY') return rule.interval === 1 ? 'weekly' : null;
  if (rule.freq === 'MONTHLY') return rule.interval === 1 && !rule.positional && rule.byday.length === 0 ? 'monthly' : null;
  return null;
}

// ---------------------------------------------------------------------------
// O plano de importação
// ---------------------------------------------------------------------------

interface Parsed {
  uid: string;
  name: string;
  startKey: DateKey;
  start: TimeString;
  end: TimeString;
  crossesMidnight: boolean;
  rule: Rrule | null;
  exdates: DateKey[];
  /** `RECURRENCE-ID`: esta é uma ocorrência **modificada** de outra série. */
  overrideOf: DateKey | null;
}

function parseEvent(props: RawProp[]): Parsed | IcsSkipped | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const name = unescapeText(get('SUMMARY')?.value ?? '').trim() || 'Evento';
  if ((get('STATUS')?.value ?? '').trim().toUpperCase() === 'CANCELLED') return { name, reason: 'cancelled' };

  const dtstart = get('DTSTART');
  const startAt = dtstart ? resolveDate(dtstart) : null;
  if (!startAt) return { name, reason: 'no-start' };
  if (startAt.allDay) return { name, reason: 'all-day' };

  const dtend = get('DTEND');
  const endAt = dtend ? resolveDate(dtend) : null;
  let endMs: number | null = null;
  if (endAt && !endAt.allDay) endMs = endAt.stamp.ms;
  else if (!endAt) {
    const dur = get('DURATION');
    const mins = dur ? durationMins(dur.value) : null;
    if (mins !== null) endMs = startAt.stamp.ms + mins * 60_000;
  }
  if (endMs === null || endMs <= startAt.stamp.ms) return { name, reason: 'no-end' };

  const endStamp = stampOf(endMs);
  const crossesMidnight = endStamp.key > startAt.stamp.key;

  const exdates: DateKey[] = [];
  for (const p of props) {
    if (p.name !== 'EXDATE') continue;
    for (const v of p.value.split(',')) {
      const r = resolveDate({ name: 'EXDATE', params: p.params, value: v });
      if (r) exdates.push(r.allDay ? r.key : r.stamp.key);
    }
  }

  const recur = get('RECURRENCE-ID');
  const recurAt = recur ? resolveDate(recur) : null;

  const rruleProp = get('RRULE');
  return {
    uid: (get('UID')?.value ?? '').trim() || `${name}@${startAt.stamp.key}`,
    name,
    startKey: startAt.stamp.key,
    start: startAt.stamp.time,
    // O plano é de um dia: quem atravessa a meia-noite ocupa até o fim do dia.
    end: crossesMidnight ? '23:59' : endStamp.time,
    crossesMidnight,
    rule: rruleProp ? parseRrule(rruleProp) : null,
    exdates,
    overrideOf: recurAt ? (recurAt.allDay ? recurAt.key : recurAt.stamp.key) : null,
  };
}

const isSkip = (v: Parsed | IcsSkipped | null): v is IcsSkipped => !!v && 'reason' in v;

/**
 * Lê um arquivo .ics e devolve o que dá pra importar, dentro do horizonte.
 *
 * Ocorrências modificadas (`RECURRENCE-ID`) caem no mesmo lugar que o app já usa
 * pra "editar só este dia": exceção na série mãe, mais um avulso naquele dia.
 */
export function readIcs(text: string, range: IcsRange): IcsImportPlan {
  const { events, calendarName } = readCalendar(text);
  const skipped: IcsSkipped[] = [];
  const parsed: Parsed[] = [];
  for (const props of events) {
    const p = parseEvent(props);
    if (!p) continue;
    if (isSkip(p)) skipped.push(p);
    else parsed.push(p);
  }

  // Ocorrências modificadas viram exceção na série de mesmo UID.
  const overridesByUid = new Map<string, DateKey[]>();
  for (const p of parsed) {
    if (!p.overrideOf) continue;
    const list = overridesByUid.get(p.uid) ?? [];
    list.push(p.overrideOf);
    overridesByUid.set(p.uid, list);
  }

  const items: IcsItem[] = [];
  for (const p of parsed) {
    const notes: IcsNote[] = [];
    if (p.crossesMidnight) notes.push('crosses-midnight');

    // Uma ocorrência modificada é sempre um avulso naquele dia.
    if (p.overrideOf) {
      if (p.startKey < range.from || p.startKey > range.to) {
        skipped.push({ name: p.name, reason: 'out-of-range' });
        continue;
      }
      items.push({ kind: 'dates', uid: `${p.uid}#${p.startKey}`, name: p.name, start: p.start, end: p.end, notes, dates: [p.startKey] });
      continue;
    }

    const exceptions = [...p.exdates, ...(overridesByUid.get(p.uid) ?? [])];
    // Regra com fim próprio (UNTIL/COUNT) é expandida até o fim dela, mesmo além do
    // horizonte: é da última ocorrência que sai o `until` da série.
    const hardStop = p.rule ? (p.rule.count ? FAR : p.rule.until && p.rule.until > range.to ? p.rule.until : range.to) : range.to;
    const all = expandRule(p.startKey, p.rule, hardStop).filter((d) => !exceptions.includes(d));
    const inRange = all.filter((d) => d >= range.from && d <= range.to);
    if (inRange.length === 0) {
      skipped.push({ name: p.name, reason: 'out-of-range' });
      continue;
    }

    const freq = p.rule ? asSeriesFreq(p.rule) : null;
    if (p.rule && freq) {
      const weekdays =
        // Mensal filtra pelo dia do mês da âncora, e diária cai todo dia: as duas
        // precisam da semana inteira aberta pra não serem estranguladas pelo weekdays.
        p.rule.freq === 'MONTHLY' || p.rule.freq === 'DAILY'
          ? [0, 1, 2, 3, 4, 5, 6]
          : p.rule.byday.length > 0
            ? p.rule.byday
            : [dateFromKey(p.startKey).getDay()];
      // Repetição sem fim continua sem fim; com fim, o limite é a última ocorrência
      // de verdade — o `UNTIL` cru é um instante e escorregaria um dia ao virar data local.
      const endless = !p.rule.count && !p.rule.until;
      items.push({
        kind: 'series',
        uid: p.uid,
        name: p.name,
        start: p.start,
        end: p.end,
        notes,
        weekdays,
        freq,
        // A âncora é a primeira ocorrência que entra: mantém a paridade da
        // quinzenal e o dia do mês, sem trazer o passado junto.
        anchor: inRange[0],
        until: endless ? null : (all[all.length - 1] ?? null),
        exceptions: exceptions.filter((d) => d >= inRange[0]),
        occurrences: inRange.length,
      });
      continue;
    }

    if (p.rule && inRange.length > 1) notes.push('expanded');
    items.push({ kind: 'dates', uid: p.uid, name: p.name, start: p.start, end: p.end, notes, dates: inRange });
  }

  items.sort((a, b) => {
    const ka = a.kind === 'series' ? a.anchor : a.dates[0];
    const kb = b.kind === 'series' ? b.anchor : b.dates[0];
    return ka === kb ? a.start.localeCompare(b.start) : ka.localeCompare(kb);
  });
  return { calendarName, items, skipped };
}

/** Quantos compromissos o item põe no plano — o número que a revisão soma. */
export const itemOccurrences = (item: IcsItem): number => (item.kind === 'series' ? item.occurrences : item.dates.length);
