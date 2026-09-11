// As páginas legais (public/legal/) são HTML estático, fora do app.
//
// Por que fora: o console do Google pede uma URL pública de política de privacidade, o
// Impressum tem que ser alcançável sem login, e nenhuma das três pode depender de o app
// carregar — se o Study Pets estiver fora do ar, o dever do § 5 DDG continua de pé.
//
// Por serem estáticas, nada no build as checa: um link quebrado, um @font-face apontando
// pro vazio ou um campo por preencher passam direto pro ar. Daí estes testes.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = new URL('../', import.meta.url);
const PAGINAS = ['privacidade', 'termos', 'impressum'] as const;
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), 'utf8');
const html = Object.fromEntries(PAGINAS.map((p) => [p, ler(`public/legal/${p}.html`)])) as Record<
  (typeof PAGINAS)[number],
  string
>;
const css = ler('public/legal/legal.css');

describe('as três páginas legais', () => {
  it('existem, são em português e carregam o mesmo CSS', () => {
    for (const pagina of PAGINAS) {
      const doc = html[pagina];
      expect(doc, `${pagina}: falta o lang`).toContain('<html lang="pt-BR">');
      expect(doc, `${pagina}: falta o title`).toMatch(/<title>.+· Study Pets<\/title>/);
      expect(doc, `${pagina}: não carrega o legal.css`).toContain('href="/legal/legal.css"');
    }
  });

  it('uma leva às outras duas, e todas levam de volta pro app', () => {
    for (const pagina of PAGINAS) {
      const doc = html[pagina];
      expect(doc, `${pagina}: não volta pro app`).toContain('href="/"');
      for (const outra of PAGINAS) {
        expect(doc, `${pagina} não linka ${outra}`).toContain(`href="/legal/${outra}.html"`);
      }
    }
  });

  it('todo link interno aponta pra arquivo que existe', () => {
    for (const pagina of PAGINAS) {
      for (const [, href] of html[pagina].matchAll(/href="(\/[^"]+)"/g)) {
        if (href === '/') continue;
        expect(existsSync(new URL(`public${href}`, raiz)), `${pagina} aponta pra ${href}, que não existe`).toBe(true);
      }
    }
  });

  it('nenhuma fala com o Google Fonts — seria piada numa política de privacidade', () => {
    for (const [nome, doc] of [...Object.entries(html), ['legal.css', css]] as [string, string][]) {
      expect(doc, `${nome} busca fonte de terceiro`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it('as fontes que o CSS declara existem em public/fonts/', () => {
    const arquivos = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);
    expect(arquivos.length).toBeGreaterThan(0);
    for (const arquivo of arquivos) {
      expect(existsSync(new URL(`public/fonts/${arquivo}`, raiz)), `${arquivo} não existe`).toBe(true);
    }
  });

  it('o aviso de rascunho e os campos por preencher andam juntos', () => {
    // O invariante que impede os dois erros opostos: publicar com um endereço faltando e
    // sem aviso nenhum, ou deixar o aviso vermelho depois de já ter preenchido tudo.
    for (const pagina of PAGINAS) {
      const doc = html[pagina];
      const faltando = [...doc.matchAll(/class="falta"/g)].length;
      const temAviso = doc.includes('class="rascunho"');
      if (faltando > 0) {
        expect(temAviso, `${pagina} tem ${faltando} campo(s) por preencher e nenhum aviso na tela`).toBe(true);
      } else {
        expect(temAviso, `${pagina} não tem mais nada por preencher — o aviso de rascunho pode sair`).toBe(false);
      }
    }
  });

  it('o Impressum tem os três itens que o § 5 DDG exige', () => {
    const doc = html.impressum;
    expect(doc, 'falta o nome do responsável').toContain('Tomás Spielmann');
    expect(doc, 'falta o endereço postal').toMatch(/endereço postal|rua e número|Alemanha/);
    expect(doc, 'falta o contato').toMatch(/E-mail|e-mail/);
  });

  it('a política diz o que a lei manda dizer', () => {
    const doc = html.privacidade;
    for (const assunto of [
      'Quem é o responsável',
      'Que dados o app guarda',
      'Com que base legal',
      'Quem mais toca nesses dados',
      'Por quanto tempo',
      'Seus direitos',
      'Idade mínima',
      'Contato',
    ]) {
      expect(doc, `a política não tem a seção "${assunto}"`).toContain(assunto);
    }
    // Os dois caminhos que o próprio app já oferece, e que valem pelos arts. 15, 17 e 20.
    expect(doc).toContain('Baixar (JSON)');
    expect(doc).toContain('Apagar conta');
  });
});

describe('os dois documentos internos', () => {
  // O registro do art. 30 e o plano de incidente não vão pro ar: são o que se mostra a uma
  // autoridade que pergunte "que dados você trata" e "o que você faz num vazamento".
  const INTERNOS = ['registro-tratamento', 'plano-de-incidente'] as const;
  const md = Object.fromEntries(INTERNOS.map((d) => [d, ler(`docs/${d}.md`)])) as Record<
    (typeof INTERNOS)[number],
    string
  >;

  it('o registro do art. 30 tem as sete colunas que o artigo pede', () => {
    const doc = md['registro-tratamento'];
    for (const item of [
      'Responsável',
      'Finalidades',
      'Categorias de titulares',
      'Categorias de dados pessoais',
      'Destinatários',
      'Transferência internacional',
      'Prazos de eliminação',
      'Medidas técnicas e organizacionais',
    ]) {
      expect(doc, `o registro não tem a seção "${item}"`).toContain(item);
    }
  });

  it('o plano de incidente tem o prazo, a autoridade e o modelo', () => {
    const doc = md['plano-de-incidente'];
    expect(doc, 'falta o prazo do art. 33').toContain('72 horas');
    expect(doc, 'falta a autoridade competente').toContain('BayLDA');
    expect(doc, 'falta a autoridade brasileira').toContain('ANPD');
    expect(doc, 'falta o modelo de notificação').toMatch(/Modelo/);
  });

  it('os dois se apontam, e apontam pra política pública', () => {
    expect(md['registro-tratamento']).toContain('plano-de-incidente.md');
    expect(md['plano-de-incidente']).toContain('registro-tratamento.md');
    expect(md['registro-tratamento']).toContain('privacidade.html');
  });

  it('interno e público estão no mesmo estado de preenchimento', () => {
    // A armadilha real: preencher o endereço nas três páginas públicas e esquecer dos dois
    // documentos internos (ou o contrário). São os MESMOS três fatos — endereço, e-mail e a
    // região do Firestore — e eles não podem discordar entre si.
    const publicoPendente = PAGINAS.some((p) => html[p].includes('class="falta"'));
    const internoPendente = INTERNOS.some((d) => md[d].includes('[preencher:'));
    expect(
      internoPendente,
      publicoPendente
        ? 'as páginas públicas ainda têm campo por preencher, mas os documentos internos já foram preenchidos — eles vão discordar'
        : 'as páginas públicas já foram preenchidas, mas os documentos internos ainda têm campo pendente',
    ).toBe(publicoPendente);
  });
});

describe('as páginas legais dentro do app', () => {
  it('a tela de login leva às três', () => {
    const login = ler('src/features/auth/LoginScreen.tsx');
    for (const pagina of PAGINAS) expect(login, `o login não linka ${pagina}`).toContain(`/legal/${pagina}.html`);
  });

  it('as Configurações levam às três', () => {
    const config = ler('src/features/settings/SettingsPage.tsx');
    expect(config).toContain('/legal/');
    for (const pagina of PAGINAS) expect(config).toContain(`'${pagina}'`);
  });

  it('o service worker não engole as URLs delas', () => {
    // navigateFallback manda QUALQUER navegação pro index.html precacheado. Sem o
    // denylist, /legal/privacidade.html abriria o app — inclusive pro console do Google.
    expect(ler('vite.config.ts')).toMatch(/navigateFallbackDenylist:\s*\[\/\^\\\/legal\\\/\/\]/);
  });
});
