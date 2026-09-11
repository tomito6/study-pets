# O sininho: o que aconteceu enquanto você não estava olhando

**Branch:** `feat/notificacoes` (a partir de `main`, 9d2a795)
**Quando:** 2026-09-11, madrugada, sessão do Mac da noite
**Merge é decisão do Tomi.**

## O pedido

> "em 4 horas numa branch nova eu iria gostar que voce fizesse um treco de notificacoes
> (do lado da engrenagem) e ja pense em todas notificacoes / implemente as que vao ser usadas"

O `IDEIAS.md` tinha isso parado desde 2026-09-06 ("Aba de notificações"), com quatro perguntas
em aberto. O pedido responde a primeira; as outras três foram decididas aqui.

| Pergunta do IDEIAS.md | Decisão | Por quê |
|---|---|---|
| Aba no cabeçalho ou sininho? | **Sininho**, ao lado da engrenagem | O Tomi pediu. Uma quarta aba daria a notificações o mesmo peso de Plano/Análise/Perfil, que elas não têm. |
| Lida e some, ou histórico? | **Histórico**, teto de 40, com "Limpar" | O app é sobre ver o esforço virar evolução visível. Uma linha que some depois de lida não é memória de nada. |
| O que entra? | **Só o que o app descobre depois do fato** | Ver "A régua" abaixo. |
| Isso infla o app? | **Não, se a régua for respeitada** | O catálogo completo, com o veredito de cada linha, está neste arquivo. Metade dele é "nunca". |

## A régua: por que estas oito e não outras

O que decide não é "isso é legal de saber", é **"o usuário ficaria sabendo de outro jeito?"**.
Toast é feedback de uma ação que a pessoa acabou de fazer, e some porque ela estava olhando.
O sininho é pra quando ela **não** estava.

Duas coisas do app produzem exatamente isso:

1. **A regra do dia fechado.** XP e moedas do usuário só entram nos totais quando o dia encerra
   (`computeStats` só agrega dia fechado), e o XP dos pets é creditado por `applyPendingPetXP`.
   Então todo marco de progresso — subir de nível, o pet evoluir, bater um recorde — só pode
   acontecer quando **um dia entra na conta**. E isso tem duas portas: o botão "Encerrar o dia" e
   a **virada da meia-noite** (`computeStats` conta todo dia passado, com ou sem `closedDays`).
   A primeira já tem o modal de resumo. A segunda — que é a comum, a pessoa fecha o laptop e
   pronto — **não tinha dono nenhum**: o pet subia de nível às 3 da manhã, o dia entrava na conta,
   e não havia tela que contasse. É o buraco mais claro do app, e é a razão de o sininho existir.
2. **O boot assíncrono.** O modo hardcore cobra o abandono em `resumeHardcoreOnBoot` com um
   toast — que dispara enquanto a página ainda está montando, por cima de quem acabou de abrir
   o app. Uma penalidade de XP cobrada sem ninguém ver é o pior lugar possível pra um toast.

Tudo que não cai num desses dois casos já é dito em outro lugar, e repetir seria inflar.

## O catálogo completo

**`agora`** = implementada nesta branch. **`depois`** = faz sentido, falta gatilho ou dor.
**`nunca`** = decidida contra, com o motivo.

### As oito que entraram

| id | o que diz | gatilho | chave de dedup |
|---|---|---|---|
| `dia` | "Dia encerrado" · "02/09 · +390 XP · 3h15 · 🏆 melhor dia" | o dia entrou na conta e rendeu alguma coisa | `dia:<dia>` |
| `nivel` | "Você chegou no nível 4 · Dedicado" | o XP dos dias que entraram cruzou um degrau de `LEVELS` | `nivel:<nível>` |
| `pet-nivel` | "Bolt chegou no Lv. 5" | nível do pet antes < depois de creditar | `pet-nivel:<pet>:<nível>` |
| `pet-evolucao` | "Bolt pode evoluir" | idem, `canEvolveNow` virou verdadeiro | `pet-evolucao:<pet>:<nível>` |
| `sequencia` | "7 dias seguidos batendo a meta · rende 12 🪙 por dia" | a sequência **naquele dia** caiu num degrau de `DAILY_BONUS_TIERS` | `sequencia:<dia>:<n>` |
| `horas` | "100 horas de estudo" | o total de estudo cruzou um degrau de `MARCOS_DE_HORAS` | `horas:<marco>` |
| `abandono` | "O app fechou no meio de Estudo 3 · −100 XP pra você · Bolt −100 XP" | `resumeHardcoreOnBoot`, resolução `abandon` | `abandono:<dia>:<hora>` |

**As seis primeiras têm UM gatilho só**: `applyPendingPetXP`, que é por onde passam as **três**
portas de um dia entrar na conta — o `closeDay` chama, o boot chama, e a virada da meia-noite com
o app aberto chama (`application/dayRollover.ts`, um `setTimeout` pro instante da virada mais o
`onVisible`, no mesmo espírito sem-polling do prompt de fim de dia; sem isso, quem deixa o app
aberto na aba Plano atravessando a meia-noite ficava sem o crédito do pet e sem linha nenhuma até
recarregar). A janela é a mesma que o XP dos
pets percorre (`(pending.from, pending.processedUntil]`, agora exposta pelo domínio), e os números
por dia vêm de dois campos novos do `computeStats`: `dayXP` e `dayCoins`, acumulados na mesma
passada que já existia. Duas fontes calculando os mesmos ids com números possivelmente diferentes
seria pior do que um caminho só.

Quatro detalhes que não são acidente:

- **`recorde-dia` exige um dia anterior.** No primeiro dia fechado da vida, "melhor dia até
  agora" é aritmética, não notícia.
- **`moedas` exige o cruzamento** (`saldo antes < preço ≤ saldo depois`), não o estado. Sem isso
  seria um lembrete diário de gastar — o padrão que este app não usa. E funciona de novo depois
  de comprar, porque o cruzamento volta a acontecer.
- **`sequencia` carrega o dia no id.** `sequencia:7` sozinho impediria a linha de aparecer numa
  segunda sequência de 7 dias, meses depois. E a sequência é medida **ancorada naquele dia**, não
  em hoje: voltar depois de uma semana fora tem que contar o marco do dia em que ele aconteceu.
- **Voltar de muitos dias fora não enche o painel.** No máximo três linhas de "dia encerrado"
  (`MAX_DIAS_NO_LOTE`), as mais recentes — mas os marcos do período inteiro entram, e dois níveis
  num lote só viram **uma** linha, do nível efetivamente alcançado.
- **A penalidade do hardcore precisa entrar na conta do "antes"** (`penaltyInBatch`). Ela é a
  única coisa que sai do total sem esperar o dia fechar, então já está descontada no `totalXP` —
  mas não estava no XP de antes. Sem isso, uma desistência dentro do lote faz o "antes" sair
  baixo demais e o app anuncia um nível que a pessoa já tinha. `tests/stats.test.ts` cobra a
  invariante que sustenta tudo isto: **a soma do `dayXP` menos as penalidades é exatamente o
  `totalXP`**, e a soma do `dayCoins` é exatamente `coins` — senão a linha "+390 XP" mente.

### As que ficaram de fora

| id | veredito | por quê |
|---|---|---|
| `plano-reajustado` | **nunca** | Já é toast, e é resposta imediata a uma ação (pausar, mover evento). Ver de novo depois não ajuda em nada. |
| `calendario-importado` | **nunca** | Idem: a pessoa acabou de confirmar a tela de revisão. |
| `dia-passou-do-horario` | **nunca** | O prompt automático de fim de dia já é exatamente isso, no momento certo. |
| `evento-criado` / `grupo-criado` / `janelas-editadas` | **nunca** | Feedback de ação própria. O plano na tela já mostra. |
| `voce-nao-estudou-hoje` | **nunca** | Padrão manipulativo. O app promete não fazer o usuário se sentir mal por mudar o plano. |
| `sua-sequencia-acabou` | **nunca** | Idem, e pior: transformaria falhar em perda visível. Streak se celebra, não se cobra. |
| `faz-N-dias-que-voce-nao-aparece` | **nunca** | Idem. E a skill Recomeço já paga por voltar, que é o oposto disso. |
| `pet-com-fome` / `pet-triste` | **nunca** | Pet como cobrança inverte o que ele é: marco de esforço, não bicho pra cuidar. |
| `hora-de-estudar` (lembrete de bloco) | **nunca** aqui | Isso é notificação do SISTEMA (Web Notifications), não linha de histórico. Já existe no fim do bloco. |
| `save-falhou` / `offline` | **nunca** | O `#save-indicator` é o lugar certo, e uma notificação de "não consegui salvar" que precisa ser salva pra existir é uma contradição. |
| `doc-mudou-em-outro-dispositivo` | **nunca** | É estado de sistema; e o que mudou chega como as próprias linhas, pelo documento. |
| `moedas` ("dá pra adotar mais um pet") | **depois** | Foi implementada, testada e **retirada**. É a única linha do catálogo cuja função é fazer você gastar, dentro de um painel que existe pra mostrar o que você perdeu — e ela reaparece a cada vez que o saldo cruza os 150, ou seja, depois de cada adoção. A loja já se destrava sozinha (o card sai de `.locked`) e o saldo já aparece no Perfil e no cabeçalho da loja. Voltar atrás é um `push` de cinco linhas. |
| `extensao-sumiu-no-meio-do-estudo` | **depois** | É **estado**, não acontecimento — e você está olhando, no meio de um estudo. Estado mora em indicador (a faixa 🛡️ da barra do timer deixando de sumir calada), não em histórico lido depois. |
| `dia-estudado-sem-pet-equipado` | **depois** | Perda silenciosa e irreversível de verdade: check sem pet não credita ninguém, e reequipar depois não recupera. Mas a linha chega tarde demais pra consertar o dia, e "você fez errado" é o tom que o app não usa. Se entrar, é como aviso **antes** — no Plano, enquanto dá pra equipar. |
| `skill-do-pet-desligada-na-leitura` | **depois** | `normalizePetInstance` desliga sozinha a skill que a forma atual não tem (foi o que aconteceu quando a coruja virou pomba). O bônus some no boot, sem uma palavra. Raro: só em rebalanceamento de catálogo. |
| `tempo-de-casa-do-pet` | **depois** | "Bolt faz 30 dias com você · 42h estudadas juntos" — `adoptedAt` já existe. É a versão saudável do "pet com saudade": celebra, não cobra. Boa candidata pra v2. |
| `meta-diaria-mudada-reescreve-o-passado` | **nunca** aqui | Mudar `dailyStudyMin` recalcula sequência, dots, heatmap e bônus de moedas **retroativamente**, e ninguém avisa. É um buraco real — mas o canal é o próprio Salvar das Configurações, não um histórico. |
| `documento-remoto-descartado-pelo-sync` | **nunca** | `applyRemoteDoc` joga fora o doc do outro aparelho quando há save local pendente ("o local vence" do v1). É perda de verdade, e silenciosa — mas o app não sabe **o que** perdeu, e uma linha dizendo "algo se perdeu" sem dizer o quê só assusta. |
| `desistiu-no-hardcore` (o "Desistir" voluntário) | **depois** | Diferente do abandono: a pessoa clicou, leu a conta exata num modal e confirmou. O toast basta. |
| `pet-pode-evoluir` fora do fim do dia | **nunca** | O selo "✨ Pode evoluir" no card do pet já cobre o estado; a notificação cobre o **instante** em que destravou. |
| `skill-rende-mais-agora` (bônus subiu com o nível) | **depois** | O número aparece no card da skill. Uma linha por nível de pet seria ruído semanal. |
| `melhor-semana` / `maior-sequencia` (recordes da Análise) | **depois** | Recorde de semana só fecha no domingo, e "maior sequência" coincide com `sequencia` quase sempre. Duas linhas dizendo a mesma coisa. |
| `meta-batida-hoje` | **nunca** | Acontece no meio do dia, quando a pessoa está olhando, e o XP card já mostra. |
| `bem-vindo` / `dica-do-dia` | **nunca** | Sininho com conteúdo fabricado pra não ficar vazio é a definição de inflar. O estado vazio explica o que vai aparecer ali. |
| `novidade-da-versão` (changelog) | **depois** | Faz sentido no dia em que houver outro usuário além do Tomi. |

## O modelo

**Uma notificação é `{ id, kind, at, read, data }`** (`domain/notifications.ts`), e o **id é a
chave de dedup**. Ele deriva do acontecimento, nunca do relógio: `dia:2026-09-11`,
`pet-nivel:dog:5`. `addNotifications` ignora id que já existe, e **a linha antiga vence** — o
`read` e o carimbo originais ficam, senão abrir o app de novo faria a linha de ontem voltar a
brilhar. Isso é o que permite emitir o mesmo lote no `closeDay`, num boot depois e num sync sem
nunca gerar cópia.

**O texto não mora na notificação.** Ela guarda os números (`data`), e `strings.notifications`
monta a frase. Uma linha lida em novembro continua fazendo sentido depois de o texto mudar em
dezembro, e virar inglês um dia é trocar o arquivo, não migrar o documento.

**Persistida** (`notifications` no doc, `schemaVersion` continua 4 — campo novo, opcional, com
default em `hydrateUserDoc`). Três razões: o `read` precisa sobreviver ao reload; o ganho de um
dia que fechou com o app desligado só existe ali; e o dispositivo que não presenciou o fato
recebe a linha pelo documento, já com o id certo, sem duplicar. Teto de 40 — é um diário do
progresso recente, não um log eterno dentro do Firestore.

**Sync:** `applyRemoteDoc` substitui a lista inteira, como faz com tudo. Dois dispositivos que
geram a mesma linha geram o mesmo id, então não há cópia; o que pode oscilar é o `read` (o último
save vence). É a mesma janela de "o local vence" que o resto do app já tem — não vale escrita
granular só por isso.

**Cancelar sessão zera.** Cada linha fala de um nível, um pet ou um dia que acabaram de deixar
de existir; manter seria guardar um diário de mentira. (`tutorialSeen` e `avatar` continuam
ficando, pelos motivos de sempre.)

## A UI

`features/notifications/NotificationBell.tsx`. Popover ancorado, **não** `Modal.tsx`: uma lista
de avisos não merece escurecer a tela inteira. Fecha clicando fora ou com Esc — `useDismiss`,
que saiu de dentro do menu do avatar e agora serve aos dois.

- **No laptop** (≥1100px): `.topbar-right`, entre o XP e a engrenagem. A ordem é contrato do e2e:
  `today-label · xp-badge · notif-wrap · gear-btn · avatar-wrap`. O painel pendura no botão, 340px.
- **No celular**: `.topbar-right` também, entre o XP e o "Sair". A engrenagem lá é um FAB no canto
  de baixo que **só existe na aba Plano** — pendurar o sininho nela o faria sumir na Análise e no
  Perfil, e um segundo FAB seria dois botões flutuantes disputando o mesmo canto. Sino mora em
  cabeçalho. O painel é uma folha fixa logo abaixo da barra, de beirada a beirada com 12px de
  margem: ancorado à direita numa barra estreita, ele sangraria pela esquerda.
- **O selo é da cor do accent, não vermelho.** Aqui não chega nada urgente nem nada que cobre
  você. Passa de 9, vira "9+".
- **Marcar como lido acontece ao FECHAR**, não ao abrir: é fechando que dá pra ver, com o painel
  aberto, quais linhas eram novas.
- **Estado vazio** com duas frases, porque conta nova abre num painel vazio: "Nada por aqui
  ainda." / "O que acontece enquanto você não está olhando aparece aqui: o dia que fechou, o
  nível que subiu, o pet que pode evoluir."
- Linha que leva a algum lugar (pet → Perfil, recorde → Análise) é `role="button"` com Enter e
  Espaço, como o `CLAUDE.md` exige; a que não leva é `<li>` e ponto.

## O bug que apareceu no caminho

`--topbar-h` era um **`76px` cravado no CSS**, apesar de o `CLAUDE.md` dizer que é a altura da
barra ("que a barra do timer usa pra grudar logo abaixo em vez de um `top` fixo"). Medido:

| largura | barra sem sininho | barra com sininho |
|---|---|---|
| 360px | **92px** | 92px |
| 375px | **92px** | 92px |
| 393px | 76px | **92px** |
| 412px | 76px | **92px** |
| 480px | 76px | 76px |

Ou seja: em 360 e 375px o conteúdo da direita **já** quebrava em duas linhas (o "Sair" desce), e
a `.timer-bar` — sticky em `top: var(--topbar-h)` — encostava 16px **debaixo** da barra do topo.
Com uma conta antiga ("12480 XP · Mestre") são 109px, e some 33px. Ninguém tinha visto porque o
e2e roda em 480px.

Agora a altura é **medida** (`app/useTopbarHeight.ts`, `ResizeObserver`), o que fecha o caso em
qualquer largura. O sininho estende a quebra até 412px — o mesmo desenho que 360px já tinha. Se
o Tomi quiser uma linha só nessas larguras, há duas saídas limpas, nenhuma delas minha decisão:
esconder o nome do nível ("Zero", "Mestre") no selo de XP abaixo de 420px, ou trocar o botão
"Sair" do celular pelo mesmo menu de avatar do laptop. `flex-wrap:nowrap` foi testado e
**descartado**: em 360px o selo de XP quebra por dentro ("0 / XP") e o "Sair" sai da tela.

## Testes

- `tests/notifications.test.ts` (22) — o módulo puro: ordem, dedup, teto, `read`, normalização de
  documento torto, tempo relativo (inclusive carimbo no futuro, de um dispositivo adiantado) — e a
  varredura de todo `NotifKind` contra `strings.notifications`: os três mapas são
  `Record<string, …>`, então um tipo novo sem texto renderizaria uma linha vazia e o build
  passaria. O mesmo teste cobra que nenhum texto escreva "undefined" com dados pela metade.
- `tests/progress-notices.test.ts` (30) — as regras: quem vira linha e quem não vira, o recorde
  como marca, os degraus de hora (inclusive cruzar dois de uma vez), e que o id não depende do
  relógio.
- `tests/application-notifications.test.ts` (21) — o app de verdade: a ordem do boot
  (o teste reprova a ordem antiga com 250 contra 200, e cobra que o documento gravado
  pelo `saveNow()` da penalidade já tenha a linha do abandono), encerrar o dia, encerrar
  duas vezes, pet que sobe de nível com o app fechado, **a virada da meia-noite com o app aberto**,
  voltar de uma semana fora, três dias seguidos virando marco, o cruzamento das moedas acontecendo
  uma vez só, cancelar sessão zerando.
- `tests/stats.test.ts` — a invariante que sustenta os números: soma do `dayXP` menos as
  penalidades = `totalXP`; soma do `dayCoins` = `coins`.
- `tests/persistence.test.ts` — campo ausente, lixo, ida e volta.
- e2e **48** (celular) — o ciclo inteiro: vazio, encerrar o dia, selo "2", as duas linhas, fechar
  marca como lido, sobrevive ao reload, "Limpar" zera e o boot seguinte não recria.
- e2e **49** (laptop) — a ordem da barra e o painel inteiro dentro da janela.
- e2e **50** (393px) — a barra do timer abaixo de uma barra do topo de duas linhas.
- e2e **51** — o caso principal de ponta a ponta: marcar um estudo, **não** encerrar o dia, virar
  o relógio pro dia seguinte, recarregar — e achar "Dia encerrado · +50 XP" no sininho; e o boot
  seguinte não recriando as mesmas linhas.
- e2e **52** — o teclado (Tab entra, Esc devolve o foco pro sininho), a estrutura da lista
  (`<li>` sem papel, `<button>` dentro) e as duas geometrias: o painel abaixo da barra do timer, e
  o teto de 340px.

## A ordem do boot, que era o bug de verdade

`initAfterLoad` creditava o XP pendente — e emitia as linhas — **antes** de
`resumeHardcoreOnBoot` cobrar o abandono. E a cobrança apaga o check do bloco
(`applyPenalty` faz `delete checks[time]`) e desconta XP do usuário e do pet. Quem
fechou o app no meio de um estudo hardcore via, no boot seguinte, "Dia encerrado ·
+250 XP" e às vezes um "você chegou no nível N" — números que a cobrança desfazia
segundos depois. Pior: o id já estava gasto, então a linha certa nunca mais
apareceria. O crédito passou pra depois da cobrança, e o teste reprova a ordem
antiga (250 contra 200).

Essa inversão tem um **efeito colateral no modo hardcore, e ele é o certo**: o pet
deixa de ser creditado pelo bloco abandonado (o check já não existe quando o
crédito roda). Na ordem antiga ele ganhava o XP do bloco pelo qual acabava de ser
penalizado. Em troca, a cobrança do pet passa a ser limitada pelo XP que ele tinha
**antes** do crédito do dia — que é o que ele de fato tinha no instante em que o
bloco foi abandonado. Os dois lados estão pinados por teste; se o Tomi achar que a
cobrança ficou leve demais nesse caso, o lugar de mexer é `quitCost`, não a ordem.

Pelo mesmo motivo, a **linha do abandono entra antes da penalidade**:
`applyPenalty` termina num `saveNow()` sem debounce ("quem fecha a aba logo depois
não escapa da conta"), e a notificação precisa já estar no estado que ele
serializa. Emitida depois, ela ficaria 800 ms na fila com a penalidade já gravada
— e quem fechasse a aba nessa janela a perderia pra sempre, porque no boot
seguinte o bloco já está abandonado e a guarda `!isForfeited` pula o ramo inteiro.

E os ids de `nivel` e `pet-nivel` passaram a carregar o dia, como `sequencia` já
fazia: **nível não é caminho de mão única**. A desistência do hardcore derruba
nível na hora; sem o dia, `pet-nivel:dog:5` já estaria gasto e a subida de volta
nunca apareceria.

## O erro que eu mesmo introduzi no caminho

Uma versão intermediária desta branch somava as penalidades do lote de volta no XP
de "antes" (`penaltyInBatch`), com o raciocínio de que a desistência já estava
descontada no `totalXP` mas não no antes. **Está invertido**: `computeStats` soma
`penalties[key]` **fora** da guarda de `isPast`, então uma desistência num dia do
lote já estava no total que a pessoa via ontem. Somar de volta inflava o antes e
engolia um "subiu de nível" verdadeiro. Revertido, com o teste explicando a razão.

Fica um resíduo conhecido e pequeno: a penalidade cobrada **no próprio boot** não
estava no total de antes, então o XP de antes sai baixo demais e pode aparecer um
"você chegou no nível N" pra um nível que a pessoa já tinha. Acontece só quando
uma desistência por abandono cai exatamente em cima de um degrau de `LEVELS`.

## As seis da UI, medidas no navegador

| o que | antes | agora |
|---|---|---|
| largura do painel entre 768 e 1099px | esticava até 744px numa tela de app de 480 | teto de 340px em qualquer largura |
| alvo de toque do "Limpar" (que apaga tudo) | 36×11 | 52×25 (WCAG 2.5.8 pede 24×24) |
| foco do teclado ao fechar | caía no `<body>` | volta pro `#notif-btn` |
| árvore de acessibilidade | `role="button"` no `<li>` apagava o `listitem` | o papel foi pro `<button>` de dentro |
| contraste do "há N min" (escuro, 10px) | 3,35:1 | 5,00:1 |
| painel × barra do timer (celular) | cobria o relógio do estudo em andamento | começa abaixo dela |

## Como isso foi checado

Três desenhos independentes do sistema rodaram em paralelo com ângulos diferentes ("o mínimo
honesto", "memória do esforço", "o que você perdeu"), cada um com o catálogo exaustivo. **Os três
chegaram nas mesmas oito**, o que é a melhor evidência disponível de que a régua está certa. O
terceiro acrescentou uma nona — "o bloqueio de sites não pegou" — que ficou em `depois` por dois
votos contra um: é **estado**, não acontecimento, e estado mora em indicador (a faixa 🛡️ da barra
do timer e o status na seção de Configurações), não em histórico.

E foi um desses desenhos que apontou o buraco na primeira versão desta branch, que só emitia no
`closeDay`: **o dia que passa sozinho na virada da meia-noite** — justamente o caso mais comum —
não deixava linha nenhuma. Depois, um painel de juízes lendo o código já commitado achou o resto:
a virada **com o app aberto** (que continuava sem gancho: `applyPendingPetXP` era chamado pelo
boot, pelo encerrar, pelo sync e pelo Perfil, e o `reconcileTimer`, que roda a cada segundo, nunca
o chamava); a penalidade do hardcore fora da conta do "antes"; as três linhas de "Dia encerrado"
saindo idênticas depois de uma ausência (a data entrou no texto); e a falta de uma rede que
cobrasse texto pra cada `NotifKind`.

Depois disso, uma **revisão adversarial** atacou o código já commitado por cinco
dimensões (idempotência, os números, ordem de boot, UI/acessibilidade, regressão),
com cada achado passando por um verificador cuja tarefa era refutá-lo. Foi ela que
encontrou a ordem do boot, o `penaltyInBatch` invertido, os ids sem o dia e as seis
da UI — todas reproduzidas antes de virar conserto, e as refutadas descartadas.

A síntese do painel de desenho cortou duas linhas e acrescentou uma: o **recorde** virou marca
dentro da linha do dia, **`moedas` saiu** (ver o catálogo) e entrou o marco de **horas estudadas**,
que é a única linha que fala do total em vez de um dia — e a que mais casa com o que o app diz de
si mesmo. Um dia de estudo passou a se anunciar em tempo, não em moedas.

## O que ficou de fora, de propósito

- **Notificação do sistema** (Web Notifications) disparada pelo sininho. São coisas diferentes e
  misturar confunde: uma interrompe, a outra espera. O app já usa a do sistema no fim do bloco.
- **Preferências de notificação** em Configurações. Um painel passivo, que não interrompe e não
  faz barulho, não precisa de interruptor — e o interruptor é que seria a inflada.
- **Agrupar por dia** no painel ("Hoje", "Ontem"). Com teto de 40 e o "há N dias" em cada linha,
  não paga o custo. Vale reavaliar se alguém acumular meses.
- **Um balão do tour** apontando pro sininho. Seriam seis balões; o estado vazio já explica.
