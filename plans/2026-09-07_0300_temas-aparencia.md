# Temas de aparência (Escuro · Lamparina · Papel · Aveia)

> **Branch de reserva — não vai pra `main`.** Em 2026-09-07 estes commits chegaram a entrar na `main`
> (PR #1, fast-forward) e foram retirados de lá no mesmo dia: o Tomi preferiu seguir com a linguagem
> visual do **Café de casa** (branch `feat/tema-cafe`, que tem a tokenização própria dela). Esta branch
> fica parada como reserva, pra caso alguma destas paletas seja aproveitada depois. Se um dia for
> reaproveitada: a tokenização daqui (item 1) e a do Café de casa mexem nas mesmas linhas do `app.css`,
> então é escolher uma das duas como base, não juntar as duas.

Branch `feat/temas`, a partir de `origin/main` (835cb30, 2026-09-07). Cinco commits, um por item.

## O que entrou

1. **Tokenização do CSS** (`fb2c1cc`). Toda cor literal de `src/styles/app.css` e `login.css` virou token
   semântico no `:root`: `--on-accent`, `--border-hover`/`--border-hover-soft`/`--border-strong`, `--danger`/
   `--danger-soft`/`--danger-strong`/`--on-danger`, `--star*`/`--coin`, `--scrim`, `--hairline`/`--track`/
   `--overlay-soft`/`--overlay-mid` (os brancos com alpha, derivados de `--ink-rgb`), os gradientes do hero e
   do pet ativo, o anel do foco, as listras do intervalo, os cinzas por função (`--text-soft`, `--muted-dim`,
   `--muted-faint`, `--text-dim`, `--text-faint`). Os `rgba(cor, alpha)` de cor conhecida viraram
   `rgba(var(--x-rgb), alpha)`. Sessões (`.s0`–`.s5`) e grupos (`gc-0`…`gc-5`) mantêm as classes; os valores
   moram em `--session-N*` e `--group-N-rgb`. `color-scheme` dos inputs e o filtro do ícone do calendário
   viraram token. `HEAT_COLORS` saiu de `domain/analytics.ts` (cor no domínio violava a regra de camadas):
   o domínio devolve só o degrau (`HEAT_LEVELS = 5`), a célula ganha a classe `heat-N`, e `--heat-0`…`--heat-4`
   moram no CSS. O ✓ do check usa `stroke="currentColor"` e a cor vem de `.check.checked`.
   **Sem mudança visual**, provado: 35 capturas (celular 480px e laptop 1480px — Plano com grupo, evento,
   janelas, encerrar/resumo, foco, timer, Análise nas quatro vistas, Perfil, Meus pets, Loja, adotar,
   Configurações Geral/Estrutura/Encaixar/Apagar conta, hardcore consentimento/foco/desistir/abandonado,
   login, Semana) batem com a referência de antes (Playwright `toHaveScreenshot`, ≤30px de ruído de
   antialiasing, sprites mascarados). O spec ficou fora do repo (era ferramenta da tarefa).
2. **Os três temas** (`89253c1`). Blocos `:root[data-theme="lamp|paper|oat"]` no fim do `app.css`, só tokens.
   `dark` é o `:root`, sem bloco. Entraram junto três tokens de texto (`--accent-text`, `--orange-text`,
   `--blue-text`) e `--accent-line` — ver decisões — e os filtros de linha por token.
3. **Persistência e boot** (`8ecba75`). `config.theme` no doc (padrão `'dark'`; `hydrateUserDoc` normaliza;
   `serializeState` leva). `domain/theme.ts` (catálogo, sem cor), `infrastructure/theme.ts` (o `<html>`, a meta
   `theme-color`, o `localStorage`), `application/appearance.ts` (`setTheme`, `syncThemeFromState`). Script
   inline no `index.html` aplica o tema guardado antes do primeiro paint; o doc confirma ou corrige depois
   (`initAfterLoad` e `applyRemoteDoc`).
4. **O card "Aparência"** (`5b38124`) em Configurações → Geral, entre Meta diária e Modo hardcore:
   `#theme-picker`, `.theme-option[data-theme-id]`, `.selected` com borda de accent e ✓. A miniatura
   `.tp-preview[data-theme]` é pintada com os tokens do próprio tema (o seletor de cada bloco de tema também
   casa com ela). Aplicar é imediato e já salva; não entra no rascunho do Salvar.
5. **Testes, e2e e docs** (este commit): `tests/theme.test.ts`, `tests/application-appearance.test.ts`,
   os casos novos em `persistence`/`settings`/`analytics`, o e2e **32**, o `CLAUDE.md` (seção "Aparência
   (temas)", schema, `HEAT_COLORS`), este arquivo.

## Decisões (e por quê)

- **`--accent-text` / `--orange-text` / `--blue-text` / `--accent-line`.** A tarefa avisava do `--accent2`
  (borda e texto no `.level-tag`). O mesmo problema vale pro `--accent`, `--orange` e `--blue`, que no CSS
  são borda, preenchimento **e** texto pequeno (46 + 15 + 3 `color:`). Nos claros o mesmo tom não serve pros
  dois papéis. Solução: os `-text` valem `var(--x)` no escuro (pixel-idêntico) e ganham um tom mais escuro
  onde precisa (só na Aveia, cujas âncoras de sálvia e laranja passam apenas como texto grande; no Papel as
  âncoras já são escuras). `--accent-line` é o `--accent2` de borda (14 usos); o `--accent2` de texto (4 usos)
  e o gradiente do Lv. continuam com ele.
- **Filtros de linha por token** (`--row-now-filter`, `--row-hover-filter`, `--row-select-filter`). O destaque
  do bloco de agora era `brightness(1.35)`: num fundo claro isso lava a linha pro branco e o texto perde
  contraste. No claro o token escurece de leve em vez de clarear.
- **O doc é a fonte da verdade; o `localStorage` é atalho.** O `index.html` aplica o guardado antes do primeiro
  paint (o `main.tsx` chegaria depois do primeiro paint no build, onde o CSS é `<link>`). Quando o doc chega,
  `syncThemeFromState` manda. Efeito colateral aceito: em aparelho novo, quem usa Lamparina vê o escuro por um
  instante até o doc carregar — uma vez só. Conta nova nasce no escuro (o doc dela diz isso), mesmo que o
  aparelho tenha outro tema guardado de outra conta.
- **A meta `theme-color` lê o `--bg` do CSS aplicado** (`getComputedStyle`), em vez de duplicar a paleta em
  JS. O `index.html` guarda a cor em `localStorage` (`study-pets:theme-color`) pra restaurar no boot sem
  saber a paleta.
- **Cancelar sessão mantém o tema.** É preferência, não configuração do dia — o mesmo critério do tour visto.
  `normalizeConfig(draft, periodStart, theme)` recebe o tema de fora, como já fazia com `periodStart`; o
  "↺ Padrão" não zera a aparência.
- **A miniatura por atributo, não por hex duplicado.** `.tp-preview[data-theme="lamp"]` entra no mesmo
  seletor do bloco do tema, então a miniatura é pintada com a paleta real. O `:root` também pega
  `.tp-preview[data-theme="dark"]`, senão a miniatura do Escuro herdaria o claro quando o app está no claro.
- **Sprites sem halo.** Conferidos nos dois claros (onboarding, hero, trilho, login): o contorno escuro dos
  PNGs basta.
- **Numeração do e2e: 32, não 30.** A tarefa dizia 30 ("o 29 é o último"), mas a main já tem o 30 (fim de
  semana com janelas) e o 31 (atalhos do evento) desde 2026-09-06.
- **`feat/cabecalho-abas`** já estava na main (fechada em `5f60aed`, sem `NavStyleSwitch`), então não há
  conflito a reportar nem segundo seletor a integrar.

## O que ficou de fora

- Tema pixel/"Fliperama": descartado pela tarefa.
- Seguir o `prefers-color-scheme` do sistema ("Automático"): não pedido; entraria como um quinto valor de
  `config.theme` que resolve pra `dark`/`paper` no boot. Fácil de acrescentar depois.
- O `manifest.webmanifest` continua com `theme_color` escuro (é lido na instalação, não a cada abertura).
- A tela `extension/blocked.html` tem CSS próprio e não segue o tema.
- Um `color-scheme` no `:root` (barra de rolagem clara/escura do navegador): mexeria no escuro de hoje.

## Resultado das suítes

- `npm test`: 41 arquivos, **567 testes** passando (555 na main + 12 novos).
- `npm run typecheck`: limpo.
- `npm run build`: ok (o script inline do tema sobrevive ao build, conferido no `dist/index.html`).
- `PW_PORT=5182 CI=1 npx playwright test` (Chromium do Playwright, headless): **31 casos** passando, o 32 incluído.
- Prova visual do item 1: 35 capturas idênticas antes/depois da tokenização (e de novo depois dos temas e do card).

## Manual de teste (modo teste, `npm run dev:teste`, http://localhost:5174)

1. Abra o app numa aba nova (conta nova, onboarding). Passe pelo onboarding. Tudo continua no escuro de
   sempre — confira o Plano, a Análise, o Perfil: nada mudou.
2. ⚙️ → Geral → role até **Aparência**. Quatro cartões, o Escuro marcado com ✓. As miniaturas já mostram a
   paleta de cada um (o Escuro preto/lima, a Lamparina marrom/âmbar, o Papel branco/verde, a Aveia creme/sálvia).
3. Toque em **Papel**. O app inteiro muda na hora, sem Salvar: a página de Configurações, a barra de cima ao
   voltar, o Plano. O indicador "💾 Modo teste" aparece: já salvou.
4. Ainda no Papel, passeie: marque um bloco (check verde-musgo com ✓ branco), crie um grupo ("Agrupar", dois
   toques), abra "+ Evento" (chips, inputs claros — o `color-scheme` dos inputs virou claro), toque no bloco de
   agora (o foco em fundo claro, anel verde), Análise (heatmap em degraus de verde, dots), Perfil (hero claro,
   card do pet, moedas em dourado escuro), Meus pets e Loja.
5. **Recarregue** (F5). Continua no Papel, sem piscar no escuro (o `localStorage` aplica antes do app; o doc
   confirma).
6. DevTools → Application → Local Storage → apague `study-pets:theme` → recarregue. Pisca um instante no
   escuro e vira Papel de novo: o doc é a fonte da verdade.
7. Troque pra **Aveia** e pra **Lamparina**; volte pro **Escuro** e confira que é exatamente o app de antes.
8. Numa janela ≥ 1100px: o trilho, a Semana e a coluna da direita nos quatro temas (a Semana no Papel e na
   Aveia com blocos feitos em cor cheia).
9. ⚙️ → Geral → Zona de perigo → **Cancelar sessão** com o tema Lamparina: o onboarding reabre e o app
   continua na Lamparina (preferência fica).
10. "↺ Padrão" + Salvar nas Configurações não mexe no tema.
11. Baixar meus dados: o JSON tem `config.theme`.
12. No celular instalado como PWA (deploy real): a barra do sistema acompanha o tema (`theme-color`).
