# Pendências

Lista de coisas pra fazer no app. Diferente do `IDEIAS.md` (rabiscos exploratórios), aqui são tarefas concretas com escopo definido — quando o Tomi disser "faça as pendências", o Claude pega esse arquivo, executa item por item, e remove o que ficou pronto.

**Importante (do Tomi):** qualquer item aqui pode estar incompleto, ambíguo ou ter detalhes não capturados. Quando bater dúvida genuína — decisão visual, escopo, tom — **pergunte antes de executar**. Não invente. Mas também não pergunte o óbvio: se a tarefa tá clara, executa direto.

---

## 1. Pausa curta sobrepõe o evento seguinte

Bug antigo, achado na Fase 3 da migração (não foi introduzido por ela). Quando um pomodoro
termina **exatamente** no horário em que um evento começa, o gerador emite a pausa curta por
cima do evento. Exemplo real: janela 09:00–11:00, pomo 30, pausa 5, evento 10:00–10:20 →

```
09:30-10:00 estudo
10:00-10:05 pausa    ← sobrepõe
10:00-10:20 event
10:20-10:50 estudo
```

Está travado por um teste de caracterização em `tests/planner.test.ts` ("comportamento herdado")
que documenta o comportamento atual. Consertar = mudar `generateBlocks` em `src/domain/planner.ts`
pra não emitir a pausa quando ela invadiria o próximo bloqueio, e **atualizar aquele teste** pra
descrever o comportamento novo.

Decisão pendente do Tomi: nesse caso a pausa deve simplesmente sumir (indo direto pro evento), ou
encolher até o início do evento?

---

## Como esse arquivo deve crescer

- Adicionar itens numerados com escopo claro — tem que ser executável sem volta pra perguntar.
- Quando virar plan grande (>1h de trabalho), copiar pra `plans/YYYY-MM-DD_HHMM_slug.md` e deixar só uma linha aqui apontando.
- **Remover** o item quando concluído (não deixar histórico — o git tem isso).
- Items abandonados também podem ser removidos. Tudo bem.
