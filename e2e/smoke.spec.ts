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
  });
});
