// A etiqueta do SITE DE TESTE (a prévia publicada de cada PR — ver "O site de teste" no
// CLAUDE.md). DOM direto, como o toast: fica fora do `#app`, que acima de 1100px é
// escalado e onde `position:fixed` não é a janela.
//
// Existe porque ali a conta de mentira fica guardada no navegador: sem uma marca que não
// some, o site de teste é igual ao app de verdade, e alguém estudaria um dia inteiro num
// endereço que não é a conta dele.
//
// E é o BOTÃO que troca a conta: o site abre no personagem pronto, e tocar na etiqueta
// oferece recomeçar nele ou como conta nova — o caminho pra quando o que se quer testar
// é o onboarding e o tutorial. As duas opções apagam a conta de teste, e só ela.

import { strings } from './strings';

export interface TestSiteActions {
  /** Recomeça no personagem pronto. */
  onReady: () => void;
  /** Recomeça como conta nova. */
  onFresh: () => void;
}

const CAIXA =
  'background:var(--bg2);border:1px solid var(--border);color:var(--text);font-family:inherit;';

export function markTestSite(actions: TestSiteActions): void {
  if (typeof document === 'undefined') return;
  const t = strings.testSite;
  document.title = t.title;
  if (document.getElementById('test-site-mark')) return;

  // Uma aba colada no topo, no meio: é o único canto que nenhuma tela usa. Embaixo ficam o
  // toast, o indicador de save, a engrenagem do celular e a barra "Padrão / Salvar" das
  // Configurações — a etiqueta ali ficava em cima do botão.
  const wrap = document.createElement('div');
  wrap.id = 'test-site';
  wrap.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:400;text-align:center;';

  const mark = document.createElement('button');
  mark.type = 'button';
  mark.id = 'test-site-mark';
  mark.textContent = `${t.mark} ▾`;
  mark.setAttribute('aria-label', t.menuLabel);
  mark.setAttribute('aria-expanded', 'false');
  mark.style.cssText =
    'display:block;margin:0 auto;cursor:pointer;background:var(--bg2);border:1px dashed var(--border);border-top:0;border-radius:0 0 8px 8px;padding:0 8px 1px;font-family:inherit;font-size:10px;line-height:1.3;color:var(--muted);white-space:nowrap;';

  const menu = document.createElement('div');
  menu.id = 'test-site-menu';
  menu.hidden = true;
  menu.style.cssText = `${CAIXA}margin-top:6px;border-radius:var(--radius-sm);padding:6px;width:min(280px, calc(100vw - 32px));text-align:left;`;

  const opcao = (id: string, titulo: string, sub: string, run: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.style.cssText =
      'display:block;width:100%;cursor:pointer;background:none;border:0;border-radius:6px;padding:8px 10px;text-align:left;font-family:inherit;color:var(--text);';
    const a = document.createElement('div');
    a.textContent = titulo;
    a.style.cssText = 'font-size:13px;font-weight:600;';
    const s = document.createElement('div');
    s.textContent = sub;
    s.style.cssText = 'font-size:11px;line-height:1.4;color:var(--muted);';
    b.append(a, s);
    b.addEventListener('click', run);
    return b;
  };
  menu.append(
    opcao('test-site-ready', t.ready, t.readySub, actions.onReady),
    opcao('test-site-fresh', t.fresh, t.freshSub, actions.onFresh),
  );

  let aberto = false;
  const abrir = (sim: boolean): void => {
    aberto = sim;
    menu.hidden = !sim;
    mark.setAttribute('aria-expanded', String(sim));
  };
  mark.addEventListener('click', () => abrir(!aberto));
  // Clicar fora fecha, Esc fecha — o que todo popover do app faz.
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) abrir(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') abrir(false);
  });

  wrap.append(mark, menu);
  document.body.appendChild(wrap);
}
