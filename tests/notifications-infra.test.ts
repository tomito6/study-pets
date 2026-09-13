// A notificação do fim do bloco tem duas portas, e o celular é o motivo: no Chrome
// do Android `new Notification(...)` lança "Illegal constructor", então lá quem
// notifica é o service worker. Estes testes trocam o navegador por um falso e
// cobram qual das duas portas foi usada em cada situação.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from '../src/infrastructure/notifications/notifications';

const construidas: { title: string; body: unknown }[] = [];
const peloSW: { title: string; body: unknown }[] = [];

class NotificationFalsa {
  static permission: NotificationPermission = 'granted';
  static requestPermission = async (): Promise<NotificationPermission> => 'granted';
  constructor(title: string, options?: NotificationOptions) {
    construidas.push({ title, body: options?.body });
  }
}

/** O Android: o objeto existe (tem `permission`), mas o construtor não. */
class NotificationSemConstrutor extends NotificationFalsa {
  constructor() {
    super('', undefined);
    construidas.pop();
    throw new TypeError('Illegal constructor');
  }
}

function comServiceWorker(registrado: boolean): void {
  const reg = {
    showNotification: (title: string, options?: NotificationOptions) => {
      peloSW.push({ title, body: options?.body });
      return Promise.resolve();
    },
  };
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => Promise.resolve(registrado ? reg : undefined) } });
}

beforeEach(() => {
  construidas.length = 0;
  peloSW.length = 0;
  NotificationFalsa.permission = 'granted';
  vi.stubGlobal('Notification', NotificationFalsa);
  vi.stubGlobal('navigator', undefined);
});

afterEach(() => vi.unstubAllGlobals());

describe('a notificação do fim do bloco', () => {
  it('sem permissão não faz nada, por porta nenhuma', async () => {
    NotificationFalsa.permission = 'denied';
    comServiceWorker(true);
    await notify('Estudo', 'acabou');
    expect(peloSW).toHaveLength(0);
    expect(construidas).toHaveLength(0);
  });

  it('com service worker registrado, é ele quem mostra — é o único caminho que funciona no Android', async () => {
    comServiceWorker(true);
    await notify('Estudo concluído', 'Estudo 3');
    expect(peloSW).toEqual([{ title: 'Estudo concluído', body: 'Estudo 3' }]);
    expect(construidas).toHaveLength(0);
  });

  it('sem service worker registrado (o dev, onde o SW nem existe), cai no construtor', async () => {
    comServiceWorker(false);
    await notify('Estudo concluído', 'Estudo 3');
    expect(construidas).toEqual([{ title: 'Estudo concluído', body: 'Estudo 3' }]);
    expect(peloSW).toHaveLength(0);
  });

  it('num navegador sem a API de service worker, cai no construtor', async () => {
    await notify('Pausa', 'Pausa longa');
    expect(construidas).toEqual([{ title: 'Pausa', body: 'Pausa longa' }]);
  });

  it('e quando o construtor é ilegal e não há SW, o app não quebra — só não notifica', async () => {
    vi.stubGlobal('Notification', NotificationSemConstrutor);
    comServiceWorker(false);
    await expect(notify('Estudo', 'acabou')).resolves.toBeUndefined();
    expect(construidas).toHaveLength(0);
    expect(peloSW).toHaveLength(0);
  });
});
