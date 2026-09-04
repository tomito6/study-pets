# Study Pets

## Como usar este documento

Este arquivo é um **guia vivo**, não uma especificação imutável. Ele descreve a estrutura e as intenções do projeto, mas **o código é sempre a fonte da verdade**. Valores numéricos, listas e detalhes mudam — se você notar divergência entre o que está aqui e o que o código diz, confie no código e atualize este arquivo.

Quando o usuário pedir mudanças que conflitam com algo aqui, **assuma que ele está atualizando o design**, não violando uma regra. Sugira atualizar este arquivo no fim.

## Sobre o projeto

### A ideia central

O **Study Pets** é um app de Pomodoro que trata estudar como uma jornada — não uma punição. Nasceu da frustração com planos rígidos: o Tomi começou com uma planilha de Excel cheia de blocos fixos, percebeu que a vida real (almoço atrasado, aula no meio da manhã, cansaço) destruía o plano todo dia, e foi construindo algo que se adapta em vez de quebrar.

A evolução foi: planilha → app web simples → app web flexível → app com login na nuvem → RPG. Cada passo veio de uma dor real, não de querer features. Manter esse espírito é importante — features novas devem resolver problema de verdade, não inflar.

### Quem usa

Hoje só o Tomi, brasileiro estudando na TUM (Munique). A ambição é abrir pra qualquer estudante no mundo no futuro. Isso significa duas coisas: o app precisa funcionar pra alguém que tem rotina caótica de universitário (eventos no meio do dia, horários variáveis, dias bons e dias ruins), mas as decisões de design não devem ser tão pessoais que não se generalizem.

### A vibe

Sério e produtivo na base. O Tomi não quer um app que pareça infantil — ele estuda de verdade, tem objetivos concretos (TUM, agosto 2026), e o app precisa parecer uma ferramenta legítima de produtividade. Tema escuro, tipografia limpa, dados claros, sem decoração que distrai.

Mas em cima dessa base entra calor: pets de pixel art, animação de personagem, sistema de XP, sons agradáveis quando completa um bloco. O objetivo é dar **companhia e reconhecimento** — não estudar sozinho, e ver que o esforço gera evolução visível. A gamificação serve a essa função emocional, não vice-versa.

Os pets têm um papel especial nesse senso de progresso: são marcos tangíveis do esforço. Cada pet adotado é prova concreta de horas estudadas — diferente de um número de XP abstrato, é algo que você conquistou e que fica ali, com personalidade, te acompanhando. Conforme a coleção cresce, a evolução fica visível de um jeito que dados não conseguem capturar.

### Os dois motivos pra voltar

1. **Disciplina/hábito**: o app facilita voltar todo dia, sem fricção. Plano se adapta ao que você consegue fazer, não ao que o app esperava de você.
2. **Estudo gostoso**: o ato de marcar um bloco como feito tem que ser gratificante. Pequeno som, pequena animação, XP somando, moeda ganha, talvez um pet acompanhando. O reforço positivo vem do app, não da pressão.

### O que evitar

- **Padrões manipulativos**: nada de "você está perdendo sua sequência!" como ameaça. Streaks são pra celebrar, não pra causar ansiedade.
- **Infantilização**: pets e níveis sim, mas com pixel art bonito e linguagem adulta. Não é um app pra criança aprender a estudar.
- **Rigidez**: o app NUNCA deve fazer o usuário se sentir mal por mudar o plano. Almoçou cedo? Tudo bem, ajusta. Faltou um dia? Tudo bem, recomeça. A vida não para por causa do Pomodoro.
- **Inflar features**: se uma feature não resolve dor real, não merece estar aqui. O app já tem muita coisa.

### Tom de comunicação

Falar português brasileiro com o usuário. Direto, com leveza, sem formalidade desnecessária. O Tomi gosta de honestidade — se algo é má ideia, diga; se algo não é problema, não invente. Evitar bullet points em respostas conversacionais (eles cabem em documentação).

## Stack & deploy

- Frontend: React + TypeScript (Vite). Uma árvore React só (`src/app/App.tsx`); o app vanilla de arquivo único foi migrado por completo em 2026-09 (história em `plans/2026-09-02_1552_migracao-vite-ts.md`)
- Build/testes: Vite + TypeScript + Vitest. `vercel.json` declara build e output explicitamente — não depender da detecção automática da Vercel
- PWA: `vite-plugin-pwa` gera o service worker (workbox) **só no build** — precache do `dist` e navegação network-first com fallback ao cache (deploy novo aparece no próximo reload). Em dev/teste nada é registrado (HMR e e2e intactos). Manifest estático em `public/manifest.webmanifest`, ícones em `public/icons/` (gerados do personagem por `scripts/app-icon.mjs`). Se o browser prender uma versão velha: DevTools → Application → Service Workers → Unregister
- Backend: Firebase (Auth via Google e e-mail/senha + Firestore, com cache persistente em IndexedDB — sem rede, `load` volta do cache e o save entra na fila)
- Hosting: Vercel (deploy automático no push pra `main`)
- Repo: github.com/tomito6/study-pets
- URL: plano-estudos-one.vercel.app — o projeto no Vercel ainda se chama `plano-estudos`, e é o nome do projeto que gera essa URL. **Não renomear o projeto**: mudaria o domínio, que teria de ser re-autorizado no Firebase Auth (Authorized domains) pro login com Google continuar funcionando.

## Arquivos

- `index.html` — `<div id="root">`, o `<link>` das fontes e as tags do PWA (manifest, ícone, apple-touch-icon, theme-color). Nada mais
- `src/main.tsx` — entry: monta `<ErrorBoundary><App/></ErrorBoundary>` e chama `startSession()` (auth → carregar doc → boot)
- `src/app/` — `App.tsx` (a árvore inteira: login, `#app` com cabeçalho, timer, abas, modais), `Header.tsx` (abas, data, XP, Sair) e `ErrorBoundary.tsx` (erro de render vira a tela "Algo quebrou" com Recarregar, em vez de tela preta). Quem mostra/esconde `#app` e a aba ativa é o `App`, lendo o store
- `src/features/<feature>/` — UI React por feature:
  - `auth/LoginScreen.tsx` — formulário de e-mail/senha (Entrar / Criar conta / Esqueci a senha, erro inline, estado de carregando) com o botão do Google abaixo, separado por "ou". Ids: `#login-email`, `#login-password`, `#login-submit`, `#login-toggle-mode`, `#login-forgot`, `#login-error`, `#login-reset-sent`
  - `plan/` — a aba Plano inteira: `PlanTab.tsx` (XP card, stats do dia, semana/dia, "Encerrar o dia"), `BlockList.tsx` (sessões e linhas com check — a lógica de clique do `renderBlocks` antigo mora aqui), `DayWindowsPanel.tsx` (o modal "Janelas do dia": editor de janelas só deste dia, "Começar agora", "Dia livre", "Restaurar rotina"), `feedback.ts` (ripple + "+X XP" flutuante), `useMinuteTick.ts` (re-render na virada do minuto, pro destaque "agora")
  - `timer/` — `TimerBar.tsx` (barra "Em andamento" / "Começa em", volume, ✕ Parar) e `FocusOverlay.tsx` (modo foco: anel que drena, próximo bloco, ganho ao concluir; contagem até o início quando aberto antes da hora; faixa "✓ … concluído" ao emendar no bloco seguinte). Os dois **derivam** o restante do relógio a cada segundo com `useSecondTick` — o store só sabe qual bloco está rodando
  - `events/` — os três modais do Plano: `EventPanel.tsx` (novo evento, com recorrência; com a prop `edit` vira "Editar evento", preenchido, e Salvar substitui o avulso ou a série inteira), `EventDeleteModal.tsx` (Editar / só este dia / a série / avulso), `LunchPanel.tsx` (almoço só deste dia). São **filhos do `PlanTab`**, que guarda qual está aberto em `useState` — modal é estado local, não vai pro store
  - `groups/` — grupos de estudo: `useGroupSelection.ts` (a máquina de estados da seleção de linhas: botão direito, toque longo, botão "Agrupar"), `GroupPanel.tsx` (novo/editar grupo), `GroupBox.tsx` (a caixa na lista) e `SelectionRect.tsx` (o retângulo tracejado em volta das linhas selecionadas). A seleção é `useState` do `PlanTab`; o modal também
  - `analytics/AnalyticsTab.tsx` — a aba Análise inteira (cartão de perfil + sparkline, sub-nav Hoje/Semana/Geral/Recordes como estado local, aderência, dots da meta, heatmap, horas, drop-off, recordes). Só formata: os cálculos estão em `domain/analytics.ts`
  - `profile/ProfileTab.tsx` — a aba Perfil (hero com personagem e pet animados por `useSpriteFrame`, stats, card do pet ativo, botões da loja e de "Meus pets"). Roda `applyPendingPetXP` ao ficar visível
  - `pets/` — `PetCard.tsx` (`ShopPetCard` = espécie à venda; `OwnedPetCard` = pet adotado, com nome, forma, Equipar, Evoluir e skills), `PetModals.tsx` (loja, meus pets, adoção com nome, renomear, escolher caminho de evolução — filhos do ProfileTab) e `NameField.tsx` (o campo de nome com sugestão + 🎲, usado em adotar, renomear e no pet inicial)
  - `settings/` — a página de Configurações inteira: `SettingsPage.tsx` (Rotina/Geral, o botão ⚙️ flutuante e "aberta ou fechada" como estado local; Geral tem o card "Meus dados" com "Baixar (JSON)"), `ConfigPreview.tsx` (Resumo do dia), `StudyWindowsEditor.tsx` (também usado pelo modal "Janelas do dia"), `FitStudyModal.tsx` (Encaixar estudo — simula com as janelas do dia visível, editadas ou não), `DangerModals.tsx` (cancelar sessão, apagar conta). O formulário é um rascunho (`ConfigDraft`) que só vira config ao Salvar
  - `onboarding/OnboardingModal.tsx` — "Bem-vindo!" em dois passos: o pet inicial (só quando não há pet) e período de uso + fins de semana. Aberto pelo boot (conta nova) e por cancelar sessão
  - `dayend/DayEndModals.tsx` — confirmação de encerrar o dia, o resumo com os ganhos, e o prompt automático "passou do horário" (encerrar / prolongar)
  - `tutorial/TourBalloon.tsx` — o balão do tour contextual (um por vez, ancorado no elemento real da aba; cartão fixo no rodapé se o elemento não existe). Qual área está com o tour vem do store (`activeTourArea`); qual balão da área está aberto é `useState` daqui
  - `shell/Modal.tsx` — a casca `.panel-overlay.center > .panel-sheet` de todo modal; clicar fora fecha
  - `shell/SaveIndicator.tsx` — "Salvando… / Salvo ✓"
- `src/store/store.ts` — estado central tipado, um objeto só mutado no lugar pelos casos de uso; quem muta chama `notify()`; React lê com `useAppState`. `derived` = runtime não persistido: `weeks` (calculado por `rebuildWeeks`), `timerBlock` + `focusOpen` + `timerCompleted` + `audio` (`application/timer`), `save` (status), `authReady`, `onboardingOpen`, `dayEnd` (modais do fim do dia). Modal aberto por **clique local** fica em `useState` do componente; só entra no store o que um **caso de uso** abre
- `src/application/` — casos de uso e leituras do estado. UI chama isto; isto chama domínio/infra:
  - `plan.ts` — `rebuildWeeks`, `blocksForDay` (com a memoização do gerador; usa a config **do dia**: janelas editadas e almoço editado), `allDays` (os dias que contam — fim de semana pausado e dia livre ficam de fora), `computeStatsNow` (memoizado por versão do store: cabeçalho, Plano, Análise e Perfil pagam uma passada só), `dateForWeekDay`/`findWeek`/`forEachDay`
  - `checks.ts` — `toggleBlockCheck` (marca/desmarca, grava o **id da instância** equipada e o bônus da skill dela via `bonusForCheck`, devolve XP/moedas pro feedback) e `checkBlock` (marca só se ainda não está marcado — o fim do bloco no modo foco usa; nunca desmarca)
  - `save.ts` — `scheduleSave` com debounce, `blockSaves` (apagar conta), status pro indicador, `CLIENT_ID` (identifica esta carga da página; vai no `meta.writer` de cada save) e `hasPendingSave()`
  - `sync.ts` — sync entre dispositivos: `subscribeRemote`/`unsubscribeRemote` (a inscrição no snapshot do doc) e `applyRemoteDoc` (reidrata o estado com o doc que chegou do servidor — a menos que seja eco da própria escrita, a mesma emissão de novo, o onboarding esteja aberto ou haja save local pendente; nunca toca `derived`)
  - `timer.ts` — `tryStartTimer` (valida: só bloco de hoje que ainda não terminou — antes da hora fica em espera; devolve o motivo pra UI mostrar o toast), `startTimer`/`stopTimer`/`closeFocus`, `reconcileTimer` (acerta o timer com o relógio: o fim do bloco pelo mesmo caminho, um bloco por vez se vários passaram — é o que o `setInterval` chama a cada segundo **e** o que roda ao voltar pra aba/destravar o celular, via `watchVisibility`), o Wake Lock enquanto o foco está aberto, o fim do bloco (**no foco** → `checkBlock` + som `sucesso` + emenda no bloco seguinte via `chainedBlockAfter`; **fora do foco** → som do tipo + notificação e o timer some), e o áudio (`playSound`, `toggleMute`, `setVolume`). **Não há `notify()` por segundo** — isso faria o app inteiro re-renderizar e recalcular stats
  - `events.ts` — `addEvent`/`addEventSeries`, `updateEvent`/`updateSeries`/`findEventEditTarget`, `deleteEvent`/`deleteSeriesOccurrence`/`deleteSeries`, `setLunchOverride`/`lunchForDay`, validações com motivo. Cada mutação limpa o cache do gerador, salva, notifica e emite o toast "Plano reajustado: …" (`notifyPlanDelta`, que `settings.ts` e `dayWindows.ts` também usam)
  - `dayWindows.ts` — as janelas só de um dia: `setDayWindows`, `startNow` ("Começar agora", só hoje), `setDayOff` (dia livre — só hoje/futuro, e hoje só sem check), `clearDayWindows` ("Restaurar rotina"), `canEditDayWindows` (encerrado e passado são read-only), `effectiveWindows`/`dayWindowsOverride`/`isDayOffKey`. Cada mutação também refaz as semanas e reagenda o prompt de fim de dia
  - `export.ts` — "Baixar meus dados": `buildExport` (o documento salvo + `exportedAt`, sem uid/e-mail/meta) e `exportMyData` (dispara o download pela infra)
  - `settings.ts` — `saveSettings` (preserva `periodStart`, refaz semanas, reagenda o prompt de fim de dia; **recusa campo numérico vazio**, que antes virava `NaN` salvo) e `cancelSession`
  - `account.ts` — `deleteAccount`: doc primeiro, usuário depois; devolve o estágio que falhou
  - `pets.ts` — `applyPendingPetXP` (idempotente), `coinBalance`, `buyPet` (espécie + nome, com motivo de recusa), `adoptStarter`/`needsStarter` (o pet inicial, grátis, só sem pet nenhum), `toggleEquip`, `toggleSkill`, `renamePet`, `evolvePet`, `activePet`/`petById`
  - `dayEnd.ts` — `closeDay` (trava checks, credita pets, monta o resumo), o prompt automático agendado pro fim do último estudo (sem polling), `extendDay` (num dia com janelas editadas, estica o override; senão a rotina)
  - `onboarding.ts` — `finishOnboarding` (período + pet inicial; valida tudo com motivo antes de mudar qualquer coisa)
  - `tutorial.ts` — o tour contextual: `currentTourArea` (leitura), `finishTour` (área vista — "Entendi" no último balão e "Pular"), `restartTour` ("Ver o tour de novo": zera `tutorialSeen`). Avançar entre balões não persiste nada e fica no componente
  - `groups.ts` — `addGroup`/`updateGroup`/`deleteGroup` (com motivo de recusa), `validateGroup`, `canEditGroups`. Grupo não mexe no plano: só salva e notifica, sem `clearBlockCache`
  - `session.ts` — entrar/sair e o boot: `startSession` registra o listener de auth (e o `watchVisibility` do timer); a cada login, `loadUserData` → `initAfterLoad` (XP pendente, prompt, semana/dia visíveis) → `subscribeRemote`; conta nova abre o onboarding; sair cancela a inscrição. Também `signUpWithEmail`/`signInWithEmail`/`resetPassword`: validam com `domain/auth.ts` antes de chamar a porta e devolvem `{ok:true} | {ok:false,reason}` (mesmo padrão dos outros casos de uso) — `resetPassword` sempre resolve `ok:true` com e-mail de formato válido, mesmo se a conta não existir, pra não revelar contas cadastradas
- `src/domain/daySummary.ts` (o resumo do dia entre dois instantâneos) e `src/domain/endOfDay.ts` (último estudo, quando perguntar, prolongar — `extendWindowsTo`/`extendDayTo`)
- `src/domain/dayWindows.ts` — janelas só de um dia: `configForDay` (a config efetiva do dia), `isDayOff`, `validateDayWindows` (fim > início, sem sobreposição), `startNowWindows` (a janela que contém agora, ou a próxima, passa a começar no próximo múltiplo de 5 min)
- `src/domain/pets.ts` — o catálogo: `FORMS` (o que aparece na tela: sprite + skills) e `PETS` (espécies à venda, com caminhos de evolução). Adicionar pet = uma forma + uma espécie aqui + sprites em `public/idle/pets/{form}/`. Também a curva de nível própria do pet, nome (`normalizePetName`/`suggestPetName`), instância (`newPetInstance`/`legacyPetInstance`), forma atual (`petForm`) e evolução (`evolutionOf`/`evolve`), saldo de moedas
- `src/domain/analytics.ts` — `currentWeekKeys`, `goalWeek` (os 7 dots; `dayOff` marca o dia livre como neutro, kind `off`), `heatmap` (7×16 células, intensidade por % da meta; célula `day-off`), `hourBars`, `dropoff`, `sparkline` (8 semanas), `nextLevel`
- `src/domain/settings.ts` — `ConfigDraft` ↔ `UserConfig` (`draftFromConfig`/`normalizeConfig`), `summarizeConfig` (o Resumo do dia), `fitStudySuggestions` (o algoritmo do Encaixar), formatação de durações
- `src/domain/planDelta.ts` — o que mudou no plano de um dia (estudos a mais/menos, novo fim), puro
- `src/domain/tutorial.ts` — o tour contextual: `TOUR_STEPS` (os cinco balões: id, área, âncora = seletor do elemento real, lado e alinhamento), `activeTourArea` (qual área mostra o tour: aba visível, ainda não vista, sem onboarding), `nextTourStep`, `markTourSeen`, `normalizeTutorialSeen` (leitura do doc) e `placeBalloon` (a geometria: onde o balão cabe dado o retângulo do elemento — puro, testado pra nunca sair da tela em 480px). Os textos ficam em `strings.tutorial.steps`, indexados pelo id do passo
- `src/domain/timer.ts` — `timerProgress` (restante = fim − agora; é por isso que o timer sobrevive a reload; `phase` = `waiting`/`running`/`done`, com a contagem até o início), `canStartBlock`, `soundForBlock`, `blockNumberInSession`, `nextBlockAfter`, `chainedBlockAfter` (o bloco em que o foco emenda: estudo/pausa que começa quando este acaba), `formatCountdown`
- `src/infrastructure/audio/sounds.ts` (Web Audio, porte fiel, falha em silêncio), `infrastructure/notifications/notifications.ts` (Web Notifications, guardadas), `infrastructure/visibility.ts` (`onVisible`: a página voltou a ficar visível — `visibilitychange` + `pageshow`), `infrastructure/wakeLock.ts` (Screen Wake Lock enquanto o foco está aberto; sem a API, no-op) e `infrastructure/download.ts` (Blob + `<a download>`)
- `.env.test` — liga o modo memória pro Vitest; os testes de aplicação que passam pela infra nunca tocam o Firebase
- `src/shared/strings.ts` — textos da UI React. Tudo que migrar pro React escreve texto aqui, não inline
- `src/shared/toast.ts` — o toast (DOM direto, sem React; vira no-op fora do browser)
- `src/styles/app.css` e `login.css` — o CSS que estava no `index.html`, sem mudança
- `src/infrastructure/` — o mundo externo, atrás de interfaces (`ports.ts`: `AuthPort`, `UserRepository`). `AuthUser.provider` (`'google' | 'password'`, opcional — ausente = trate como `'google'`) diz como a conta entrou; usado só pra decidir a reautenticação ao apagar conta
  - `firebase/` — `config.ts` (config pública, sobrescrevível por `VITE_FIREBASE_*`), `auth.ts` (Google e e-mail/senha: `signUpWithEmail` já dispara `sendEmailVerification`, sem bloquear nada; reautenticação ao apagar conta é por popup do Google ou por `reauthenticateWithCredential` com a senha, conforme `provider`), `userRepository.ts` (`users/{uid}`: `initializeFirestore` com cache persistente, `setDoc` **sem merge**, `onSnapshot` atrás de `subscribe`)
  - `memory/` — as mesmas portas sem rede: usuário fixo já logado, documento no `sessionStorage` da aba (sobrevive a reload/HMR, some ao fechar a aba; aba nova = conta nova; `subscribe` é no-op). `auth.ts` também simula um registro de contas por e-mail/senha (só em memória — não sobrevive a reload, como o próprio estado de login/logout hoje); uid deriva do e-mail (`email:<endereço>`), então contas diferentes viram documentos diferentes. É o **modo teste**
  - `index.ts` — escolhe qual usar por `VITE_PERSISTENCE` (`memory` → teste; qualquer outra coisa → Firebase)
- `src/domain/persistence.ts` — `hydrateUserDoc` (documento cru → estado; **é a função explícita de migração**, tolera todo formato antigo), `serializeState` (estado → documento, com `schemaVersion`) e `readDocMeta` (o carimbo de sync). Hoje `schemaVersion` é 2: pets como instâncias; v0/v1 (pets por espécie, `skills.owl`) migram na leitura; `windowOverrides` e `meta` ausentes têm default
- `.env.example` — variáveis suportadas (todas opcionais). `.env.teste` liga o modo memória pro `npm run dev:teste`
- `src/domain/` — regras puras em TypeScript, sem DOM/Firebase/estado global:
  - `types.ts` — tipos do domínio (`StudyBlock`, `UserConfig`, `RecurringEventSeries`, `CheckRecord`, ...)
  - `time.ts` — `dk`, `timeToMins`, `minsToTime`, `mondayOf`, `aggregateMins` (tudo em horário local)
  - `config.ts` — `DEFAULT_CFG` e `migrateConfig`
  - `planner.ts` — `generateBlocks` (a memoização fica em `application/plan.ts`) e `calcActualEnd`
  - `events.ts` — `expandEventsForDate`, com semanal/quinzenal/mensal e exceções
  - `progression.ts` — XP, moedas, `LEVELS` (do usuário), o catálogo `SKILLS` com a regra de cada uma, e `skillEligible`/`bonusForCheck`
  - `checks.ts` — quem pode ser marcado (`canToggleCheck`: dia fechado é read-only, dia futuro não
    chegou) e `computePendingPetXP`, que calcula o XP dos pets de forma idempotente
  - `stats.ts` — `computeStats` (uma passada só) e `calcStreaks`
  - `groups.ts` — grupos de estudo: pertencimento por horário (`blockInGroup`), `groupProgress`, `validateGroupRange`, `groupHeaderPositions`
  - `auth.ts` — `isValidEmail`/`isValidPassword` (mínimo 8 caracteres — o Firebase aceita 6, a gente pede mais), `AuthError` (motivo tipado: `email-in-use`, `invalid-credential`, `weak-password`, `invalid-email`, `too-many-requests`, `network`, `unknown` — nunca o código cru do Firebase vaza pra UI) e `authErrorReasonFromCode`, que mapeia os códigos do Firebase Auth pro motivo (junta de propósito `auth/wrong-password`/`auth/user-not-found` (SDKs antigos) e `auth/invalid-credential` (SDKs novos) no mesmo motivo — nunca revela se foi o e-mail ou a senha que errou)
- `tests/` — Vitest sobre o domínio e a infra em memória
- `e2e/` + `playwright.config.ts` — smoke test de ponta a ponta no modo teste
- `public/idle/` — sprites (era `idle/` na raiz). O Vite copia `public/` pro `dist` preservando os caminhos, então o código continua pedindo `idle/user/0.png`
- `public/idle/pets/{form}/` — convenção pra sprites de pets (uma pasta por **forma**: `dog`, `dog-shepherd`, `wolf`, `cat`, `snake`, `cow`, `dove`)
- Sprites são frames sequenciais nomeados `0.png`, `1.png`, ...
- `firestore.rules` — regras de acesso (só o dono lê/escreve `users/{uid}`)
- `scripts/backup-firestore-console.js` — snippet pra baixar seu doc do Firestore pelo DevTools (pra quem não é o autor, o botão "Baixar meus dados" em Configurações → Geral faz o mesmo)
- `scripts/app-icon.mjs` — gera os ícones do PWA em `public/icons/` a partir do personagem (`node scripts/app-icon.mjs`, Chromium headless do Playwright). Arte autoral; um ícone à mão substitui os PNGs
- `public/manifest.webmanifest` e `public/icons/` — o manifest do PWA (estático) e os ícones 192/512/512-maskable/apple-touch
- `scripts/pixel-sprites.mjs` — desenha em código os sprites placeholder de todas as formas (cachorro, pastor alemão, lobo, gato, cobra, vaca, pomba; `node scripts/pixel-sprites.mjs` → `public/idle/pets/{form}/`). Cada forma é uma função `(frame) → grid`. Arte autoral, 32×32 com transparência, no padrão do personagem; trocar por arte à mão quando houver
- `dist/` — saída do build, não versionada

## Workflow

1. `npm run dev:teste` sobe o app em `http://localhost:5174` em **modo teste**: sem Firebase, já logado num usuário fixo, cada aba nova começa como conta nova (onboarding aparece); os dados vivem na aba (sobrevivem a reload, somem ao fechar). É o jeito rápido de testar qualquer fluxo sem tocar em dados reais
2. `npm run dev` sobe em `http://localhost:5173` com Firebase real (`localhost` já é domínio autorizado no Firebase Auth) — pra validar login e persistência de verdade
3. Não existe mais cópia pra replicar: uma base só, dois modos por ambiente
4. `npm test` (Vitest) e `npm run typecheck` antes de commitar
5. `npm run test:e2e` roda o smoke test (Playwright, `e2e/smoke.spec.ts`) contra o modo teste — os fluxos principais, cada um numa aba nova com o relógio fixo. Sobe o servidor sozinho. **Rodar antes de mexer em UI.** Usa o Chromium do próprio Playwright em headless (`npx playwright install chromium` uma vez). **Nunca o Chrome/Edge do sistema nesta máquina**: o Cold Turkey Blocker fecha qualquer `chrome.exe`/`msedge.exe` sem a extensão dele — levando as abas reais junto. `npm run test:e2e:ui` e `--headed` usam o Chromium completo, que ele pode pegar pelo nome; avisar antes
6. `npm run build` gera o `dist/`
7. Commit + push → Vercel builda e publica sozinho

## Princípios arquiteturais

Mais importantes que valores concretos. Estes você protege ao mexer no código:

- **Regra pura mora em `src/domain/`**: se uma função só transforma dados em dados, ela vai pro domínio, é tipada e ganha teste. O domínio **não pode** tocar DOM, React, Firebase, `state`, áudio, notificação ou `new Date()` implícito — quando precisa do "agora", recebe como parâmetro (ver `SkillContext` em `progression.ts`). Efeito (estado, persistência, timers, toast) fica em `src/application/`; React só formata e chama casos de uso.
- **Camadas em uma direção**: `features` → `application` → `domain`/`infrastructure`. Componente não importa `infrastructure` nem muta `state` direto; caso de uso não importa React nem toca o DOM (exceção pequena e nomeada: `shared/toast`).
- **Estado centralizado**: tudo em um único objeto `state`, que vive em `src/store/store.ts`. Não criar globais soltas. Modal aberto por clique local é `useState` do componente; só o que um caso de uso abre (foco, onboarding, fim do dia) vai pro `derived`.
- **Ids e classes são contrato**: o CSS em `src/styles/app.css` e o smoke test em `e2e/` dependem dos ids/classes que os componentes rendem. Mudar um nome = mudar nos três lugares.
- **Sem `notify()` por segundo**: o timer e o modo foco derivam o restante do relógio dentro do componente (`useSecondTick`). Um `notify()` global a cada segundo faria o app inteiro re-renderizar e o `computeStatsNow` recalcular.
- **Checks por horário, não por índice**: a chave dos checks é o `time` do bloco (`"09:00"`). Isso evita corrupção quando a config muda. Valor é `{ pet: instanceId | null, bonus: number }` — `pet` = **id da instância** equipada no momento do check (o pet adotado, não a espécie; pets migrados do formato antigo têm id igual ao da espécie, então checks antigos continuam batendo); `bonus` = multiplicador aditivo de XP (0 ou 0.05) decidido na hora pelas skills ativas. Retrocompat: `true` antigo é tratado como `{ pet: null, bonus: 0 }` por `checkPet()` / `xpFromCheck()`.
- **Memoization em `generateBlocks`**: a função tem cache. Sempre que alterar config ou eventos, chamar `clearBlockCache()`.
- **Stats em uma passada**: `computeStats()` calcula tudo de uma vez iterando os dias uma única vez. Não criar funções separadas que reiteram.
- **Datas dinâmicas**: sem dates hardcoded. As semanas são construídas a partir da semana atual.
- **Último bloco do dia é sempre estudo** (nunca termina em pausa).
- **Tratamento de erro do Firebase**: load/save dentro de try/catch.
- **Firebase só atrás de porta**: nada fora de `src/infrastructure/firebase/` importa `firebase/*`. O app fala com `auth` e `users` (ver `ports.ts`); é isso que permite o modo teste em memória e, no futuro, emulador ou outro backend sem tocar na UI.
- **Todo formato antigo do Firestore passa por `hydrateUserDoc`**: campo novo no doc = default ali + teste em `tests/persistence.test.ts` com o doc sem o campo. `serializeState` é o único lugar que monta o documento salvo.
- **Save substitui o doc inteiro; sync por snapshot com carimbo de escrita**: `users.save` é `setDoc` **sem merge** (o merge do Firestore é profundo — chave que sumiu de `checks[dia]` ficava no servidor e voltava no reload). Cada save leva `meta: { writer: CLIENT_ID, writtenAt }`; o snapshot que volta com o nosso `writer` é eco e é ignorado (`application/sync.ts`). O doc remoto só entra se não há save local pendente (v1: o local vence) e o onboarding não está aberto; nunca mexe em `derived` (timer, foco).
- **Overrides por dia são a config daquele dia, nunca regra no gerador**: `lunchOverrides` e `windowOverrides` entram em `blocksForDay` como `{ ...config, ...override }` (`configForDay`). Quem precisa dos blocos de um dia como eles eram (estatísticas, XP do pet, prompt de fim de dia) chama `blocksForDay` — nunca `generateBlocks(state.config, …)` direto.

## Conceitos do app

> As seções abaixo descrevem as **regras** do produto e ainda citam nomes do app vanilla (`renderBlocks`, `toggleCheck`, `renderXP`, `applyPendingPetXP`…). Tudo migrou: a regra continua valendo, e o código equivalente está em `src/domain` (o cálculo), `src/application` (o caso de uso) e `src/features/<feature>` (a tela). Na dúvida, o código é a fonte da verdade.

- **Sessões**: pomodoros separados por pausa longa, evento ou almoço viram "sessões" coloridas (classes `.s0` a `.s5`).
- **Janelas de estudo** (`config.studyWindows`): lista de intervalos `[{start, end}]` durante o dia em que o usuário estuda. UI na aba Rotina = uma linha por janela dentro de um card (`.sw-row`: início → fim, duração alinhada à direita, ✕ pra remover), botão "+ Adicionar" no cabeçalho da seção. Permite N janelas (caso de uso clássico: estuda 9-12 e 15-20, com gap de 3h no meio onde o app não gera pomos). `generateBlocks` itera as janelas em ordem; entre janelas, bloqueios (almoço/eventos) aparecem visíveis no plano. `cfg.start` / `cfg.end` viraram **campos derivados** (primeira janela / última janela) — mantidos no schema só pra retrocompat. Migração: `migrateConfig(cfg)` cria `studyWindows: [{start, end}]` a partir do antigo `start`/`end` se ausente. Pra estender o dia via "Prolongar estudos" do end-of-day prompt: ajusta `end` da última janela.
- **Eventos**: blocos representam compromissos (aulas, consultas, treino). Schema `{name, start, end, countsAsStudy}` (default `true` pra retrocompat). Quando `countsAsStudy=true`: tipo `'event'` no resultado de `generateBlocks` — herda cor da sessão (borda dashed), tem check, dá XP/moedas pela duração real, alimenta streak + pet XP. Quando `countsAsStudy=false`: tipo `'intervalo'` — bloqueia o tempo no plano (cinza, dashed, sem check, sem XP). Ambos clicáveis pra apagar. Painel `#event-panel` tem checkbox "Conta como estudo (dá XP e moedas)" default marcado. **Editar**: tocar no evento abre o modal `#event-delete-confirm`, que tem "✏️ Editar" (`#event-edit-btn`) → o mesmo `#event-panel` em modo edição, preenchido (`updateEvent` substitui o avulso pelo início antigo; `updateSeries` troca nome/horário/dias/frequência/até/conta-como-estudo da série inteira, mantendo `id`, `anchor` e `exceptions`). Avulso não vira série ao editar, e editar uma ocorrência só continua sendo "Só este dia" + criar avulso. **`'intervalo'` agora vem APENAS de evento sem countsAsStudy** — `extraBreaks` na config foi removido.
- **Eventos recorrentes**: ao criar evento, o checkbox "Repetir este evento" expande seção com chips de dia da semana (multi-select, pré-seleciona o dia atual), radio de frequência (toda semana / a cada 2 semanas / mensalmente) e input "Até" opcional. Série fica em `state.eventSeries` (array paralelo a `state.events`); avulsos continuam em `state.events`. Helper `getEventsForDate(dateKey)` une as duas fontes — ocorrências de série ganham `_seriesId` no objeto. **`blocksForDay` e `applyPendingPetXP` chamam `getEventsForDate`**, então stats/check/XP-do-pet funcionam transparentemente. Biweekly conta paridade pela semana da `anchor` (`mondayOf(anchor)` vs `mondayOf(date)` em weeks); monthly bate `date.getDate() === anchor.getDate()` (dias 29-31 podem pular meses curtos — by design). Apagar evento de série abre modal com 2 opções: "Só este dia" (empurra `dateKey` em `series.exceptions`) ou "Apagar a série" (remove a entrada de `state.eventSeries`). Avulsos mantêm botão único "Apagar".
- **Bloco atual**: o que está acontecendo no horário real ganha destaque visual.
- **Gap antes de eventos/almoço**: se sobrar tempo menor que um pomodoro, preenche inteligentemente (mini-estudo ou estica o último). A pausa **nunca** invade o bloqueio seguinte: se ela não cabe antes do evento/almoço, some, e o plano vai direto pro bloqueio (inclusive quando o pomo termina exatamente no minuto em que o evento começa).
- **Datas**: WEEKS construído dinamicamente. Sem `periodEnd` (modo "sempre"): até 31 de dezembro do ano atual (mínimo de hoje+8 semanas, pra cobrir virada de ano); expande pra frente se houver dados futuros. Com `periodEnd` definido: cobre **exatamente** o intervalo escolhido — limite real, sem expansão pra frente (dados fora do período ficam guardados no Firestore mas não aparecem na UI; reabrir o período os traz de volta). Em ambos os casos, expansão pra trás se houver dados antigos.
- **Login por e-mail/senha**: a tela de login (`#login-screen`) tem um formulário curto acima do botão do Google — e-mail, senha, botão principal que muda de texto conforme o modo (`#login-toggle-mode` troca entre "Entrar"/"Criar conta" e "Já tenho conta"/"Criar conta"), "Esqueci a senha" (`#login-forgot`, usa o e-mail já digitado) e erro inline (`#login-error`, nunca toast) abaixo do formulário. Enter envia (é um `<form>`). Validação de formato/senha mínima (8 caracteres — o Firebase aceita 6) acontece **antes** de chamar a infra, em `application/session.ts` (`signUpWithEmail`/`signInWithEmail`/`resetPassword`, todos devolvendo `{ok:true} | {ok:false, reason}`). Motivo de erro nunca é o código cru do Firebase — vira um dos `AuthErrorReason` de `domain/auth.ts`, com texto em `strings.login.errors`. **E-mail já cadastrado (com Google ou com senha) devolve `email-in-use`** com o texto "Já existe uma conta com este e-mail. Entre com o Google ou use 'Esqueci a senha'." — não tenta vincular os dois provedores (`linkWithCredential`) por decisão consciente (ver plan file). **"Esqueci a senha" sempre mostra a confirmação** (`#login-reset-sent`, "Enviamos um e-mail pra …") pra e-mail com formato válido, mesmo que a conta não exista — não revela quais e-mails têm conta. **Verificação de e-mail é opcional**: `signUpWithEmail` já dispara `sendEmailVerification` sem bloquear nada, mas não há lembrete no perfil pra quem não verificou (fora do escopo — ver plan file).
- **Onboarding**: na primeira vez que um usuário loga (Firestore doc não existe), abre o modal em dois passos. (1) **Pet inicial** — só quando `pets.owned` está vazio (conta nova, ou depois de Cancelar sessão): um card por espécie do catálogo (sprite animado, nome, uma linha de personalidade em `strings.onboarding.traits`), campo de nome com sugestão + 🎲, e o aviso de que todos os outros dá pra adotar depois na loja. É grátis (`adoptStarter`, sem moedas) e já nasce equipado; não dá pra farmar porque Cancelar sessão zera as moedas junto. (2) Período de uso + se pula fins de semana ("← Trocar de pet" volta). Quem já tem pet vai direto pro passo 2. `finishOnboarding` valida tudo antes de mudar qualquer coisa (`end-before-start`, `no-starter`, `unknown-species`, `invalid-name`). Config é editável depois em Configurações. "Usar sempre" preserva `periodStart` (= hoje) como marco inicial; só `periodEnd` fica null.
- **Settings é página inteira, não modal** (`#settings-panel.settings-page`, `position:fixed;inset:0`): topbar com "← Voltar" + título, sub-nav de abas sublinhadas ("Rotina" / "Geral"), área de scroll própria (`.st-scroll`, conteúdo em coluna de 620px centralizada) e barra de ações fixa embaixo ("↺ Padrão" / "Salvar"). É a única tela do app que não é modal — o resto continua em `.panel-overlay.center`. Abre sempre em "Rotina" (`switchSettingsTab` também zera o scroll ao trocar de aba). O id interno da aba continua `day` por compatibilidade.
- **Anatomia visual do settings**: cada assunto é uma `.st-section` = título em caps (`.st-section-title`) + frase explicando em linguagem normal (`.st-section-desc`) + um `.st-card` com os controles. Rotina tem Resumo do dia / Janelas de estudo / Almoço / Ritmo do pomodoro; Geral tem Período de uso / Meta diária / Tutorial ("Ver o tour de novo", ver "Tutorial (tour contextual)") / Meus dados / Zona de perigo. Checkboxes viraram switches (`.st-switch`, o `<input type=checkbox>` continua lá com o mesmo id — só está visualmente escondido). O "Resumo do dia" (`#config-preview`, populado por `updatePreview`) mostra 4 tiles (pomos / estudo / pausas / XP-dia, o último em accent) mais uma frase `.sts-note` `.ok`/`.warn` dizendo em português o que acontece no fim do dia — não é mais um dump de texto monoespaçado.
- **Botão "🎯 Encaixar estudo"**: na aba Rotina, dentro do card "Ritmo do pomodoro", abaixo dos três inputs e separado por um `.st-divider`. Abre o modal `#fit-study-panel` (wizard). Usuário diz pomo/pausa curta/pausa longa **ideais** e flexibilidade (±5/10/15min). Algoritmo varia cada parâmetro dentro da flex (pomo passo 5, short passo 1, long passo 5), simula `generateBlocks` pra cada combinação no **dia visível** (respeitando start/end/almoço/eventos), ranqueia por `studyTotal - penalty*0.5` onde penalty cresce com desvio do ideal (pomo peso 1, short 0.5, long 0.3), e mostra top 3. Clicar "Aplicar" preenche os inputs do form `#cfg-pomo/#cfg-short/#cfg-long` (não salva direto — usuário confirma com "Salvar" no settings, mantendo o fluxo padrão). Sem mexer em `start`/`end`/`lunch` — só nos parâmetros do pomodoro.
- **`periodStart` é fixo por sessão**: na aba Geral, o input "Início" fica `disabled`. Só `periodEnd` e `skipWeekends` são editáveis. `resetSettings` e `clearPeriod` preservam o `periodStart`. Pra mudar o início, o usuário precisa **cancelar a sessão**.
- **Meus dados**: card em Configurações → Geral (acima da Zona de perigo) com "Baixar (JSON)" (`#export-data-btn`): baixa o documento inteiro como é salvo (`serializeState`) mais `exportedAt`, sem uid, e-mail nem o carimbo de sync, com o nome `study-pets-AAAA-MM-DD.json`. É a resposta pra "quero meus dados". Importar fica de fora até alguém pedir.
- **Cancelar sessão**: botão "Zona de perigo" na aba Geral. Modal de confirmação lista o que vai apagar. Ao confirmar: zera `checks`, `events`, `lunchOverrides`, `windowOverrides`, `groups`, `pets`, `coinsSpent`, e reseta `config` pro `DEFAULT_CFG`. Em seguida abre o onboarding (equivalente a uma conta nova). É a única forma de redefinir o `periodStart`.
- **Apagar conta**: segunda linha do card "Zona de perigo" (aba Geral), abaixo de Cancelar sessão e separada por um `.st-divider`. Abre o modal `#delete-account-panel`, que exige o usuário **digitar "APAGAR"** (case-insensitive) pra destravar o botão — proteção contra clique errado, já que o botão de Cancelar sessão fica logo acima. Quando a conta é de e-mail/senha (`state.user.provider === 'password'`), o modal também exige uma **senha** (`#del-acc-password`, campo obrigatório) antes de destravar o botão — é o que a reautenticação usa no lugar do popup do Google. Ao confirmar: `deleteDoc(users/{uid})` **primeiro** (depois do `deleteUser` não sobra credencial pra passar nas rules do Firestore), depois `deleteUser(user)`. Se o Firebase responder `auth/requires-recent-login`, reautentica e tenta de novo — por popup do Google, ou com `reauthenticateWithCredential(user, EmailAuthProvider.credential(email, senha))` quando o provedor é `password`. A flag global `accountDeleted` + `clearTimeout(saveTimeout)` travam o save debounced pendente pra ele não recriar o doc logo após a exclusão; `onAuthStateChanged` zera a flag quando alguém loga. Sucesso → `onAuthStateChanged(null)` devolve a tela de login. Erros aparecem inline em `#del-acc-status` (não é toast — o modal continua aberto pra tentar de novo; mensagem genérica cobre tanto reauth do Google quanto senha errada — ver decisão no plan file). No modo teste (sem Firebase) o fluxo é o mesmo na UI, mas o confirm só zera o state em memória e abre o onboarding — a senha é aceita mas não é de fato checada (não há "login recente" a simular em memória).
- **Janelas do dia, "Começar agora" e "Dia livre"**: o almoço tem override por dia; as janelas também (`windowOverrides[dateKey] = { studyWindows }`, lista vazia = dia livre) — "acordei tarde, hoje começo às 10" não muda mais a rotina nem cria evento falso. Botão "🕘 Janelas do dia" (`#day-windows-btn`) na barra ao lado de "Agrupar" / "+ Evento", só em dia editável (hoje ou futuro, não encerrado); dia com override mostra "🕘 Janelas · editado" em laranja, como o almoço faz. Abre o modal `#day-windows-panel` com o mesmo `StudyWindowsEditor` das Configurações (só pra este dia), "+ Adicionar", **"▶ Começar agora"** (`#day-windows-start-now`, só hoje: a janela que contém agora — ou a próxima — passa a começar no próximo múltiplo de 5 min; janelas já passadas ficam), **"🌴 Dia livre"** (`#day-windows-off` → confirmação `#day-windows-off-confirm`; só hoje/futuro, e hoje só sem check — declarar depois de falhar seria o "streak freeze") e **"↺ Restaurar rotina"** (`#day-windows-restore`, quando há override). Validação: fim > início, sem sobreposição, lista não vazia (vazio só pelo botão de dia livre). **Dia livre é neutro**, igual ao fim de semana com `skipWeekends`: `allDays()` deixa ele de fora, então não quebra a sequência, não conta como meta batida e tem 0 planejado; nos dots vira `off` e no heatmap `day-off` (apagados). "Prolongar estudos" num dia com override estica o override; "Encaixar estudo" simula com as janelas do dia visível. Cancelar sessão zera. A alternativa "dia livre quebra a sequência" vive na branch `feat/revisao-fundacao-alt-dia-livre-quebra`.
- **Dia vazio**: se `blocksForDay()` retorna `[]` (fim de semana com `skipWeekends`, ou dia declarado livre), `renderBlocks` mostra "🌴 Dia livre".
- **Dia futuro**: navegar pra qualquer dia > hoje mostra blocos esmaecidos (`.block-row.day-future`, opacity .45) e clicar dispara toast "Ainda não chegou 🔮" — não inicia timer nem marca check. Helper `isFutureDay(dateKey)`. `toggleCheck` também blinda como fallback. Espelha o padrão `.day-closed`/`isDayClosed` que já existia pra dias encerrados.
- **Modo foco**: ao clicar num bloco de estudo ou pausa **de hoje que ainda não terminou** (passou validação de `tryStartTimer`), abre overlay tela-cheia `#focus-overlay` por cima da UI: chip "Sessão N · Bloco M", nome do bloco limpo, timer circular SVG que drena (`stroke-dashoffset`), "+X XP · +Y 🪙 ao concluir", e card "Em seguida" com o próximo bloco do dia (ou "Fim do dia 🌙"). Anel verde pra estudo, azul pra pausa. Sem controles centrais (sem pausar nem skip — decisão consciente). Botão "← Sair do foco" no topo só fecha o overlay e mantém o timer rodando — pra cancelar mesmo, a `timer-bar` no topo da UI normal tem o "✕ Parar". **Antes da hora** (o bloco começa em 3 min, digamos): o foco abre **em espera** — anel cheio e apagado (`.waiting`), contagem regressiva até o início em cinza, "começa às HH:MM", e a barra diz "Começa em" — e vira o pomodoro normal sozinho quando o relógio chega lá (`timerProgress(...).phase`: `waiting` → `running`; sem estado extra, é só o relógio). **Fim do bloco dentro do foco** é conquista: `checkBlock` marca o bloco sozinho (sem desmarcar um check feito à mão no meio), toca o som `sucesso` (arpejo "deu certo"), e o foco **emenda** no bloco seguinte (`chainedBlockAfter`: estudo → pausa → estudo…, só estudo/pausa que começa exatamente quando este acaba), mostrando a faixa `#focus-done` "✓ Estudo 3 concluído · +50 XP · +25 🪙" por ~4s (`derived.timerCompleted`, escondida pelo relógio, sem timeout). Almoço, evento, gap entre janelas, fim do dia ou dia encerrado param a sequência: marca, fecha o foco e a mesma frase vira toast. **Com o foco fechado** (só a barra), o fim continua como sempre foi: som do tipo, notificação, e o timer some — sem check automático. **Aba em segundo plano / celular travado**: o `setInterval` é estrangulado ou congela, então ao voltar pra visível (`visibilitychange`/`pageshow`) o app chama `reconcileTimer` — o mesmo caminho de fim, um bloco por vez se vários passaram (cada emenda cai no `done` de novo). Enquanto o foco está aberto o **Wake Lock** segura a tela ligada (solta ao sair do foco, parar ou terminar; re-pede ao voltar pra visível, porque o browser solta sozinho ao esconder a página). Espaço `.focus-scene-stage` está reservado pra cena ambiente (personagem + pet), por enquanto vazio.
- **Grupos de estudo**: nome + objetivo sobre um trecho do dia ("Análise II · terminar a lista 3"), criados direto no plano. Três portas de entrada pro mesmo estado de seleção (`useGroupSelection`): arrastar com o **botão direito** no desktop, **segurar o dedo** numa linha no celular e arrastar (soltar sem arrastar cai no modo de tocar no último bloco), ou o botão **"Agrupar"** ao lado de "+ Evento" (toca no primeiro bloco, depois no último; com mouse, passar por cima mostra o intervalo). Durante a seleção um retângulo tracejado envolve as linhas escolhidas; no celular, o toque longo segura o scroll com um `touchmove` nativo não passivo e captura o ponteiro na linha, e perto da borda da tela a página rola sozinha. O intervalo vira o modal `#group-panel` (nome, objetivo opcional; Enter salva). Grupo é **anotação por horário** — `{id, start, end, name, goal}` em `state.groups[dateKey]` — e **nunca entra no `generateBlocks`**: pertencimento se calcula na render (bloco que cabe inteiro no intervalo), então config/evento mudando não corrompe nada, igual aos checks por horário. Na lista, o grupo é uma **caixa** (`.group-box`, `features/groups/GroupBox.tsx`) que envolve o cabeçalho `.group-header` (nome, objetivo, `feitos/total`, minutos e barra de progresso) e as linhas membros (`.in-group`; só estudo e evento contam, pausa é membro visual). Membros são contíguos porque blocos são sequenciais e grupos não se sobrepõem; divisor de sessão que coincide com o início do grupo fica fora da caixa. **Cores dos grupos** (`gc-0`…`gc-5` no CSS, pela ordem do grupo no dia): paleta fria e luminosa (ciano, índigo, turquesa, magenta, céu, lilás), de propósito fora da paleta das sessões — grupo é outra camada. Completo vira verde. Tocar no cabeçalho edita/apaga. **Ajustar o trecho**: puxando a alça (`.gb-grip`) na borda de cima ou de baixo da caixa, com mouse ou dedo (o retângulo acompanha; a alça de baixo não passa da linha de cima, e vice-versa; soltar chama `updateGroup`, e sobreposição vira toast sem mudar nada). Digitar início/fim no painel foi testado e **removido**: horário livre corta bloco pelo meio, e trecho é sempre de linhas inteiras — o painel só mostra o resumo. O menu de contexto do browser é bloqueado durante arrasto/toque longo por um listener de captura no `document` (o modal abre no pointerup, fora da lista). Validação em `domain/groups.ts`: fim > início, sem sobrepor outro grupo, ≥ 1 estudo/evento dentro. Dia encerrado é read-only; dia **futuro pode** (planejar é o ponto). Cancelar sessão zera. v1 consciente: sem recorrência, sem "matéria"/cores, sem "cumpri o objetivo?" — ver IDEIAS.md.
- **Tutorial (tour contextual)**: balões em cima do app de verdade, apontando pro elemento real, na **primeira visita a cada aba** — não são cartões antes da primeira tela (decisão em IDEIAS.md, "Tutorial depois de criar a conta"). Cinco balões, tom adulto, explicam o **modelo** e não os botões: Plano (3) — "Seu dia já está montado" (âncora: a barra do dia `.day-events-bar`, anel na primeira `.block-row`), "A vida muda, o plano acompanha" (`#add-event-btn`), "No fim do dia, encerre" (`.finish-day-btn`; se o botão não existe — outro dia visível, dia encerrado — vira um cartão fixo no rodapé, sem seta); Perfil (1) — "Pets são horas estudadas" (`#active-pet-card` ou `#no-active-pet`); Análise (1) — "Tô fazendo o que planejei?" (`#an-subnav`). Textos em `strings.tutorial.steps`, duas linhas. **Gatilho**: `activeTourArea(tutorialSeen, uiTab, {onboardingOpen, loaded})` — só com o onboarding fechado, o app carregado e a aba visível ainda não vista; Plano é o primeiro porque é a aba inicial. Conta que já existe (doc sem `tutorialSeen`) também vê o tour uma vez. **Não bloqueia a tela**: sem backdrop, `pointer-events` só no balão, `z-index` 80 — acima da lista, abaixo do ⚙️ (90), da barra do timer (99), do topbar (100), dos modais/Configurações (200) e do foco (300), então nunca cobre um modal. Posição em coordenadas do documento (rola junto com o elemento), medida a cada render e em resize/relayout (`ResizeObserver` no body); `placeBalloon` (domínio) decide o lado (vira se não cabe) e clampa na tela. **Posição é contrato com o smoke test**: o balão do Plano fica **acima da barra do dia** (Janelas do dia / Agrupar / + Evento), alinhado à esquerda, com 280px — a barra inteira, os checks, os nomes dos blocos e o cabeçalho de um grupo ficam livres, e ele cobre só o seletor de semana e as abas dos dias (acima da lista, ele cobria o botão mais à esquerda da barra); o do Perfil fica acima do card do pet (os botões "Meus pets"/"Loja" ficam livres). Mudar isso = rodar o e2e. "Pular" (sempre visível) e "Entendi" no último balão marcam a **área inteira** como vista (`finishTour`); avançar entre balões é `useState` do componente — trocar de aba e voltar recomeça a área do primeiro balão (não persiste o passo). "Ver o tour de novo" (Configurações → Geral → Tutorial, `#tour-restart`) zera `tutorialSeen` e fecha as Configurações — o ⚙️ só existe no Plano, então o balão 1/3 aparece embaixo. **Cancelar sessão não zera** (quem cancelou já conhece o app). Ids/classes: `#tour-balloon` (`.tour-above`/`.tour-below`/`.tour-card`, `data-step`), `.tour-ring`, `.tour-arrow`, `#tour-next`, `#tour-skip`, `#tour-restart`, `#add-event-btn`.

## Aba Análise

A aba responde "tô fazendo o que planejei?" — diagnóstico, não vitrine. Estrutura: **profile card + sparkline sempre visíveis no topo**, depois **sub-nav com 4 chips** (Hoje / Semana / Geral / Recordes; default = Hoje) que troca o conteúdo abaixo via `.subview.active`.

**Profile card (sempre visível)**: nível, XP, barra de progresso pro próximo nível, e abaixo uma **sparkline SVG** com as últimas 8 semanas de minutos de estudo (`stats.dayStudyDoneMins` agregado por `mondayOf(d)`). Prefixa com zeros se houver menos de 8 semanas de dados. Ponto destacado no último valor.

**Sub-abas e o que cada uma mostra:**

- **Hoje** (default): card **grande** "Realizado hoje" (min cumpridos / planejados + barra + %) + card "Meta diária" com 7 dots da semana, com o dia de hoje destacado por anel (`.goal-dot.today`).
- **Semana**: card "Realizado na semana" + card "Meta diária" (dots sem anel) + "Conclusão por sessão" (drop-off, marcado como *histórico*).
- **Geral**: card "Realizado no geral" (agrega **todos os dias com dados** até hoje, não só o mês corrente) + heatmap GH-style (7×16) + "Horários onde mais estuda" (hour chart).
- **Recordes**: stats row (Blocos / Dias seguidos / Melhor semana) + cartão de recordes (sequência atual, maior sequência, melhor dia, XP num dia).

**Realizado (cumprido vs planejado, por tempo)**: cada card mostra `min cumpridos / min planejados`, sub em horas (`Xh de Yh`), barra, e %. Classes `.low` (laranja, pct<20) e `.zero` (cinza + "sem dados ainda"). Card "Hoje" tem variante `.adh-big` (padding/fontes maiores). Decisão de granularidade por tempo (não por sessão) é consciente: mais reliable.

**Meta diária — 7 dots**: card com headline "Você bateu a meta de Xmin em **N de 7** dias esta semana" + 7 spans (Seg–Dom) com classes `.met` / `.miss` / `.future` / `.weekend` / `.today` (anel verde só no card da aba Hoje). Conecta `config.dailyStudyMin` à análise. Se `skipWeekends=true`, headline vira "N de 5" e sáb/dom ficam neutros.

**Heatmap GitHub-style**: 7 linhas (dias) × 16 colunas (semanas) com `grid-auto-flow:column`. Cor por **% da meta diária batida** (0/25/50/75/100+). Cells futuras dashed, sáb/dom (se skipWeekends) neutros. Tooltip "DD/MM (hoje): X de Y min (Z%)". Se `dailyStudyMin===0`, intensidade = 4 se done>0 senão 0.

**Drop-off por sessão**: linha por número de sessão (Sessão 1, 2, 3...) com barra + pct + "done/total". Itera `stats.sessionStats` (só dias fechados). `.do-fill.low` se pct<50.

**Implementação**: `renderAnalytics()` é orquestrador curto que chama todos os sub-renderers (`renderAnalyticsProfile`, `renderAdherenceCards`, `renderGoalWeekDots`, `renderAnalyticsStats`, `renderHeatmapGH`, `renderHourChart`, `renderDropoffChart`, `renderSparkline`, `setupAnalyticsSubnav`). `renderGoalWeekDots` chama `renderGoalWeekDotsTo` 2 vezes (uma pro card da Hoje com `highlightToday:true`, outra pro card da Semana). `setupAnalyticsSubnav` registra um único listener de click em `#an-subnav` que toggla `.active` nos chips e nas subviews — protegido por flag `_anSubnavBound` pra não dobrar se a aba for re-aberta. Os ids dos cards de realizado são `adherence-today` (variante grande), `adherence-week`, `adherence-geral`. **`adherence-geral` agrega `Object.keys(stats.dayStudyPlanned).filter(k => k <= today)`** — todos os dias passados+hoje, não só mês corrente.

**Novos campos de `computeStats`** (todos populados na mesma passada do loop existente — sem segunda iteração):
- `dayStudyPlanned: { "YYYY-MM-DD": min }` — soma `endTime-time` de todos blocos `type==='estudo'` no dia (planejado).
- `dayStudyDoneMins: { "YYYY-MM-DD": min }` — mesmo somatório, mas só dos blocos checked. Inclui hoje (sem exploit possível — aderência não é XP).
- `dayMetGoal: { "YYYY-MM-DD": bool }` — `dayStudyDoneMins[key] >= dailyStudyMin`.
- `sessionStats: { N: {done, total} }` — só dias fechados (`isPast`), só blocos de estudo, agrupados por `b.session`.

**Importante**: `dayStudyMins` (streak/bônus) e `stats.coins`/`stats.studyMins` (totais) agora usam **duração real** (`endTime-time`) — não mais `cfg.pomo` fixo. Eventos checked contam junto com estudo. Mini-estudos contam pela duração real (não inflados pra pomo cheio). Helpers novos: `monthKey(d)`, `currentWeekDayKeys()`, `aggregateMins(doneObj, plannedObj, keys)`.

## Sistema de gamificação

Valores e thresholds estão definidos no código (`LEVELS`, `calcXP`, etc.). Aqui só o conceito:

- **XP**: ganho por bloco concluído. Fórmula simples: `calcXP(minutes) = minutes * 2`. Estudo de 25min → 50 XP; estudo de 60min → 120 XP. Pausa usa `bxp = max(1, breakDur)` (~1 XP por minuto), mantendo a proporção estudo:pausa de 2:1. Evento checked também vale `calcXP(duração)` — pra eventos contarem como aulas/compromissos legítimos que rendem progresso.
- **Níveis**: lista ordenada definida em `LEVELS` com thresholds e nomes. Calibrado pra escala nova (`calcXP=min*2`): 0/250/750/1500/2500/4000/6000/10000.
- **Moedas**: duas fontes. (a) Por bloco de estudo OU evento concluído: **1 moeda por minuto** (`coinsForBlock(b, dur) = dur`). Estudo de 25min → 25 moedas; evento de 90min → 90 moedas. Sem multiplicador progressivo — XP é 2× e moeda é 1×, sempre, exceto bônus de skill/streak (que podem somar em cima). (b) Bônus diário por faixa de streak: `DAILY_BONUS_TIERS` (5/8/12/18/25 moedas nos marcos 1/3/7/14/30 dias). O bônus só conta no dia se total de estudo concluído ≥ `config.dailyStudyMin`. Saldo = total − `coinsSpent`.
- **Streak**: dia entra no streak só se `dayStudyMins ≥ config.dailyStudyMin` (padrão 60min, editável em Configurações → Geral). `dayStudyMins` soma duração real de **estudos e eventos** checked — pausas não contam. Mudar o mínimo recalcula retroativamente.
- **Sons**: Web Audio API (sem arquivos externos), diferentes por tipo: `check`, `estudo`/`pausa_curta`/`pausa_longa` (fim do bloco fora do foco) e `sucesso` (fim do bloco dentro do foco — arpejo "deu certo").
- **Notificações**: Web Notifications API quando timer acaba.

## Sistema de pets

**Modelo**: espécie ≠ forma ≠ instância.

- **Espécie** (`PETS`) é o que a loja vende: preço, forma base, caminhos de evolução, sugestões de nome.
- **Forma** (`FORMS`) é o que aparece na tela: nome, emoji, sprite, skills possíveis. Cachorro, Pastor alemão e Lobo são três formas; só Cachorro é espécie. Espécies hoje: Cachorro, Gato, Cobra, Vaca, Pomba (todas com sprite e pelo menos uma skill).
- **Espécie renomeada** passa por `SPECIES_RENAMES` (`owl` → `dove`: a coruja virou pomba em 2026-09-03). `normalizePetInstance` traduz na leitura e desliga skill que a forma atual não tem; o **id da instância continua o antigo** (`owl`), então checks salvos seguem creditando.
- **Instância** (`PetInstance`, em `state.pets.owned`) é o pet adotado: `{ id, species, name, xp, path, stage, skill, skillActivatedAt, adoptedAt }`. Dá pra ter dois cachorros — cada um com nome e XP próprios. O id é o da espécie se estiver livre (`dog`), senão `dog-2`, `dog-3`. `state.pets.active` é o id da instância; `activeSince` marca quando foi equipada.

Adicionar um pet novo:

1. Colocar sprites em `public/idle/pets/{form}/` (`0.png` a `{frames-1}.png`, 32×32 com transparência — `scripts/pixel-sprites.mjs` é o padrão)
2. Adicionar a forma em `FORMS` e a espécie em `PETS`, em `src/domain/pets.ts`. Se a imagem do sprite falhar (pasta não existe ainda), o emoji entra no lugar — dá pra cadastrar antes da arte existir.

**Nome**: obrigatório ao adotar, mas o campo já vem preenchido com uma sugestão sorteada de `species.names` (🎲 sorteia outra). 1–16 caracteres (`normalizePetName`). Renomear é grátis (✏️ no card em "Meus pets"). O nome aparece no card "Pet ativo", em "Meus pets", no resumo do fim do dia e nos toasts.

**Nível do pet**: curva própria, separada da do usuário — o próximo nível custa `50 + 20·(nível−1)` XP (`petXpToNext`/`petLevelStart`/`petLevelFromXP`). Lv. 2 = 1 pomo, Lv. 10 ≈ 10h, Lv. 30 ≈ 80h. Sem teto.

**Evolução**: a espécie declara `paths` (caminhos), cada um com `stages: [{ level, form }]`. `evolutionOf(pet)` diz o que está disponível: `choose` (chegou no nível e ainda não tem caminho — escolhe entre as opções), `advance` (próximo estágio do caminho), `locked` (falta nível) ou `null` (não evolui / fim do caminho). `evolve` devolve a instância nova: nome, XP e nível continuam; só `path`/`stage` mudam (a forma é derivada por `petForm`); skill que a forma nova não tem é desligada. **Definitivo.** Hoje: Cachorro → *Companheiro* (Pastor alemão) ou *Selvagem* (Lobo), no **Lv. 5** (`DOG_EVOLVE_LEVEL`; 320 XP ≈ 2h40 de estudo com o pet equipado — cedo o bastante pra dar senso de evolução). Uma transformação maior no Lv. 30 é ideia futura — ver IDEIAS.md. UI: botão "✨ Evoluir" no card em "Meus pets" abre `#pet-evolve-panel` com um card por caminho (sprite, nome da forma, descrição, skills); "Evolui no Lv. N" enquanto trancado.

A **loja de pets** vive num modal próprio (`#pets-shop-panel`), aberto pelo botão "🛒 Loja de pets" no perfil. Grid de 2 colunas, card vertical (imagem/emoji + nome + preço + botão). Os cards são `ShopPetCard` (espécie, com preço) e `OwnedPetCard` (instância, em "Meus pets").

**Estrutura da área de pets no perfil** (abaixo dos stats 4-col):

1. **Card "Pet ativo"** (`.active-pet-card`, id `#active-pet-card`): destaque do pet equipado no momento. Sprite da forma atual (54×54) + tag "Pet ativo" + **nome do pet** + badge `Lv. N` + nome da forma (`#ap-species`) + barra de XP + texto `X / Y XP · faltam Z pro Lv. N+1`. Quando não tem pet equipado, esconde e mostra `#no-active-pet` ("Nenhum pet equipado. Adote um na loja e equipe em 🐾 Meus pets."). Populado por `renderActivePetCard()` chamado dentro de `renderProfile()` (que já roda em equip/compra). Cálculo usa `petProgress` (curva própria do pet).

2. **Botão "🐾 Meus pets"** (`.shop-open-btn` com `onclick=openMyPets()`): abre o modal `#my-pets-panel` com a grade completa de todos os pets adquiridos. Mostra contador `X/N ✨` no canto direito (`#my-pets-count`; espécies distintas adotadas / espécies no catálogo). Modal lista todos via `renderOwnedPets()` populando `#my-pets-grid`, inclusive o ativo (com badge "✓ Equipada"). Equipar/desequipar de dentro do modal é grátis e instantâneo.

3. **Botão "🛒 Loja de pets"**: igual antes — abre modal de compra.

**Subtitle do hero do perfil** (`#char-title-sub`): mostra **só o nível do usuário** (ex: "Dedicado"). Info do pet vive no card dedicado abaixo — sem redundância.

Removido: grade inline `#my-pets-grid-profile` e header "Meus pets" inline. O id `my-pets-count` foi reaproveitado pro contador no botão.

**Pet ganha XP (com fechamento de dia)**: quando o usuário marca um bloco, `toggleCheck` salva o pet equipado **no momento do check** em `state.checks[date][time] = { pet: instanceId | null, bonus }`. XP não é creditado na hora — fica "pendente". `applyPendingPetXP()` processa dias **anteriores a hoje** entre `state.pets.xpProcessedUntil + 1` e ontem: pra cada **estudo ou evento** done (nos blocos do dia **como eles eram** — `blocksForDay`, com almoço e janelas editadas daquele dia), credita `b.xp` no pet salvo naquele check. Roda em `initApp()` e `renderProfile()` (cobre o caso do app ficar aberto atravessando a meia-noite). Idempotente — não credita 2x. Na primeira execução pós-mudança (`xpProcessedUntil == null`), zera o XP de todas as instâncias e marca `yesterday` como processado (sem aplicar retroativamente) — e **não salva** se não creditou nada: numa conta nova, salvar aí criaria o doc antes do onboarding terminar, e um reload pularia o onboarding e o pet inicial. Level usa a curva própria do pet (`petLevelFromXP`). Pausa não conta (só estudo+evento). Pet null no momento do check = ninguém ganha XP.

**XP/moedas do usuário também só refletem dias fechados**: `computeStats()` itera todos os dias, mas só agrega `totalXP/totalChecks/coins/studyMins/hourCounts/weekXP/weekChecks/bestDay/activeWeeks` quando o dia está fechado (`isPast = key !== todayKey || isDayClosed(key)`). Stats específicos de hoje (`todayXP`, `todayCoins`, `estudosToday`, `pausasToday`, `dayStudyMins[today]`) continuam refletindo o dia atual. Streak ainda usa `dayStudyMins` incluindo hoje (você "está em sequência" se atingiu o mínimo), mas o **bônus de moedas** do streak só entra quando o dia fechou. Motivo: evitar exploit de marcar/desmarcar pra ganhar XP/moedas; também garante consistência com o XP do pet.

**Contador de hoje pendente (UI)**: no `xp-card`, a linha "Hoje" (`#today-xp-val`) mostra em laranja "pendente" os ganhos previstos — `Hoje: +X XP · +Y 🪙` — sempre que hoje tem checks e ainda não foi encerrado, num pill com glow e pulse bouncy (`@keyframes pulse-pending`) quando o valor sobe. Quando o dia fecha, vira "✓ Hoje encerrado" em verde (e os totais já abrigam o ganho). `renderTodayPending(stats)` cuida do display. Marcar/desmarcar atualiza o pendente em tempo real sem reabrir o exploit — o XP real só entra no total quando o dia fecha.

**Feedback dopamínico no check**: ao marcar um bloco (não ao desmarcar), o click handler em `renderBlocks` dispara três efeitos visuais sincronizados com o som `playSound('check')`: (1) `spawnCheckRipple(rect)` joga um anel verde expandindo a partir do check, (2) `spawnFloatGain(checkEl, xp, coins)` cria um overlay flutuante com "+X XP" verde grande e "+Y 🪙" laranja menor que sobem e somem em ~1.2s, (3) o badge "Hoje" pulsa no próximo `renderXP`. A `rect` do check é capturada **antes** de `toggleCheck`/`renderAll` porque o re-render destrói o nó; os overlays vivem em `document.body` (não dentro da row) pra sobreviver. CSS: `.float-gain`, `.check-ripple`, `@keyframes gain-fly-xp/gain-fly-coin/check-ripple`.

**Encerrar o dia manualmente**: na aba Plano (só pra hoje, só se ainda não fechado), aparece o botão **"✓ Encerrar o dia"** abaixo da lista de blocos. Clicar abre o modal `#finish-day-confirm` com aviso de que é decisão final. Confirmar:
1. Captura `before = snapshotForSummary()` (XP, moedas, level idx, pet XPs antes).
2. Adiciona `state.closedDays[today] = true`.
3. Chama `applyPendingPetXP()` na hora.
4. Re-renderiza.
5. Captura `after = snapshotForSummary()`.
6. Mostra o modal **`#day-summary-panel`** com `renderDaySummary(before, after)`: cards "+X XP" e "+Y Moedas" no topo, banner verde "🆙 Subiu pro nível N" se o usuário upou, e uma linha por pet que ganhou XP (sprite + nome + Lv. antiga → nova ✨ se upou).

A partir daí, `computeStats` trata hoje como dia fechado (XP/moedas entram nos totais na mesma hora), `toggleCheck` no-op pra esse dia, e a UI dos blocos fica esmaecida (`.day-closed`) — clicar mostra toast "Dia encerrado 🔒". O botão vira banner cinza "✓ Dia encerrado". Não há reabrir — é definitivo. A virada de meia-noite continua sendo fallback automático.

**Prompt automático no fim do dia**: `scheduleEndOfDayPrompt()` calcula o `endTime` do **último bloco de estudo** do dia (via `lastStudyEndToday()`) e agenda um `setTimeout` único pra disparar nesse momento exato. Sem polling. Quando dispara, `checkEndOfDayPrompt()` verifica as condições (hoje não fechado, ≥1 check hoje) e abre o modal `#day-end-prompt` com 2 opções:
- **"✓ Encerrar o dia"** → fecha o prompt e abre o `#finish-day-confirm` (fluxo normal).
- **"⏰ Prolongar estudos"** → expande inline um input `time` (sugerindo agora+1h) + botão Prolongar. Salvar muda `state.config.end` pro novo horário, chama `clearBlockCache()` e re-renderiza — o dia se estende e o app continua a gerar blocos.

Reagendamento: `scheduleEndOfDayPrompt()` é chamado em `initApp`, em `endPromptSaveExtend` (depois de prolongar — reseta `endPromptShown` pra permitir novo disparo com o novo horário), e em `saveSettings` (config mudou → último bloco pode ter mudado). `confirmFinishDay` faz `clearTimeout` no timeout pendente (higiene — `isDayClosed` já segura, mas evita disparo desnecessário). Flag `endPromptShown` evita reabrir o prompt depois que já apareceu uma vez (até que prolongar/saveSettings reset). Persistência: dia encerrado fica em `state.closedDays` no Firestore, então a checagem `isDayClosed(today)` em `checkEndOfDayPrompt` pula naturalmente em qualquer reabertura do app no mesmo dia.

**Hero scene do perfil**: container com gradient escuro contém personagem (`#char-sprite`) + pet ativo (`#pet-sprite`) lado a lado. Subtitle abaixo mostra `${nome do nível} · com ${pet ativo}` (ou só o nível se sem pet). Canto direito mostra "próximo nível · X XP". Stats em grid 4-col: XP total / Blocos / Estudo (horas) / Moedas (card dourado destacado).

**Economia real** (não é mais decisão futura): ao adotar um pet, abre modal de confirmação `#pet-buy-confirm` ("Adotar X por 🪙 Y?"). Ao confirmar (com o nome preenchido): cria a instância em `state.pets.owned`, equipa (`active` + `activeSince`), **`state.coinsSpent += species.price`**. Saldo exibido em `#char-coins` = `getCoinBalance() = stats.coins - coinsSpent` (nunca negativo). Se saldo < preço, botão "Adotar" ganha classe `.shop-btn.locked` (opacity .5, cursor:not-allowed) e clicar dispara toast "Moedas insuficientes" — não abre o modal. **Equipar/desequipar é grátis** e instantâneo (sem confirmação, sem custo). Cancelar sessão zera `coinsSpent` junto com o resto.

## Sistema de skills

Skills são um catálogo global (`SKILLS`, em `src/domain/progression.ts`): `{ id, name, desc, rule }`. Cada **forma** de pet lista quais ids ela pode ter (`FORMS[form].skills`); a mesma skill pode aparecer em mais de uma forma (Coruja e Lobo têm Noturno). Hoje: `noturno` (+5% em estudos a partir das 18h), `lua-cheia` (idem, 21h), `madrugador` (antes das 9h), `fiel` (+5% no 1º estudo do dia), `aula` (+5% em eventos que contam como estudo), `preguica` (estudo logo depois de uma pausa longa), `rumina` (estudo logo depois do almoço), `constancia` (o estudo/evento que faz o dia bater a meta). Quem tem: Cachorro → fiel · Pastor alemão → fiel, aula · Lobo → noturno, lua-cheia · Gato → preguica · Cobra → constancia · Vaca → rumina · Pomba → madrugador, aula. Toda espécie tem pelo menos uma (teste garante).

**Uma skill ativa por pet**, guardada na instância (`pet.skill`); `pet.skillActivatedAt` marca a troca. Clicar na ativa desliga; clicar em outra troca; `toggleSkill` recusa skill que a forma não tem. Evoluir pra uma forma que não tem a skill ativa desliga ela.

**Anti-exploit (decidido no check, não retroativo)**: `skillEligible(b, dateKey, ctx)` exige `dateKey === hoje`, a skill ativa **desde antes do bloco começar** — `ctx.activatedAt = max(pet.skillActivatedAt, state.pets.activeSince)`, então equipar o pet no fim do bloco também não vale — e a regra da skill (`after-hour`, `before-hour`, `first-study` com `ctx.studiesCheckedToday`, `event`, `after-long-break` e `after-lunch` com `ctx.prevBlock`, `meets-goal` com `ctx.studyMinsToday` + `ctx.dailyStudyMin`). `application/checks.ts` monta o contexto a partir do plano do dia. Se elegível, `toggleBlockCheck` grava `bonus: 0.05` (`SKILL_BONUS`) no check; senão `bonus: 0`. Bônus salvo é permanente — desligar a skill depois não revoga.

**XP efetivo**: `xpFromCheck(b, check)` retorna `Math.round(b.xp * (1 + (check.bonus || 0)))`. Usado em `computeStats` (todos os pontos onde XP é agregado), em `computePendingPetXP` (o pet também recebe com bônus) e no feedback flutuante do check (mostra o número final, não o base).

**UI**: dentro do card do pet no modal `#my-pets-panel`, abaixo de Equipar/Evoluir, aparece a seção "Skills" com toggles estilo switch. Estado visual: `.pet-skill-row.active` = borda verde + nome em accent + switch `.ps-toggle.on` (knob deslocado). Toggle é `<button>` (acessível por teclado).

**Pra adicionar nova skill**: (1) entrada em `SKILLS` usando uma `rule` existente — ou um `kind` novo em `SkillRule`, o caso em `skillEligible` e o que o `SkillContext` precisar (que `application/checks.ts` monta), (2) o id na lista `skills` da forma. O resto (gravação no check, `xpFromCheck`, render no card, save/load) já cobre.

## Schema do Firestore

```
users/{uid} {
  schemaVersion, // 2 = pets como instâncias. 1 = Fase 4 (pets por espécie). Ausente = anterior à migração. hydrateUserDoc lê todos
  checks,        // { "YYYY-MM-DD": { "HH:MM": { pet: instanceId|null, bonus: number } } }   pet = id da instância equipada no check; bonus = multiplicador aditivo de XP salvo no check (0 ou 0.05 hoje)
  events,        // { "YYYY-MM-DD": [{name, start, end, countsAsStudy}] } — eventos avulsos por dia. countsAsStudy: true=tipo 'event' (XP), false=tipo 'intervalo' (só bloqueia)
  eventSeries,   // [{id, name, start, end, weekdays[], freq, anchor, until, exceptions[], countsAsStudy}] — séries recorrentes
  lunchOverrides,
  closedDays: { "YYYY-MM-DD": true, ... },   // dias encerrados manualmente via botão "Encerrar o dia"
  pets: {
    owned: [{                              // v2: instâncias (v0/v1 eram ids de espécie — hydrateUserDoc migra)
      id, species, name, xp,               // id = espécie se livre ("dog"), senão "dog-2"; xp creditado quando o dia do check fecha
      path, stage,                         // caminho de evolução escolhido (null = ainda não) e estágios aplicados (0 = forma base)
      skill, skillActivatedAt,             // skill ativa (uma por pet) e ms da última troca
      adoptedAt                            // ms (0 em pets migrados)
    }, ...],
    active: instanceId | null,
    activeSince: number,                   // ms de quando o ativo foi equipado (anti-exploit do bônus)
    xpProcessedUntil: "YYYY-MM-DD" | null  // último dia já processado por applyPendingPetXP (null = ainda não inicializado)
  },
  // skills: { owl, activatedAt } existia até o v1 — migrado pra dentro da instância
  coinsSpent,
  groups,        // { "YYYY-MM-DD": [{id, start, end, name, goal}] } — grupos de estudo. Anotação por horário; nunca entra no gerador (ver "Grupos de estudo")
  tutorialSeen,  // { plan?: true, profile?: true, analytics?: true } — áreas cujo tour contextual já foi visto. Ausente = tour ainda não visto (conta antiga vê uma vez). Cancelar sessão não zera
  windowOverrides, // { "YYYY-MM-DD": { studyWindows: [{start, end}] } } — janelas só daquele dia; lista vazia = dia livre (ver "Janelas do dia")
  meta: { writer, writtenAt },  // carimbo de quem salvou por último: writer = id desta carga da página (CLIENT_ID), writtenAt = ms do relógio de quem escreveu. Só pra reconhecer eco/repetição no sync — nunca entra no estado
  config: {
    studyWindows,   // [{start:"HH:MM", end:"HH:MM"}, ...] — janelas de estudo do dia (fonte da verdade)
    start, end,     // derivados de studyWindows (primeira/última) — mantidos só pra retrocompat
    lunch, lunchDur, hasLunch,                              // almoço (separado das janelas)
    pomo, shortBreak, longBreak,
    periodStart,    // "YYYY-MM-DD" | null (null = "sempre", sem fim)
    periodEnd,      // "YYYY-MM-DD" | null
    skipWeekends,   // boolean (true = sáb/dom sem blocos nem stats)
    dailyStudyMin   // number (15–240, padrão 60). Min de estudo/dia pra contar streak + bônus.
  }
}
```

Schema flat funciona pro volume atual. Quando ficar lento, considerar subcollection por dia.

`periodStart`/`periodEnd` controlam o range de `WEEKS` em `buildWeeks()`. `skipWeekends` é respeitado em `forEachDay()` e `blocksForDay()`. Doc inexistente em `users/{uid}` = novo usuário → modal de onboarding aparece (ver "Onboarding" abaixo).

## Visual

- Tema escuro fixo
- Cor primária verde lima (definida em CSS variable)
- Fontes: DM Sans (UI), DM Mono (números), Press Start 2P (landing)
- Layout mobile-first, max-width 480px centralizado
- Sprites com `image-rendering: pixelated`
- **Modais**: todos centralizados na tela (classe `.panel-overlay.center`). Não usar sheet de baixo pra cima. Exceção: **Configurações não é modal** — é página inteira (ver "Settings é página inteira" acima).

## Direções futuras

- Mais pets (estrutura pronta)
- Chatbot pra otimizar configuração (precisa avaliar custo de API)
- ~~Sync mais responsivo entre dispositivos~~ → feito por snapshot (ver `application/sync.ts`); o que resta é escrita granular por campo, se a janela do "local vence" um dia doer
- Notificação pelo service worker e push do servidor pro fim do bloco com o celular travado (ver IDEIAS.md)

## Decisões adiadas conscientemente

- ~~Não separar em múltiplos arquivos~~ → o limite foi ultrapassado (o script tinha 2903 linhas dentro de um HTML de 4454). Migração em curso: ver `plans/2026-09-02_1552_migracao-vite-ts.md`
- Não migrar Firestore pra subcollection (reavaliar quando salvar virar lento)

## Sempre

- Atualizar este arquivo quando uma decisão de design mudar
- Testar em `npm run dev:teste` antes de commitar (e `npm test` + `npm run typecheck`)
- Quando notar algo aqui que não bate com o código, perguntar ao usuário antes de "corrigir" — pode ser que o design tenha evoluído de propósito
