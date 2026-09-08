# Bloqueio de sites: feature própria, abrangente, e testada num navegador de verdade

**Branch:** `feat/bloqueio-de-sites` (a partir de `origin/main` = `feat/tema-cafe`, 080478a)
**Quando:** 2026-09-08, tarefa agendada `study-pets-bloqueio-sites` (o Tomi dormindo)
**Nunca mergeada** — merge é decisão do Tomi.

## O pedido

> "Tá muito ruim essa coisa de bloquear sites. Não funciona e não fica muito claro. Ia ser
> interessante dar a opção pro usuário de bloquear sites **sem** modo hardcore. Faz isso
> direitinho. E seria bom se funcionasse **de modo geral**: chess.com tem uma caralhada de coisa
> depois, nunca é só chess.com — se o usuário botar chess.com, que bloqueie tudo."

Três reclamações, três respostas:

| "Não funciona" | A extensão nunca tinha rodado num navegador de verdade. Agora roda: `npm run test:ext`, cinco cenários verdes. E o usuário tem o **"▶ Testar por 1 min"** pra ver na hora. |
| "Não fica claro" | A UI mostra o que entendeu (chips), o que **não** entendeu ("não entendi: chess"), se a extensão está lá (com a versão), e se está bloqueando agora (com o número de sites e até que horas — vindo da própria extensão). Mais badge "ON" e popup no ícone. |
| "De modo geral" | Uma entrada cobre o domínio, todo subdomínio, qualquer caminho e porta — e os **apelidos** (`youtu.be`, `x.com`, `t.co`, `fb.watch`, `instagr.am`, `redd.it`). |

E o principal: **bloquear site saiu de dentro do hardcore**. São coisas diferentes — uma é uma
ferramenta, a outra é uma aposta com XP.

## O que entrou (7 commits, um por item)

1. **Domínio e doc** — `src/domain/siteBlock.ts` (normalização, `parseSites` com os inválidos,
   `SITE_ALIASES`/`expandSites`, config, `migrateSiteBlock`). `config.siteBlock` novo,
   `config.hardcore` reduzido a `{ enabled }`, `schemaVersion` **4** com migração na leitura.
2. **Aplicação** — `src/application/siteBlock.ts`, fonte única do que a extensão recebe.
   `extensionBridge` com payload `v: 2`, eventos `study-pets:blocking*` e o ack.
3. **Extensão v2** — ack, badge, popup, `tabs.onUpdated`, `stopped`/`unknown`, README pro usuário.
4. **UI** — a seção "Bloqueio de sites" em Configurações → Geral; o hardcore fica só com a
   penalidade; a linha no consentimento; o selo na barra do timer e no foco.
5. **`npm run test:ext`** — a extensão num Chromium de verdade.
6. **Smoke 33** — a UI e o evento publicado, sem extensão.
7. **Docs** — este arquivo, CLAUDE.md, IDEIAS.md.

## As decisões, e onde trocar de ideia

### Quando bloqueia

Enquanto um **estudo** está rodando no timer do app — foco aberto ou só a barra, com ou sem
hardcore. Pausa libera (é a saída natural do pomodoro); bloco aberto antes da hora ("em espera")
não bloqueia, porque nada começou.

Onde mudar: `desiredPayload` em `src/application/siteBlock.ts` (`runningStudy`).

### `stopped` x `unknown` — a decisão que impede o escape

O timer do app é runtime (`derived.timerBlock`) e **não sobrevive a um reload**. Se ao carregar a
página o app dissesse "inativo", recarregar o Study Pets liberaria o site no meio do estudo — a
porta de escape mais óbvia do mundo.

Então:

- o app só manda **`stopped`** quando **ele** encerrou (fim do bloco, ✕ Parar, Desistir, fim do
  dia, logout) — e só se aquela carga da página armou algo antes (`published !== null`);
- à pergunta da extensão sem nada rodando, responde **`unknown`**, e a extensão **mantém** o que
  tinha até o alarme do `until` vencer.

Isso significa que um pomodoro de 25 min pode deixar a regra de pé por até 25 min mesmo se o
usuário fechar a aba. É o teto, e é curto. A alternativa (limpar ao perder o app de vista) foi
descartada: transformaria "recarregar" em botão de desbloquear.

Onde mudar: `syncBlocking`/`answerExtensionQuery` em `application/siteBlock.ts` e o `apply` do
`extension/background.js`.

### Apelidos numa tabela, não num algoritmo

`SITE_ALIASES` é pequena e explícita (6 entradas). Nada de adivinhar encurtador por heurística: o
usuário precisa conseguir prever o que o app vai bloquear, e a UI mostra o apelido no chip. A
expansão acontece no app; **a extensão continua burra** e recebe a lista pronta.

Onde mudar: `SITE_ALIASES` em `src/domain/siteBlock.ts` (mais uma linha, e o teste já cobre que
todo apelido é um domínio válido).

### O que NÃO fizemos, de propósito

- **Firefox**: Manifest V3 lá tem diferenças (`background.scripts`, permissões). Não testado.
- **Celular**: extensão não existe. O hardcore continua cobrando XP; bloquear, não.
- **Loja do Chrome**: publicar exige conta de desenvolvedor, revisão e política de privacidade.
  Carregar sem compactação resolve pra uma pessoa.
- **`sub_frame`**: só `main_frame` é redirecionado — bloquear *abrir* o YouTube, não quebrar um
  site que embute um vídeo.
- **Bloqueio por agenda** (fora do estudo, tipo "das 9 às 18"): é outra feature, e o app é sobre
  o pomodoro. Anotado como ideia.
- **Trocar de aba não pune**: continua valendo (v1 consciente do hardcore).

## Números reais

| Suíte | Resultado |
|---|---|
| `npm test` (Vitest) | **596 testes, 41 arquivos — verde** |
| `npm run typecheck` | **verde** |
| `PW_PORT=5182 CI=1 npx playwright test` (smoke) | **31 testes — verde** |
| `npm run test:ext` (extensão em navegador de verdade) | **5 testes — verde** |
| `npm run build` | **verde** |

O `test:ext` é a prova que faltava: Chromium completo, extensão carregada, o site caindo na tela
do pet de verdade. Cenários: (1) "Testar por 1 min" bloqueia `www.chess.test/play/online` e
`livre.test` abre; (2) estudo sem hardcore bloqueia e redireciona a aba já aberta, "✕ Parar"
libera; (3) "permitir só estes"; (4) hardcore com a linha no consentimento e "custa XP" na tela;
(5) recarregar a página do app **não** libera.

Nota técnica que vale ouro pra próxima vez: o `spawn UNKNOWN` do Chromium completo (diagnosticado
em 2026-09-06 como "o Cold Turkey barra") era **a virtualização MSIX do app Claude** sobre
`%LOCALAPPDATA%\ms-playwright`. Pelo caminho real
(`AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright\chromium-NNNN\chrome-win64\chrome.exe`)
ele abre, carrega extensão e roda headless. `scripts/chromium-exe.mjs` cuida disso.

---

# Manual de teste

## Parte 1 — no modo teste, sem extensão (5 minutos)

O objetivo aqui é ver a **UI**: que a lista é entendida, que o que não é domínio aparece, e que o
bloqueio é independente do hardcore.

```bash
git checkout feat/bloqueio-de-sites && npm install && npm run dev:teste
```

Abre `http://localhost:5174`.

1. Passa pelo onboarding (qualquer pet, "Começar") e fecha o tour ("Pular").
2. **⚙️ → Geral.** Entre "Meta diária" e "Modo hardcore" tem uma seção nova: **BLOQUEIO DE SITES**.
3. Liga o switch **"Bloquear sites durante o estudo"**. Aparecem os chips de modo, a caixa de
   sites e, embaixo, o status da extensão.
4. Cola isto na caixa (com a URL inteira e uma linha capenga de propósito):
   ```
   https://www.chess.com/play/online
   youtube.com
   chess
   twitter.com
   ```
   **O que você deve ver**, logo abaixo da caixa:
   - três chips: `chess.com`, `youtube.com (+ youtu.be)`, `twitter.com (+ x.com, t.co)` — a URL
     inteira virou domínio, e os apelidos entraram sozinhos;
   - em laranja: **"Não entendi: chess"** — nada some em silêncio;
   - o status em laranja: **"Extensão não encontrada"**, com os 3 passos de instalação. O botão de
     testar **não** aparece (sem extensão não há o que testar).
5. Repara que a seção **Modo hardcore**, logo abaixo, agora tem só o switch e a linha
   *"Bloquear sites é separado — veja 'Bloqueio de sites' acima."*
6. **Salvar**. Volta pro Plano.
7. Toca num bloco de estudo que esteja rolando (ou ajusta as janelas do dia pra ter um agora).
   **O foco abre direto** — sem o modal de consentimento, porque bloqueio ≠ hardcore.
8. Volta em ⚙️ → Geral e liga **também** o Modo hardcore. Salva. Agora tocar num estudo abre o
   consentimento, e ele traz uma linha a mais: *"🛡️ Extensão não encontrada — sem bloqueio de
   sites neste navegador."* (com a extensão instalada, essa linha lista os sites).

## Parte 2 — com a extensão, no seu Chrome (10 minutos)

Aqui é onde se vê o bloqueio de verdade.

1. **Instalar**: `chrome://extensions` → **Modo do desenvolvedor** (canto de cima à direita) →
   **Carregar sem compactação** → escolhe a pasta `extension/` do repositório.
   O nome que aparece é **"Study Pets"** (não é mais "modo hardcore").
2. Volta pro `http://localhost:5174` e **recarrega a página**.
3. ⚙️ → Geral → Bloqueio de sites. Agora o status é verde: **"✓ Extensão encontrada · v0.2.0"**, e
   apareceu o botão **"▶ Testar por 1 min"**.
4. Escreve na caixa um site que você abriria pra procrastinar — `chess.com`, digamos — e clica
   **"▶ Testar por 1 min"** (não precisa salvar).
   - O botão vira **"■ Parar teste"**, e o status vira **"✓ Teste rodando · 1 site até HH:MM"**.
   - O **ícone da extensão ganha a badge "ON"**. Clica nele: o popup diz o que está bloqueado e
     até quando.
   - Abre `https://www.chess.com/play/online` numa aba nova → cai na **tela do pet**, com
     *"Funcionou 🎉"* e a contagem. Repara que funcionou com `www.` e com caminho.
   - Abre qualquer outro site → normal.
   - Clica **"■ Parar teste"** → `chess.com` volta a abrir na hora, e a badge apaga.
5. Agora o fluxo de verdade: **Salvar** com o bloqueio ligado, e tocar num **estudo** no Plano.
   - Enquanto o estudo roda, `chess.com` cai na tela do pet — e a frase de saída é
     *"Pra sair antes, pare o estudo lá no app."*
   - Deixa uma aba do `chess.com` **já aberta** antes de começar o estudo: ela é redirecionada
     sozinha quando o bloco começa.
   - No foco (e na barra do timer) aparece a linha discreta **"🛡️ 1 site bloqueado"**.
   - **"✕ Parar"** no timer → libera na hora.
6. **A pausa libera**: deixa o pomodoro terminar dentro do foco. Ele emenda na pausa, e nesse
   momento `chess.com` volta a abrir. Quando o estudo seguinte começa, bloqueia de novo.
7. **Recarregar não é escapar**: com um estudo rodando, dá F5 na aba do Study Pets. O foco some
   (o timer é runtime), mas `chess.com` **continua bloqueado** até o horário em que o bloco
   terminaria. É de propósito.
8. **Com hardcore**: liga o Modo hardcore também. O consentimento agora diz
   *"🛡️ chess.com fica bloqueado até o fim."*, e a tela do pet muda a frase para
   *"Pra sair antes, desista lá no app — custa XP."* "Desistir" libera (e cobra o XP).
9. **"Permitir só estes"**: troca o chip de modo e põe só `wikipedia.org`. Durante o estudo,
   tudo cai na tela do pet — menos a wikipedia, o próprio Study Pets e o login do Google.

> Se você mexer nos arquivos da extensão depois: `chrome://extensions` → **↻** na extensão, e
> recarrega a aba do app.

## Antes de mergear

- Conta real (`npm run dev`) migra sozinha: um doc com `hardcore: {enabled, mode, sites}` vira
  `siteBlock` com a mesma lista e o mesmo "ligado", e `hardcore` fica só `{enabled}`.
  `schemaVersion` sobe pra 4 no primeiro save.
- Nada mais precisa ser configurado (sem Firebase, sem Vercel, sem loja).

## Ideias que ficaram anotadas

- Bloqueio por agenda ("das 9 às 18"), fora do pomodoro.
- Publicar a extensão na loja do Chrome (hoje é carregar sem compactação).
- Firefox / celular.
- Uma lista de sugestões prontas ("os 10 que mais roubam tempo") no primeiro uso.
- Contar quantas vezes o usuário tentou abrir um site bloqueado, e mostrar isso na Análise —
  com cuidado pra não virar bronca (o app não faz o usuário se sentir mal).
