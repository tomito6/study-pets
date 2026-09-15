// Web Notifications quando um bloco termina. Tudo guardado: sem a API, nada acontece.
//
// **Dois caminhos, e o celular é o motivo.** No Chrome do Android o construtor
// `new Notification(...)` não existe — ele lança "Illegal constructor", e a
// notificação do fim do bloco simplesmente nunca acontecia justamente no aparelho
// que fica no bolso enquanto a pessoa estuda. Lá quem pode notificar é o service
// worker, que no build existe (vite-plugin-pwa) e no dev não. Então: pede ao
// service worker se houver um registrado, e cai no construtor se não houver.
//
// Nada disso é push do servidor (o IDEIAS.md já decidiu não fazer): a notificação
// continua nascendo do app aberto, só que pela porta que o Android atende.

const ICON =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>';

const hasApi = (): boolean => typeof Notification !== 'undefined';

/** Pede permissão só se ainda não foi decidida. */
export function requestNotificationPermission(): void {
  if (hasApi() && Notification.permission === 'default') void Notification.requestPermission();
}

/** O estado da permissão, ou `unsupported` onde a API não existe (e a decisão nem se coloca). */
export type NotificationStatus = NotificationPermission | 'unsupported';

export function notificationPermission(): NotificationStatus {
  return hasApi() ? Notification.permission : 'unsupported';
}

/**
 * Pede a permissão e devolve o que ficou decidido. Sem a API devolve `unsupported`; se o
 * navegador lançar (alguns só aceitam o pedido de dentro de um gesto), o estado atual.
 */
export async function askNotificationPermission(): Promise<NotificationStatus> {
  if (!hasApi()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * O service worker registrado nesta página, se houver.
 *
 * `getRegistration()` e não `ready`: em dev não há service worker nenhum, e a
 * promessa do `ready` **nunca resolve** — a notificação ficaria pendurada pra
 * sempre em vez de cair no construtor.
 */
async function swNotify(title: string, options: NotificationOptions): Promise<boolean> {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw) return false;
  try {
    const reg = await sw.getRegistration();
    if (!reg) return false;
    await reg.showNotification(title, options);
    return true;
  } catch {
    return false; // sem SW ativo, ou o navegador recusou: o construtor tenta em seguida
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (!hasApi() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: ICON };
  if (await swNotify(title, options)) return;
  try {
    new Notification(title, options);
  } catch {
    // alguns navegadores lançam fora de um gesto do usuário, e o Android lança sempre;
    // não é erro do app
  }
}
