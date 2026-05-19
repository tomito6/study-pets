# Plano de Estudos — RPG

## Como usar este documento

Este arquivo é um **guia vivo**, não uma especificação imutável. Ele descreve a estrutura e as intenções do projeto, mas **o código é sempre a fonte da verdade**. Valores numéricos, listas e detalhes mudam — se você notar divergência entre o que está aqui e o que o código diz, confie no código e atualize este arquivo.

Quando o usuário pedir mudanças que conflitam com algo aqui, **assuma que ele está atualizando o design**, não violando uma regra. Sugira atualizar este arquivo no fim.

## Sobre o projeto

### A ideia central

Esse é um app de Pomodoro que trata estudar como uma jornada — não uma punição. Nasceu da frustração com planos rígidos: o Tomi começou com uma planilha de Excel cheia de blocos fixos, percebeu que a vida real (almoço atrasado, aula no meio da manhã, cansaço) destruía o plano todo dia, e foi construindo algo que se adapta em vez de quebrar.

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

- Frontend: HTML/CSS/JS vanilla, arquivo único (sem build/bundler)
- Backend: Firebase (Auth via Google + Firestore)
- Hosting: Vercel (deploy automático no push pra `main`)
- Repo: github.com/tomito6/plano-estudos
- URL: plano-estudos-one.vercel.app

## Arquivos

- `index.html` — versão real com Firebase (deployada no Vercel)
- `index_teste.html` — versão sem Firebase pra testar localmente, no `.gitignore`
- `idle/` — sprites do personagem principal
- `idle/pets/{nome}/` — convenção pra sprites de pets
- Sprites são frames sequenciais nomeados `0.png`, `1.png`, ...

## Workflow

1. Mudanças devem ser replicadas em `index.html` e `index_teste.html`
2. Testar abrindo `index_teste.html` no browser
3. Commit + push → Vercel atualiza sozinho

## Princípios arquiteturais

Mais importantes que valores concretos. Estes você protege ao mexer no código:

- **Estado centralizado**: tudo em um único objeto `state`. Não criar globais soltas.
- **Checks por horário, não por índice**: a chave dos checks é o `time` do bloco (`"09:00"`). Isso evita corrupção quando a config muda. Valor é `{ pet: petId | null, bonus: number }` — `pet` = equipado no momento do check; `bonus` = multiplicador aditivo de XP (0 ou 0.05) decidido na hora pelas skills ativas. Retrocompat: `true` antigo é tratado como `{ pet: null, bonus: 0 }` por `checkPet()` / `xpFromCheck()`.
- **Memoization em `generateBlocks`**: a função tem cache. Sempre que alterar config ou eventos, chamar `clearBlockCache()`.
- **Stats em uma passada**: `computeStats()` calcula tudo de uma vez iterando os dias uma única vez. Não criar funções separadas que reiteram.
- **Datas dinâmicas**: sem dates hardcoded. As semanas são construídas a partir da semana atual.
- **Último bloco do dia é sempre estudo** (nunca termina em pausa).
- **Tratamento de erro do Firebase**: load/save dentro de try/catch.

## Estrutura do JS

O `<script>` segue seções comentadas com cabeçalhos. Manter essa ordem evita Temporal Dead Zone:

```
FIREBASE / TEST MODE
CONSTANTS (DEFAULT_CFG, LEVELS, PETS, DAYS, ...)
STATE
DATE/TIME HELPERS
WEEKS
BLOCK GENERATOR (com memoization)
CHECKS HELPERS
STATS
LEVEL HELPERS
FIREBASE LOAD/SAVE
AUTH
TOAST
AUDIO
TIMER
SETTINGS / ONBOARDING / EVENT / LUNCH PANELS
TAB SWITCHING
CHARACTER ANIMATION
RENDERING
ANALYTICS RENDER
PROFILE RENDER + PETS
INIT (no final)
```

⚠️ **Cuidado com TDZ**: `let timerBlock = null` no meio do script não pode ser acessado por código que roda antes da declaração. `initApp()` precisa rodar no fim ou via callback assíncrono.

## Conceitos do app

- **Sessões**: pomodoros separados por pausa longa, evento ou almoço viram "sessões" coloridas (classes `.s0` a `.s5`).
- **Bloco atual**: o que está acontecendo no horário real ganha destaque visual.
- **Gap antes de eventos/almoço**: se sobrar tempo menor que um pomodoro, preenche inteligentemente (mini-estudo ou estica o último).
- **Datas**: WEEKS construído dinamicamente. Sem `periodEnd` (modo "sempre"): até 31 de dezembro do ano atual (mínimo de hoje+8 semanas, pra cobrir virada de ano); expande pra frente se houver dados futuros. Com `periodEnd` definido: cobre **exatamente** o intervalo escolhido — limite real, sem expansão pra frente (dados fora do período ficam guardados no Firestore mas não aparecem na UI; reabrir o período os traz de volta). Em ambos os casos, expansão pra trás se houver dados antigos.
- **Onboarding**: na primeira vez que um usuário loga (Firestore doc não existe), abre modal perguntando período de uso + se pula fins de semana. Usuários existentes não veem (defaults preservam comportamento anterior). Config é editável depois em Configurações. "Usar sempre" preserva `periodStart` (= hoje) como marco inicial; só `periodEnd` fica null.
- **Settings em 2 abas**: "Rotina" (horários, almoço, pomodoro, pausa longa — coisas do ritmo do dia, com preview) e "Geral" (período de uso, pular fins de semana, mínimo diário de estudo). Abre sempre em "Rotina". O id interno da aba continua `day` por compatibilidade.
- **`periodStart` é fixo por sessão**: na aba Geral, o input "Início" fica `disabled`. Só `periodEnd` e `skipWeekends` são editáveis. `resetSettings` e `clearPeriod` preservam o `periodStart`. Pra mudar o início, o usuário precisa **cancelar a sessão**.
- **Cancelar sessão**: botão "Zona de perigo" na aba Geral. Modal de confirmação lista o que vai apagar. Ao confirmar: zera `checks`, `events`, `lunchOverrides`, `pets`, `coinsSpent`, e reseta `config` pro `DEFAULT_CFG`. Em seguida abre o onboarding (equivalente a uma conta nova). É a única forma de redefinir o `periodStart`.
- **Dia vazio**: se `blocksForDay()` retorna `[]` (fim de semana com `skipWeekends`), `renderBlocks` mostra "🌴 Dia livre".
- **Dia futuro**: navegar pra qualquer dia > hoje mostra blocos esmaecidos (`.block-row.day-future`, opacity .45) e clicar dispara toast "Ainda não chegou 🔮" — não inicia timer nem marca check. Helper `isFutureDay(dateKey)`. `toggleCheck` também blinda como fallback. Espelha o padrão `.day-closed`/`isDayClosed` que já existia pra dias encerrados.
- **Modo foco**: ao clicar num bloco de estudo ou pausa **do momento** (passou validação de `tryStartTimer`), abre overlay tela-cheia `#focus-overlay` por cima da UI: chip "Sessão N · Bloco M", nome do bloco limpo, timer circular SVG que drena (`stroke-dashoffset`), "+X XP · +Y 🪙 ao concluir", e card "Em seguida" com o próximo bloco do dia (ou "Fim do dia 🌙"). Anel verde pra estudo, azul pra pausa. Sem controles centrais (sem pausar nem skip — decisão consciente). Botão "← Sair do foco" no topo só fecha o overlay e mantém o timer rodando — pra cancelar mesmo, a `timer-bar` no topo da UI normal tem o "✕ Parar". O `onTimerEnd`/`stopTimer` fecham o foco automaticamente. `updateFocusTimer()` é chamada dentro de `updateTimerDisplay()` a cada segundo. Espaço `.focus-scene-stage` está reservado pra cena ambiente (personagem + pet), por enquanto vazio.

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

**Importante**: `dayStudyMins` (campo antigo) **continua existindo intocado**, ainda calcula com `cfg.pomo` fixo e ainda alimenta streak + bônus de moedas. Os campos novos usam **duração real** (`endTime-time`) pra mini-estudos contarem certo. Não mudar `dayStudyMins` foi decisão consciente: economia e streak não devem ser afetadas por refator de UI. Helpers novos: `monthKey(d)`, `currentWeekDayKeys()`, `aggregateMins(doneObj, plannedObj, keys)`.

## Sistema de gamificação

Valores e thresholds estão definidos no código (`LEVELS`, `calcXP`, etc.). Aqui só o conceito:

- **XP**: ganho por bloco concluído, mais por estudos que por pausas. Valor depende da duração.
- **Níveis**: lista ordenada definida em `LEVELS` com thresholds e nomes.
- **Moedas**: duas fontes. (a) Por bloco de estudo concluído: `coinsForStudyBlock(pomo)` — proporcional ao tempo com multiplicador crescente (×1 até 30min, ×1.5 até 60, ×2 até 90, ×2.5 até 120, ×3 acima). (b) Bônus diário por faixa de streak: `DAILY_BONUS_TIERS` (5/8/12/18/25 moedas nos marcos 1/3/7/14/30 dias). O bônus só conta no dia se total de estudo concluído ≥ `config.dailyStudyMin`. Saldo = total − `coinsSpent`.
- **Streak**: dia entra no streak só se `dayStudyMins ≥ config.dailyStudyMin` (padrão 60min, editável em Configurações → Geral). Pausas sozinhas não contam. Mudar o mínimo recalcula retroativamente.
- **Sons**: Web Audio API (sem arquivos externos), diferentes por tipo.
- **Notificações**: Web Notifications API quando timer acaba.

## Sistema de pets

Adicionar um pet novo:

1. Colocar sprites em `idle/pets/{id}/` (`0.png` a `{frames-1}.png`)
2. Adicionar entrada em `PETS`:

```js
const PETS = {
  cat: { id, name, emoji, price, frames, sprite: i => `idle/pets/cat/${i}.png` },
  // novo pet aqui — mesmo shape
};
```

Campos: `id` (key), `name` (label em pt-BR), `emoji` (fallback visual quando sprite não carrega), `price` (moedas), `frames` (quantos frames de animação), `sprite(i)` (path do frame `i`).

`renderShop()` monta o card; se a imagem do sprite falhar (pasta não existe ainda), o emoji entra no lugar — então dá pra cadastrar pets sem sprites e adicionar os arquivos depois sem mexer no código.

A **loja de pets** vive num modal próprio (`#pets-shop-panel`), aberto pelo botão "🛒 Loja de pets" no perfil. Grid de 2 colunas, card vertical (imagem/emoji + nome + preço + botão). `renderShop()` é chamado em `openPetsShop()` e após cada compra/equip — não no `renderProfile()`. A função interna `buildPetCard(pet, { showPrice })` é compartilhada com a aba "Meus pets" (ver abaixo).

**Estrutura da área de pets no perfil** (abaixo dos stats 4-col):

1. **Card "Pet ativo"** (`.active-pet-card`, id `#active-pet-card`): destaque do pet equipado no momento. Sprite pequeno (54×54) + tag "Pet ativo" + nome + badge `Lv. N` + barra de XP + texto `X / Y XP · faltam Z pro Lv. N+1`. Quando não tem pet equipado, esconde e mostra `#no-active-pet` ("Nenhum pet equipado. Adote um na loja e equipe em 🐾 Meus pets."). Populado por `renderActivePetCard()` chamado dentro de `renderProfile()` (que já roda em equip/compra). Cálculo de XP usa `getPetXP`, `getPetLevel` (já existentes) + thresholds do `LEVELS`.

2. **Botão "🐾 Meus pets"** (`.shop-open-btn` com `onclick=openMyPets()`): abre o modal `#my-pets-panel` com a grade completa de todos os pets adquiridos. Mostra contador `X/N ✨` no canto direito (`#my-pets-count`). Modal lista todos via `renderOwnedPets()` populando `#my-pets-grid`, inclusive o ativo (com badge "✓ Equipada"). Equipar/desequipar de dentro do modal é grátis e instantâneo.

3. **Botão "🛒 Loja de pets"**: igual antes — abre modal de compra.

**Subtitle do hero do perfil** (`#char-title-sub`): mostra **só o nível do usuário** (ex: "Dedicado"). Info do pet vive no card dedicado abaixo — sem redundância.

Removido: grade inline `#my-pets-grid-profile` e header "Meus pets" inline. O id `my-pets-count` foi reaproveitado pro contador no botão.

**Pet ganha XP (com fechamento de dia)**: quando o usuário marca um bloco, `toggleCheck` salva o pet equipado **no momento do check** em `state.checks[date][time] = { pet: petId | null }`. XP não é creditado na hora — fica "pendente". `applyPendingPetXP()` processa dias **anteriores a hoje** entre `state.pets.xpProcessedUntil + 1` e ontem: pra cada estudo done, credita `b.xp` no pet salvo naquele check. Roda em `initApp()` e `renderProfile()` (cobre o caso do app ficar aberto atravessando a meia-noite). Idempotente — não credita 2x. Na primeira execução pós-mudança (`xpProcessedUntil == null`), zera `state.pets.xp` e marca `yesterday` como processado (sem aplicar retroativamente). Level usa as mesmas thresholds do usuário (`LEVELS` + `getLevelIdx`). Pausa não conta (só estudo). Pet null no momento do check = ninguém ganha XP.

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

**Economia real** (não é mais decisão futura): ao adotar um pet, abre modal de confirmação `#pet-buy-confirm` ("Adotar X por 🪙 Y?"). Ao confirmar: `state.pets.owned.push(...)`, `state.pets.active = id`, **`state.coinsSpent += pet.price`**. Saldo exibido em `#char-coins` = `getCoinBalance() = stats.coins - coinsSpent` (nunca negativo). Se saldo < preço, botão "Adotar" ganha classe `.shop-btn.locked` (opacity .5, cursor:not-allowed) e clicar dispara toast "Moedas insuficientes" — não abre o modal. **Equipar/desequipar é grátis** e instantâneo (sem confirmação, sem custo). Cancelar sessão zera `coinsSpent` junto com o resto.

## Sistema de skills

Skills opcionais por pet — ficam visíveis e ativáveis dentro do modal "Meus pets" (no card do pet correspondente). Cada pet pode ter um array `skills: [{ id, name, desc }]` no `PETS`. Quem tem hoje: **Coruja** (`owl`) → `noturno` (+5% XP em estudos a partir das 18h) e `voo` (placeholder, sem efeito).

**Escolha exclusiva por pet**: `state.skills.owl` guarda **só uma** skill ativa por vez (`'noturno' | 'voo' | null`). Clicar na skill ativa desliga (vira null); clicar em outra troca. `state.skills.activatedAt` (ms) marca o timestamp da última troca — usado pra prevenir exploit.

**Anti-exploit ("equipar no final")**: o bônus de XP é decidido **no momento do check** (não retroativamente), e a skill precisa estar ativa **desde antes do bloco começar**. `noturnoBonusEligible(b, dateKey)` valida: bloco de estudo + coruja equipada + skill `noturno` ativa + hora >= 18 + `dateKey === hoje` + `activatedAt <= blockStartMs`. Se elegível, `toggleCheck` salva `bonus: 0.05` dentro do check: `state.checks[date][time] = { pet, bonus }`. Sem bonus, salva `bonus: 0`. Bônus salvo é permanente — desligar a skill depois não revoga.

**XP efetivo**: `xpFromCheck(b, check)` retorna `Math.round(b.xp * (1 + (check.bonus || 0)))`. Usado em `computeStats` (todos os pontos onde XP é agregado: `totalXP`, `weekXP`, `todayXP`, `dayXP`), em `applyPendingPetXP` (XP creditado pro pet também respeita bônus), e no `spawnFloatGain` no momento do check (mostra o número final, não o base).

**UI**: dentro do card do pet no modal `#my-pets-panel`, abaixo do botão Equipar, aparece a seção "Skills" com toggles estilo switch. Estado visual: `.pet-skill-row.active` = borda verde + nome em accent + switch `.ps-toggle.on` (knob deslocado). Toggle é `<button>` (acessível por teclado). Cancelar sessão zera `state.skills`.

**Pra adicionar nova skill**: (1) adicionar entrada no array `skills` do pet em PETS, (2) se for skill de XP, adicionar entrada em `xxxBonusEligible(b, dateKey)` análoga a `noturnoBonusEligible` e expandir o cálculo de `bonus` em `toggleCheck`. O resto da pipeline (`xpFromCheck`, render no card, save/load) já cobre genericamente.

## Schema do Firestore

```
users/{uid} {
  checks,        // { "YYYY-MM-DD": { "HH:MM": { pet: petId|null, bonus: number } } }   bonus = multiplicador aditivo de XP salvo no check (0 ou 0.05 hoje)
  events, lunchOverrides,
  closedDays: { "YYYY-MM-DD": true, ... },   // dias encerrados manualmente via botão "Encerrar o dia"
  pets: {
    owned: [petId, ...],
    active: petId | null,
    xp: { petId: number, ... },           // XP acumulado por pet (creditado quando o dia em que o check foi feito fecha)
    xpProcessedUntil: "YYYY-MM-DD" | null  // último dia já processado por applyPendingPetXP (null = ainda não inicializado)
  },
  skills: {
    owl: 'noturno' | 'voo' | null,         // skill ativa pra coruja (exclusivo — só uma por pet)
    activatedAt: number                    // ms da última troca, usado pra validar elegibilidade do bônus no check
  },
  coinsSpent,
  config: {
    start, lunch, lunchDur, end, pomo, shortBreak, longBreak, hasLunch,
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
- **Modais**: todos centralizados na tela (classe `.panel-overlay.center`). Não usar sheet de baixo pra cima.

## Direções futuras

- Mais pets (estrutura pronta)
- Chatbot pra otimizar configuração (precisa avaliar custo de API)
- Sync mais responsivo entre dispositivos

## Decisões adiadas conscientemente

- Não separar em múltiplos arquivos (reavaliar quando passar de ~3000 linhas)
- Não migrar Firestore pra subcollection (reavaliar quando salvar virar lento)

## Sempre

- Atualizar este arquivo quando uma decisão de design mudar
- Testar em `index_teste.html` antes de commitar
- Quando notar algo aqui que não bate com o código, perguntar ao usuário antes de "corrigir" — pode ser que o design tenha evoluído de propósito
