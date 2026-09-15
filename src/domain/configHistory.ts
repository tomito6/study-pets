// As versões anteriores do que o gerador lê da config, e o último dia em que cada uma
// valeu. É o que faz mudar o ritmo do pomodoro em dezembro não mexer em setembro.
//
// Nada de plano é salvo: `computeStats` regenera cada dia a partir da config, dos eventos
// e das pausas, toda vez. Enquanto a config era uma só, trocar 25·5·20 por 50·10·20
// reescrevia setembro inteiro — a chave do check é o horário, e um estudo que passa a
// começar às 09:50 em vez de 09:25 deixa o check das 09:25 órfão. O XP evaporava em
// silêncio, e a sequência quebrava sozinha, que é o que o app promete não fazer. O modo
// ao vivo já tinha achado metade da resposta: o ritmo de uma corrida mora na JANELA
// (`StudyWindow.live`), congelado no fato. Isto é a outra metade, pra rotina: a config
// que deixou de valer fica guardada com o último dia em que valeu, e cada dia é gerado
// pela versão que valia nele.
//
// A régua de "a partir de quando" é o dia de hoje: se hoje ainda não tem fato nenhum
// (check, encerramento, pausa registrada, corrida, bloco no timer), a mudança vale de hoje;
// se tem, hoje fica como está e a mudança vale de amanhã. Ontem pra trás nunca se mexe.
//
// Puro. Quem sabe se hoje "já tem fato" é a aplicação — aqui isso chega como booleano.

import { deriveStartEnd } from './settings';
import { dateFromKey, dk } from './time';
import type { DateKey, LiveRhythm, StudyWindow, UserConfig } from './types';

/** O que o gerador lê da config — a parte que a história guarda. */
export type GeneratorConfig = Pick<UserConfig, 'studyWindows' | 'pomo' | 'shortBreak' | 'longBreak'>;

export interface ConfigSnapshot extends GeneratorConfig {
  /** O ÚLTIMO dia (inclusive) em que esta versão valeu. */
  until: DateKey;
}

/** Ordenada por `until` crescente, `until` único. Vazia = a config atual sempre valeu. */
export type ConfigHistory = ConfigSnapshot[];

export const rhythmOf = (cfg: Pick<UserConfig, 'pomo' | 'shortBreak' | 'longBreak'>): LiveRhythm => ({
  pomo: cfg.pomo,
  shortBreak: cfg.shortBreak,
  longBreak: cfg.longBreak,
});

const copyWindow = (w: StudyWindow): StudyWindow => (w.live ? { start: w.start, end: w.end, live: { ...w.live } } : { start: w.start, end: w.end });

export const generatorPart = (cfg: GeneratorConfig): GeneratorConfig => ({
  studyWindows: cfg.studyWindows.map(copyWindow),
  pomo: cfg.pomo,
  shortBreak: cfg.shortBreak,
  longBreak: cfg.longBreak,
});

const sameRhythm = (a: LiveRhythm | undefined, b: LiveRhythm | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.pomo === b.pomo && a.shortBreak === b.shortBreak && a.longBreak === b.longBreak);

const sameWindows = (a: StudyWindow[], b: StudyWindow[]): boolean =>
  a.length === b.length && a.every((w, i) => w.start === b[i]!.start && w.end === b[i]!.end && sameRhythm(w.live, b[i]!.live));

/** As duas configs geram os mesmos planos? (Só o que o gerador lê — meta, período, hardcore não entram.) */
export const sameGeneratorConfig = (a: GeneratorConfig, b: GeneratorConfig): boolean =>
  a.pomo === b.pomo && a.shortBreak === b.shortBreak && a.longBreak === b.longBreak && sameWindows(a.studyWindows, b.studyWindows);

/** A config que valia em `dateKey`: a versão mais antiga cujo `until` ainda cobre o dia; senão a atual. */
export function configAt(cfg: UserConfig, history: ConfigHistory, dateKey: DateKey): UserConfig {
  for (const snap of history) {
    if (snap.until >= dateKey) {
      return {
        ...cfg,
        studyWindows: snap.studyWindows,
        pomo: snap.pomo,
        shortBreak: snap.shortBreak,
        longBreak: snap.longBreak,
        ...deriveStartEnd(snap.studyWindows),
      };
    }
  }
  return cfg;
}

const shiftDay = (key: DateKey, days: number): DateKey => {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + days);
  return dk(d);
};

export interface ConfigChangeInput {
  today: DateKey;
  /** Hoje já tem algo que o plano não pode mais mexer: check, encerramento, pausa registrada, corrida, bloco no timer. */
  todayHasFacts: boolean;
  /** Antes do início da conta nenhum dia conta — não há o que guardar pra lá. */
  periodStart: DateKey | null;
}

export interface ConfigChange {
  history: ConfigHistory;
  /** O primeiro dia gerado pela config nova. */
  appliesFrom: DateKey;
}

/**
 * A config vai mudar de `oldCfg` pra `newCfg`: o que a história passa a ser, e a partir
 * de quando a nova vale. `null` quando a mudança não toca o gerador (meta, período,
 * hardcore…) — nada a guardar, nada a avisar.
 *
 * Um `until` que já existe **não é substituído**: a versão guardada é a que de fato
 * gerou aqueles dias. Mudar duas vezes no mesmo dia, com hoje já marcado, guarda a
 * config da manhã (a que os checks de hoje batem) e joga fora a do meio, que nunca
 * chegou a valer pra dia nenhum.
 */
export function recordConfigChange(
  history: ConfigHistory,
  oldCfg: GeneratorConfig,
  newCfg: GeneratorConfig,
  input: ConfigChangeInput,
): ConfigChange | null {
  if (sameGeneratorConfig(oldCfg, newCfg)) return null;
  const until = input.todayHasFacts ? input.today : shiftDay(input.today, -1);
  const appliesFrom = shiftDay(until, 1);
  if (input.periodStart && until < input.periodStart) return { history, appliesFrom };
  if (history.some((s) => s.until === until)) return { history, appliesFrom };
  const snap: ConfigSnapshot = { until, ...generatorPart(oldCfg) };
  return { history: [...history, snap].sort((a, b) => (a.until < b.until ? -1 : 1)), appliesFrom };
}

// ---------------------------------------------------------------- leitura do documento

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isDay = (v: unknown): v is DateKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const positive = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Janelas cruas → só as com start/end de texto; o ritmo de corrida (`live`) só se os três
 * números são positivos. Reconstruir a janela como `{start, end}` e pronto jogaria o
 * `live` fora EM SILÊNCIO: o dia voltaria como faixa de rotina e o gerador reescreveria
 * as bordas dele. Serve às janelas do dia e às da história — a mesma leitura nos dois.
 */
export function normalizeStudyWindows(raw: unknown): StudyWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: StudyWindow[] = [];
  for (const w of raw) {
    if (!isObj(w) || typeof w.start !== 'string' || typeof w.end !== 'string') continue;
    const janela: StudyWindow = { start: w.start, end: w.end };
    const r = w.live;
    if (isObj(r) && positive(r.pomo) && positive(r.shortBreak) && positive(r.longBreak)) {
      janela.live = { pomo: positive(r.pomo), shortBreak: positive(r.shortBreak), longBreak: positive(r.longBreak) };
    }
    out.push(janela);
  }
  return out;
}

/** Campo cru → a história: só entradas com `until` de data e ritmo positivo, em ordem, sem `until` repetido (a primeira vence). */
export function normalizeConfigHistory(raw: unknown): ConfigHistory {
  if (!Array.isArray(raw)) return [];
  const out: ConfigHistory = [];
  for (const r of raw) {
    if (!isObj(r) || !isDay(r.until)) continue;
    const pomo = positive(r.pomo);
    const shortBreak = positive(r.shortBreak);
    const longBreak = positive(r.longBreak);
    if (!pomo || !shortBreak || !longBreak) continue;
    if (out.some((s) => s.until === r.until)) continue;
    out.push({ until: r.until, studyWindows: normalizeStudyWindows(r.studyWindows), pomo, shortBreak, longBreak });
  }
  return out.sort((a, b) => (a.until < b.until ? -1 : 1));
}
