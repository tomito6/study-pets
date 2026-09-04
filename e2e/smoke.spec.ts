// Smoke test: os fluxos essenciais do Study Pets, de ponta a ponta, no modo teste.
//
// Cada teste abre uma aba nova (conta nova, onboarding aparece) e fixa o relógio
// no horário de que precisa — porque o plano do dia e o timer dependem de "agora".
// 2026-09-02 é uma quarta-feira.

import { expect, test, type Page } from '@playwright/test';

const DIA = '2026-09-02';

/**
 * Abre o app com o relógio fixo, espera o modo teste logar e passa pelo onboarding:
 * o gato como pet inicial (com o nome sugerido) e o período padrão.
 */
async function abrirApp(page: Page, hora = '17:30') {
  await page.clock.setFixedTime(new Date(`${DIA}T${hora}:00`));
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#onboarding-panel')).toBeVisible();
  await page.locator('#starter-grid .starter-card[data-species="cat"]').click();
  await expect(page.locator('#starter-name')).not.toHaveValue('');
  await page.locator('#onb-next').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('#onboarding-panel')).toBeHidden();
}

/**
 * Coleta erros de console e exceções da página — o teste falha se aparecer qualquer um.
 * Exceção consciente: 404 de sprite de pet em `idle/pets/` — pets cadastrados sem
 * sprite caem no emoji por design (ver CLAUDE.md, "Sistema de pets").
 */
function vigiarErros(page: Page): string[] {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    try {
      if (m.type() !== 'error') return;
      const url = m.location()?.url ?? '';
      if (/\/idle\/pets\//.test(url)) return;
      erros.push(`console.error: ${m.text()}${url ? ` @ ${url}` : ''}`);
    } catch {
      // mensagem chegou no meio de uma navegação; não é erro do app
    }
  });
  return erros;
}

const checksDeEstudo = (page: Page) => page.locator('.block-row:not(.pausa-row) .check');

test.describe('Study Pets — smoke', () => {
  let erros: string[];

  test.beforeEach(async ({ page }) => {
    erros = vigiarErros(page);
  });

  test.afterEach(() => {
    expect(erros, 'sem erros de console nem exceções na página').toEqual([]);
  });

  test('1. abre o app e entra em modo teste sem login', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${DIA}T17:30:00`));
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#login-screen')).toBeHidden();
    await expect(page.locator('#onboarding-panel')).toBeVisible();
    await expect(page.locator('#starter-grid .starter-card')).toHaveCount(5);
    await expect(page.locator('#today-label')).toContainText('quarta-feira');
  });

  test('16. o pet inicial: escolhe a cobra, dá nome, e ela já aparece no perfil de graça', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${DIA}T17:30:00`));
    await page.goto('/');
    await expect(page.locator('#onboarding-panel')).toBeVisible();
    await expect(page.locator('.starter-notice')).toContainText('todos os outros');
    await expect(page.locator('#onb-next')).toBeDisabled(); // sem escolher, não passa

    await page.locator('#starter-grid .starter-card[data-species="snake"]').click();
    await expect(page.locator('#starter-grid .starter-card[data-species="snake"]')).toHaveClass(/selected/);
    await page.locator('#starter-name').fill('Sibila');
    await page.locator('#onb-next').click();
    await page.getByRole('button', { name: 'Começar' }).click();
    await expect(page.locator('#onboarding-panel')).toBeHidden();

    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#ap-name')).toHaveText('Sibila');
    await expect(page.locator('#ap-species')).toHaveText('Cobra');
    await expect(page.locator('#pet-sprite')).toHaveAttribute('src', /idle\/pets\/snake\//);
    await expect(page.locator('#char-coins')).toHaveText('0'); // de graça
    await expect(page.locator('#my-pets-count')).toContainText('1/5');
  });

  test('2. sair volta pra tela de login, e entrar volta pro app', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await page.locator('.ls-google-btn').click();
    await expect(page.locator('#app')).toBeVisible();
  });

  test('3. configurar rotina muda o plano do dia', async ({ page }) => {
    await abrirApp(page);
    await expect(page.locator('.block-row').first()).toContainText('09:00–09:25');

    await page.getByRole('button', { name: 'Configurações' }).click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await page.locator('#cfg-pomo').fill('50');
    await page.locator('#settings-panel').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('#settings-panel')).toBeHidden();

    await expect(page.locator('.block-row').first()).toContainText('09:00–09:50');
  });

  test('25. janelas do dia: "Começar agora" muda o primeiro bloco de hoje, "Dia livre" esvazia, "Restaurar rotina" volta', async ({ page }) => {
    await abrirApp(page, '10:07');
    await expect(page.locator('.block-row').first()).toContainText('09:00–09:25');

    // "Começar agora": o próximo múltiplo de 5 min é 10:10.
    await page.locator('#day-windows-btn').click();
    await expect(page.locator('#day-windows-panel')).toBeVisible();
    await expect(page.locator('#day-windows-panel .sw-row')).toHaveCount(1); // a janela da rotina, 09:00 → 18:00
    await page.locator('#day-windows-start-now').click();
    await expect(page.locator('#day-windows-panel')).toBeHidden();
    await expect(page.locator('.block-row').first()).toContainText('10:10–10:35');
    await expect(page.locator('#day-windows-btn')).toContainText('editado');
    await expect(page.locator('#toast')).toContainText('10:10');

    // "Dia livre" pede confirmação e esvazia o dia.
    await page.locator('#day-windows-btn').click();
    await page.locator('#day-windows-off').click();
    await expect(page.locator('#day-windows-off-confirm-box')).toBeVisible();
    await page.locator('#day-windows-off-confirm').click();
    await expect(page.locator('#day-windows-panel')).toBeHidden();
    await expect(page.locator('.empty-day')).toContainText('Dia livre');
    await expect(page.locator('.block-row')).toHaveCount(0);

    // Sobrevive ao reload; "Restaurar rotina" traz o plano normal de volta.
    await expect(page.locator('#save-indicator')).toContainText('Modo teste');
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('.empty-day')).toContainText('Dia livre');
    await page.locator('#day-windows-btn').click();
    await expect(page.locator('#day-windows-off-note')).toBeVisible();
    await page.locator('#day-windows-restore').click();
    await expect(page.locator('#day-windows-panel')).toBeHidden();
    await expect(page.locator('.block-row').first()).toContainText('09:00–09:25');
    await expect(page.locator('#day-windows-btn')).not.toContainText('editado');

    // Editar as janelas à mão: hoje só das 14:00 às 16:00.
    await page.locator('#day-windows-btn').click();
    await page.locator('#day-windows-panel .swc-start').fill('14:00');
    await page.locator('#day-windows-panel .swc-end').fill('16:00');
    await page.locator('#day-windows-save').click();
    await expect(page.locator('#day-windows-panel')).toBeHidden();
    // O almoço (13:00) continua aparecendo antes da janela; os estudos vão das 14:00 até 15:55
    // (os 5 min finais são menos que meio pomo, e o gerador descarta).
    await expect(page.locator('.block-row').first()).toContainText('Almoço');
    await expect(page.locator('.block-row.session-block').first()).toContainText('14:00–14:25');
    await expect(page.locator('.block-row.session-block').last()).toContainText('15:30–15:55');
  });

  test('4. clicar no bloco do momento inicia o pomodoro em modo foco', async ({ page }) => {
    await abrirApp(page, '10:10');
    // Com pomo 25 / pausa 5, o bloco das 10:00–10:25 é o que está rolando às 10:10.
    const blocoAtual = page.locator('.block-row', { hasText: '10:00–10:25' });
    await expect(blocoAtual).toBeVisible();
    await blocoAtual.locator('.block-name').click();

    await expect(page.locator('#focus-overlay')).toBeVisible();
    await expect(page.locator('#timer-bar')).toHaveClass(/active/);
    await expect(page.locator('#timer-display')).toHaveText(/^1[45]:\d\d$/); // ~15 min restantes

    await page.locator('.focus-exit').click();
    await expect(page.locator('#focus-overlay')).toBeHidden();
    await expect(page.locator('#timer-bar')).toHaveClass(/active/); // sair do foco não para o timer

    await page.locator('#timer-bar').getByRole('button', { name: /Parar/ }).click();
    await expect(page.locator('#timer-bar')).not.toHaveClass(/active/);
  });

  test('19. bloco futuro abre o foco em espera e começa sozinho na hora', async ({ page }) => {
    await abrirApp(page, '10:10');
    // Estudo 4 (10:30–10:55) ainda não começou: o foco abre em espera, contando até o início.
    await page.locator('.block-row', { hasText: '10:30–10:55' }).locator('.block-name').click();
    await expect(page.locator('#focus-overlay')).toBeVisible();
    await expect(page.locator('#focus-time-big')).toHaveText('20:00');
    await expect(page.locator('#focus-time-sub')).toHaveText('começa às 10:30');
    await expect(page.locator('#timer-bar')).toContainText('Começa em');

    // Chegou a hora: vira o pomodoro normal, sem clique nenhum.
    await page.clock.setFixedTime(new Date(`${DIA}T10:30:01`));
    await expect(page.locator('#focus-time-big')).toHaveText('24:59');
    await expect(page.locator('#focus-time-sub')).toContainText('completou');
    await expect(page.locator('#timer-bar')).toContainText('Em andamento');
  });

  test('20. bloco que acaba no foco é marcado sozinho e emenda na pausa', async ({ page }) => {
    await abrirApp(page, '10:10');
    const estudo3 = page.locator('.block-row', { hasText: '10:00–10:25' });
    await estudo3.locator('.block-name').click();
    await expect(page.locator('#focus-overlay')).toBeVisible();

    await page.clock.setFixedTime(new Date(`${DIA}T10:25:01`));
    await expect(page.locator('#focus-block-name')).toHaveText('Pausa'); // emendou na pausa 10:25–10:30
    await expect(page.locator('#focus-done')).toHaveText('✓ Estudo 3 concluído · +50 XP · +25 🪙');
    await expect(page.locator('#focus-overlay')).toBeVisible();

    await page.locator('.focus-exit').click();
    await expect(estudo3.locator('.check')).toHaveClass(/checked/);
    await expect(page.locator('#timer-bar')).toContainText('Pausa');
  });

  test('5. concluir um bloco mostra XP e moedas pendentes de hoje', async ({ page }) => {
    await abrirApp(page);
    await expect(page.locator('#today-xp-val')).not.toContainText('XP');

    await checksDeEstudo(page).first().click();

    await expect(checksDeEstudo(page).first()).toHaveClass(/checked/);
    await expect(page.locator('#today-xp-val')).toContainText('+50 XP');
    await expect(page.locator('#today-xp-val')).toContainText('+25');
    await expect(page.locator('#xp-total')).toHaveText('0'); // só entra no total quando o dia fecha
  });

  test('6 e 7. encerrar o dia consolida o progresso', async ({ page }) => {
    await abrirApp(page);
    await checksDeEstudo(page).first().click();

    await page.locator('.finish-day-btn').click();
    await expect(page.locator('#finish-day-confirm')).toBeVisible();
    await page.locator('#finish-day-confirm').getByRole('button', { name: 'Encerrar dia' }).click();

    await expect(page.locator('#day-summary-panel')).toBeVisible();
    await expect(page.locator('#day-summary-panel')).toContainText('+50');
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();

    await expect(page.locator('#xp-total')).toHaveText('50');
    await expect(page.locator('#today-xp-val')).toContainText('Hoje encerrado');

    // Dia encerrado é somente leitura.
    await checksDeEstudo(page).nth(1).click();
    await expect(checksDeEstudo(page).nth(1)).not.toHaveClass(/checked/);

    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#char-coins')).toHaveText('25');
  });

  test('8. comprar e equipar um pet', async ({ page }) => {
    await abrirApp(page);
    // 7 pomos de 25 min = 175 moedas (+5 de bônus de streak por bater a meta de 60 min).
    for (let i = 0; i < 7; i++) await checksDeEstudo(page).nth(i).click();
    await page.locator('.finish-day-btn').click();
    await page.locator('#finish-day-confirm').getByRole('button', { name: 'Encerrar dia' }).click();
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();

    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#char-coins')).toHaveText('180');

    await page.getByRole('button', { name: /Loja de pets/ }).click();
    await expect(page.locator('#pets-shop-panel')).toBeVisible();
    const gato = page.locator('#pets-shop-panel .shop-item', { hasText: 'Gato' });
    await gato.locator('.shop-btn').click();
    await expect(page.locator('#pet-buy-confirm')).toBeVisible();
    await page.locator('#pet-buy-confirm').getByRole('button', { name: 'Adotar' }).click();
    await expect(page.locator('#pet-buy-confirm')).toBeHidden();

    await expect(page.locator('#char-coins')).toHaveText('30'); // 180 − 150
    await page.locator('#pets-shop-panel .panel-close').click();

    await page.getByRole('button', { name: /Meus pets/ }).click();
    await expect(page.locator('#my-pets-panel')).toBeVisible();
    await expect(page.locator('#my-pets-grid')).toContainText('Gato');
    await expect(page.locator('#my-pets-grid .shop-btn.active')).toHaveText(/Equipada/);
  });

  test('15. o pet ganha nome ao adotar, XP ao fechar o dia, e evolui escolhendo o caminho', async ({ page }) => {
    await abrirApp(page);
    for (let i = 0; i < 7; i++) await checksDeEstudo(page).nth(i).click();
    await page.locator('.finish-day-btn').click();
    await page.locator('#finish-day-confirm').getByRole('button', { name: 'Encerrar dia' }).click();
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();

    // Adota o cachorro com nome próprio (o campo já vem com uma sugestão).
    await page.getByRole('button', { name: /Perfil/ }).click();
    await page.getByRole('button', { name: /Loja de pets/ }).click();
    await page.locator('#pets-shop-panel .shop-item', { hasText: 'Cachorro' }).locator('.shop-btn').click();
    await expect(page.locator('#pet-name-input')).not.toHaveValue('');
    await page.locator('#pet-name-input').fill('Bolt');
    await page.locator('#pet-buy-confirm').getByRole('button', { name: 'Adotar' }).click();
    await expect(page.locator('#pet-buy-confirm')).toBeHidden();
    await page.locator('#pets-shop-panel .panel-close').click();
    await expect(page.locator('#ap-name')).toHaveText('Bolt');
    await expect(page.locator('#ap-species')).toHaveText('Cachorro');
    // O save tem debounce: espera a adoção chegar no storage antes de recarregar.
    await expect
      .poll(() => page.evaluate(() => {
        const doc = JSON.parse(sessionStorage.getItem('study-pets:teste:usuario-teste') ?? '{}');
        return (doc.pets?.owned ?? []).some((p: { name?: string }) => p.name === 'Bolt');
      }))
      .toBe(true);

    // Dia seguinte: 7 estudos com o Bolt equipado e o dia fechado → 350 XP = Lv. 5, o nível da evolução.
    await page.clock.setFixedTime(new Date('2026-09-03T17:30:00'));
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#onboarding-panel')).toBeHidden();
    for (let i = 0; i < 7; i++) await checksDeEstudo(page).nth(i).click();
    await page.locator('.finish-day-btn').click();
    await page.locator('#finish-day-confirm').getByRole('button', { name: 'Encerrar dia' }).click();
    await expect(page.locator('#day-summary-panel')).toContainText('Bolt');
    await expect(page.locator('#day-summary-panel')).toContainText('Lv. 1 → 5');
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();

    // Escolhe o caminho selvagem: vira lobo e continua sendo o Bolt.
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#ap-lv')).toHaveText('Lv. 5');
    await page.getByRole('button', { name: /Meus pets/ }).click();
    await page.locator('#my-pets-grid .shop-btn.evolve').click();
    await expect(page.locator('#pet-evolve-panel')).toBeVisible();
    await page.locator('#pet-evolve-panel .evo-path', { hasText: 'Lobo' }).click();
    await page.locator('#pet-evolve-panel').getByRole('button', { name: 'Evoluir', exact: true }).click();
    await expect(page.locator('#pet-evolve-panel')).toBeHidden();
    await expect(page.locator('#my-pets-grid')).toContainText('Bolt');
    await expect(page.locator('#my-pets-grid')).toContainText('Lobo');
    await expect(page.locator('#my-pets-grid .shop-btn.evolve')).toHaveCount(0);
    await page.locator('#my-pets-panel .panel-close').click();
    await expect(page.locator('#pet-sprite')).toHaveAttribute('src', /idle\/pets\/wolf\//);
  });

  test('9. criar um evento encaixa ele no plano', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: '+ Evento' }).click();
    await expect(page.locator('#event-panel')).toBeVisible();
    await page.locator('#ev-name').fill('Aula de Cálculo');
    await page.locator('#ev-start').fill('14:00');
    await page.locator('#ev-end').fill('15:30');
    await page.locator('#event-panel').getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.locator('#event-panel')).toBeHidden();

    const evento = page.locator('.block-row.event-row', { hasText: 'Aula de Cálculo' });
    await expect(evento).toBeVisible();
    await expect(evento).toContainText('14:00–15:30');
    await expect(evento).toContainText('+180 XP');
    // Nenhum estudo em cima do evento.
    await expect(page.locator('.block-row', { hasText: '14:30–' })).toHaveCount(0);
  });

  test('24. editar um evento muda nome e horário no plano', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: '+ Evento' }).click();
    await page.locator('#ev-name').fill('Aula de Cálculo');
    await page.locator('#ev-start').fill('14:00');
    await page.locator('#ev-end').fill('15:30');
    await page.locator('#event-panel').getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.locator('#event-panel')).toBeHidden();

    // Tocar no evento abre o modal dele; "Editar" abre o painel já preenchido.
    await page.locator('.block-row.event-row', { hasText: 'Aula de Cálculo' }).locator('.block-name').click();
    await expect(page.locator('#event-delete-confirm')).toBeVisible();
    await page.locator('#event-edit-btn').click();
    await expect(page.locator('#event-delete-confirm')).toBeHidden();
    await expect(page.locator('#event-panel')).toBeVisible();
    await expect(page.locator('#event-panel')).toContainText('Editar evento');
    await expect(page.locator('#ev-name')).toHaveValue('Aula de Cálculo');
    await expect(page.locator('#ev-start')).toHaveValue('14:00');
    await expect(page.locator('#ev-end')).toHaveValue('15:30');
    await expect(page.locator('#ev-repeat')).toHaveCount(0); // avulso não vira série ao editar

    await page.locator('#ev-name').fill('Aula de Álgebra');
    await page.locator('#ev-end').fill('16:00');
    await page.locator('#ev-save').click();
    await expect(page.locator('#event-panel')).toBeHidden();

    const editado = page.locator('.block-row.event-row', { hasText: 'Aula de Álgebra' });
    await expect(editado).toBeVisible();
    await expect(editado).toContainText('14:00–16:00');
    await expect(page.locator('.block-row.event-row', { hasText: 'Aula de Cálculo' })).toHaveCount(0);
    await expect(page.locator('.block-row.event-row')).toHaveCount(1); // editou, não duplicou
  });

  test('10. recarregar a página preserva o que foi salvo', async ({ page }) => {
    await abrirApp(page);
    await checksDeEstudo(page).first().click();
    await expect(page.locator('#save-indicator')).toContainText('Modo teste');

    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#onboarding-panel')).toBeHidden(); // conta já existe
    await expect(checksDeEstudo(page).first()).toHaveClass(/checked/);
    await expect(page.locator('#today-xp-val')).toContainText('+50 XP');
  });

  test('11. agrupar blocos dá nome e objetivo a um trecho do dia', async ({ page }) => {
    await abrirApp(page);
    const linhas = page.locator('.block-row');

    // Pelo botão: toca no primeiro bloco, depois no último.
    await page.getByRole('button', { name: 'Agrupar' }).click();
    await expect(page.locator('#group-hint')).toContainText('primeiro bloco');
    await linhas.nth(0).locator('.block-name').click();
    await expect(page.locator('#group-hint')).toContainText('último bloco');
    await linhas.nth(4).locator('.block-name').click(); // 10:00–10:25

    await expect(page.locator('#group-panel')).toBeVisible();
    await expect(page.locator('#group-summary')).toContainText('09:00 – 10:25');
    await expect(page.locator('#group-summary')).toContainText('3 estudos');
    await page.locator('#grp-name').fill('Análise II');
    await page.locator('#grp-goal').fill('terminar a lista 3');
    await page.locator('#grp-save').click();
    await expect(page.locator('#group-panel')).toBeHidden();

    const cabecalho = page.locator('.group-header');
    await expect(cabecalho).toHaveCount(1);
    await expect(cabecalho).toContainText('Análise II');
    await expect(cabecalho).toContainText('terminar a lista 3');
    await expect(cabecalho).toContainText('0/3');
    await expect(page.locator('.block-row.in-group')).toHaveCount(5); // 3 estudos + 2 pausas

    // O progresso acompanha os checks.
    await checksDeEstudo(page).first().click();
    await expect(cabecalho).toContainText('1/3');

    // Tocar no cabeçalho edita.
    await cabecalho.click();
    await expect(page.locator('#group-panel')).toContainText('Editar grupo');
    await expect(page.locator('#grp-name')).toHaveValue('Análise II');
    await page.locator('#grp-name').fill('Análise II · revisão');
    await page.locator('#grp-save').click();
    await expect(cabecalho).toContainText('Análise II · revisão');

    // Sobrevive ao reload (depois que o save com debounce terminou, como no teste 10).
    await expect(page.locator('#save-indicator')).toContainText('Modo teste');
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('.group-header')).toContainText('Análise II · revisão');
  });

  test('12. arrastar com o botão direito seleciona o trecho', async ({ page }) => {
    // O menu de contexto do browser nunca pode aparecer — nem em cima do modal que abre ao soltar.
    await page.addInitScript(() => {
      const w = window as unknown as { __ctx: boolean[] };
      w.__ctx = [];
      document.addEventListener('contextmenu', (e) => w.__ctx.push(e.defaultPrevented));
    });
    await abrirApp(page);
    const linhas = page.locator('.block-row');
    const de = await linhas.nth(0).boundingBox();
    const ate = await linhas.nth(2).boundingBox();
    if (!de || !ate) throw new Error('linhas sem posição na tela');

    await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(ate.x + ate.width / 2, ate.y + ate.height / 2, { steps: 6 });
    await expect(page.locator('.block-row.selecting')).toHaveCount(3);
    await page.mouse.up({ button: 'right' });

    await expect(page.locator('#group-panel')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __ctx: boolean[] }).__ctx)).toEqual([true]);
    await expect(page.locator('#group-summary')).toContainText('09:00 – 09:55');
    await expect(page.locator('#group-summary')).toContainText('2 estudos');
    await page.locator('#grp-save').click(); // sem nome → "Grupo"
    await expect(page.locator('.group-header')).toContainText('Grupo');

    // Trecho já ocupado por um grupo: recusa com aviso, sem abrir o painel.
    await linhas.nth(1).click({ button: 'right' });
    await expect(page.locator('#toast')).toContainText('Já existe um grupo');
    await expect(page.locator('#group-panel')).toBeHidden();
  });

  // Tela alta: a linha alvo precisa ficar longe da faixa de rolagem automática (64px do fundo),
  // senão a página rola durante o arrasto e a alça vai parar uma linha além — de propósito.
  test.describe('em tela alta', () => {
    test.use({ viewport: { width: 480, height: 1400 } });

  test('17. a alça de baixo estica e encolhe o trecho, e não invade outro grupo', async ({ page }) => {
    await abrirApp(page);
    const linhas = page.locator('.block-row');
    await page.getByRole('button', { name: 'Agrupar' }).click();
    await linhas.nth(0).locator('.block-name').click();
    await linhas.nth(4).locator('.block-name').click();
    await page.locator('#grp-save').click();
    const cabecalho = page.locator('.group-header');
    await expect(cabecalho).toContainText('0/3');

    // Alça de baixo até a linha 6 (10:30–10:55): 4 estudos, 7 linhas.
    const alca = await page.locator('.gb-grip-bottom').boundingBox();
    const alvo = await linhas.nth(6).boundingBox();
    if (!alca || !alvo) throw new Error('sem posição na tela');
    await page.mouse.move(alca.x + alca.width / 2, alca.y + alca.height / 2);
    await page.mouse.down();
    await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2, { steps: 8 });
    await expect(page.locator('#group-hint')).toContainText('ajustar');
    await expect(page.locator('.selection-rect')).toBeVisible();
    await page.mouse.up();
    await expect(cabecalho).toContainText('0/4');
    await expect(page.locator('.block-row.in-group')).toHaveCount(7);

    // De volta até a linha 2 (09:30–09:55): encolhe pra 2 estudos.
    const alca2 = await page.locator('.gb-grip-bottom').boundingBox();
    const volta = await linhas.nth(2).boundingBox();
    if (!alca2 || !volta) throw new Error('sem posição na tela');
    await page.mouse.move(alca2.x + alca2.width / 2, alca2.y + alca2.height / 2);
    await page.mouse.down();
    await page.mouse.move(volta.x + volta.width / 2, volta.y + volta.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(cabecalho).toContainText('0/2');
    await expect(page.locator('.block-row.in-group')).toHaveCount(3);

    // Um segundo grupo logo abaixo; a alça do primeiro não passa por cima dele.
    await page.getByRole('button', { name: 'Agrupar' }).click();
    await linhas.nth(4).locator('.block-name').click();
    await linhas.nth(6).locator('.block-name').click();
    await page.locator('#grp-save').click();
    await expect(page.locator('.group-header')).toHaveCount(2);
    const alca1 = await page.locator('.group-box.gc-0 .gb-grip-bottom').boundingBox();
    const dentro = await linhas.nth(5).boundingBox();
    if (!alca1 || !dentro) throw new Error('sem posição na tela');
    await page.mouse.move(alca1.x + alca1.width / 2, alca1.y + alca1.height / 2);
    await page.mouse.down();
    await page.mouse.move(dentro.x + dentro.width / 2, dentro.y + dentro.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('#toast')).toContainText('Já existe um grupo');
    await expect(page.locator('.group-box.gc-0 .group-header')).toContainText('0/2'); // ficou como estava
  });
  });

  test.describe('no celular', () => {
    test.use({ hasTouch: true });

    /** Toque de verdade pelo CDP: passa pelo gesto do Chromium, inclusive a decisão de rolar. */
    const centro = async (page: Page, i: number) => {
      const b = await page.locator('.block-row').nth(i).boundingBox();
      if (!b) throw new Error(`linha ${i} sem posição`);
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };

    test('13. toque longo arrasta a seleção; soltar sem arrastar volta ao toque no último', async ({ page }) => {
      await abrirApp(page);
      const cdp = await page.context().newCDPSession(page);
      const toque = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });

      // Segura na linha 0, espera o toque longo, arrasta até a linha 2 e solta.
      const a = await centro(page, 0);
      const b = await centro(page, 2);
      await toque('touchStart', a);
      await page.waitForTimeout(600);
      await expect(page.locator('#group-hint')).toContainText('Arraste');
      for (let s = 1; s <= 6; s++) await toque('touchMove', { x: a.x, y: a.y + ((b.y - a.y) * s) / 6 });
      await expect(page.locator('.block-row.selecting')).toHaveCount(3);
      await expect(page.locator('.selection-rect')).toBeVisible();
      await toque('touchEnd');
      await expect(page.locator('#group-panel')).toBeVisible();
      await expect(page.locator('#group-summary')).toContainText('09:00 – 09:55');
      await page.locator('#group-panel .panel-close').click();

      // Toque longo e solta no lugar: continua esperando o toque no último bloco.
      const c = await centro(page, 6);
      await toque('touchStart', c);
      await page.waitForTimeout(600);
      await toque('touchEnd');
      await expect(page.locator('#group-hint')).toContainText('último bloco');
      await page.locator('.block-row').nth(8).locator('.block-name').tap();
      await expect(page.locator('#group-panel')).toBeVisible();
      await expect(page.locator('#group-summary')).toContainText('10:30 – 11:40');
    });

    test('14. arrastando até a borda de baixo, a página rola sozinha', async ({ page }) => {
      await abrirApp(page);
      const cdp = await page.context().newCDPSession(page);
      const a = await centro(page, 0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
      await page.waitForTimeout(600);
      const antes = await page.evaluate(() => window.scrollY);
      const h = page.viewportSize()!.height;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: h - 20 }] });
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(antes + 50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.locator('#group-panel')).toBeVisible(); // soltou longe da âncora: virou grupo
    });

    test('18. a alça da caixa responde ao dedo', async ({ page }) => {
      await abrirApp(page);
      const linhas = page.locator('.block-row');
      await page.getByRole('button', { name: 'Agrupar' }).tap();
      await linhas.nth(0).locator('.block-name').tap();
      await linhas.nth(2).locator('.block-name').tap();
      await page.locator('#grp-save').tap();
      await expect(page.locator('.group-header')).toContainText('0/2');

      const cdp = await page.context().newCDPSession(page);
      const alca = await page.locator('.gb-grip-bottom').boundingBox();
      if (!alca) throw new Error('alça sem posição');
      const a = { x: alca.x + alca.width / 2, y: alca.y + alca.height / 2 };
      const alvo = await centro(page, 4);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
      for (let s = 1; s <= 6; s++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: a.y + ((alvo.y - a.y) * s) / 6 }] });
      }
      await expect(page.locator('.block-row.selecting')).toHaveCount(5);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(page.locator('.group-header')).toContainText('0/3');
    });
  });
});
