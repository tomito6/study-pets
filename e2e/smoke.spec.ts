// Smoke test: os fluxos essenciais do Study Pets, de ponta a ponta, no modo teste.
//
// Cada teste abre uma aba nova (conta nova, onboarding aparece) e fixa o relógio
// no horário de que precisa — porque o plano do dia e o timer dependem de "agora".
// 2026-09-02 é uma quarta-feira.

import { expect, test, type Page } from '@playwright/test';

const DIA = '2026-09-02';

/** Abre o app com o relógio fixo, espera o modo teste logar e fecha o onboarding. */
async function abrirApp(page: Page, hora = '17:30') {
  await page.clock.setFixedTime(new Date(`${DIA}T${hora}:00`));
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#onboarding-panel')).toBeVisible();
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
    await expect(page.locator('#today-label')).toContainText('quarta-feira');
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

    await page.locator('[onclick^="openPetsShop"]').click();
    await expect(page.locator('#pets-shop-panel')).toBeVisible();
    const gato = page.locator('#pets-shop-panel .shop-item', { hasText: 'Gato' });
    await gato.locator('.shop-btn').click();
    await expect(page.locator('#pet-buy-confirm')).toBeVisible();
    await page.locator('#pet-buy-confirm').getByRole('button', { name: 'Adotar' }).click();
    await expect(page.locator('#pet-buy-confirm')).toBeHidden();

    await expect(page.locator('#char-coins')).toHaveText('30'); // 180 − 150
    await page.locator('#pets-shop-panel .panel-close').click();

    await page.locator('[onclick^="openMyPets"]').click();
    await expect(page.locator('#my-pets-panel')).toBeVisible();
    await expect(page.locator('#my-pets-grid')).toContainText('Gato');
    await expect(page.locator('#my-pets-grid .shop-btn.active')).toHaveText(/Equipada/);
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
});
