// Web Notifications quando um bloco termina. Tudo guardado: sem a API, nada acontece.

const ICON =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📚</text></svg>';

const hasApi = (): boolean => typeof Notification !== 'undefined';

/** Pede permissão só se ainda não foi decidida. */
export function requestNotificationPermission(): void {
  if (hasApi() && Notification.permission === 'default') void Notification.requestPermission();
}

export function notify(title: string, body: string): void {
  if (!hasApi() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: ICON });
  } catch {
    // alguns navegadores lançam fora de um gesto do usuário; não é erro do app
  }
}
