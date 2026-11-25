// A única coisa que a casca conta pra página: "você está rodando dentro do app de
// computador". É o que `isNativeApp()` (src/infrastructure/platform.ts) lê — o mesmo
// papel que `window.Capacitor` faz no iPhone. Nenhuma API do Node ou do Electron é
// exposta: a página continua sendo uma página.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('studyPetsDesktop', {
  shell: 'desktop',
  platform: process.platform,
});
