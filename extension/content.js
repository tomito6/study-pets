// Roda na página do Study Pets. Quatro coisas: se anuncia (com a versão — o app
// mostra "extensão encontrada, v0.2.0" em Configurações), repassa o estado que o
// app publica pro service worker, devolve pra página o **ack** com o que a
// extensão de fato aplicou, e pergunta o estado ao carregar (a extensão pode ter
// acabado de ser instalada, ou o navegador reaberto com a aba do app).

const VERSION = (() => {
  try {
    return chrome.runtime.getManifest().version || '1';
  } catch {
    return '1';
  }
})();

document.documentElement.dataset.studyPetsExt = VERSION;

window.addEventListener('study-pets:blocking', (e) => {
  let payload;
  try {
    payload = JSON.parse(e.detail);
  } catch {
    return; // detail que não é JSON: não é nosso
  }
  if (!payload || typeof payload !== 'object') return; // `null`/número é JSON válido, mas não é estado
  chrome.runtime
    .sendMessage({ type: 'blocking', payload })
    .then((ack) => {
      if (!ack || typeof ack !== 'object') return;
      // De volta pra página em JSON: os dois mundos não trocam objetos.
      window.dispatchEvent(new CustomEvent('study-pets:blocking-ack', { detail: JSON.stringify(ack) }));
    })
    .catch(() => {});
});

// O app pode ainda não ter carregado o estado: pergunta mais de uma vez.
const ask = () => window.dispatchEvent(new CustomEvent('study-pets:blocking?'));
ask();
setTimeout(ask, 2000);
setTimeout(ask, 8000);
