// As notificações do sininho: o que aconteceu enquanto você não estava olhando.
//
// Regra pura, sem DOM, sem relógio implícito. Três decisões moram aqui:
//
// - **O id É a chave de dedup.** Ele deriva do acontecimento (`nivel:4`,
//   `pet-nivel:dog:5`, `dia:2026-09-11`), nunca do relógio — então gerar a mesma
//   notificação duas vezes (no boot, num re-render, depois de um sync) não cria
//   duas linhas. `addNotifications` é idempotente por construção.
// - **O texto NÃO mora aqui.** A notificação guarda os números (`data`), e
//   `strings.notifications` monta a frase. Uma linha lida em novembro continua
//   fazendo sentido depois de o texto mudar em dezembro, e um dia isto vira
//   inglês sem migração.
// - **A lista tem teto.** `MAX` linhas, mais nova primeiro. É um diário do
//   progresso recente, não um log eterno dentro do documento do Firestore.

import type { DateKey } from './types';

/** Quantas linhas o painel guarda. Passou disso, a mais velha cai. */
export const MAX_NOTIFICATIONS = 40;

export type NotifKind =
  /** Você subiu de nível (só quando o dia fecha — XP de hoje ainda é pendente). */
  | 'nivel'
  /** Um pet subiu de nível. */
  | 'pet-nivel'
  /** Um pet chegou no nível de uma evolução que estava trancada. */
  | 'pet-evolucao'
  /** O dia entrou na conta: o ganho que ele deixou. */
  | 'dia'
  /** Marco de sequência (os degraus de DAILY_BONUS_TIERS). */
  | 'sequencia'
  /** Marco de horas estudadas no total (10, 25, 50, 100…). */
  | 'horas'
  /** O modo hardcore cobrou um abandono (o app fechou no meio do estudo). */
  | 'abandono';

/**
 * Os números e nomes que o texto usa. Tudo opcional: cada `kind` lê os campos
 * que precisa, e um campo que falte vira texto sem o número — nunca um crash.
 */
export interface NotifData {
  /** Nível, contagem de dias, quantidade — depende do kind. */
  n?: number;
  /** Nome do nível, do bloco, ou do pet — o "assunto" da linha. */
  nome?: string;
  /** Nome do pet, quando a linha já usa `nome` pra outra coisa (o bloco abandonado). */
  pet?: string;
  xp?: number;
  /** XP que saiu do pet (só no abandono do modo hardcore). */
  petXp?: number;
  coins?: number;
  /** Minutos de estudo do dia. */
  mins?: number;
  /** O dia bateu o melhor dia até então — uma marca na linha do dia, não uma linha própria. */
  recorde?: boolean;
  /** O dia a que o acontecimento se refere. */
  dia?: DateKey;
}

export interface Notification {
  /** Id e chave de dedup ao mesmo tempo. Deriva do acontecimento, nunca do relógio. */
  id: string;
  kind: NotifKind;
  /** ms de quando entrou na lista. */
  at: number;
  read: boolean;
  data: NotifData;
}

/** Uma notificação antes de entrar na lista: sem `at` (quem adiciona carimba) e sem `read`. */
export interface NewNotification {
  id: string;
  kind: NotifKind;
  data?: NotifData;
}

/** Todos os tipos. Um teste varre esta lista contra `strings.notifications`: kind
 *  sem texto renderizaria uma linha vazia, e o build passaria. */
export const NOTIF_KINDS: readonly NotifKind[] = [
  'nivel', 'pet-nivel', 'pet-evolucao', 'dia', 'sequencia', 'horas', 'abandono',
];

const isKind = (v: unknown): v is NotifKind => typeof v === 'string' && NOTIF_KINDS.includes(v as NotifKind);

/**
 * Adiciona as novas e devolve a lista pronta: mais nova primeiro, sem duplicata,
 * no teto. **A que já existe vence** — o `read` e o `at` originais ficam, senão
 * abrir o app de novo faria a linha de ontem voltar a brilhar como não lida.
 */
export function addNotifications(
  list: readonly Notification[],
  incoming: readonly NewNotification[],
  at: number,
  cap: number = MAX_NOTIFICATIONS,
): Notification[] {
  if (incoming.length === 0) return list.slice(0, cap);
  const seen = new Set(list.map((n) => n.id));
  const novas: Notification[] = [];
  for (const nova of incoming) {
    if (!nova.id || seen.has(nova.id)) continue;
    seen.add(nova.id);
    novas.push({ id: nova.id, kind: nova.kind, at, read: false, data: nova.data ?? {} });
  }
  if (novas.length === 0) return list.slice(0, cap);
  // As novas entram na ordem em que foram emitidas (a primeira emitida é a mais
  // antiga), então a lista continua ordenada sem precisar reordenar tudo.
  return [...novas.reverse(), ...list].slice(0, cap);
}

/** Quantas ainda não foram lidas. É o número do selo no sininho. */
export const unreadCount = (list: readonly Notification[]): number => list.reduce((n, x) => n + (x.read ? 0 : 1), 0);

export const hasUnread = (list: readonly Notification[]): boolean => list.some((n) => !n.read);

/** Marca tudo como lido. Devolve a mesma lista se nada mudaria (o chamador não notifica à toa). */
export function markAllRead(list: readonly Notification[]): Notification[] {
  if (!list.some((n) => !n.read)) return list as Notification[];
  return list.map((n) => (n.read ? n : { ...n, read: true }));
}

/** Documento cru → lista. Tolera campo ausente, tipo errado e id repetido. */
export function normalizeNotifications(raw: unknown, cap: number = MAX_NOTIFICATIONS): Notification[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Notification[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const n = item as Record<string, unknown>;
    const id = typeof n.id === 'string' ? n.id : '';
    if (!id || seen.has(id) || !isKind(n.kind)) continue;
    seen.add(id);
    const rawData = n.data && typeof n.data === 'object' && !Array.isArray(n.data) ? (n.data as Record<string, unknown>) : {};
    const data: NotifData = {};
    if (typeof rawData.n === 'number' && Number.isFinite(rawData.n)) data.n = rawData.n;
    if (typeof rawData.nome === 'string' && rawData.nome) data.nome = rawData.nome;
    if (typeof rawData.pet === 'string' && rawData.pet) data.pet = rawData.pet;
    if (typeof rawData.xp === 'number' && Number.isFinite(rawData.xp)) data.xp = rawData.xp;
    if (typeof rawData.petXp === 'number' && Number.isFinite(rawData.petXp)) data.petXp = rawData.petXp;
    if (typeof rawData.coins === 'number' && Number.isFinite(rawData.coins)) data.coins = rawData.coins;
    if (typeof rawData.mins === 'number' && Number.isFinite(rawData.mins)) data.mins = rawData.mins;
    if (rawData.recorde === true) data.recorde = true;
    if (typeof rawData.dia === 'string' && rawData.dia) data.dia = rawData.dia;
    out.push({
      id,
      kind: n.kind,
      at: typeof n.at === 'number' && Number.isFinite(n.at) ? n.at : 0,
      read: n.read === true,
      data,
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, cap);
}

/** Quanto tempo faz, em pedaços. Quem escreve a frase é `strings.notifications`. */
export type Age =
  | { unit: 'agora' }
  | { unit: 'min'; n: number }
  | { unit: 'h'; n: number }
  | { unit: 'ontem' }
  | { unit: 'd'; n: number };

const MIN = 60_000;
const HORA = 60 * MIN;

/** `at` no passado; um `at` no futuro (relógio do outro dispositivo adiantado) lê como "agora". */
export function ageOf(at: number, now: number): Age {
  const ms = now - at;
  if (ms < MIN) return { unit: 'agora' };
  if (ms < HORA) return { unit: 'min', n: Math.floor(ms / MIN) };
  if (ms < 24 * HORA) return { unit: 'h', n: Math.floor(ms / HORA) };
  const d = Math.floor(ms / (24 * HORA));
  return d === 1 ? { unit: 'ontem' } : { unit: 'd', n: d };
}
