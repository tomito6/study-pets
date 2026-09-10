# Importar calendário (.ics): a grade do semestre entra sem ser digitada

**Branch:** `feat/importar-calendario` (a partir de `feat/pausar-sessao`, 5075e4c)
**Quando:** 2026-09-10, manhã, sessão do Mac da noite
**Merge é decisão do Tomi.**

## O pedido

> "No calendário semanal que o usuário possa importar calendários de outros aplicativos. Sabe ele
> possa baixar do outlook, google calendar ou alguma outra coisa. Isso eh fazivel. Tudo que eh
> importado seria botado como evento"

Sim, e "tudo vira evento" é o encaixe certo: o modelo de eventos do app (avulso + série com
`weekdays`/`freq`/`until`/`exceptions`) já cobre quase tudo que uma grade de aulas usa.

## A escolha da via: upload, não assinatura

Três caminhos existiam, e a diferença de custo entre eles é grande:

| Via | Custo | Veredito |
|---|---|---|
| **Arquivo .ics** (upload) | Parser puro no domínio. Zero backend. | **Feito.** |
| URL secreta de assinatura | CORS bloqueia o fetch do browser → precisaria de uma função serverless na Vercel: o **primeiro backend próprio** do app (hoje só Firebase). | Depois, se doer reexportar. |
| OAuth + Google Calendar API | Sync de verdade, mas escopo sensível: verificação do Google (semanas, política de privacidade) pra abrir pra outros estudantes. | Longe. |

O upload pega ~80% do valor. E o parser fica pronto e testado: se um dia a assinatura entrar, falta
só a parte de buscar. O .ics também é universal — Google, Outlook, Apple e TUMonline exportam o mesmo
formato, então uma implementação atende todos.

## As decisões que custaram mais que o parsing

**O horizonte começa hoje.** Um .ics de semestre carrega agosto junto. Importar o passado mexeria em
dias já fechados — não é importar, é reescrever histórico. Vai de hoje até o `periodEnd`, ou um ano.
Consequência boa: a **âncora** da série é a primeira ocorrência que entra, o que preserva a paridade
da quinzenal (uma série que começou em 13/08 e cai em 10/09 continua caindo nas semanas certas) sem
trazer o passado.

**XP é escolha, não suposição.** O .ics não distingue aula de consulta médica, e o `countsAsStudy`
decide se o evento dá XP e moedas. Padrão `false` (só reserva o tempo) porque XP inflado corrompe
stats e economia pra sempre, e reservar tempo é sempre seguro. O botão "✦ XP" liga a grade inteira
num clique — o caso real (importar 8 aulas que todas contam) custa um clique, não oito.

**Reimportar substitui.** Cada item entra carimbado com `externalId = ics:<UID>`, e aplicar começa
apagando o que tem o mesmo carimbo. Sem isso, importar o .ics atualizado do semestre duplicaria tudo.
Evento digitado à mão não tem carimbo, então nenhuma importação encosta nele; e importar um segundo
calendário não apaga o primeiro (o dedupe é por UID, não "tudo que é importado"). Campo opcional,
sem migração — `events`/`eventSeries` já passam inteiros por `hydrateUserDoc`, então `schemaVersion`
continua 4.

**Nada entra sem revisão.** Calendário pessoal é cheio de aniversário e feriado. A revisão mostra uma
linha por compromisso com o que o app entendeu da repetição ("Ter, Qui · toda semana · 27 vezes · até
15/12"), o que ficou de fora agrupado por motivo, e o botão diz quantos compromissos entram.

**Série quando dá, datas quando não dá.** `WEEKLY` (interval 1 ou 2), `DAILY` e `MONTHLY` simples
viram série do app. O resto (a cada 3 semanas, "terceira quinta do mês", anual) vira lista de datas,
expandida na leitura — não é perdido nem torto.

## Os dois bugs que a verificação pegou

Nenhum dos dois apareceria num teste feliz; os dois põem compromissos em dia errado.

**`UNTIL` é um instante, não uma data.** `UNTIL=20261215T235959Z` vira 16/12 em qualquer fuso a leste
de Greenwich — e uma série diária ganharia um dia a mais. Consertado derivando o `until` da **última
ocorrência de verdade**, o que de quebra fez `COUNT` caber na série (antes forçava expansão).

**`BYDAY=3TH` não é "todo dia 17".** A primeira versão usava o dia do mês da primeira ocorrência, e
"terceira quinta" caía em 17/10, 17/11… O expansor agora lê a posição (inclusive negativa: `-1FR` é
a última sexta). Só apareceu porque eu olhei as datas na tela, uma a uma.

**Fuso** foi resolvido de saída, não como bug: `TZID`/UTC viram horário local na leitura (`Intl`
acha o deslocamento, duas passadas por causa do horário de verão). O app é local em todo lugar, e uma
aula das 10h em Munique chegaria às 8h sem isso.

## O que ficou de fora, conscientemente

- **Assinatura por URL / sync ao vivo** — o custo está na tabela acima.
- **"Apagar tudo que veio da importação"** — dá pra apagar evento por evento, como qualquer outro. Um
  botão de "desfazer importação" só se doer.
- **Escolher calendários dentro de um arquivo com vários** — a revisão já deixa desmarcar linha a linha.
- **Evento de dia inteiro** — sem horário, bloquearia o dia todo. Fica de fora, com o motivo na tela.
- **Lembrete de duração zero** — sem `DTEND` nem `DURATION`, não é bloco.

## Prova

`tests/ics.test.ts` (27) cobre o formato (linha continuada, escape, VALARM aninhado), data e hora
(UTC, TZID, flutuante, DURATION, meia-noite), o que fica de fora com motivo, a recorrência que vira
série — inclusive um teste que **passa a série importada pelo expansor do app** e confere as datas —,
a que não vira, e `RECURRENCE-ID`. `tests/application-calendarImport.test.ts` (15) cobre o caso de
uso: carimbo, dedupe ao reimportar, "não encosta no que foi digitado à mão", e o ciclo de persistência.
Smoke **39** faz o caminho inteiro num navegador de verdade, com `setInputFiles`.
