// A tela do pet: lê o estado guardado, anima o sprite (frames vindos do próprio
// app; se não carregam, o emoji entra), conta o que falta do bloco e leva de
// volta pro app. Tom adulto, sem bronca: o pet só está esperando.

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function showPet(pet) {
  const img = $('pet-sprite');
  const emoji = $('pet-emoji');
  if (!pet) {
    emoji.textContent = '📖';
    emoji.hidden = false;
    return;
  }
  const frames = Array.isArray(pet.sprites) ? pet.sprites : [];
  if (frames.length === 0) {
    emoji.textContent = pet.emoji || '🐾';
    emoji.hidden = false;
    return;
  }
  let i = 0;
  img.alt = pet.name || pet.form || '';
  img.src = frames[0];
  img.hidden = false;
  img.addEventListener('error', () => {
    img.hidden = true;
    emoji.textContent = pet.emoji || '🐾';
    emoji.hidden = false;
  }, { once: true });
  setInterval(() => {
    i = (i + 1) % frames.length;
    img.src = frames[i];
  }, 250);
}

async function main() {
  const from = new URLSearchParams(location.search).get('from');
  const { hardcore } = await chrome.storage.local.get('hardcore');
  const back = $('back');
  const appUrl = (hardcore && hardcore.appUrl) || 'https://plano-estudos-one.vercel.app';
  back.href = appUrl;

  if (!hardcore || !hardcore.active) {
    $('title').textContent = 'Nada bloqueado agora';
    $('line').textContent = 'Nenhum estudo hardcore rodando. Se você chegou aqui, recarregue a página que queria.';
    $('countdown').hidden = true;
    $('block').hidden = true;
    showPet(null);
    return;
  }

  const pet = hardcore.pet;
  const petName = pet ? pet.name : null;
  showPet(pet);
  $('title').textContent = petName ? `${petName} está te esperando` : 'Você está em foco';
  $('line').textContent = petName
    ? `Vocês dois combinaram este bloco. Volta lá que ${petName} não sai do lugar.`
    : 'Você combinou este bloco com você mesmo. O site fica pra depois.';
  $('block').textContent = hardcore.block ? `${hardcore.block.name} · até ${hardcore.block.endTime}` : '';
  if (from) {
    $('from').textContent = `${from} fica pra depois.`;
    $('from').hidden = false;
  }

  const tick = () => {
    const left = Math.max(0, Math.ceil((hardcore.until - Date.now()) / 1000));
    const el = $('countdown');
    if (left <= 0) {
      el.textContent = 'Acabou — pode voltar 🎉';
      el.classList.add('done');
      $('line').textContent = 'O bloco terminou. O site já abre de novo; é só recarregar.';
      return;
    }
    el.textContent = fmt(left);
    setTimeout(tick, 1000 - (Date.now() % 1000));
  };
  tick();
}

main().catch(() => {
  $('title').textContent = 'Em foco';
  showPet(null);
});
