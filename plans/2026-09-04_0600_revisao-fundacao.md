# Revisão de fundação: merge, timer, error boundary, offline, sync, editar evento, janelas do dia, exportar, PWA

Branch: `feat/revisao-fundacao` (a partir de `origin/main` + `feat/foco-antecipado`, em 27dc2f5).
Origem: `PENDENCIAS.md` itens 1–5 e `IDEIAS.md`, seção "Revisão de 2026-09-03". Era a tarefa agendada
`study-pets-revisao-fundacao` das 06:00 de 2026-09-04 — a sessão agendada morreu com `529 Overloaded`
depois de criar o worktree, e o trabalho foi refeito na mesma tarde, item por item, um commit por item
(mais um de correção do e2e 25 e este de docs). Ninguém pra responder perguntas: cada dúvida virou uma
decisão anotada abaixo, com a alternativa e onde trocar.

## O que foi feito (na ordem dos commits)

1. **Save substitui o doc inteiro** — `setDoc(ref, doc)` sem `merge` em `infrastructure/firebase/userRepository.ts`;
   o repo em memória (`infrastructure/memory/userRepository.ts`) também substitui em vez de mesclar; comentário
   da porta em `ports.ts` corrigido. Teste de contrato em `tests/memory-infra.test.ts` (check desmarcado não
   volta; campo legado some). **Checks fantasmas que já existam no doc do Tomi não são limpos** — são
   indistinguíveis de checks reais; se quiser conferir, "Baixar meus dados" (item 8) mostra o doc.
2. **Error boundary** — `src/app/ErrorBoundary.tsx` envolvendo `<App/>` em `main.tsx`: "Algo quebrou" +
   `error.message` num `<pre>` + "Recarregar"; `console.error` do erro e do `componentStack`. Textos em
   `strings.errorBoundary`, CSS `.error-screen`. Sem teste automatizado (erro de render não dá pra provocar
   sem DOM nem pelo e2e sem um gatilho artificial); validado por leitura.
3. **Timer se acerta ao voltar + Wake Lock** — `reconcileTimer(now)` em `application/timer.ts` (o mesmo
   caminho de fim do intervalo, em loop: se mais de um bloco passou, resolve um por vez);
   `infrastructure/visibility.ts` (`onVisible`: `visibilitychange` + `pageshow`), registrado uma vez por
   `watchVisibility()` no `startSession`; `infrastructure/wakeLock.ts` (pede `screen` enquanto o foco está
   aberto, solta ao sair/parar/terminar, re-pede ao voltar pra visível). Testes em
   `tests/application-timer.test.ts` (reconcile com dois blocos passados; wake lock só com o foco aberto).
4. **Cache offline do Firestore** — `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager:
   persistentMultipleTabManager() }) })`. Só Firebase real; validado por `npm run build` + raciocínio.
5. **Sync entre dispositivos** — porta `UserRepository.subscribe` (`onSnapshot`, ignorando
   `hasPendingWrites`; no-op em memória); `save.ts` grava `meta: { writer: CLIENT_ID, writtenAt }` e expõe
   `hasPendingSave()`; `application/sync.ts` com `applyRemoteDoc` (descarta eco, mesma emissão, onboarding
   aberto, save pendente; senão reidrata, refaz semanas, XP dos pets, toast "Atualizado de outro
   dispositivo"), `subscribeRemote`/`unsubscribeRemote` chamados em `session.ts` e `account.ts`.
   `domain/persistence.ts`: `UserDoc.meta`, `readDocMeta`. Testes: `tests/application-sync.test.ts`,
   `tests/persistence.test.ts`, `tests/memory-infra.test.ts`.
6. **Editar evento** — `updateEvent`/`updateSeries`/`findEventEditTarget` em `application/events.ts`;
   `EventPanel` em modo edição (`edit` prop; título "✏️ Editar evento", botão `#ev-save` "Salvar"; série mostra
   os dias/frequência/até e a nota de que vale pra série inteira; avulso não vira série ao editar);
   `EventDeleteModal` ganhou `#event-edit-btn`. Testes em `tests/application-events.test.ts`; e2e **24**.
7. **Janelas só de um dia, "Começar agora" e "Dia livre"** — `windowOverrides: { [dia]: { studyWindows } }`
   no doc (`[]` = dia livre); `domain/dayWindows.ts` (`configForDay`, `validateDayWindows`,
   `startNowWindows`, `isDayOff`); `application/dayWindows.ts` (`setDayWindows`, `startNow`, `setDayOff`,
   `clearDayWindows`, `canEditDayWindows`); `blocksForDay` usa a config do dia; `allDays()` deixa o dia livre
   de fora (neutro na sequência, na meta, no planejado — igual ao fim de semana pausado); `goalWeek`/`heatmap`
   recebem `dayOff` (dot `off`, célula `day-off`); "Prolongar" estica o override quando há um;
   "Encaixar estudo" simula com as janelas do dia visível; **`applyPendingPetXP` passou a usar
   `blocksForDay`** (antes gerava com a config crua, sem almoço editado — com janelas do dia, um check num
   horário que só existe naquele dia não bateria com nada). UI: botão `#day-windows-btn` na barra do dia
   ("🕘 Janelas do dia" / "🕘 Janelas · editado"), modal `#day-windows-panel`
   (`features/plan/DayWindowsPanel.tsx`) com o `StudyWindowsEditor`, `#day-windows-start-now` (só hoje),
   `#day-windows-off` → `#day-windows-off-confirm`, `#day-windows-restore`, `#day-windows-save`.
   Testes: `tests/dayWindows.test.ts`, `tests/application-dayWindows.test.ts`, mais `persistence`,
   `analytics`, `application-settings`; e2e **25**.
8. **Baixar meus dados** — `infrastructure/download.ts` (Blob + `<a download>`), `application/export.ts`
   (`buildExport` = `serializeState` + `exportedAt`, sem uid/e-mail/meta; nome `study-pets-AAAA-MM-DD.json`),
   card "Meus dados" em Configurações → Geral (`#export-data-btn`). Testes em
   `tests/application-export.test.ts`; e2e **26** (`page.waitForEvent('download')`).
9. **PWA** — `scripts/app-icon.mjs` gera `public/icons/{icon-192,icon-512,icon-512-maskable,apple-touch-icon}.png`
   do personagem (Chromium headless do Playwright, canvas sem suavização, fundo `--bg`, chão sutil na cor
   de destaque); `public/manifest.webmanifest` estático; `index.html` com manifest, ícone, apple-touch-icon e
   `theme-color`; **`vite-plugin-pwa` 1.3.0 entrou** (suporta Vite 8/rolldown; buildou de primeira):
   `registerType: 'autoUpdate'`, `injectRegister: 'auto'`, `manifest: false`, `devOptions.enabled: false`,
   `navigateFallback: '/index.html'`, precache de js/css/html/png/webmanifest do `dist`, sem runtime caching.
   Validado com `vite preview` + script headless: manifest 200, SW `activated` com 43 entradas no precache,
   e **reload offline abre a tela de login em ~200 ms**.

Verificação final: `npm run typecheck` limpo · `npm test` 406 verdes (348 na base + 58 novos) ·
`PW_PORT=5178 CI=1 npx playwright test` 22 verdes (19 da base + 24, 25, 26) · `npm run build` ok.

## Decisões tomadas em dúvida (e onde trocar)

- **Numeração do e2e começa em 24.** As branches paralelas `feat/login-email` (21–23) e `feat/tutorial` (21)
  já usaram 21; começar em 24 evita três testes "21" depois do merge. Se preferir renumerar tudo, é só o
  título dos testes.
- **Carimbo `meta.writtenAt` só reconhece a MESMA emissão** (igualdade), nunca ordena entre dispositivos —
  relógio de celular e notebook divergem, e "ignorar o mais antigo" descartaria escritas legítimas. Doc
  sem carimbo (anterior a esta versão) é comparado pelo conteúdo. Trocar: `isSameAsLast` em
  `application/sync.ts`.
- **Sync v1: com save local pendente, o local vence** e o remoto que chegou nessa janela de ~1 s é perdido
  (o doc inteiro sobrescreve em seguida). Documentado no topo de `sync.ts`. Se doer, o caminho é escrita
  granular por campo — não é uma constante.
- **`reconcileTimer` usa o `now` da volta** pra marcar os blocos que passaram, não o fim de cada bloco.
  O check registra o pet equipado e a skill elegível "agora"; pra blocos que acabaram há 20 min isso
  só muda o bônus de skill por horário (noturno etc.), caso raro. Trocar: passar `todayAt(block.endTime)`
  em vez de `now` no loop de `reconcileTimer`.
- **Janelas do dia: dia passado é read-only** (`'past'`), não só o encerrado — mexer nas janelas de ontem
  só mudaria estatística. Futuro pode. Trocar: `canEditDayWindows` em `application/dayWindows.ts`.
- **Dia livre exige zero check hoje** (`'has-checks'`), como a revisão pediu — declarar depois de falhar
  seria o "streak freeze". Pra dias futuros não há check possível.
- **"Começar agora" arredonda pro próximo múltiplo de 5** (`START_NOW_STEP_MIN` em `domain/dayWindows.ts`);
  janela que acaba antes do arredondamento some; janelas já passadas ficam.
- **Sobreposição de janelas é recusada** no modal do dia (`'overlap'`), coisa que a rotina em Configurações
  não valida. Pareceu barato e evita um plano com blocos sobrepostos.
- **O botão "Janelas do dia" só aparece em dia editável** (hoje/futuro, não encerrado), na barra ao lado de
  "Agrupar" / "+ Evento"; editado fica laranja (`.add-event-btn.edited`), como o "editado" do almoço.
- **Editar evento não converte avulso ↔ série** e não edita uma ocorrência só (fora do escopo, como
  combinado). O check gravado no horário antigo fica órfão se o início mudar — igual ao apagar.
- **PWA com `manifest: false`**: o manifest é o arquivo estático em `public/`, não o gerado pelo plugin —
  uma fonte só, e `index.html` aponta pra ele. **Navegação é network-first** (workbox `navigateFallback` só
  entra quando a rede falha): deploy novo aparece no próximo reload, sem "versão velha presa".
- **Ícone: o personagem** sobre o fundo escuro, com um chão sutil na cor de destaque. Um ícone desenhado à
  mão substitui os PNGs em `public/icons/` sem mexer em mais nada.
- **`scripts/app-icon.mjs` entrou no commit do item 7** por descuido de `git add -A` (o arquivo foi
  escrito enquanto o e2e rodava). Só afeta a arqueologia do git.

## Branch alternativa

- `feat/revisao-fundacao-alt-dia-livre-quebra` (um commit em cima da principal): **dia livre quebra a
  sequência** como um dia sem estudo — ele continua no `allDays()` (planejado 0, meta não batida), e os
  dots/heatmap não o marcam como neutro. Na principal, dia livre é **neutro**, igual ao fim de semana com
  `skipWeekends`. Prós do neutro: coerente com "a vida não para por causa do Pomodoro" e com o que
  `skipWeekends` já faz; e a regra de "só sem check" fecha o abuso. Prós do quebrar: sequência vira um número
  mais "duro". Como escolher: mergear uma ou outra; a diferença é `allDays()` em `application/plan.ts` e o
  `dayOff` passado em `AnalyticsTab.tsx`.

## O que ficou de fora (e por quê)

- Inglês/i18n, push do servidor (FCM), fuso horário, editar uma ocorrência só da série, importar dados —
  fora do escopo, continuam no `IDEIAS.md`.
- Notificação pelo service worker (`registration.showNotification`) — a revisão listava como passo seguinte
  do PWA; não entrou (o `new Notification` continua). Fica como ideia.
- Teste automatizado do error boundary (ver item 2).

## O que o Tomi precisa fazer fora do código

- **Vercel builda igual**: `vite-plugin-pwa` é devDependency, `npm ci` + `npm run build` como sempre. Nada a
  configurar. O primeiro deploy registra o service worker no browser de quem abrir.
- **Se o app servir uma versão velha** depois de um deploy: um reload resolve (navegação é network-first);
  se não, DevTools → Application → Service Workers → Unregister, e Application → Storage → Clear site data.
- **Conferir o PWA no celular** depois do deploy: Chrome/Android → menu → "Instalar app" (ou "Adicionar à
  tela inicial"); iOS → Safari → Compartilhar → "Adicionar à Tela de Início". O ícone é o personagem.
- **Firestore**: nada a mudar nas regras. O cache persistente cria um IndexedDB por origem; `localhost` e
  `plano-estudos-one.vercel.app` têm caches separados.
- **Checks fantasmas antigos** (do bug do merge): se quiser caçar, "Baixar meus dados" e procurar checks
  em horários que não existem mais no plano daquele dia.

## MANUAL DE TESTE

### No modo teste (`npm run dev:teste`, http://localhost:5174; cada aba nova é conta nova)

1. **Desmarcar persiste.** Passe o onboarding. Marque o 1º e o 2º estudo, desmarque o 1º. Espere o
   "💾 Modo teste" no canto e dê F5: só o 2º continua marcado (antes, o modo memória mesclava e o teste
   nunca via o bug; agora substitui como o Firestore).
2. **Editar evento.** "+ Evento" → nome "Aula", 14:00–15:30 → Adicionar. Toque no evento → o modal tem
   "✏️ Editar" → o painel abre preenchido, sem o "Repetir" → mude pra "Consulta", fim 16:00, desligue
   "Conta como estudo" → Salvar. O bloco vira cinza (intervalo) 14:00–16:00, e há um só.
   Série: "+ Evento" → "Treino", marque "Repetir", Qua + Sex → Adicionar. Toque no Treino → Editar → o
   painel mostra os chips e a nota "Vale pra série inteira" → troque pra 07:00–08:00 → Salvar. Vá pra
   sexta: o Treino está às 07:00.
3. **Janelas do dia.** Na barra do dia, "🕘 Janelas do dia" → o modal mostra 09:00 → 18:00.
   - **Começar agora**: clique → toast "Começando às HH:MM" (próximo múltiplo de 5), o primeiro bloco
     começa aí, o botão vira "🕘 Janelas · editado" (laranja). O dia seguinte continua às 09:00.
   - **Editar à mão**: abra de novo, mude pra 14:00 → 16:00 (ou "+ Adicionar" uma segunda janela) →
     Salvar. O almoço continua aparecendo às 13:00, os estudos vão das 14:00 até 15:55.
   - **Restaurar rotina**: abra → "↺ Restaurar rotina" → volta 09:00.
   - **Dia livre**: sem nenhum check hoje, abra → "🌴 Dia livre" → confirme → "🌴 Dia livre" no plano,
     0 blocos. F5: continua. Análise → Hoje: o dot de hoje fica apagado ("dia livre"), e a meta conta "de 6".
     Marque um bloco em outro dia e tente "Dia livre" nele com um check → toast "já tem bloco marcado".
   - **Dia futuro** pode (planejar); dia passado não tem o botão; dia encerrado também não.
   - **Prolongar com override**: com "Começar agora" feito, marque um bloco, avance o relógio do sistema
     (ou use um dia com janela curta), espere o prompt "Passou do horário" → Prolongar → só as janelas de
     hoje esticam; Configurações continua 09:00–18:00.
4. **Baixar meus dados.** ⚙️ → Geral → "Meus dados" → "Baixar (JSON)". O arquivo `study-pets-AAAA-MM-DD.json`
   tem `schemaVersion`, `checks`, `pets`, `windowOverrides`, `exportedAt` — e nenhum e-mail ou uid.
5. **Timer ao voltar.** Clique no bloco do momento (abre o foco). Troque de aba do browser por alguns
   minutos, além do fim do bloco. Ao voltar: o bloco está marcado, o foco emendou no seguinte (ou fechou
   com o toast "✓ … concluído" se era o último). No celular: com o foco aberto, a tela não trava sozinha.
6. **Error boundary.** Não tem gatilho na UI. Pra ver a tela: no DevTools, Sources → adicione um
   `throw new Error('teste')` no começo de um componente (ou, mais simples, confie no teste de leitura).

### Só com Firebase real (`npm run dev`, http://localhost:5173)

1. **Merge**: marque, desmarque, F5 — o check não volta. Repita apagando o único evento de um dia e o único
   grupo de um dia.
2. **Sync**: duas janelas do browser (ou celular + notebook) na mesma conta. Marque um bloco numa: a outra
   mostra o check em ~1 s e o toast "Atualizado de outro dispositivo". A que marcou não mostra o toast (é
   eco). Com o onboarding aberto numa aba nova, a outra aba não fecha ele.
3. **Offline**: DevTools → Network → Offline → F5: os dados aparecem (cache do Firestore). Marque um bloco
   offline: "Salvando…" fica. Volte online: "Salvo ✓", e o check está no console do Firestore.
4. **PWA**: `npm run build && npx vite preview --port 5179` (ou o deploy). Abra, DevTools → Application:
   Manifest com 3 ícones, Service Workers "activated". Network → Offline → F5: a tela abre.
   No celular, instale e confira o ícone e a janela sem barra do browser.
