# Pendências

Lista de coisas pra fazer no app. Diferente do `IDEIAS.md` (rabiscos exploratórios), aqui são tarefas concretas com escopo definido — quando o Tomi disser "faça as pendências", o Claude pega esse arquivo, executa item por item, e remove o que ficou pronto.

**Importante (do Tomi):** qualquer item aqui pode estar incompleto, ambíguo ou ter detalhes não capturados. Quando bater dúvida genuína — decisão visual, escopo, tom — **pergunte antes de executar**. Não invente. Mas também não pergunte o óbvio: se a tarefa tá clara, executa direto.

---

> Os itens 1–5 vieram de uma revisão do Claude em 2026-09-03 ("o que falta no projeto?"). O contexto
> e as ideias maiores que saíram da mesma conversa estão no `IDEIAS.md`, seção "Revisão de 2026-09-03".
>
> **Agendado:** uma tarefa do Claude (tarefa agendada do app, `study-pets-revisao-fundacao`) roda em
> 2026-09-04 às 06:00 e implementa os itens 1–5 mais as ideias da revisão que já têm caminho claro
> (sync entre dispositivos, PWA, janela de hoje / dia livre / começar agora, exportar dados), na branch
> `feat/revisao-fundacao`, um commit por item, com plan file e manual de teste em
> `plans/2026-09-04_0600_revisao-fundacao.md`. Ela remove daqui o que concluir.

1. **Bug: desmarcar não persiste no Firestore (save com `merge: true`).**
   `src/infrastructure/firebase/userRepository.ts` salva com `setDoc(ref, doc, { merge: true })`. Merge
   no Firestore é **profundo**: mapa aninhado é mesclado campo a campo, e chave ausente no payload fica
   no servidor. Consequências reais: desmarcar um check (`delete day[block.time]` em
   `application/checks.ts`) some do `state`, mas o Firestore mantém — no reload o check volta, e quando o
   dia fecha vira XP e moeda que não foram ganhos. Mesmo efeito ao apagar o **último** evento avulso de
   um dia (`delete state.events[dateKey]`) e o último grupo (`delete state.groups[dateKey]`). O modo
   memória faz merge **raso** no topo, por isso teste e e2e nunca pegam; o comentário em
   `infrastructure/memory/userRepository.ts` ("equivale a substituir campo a campo no nível de cima")
   descreve o que a gente queria, não o que o Firestore faz.
   Escopo: (a) `setDoc(ref, doc)` **sem** merge — `serializeState` já monta o documento inteiro, então
   substituir é o comportamento certo (campos legados como `skills` do v1 caem fora, e é isso mesmo:
   já foram migrados pra dentro das instâncias na leitura); (b) o repositório em memória passa a
   substituir o doc inteiro também, pra ter a mesma semântica; (c) atualizar o comentário da porta em
   `ports.ts` ("Salva com merge — campos não enviados são preservados" deixa de ser verdade) e o do repo
   em memória; (d) teste de contrato em `tests/memory-infra.test.ts`: salvar doc com
   `checks: { d: { "09:00": … , "10:00": … } }`, salvar de novo só com `"10:00"`, `load` devolve sem o
   `"09:00"`. Não dá pra limpar automaticamente checks fantasmas que já existam no doc do Tomi (são
   indistinguíveis de checks reais); se ele quiser conferir, o `scripts/backup-firestore-console.js`
   baixa o doc.

2. **Timer: reconciliar ao voltar pra aba + Wake Lock no foco.**
   O único `setInterval` do timer (`application/timer.ts`) é estrangulado em aba de fundo (Chrome:
   1×/min) e congela com o celular travado — o fim do bloco pode passar sem som, sem check no foco, sem
   emenda. Escopo: (a) um listener de `visibilitychange` (registrado uma vez, no padrão do `startSession`)
   que, ao voltar pra visível com `derived.timerBlock` rodando e `timerProgress(...).done`, chama o mesmo
   caminho de fim que o intervalo chama — se mais de um bloco passou enquanto estava fora, a emenda
   resolve um por vez (cada `runBlock` cai no `done` de novo); (b) Screen Wake Lock enquanto
   `derived.focusOpen` for true: `infrastructure/wakeLock.ts` (pede `navigator.wakeLock.request('screen')`,
   solta ao fechar, re-pede no `visibilitychange` porque o browser solta sozinho ao esconder a página;
   sem a API, no-op), chamado em `runBlock`/`closeFocus`/`stopTimer`/`finishTimer`. O celular deixa de
   travar no meio do pomodoro, que é o caso mais comum. Teste de domínio não muda; teste de aplicação
   pro (a) com `vi.useFakeTimers` e `document.dispatchEvent(new Event('visibilitychange'))` se o ambiente
   tiver DOM, senão só o caminho de reconciliar exposto como função pura testável
   (`reconcileTimer(now)`).

3. **Editar evento (avulso e série inteira).**
   Hoje editar é apagar e criar de novo. Escopo: o modal que abre ao tocar num evento
   (`features/events/EventDeleteModal.tsx`) ganha um botão "Editar", que abre o `EventPanel` **em modo
   edição** com os campos preenchidos (nome, início, fim, "conta como estudo"; pra série, também os dias,
   a frequência e o "até"). Salvar chama casos de uso novos em `application/events.ts`: `updateEvent(dateKey,
   oldStart, input)` (substitui no `state.events[dateKey]`) e `updateSeries(seriesId, input)` (mantém
   `id`, `anchor` e `exceptions`; troca o resto). Validação e toast "Plano reajustado" reaproveitam
   `validateEvent`/`validateSeries` e `commit`. Testes em `tests/application-events.test.ts`. **Fora do
   escopo**: editar só uma ocorrência da série (o caminho continua sendo "Só este dia" + criar avulso; se
   virar dor, entra depois). Textos novos em `strings.ts`; ids novos = atualizar o e2e se ele tocar no modal.

4. **Error boundary no React.**
   Um erro de render hoje vira tela preta sem mensagem. Escopo: `src/app/ErrorBoundary.tsx` (class
   component — é o único jeito de pegar erro de render), envolvendo `<App/>` em `main.tsx`. Mostra uma
   tela mínima no padrão do app: "Algo quebrou" + o `error.message` em `<pre>` pequeno + botão
   "Recarregar" (`location.reload()`), textos em `strings.ts`. `console.error` do erro e do
   `componentStack`. Não tenta recuperar estado — recarregar já reidrata do Firestore.

5. **Cache offline do Firestore.**
   Sem rede, `getDoc` falha, sai o toast de erro e o app fica com estado vazio. Escopo: em
   `infrastructure/firebase/userRepository.ts`, trocar `getFirestore(app)` por
   `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`
   (Firebase 10.x). Com isso `load` volta do IndexedDB quando o servidor não responde, e o `setDoc` feito
   offline fica na fila e sobe ao reconectar. Efeito colateral honesto: a promise do `setDoc` só resolve
   com o ack do servidor, então o indicador fica em "Salvando…" até voltar a rede — é informação
   correta, não mexer. Conta nova offline continua falhando (não tem o que cachear); o toast já cobre.
   Nada muda no modo memória. Validar em `npm run dev` desligando a rede no DevTools: reload mostra os
   dados, um check feito offline aparece no Firestore depois de religar.

---

## Como esse arquivo deve crescer

- Adicionar itens numerados com escopo claro — tem que ser executável sem volta pra perguntar.
- Quando virar plan grande (>1h de trabalho), copiar pra `plans/YYYY-MM-DD_HHMM_slug.md` e deixar só uma linha aqui apontando.
- **Remover** o item quando concluído (não deixar histórico — o git tem isso).
- Items abandonados também podem ser removidos. Tudo bem.
