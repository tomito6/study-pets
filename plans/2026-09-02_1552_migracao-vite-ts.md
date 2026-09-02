# Migração pra Vite + TypeScript (e talvez React)

Criado em 2026-09-02. Branch de trabalho: uma por fase, começando por `refactor/fase-1-seguranca`.

## Objetivo acordado

Um app real, bem feito, que **pode** ser aberto pra outras pessoas — construído do jeito mais barato
que ainda seja bom, escalando pra "oficial" só quando/se fizer sentido. Não pagar agora por i18n,
política de privacidade nem onboarding pra estranho.

## Diagnóstico (medido em 2026-09-02)

- `index.html`: 4454 linhas / 210KB — ~2900 de JS (105 funções, 524 acessos ao DOM) e ~721 de CSS.
- `index_teste.html`: cópia mantida à mão, 373 linhas divergentes, features em paridade. É **versionado**
  (o `.gitignore` estava vazio, ao contrário do que o CLAUDE.md dizia).
- Sem `package.json`, sem testes, sem `firestore.rules` no repo.
- `CLAUDE.md` já dizia "reavaliar separar em arquivos ao passar de ~3000 linhas" — passou em 50%.
- Pasta `planos-estudos/` é cópia antiga (remote `plano-estudos.git`); conteúdo idêntico ao `study-pets/`
  fora line endings. Congelada, não desenvolver nela.

## O que já está pronto pra "mais pessoas" (não precisa mexer)

- Schema já é `users/{uid}`; sem uid/email hardcoded, sem allowlist. Multi-usuário é estrutural.
- Datas 100% locais (`new Date()` + `setHours`, zero `toISOString`) — correto pra app de "dia do usuário",
  funciona em qualquer fuso.
- **O timer já é ancorado no relógio**: `updateTimerDisplay()` deriva o restante de `block.endTime` menos
  agora. NÃO é contador em memória. Modelar `startedAt`/`endsAt` como um refactor seria brigar com o
  desenho — o bloco *é* um intervalo do dia. Falta só persistir "tem sessão rodando" pra sobreviver a
  reload, e isso é feature, não refatoração.
- Apagar conta já existe.

## Portas de mão única (fazer certo cedo — todas baratas)

1. `firestore.rules` — sem regras no repo, e com outra pessoa usando, regra aberta = todo mundo lê/escreve
   o doc de qualquer um.
2. Ambiente dev separado de prod — hoje há um único projeto Firebase e o config está chumbado no HTML.
3. Backup/export dos dados antes de qualquer mudança de schema.
4. Formato dos dados: `schemaVersion` + função de migração desde a primeira etapa.

## Portas de mão dupla (pode ficar barato sem culpa)

Camada `application`, número de repositories, granularidade dos componentes React, Playwright completo,
PWA/offline, `blockId` estável. Tudo adicionável depois **sem jogar nada fora**, desde que o domínio
esteja puro e testado.

Caso limítrofe: i18n. São ~154 textos no markup + ~121 atribuições dinâmicas. Não fazer i18n agora, mas
na migração de UI já escrever textos vindo de `strings.ts` — custo ~zero na hora, evita o retrofit inteiro.

## Fases

1. **Segurança e ambiente** — `firestore.rules`, `firebase.json`, `.firebaserc`, `.gitignore`, script de
   backup. Não precisa de Node.
2. **Base Vite + TS** — app rodando exatamente como está, deploy da Vercel intacto (`vercel.json` explícito,
   sem depender de detecção automática). Script inline sai pra `src/main.js` verbatim (JS, não TS ainda,
   pra não gerar 2900 linhas de erro de tipo). `idle/` vira `public/idle/` (paths continuam iguais).
3. **Domínio puro + Vitest** — `generateBlocks`, recorrência de eventos, XP/moedas/níveis/skills,
   `computeStats`, streak, aderência. É onde mora a maior parte do valor.
4. **Matar `index_teste.html`** — adapter de persistência (firebase | memória) escolhido por env.
5. **— ponto de decisão —** React por feature, legado deployável como rollback, textos via `strings.ts`.
6. Só se aparecer gente: smoke test Playwright, timer persistente, onboarding pra quem não é o Tomi.

Regra: branch **por fase**, merge quando a fase fecha. Fases 1–4 não mudam nada visível pro usuário.

## Riscos assumidos

- A Fase 5 não fatia bem: abas compartilham estado e CSS global. Vai ter convivência feia entre vanilla e
  React, ou um salto maior de uma vez.
- Sem E2E, a rede de segurança da migração de UI é clicar. Aceitável pra 9 fluxos, mas quero um smoke test
  mínimo **antes** da Fase 5.
- Se aparecerem usuários reais no meio, a liberdade de mexer em dados despenca. Refatorar antes de convidar.

## Bloqueio atual

**Node.js não está instalado na máquina** (nem `node`, nem `npm`, nem `firebase` CLI). Fase 1 não depende
disso; Fase 2 em diante sim.

## Pendências de decisão

- Qual foi o problema com a Vercel que obrigou a duplicar o projeto? Se o projeto lá está frágil, adicionar
  build step pode reabrir a ferida — daí `vercel.json` explícito.
- Preview deploy por branch precisa de domínio autorizado no Firebase Auth. Prático: dar um alias fixo ao
  branch (ex. `study-pets-dev.vercel.app`) e autorizar só ele. `localhost` já vem autorizado.
- **Não renomear o projeto no Vercel** (muda o domínio → quebra o login com Google até re-autorizar).

---

## Estado da migração

- **Fase 1 — feita** (commit `da6949d`, branch `refactor/fase-1-seguranca`). `firestore.rules` ainda
  **não publicado** no console do Firebase; até lá o risco segue aberto.
- **Fase 2 — feita** (commit `ebeafc1`). Script inline → `src/main.js`, `idle/` → `public/idle/`,
  Vite 8 + TypeScript 7 + Vitest 4, `vercel.json` explícito.
- **Fase 3 — feita** (branch `refactor/fase-3-dominio`). Extraídos pro domínio: tipos, helpers de
  data, config/migração, planner, eventos recorrentes, XP/moedas/níveis/skills, regras de check e
  estatísticas. `main.js` foi de 2903 pra 2529 linhas. 143 testes.
  Equivalência com o código antigo provada duas vezes: `generateBlocks` em 8064 combinações, e
  `computeStats`/`calcStreaks` em 40 cenários aleatórios (14–28 dias, com eventos, dias encerrados
  e os três formatos de check que aparecem em dados reais).
  Sobrou no `main.js` só o que é efeito: memoização, leitura de `state`, render e persistência.
- **Fase 4 — feita** (branch `refactor/fase-3-dominio`, mesmo branch da Fase 3 por continuidade).
  `src/infrastructure/` com portas (`AuthPort`, `UserRepository`) e duas implementações: Firebase
  (SDK npm 10.14.1, mesma major do CDN antigo) e memória. `VITE_PERSISTENCE=memory` liga o modo
  teste — `npm run dev:teste` — que substitui o `index_teste.html` (movido pra `legacy/`).
  `hydrateUserDoc`/`serializeState` em `src/domain/persistence.ts` são a migração explícita, com
  `schemaVersion: 1` gravado a partir de agora. 170 testes.
  **Bug de compatibilidade corrigido de propósito** (única mudança de comportamento da migração):
  o `loadData` original espalhava `DEFAULT_CFG` antes de migrar, então um doc antigo sem
  `studyWindows` perdia o `start`/`end` real pra janela padrão 09–18. Agora migra primeiro.
  Bundle: 63 KB → 373 KB (114 KB gzip) porque o SDK do Firebase vem empacotado em vez do CDN.
  Verificado no browser nos dois modos: Firebase (landing, zero requisições ao gstatic) e memória
  (onboarding → plano → check com XP pendente → Análise → Perfil → loja, sem erro de console).
- **Smoke test — feito** (`e2e/smoke.spec.ts`, `npm run test:e2e`). Os dez fluxos do brief original,
  cada um numa aba nova do modo teste com o relógio fixo via `page.clock.setFixedTime` (o plano e o
  timer dependem de "agora"): abrir, entrar/sair, configurar rotina, iniciar pomodoro em modo foco,
  concluir bloco, encerrar dia + progresso, comprar e equipar pet, criar evento, reload preservando.
  Cada teste também falha em qualquer erro de console ou exceção da página. Pra isso o repositório
  em memória passou a guardar o doc no `sessionStorage` da aba (reload preserva, aba nova zera).
  Achados de passagem: `/favicon.ico` dava 404 em toda carga (ícone vazio `data:,` até existir um de
  verdade); sprites de pet inexistentes caem no emoji por design e são ignorados na vigilância.
  **Lição cara**: toda a flakiness inicial ("Target page, context or browser has been
  closed", aleatório, sem crash no Event Log) eram o **Cold Turkey Blocker** matando o Chrome/Edge do
  sistema lançado pelo Playwright — e fechando as abas reais do Tomi junto. Browser padrão agora é o
  Chromium do próprio Playwright em headless (`headless_shell.exe`, que o Cold Turkey não reconhece);
  `PW_CHANNEL` só como override. Com isso: 27/27 em três rodadas seguidas, sem repetição.
- **Fase 5 (React) — em curso.** Estratégia: **ilhas**. Cada pedaço migrado monta num host fixo do
  `index.html` (`flushSync`, antes de o legado carregar) e mantém os mesmos ids/classes; o legado
  continua dono do resto. Ponte: `src/store/store.ts` — o mesmo objeto `state` que o legado muta,
  `notify()` nos pontos onde ele já re-renderizava (`renderAll`, `scheduleSave`, callback de auth),
  `useAppState` no React, `derived.stats` publicado pelo `renderXP` (transitório).
  - **Fatia 1 — feita**: estrutura + auth. `src/main.tsx`, `LoginScreen` (estrelas e sprite viraram
    hooks; os dois `<script>` inline sumiram), `Header` (abas, data, XP/nível, Sair), `strings.ts`,
    `application/session.ts`, CSS extraído pra `src/styles/`. `index.html`: 1553 → 774 linhas.
    Legado renomeado pra `src/legacy/app.js` (resolução do TS confundia `main.js` com `main.tsx`).
    Regressão pega pelo smoke test e corrigida: o assinante de aba aplicava `display:none` na
    `timer-bar` na carga; agora só reage a mudança, como o `switchTab` antigo. 18/18 em 2 rodadas.
  - **Fatia 2 — feita**: o Plano. `src/domain/weeks.ts` (semanas, puro, testado),
    `src/application/plan.ts` (`blocksForDay`, memoização, `computeStatsNow` memoizado por versão —
    `derived.stats` sumiu), `application/checks.ts` (`toggleBlockCheck`), `application/save.ts`
    (debounce + indicador React), `features/plan/` (PlanTab, BlockList, feedback, tick de minuto),
    `legacy/bridge.ts` (ponte tipada pro timer e modais). Legado: 2472 → 2070 linhas; `index.html`
    774 → 747. Smoke 9/9 de primeira; 198 unitários. Achado: o `periodEnd` pode sobrar uma semana
    além do fim por arredondamento — comportamento original, agora documentado no teste.
  - **Fatia 3 — feita**: Timer + modo foco + áudio. `domain/timer.ts` (restante = fim − agora,
    `canStartBlock` com motivo, som do bloco, número na sessão, próximo bloco), `infrastructure/audio`
    e `infrastructure/notifications` (portes fiéis, guardados), `application/timer.ts` (estado do timer,
    foco e volume; o único `setInterval`, só pra detectar o fim), `features/timer/` (TimerBar e
    FocusOverlay derivando o relógio a cada segundo sem `notify()`). A ponte perdeu `tryStartTimer` e
    `playSound`; `window.__legacy` sumiu. Legado 2070 → 1789; `index.html` 747 → 697. Smoke 9/9 de
    primeira; 217 unitários. Validado antes pelo Tomi: login real, doc preexistente e apagar conta.
  - **Fatia 4 — feita**: Eventos. `domain/planDelta.ts` (a frase "Plano reajustado"), `application/events.ts`
    (avulso, série, apagar só este dia/série/avulso, almoço do dia; validações com motivo),
    `features/events/` (três modais como filhos do `PlanTab`, estado local) e `shell/Modal.tsx`.
    A ponte ficou só com `openFinishDay`. Legado 1789 → 1576; `index.html` 697 → 591. Smoke 9/9 de
    primeira (o teste 9 cria evento pelo painel React); 230 unitários. Decisão mantida: validação
    ainda usa `alert()`, como o original — trocar por mensagem inline é design, não migração.
  - **Próximas fatias**, nesta ordem: Configurações (a página inteira + "Encaixar estudo" + cancelar
    sessão + apagar conta), Análise, Perfil + Pets, Onboarding + Encerrar o dia (leva `openFinishDay`
    e fecha a ponte).
  - Pendência técnica: bundle único de 509 KB (React + Firebase). Separar em chunks quando estabilizar.

## Achados que viraram pendência

- Pausa curta sobreposta ao evento seguinte quando o pomo acaba na hora exata em que ele começa.
  Bug antigo, travado por teste de caracterização. Ver `PENDENCIAS.md`.
- `monthKey` estava declarado no `main.js` e nunca era chamado. Foi pro domínio (`time.ts`), onde
  fica disponível pra quando a análise por mês precisar — mas segue sem uso.
