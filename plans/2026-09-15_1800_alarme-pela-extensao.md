# O fim do bloco pela extensão

**Data:** 2026-09-15, 18:00 · **Branch:** `feat/alarme-pela-extensao` · **Extensão:** 0.2.0 → 0.3.0

## A dor

O Tomi, no meio de uma conversa sobre "virar extensão" e "virar app de celular", parou e
disse o que importava agora: *"tava estudando e não sabia que o timer tinha acabado"*. O app
estava aberto, mas em outra aba. Ele perguntou se o som era possível no site, e se não, se
dava pra fazer "temporariamente com aquela mini extensão".

## O diagnóstico

O app já toca som e manda notificação do navegador no fim do bloco (`finishTimer`, em
`application/timer.ts`). O que falha é o **canal**: o fim é descoberto por um `setInterval`
de 1 s na página, e uma página em segundo plano no Chrome/Edge é

1. **estrangulada** — depois de 5 min escondida, um tique por minuto (o aviso sai, até um
   minuto atrasado);
2. **congelada** — timers parados; o aviso sai quando a aba volta (`onVisible`);
3. **descartada** — o economizador de memória do Chrome e as "abas dormindo" do Edge
   descarregam a aba inteira. O timer é runtime (`derived.timerBlock`, não persistido): some
   junto. Ninguém avisa nada, e ao clicar na aba o app recarrega sem timer. **É o que casa
   com "não sabia que tinha acabado".**

Somam-se duas coisas fora do app: a permissão de notificação nunca concedida (a seção
"Sons e notificações" mostra), e o Focus Assist do Windows escondendo notificações.

Não existe API de página que agende um aviso pra daqui a 25 min sobrevivendo ao descarte
(Notification Triggers morreu na origin trial; Periodic Background Sync é de horas e
imprecisa). O service worker da extensão tem `chrome.alarms`, que dispara na hora em
qualquer um dos três estados — e a extensão **já tinha** um alarme pro fim do bloco, só
que só pra soltar as regras do bloqueio.

## O que foi decidido

- **A extensão vira o despertador, sem virar o timer.** O relógio continua no app. O app
  publica "avise às 10:25 com este título, este som, neste volume" e a extensão só avisa.
  Mover o timer inteiro pro service worker (o "tier 2" da conversa) é outra semana e mexe
  em `timer.ts`, `pause.ts`, `hardcore.ts` e `siteBlock.ts`; isto resolve a dor com uma
  fração disso, e o mesmo canal serve depois se o timer for pra lá.
- **Projeção do store, não uma chamada por transição.** `timerAlarm.ts` escuta `subscribe`
  e publica quando a assinatura muda. Todas as transições do timer já chamam `notify()`;
  uma transição nova não tem como esquecer de avisar a extensão. Custo: um `JSON.stringify`
  pequeno por `notify()` — sem `blocksForDay`, sem nada pesado.
- **Quem avisa é um só.** Sem isso, a aba viva-mas-escondida tocaria duas vezes (a extensão
  na hora, o app até um minuto depois). O ack da extensão (`{ armed, endsAt }`) mais
  `document.hasFocus()` decidem no app; `windows.getLastFocused().focused` mais a aba ativa
  decidem na extensão. Os dois lados olham a mesma pergunta ("o app está em frente?") por
  APIs diferentes, e discordam só se a pessoa trocar de aba no segundo exato do fim.
- **O texto e o som vêm prontos do app.** `strings.timer.notification` e `soundForBlock` /
  `'sucesso'` continuam sendo a única fonte; a extensão não tem vocabulário próprio.
  `alarm.js` é um porte dos quatro sons de `sounds.ts` — duplicação assumida e comentada
  nos dois lados, porque a extensão não tem build e um service worker não tem Web Audio.
- **Nunca perde, nunca dobra.** Três amarras no `background.js`: o fim vencido e ainda
  guardado é avisado na mensagem seguinte ANTES de o `alarms.create` substituir o alarme
  (o app em frente termina o bloco 1 s depois do fim e já manda o seguinte); o disparo
  atrasado de um alarme substituído é ignorado por `scheduledTime`; e um `Set` dos fins já
  avisados segura alarme e mensagem chegando juntos.
- **Recarregar não desarma.** A mesma regra do `stopped` x `unknown` do bloqueio: uma carga
  da página que nunca armou nada não publica `running: false`, e à pergunta da extensão só
  responde se tem timer. É o caso da aba descartada que voltou — o app não sabe mais do
  timer, a extensão sabe, e avisa.
- **Pausado não há alarme.** O fim é desconhecido; retomar publica o fim ajustado
  (`derived.timerEndsAt`), e o ack antigo deixa de valer (o app só confia no ack do que
  publicou por último).

## O que ficou de fora

- **Persistir o timer no dispositivo** (como a pausa e o hardcore já são). Resolveria a
  *continuidade* depois do descarte — o foco voltar sozinho, o check automático —, não o
  aviso. Mexe no invariante "reload perde o timer" que o `unknown` do bloqueio assume.
  Próximo passo se o descarte se mostrar frequente na máquina do Tomi.
- **Um caso no `npm run test:ext`.** A página offscreen e o `chrome.notifications` só se
  provam num Chromium de verdade, e o test:ext nesta máquina só roda de madrugada. A prova
  é na máquina dele: ↻ na extensão, recarregar a aba, começar um estudo, trocar de aba.
- **Trazer a aba do app à força no fim do bloco.** A notificação traz no clique; roubar o
  foco do PDF no meio de uma frase seria o app se impondo.
- **Aviso no INÍCIO de um bloco aberto em espera** ("começa em 3 min"). Só o fim.

## Os arquivos

App: `src/infrastructure/extensionBridge.ts` (`TimerPayload`, `publishTimer`, `onTimerAck`),
`src/application/timerAlarm.ts` (novo), `src/application/timer.ts` (`alarmDelegated` no
`finishTimer`), `src/application/session.ts` (`watchTimerAlarm` no boot).
Extensão: `manifest.json` (0.3.0, `notifications`, `offscreen`), `content.js` (o relay),
`background.js` (o alarme, o aviso, o clique, o acordar), `rules.js`/`rules.d.ts` (os
ajudantes puros), `alarm.html`/`alarm.js` (novos), `popup.html/js/css` ("⏰ Avisa às…").
Testes: `tests/application-timerAlarm.test.ts` (novo), `extension-background`,
`extension-content`, `extension-rules`; e2e 70.
