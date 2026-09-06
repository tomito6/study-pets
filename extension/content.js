// Roda na página do Study Pets. Três coisas: se anuncia (o app mostra "extensão
// encontrada" em Configurações), repassa o estado do hardcore que o app publica
// pro service worker, e pergunta o estado ao carregar (a extensão pode ter
// acabado de ser instalada, ou o navegador reaberto com a aba do app).

document.documentElement.dataset.studyPetsExt = '1';

window.addEventListener('study-pets:hardcore', (e) => {
  try {
    const payload = JSON.parse(e.detail);
    chrome.runtime.sendMessage({ type: 'hardcore', payload }).catch(() => {});
  } catch {
    // detail que não é JSON: não é nosso
  }
});

// O app pode ainda não ter carregado o estado: pergunta mais de uma vez.
const ask = () => window.dispatchEvent(new CustomEvent('study-pets:hardcore?'));
ask();
setTimeout(ask, 2000);
setTimeout(ask, 8000);
