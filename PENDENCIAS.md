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

> **(b) fechado em 2026-10-01**: o Tomi decidiu ("deveria ser 2 coisas separadas e diferentes") e está
> implementado — os três números do modal "🕘 Estrutura do dia" são campos e valem só praquele dia; a rotina
> fica nas Configurações. Ver "O ritmo do dia" no CLAUDE.md. O (a) — tirar o "↺ Restaurar rotina" — segue
> aberto, e ele ganhou mais um trabalho: é também o caminho de volta do ritmo do dia.

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
"mexer no gerador reescreve o passado" valendo por inteiro. **Atualização 2026-09-15**: a história da config
(`domain/configHistory.ts`) já congela o passado — mudar ritmo/janelas nas Configurações vale de hoje em
diante, nunca pra trás —, então o ritmo por dia deixou de ser perigoso pra ontem; o que falta é o campo no
override e a UI. Ver também o item 5. **Atualização 2026-10-01**: feito, mas com mapa próprio
(`dayRhythms`) em vez de campo no override, e com a troca do meio do dia dentro do gerador (`rhythmChanges`).

## 2. Miúdos de conta, se um dia houver outro usuário

**Adiado com gatilho** (2026-09-14): reabrir quando existir a **segunda conta por senha**. *Quem
repara e em qual sinal:* ninguém observa isso sozinho — o gatilho é o **Tomi** dizer que alguém entrou por
e-mail/senha, ou `state.user.provider === 'password'` aparecer num documento. Sem dono e sem sinal, adiar
com gatilho é adiar sem gatilho, e foi assim que o "parou às" voltou duas vezes. Hoje a única
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
2. ~~**O bloco em andamento deixa de aceitar check manual?**~~ **Feito em 2026-09-15** (o Tomi saiu e
   pediu pra decidir sozinho): marcar no minuto 1 levava o bloco cheio enquanto o "Parar por aqui" aos 12
   minutos paga 24 — o atalho rendia mais que o caminho honesto. Vale rodando e pausado; desmarcar
   continua livre. Ver "O bloco em ANDAMENTO" no CLAUDE.md.
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

## 5. Ritmo do pomodoro por grupo ou por ciclo

Pedido do Tomi em 2026-09-15: "ter a opção de mudar o pomodoro especificamente dos grupos ou dos ciclos".
É a segunda metade do item 1(b) (ritmo por dia/janela), e o chão que faltava entrou no mesmo dia: a
**história da config** (`domain/configHistory.ts`) — mudar o ritmo vale de hoje em diante e nunca reescreve
o passado —, então "o gerador passa a produzir planos diferentes conforme o override" deixou de ser perigoso
pra trás. O que sobra é decidir ONDE o ritmo mora e como ele entra no gerador:

- **Por grupo**: o grupo já é um trecho `{start, end}` do dia. Ritmo no grupo = o gerador reagindo a uma
  anotação, o que quebra "grupo nunca entra no `generateBlocks`" (CLAUDE.md). A alternativa que não quebra
  nada: o grupo vira uma **janela própria** com ritmo (`StudyWindow` já carrega um em `live` — hoje esse campo
  quer dizer duas coisas, "é corrida" e "este é o ritmo"), partindo a janela do dia no início e no fim do
  grupo. Precisa decidir se o campo é `live` (com o significado de corrida junto) ou um `rhythm` separado
  só de ritmo, e o que acontece com o grupo que muda de horário pela alça.
- **Por ciclo**: ciclo é gerado, não guardado — não tem chave. "Ritmo deste ciclo" só pode ser "ritmo deste
  trecho do dia" (a janela de novo) ou "ritmo a partir de agora" (o item 1(b)). **Confirmar com o Tomi qual dos
  dois ele quer dizer** antes de desenhar.
- **Onde na tela**: o painel do grupo (`#group-panel`) ganhando os três tiles do ritmo? O divisor do ciclo,
  que desde 2026-09-15 já é um botão (recolher)? O modal "Janelas do dia" (1(b))? Uma porta só, de preferência.
- **O passado**: mudar o ritmo de um grupo de hoje que já tem check segue a mesma regra da história (vale só
  pro que ainda não aconteceu) — ou é recusado, como "Dia livre" recusa depois de um check. Decidir.

## 6. O check só existe pelo foco

**Decisão do Tomi em 2026-11-27, a implementar**: "se você não estuda o bloco em modo foco, se não estiver
ativamente nele, você não pode dar check" — ou seja, **o check à mão deixa de existir**. Quem marca passa a
ser só o app: o fim do bloco no timer (`checkBlock`) e o "■ Parar por aqui" (o parcial, pelos minutos
vividos). É o terceiro portão da mesma fila — o bloco que não começou (2026-09-13), o bloco em andamento
(2026-09-15) — e o que fecha de vez o "plano como auto-declaração": XP, moedas, meta, sequência e o XP do
pet passam a sair só de tempo que o relógio do app viu. O modo ao vivo já vive assim.

**Existe uma versão de teste (2026-11-28), desligada por padrão** — o Tomi pediu "só um teste por enquanto,
sem o botãozinho de check". É um interruptor deste dispositivo (Configurações → Geral → "Em teste", ou abrir
o app com `?check=foco`; `?check=manual` desliga): ver "Check só pelo foco (versão de teste)" no CLAUDE.md.
Ela **escolheu uma leitura provisória** pra quatro das perguntas abaixo, só pra dar pra experimentar — nenhuma
está decidida: (1) o evento que conta como estudo **continua com o check à mão**; (3) "pelo foco" = o relógio
do app fechou o bloco, com o foco aberto ou fechado; (5) desmarcar some junto; (6) a pausa só pela emenda. A
(2) ficou como está (dia passado não se marca) e a (4) só pela metade: a pausa que atravessa a parede já
entra marcada com os minutos vividos, mas o timer ainda se perde num reload — dá pra tocar em "▶ Iniciar" de
novo enquanto o bloco é o de agora (e aí ele fecha **cheio**, mesmo iniciado no minuto 24: furo conhecido), e
quem fecha o app e só volta depois do fim perde o bloco. A rede enquanto é teste: desligar o interruptor.

**O resto não foi implementado.** A direção está tomada; o contorno não (o próprio Tomi disse "sipa"). O caminho no
código é curto — `toggleBlockCheck` (`application/checks.ts`) deixa de marcar, e o `.check` da `BlockList`
deixa de ser um botão —, mas o check manual hoje é a rede de sete coisas, e cada uma pede resposta antes:

1. **O evento que conta como estudo** (a aula). O timer só roda estudo e pausa (`tryStartTimer`); evento só
   ganha check à mão. Ele ganha um foco próprio, fica como a única coisa marcável à mão, ou deixa de dar XP?
   Vão junto a skill Aula (a base da Pomba), a Retomada e "evento alimenta sequência e XP do pet".
2. **Quem estuda longe do computador.** O CLAUDE.md promete hoje que "dia passado aceita qualquer horário —
   quem estuda longe do computador marca à noite", e a skill "concluir no modo foco" foi descartada
   justamente por punir essa pessoa. A decisão vira as duas frases. Dia passado fica sem jeito nenhum de
   marcar? (É onde o app de iPhone deixa de ser conforto e vira o caminho.)
3. **O que é "ativamente".** O foco aberto na tela, ou o relógio do app rodando? Em 2026-11-03 você decidiu
   que sair do foco não pausa e **não custa o check** (PR #5, ainda aberto). Se "ativamente" for "foco na
   tela", as duas decisões batem de frente. Leitura provável: relógio do app rodando = vale. Confirmar.
4. **O timer que se perde.** Um reload perde o timer (só a pausa e o hardcore voltam), a aba descartada
   idem, a ausência de mais de 30 min (`ATRASO_MAX_MIN`) encerra sem check, e a pausa que atravessa a
   parede diz "marque à mão se quiser ✓". Em todos, hoje, a saída é marcar à mão. Sem ela, um F5 aos 24
   minutos custa o bloco inteiro — o que provavelmente pede **persistir o timer no dispositivo** antes ou
   junto (o próximo passo que "O fim do bloco pela extensão" já deixava anotado).
5. **Desmarcar.** Continua existindo ("tirar não é ganhar")? Se sim, passa a ser irreversível — não há como
   remarcar —, e aí pede confirmação. Ou some junto, e o check vira só registro.
6. **A pausa.** Hoje ela dá XP com check (à mão ou pela emenda do foco). Só pela emenda também?
7. **O que some na tela e nos testes.** O ripple e o "+X XP" flutuante passam a existir só no fim do bloco;
   o `.check.not-yet` e a recusa do bloco em andamento perdem a função; a faixa do ciclo da lista
   (`#cycle-cheer`) deixa de ter quem a dispare fora do foco; os balões do tour e a Fiel ("o primeiro estudo
   **marcado**") falam de marcar. E o smoke marca check à mão em dezenas de casos: vai precisar de um helper
   que rode o bloco pelo relógio falso. Medir antes de começar.

Os checks que já existem ficam como estão — nada retroativo. Quando as respostas vierem, isto é plan grande
(mexe em Princípios do CLAUDE.md, em skills e na suíte inteira): vai pra `plans/`.

---

## Como esse arquivo deve crescer

- Adicionar itens numerados com escopo claro — tem que ser executável sem volta pra perguntar.
- Quando virar plan grande (>1h de trabalho), copiar pra `plans/YYYY-MM-DD_HHMM_slug.md` e deixar só uma linha aqui apontando.
- **Remover** o item quando concluído (não deixar histórico — o git tem isso).
- Items abandonados também podem ser removidos. Tudo bem.
