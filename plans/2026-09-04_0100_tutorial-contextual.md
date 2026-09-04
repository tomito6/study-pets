# Tutorial contextual: cinco balões em cima do app, na primeira visita a cada aba

Branch: `feat/tutorial` (a partir de `origin/main` em 4237fbd). Origem: IDEIAS.md, "Tutorial depois de
criar a conta — 2026-09-03". Tarefa agendada, rodou sozinha na madrugada de 2026-09-04 — ninguém pra
responder pergunta, então cada dúvida virou uma decisão anotada abaixo, com a alternativa e onde trocar.

## O que foi feito

- **Estado persistido** `tutorialSeen: { plan?: true, profile?: true, analytics?: true }` em
  `src/domain/persistence.ts` (`PersistedState`, `emptyPersistedState`, `hydrateUserDoc` com default
  vazio e normalização, `serializeState`). Cancelar sessão **não** zera. Schema no CLAUDE.md.
- **Domínio** `src/domain/tutorial.ts`: `TOUR_STEPS` (id, área, âncora = seletor do elemento real,
  lado, alinhamento, e um `highlight` opcional pro anel), `areaForTab`, `activeTourArea` (qual área
  mostra o tour dado `tutorialSeen` + aba + `{onboardingOpen, loaded}`), `nextTourStep`,
  `markTourSeen`, `normalizeTutorialSeen` e `placeBalloon` (a geometria, pura: recebe o retângulo do
  elemento e o tamanho do balão, devolve lado/top/left/seta, nunca sai da tela).
- **Caso de uso** `src/application/tutorial.ts`: `currentTourArea`, `finishTour(area)` ("Entendi" no
  último balão e "Pular" — a área inteira vira vista, com `scheduleSave` + `notify`) e `restartTour`
  ("Ver o tour de novo": zera tudo, salva, notifica).
- **UI** `src/features/tutorial/TourBalloon.tsx` + CSS em `app.css` (bloco "TUTORIAL"): balão de 280px
  ancorado no elemento real (título, texto, "Pular" sempre visível, "Próximo"/"Entendi", contador
  "1/3" — escondido quando a área tem um balão só), seta, anel de realce no elemento (`.tour-ring`,
  `pointer-events:none`). Sem backdrop; `z-index` 80 (abaixo do ⚙️, do timer, do topbar, dos modais e
  do foco). Se o elemento não existe, vira `.tour-card`: cartão fixo no rodapé, sem seta, acima do ⚙️.
  Montado em `App.tsx` dentro de `#app` (some com o logout).
- **Textos** em `strings.tutorial` (cinco balões, duas linhas) e `strings.settings.tour`.
- **Configurações → Geral → Tutorial**: card "Ver o tour de novo" com o botão `#tour-restart`; clicar
  zera e fecha as Configurações — o balão 1/3 do Plano aparece embaixo.
- **Testes**: `tests/tutorial.test.ts` (passos, gatilho, geometria em 480px, casos de uso, Cancelar
  sessão preserva), `tests/persistence.test.ts` (doc sem o campo, lixo, ida e volta),
  `tests/application-settings.test.ts` (cancelSession) e o e2e **21** em `e2e/smoke.spec.ts`. Os 19
  antigos continuam verdes sem nenhuma mudança neles.
- **Docs**: CLAUDE.md (Arquivos, conceito "Tutorial (tour contextual)", anatomia do settings, schema),
  IDEIAS.md marcado.

Verificação: `npm run typecheck` limpo, `npm test` 367 verdes, `PW_PORT=5177 CI=1 npx playwright test`
20 verdes (19 antigos + o 21), screenshots dos oito estados conferidos em headless.

## Decisões tomadas em dúvida (e onde trocar)

1. **Onde vive "qual balão está aberto"**: `useState` do componente, não `derived`. Qual **área** está
   com o tour é derivado do store por uma função pura (`activeTourArea` sobre `tutorialSeen` + `uiTab` +
   `onboardingOpen` + carregado) — não precisa de nada novo no store, e trocar de aba, fechar o
   onboarding ou "Ver o tour de novo" fazem o balão aparecer sozinhos, sem um `syncTour()` que alguém
   esquece de chamar. O índice dentro da área é presentação, como a sub-aba da Análise. Consequência
   consciente: sair do Plano no balão 2/3 e voltar recomeça em 1/3 (o passo não persiste). Alternativa:
   `derived.tour = {area, step}` + um caso de uso `syncTour()` chamado num `useEffect` do componente —
   mais peças, mesmo resultado. Trocar: só o componente e `application/tutorial.ts`.
2. **"Avançar" não é caso de uso**: trocar de balão dentro da área não muda nada persistido, então não
   ganha `scheduleSave` (que faria o "Salvando…" piscar a cada Próximo). A regra pura está em
   `nextTourStep`; o componente chama `finishTour` quando ela devolve null. Se quiser persistir o passo,
   `tutorialSeen` teria que virar `{ plan: number | true }` — mudança no schema, não recomendo.
3. **O balão 1 ancora na lista inteira (`#blocks-list`), não na primeira linha**, com o anel na primeira
   linha (`highlight`). Motivo: um grupo de estudo põe o cabeçalho dele logo acima da primeira linha, e
   o balão em cima da linha cobria o cabeçalho — o teste 11 quebrou exatamente aí (clique interceptado).
   Acima da lista ele cobre só o seletor de semana e as abas dos dias (à esquerda; "Agrupar" e "+ Evento"
   ficam à direita, livres). Trocar: `TOUR_STEPS[0]` em `domain/tutorial.ts` + rodar o e2e.
4. **Cartão fixo só quando o elemento não existe** (não "quando está fora da tela"). O balão usa
   coordenadas do documento e rola junto com o elemento; ficar trocando entre ancorado e cartão
   conforme o scroll é pulo visual, e um cartão fixo no rodapé cobriria o botão "Encerrar o dia" na
   hora em que a página está no fim (os testes 6/7, 8 e 15 clicam nele). Trocar: a condição em
   `useLayoutEffect` do `TourBalloon` (`anchor.width === 0`).
5. **Conta antiga vê o tour**: doc sem `tutorialSeen` → `{}`. O Tomi é o único usuário e vai testar assim.
   Se incomodar, é uma linha em `hydrateUserDoc`: `tutorialSeen: d.tutorialSeen === undefined &&
   Object.keys(checks).length > 0 ? { plan: true, profile: true, analytics: true } : normalize(...)`.
6. **Pet não fala**: sem voz de mascote nos textos (IDEIAS avisa que é onde escorrega pro infantil).
7. **Contador "1/1" escondido** nas áreas de um balão só — "1/1" é ruído.
8. **Botão "Ver de novo"** com o título da linha "Ver o tour de novo" (o e2e usa o id `#tour-restart`).
9. **`resetToLoggedOut` (session.ts) não foi tocado**: ele já não zera `eventSeries`/`groups`, e o login
   seguinte sempre passa por `hydrateUserDoc`/`emptyPersistedState`, que redefinem `tutorialSeen`.

## O que ficou de fora

- Cena ambiente/animação no balão, mascote, áudio — fora do escopo e contra a regra de não infantilizar.
- Persistir o passo dentro da área (ver decisão 2).
- Balão no modo foco ou nas Configurações — não há nada a explicar ali no primeiro dia.
- A "alternativa mínima" do IDEIAS (card de três linhas no topo do plano) — o tour cobre o mesmo.

## Manual de teste (modo teste)

Na branch: `git checkout feat/tutorial` e `npm run dev:teste` → `http://localhost:5174`. Cada aba nova
do browser é uma conta nova.

1. **Conta nova**: passa pelo onboarding (escolhe um pet, "Continuar", "Começar"). Assim que ele fecha,
   aparece o balão **"Seu dia já está montado · 1/3"** acima de "Sessão 1", com um anel verde na
   primeira linha. Repare que "Agrupar", "+ Evento" e os checks continuam clicáveis — marca um check com
   o balão aberto: o balão fica, o check marca.
2. **"Próximo"** → **"A vida muda, o plano acompanha · 2/3"** pendurado no botão "+ Evento" (anel nele).
3. **"Próximo"** → a página rola e o balão **"No fim do dia, encerre · 3/3"** aparece em cima do botão
   "✓ Encerrar o dia", com o botão "Entendi". Antes de clicar: troca pra outro dia nas abas Seg–Dom → o
   botão não existe naquele dia e o balão vira um **cartão fixo no rodapé**, acima do ⚙️. Volta pra hoje.
4. **"Entendi"** → some. Espera o "💾 Modo teste" no canto e dá **F5**: continua sem balão (ficou salvo).
5. **Perfil** → **"Pets são horas estudadas"** acima do card "Pet ativo" (sem contador; "Meus pets" e a
   loja livres). **"Pular"** → some. Volta pro Perfil de novo: continua sem balão.
6. **Análise** → **"Tô fazendo o que planejei?"** abaixo dos chips Hoje/Semana/Geral/Recordes, com o
   anel nos chips. "Entendi" → some.
7. **Ver o tour de novo**: Plano → ⚙️ → aba **Geral** → seção **Tutorial** → **"Ver de novo"**. As
   Configurações fecham e o balão **1/3** volta na hora. Pula ou completa como preferir.
8. **Cancelar sessão não zera**: com o tour do Plano já visto, ⚙️ → Geral → Cancelar sessão → refaz o
   onboarding → o Plano abre **sem** balão (o Perfil e a Análise, se ainda não vistos, ainda têm o deles).
9. **Nunca por cima de modal**: com o balão 1/3 aberto, clica em "+ Evento" — o modal abre por cima do
   balão e o backdrop escurece ele. Fecha o modal: o balão continua lá. Idem clicando num bloco de agora
   (modo foco cobre tudo).
10. **Celular** (DevTools, 375px): o balão fica inteiro na tela, colado na margem esquerda.

Com a conta real (`npm run dev`): o doc no Firestore ganha `tutorialSeen` no primeiro save depois de
"Entendi"/"Pular". Como o doc antigo não tem o campo, o tour aparece uma vez — é esperado (decisão 5).
