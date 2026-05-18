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
- **Checks por horário, não por índice**: a chave dos checks é o `time` do bloco (`"09:00"`). Isso evita corrupção quando a config muda.
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
- **Datas**: WEEKS construído dinamicamente. Sem `periodEnd`: até 31 de dezembro do ano atual (mínimo de hoje+8 semanas, pra cobrir virada de ano). Com `periodEnd` definido: cobre exatamente o intervalo escolhido. Em todos os casos, `buildWeeks` expande pra trás E pra frente se houver checks/events/lunchOverrides fora do range — garante que **progresso nunca some** da UI mesmo se o usuário encolher o período.
- **Onboarding**: na primeira vez que um usuário loga (Firestore doc não existe), abre modal perguntando período de uso + se pula fins de semana. Usuários existentes não veem (defaults preservam comportamento anterior). Config é editável depois em Configurações. "Usar sempre" preserva `periodStart` (= hoje) como marco inicial; só `periodEnd` fica null.
- **Settings em 2 abas**: "Dia a dia" (horários, almoço, pomodoro, pausa longa — coisas do ritmo do dia, com preview) e "Geral" (período de uso + pular fins de semana — afeta o range de XP). Abre sempre em "Dia a dia".
- **`periodStart` é fixo por sessão**: na aba Geral, o input "Início" fica `disabled`. Só `periodEnd` e `skipWeekends` são editáveis. `resetSettings` e `clearPeriod` preservam o `periodStart`. Pra mudar o início, o usuário precisa **cancelar a sessão**.
- **Cancelar sessão**: botão "Zona de perigo" na aba Geral. Modal de confirmação lista o que vai apagar. Ao confirmar: zera `checks`, `events`, `lunchOverrides`, `pets`, `coinsSpent`, e reseta `config` pro `DEFAULT_CFG`. Em seguida abre o onboarding (equivalente a uma conta nova). É a única forma de redefinir o `periodStart`.
- **Dia vazio**: se `blocksForDay()` retorna `[]` (fim de semana com `skipWeekends`), `renderBlocks` mostra "🌴 Dia livre".

## Sistema de gamificação

Valores e thresholds estão definidos no código (`LEVELS`, `calcXP`, etc.). Aqui só o conceito:

- **XP**: ganho por bloco concluído, mais por estudos que por pausas. Valor depende da duração.
- **Níveis**: lista ordenada definida em `LEVELS` com thresholds e nomes.
- **Moedas**: ganhas em blocos de estudo. Saldo = ganhas − `coinsSpent`.
- **Sons**: Web Audio API (sem arquivos externos), diferentes por tipo.
- **Notificações**: Web Notifications API quando timer acaba.

## Sistema de pets

Adicionar um pet novo:

1. Colocar sprites em `idle/pets/{id}/`
2. Adicionar entrada em `PETS`:

```js
const PETS = {
  cat: { id, name, emoji, price, sprite, frames, description },
  // novo pet aqui
};
```

`renderPets()` cuida do resto: animação idle, loja, compra, "Meus Pets".

## Schema do Firestore

```
users/{uid} {
  checks, events, lunchOverrides,
  pets, coinsSpent,
  config: {
    start, lunch, lunchDur, end, pomo, shortBreak, longBreak, hasLunch,
    periodStart,   // "YYYY-MM-DD" | null (null = "sempre", sem fim)
    periodEnd,     // "YYYY-MM-DD" | null
    skipWeekends   // boolean (true = sáb/dom sem blocos nem stats)
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
- Cosméticos pro personagem
- Chatbot pra otimizar configuração (precisa avaliar custo de API)
- Sync mais responsivo entre dispositivos

## Decisões adiadas conscientemente

- Não separar em múltiplos arquivos (reavaliar quando passar de ~3000 linhas)
- Não migrar Firestore pra subcollection (reavaliar quando salvar virar lento)

## Sempre

- Atualizar este arquivo quando uma decisão de design mudar
- Testar em `index_teste.html` antes de commitar
- Quando notar algo aqui que não bate com o código, perguntar ao usuário antes de "corrigir" — pode ser que o design tenha evoluído de propósito
