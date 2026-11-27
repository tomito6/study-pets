// A etiqueta do SITE DE TESTE (a prévia publicada de cada PR — ver "O site de teste" no
// CLAUDE.md). DOM direto, como o toast: fica fora do `#app`, que acima de 1100px é
// escalado e onde `position:fixed` não é a janela.
//
// Existe porque ali a conta de mentira fica guardada no navegador: sem uma marca que não
// some, o site de teste é igual ao app de verdade, e alguém estudaria um dia inteiro num
// endereço que não é a conta dele. `pointer-events:none` — ela nunca rouba um toque.

import { strings } from './strings';

export function markTestSite(): void {
  if (typeof document === 'undefined') return;
  document.title = strings.testSite.title;
  if (document.getElementById('test-site-mark')) return;
  const mark = document.createElement('div');
  mark.id = 'test-site-mark';
  mark.textContent = strings.testSite.mark;
  // Uma aba colada no topo, no meio: é o único canto que nenhuma tela usa. Embaixo ficam o
  // toast, o indicador de save, a engrenagem do celular e a barra "Padrão / Salvar" das
  // Configurações — a etiqueta ali ficava em cima do botão.
  mark.style.cssText =
    'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:400;pointer-events:none;background:var(--bg2);border:1px dashed var(--border);border-top:0;border-radius:0 0 8px 8px;padding:0 8px 1px;font-size:10px;line-height:1.3;color:var(--muted);white-space:nowrap;';
  document.body.appendChild(mark);
}
