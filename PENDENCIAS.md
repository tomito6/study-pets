# Pendências

Lista de coisas pra fazer no app. Diferente do `IDEIAS.md` (rabiscos exploratórios), aqui são tarefas concretas com escopo definido — quando o Tomi disser "faça as pendências", o Claude pega esse arquivo, executa item por item, e remove o que ficou pronto.

**Importante (do Tomi):** qualquer item aqui pode estar incompleto, ambíguo ou ter detalhes não capturados. Quando bater dúvida genuína — decisão visual, escopo, tom — **pergunte antes de executar**. Não invente. Mas também não pergunte o óbvio: se a tarefa tá clara, executa direto.

---

> **Varredura de 2026-09-14** (branch `chore/pendencias-2026-09-14`, madrugada): fecharam nove itens —
> a recusa de evento virou toast, o logout deixou de ser o desbloqueio de dois cliques, a notificação do
> fim do bloco passou a existir no celular, as abas dos dias dizem qual é hoje (e oferecem a volta), o
> ritmo do pomodoro ganhou porta, o escuro virou o **Loft noturno**, o chão do hero encolheu, a frase do
> quarto coube numa linha, e o nome das abas ficou decidido — nove itens em oito commits (a frase do
> quarto e as abas dos dias vieram juntas), mais um commit com os buracos que a revisão da própria leva
> achou. Todos com teste, menos a troca da frase, que é uma string. O que sobra
> abaixo é o que **depende de você**: uma pergunta de escopo e as perguntas que os dois plans grandes
> deixaram em aberto. A **Semana no celular** saiu da lista em 2026-09-14: você escolheu a direção C
> dos cinco esboços (cartões que deslizam) e ela está implementada — ver "A Semana no celular" no CLAUDE.md.
> E, vindo do `main` na mesma manhã, o **tutorial das Configurações** com a corrida de setup (ver "O tutorial
> das Configurações" no CLAUDE.md) — a outra metade barata do item do ritmo.

## 1. Janelas do dia: o ritmo por dia

O que sobrou do pedido de 2026-09-07, depois que a **porta** pro ritmo entrou (2026-09-14 — o modal
"🕘 Janelas do dia" mostra o ritmo em vigor em `#day-windows-rhythm`, e o "Mudar →" leva até
Configurações → Estrutura do dia, já rolado e com a seção acesa; o tutorial das Configurações explica a
seção). A porta resolveu o "ninguém acha"; ela **não** responde as duas perguntas originais:

(a) O pedido era **tirar** "▶ Começar agora" e "↺ Restaurar rotina" do modal. **O "Começar agora" saiu
em 2026-09-14** (botão, caso de uso, função do domínio e testes — o Tomi pediu pela terceira vez). Sobra o
Restaurar: tirando ele, como um dia editado volta pra rotina? Hoje ele é o único caminho — e é também como
se desfaz um "Dia livre". Na mesma noite o bloco do ritmo no modal ganhou o título "Ritmo do pomodoro" e os
três números em tiles (estava "lowkey demais").

(b) Se o ritmo passar a ser **editável ali dentro**, ele muda a config global (e aí a "porta" bastava) ou
o override daquele dia passa a carregar ritmo próprio? A segunda é a que o IDEIAS chama de interessante
(ritmo por janela, ou até por grupo) e é a cara: `windowOverrides` ganha campo, `configForDay` ganha
ritmo, e **o gerador passa a produzir planos diferentes pro mesmo dia conforme o override** — com a regra
"mexer no gerador reescreve o passado" valendo por inteiro.

## 2. Miúdos de conta, se um dia houver outro usuário

**Adiado com gatilho** (2026-09-14): reabrir quando existir a **segunda conta por senha**. Hoje a única
conta entra pelo Google (`provider: 'google'`), e conta Google já nasce com `emailVerified: true` — o
lembrete de e-mail não verificado nunca apareceria, e o `linkWithCredential` só tem função quando alguém
tenta criar senha num e-mail que já entrou pelo Google. Custo medido: lembrete ~110 min, link ~210 min.

As duas armadilhas que o item não registrava, e que é pra isso que ele continua aqui:

- **`User.emailVerified` é cacheado.** Quem clica no link do e-mail e volta continua com `false` até um
  `user.reload()`, e o `onAuthStateChanged` não dispara nisso. Sem um `refreshUser()` na porta, chamado
  pelo `onVisible` que já existe, o banner **mente pra quem acabou de obedecer** — exatamente a cobrança
  errada que o CLAUDE.md proíbe.
- **`AuthUser.provider` é singular** e vem de `providerData[0]`. Uma conta vinculada tem os dois, e a
  ordem do array passaria a decidir se apagar a conta reautentica por popup ou por senha, e se o campo de
  senha é exigido. O link não é uma chamada de API: é trocar `provider` por `providers[]` e acertar esses
  dois pontos. E nada de `fetchSignInMethodsForEmail` pra "descobrir o provedor" — é o oráculo de
  enumeração clássico, e o Firebase já o devolve vazio.

## 3. Modo ao vivo: as três perguntas que sobraram

O modo está **pronto** (2026-09-13, em seis etapas: `StudyWindow.live`, `dayModes`, os chips no modal do
dia, o cartão `#live-start`, o "■ Parar por aqui" com XP proporcional, o padrão global com `since` e o
tour próprio). Ver "Modo ao vivo" no CLAUDE.md e `plans/2026-09-12_1830_modo-tracker.md`.

O que ficou são três perguntas que **mudam o app inteiro**, não só o modo — por isso não foram tomadas
sozinhas. O custo de cada uma está medido no plan:

1. **O drop-off da Análise** é por *ciclo*; num dia ao vivo o ciclo é a corrida inteira. Passa a ser por
   *dias*, pra todo mundo?
2. **O bloco em andamento deixa de aceitar check manual?** Num dia ao vivo o app marca sozinho ao fim de
   cada pomodoro, e marcar à mão o bloco que está correndo é a única forma de discordar dele.
3. **Os recordes passam a ser por minuto** (e não por bloco)? Num dia ao vivo os blocos têm o tamanho que
   a vida deu, e "melhor dia em blocos" vira uma régua torta.

## 4. O vocabulário: as cinco perguntas que sobraram

A decisão está tomada e a lista de execução está pronta — 111 trocas literais, antes e depois, em
`plans/2026-09-13_0300_vocabulario.md`. Resumo: só o que o usuário lê (`schemaVersion` continua 4); não
existe uma palavra (o bloco numerado vira `🍅 Pomodoro 3`, a atividade vira "foco" minúsculo e
incontável, o que conta estudo E evento continua "bloco", e o verbo sai por elisão); o nome do app fica,
com prazo. **Nada disso foi executado** — é um commit só, e ele depende destas cinco:

1. **O emoji do bloco: 🍅 ou fica 📖?** (o ⏱ está fora — é do modo ao vivo). É a decisão de menor
   confiança da lista: dezesseis tomates vermelhos numa tela creme é o que não dá pra conferir por grep.
2. **"Ritmo do pomodoro" com um campo "Pomodoro (min)" dentro**, e a lista dizendo "🍅 Pomodoro 3" — mesmo
   objeto e a duração dele, ou o campo vira só "Duração (min)"?
3. **A seção "Janelas de estudo" das Configurações vira "A sua rotina"**, pra não disputar a palavra com o
   modo "Pela rotina". Confirma o par?
4. **O nome do app**: decide agora, enquanto a tela de consentimento do Google e a Chrome Web Store ainda
   estão fechadas, ou marca a data-limite e segue?
5. **O hero do Perfil** passa a dizer o seu nome ("Tomás · Lv. 7 · Dedicado") no lugar de "Estudante"?

Os **dois bugs** que vieram junto com a decisão foram **corrigidos em 2026-09-15**, fora do commit do
vocabulário (nenhuma das cinco perguntas os tocava): as sete descrições que diziam "estudo" usando `counts`
passaram a dizer "bloco", com um teste que deriva a régua da própria regra, e o "N estudos" do grupo e da
faixa do ciclo virou "N blocos". O resto da lista continua esperando as cinco.

---

## Como esse arquivo deve crescer

- Adicionar itens numerados com escopo claro — tem que ser executável sem volta pra perguntar.
- Quando virar plan grande (>1h de trabalho), copiar pra `plans/YYYY-MM-DD_HHMM_slug.md` e deixar só uma linha aqui apontando.
- **Remover** o item quando concluído (não deixar histórico — o git tem isso).
- Items abandonados também podem ser removidos. Tudo bem.
