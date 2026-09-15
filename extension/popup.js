// O popup do ícone: "Nada bloqueado agora" ou "Bloqueando até 02:55" com a lista
// e o link pro app. É a resposta rápida pro "será que está funcionando?".

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** O alarme do fim do bloco: "⏰ Avisa às 10:25 · Estudo 3", se há um armado. */
function showTimer(timer) {
  const live = timer && timer.running === true && typeof timer.endsAt === 'number' && timer.endsAt > Date.now();
  if (!live) return;
  $('timer').textContent = `⏰ Avisa às ${hhmm(timer.endsAt)}` + (timer.body ? ` · ${timer.body}` : '');
  $('timer').hidden = false;
}

async function main() {
  const { blocking, timer } = await chrome.storage.local.get(['blocking', 'timer']);
  showTimer(timer);
  if (!blocking && timer && timer.appUrl) $('open').href = timer.appUrl;
  const live = blocking && blocking.active && typeof blocking.until === 'number' && blocking.until > Date.now();
  if (blocking && blocking.appUrl) $('open').href = blocking.appUrl;
  if (!live) {
    $('status').textContent = 'Nada bloqueado agora';
    return;
  }
  const sites = blocking.sites || [];
  const whitelist = blocking.mode === 'whitelist';
  $('status').classList.add('on');
  $('status').textContent = blocking.test
    ? 'Teste em andamento'
    : whitelist
      ? `Só ${sites.length} ${sites.length === 1 ? 'site liberado' : 'sites liberados'}`
      : `Bloqueando ${sites.length} ${sites.length === 1 ? 'site' : 'sites'}`;
  $('until').textContent = `até ${hhmm(blocking.until)}` + (blocking.block ? ` · ${blocking.block.name}` : '');
  $('until').hidden = false;
  if (sites.length > 0) {
    $('sites').textContent = sites.join(', ');
    $('sites').hidden = false;
  }
}

main().catch(() => {
  $('status').textContent = 'Nada bloqueado agora';
});
