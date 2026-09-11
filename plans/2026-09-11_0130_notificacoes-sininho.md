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
| `dia` | "Dia encerrado · +390 XP · +200 🪙" | o dia entrou na conta e rendeu alguma coisa | `dia:<dia>` |
| `nivel` | "Você chegou no nível 4 · Dedicado" | o XP dos dias que entraram cruzou um degrau de `LEVELS` | `nivel:<nível>` |
| `pet-nivel` | "Bolt chegou no Lv. 5" | nível do pet antes < depois de creditar | `pet-nivel:<pet>:<nível>` |
| `pet-evolucao` | "Bolt pode evoluir" | idem, `canEvolveNow` virou verdadeiro | `pet-evolucao:<pet>:<nível>` |
| `sequencia` | "7 dias seguidos batendo a meta · rende 12 🪙 por dia" | a sequência **naquele dia** caiu num degrau de `DAILY_BONUS_TIERS` | `sequencia:<dia>:<n>` |
| `recorde-dia` | "Melhor dia até agora · 520 XP" | o dia bateu o melhor dia anterior — **e já havia um** | `recorde-dia:<dia>` |
| `moedas` | "Dá pra adotar mais um pet" | o saldo **cruzou** o preço do pet mais barato | `moedas:<dia>` |
| `abandono` | "O app fechou no meio de Estudo 3 · −100 XP pra você · Bolt −100 XP" | `resumeHardcoreOnBoot`, resolução `abandon` | `abandono:<dia>:<hora>` |

**As sete primeiras têm UM gatilho só**: `applyPendingPetXP`, que é por onde passam as duas portas
de um dia entrar na conta — o `closeDay` chama, e o boot chama. A janela é a mesma que o XP dos
pets percorre (`(pending.from, pending.processedUntil]`, agora exposta pelo domínio), e os números
por dia vêm de dois campos novos do `computeStats`: `dayXP` e `dayCoins`, acumulados na mesma
passada que já existia. Duas fontes calculando os mesmos ids com números possivelmente diferentes
seria pior do que um caminho só.

Três detalhes que não são acidente:

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
| `extensao-sumiu-no-meio-do-estudo` | **depois** | Real, mas raro, e a seção de Bloqueio de sites já mostra o status. Só vale se acontecer de verdade. |
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

- `tests/notifications.test.ts` (19) — o módulo puro: ordem, dedup, teto, `read`, normalização de
  documento torto, tempo relativo (inclusive carimbo no futuro, de um dispositivo adiantado).
- `tests/progress-notices.test.ts` (21) — as regras: quem vira linha e quem não vira, e que o id
  não depende do relógio.
- `tests/application-notifications.test.ts` (17) — o app de verdade: encerrar o dia, encerrar
  duas vezes, pet que sobe de nível com o app fechado, três dias seguidos virando marco, o
  cruzamento das moedas acontecendo uma vez só, cancelar sessão zerando.
- `tests/persistence.test.ts` — campo ausente, lixo, ida e volta.
- e2e **48** (celular) — o ciclo inteiro: vazio, encerrar o dia, selo "2", as duas linhas, fechar
  marca como lido, sobrevive ao reload, "Limpar" zera e o boot seguinte não recria.
- e2e **49** (laptop) — a ordem da barra e o painel inteiro dentro da janela.
- e2e **50** (393px) — a barra do timer abaixo de uma barra do topo de duas linhas.
- e2e **51** — o caso principal de ponta a ponta: marcar um estudo, **não** encerrar o dia, virar
  o relógio pro dia seguinte, recarregar — e achar "Dia encerrado · +50 XP" no sininho; e o boot
  seguinte não recriando as mesmas linhas.

## Como isso foi checado

Três desenhos independentes do sistema rodaram em paralelo com ângulos diferentes ("o mínimo
honesto", "memória do esforço", "o que você perdeu"), cada um com o catálogo exaustivo. **Os três
chegaram nas mesmas oito**, o que é a melhor evidência disponível de que a régua está certa. O
terceiro acrescentou uma nona — "o bloqueio de sites não pegou" — que ficou em `depois` por dois
votos contra um: é **estado**, não acontecimento, e estado mora em indicador (a faixa 🛡️ da barra
do timer e o status na seção de Configurações), não em histórico.

E foi um desses desenhos que apontou o buraco na primeira versão desta branch, que só emitia no
`closeDay`: **o dia que passa sozinho na virada da meia-noite** — justamente o caso mais comum —
não deixava linha nenhuma.

## O que ficou de fora, de propósito

- **Notificação do sistema** (Web Notifications) disparada pelo sininho. São coisas diferentes e
  misturar confunde: uma interrompe, a outra espera. O app já usa a do sistema no fim do bloco.
- **Preferências de notificação** em Configurações. Um painel passivo, que não interrompe e não
  faz barulho, não precisa de interruptor — e o interruptor é que seria a inflada.
- **Agrupar por dia** no painel ("Hoje", "Ontem"). Com teto de 40 e o "há N dias" em cada linha,
  não paga o custo. Vale reavaliar se alguém acumular meses.
- **Um balão do tour** apontando pro sininho. Seriam seis balões; o estado vazio já explica.
