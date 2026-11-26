// Study Pets — o app de computador. O mesmo app web (o build `dist-native`, sem service
// worker) dentro de uma janela própria. Ver "App de computador (Windows)" no CLAUDE.md
// e plans/2026-11-25_2000_app-de-windows.md.
//
// O que esta casca faz que uma aba não faz: o relógio do bloco não é estrangulado com a
// janela minimizada (`backgroundThrottling: false`), então o som e a notificação do fim
// do bloco saem na hora — sem depender da extensão do navegador.

const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { APP_SCHEME, APP_HOST, APP_ORIGIN, resolveAppPath, isAppUrl, isExternalUrl } = require('./app-paths.cjs');

const APP_ID = 'app.studypets';
const BG = '#f6efe3'; // o creme do Café de casa — o mesmo do capacitor.config.ts

/**
 * Onde mora o build do app web. Instalado: `resources/web`, que o electron-builder copia
 * de `dist-native`. Em desenvolvimento: o `dist-native` da raiz (`SP_DESKTOP_WEB_DIR`
 * troca a pasta — só fora do instalado, e é o que o teste de fumaça usa).
 */
function webRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'web');
  return process.env.SP_DESKTOP_WEB_DIR || path.join(__dirname, '..', 'dist-native');
}

// Esquema padrão e seguro: sem isso a página não tem IndexedDB (o login do Firebase e o
// cache offline do Firestore moram lá), nem fetch, nem Web Audio liberado. Tem que ser
// declarado antes de o app ficar pronto.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// Uma janela só: abrir o atalho de novo traz a que já existe, em vez de um segundo app
// escrevendo no mesmo documento.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
}

function start() {
  // No Windows a notificação precisa de um id de app pra aparecer com o nome certo.
  app.setAppUserModelId(APP_ID);

  const root = webRoot();
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    dialog.showErrorBox(
      'Study Pets',
      `Não achei o app em:\n${root}\n\nRode "npm run build:native" na raiz do projeto e abra de novo.`,
    );
    app.quit();
    return;
  }

  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
    const file = resolveAppPath(root, url.pathname);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  // Permissões (notificação, tela ligada no foco) só pra página do próprio app.
  const fromApp = (wc) => !!wc && isAppUrl(wc.getURL());
  session.defaultSession.setPermissionRequestHandler((wc, _permission, callback) => callback(fromApp(wc)));

  // Sem a barra de menu do Electron no app instalado. No Mac o menu fica: é ele que dá
  // copiar/colar. Em desenvolvimento também fica (recarregar, DevTools).
  if (app.isPackaged && process.platform !== 'darwin') Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: BG,
    title: 'Study Pets',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // O motivo de existir: com a janela minimizada ou atrás de outra, o setInterval do
      // timer continua de segundo em segundo, e o fim do bloco toca e notifica na hora.
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  const wc = win.webContents;

  // Nada além do próprio app carrega nesta janela. Link pra fora (os documentos legais,
  // que no app apontam pro site publicado) abre no navegador do sistema.
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (isExternalUrl(url)) void shell.openExternal(url);
  });

  // O modo hardcore arma um `beforeunload` (infrastructure/unloadGuard.ts). Num navegador
  // isso vira a pergunta "certeza que quer sair?"; no Electron, sem este ouvinte, a janela
  // simplesmente NÃO FECHA, calada. Aqui a pergunta é feita — e sair continua custando o
  // que o app combinou (o abandono é cobrado na próxima abertura).
  wc.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Continuar estudando', 'Sair mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      title: 'Study Pets',
      message: 'Você está no meio de um estudo no modo hardcore.',
      detail: 'Sair agora conta como desistir do bloco.',
    });
    if (choice === 1) event.preventDefault(); // preventDefault aqui = deixar a página sair
  });

  void win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
