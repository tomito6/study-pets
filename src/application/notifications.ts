// O sininho: quem adiciona, quem marca como lido, quem limpa.
//
// A regra (dedup, teto, ordem) está em `domain/notifications.ts`. Aqui é só o
// efeito: mexer no estado, salvar e notificar. Quem EMITE cada notificação são os
// casos de uso donos do acontecimento (`dayEnd`, `pets`, `hardcore`) — ver
// `notifyDayClosed`/`notifyPetProgress` em `application/progressNotices.ts`.

import {
  addNotifications,
  markAllRead,
  unreadCount as unreadOf,
} from '../domain/notifications';
import type { NewNotification, Notification } from '../domain/notifications';
import { notify, state } from '../store/store';
import { scheduleSave } from './save';

/** A lista como a UI lê: mais nova primeiro. */
export const notifications = (): readonly Notification[] => state.notifications ?? [];

/** O número do selo. */
export const unreadNotifications = (): number => unreadOf(notifications());

/**
 * Adiciona o que for novo. Idempotente: o id de cada notificação deriva do
 * acontecimento, então chamar duas vezes com o mesmo lote (boot, sync, re-render)
 * não duplica nada — e nada é salvo nem notificado se nada entrou.
 *
 * Devolve quantas entraram de fato, pra quem chama poder decidir se vale um som.
 */
export function pushNotifications(incoming: readonly NewNotification[], now: Date = new Date()): number {
  if (incoming.length === 0) return 0;
  const antes = notifications();
  const depois = addNotifications(antes, incoming, now.getTime());
  // Contar por id, não por tamanho: com a lista no teto, uma entrada nova empurra
  // a mais velha pra fora e os dois tamanhos ficam iguais.
  const antesIds = new Set(antes.map((n) => n.id));
  const novas = depois.filter((n) => !antesIds.has(n.id)).length;
  if (novas === 0) return 0;
  state.notifications = depois;
  scheduleSave();
  notify();
  return novas;
}

/** Abrir o painel marca tudo como lido — o selo é "tem coisa que você não viu", não uma caixa de tarefas. */
export function markNotificationsRead(): void {
  const antes = notifications();
  const depois = markAllRead(antes);
  if (depois === antes) return;
  state.notifications = depois;
  scheduleSave();
  notify();
}

/** "Limpar" no painel: o diário zera. Não há desfazer — e não há o que perder, é histórico. */
export function clearNotifications(): void {
  if (notifications().length === 0) return;
  state.notifications = [];
  scheduleSave();
  notify();
}
