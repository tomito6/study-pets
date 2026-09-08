# Arrastar eventos: mudar de horário (e de dia) com a mão

**Branch:** `feat/arrastar-eventos` (a partir de `main`, 54acfbe)
**Quando:** 2026-09-08, à noite, no laptop noturno
**Nunca mergeada** — merge é decisão do Tomi.

## O pedido

> "Você poderia implementar numa branch um jeito de mexer os eventos. Tipo mexer neles com
> drag and drop."

Era o primeiro item da ideia "Mexer e manipular tudo direto na Semana" (IDEIAS.md, 2026-09-07):
*arrastar um evento move*. Os outros itens daquela ideia (arrastar no vazio pra criar, puxar a borda
pra esticar, puxar a coluna pra mexer nas janelas, arrastar pra agrupar) continuam abertos.

## O que entrou

Duas telas, um gesto só:

- **No Dia** (qualquer largura, o celular inclusive): toda linha de evento e de refeição ganhou uma
  **alça** `⠿` na ponta direita. Pega na alça — com o dedo ou com o mouse — e a linha vira fantasma
  enquanto uma caixa tracejada mostra onde ela cai, com o horário escrito. No mouse dá pra pegar a
  linha inteira, sem mirar na alça: o arrasto só começa depois de andar 6px, então o clique continua
  abrindo o modal de sempre.
- **Na Semana** (laptop, ≥1100px): o bloco do evento se arrasta pela grade — pra outro horário e
  **pra outro dia**. É o gesto que faltava pra Semana ser o lugar de planejar: "essa aula é na
  quinta" vira arrastar uma coluna pro lado.

O horário anda de **5 em 5 minutos** (o mesmo passo do "Começar agora"), a duração é preservada, e o
plano se refaz em volta como se você tivesse editado o evento pelo painel — inclusive o toast
"Plano reajustado: …".

## As decisões, e onde trocar de ideia

### A geometria é medida uma vez, no começo do arrasto

A lista do Dia **não é proporcional ao tempo**: uma pausa de 5 min e um estudo de 25 ocupam quase a
mesma altura. Então "que horas são este pixel?" se responde interpolando dentro da linha que está ali
(`domain/eventDrag.ts`: `minuteAtY`/`yAtMinute`). Na Semana é a mesma função com uma faixa só, a
coluna inteira — aí sim proporcional.

O mapa é congelado quando o arrasto começa e não muda até soltar. Isso é de propósito: mover o evento
muda o plano inteiro em volta, e re-medir a cada quadro faria o alvo fugir do dedo (o clássico
loop de realimentação: o alvo mexe na geometria que decide o alvo). O preço é que o fantasma mostra a
posição na régua antiga; como ele mostra o **horário escrito**, o usuário nunca fica no escuro.

Se um dia quisermos o plano se remontando ao vivo embaixo do dedo, o caminho é gerar um plano
hipotético (`generateBlocks` é puro) e desenhar a lista com ele — sem tocar no estado.

### O ponto de pega

Pegou o evento no meio? Ele continua no meio do dedo ao soltar (`grabOffsetMin`). É o que todo
calendário faz, e é o que faz o gesto parecer que você está segurando a coisa.

### Numa série, a pergunta é a de sempre

Arrastar a refeição (que é uma série diária) abre `#event-move-scope`: **"Só este dia"** ou **"Toda a
série"** — a mesma pergunta do chip "Aplicar a" na edição e do modal de apagar. Só este dia = exceção
na série + avulso, exatamente como `updateSeriesOccurrence`.

**Mudar o dia da semana da série inteira é recusado** (`series-other-day`): arrastar a aula de quarta
pra quinta mexeria em `weekdays`, e isso é edição, não arrasto. Na Semana, arrastar uma ocorrência de
série pra outro dia vale só pra aquele dia, sem perguntar (não há a segunda resposta possível).

### Dia futuro pode; dia encerrado não

`canMoveEvents` = dia não encerrado. Planejar o amanhã é o ponto — a mesma regra dos grupos. Isso
deixa uma **inconsistência conhecida**: no dia futuro dá pra arrastar um evento, mas *tocar* nele
ainda mostra "Ainda não chegou 🔮" em vez de abrir a edição (a recusa de dia futuro em `BlockList`
cobre a linha inteira, e ela existe pro timer e pro check). Não mexi nisso porque não é o que foi
pedido; se o Tomi concordar, é uma linha: soltar evento e intervalo daquela recusa.

### Dois eventos no mesmo horário

Se você solta um evento por cima de outro, o `generateBlocks` emite o primeiro e pula pro fim dele —
o de baixo **some do plano daquele dia** (continua salvo; volta assim que você tirar o de cima).
Isso já era assim antes (dá pra criar sobreposição pelo painel), e por isso não mexi no gerador. Se
incomodar, as saídas são recusar o drop sobreposto (toast) ou o gerador desenhar os dois.

### O gesto convive com o que já existia

A linha do plano já tinha duas máquinas de ponteiro: botão direito arrasta seleção de grupo, dedo
segurando faz o mesmo. O arrasto de evento entra sem disputar:

| Gesto | O que faz |
|---|---|
| Botão direito arrastando | seleção de trecho (grupo) — como sempre |
| Dedo segurando a linha | seleção de trecho (grupo) — como sempre |
| Dedo na **alça** `⠿` | move o evento |
| Mouse arrastando a linha do evento | move o evento (depois de 6px) |
| Clique/toque curto | abre o modal do evento — como sempre |

Enquanto a seleção de trecho está em andamento, o arrasto de evento fica desligado (tocar numa linha
ali é escolher, não mover). O clique que fecha um arrasto é engolido (`consumeClick`), então soltar
não abre o modal do evento nem, na Semana, o Dia daquela coluna.

`lockTouchScroll` e a rolagem automática na borda da tela saíram de `useGroupSelection` pra
`shared/touchScroll.ts` — os dois arrastos usam as mesmas duas coisas.

## Arquivos

| Onde | O quê |
|---|---|
| `src/domain/eventDrag.ts` | a geometria pura: `minuteAtY`, `yAtMinute`, `fieldAtX`, `grabOffsetMin`, `movedRange`, passo de 5 min |
| `src/application/events.ts` | `moveEvent` (avulso, série "só este dia", série inteira), `canMoveEvents`, `isMovableBlock`, `moveNeedsScope` |
| `src/features/events/useEventDrag.ts` | a máquina de ponteiro, compartilhada pelas duas telas |
| `src/features/events/EventMoveModal.tsx` | `#event-move-scope`: só este dia / toda a série |
| `src/features/plan/EventDragGhost.tsx` | `#drag-ghost`: onde o evento cai, na lista do Dia |
| `src/features/plan/BlockList.tsx` | a alça `.ev-grip`, a linha `.dragging`, os dois conjuntos de handlers na mesma linha |
| `src/features/plan/WeekView.tsx` | blocos arrastáveis, `#wv-ghost`, `data-day-key`/`data-from`/`data-to` nas colunas |
| `src/shared/touchScroll.ts` | `lockTouchScroll`, `edgeScrollStep` (era privado do `useGroupSelection`) |

## Provas

- `tests/eventDrag.test.ts` — 13 casos da geometria (interpolação, vão entre linhas, clamp, passo,
  ponto de pega, o dia sob o ponteiro).
- `tests/application-events.test.ts` — 7 casos de `moveEvent` (avulso no dia e pra outro dia, série
  nos dois escopos, a recusa de trocar o dia da série, dia encerrado, bloco que não se move).
- Smoke **34** (arrastar pela alça no Dia: o fantasma diz o horário, o evento cai lá, o plano se
  refaz, o modal não abre), **35** (a refeição pergunta o escopo; "só este dia" não mexe em amanhã),
  **36** (na Semana, de quarta pra quinta), **37** (a alça com o dedo, sem virar seleção de grupo).
- Suíte inteira verde: **616 unitários** (eram 596), **35 smoke** (eram 31; os números vão até 37),
  `npm run typecheck` limpo.

## O que ficou de fora

- Esticar o evento puxando a borda (mudar a duração). O gesto é o mesmo; falta a alça de borda.
- Arrastar no vazio da Semana pra **criar** evento — o item mais valioso da ideia original.
- Arrastar a ponta da coluna pra mexer nas janelas do dia.
- Desfazer ("mover de volta") — hoje o caminho é arrastar de novo.
