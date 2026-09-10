// Smoke test: os fluxos essenciais do Study Pets, de ponta a ponta, no modo teste.
//
// Cada teste abre uma aba nova (conta nova, onboarding aparece) e fixa o relógio
// no horário de que precisa — porque o plano do dia e o timer dependem de "agora".
// 2026-09-02 é uma quarta-feira.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const DIA = '2026-09-02';

/** Passa pelo onboarding: o personagem padrão, o gato como pet inicial (com o nome
 *  sugerido) e o período padrão. */
async function passarOnboarding(page: Page) {
  await expect(page.locator('#onboarding-panel')).toBeVisible();
  await page.locator('#onb-avatar-next').click();
  await page.locator('#starter-grid .starter-card[data-species="cat"]').click();
  await expect(page.locator('#starter-name')).not.toHaveValue('');
  await page.locator('#onb-next').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('#onboarding-panel')).toBeHidden();
}

/** Abre o app com o relógio fixo, espera o modo teste logar e passa pelo onboarding. */
async function abrirApp(page: Page, hora = '17:30') {
  await page.clock.setFixedTime(new Date(`${DIA}T${hora}:00`));
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
  await passarOnboarding(page);
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

/** Lê "175 / 370 min" de um card de realizado da Análise, pra comparar por valor. */
async function realizado(page: Page, id: string): Promise<{ done: number; planned: number }> {
  const texto = await page.locator(`#${id} .adh-val`).innerText();
  const [done, planned] = texto.replace(' min', '').split(' / ').map(Number);
  return { done: done as number, planned: planned as number };
}

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
    await expect(page.locator('#onb-avatar')).toBeVisible(); // o primeiro passo é o personagem
    await page.locator('#onb-avatar-next').click();
    await expect(page.locator('#starter-grid .starter-card')).toHaveCount(5);
    await expect(page.locator('#today-label')).toContainText('quarta-feira');
  });

  test('16. o pet inicial: escolhe a cobra, dá nome, e ela já aparece no perfil de graça', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${DIA}T17:30:00`));
    await page.goto('/');
    await expect(page.locator('#onboarding-panel')).toBeVisible();
    await page.locator('#onb-avatar-next').click();
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

  test('21. criar conta por e-mail abre o app com onboarding, como conta nova', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.locator('#login-toggle-mode').click(); // "Criar conta"
    await expect(page.locator('#login-submit')).toHaveText('Criar conta');
    await page.locator('#login-email').fill('tomi@example.com');
    await page.locator('#login-password').fill('senhaboa123');
    await page.locator('#login-submit').click();

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#onboarding-panel')).toBeVisible();
  });

  test('22. entrar por e-mail: senha errada mostra erro inline, senha certa abre o app', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();

    // Cria a conta primeiro, pra ter o que entrar depois.
    await page.locator('#login-toggle-mode').click();
    await page.locator('#login-email').fill('senha-teste@example.com');
    await page.locator('#login-password').fill('senhacerta1');
    await page.locator('#login-submit').click();
    await expect(page.locator('#app')).toBeVisible();
    await passarOnboarding(page);
    // O save tem debounce: espera o onboarding chegar no storage antes de sair,
    // senão o próximo login acha a conta "nova" de novo (mesmo problema do teste 15).
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('study-pets:teste:email:senha-teste@example.com') !== null))
      .toBe(true);

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.locator('#login-email').fill('senha-teste@example.com');
    await page.locator('#login-password').fill('senhaerrada');
    await page.locator('#login-submit').click();
    await expect(page.locator('#login-error')).toContainText('incorretos');
    await expect(page.locator('#app')).toBeHidden();

    await page.locator('#login-password').fill('senhacerta1');
    await page.locator('#login-submit').click();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#onboarding-panel')).toBeHidden(); // conta já passou pelo onboarding
  });

  test('23. esqueci a senha mostra confirmação inline', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();

    await page.locator('#login-email').fill('esqueci@example.com');
    await page.locator('#login-forgot').click();
    await expect(page.locator('#login-reset-sent')).toContainText('esqueci@example.com');
  });

  test('3. configurar rotina muda o plano do dia', async ({ page }) => {
    await abrirApp(page);
    await expect(page.locator('.block-row').first()).toContainText('09:00–09:25');

    await page.getByRole('button', { name: 'Configurações' }).click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await page.locator('#settings-panel .settings-tab[data-tab="day"]').click(); // abre no Geral; o ritmo fica em "Estrutura do dia"
    await expect(page.locator('#config-preview #day-timeline')).toBeVisible();
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

  test('30. fim de semana pausado: dá pra abrir janelas só naquele sábado, e "Restaurar rotina" devolve a folga', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#tour-skip').click(); // o balão do tour cobre as abas dos dias de propósito
    await expect(page.locator('#tour-balloon')).toBeHidden();
    // Liga "Pular finais de semana".
    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
    await page.locator('.st-switch', { has: page.locator('#cfg-skip-weekends') }).click(); // o input do switch é invisível: clica no trilho
    await expect(page.locator('#cfg-skip-weekends')).toBeChecked();
    await page.locator('#settings-panel').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('#settings-panel')).toBeHidden();

    // Sábado: sem blocos, com a dica de como estudar mesmo assim.
    await page.locator('.day-tab', { hasText: 'Sáb' }).click();
    await expect(page.locator('.empty-day')).toContainText('Fim de semana');
    await expect(page.locator('.empty-day-hint')).toContainText('Janelas do dia');
    await expect(page.locator('.block-row')).toHaveCount(0);

    // Abre uma janela só neste sábado.
    await page.locator('#day-windows-btn').click();
    await expect(page.locator('#day-windows-off-note')).toContainText('Fim de semana');
    await page.locator('#day-windows-add').click();
    await page.locator('#day-windows-panel .swc-start').fill('10:00');
    await page.locator('#day-windows-panel .swc-end').fill('12:00');
    await page.locator('#day-windows-save').click();
    await expect(page.locator('#day-windows-panel')).toBeHidden();
    await expect(page.locator('.block-row.session-block').first()).toContainText('10:00–10:25');
    await expect(page.locator('#day-windows-btn')).toContainText('editado');

    // O domingo continua livre.
    await page.locator('.day-tab', { hasText: 'Dom' }).click();
    await expect(page.locator('.empty-day')).toContainText('Fim de semana');
    await expect(page.locator('#day-windows-btn')).not.toContainText('editado');

    // "Restaurar rotina" devolve a folga do sábado.
    await page.locator('.day-tab', { hasText: 'Sáb' }).click();
    await page.locator('#day-windows-btn').click();
    await page.locator('#day-windows-restore').click();
    await expect(page.locator('#day-windows-panel')).toBeHidden();
    await expect(page.locator('.empty-day')).toContainText('Fim de semana');
    await expect(page.locator('.block-row')).toHaveCount(0);
  });

  test('33. bloqueio de sites sem hardcore: a lista vira chips, o que não é domínio aparece, e o estudo publica pra extensão', async ({ page }) => {
    await abrirApp(page, '10:10');
    await page.locator('#tour-skip').click();

    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
    await page.locator('.st-switch', { has: page.locator('#cfg-siteblock') }).click(); // o input do switch é invisível
    await expect(page.locator('#siteblock-fields')).toBeVisible();
    await page.locator('#cfg-siteblock-sites').fill('chess.com\nhttps://www.youtube.com/watch?v=x\nchess');

    // O que o app entendeu: um chip por domínio, com o apelido junto.
    const chips = page.locator('#siteblock-preview .sb-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText('chess.com');
    await expect(chips.nth(1)).toHaveText('youtube.com (+ youtu.be)');
    // E o que ele NÃO entendeu não some em silêncio.
    await expect(page.locator('#siteblock-invalid')).toHaveText('Não entendi: chess');

    // Sem extensão neste navegador: o status diz QUE extensão é (o Tomi perguntou
    // "mano que extensão é essa?"), como instalar, e que ela não manda nada pra fora.
    await expect(page.locator('#siteblock-ext-status')).toHaveClass(/missing/);
    await expect(page.locator('#siteblock-ext-status')).toContainText('vem junto com o Study Pets');
    await expect(page.locator('#siteblock-ext-status .sb-ext-steps li')).toHaveCount(3);
    await expect(page.locator('#siteblock-ext-status .sb-ext-privacy')).toContainText('não guarda seu histórico');
    await expect(page.locator('#siteblock-test')).toHaveCount(0); // sem extensão não há o que testar

    await page.locator('#settings-panel').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('#settings-panel')).toBeHidden();

    // Escuta o que o app publica pra extensão antes de tocar no bloco.
    await page.evaluate(() => {
      const w = window as unknown as { __sp: unknown[] };
      w.__sp = [];
      window.addEventListener('study-pets:blocking', (e) => w.__sp.push(JSON.parse((e as CustomEvent).detail)));
    });

    // Bloqueio ligado NÃO é hardcore: o foco abre direto, sem consentimento.
    await page.locator('.block-row', { hasText: '10:00–10:25' }).locator('.block-name').click();
    await expect(page.locator('#hardcore-start-confirm')).toBeHidden();
    await expect(page.locator('#focus-overlay')).toBeVisible();

    const publicado = await page.evaluate(() => (window as unknown as { __sp: Record<string, unknown>[] }).__sp.at(-1));
    expect(publicado).toMatchObject({ v: 2, active: true, mode: 'blacklist', hardcore: false, test: false });
    // A lista vai expandida: a extensão é burra, quem conhece os apelidos é o app.
    expect(publicado?.sites).toEqual(['chess.com', 'youtube.com', 'youtu.be']);
    expect((publicado?.block as { name: string }).name).toBe('Estudo 3');
  });

  test('31. atalhos do evento: "Refeição" preenche o formulário e repete todo dia; editar só este dia não mexe nos outros', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#tour-skip').click(); // o balão do tour cobre as abas dos dias
    await expect(page.locator('#tour-balloon')).toBeHidden();
    // A refeição padrão das 13h já está no plano (conta nova).
    await expect(page.locator('.block-row.almoco-row')).toContainText('Almoço');

    await page.locator('#add-event-btn').click();
    await expect(page.locator('#event-panel')).toBeVisible();
    await page.locator('#ev-presets [data-preset="meal"]').click();
    await expect(page.locator('#ev-name')).toHaveValue('🍽️ Refeição');
    await expect(page.locator('#ev-start')).toHaveValue('13:00');
    await expect(page.locator('#ev-end')).toHaveValue('14:00');
    await expect(page.locator('#ev-counts')).not.toBeChecked();
    await expect(page.locator('#ev-repeat')).toBeChecked();
    await expect(page.locator('#ev-weekdays .weekday-chip.selected')).toHaveCount(7);
    // Janta: 19:00–20:00, todo dia.
    await page.locator('#ev-start').fill('19:00');
    await page.locator('#ev-end').fill('20:00');
    await page.locator('#ev-save').click();
    await expect(page.locator('#event-panel')).toBeHidden();
    const janta = page.locator('.block-row.almoco-row', { hasText: 'Refeição' });
    await expect(janta).toContainText('19:00–20:00');
    await expect(janta).not.toContainText('📅'); // o nome já traz o ícone

    // "Só este dia": hoje a refeição da noite é 19:30–20:15; amanhã continua 19:00.
    await janta.click();
    await expect(page.locator('#event-delete-confirm')).toBeVisible();
    await page.locator('#event-edit-btn').click();
    await expect(page.locator('#event-panel')).toContainText('Editar evento');
    await expect(page.locator('#ev-scope [data-scope="day"]')).toHaveClass(/selected/);
    await expect(page.locator('#ev-repeat-section')).not.toHaveClass(/show/); // só este dia: sem recorrência pra mexer
    await page.locator('#ev-start').fill('19:30');
    await page.locator('#ev-end').fill('20:15');
    await page.locator('#ev-save').click();
    await expect(page.locator('#event-panel')).toBeHidden();
    await expect(page.locator('.block-row.almoco-row', { hasText: 'Refeição' })).toContainText('19:30–20:15');
    await page.locator('.day-tab', { hasText: 'Qui' }).click();
    await expect(page.locator('.block-row.almoco-row', { hasText: 'Refeição' })).toContainText('19:00–20:00');
  });

  test('26. baixar meus dados gera um JSON com o documento do usuário', async ({ page }) => {
    await abrirApp(page);
    await checksDeEstudo(page).first().click();

    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel').getByRole('button', { name: 'Geral' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-data-btn').click(),
    ]);
    expect(download.suggestedFilename()).toBe(`study-pets-${DIA}.json`);
    const caminho = await download.path();
    const doc = JSON.parse(readFileSync(caminho, 'utf8'));
    expect(doc.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(doc.checks[DIA]['09:00']).toBeTruthy();
    expect(doc.pets.owned[0].species).toBe('cat');
    expect(typeof doc.exportedAt).toBe('string');
    expect(doc).not.toHaveProperty('uid');
    expect(doc).not.toHaveProperty('email');
    await expect(page.locator('#toast')).toContainText('Arquivo gerado');
  });

  test('39. importar um .ics: revisar, escolher o que dá XP, e reimportar sem duplicar', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#tour-skip').click();

    // Uma aula semanal (série), um compromisso avulso e um feriado de dia inteiro.
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'X-WR-CALNAME:Faculdade',
      'BEGIN:VEVENT',
      'UID:aula@fac',
      'SUMMARY:Análise II',
      'DTSTART:20260903T100000',
      'DTEND:20260903T113000',
      'RRULE:FREQ=WEEKLY;BYDAY=TH',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:dentista@pessoal',
      'SUMMARY:Dentista',
      'DTSTART:20260903T150000',
      'DTEND:20260903T160000',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:feriado@br',
      'SUMMARY:Feriado',
      'DTSTART;VALUE=DATE:20260907',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const arquivo = { name: 'faculdade.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics, 'utf8') };

    const abrirRevisao = async () => {
      await page.getByRole('button', { name: 'Configurações' }).click();
      await page.locator('#settings-panel').getByRole('button', { name: 'Geral' }).click();
      await page.locator('#ics-file').setInputFiles(arquivo);
      await expect(page.locator('#ics-review-panel')).toBeVisible();
    };

    await abrirRevisao();
    // A aula virou série e o avulso virou uma data; o feriado de dia inteiro ficou de fora.
    await expect(page.locator('.ics-item')).toHaveCount(2);
    await expect(page.locator('.ics-item').first()).toContainText('Análise II');
    await expect(page.locator('.ics-skipped')).toContainText('1 ficou de fora');

    // XP é escolha: só a aula conta como estudo.
    await page.locator('.ics-item').first().locator('.ics-xp').click();
    await expect(page.locator('.ics-item').first().locator('.ics-xp')).toHaveClass(/on/);
    await page.locator('#ics-import-confirm').click();
    await expect(page.locator('#ics-review-panel')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('no plano');

    // No plano de amanhã (quinta): a aula dá XP, o dentista só reserva o tempo.
    await page.getByRole('button', { name: /Voltar/ }).click();
    await page.locator('.day-tab', { hasText: 'Qui' }).click();
    const aula = page.locator('.block-row', { hasText: 'Análise II' });
    await expect(aula).toContainText('XP');
    await expect(page.locator('.block-row', { hasText: 'Dentista' })).toHaveCount(1);

    // Reimportar o mesmo arquivo substitui em vez de duplicar.
    await abrirRevisao();
    await page.locator('#ics-import-confirm').click();
    await expect(page.locator('#ics-review-panel')).toBeHidden();
    await page.getByRole('button', { name: /Voltar/ }).click();
    await expect(page.locator('.block-row', { hasText: 'Análise II' })).toHaveCount(1);
    await expect(page.locator('.block-row', { hasText: 'Dentista' })).toHaveCount(1);
  });

  test('35. apagar a conta só destrava depois de digitar APAGAR, e leva os dados junto', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#tour-skip').click();
    await checksDeEstudo(page).first().click();
    // O save tem debounce: espera o documento existir, pra provar depois que ele sumiu.
    const doc = () => page.evaluate(() => sessionStorage.getItem('study-pets:teste:usuario-teste'));
    await expect.poll(doc).not.toBeNull();

    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
    await page.locator('#settings-panel').getByRole('button', { name: 'Apagar conta' }).click();
    await expect(page.locator('#delete-account-panel')).toBeVisible();
    // Conta do Google (o modo teste é uma): sem campo de senha.
    await expect(page.locator('#del-acc-password')).toHaveCount(0);
    await expect(page.locator('#del-acc-btn')).toBeDisabled();

    // Qualquer outra palavra não serve.
    await page.locator('#del-acc-input').fill('APAGA');
    await expect(page.locator('#del-acc-btn')).toBeDisabled();
    // A palavra certa serve em minúscula — é case-insensitive de propósito.
    await page.locator('#del-acc-input').fill('apagar');
    await expect(page.locator('#del-acc-btn')).toBeEnabled();

    await page.locator('#del-acc-btn').click();
    await expect(page.locator('#delete-account-panel')).toBeHidden();
    await expect(page.locator('#settings-panel')).toBeHidden();
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('Conta apagada');
    expect(await doc()).toBeNull(); // o documento foi embora junto

    // Entrar de novo é uma conta nova: o onboarding volta, sem o check de antes.
    await page.locator('.ls-google-btn').click();
    await expect(page.locator('#app')).toBeVisible();
    await passarOnboarding(page);
    await expect(checksDeEstudo(page).first()).not.toHaveClass(/checked/);
    await expect(page.locator('#today-xp-val')).not.toContainText('XP');
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

  test('38. pausar o bloco congela o relógio; retomar estica o bloco, empurra o dia, e sobrevive a um reload', async ({ page }) => {
    await abrirApp(page, '10:10');
    await page.locator('.block-row', { hasText: '10:00–10:25' }).locator('.block-name').click();
    await expect(page.locator('#focus-overlay')).toBeVisible();
    await expect(page.locator('#focus-time-big')).toHaveText('15:00');

    // Pausar: o restante congela, e o app diz há quanto tempo.
    await page.locator('#focus-pause').click();
    await expect(page.locator('#focus-time-sub')).toContainText('pausado');
    await expect(page.locator('#timer-bar')).toContainText('Pausado');
    await page.clock.setFixedTime(new Date(`${DIA}T10:12:30`));
    await expect(page.locator('#focus-time-sub')).toContainText('há 02:30');
    await expect(page.locator('#focus-time-big')).toHaveText('15:00'); // não andou

    // Retomar às 10:13: a pausa vira 3 min, o bloco vai até 10:28 (com o mesmo XP), a pausa seguinte começa às 10:28.
    await page.clock.setFixedTime(new Date(`${DIA}T10:13:00`));
    await page.locator('#focus-pause').click();
    await expect(page.locator('#focus-time-sub')).toContainText('completou');
    await expect(page.locator('#focus-time-big')).toHaveText('15:00');
    await expect(page.locator('#toast')).toContainText('Pausa de 3 min');
    await page.locator('.focus-exit').click();
    const esticado = page.locator('.block-row', { hasText: '10:00–10:28' });
    await expect(esticado).toBeVisible();
    await expect(esticado.locator('.block-paused')).toHaveText('⏸ 3 min');
    await expect(esticado.locator('.block-xp')).toHaveText('+50 XP');
    await expect(page.locator('.block-row', { hasText: '10:28–10:33' })).toContainText('Pausa');
    await expect(page.locator('#timer-bar')).toContainText('Em andamento');

    await expect
      .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('study-pets:teste:usuario-teste') ?? '{}').pauses?.['2026-09-02']))
      .toEqual([{ at: '10:10', mins: 3 }]); // salvo na hora, sem debounce

    // Pausar de novo pela barra e recarregar: a pausa fica no dispositivo, o timer volta pausado.
    await page.clock.setFixedTime(new Date(`${DIA}T10:15:00`));
    await page.locator('#timer-pause').click();
    await expect(page.locator('#timer-bar')).toContainText('Pausado');
    await page.clock.setFixedTime(new Date(`${DIA}T10:20:00`));
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#focus-overlay')).toBeHidden();
    await expect(page.locator('#timer-bar')).toHaveClass(/active/);
    await expect(page.locator('#timer-bar')).toContainText('Pausado · há 05:00');
    await expect(page.locator('#timer-display')).toHaveText('13:00');
    await page.locator('#timer-pause').click(); // ▶ Retomar: mais 5 min no bloco, que agora vai até 10:33
    await expect(page.locator('#timer-bar')).toContainText('Em andamento');
    await expect(page.locator('.block-row', { hasText: '10:00–10:33' }).locator('.block-paused')).toHaveText('⏸ 8 min');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('study-pets:teste:usuario-teste') ?? '{}').pauses?.['2026-09-02']))
      .toEqual([{ at: '10:10', mins: 3 }, { at: '10:15', mins: 5 }]);
  });

  /**
   * Dia 1 fechado com 7 estudos (350 XP; o gato inicial vai pro Lv. 5), dia 2 às 10:10 com o
   * modo hardcore ligado em Configurações → Geral. O que os testes 28 e 29 precisam pra ter
   * XP a perder — numa conta nova o total é 0 e a penalidade seria 0.
   */
  async function diaComXPEHardcore(page: Page) {
    await abrirApp(page);
    for (let i = 0; i < 7; i++) await checksDeEstudo(page).nth(i).click();
    await page.locator('.finish-day-btn').click();
    await page.locator('#finish-day-confirm').getByRole('button', { name: 'Encerrar dia' }).click();
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#xp-total')).toHaveText('350');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('study-pets:teste:usuario-teste') ?? '{}').closedDays?.['2026-09-02'] === true))
      .toBe(true);

    await page.clock.setFixedTime(new Date('2026-09-03T10:10:00'));
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#onboarding-panel')).toBeHidden();
    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
    await page.locator('.st-switch', { has: page.locator('#cfg-hardcore') }).click(); // o input do switch é invisível: clica no trilho
    await expect(page.locator('#cfg-hardcore')).toBeChecked();
    // O bloqueio de sites é outra seção desde 2026-09-08 — ligar o hardcore não liga a lista.
    await page.locator('.st-switch', { has: page.locator('#cfg-siteblock') }).click();
    await expect(page.locator('#siteblock-fields')).toBeVisible();
    await page.locator('#cfg-siteblock-sites').fill('youtube.com\nhttps://www.instagram.com/');
    await page.locator('#settings-panel').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('#settings-panel')).toBeHidden();
  }

  test('28. modo hardcore: entrar pede consentimento, desistir custa XP do usuário e do pet, e o bloco fica abandonado', async ({ page }) => {
    test.slow();
    await diaComXPEHardcore(page);

    // Tocar no bloco do momento não abre o foco direto: o custo vem escrito antes.
    const estudo3 = page.locator('.block-row', { hasText: '10:00–10:25' });
    await estudo3.locator('.block-name').click();
    await expect(page.locator('#hardcore-start-confirm')).toBeVisible();
    await expect(page.locator('#hardcore-start-block')).toHaveText('Estudo 3 · 25 min');
    await expect(page.locator('#hardcore-start-cost')).toContainText('−100 XP pra você e −100 XP pro');
    // Sem extensão neste navegador, o consentimento avisa que a lista não vai bloquear nada.
    await expect(page.locator('#hardcore-start-sites')).toContainText('Extensão não encontrada');
    await page.locator('#hardcore-start-btn').click();
    await expect(page.locator('#hardcore-start-confirm')).toBeHidden();
    await expect(page.locator('#focus-overlay')).toBeVisible();
    await expect(page.locator('#focus-hardcore')).toBeVisible();
    await expect(page.locator('.focus-exit')).toHaveCount(0); // sem "Sair do foco"
    await expect(page.locator('#timer-bar .timer-stop')).toHaveCount(0); // nem "Parar"

    // Desistir mostra a conta exata; confirmar cobra na hora.
    await page.locator('#hardcore-quit').click();
    await expect(page.locator('#hardcore-quit-confirm')).toBeVisible();
    await expect(page.locator('#hardcore-quit-confirm')).toContainText('Desistir de Estudo 3?');
    await expect(page.locator('#hardcore-quit-confirm')).toContainText('Você perde 100 XP.');
    await expect(page.locator('#hardcore-quit-confirm')).toContainText('perde 100 XP e cai do Lv. 5 pro Lv. 4.');
    await page.locator('#hardcore-quit-btn').click();
    await expect(page.locator('#focus-overlay')).toBeHidden();
    await expect(page.locator('#timer-bar')).not.toHaveClass(/active/);
    await expect(page.locator('#toast')).toContainText('Desistiu de Estudo 3 · −100 XP');
    await expect(page.locator('#xp-total')).toHaveText('250');

    // O bloco fica abandonado: sem check, e não aceita clique.
    await expect(estudo3).toHaveClass(/forfeited/);
    await expect(estudo3.locator('.block-xp')).toHaveText('desistiu');
    await estudo3.locator('.check').click();
    await expect(estudo3.locator('.check')).not.toHaveClass(/checked/);
    await expect(page.locator('#toast')).toContainText('Você desistiu deste bloco');
    await estudo3.locator('.block-name').click();
    await expect(page.locator('#hardcore-start-confirm')).toBeHidden();

    // O pet desceu de nível na hora (a forma fica).
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#ap-lv')).toHaveText('Lv. 4');
    await expect(page.locator('#ap-species')).toHaveText('Gato');
  });

  test('29. hardcore: fechar o app no meio do estudo e voltar depois do fim cobra o abandono', async ({ page }) => {
    test.slow();
    await diaComXPEHardcore(page);
    await page.locator('.block-row', { hasText: '10:00–10:25' }).locator('.block-name').click();
    await page.locator('#hardcore-start-btn').click();
    await expect(page.locator('#focus-hardcore')).toBeVisible();

    // Recarregar no meio do bloco não é sair: o foco volta em hardcore.
    page.on('dialog', (d) => void d.accept()); // o "certeza que quer sair?" do navegador
    await page.clock.setFixedTime(new Date('2026-09-03T10:15:00'));
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#focus-overlay')).toBeVisible();
    await expect(page.locator('#focus-hardcore')).toBeVisible();
    await expect(page.locator('#focus-time-big')).toHaveText(/^(09|10):\d\d$/);
    await expect(page.locator('#xp-total')).toHaveText('350');

    // Fechou e só voltou depois que o bloco acabou: abandono, cobrado ao abrir. O relógio só anda com
    // a página fora do ar — com o app aberto, o tick do timer veria o fim e emendaria (não é abandono).
    await page.goto('about:blank');
    await page.clock.setFixedTime(new Date('2026-09-03T10:40:00'));
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#focus-overlay')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('O app fechou no meio de Estudo 3 · −100 XP');
    await expect(page.locator('#xp-total')).toHaveText('250');
    await expect(page.locator('.block-row', { hasText: '10:00–10:25' })).toHaveClass(/forfeited/);
    await expect
      .poll(() => page.evaluate(() => (JSON.parse(sessionStorage.getItem('study-pets:teste:usuario-teste') ?? '{}').penalties?.['2026-09-03'] ?? []).length))
      .toBe(1);

    // Abrir de novo não cobra duas vezes.
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#xp-total')).toHaveText('250');
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

  test('34. a aba Análise mostra, nas quatro sub-abas, o que o dia encerrado deixou', async ({ page }) => {
    test.slow(); // 7 checks, fechar o dia e percorrer as quatro vistas
    await abrirApp(page);
    await page.locator('#tour-skip').click(); // o balão do Plano cobre as abas dos dias

    // O dia padrão tem 16 estudos (385 min planejados; o almoço das 13h corta o 8º, e a sobra de 15 min
    // antes das 18h vira um mini — desde 2026-09-10). Marcar os 7 primeiros = 175 min cumpridos, e encerrar consolida tudo.
    for (let i = 0; i < 7; i++) await checksDeEstudo(page).nth(i).click();
    await page.locator('.finish-day-btn').click();
    await page.locator('#finish-day-confirm').getByRole('button', { name: 'Encerrar dia' }).click();
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#xp-total')).toHaveText('350');

    await page.getByRole('button', { name: /Análise/ }).click();
    await expect(page.locator('#analytics-page')).toHaveClass(/visible/);
    await page.locator('#tour-skip').click(); // o balão da Análise fica em cima da sub-nav (teste 36 cobre ele)
    await expect(page.locator('#tour-balloon')).toHaveCount(0);

    // Cartão de perfil e sparkline: sempre visíveis, com o XP do dia fechado.
    await expect(page.locator('#an-level-name')).toHaveText('Iniciante'); // 350 XP
    await expect(page.locator('#an-level-sub')).toHaveText('Faltam 400 XP para Focado');
    await expect(page.locator('#an-xp-label')).toHaveText('350 XP');
    await expect(page.locator('#an-xp-next')).toHaveText('750 XP');
    await expect(page.locator('#an-sparkline polyline')).toHaveAttribute('points', /\d/);

    // Hoje é a vista padrão: 175 dos 385 min planejados.
    await expect(page.locator('#an-subnav .subnav-chip.active')).toHaveText('Hoje');
    expect(await realizado(page, 'adherence-today')).toEqual({ done: 175, planned: 385 });
    await expect(page.locator('#adherence-today')).toHaveClass(/adh-big/);
    await expect(page.locator('#adherence-today .adh-sub')).toHaveText('2.9h de 6.4h');
    await expect(page.locator('#adherence-today .adh-pct')).toHaveText('45%'); // 175/385
    // Meta de 60 min: só hoje bateu, e hoje é o dot com anel.
    await expect(page.locator('#goal-week-headline-h')).toContainText('1 de 7 dias');
    await expect(page.locator('#goal-week-dots-h .goal-dot')).toHaveCount(7);
    await expect(page.locator('#goal-week-dots-h .goal-dot.met')).toHaveCount(1);
    await expect(page.locator('#goal-week-dots-h .goal-dot.today')).toHaveClass(/met/);

    // Semana: o mesmo cumprido, sobre um planejado maior (a semana inteira).
    await page.locator('#an-subnav .subnav-chip[data-view="semana"]').click();
    await expect(page.locator('.subview[data-view="semana"]')).toHaveClass(/active/);
    const semana = await realizado(page, 'adherence-week');
    expect(semana.done).toBe(175);
    expect(semana.planned).toBeGreaterThan(385);
    await expect(page.locator('#goal-week-dots .goal-dot.today')).toHaveCount(0); // o anel é só na vista Hoje
    // Conclusão por sessão: as quatro sessões do dia, com o que foi marcado em cada uma —
    // a 1ª inteira (4 estudos), a 2ª parou no 3º, e as duas da tarde ficaram zeradas.
    // O denominador conta os dias JÁ FECHADOS da semana (seg, ter e hoje, que foi
    // encerrado): 3 × 4 estudos em cada sessão (a última ganhou o mini das 17:45). Dia
    // futuro NÃO entra — era o bug do `isPast`, que inflava isto pro período inteiro.
    const sessoes = page.locator('#dropoff-chart .dropoff-row');
    await expect(sessoes).toHaveCount(4);
    await expect(sessoes.nth(0)).toContainText('Sessão 1');
    await expect(sessoes.nth(0).locator('.do-count')).toHaveText('4/12');
    await expect(sessoes.nth(1).locator('.do-count')).toHaveText('3/12');
    await expect(sessoes.nth(2).locator('.do-count')).toHaveText('0/12');
    await expect(sessoes.nth(3).locator('.do-count')).toHaveText('0/12');

    // Geral: agrega todos os dias com dados até hoje; heatmap 7×16 e as horas da rotina (9h–19h).
    await page.locator('#an-subnav .subnav-chip[data-view="geral"]').click();
    const geral = await realizado(page, 'adherence-geral');
    expect(geral.done).toBe(175);
    expect(geral.planned).toBeGreaterThanOrEqual(385);
    await expect(page.locator('#heatmap-grid-gh .heatmap-cell')).toHaveCount(7 * 16);
    await expect(page.locator('#heatmap-grid-gh .heatmap-cell[title^="02/09"]')).toHaveAttribute('title', '02/09 (hoje): 175 de 60 min (292%)');
    await expect(page.locator('#hour-bar-chart .bar-wrap')).toHaveCount(11);
    await expect(page.locator('#hour-bar-chart .bar-wrap').first()).toHaveAttribute('title', '9h: 2 blocos concluídos');

    // Recordes: 7 blocos marcados, 1 dia de sequência, 350 XP no melhor dia.
    await page.locator('#an-subnav .subnav-chip[data-view="recordes"]').click();
    await expect(page.locator('#an-total-checks')).toHaveText('7');
    await expect(page.locator('#an-streak')).toHaveText('1');
    await expect(page.locator('#an-best-week')).toHaveText('7');
    await expect(page.locator('#an-cur-streak')).toHaveText('1 dias');
    await expect(page.locator('#an-best-streak')).toHaveText('1 dias');
    await expect(page.locator('#an-best-day')).toHaveText('02/09 (7)');
    await expect(page.locator('#an-best-xp')).toHaveText('350 XP');
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
    test.slow(); // dois dias, adoção, resumo, modal do pet e evolução: passa de 30s com a suíte em paralelo
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
    await expect(page.locator('#day-summary-panel .ds-pet-evo')).toBeVisible(); // chegou no nível da escolha
    await page.locator('#day-summary-panel').getByRole('button', { name: 'Continuar' }).click();

    // O Perfil sinaliza (selo no card do pet ativo, contagem em "Meus pets"); tocar no card abre o pet.
    // O pet inicial também chegou no Lv. 5 no dia 1 — toda espécie evolui —, então são dois.
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#ap-lv')).toHaveText('Lv. 5');
    await expect(page.locator('#ap-evo-badge')).toBeVisible();
    await expect(page.locator('#my-pets-evo')).toHaveText('2 podem evoluir');
    await page.locator('#active-pet-card').click();
    await expect(page.locator('#pet-detail-panel')).toBeVisible();
    await expect(page.locator('#pet-detail-panel')).toContainText('Bolt');

    // Escolhe o caminho selvagem dali mesmo: vira lobo e continua sendo o Bolt.
    await page.locator('#pet-detail-panel .shop-btn.evolve').click();
    await expect(page.locator('#pet-evolve-panel')).toBeVisible();
    await page.locator('#pet-evolve-panel .evo-path', { hasText: 'Lobo' }).click();
    await page.locator('#pet-evolve-panel').getByRole('button', { name: 'Evoluir', exact: true }).click();
    await expect(page.locator('#pet-evolve-panel')).toBeHidden();
    await expect(page.locator('#pet-detail-panel')).toBeVisible(); // volta pro modal do pet, não pro "Meus pets"
    await expect(page.locator('#pet-detail-panel')).toContainText('Lobo');
    await expect(page.locator('#pet-detail-panel .shop-btn.evolve')).toHaveCount(0);
    await expect(page.locator('#pet-detail-panel .shop-item-evo-hint')).toHaveText('Evolui no Lv. 15'); // o lobo lunar vem depois
    await page.locator('#pet-detail-all').click();
    await expect(page.locator('#pet-detail-panel')).toBeHidden();
    await expect(page.locator('#my-pets-panel')).toBeVisible();
    await expect(page.locator('#my-pets-grid')).toContainText('Bolt');
    await expect(page.locator('#my-pets-grid')).toContainText('Lobo');
    await page.locator('#my-pets-panel .panel-close').click();
    await expect(page.locator('#ap-evo-badge')).toHaveCount(0); // o Bolt evoluiu: o selo some sozinho
    await expect(page.locator('#my-pets-evo')).toHaveText('1 pode evoluir'); // o pet inicial ainda pode
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

  test('41. arrastar um evento pela alça muda o horário dele, e o plano se refaz em volta', async ({ page }) => {
    await abrirApp(page);
    await page.getByRole('button', { name: '+ Evento' }).click();
    await page.locator('#ev-name').fill('Aula de Cálculo');
    await page.locator('#ev-start').fill('14:00');
    await page.locator('#ev-end').fill('15:30');
    await page.locator('#event-panel').getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.locator('#event-panel')).toBeHidden();

    const evento = page.locator('.block-row.event-row', { hasText: 'Aula de Cálculo' });
    await expect(evento).toContainText('14:00–15:30');

    // Pega na alça e sobe até a linha das 10:30 — o fantasma mostra onde vai cair.
    await evento.scrollIntoViewIfNeeded();
    const alca = await evento.locator('.ev-grip').boundingBox();
    const alvo = await page.locator('.block-row', { hasText: '11:45–12:10' }).boundingBox();
    if (!alca || !alvo) throw new Error('sem posição na tela');
    await page.mouse.move(alca.x + alca.width / 2, alca.y + alca.height / 2);
    await page.mouse.down();
    await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2, { steps: 8 });
    const fantasma = page.locator('#drag-ghost');
    await expect(fantasma).toBeVisible();
    await expect(evento).toHaveClass(/dragging/);
    const horario = (await fantasma.locator('.dg-time').textContent())!.replace(/\s/g, '');
    await page.mouse.up();

    // Onde o fantasma estava é onde o evento ficou — e o modal do evento não abriu.
    await expect(fantasma).toBeHidden();
    await expect(page.locator('#event-delete-confirm')).toBeHidden();
    const movido = page.locator('.block-row.event-row', { hasText: 'Aula de Cálculo' });
    await expect(movido).toContainText(horario.replace('–', '–'));
    await expect(page.locator('.block-row.event-row')).toHaveCount(1); // moveu, não duplicou
    // O plano se refez: nenhum estudo por cima do evento, e sobrou estudo às 14h.
    const inicio = horario.split('–')[0]!;
    await expect(page.locator('.block-row', { hasText: `${inicio}–` })).toHaveCount(1);
    await expect(page.locator('.blocks-list')).toContainText('14:');
  });

  test('42. arrastar a refeição pergunta se é só hoje; "só este dia" não mexe nos outros', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#tour-skip').click(); // o balão do tour cobre as abas dos dias
    const refeicao = page.locator('.block-row.almoco-row');
    await expect(refeicao).toContainText('13:00–14:00');

    await refeicao.scrollIntoViewIfNeeded();
    const alca = await refeicao.locator('.ev-grip').boundingBox();
    const alvo = await page.locator('.block-row', { hasText: '11:45–12:10' }).boundingBox();
    if (!alca || !alvo) throw new Error('sem posição na tela');
    await page.mouse.move(alca.x + alca.width / 2, alca.y + alca.height / 2);
    await page.mouse.down();
    await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + alvo.height / 2, { steps: 8 });
    const horario = (await page.locator('#drag-ghost .dg-time').textContent())!.replace(/\s/g, '');
    await page.mouse.up();

    // É uma série: a pergunta vem antes de mexer em qualquer coisa.
    await expect(page.locator('#event-move-scope')).toBeVisible();
    await expect(page.locator('.block-row.almoco-row')).toContainText('13:00–14:00'); // ainda no lugar
    await page.locator('#event-move-day').click();
    await expect(page.locator('#event-move-scope')).toBeHidden();
    await expect(page.locator('.block-row.almoco-row')).toContainText(horario);

    // Amanhã continua almoçando às 13:00.
    await page.locator('.day-tab', { hasText: 'Qui' }).click();
    await expect(page.locator('.block-row.almoco-row')).toContainText('13:00–14:00');
  });

  // A Semana só existe a partir de 1100px — é lá que arrastar muda o evento de dia.
  test.describe('na Semana', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('43. arrastar um evento na Semana leva ele pra outro dia', async ({ page }) => {
      await abrirApp(page);
      await page.getByRole('button', { name: '+ Evento' }).click();
      await page.locator('#ev-name').fill('Aula de Cálculo');
      await page.locator('#ev-start').fill('14:00');
      await page.locator('#ev-end').fill('15:30');
      await page.locator('#event-panel').getByRole('button', { name: 'Adicionar' }).click();
      await expect(page.locator('#event-panel')).toBeHidden();

      await page.locator('#view-week').click();
      await expect(page.locator('#week-view')).toBeVisible();
      const quarta = page.locator('.wv-col[data-day-key="2026-09-02"]');
      const quinta = page.locator('.wv-col[data-day-key="2026-09-03"]');
      await expect(quarta.locator('.wv-blk.event')).toHaveCount(1);
      await expect(quinta.locator('.wv-blk.event')).toHaveCount(0);

      // Pega o evento na quarta e leva pra quinta, na mesma altura (mesmo horário).
      const bloco = await quarta.locator('.wv-blk.event').boundingBox();
      const col = await quinta.boundingBox();
      if (!bloco || !col) throw new Error('sem posição na tela');
      const y = bloco.y + bloco.height / 2;
      await page.mouse.move(bloco.x + bloco.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(col.x + col.width / 2, y, { steps: 10 });
      await expect(page.locator('#wv-ghost')).toBeVisible();
      await expect(quinta.locator('#wv-ghost')).toHaveCount(1); // o fantasma já está na quinta
      await page.mouse.up();

      // Mudou de coluna, e o clique que fecha o arrasto não abriu o Dia.
      await expect(page.locator('#week-view')).toBeVisible();
      await expect(quarta.locator('.wv-blk.event')).toHaveCount(0);
      await expect(quinta.locator('.wv-blk.event')).toHaveCount(1);
      await expect(quinta.locator('.wv-blk.event')).toHaveAttribute('title', /Arraste/);

      // E o Dia da quinta mostra o evento no horário de sempre.
      await page.locator('.wv-day', { hasText: 'Qui' }).click();
      await expect(page.locator('.block-row.event-row', { hasText: 'Aula de Cálculo' })).toContainText('14:00–15:30');
    });
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

  test('27. o tour contextual: três balões no Plano, um no Perfil, e "Ver o tour de novo"', async ({ page }) => {
    await abrirApp(page);
    const balao = page.locator('#tour-balloon');
    await expect(balao).toBeVisible();
    await expect(balao).toContainText('Seu dia já está montado');
    await expect(balao).toContainText('1/3');
    await expect(page.locator('.tour-ring')).toBeVisible(); // o anel na primeira linha do plano
    await expect(balao).toHaveClass(/tour-above/);
    // Não bloqueia a tela: o check embaixo continua clicável com o balão aberto.
    await checksDeEstudo(page).first().click();
    await expect(checksDeEstudo(page).first()).toHaveClass(/checked/);
    await expect(balao).toContainText('1/3');

    await page.locator('#tour-next').click();
    await expect(balao).toContainText('A vida muda, o plano acompanha');
    await expect(balao).toContainText('2/3');
    await page.locator('#tour-next').click();
    await expect(balao).toContainText('No fim do dia, encerre');
    await expect(balao).toContainText('3/3');
    await expect(page.locator('#tour-next')).toHaveText('Entendi');
    await page.locator('#tour-next').click();
    await expect(balao).toHaveCount(0);

    // Visto fica salvo: recarregar não traz o balão de volta.
    await expect(page.locator('#save-indicator')).toContainText('Modo teste');
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('.block-row').first()).toBeVisible();
    await expect(balao).toHaveCount(0);

    // Cada aba tem o seu, na primeira visita. "Pular" marca a aba inteira.
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(balao).toContainText('Pets são horas estudadas');
    await expect(balao).not.toContainText('1/1'); // balão único não tem contador
    await page.locator('#tour-skip').click();
    await expect(balao).toHaveCount(0);
    await page.getByRole('button', { name: /Plano/ }).click();
    await expect(balao).toHaveCount(0);

    // Configurações → Geral → "Ver o tour de novo": fecha e o 1/3 volta.
    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel').getByRole('button', { name: 'Geral' }).click();
    await page.locator('#tour-restart').click();
    await expect(page.locator('#settings-panel')).toBeHidden();
    await expect(balao).toContainText('Seu dia já está montado');
    await expect(balao).toContainText('1/3');
  });

  test('36. o quinto balão do tour: a Análise, ancorada na sub-nav', async ({ page }) => {
    await abrirApp(page);
    const balao = page.locator('#tour-balloon');
    await page.locator('#tour-skip').click(); // o Plano fica visto
    await expect(balao).toHaveCount(0);

    await page.getByRole('button', { name: /Análise/ }).click();
    await expect(balao).toHaveAttribute('data-step', 'analytics-subnav');
    await expect(balao).toContainText('Tô fazendo o que planejei?');
    await expect(balao).not.toContainText('1/1'); // balão único não tem contador
    await expect(page.locator('.tour-ring')).toBeVisible(); // o anel cai na própria sub-nav
    await expect(page.locator('#tour-next')).toHaveText('Entendi');

    // Não bloqueia a tela: a sub-nav que ele aponta continua clicável com o balão aberto.
    await page.locator('#an-subnav .subnav-chip[data-view="recordes"]').click();
    await expect(page.locator('.subview[data-view="recordes"]')).toHaveClass(/active/);
    await expect(balao).toBeVisible();

    await page.locator('#tour-next').click();
    await expect(balao).toHaveCount(0);

    // Visto fica salvo: recarregar e voltar na aba não traz o balão de volta.
    await expect(page.locator('#save-indicator')).toContainText('Modo teste');
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await page.getByRole('button', { name: /Análise/ }).click();
    await expect(page.locator('#analytics-page')).toHaveClass(/visible/);
    await expect(balao).toHaveCount(0);
  });

  test('37. o personagem: trocar tom de pele, cor e cabelo muda o sprite na hora e sobrevive ao reload', async ({ page }) => {
    await abrirApp(page);
    await page.locator('#tour-skip').click();

    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
    const preview = page.locator('#avatar-preview');
    await expect(preview).toBeVisible();

    // O personagem é desenhado na hora (data: URI), não é arquivo — e cada escolha redesenha.
    const antes = await preview.getAttribute('src');
    expect(antes).toMatch(/^data:image\/png/);

    await page.locator('#avatar-picker [data-swatch="ebano"]').click();
    await expect(page.locator('#avatar-picker [data-swatch="ebano"]')).toHaveClass(/selected/);
    const compele = await preview.getAttribute('src');
    expect(compele).not.toBe(antes);

    await page.locator('#avatar-picker [data-style="cacheado"]').click();
    await expect(page.locator('#avatar-picker [data-style="cacheado"]')).toHaveClass(/selected/);
    const comCabelo = await preview.getAttribute('src');
    expect(comCabelo).not.toBe(compele);

    // Vale na hora, sem "Salvar" — o mesmo sprite já está no Perfil.
    await page.getByRole('button', { name: /Voltar/ }).click();
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#char-sprite')).toHaveAttribute('src', comCabelo!);

    // E é salvo: recarregar traz a mesma aparência de volta.
    await expect(page.locator('#save-indicator')).toContainText('Modo teste');
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#char-sprite')).toHaveAttribute('src', comCabelo!);
  });

  test('40. o personagem no onboarding: a escolha do primeiro passo é a que vale depois', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${DIA}T17:30:00`));
    await page.goto('/');
    await expect(page.locator('#onb-avatar')).toBeVisible();

    const preview = page.locator('#onb-avatar-preview');
    const antes = await preview.getAttribute('src');
    expect(antes).toMatch(/^data:image\/png/);

    await page.locator('#onb-avatar [data-swatch="ebano"]').click();
    await page.locator('#onb-avatar [data-style="longo"]').click();
    await page.locator('#onb-avatar [data-body="curvo"]').click();
    const escolhido = await preview.getAttribute('src');
    expect(escolhido).not.toBe(antes);

    // Ir pro pet e voltar não perde a escolha.
    await page.locator('#onb-avatar-next').click();
    await page.locator('#onb-avatar-back').click();
    await expect(page.locator('#onb-avatar [data-body="curvo"]')).toHaveClass(/selected/);
    await expect(preview).toHaveAttribute('src', escolhido!);

    await page.locator('#onb-avatar-next').click();
    await page.locator('#starter-grid .starter-card[data-species="cat"]').click();
    await page.locator('#onb-next').click();
    await page.getByRole('button', { name: 'Começar' }).click();
    await expect(page.locator('#onboarding-panel')).toBeHidden();

    // É a mesma aparência no Perfil…
    await page.locator('#tour-skip').click();
    await page.getByRole('button', { name: /Perfil/ }).click();
    await expect(page.locator('#char-sprite')).toHaveAttribute('src', escolhido!);

    // …e as Configurações abrem com ela selecionada.
    await page.getByRole('button', { name: /Plano/ }).click();
    await page.getByRole('button', { name: 'Configurações' }).click();
    await page.locator('#settings-panel .settings-tab[data-tab="general"]').click();
    await expect(page.locator('#avatar-picker [data-swatch="ebano"]')).toHaveClass(/selected/);
    await expect(page.locator('#avatar-picker [data-body="curvo"]')).toHaveClass(/selected/);
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

    test('44. a alça do evento arrasta com o dedo, sem virar seleção de grupo', async ({ page }) => {
      await abrirApp(page);
      const refeicao = page.locator('.block-row.almoco-row');
      await expect(refeicao).toContainText('13:00–14:00');
      await refeicao.scrollIntoViewIfNeeded();

      const cdp = await page.context().newCDPSession(page);
      const toque = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [p] : [] });
      const alca = (await refeicao.locator('.ev-grip').boundingBox())!;
      const alvo = (await page.locator('.block-row', { hasText: '11:45–12:10' }).boundingBox())!;
      const a = { x: alca.x + alca.width / 2, y: alca.y + alca.height / 2 };

      await toque('touchStart', a);
      for (let i = 1; i <= 6; i++) await toque('touchMove', { x: a.x, y: a.y + ((alvo.y + alvo.height / 2 - a.y) * i) / 6 });
      // É arrasto de evento, não seleção de trecho: nada de linha selecionada.
      await expect(page.locator('#drag-ghost')).toBeVisible();
      await expect(page.locator('.block-row.selecting')).toHaveCount(0);
      const horario = (await page.locator('#drag-ghost .dg-time').textContent())!.replace(/\s/g, '');
      await toque('touchEnd');

      await expect(page.locator('#event-move-scope')).toBeVisible();
      await page.locator('#event-move-day').click();
      await expect(page.locator('.block-row.almoco-row')).toContainText(horario);
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
