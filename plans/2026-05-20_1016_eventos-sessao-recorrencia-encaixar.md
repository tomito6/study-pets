# Plano: eventos como sessão, recorrência, feedback de auto-ajuste e botão "Encaixar estudo"

## Contexto

O Tomi quer reduzir a fricção entre o plano gerado e a vida real. Hoje:
- Eventos viram blocos laranjas, mas ficam "fora" do conceito de sessão — não se integram visualmente ao ritmo do dia.
- Cada evento precisa ser cadastrado um dia de cada vez (aulas semanais viram repetição manual chata).
- Quando o usuário muda config/evento, o plano regenera silenciosamente (sem feedback de "o que mudou").
- Encaixar pomodoros + pausas dentro de janelas de tempo livres (start, end, almoço, eventos) é mental — não tem um "calcula pra mim".

Vamos atacar 4 frentes (DnD foi pulado conscientemente — #3 + #5 resolvem 80% do que DnD entregaria, sem o risco de quebrar o paradigma `checks-por-horário`).

**Ordem recomendada de execução**: 1 → 4 → 3 → 5.
Motivo: 1 e 4 são pequenos e independentes (entregam valor rápido); 3 muda o schema e precisa estar estável antes do 5 expandir múltiplos eventos recorrentes nos cálculos do encaixador.

---

## Feature 1 — Eventos como sessão colorida

### O que muda
Hoje o bloco de evento (`type:'event'`) é gerado em [index.html:1541-1551](index.html#L1541-L1551), incrementa `sessionN++` depois dele, mas **não recebe `session: sessionN`** no próprio objeto. Visualmente fica laranja (`.event-row`) sem cor de sessão.

Vamos atribuir uma sessão ao evento e renderizá-lo como `session-block`, mas mantendo um diferencial visual claro (não pode confundir com bloco de estudo).

### Implementação
1. Em [generateBlocks](index.html#L1513), na emissão do bloco de evento (linha ~1542), adicionar `session: sessionN` ao objeto. Como `sessionN` é incrementado *depois* da emissão, o evento herda o número da sessão **anterior** — ele encerra ela.
2. Em [renderBlocks](index.html#L3184) (linha ~3220), permitir que o `isEv` também receba `session-block s{idx}`. Manter classe `.event-row` adicional pra diferencial visual.
3. CSS: adicionar uma regra `.block-row.event-row.session-block` com borda **dashed** (`border-style:dashed`) por cima da cor da sessão. Mantém o ícone 📅. Conserva a identidade "isso aqui é evento, não é pomodoro" sem destoar do bloco de sessão ao lado.
4. O label do XP do evento já é `"evento"` (linha 3226) — mantém. Não trocar pra `+0 XP`.
5. **Divider de sessão**: a [session-divider](index.html#L3198-L3209) só é emitida pra blocos `isE || isP` — então não vai aparecer divider duplicado por causa do evento. Não precisa mexer.

### Arquivos a tocar
- [index.html](index.html) (lógica + CSS + render). Replicar em `index_teste.html`.

### Risco
Mínimo. Mudança isolada, sem schema novo.

---

## Feature 4 — Feedback de auto-ajuste

### O que muda
`generateBlocks` já regenera o plano quando config/event muda (via `clearBlockCache()` em [saveSettings/saveEvent/etc.](index.html#L2430)). Falta avisar o usuário do **delta**: "5 blocos viraram 4, fim do dia agora é 18:30".

### Implementação
1. Helper novo `summarizePlanDelta(beforeBlocks, afterBlocks, dateKey)` que compara dois arrays de blocks do mesmo dia e retorna `{ studyDelta, lastEndDelta, dropped }`:
   - `studyDelta`: diff de #blocos de estudo (ex: +1, -2).
   - `lastEndDelta`: diff em min entre o último `endTime` antes/depois.
   - `dropped`: blocos que sumiram (por horário).
2. Capturar snapshot **antes** de mudar config/event nos handlers `saveSettings`, `saveEvent`, `deleteEvent`, `saveLunchEdit`. Após o `clearBlockCache()`/`renderAll()`, calcular o delta **só pro dia atualmente visível** (`dateForWeekDay(state.uiWeek, state.uiDay)`).
3. Toast informativo (reusa [showToast](index.html) já existente): `"Plano reajustado: -1 estudo, termina às 18:15"`. Se delta = 0, não mostra nada.
4. Não bloquear nem pedir confirmação. Só informar. (Princípio "nunca fazer o usuário se sentir mal por mudar o plano".)

### Arquivos a tocar
- [index.html](index.html) — adicionar helper, mexer nos 4 handlers.

### Risco
Mínimo. Camada puramente aditiva sobre o que já funciona.

### Decisão consciente
Sem "preview antes de salvar". Adicionar preview na settings é tentador mas duplica complexidade (já existe `#config-preview` na aba Rotina). Toast pós-save é suficiente e mantém o fluxo direto.

---

## Feature 3 — Eventos recorrentes

### O que muda
Hoje `state.events` é `{ "YYYY-MM-DD": [{name, start, end}] }` — plano. Vamos permitir séries que se expandem em múltiplas datas.

### Schema novo
```js
state.events = {
  // ocorrência única (formato atual, mantido por retrocompat):
  "2026-05-22": [{ name, start, end }],

  // série recorrente: chave especial `__series` no nível do estado
  ...
}

// novo campo paralelo:
state.eventSeries = [
  {
    id: "ser_abc123",          // gerado com Date.now() + random
    name, start, end,           // horário do evento
    weekdays: [1, 3],           // 0=dom ... 6=sáb
    freq: 'weekly' | 'biweekly' | 'monthly',
    anchor: "YYYY-MM-DD",       // primeira ocorrência (pra biweekly calcular paridade)
    until: "YYYY-MM-DD" | null, // fim opcional
    exceptions: ["YYYY-MM-DD"]  // ocorrências deletadas individualmente
  }
]
```

Decisão: **série fica em `state.eventSeries`** (array novo), não dentro de `events`. Mantém `state.events` como "ocorrências avulsas + exceções", sem precisar migrar dados antigos.

### Helper de expansão
`getEventsForDate(dateKey)` retorna a união de:
- `state.events[dateKey] || []` (eventos avulsos do dia).
- Pra cada série em `state.eventSeries`, se `dateKey` cai num dos `weekdays`, está depois de `anchor`, antes de `until` (se houver), bate a paridade da `freq` (weekly = todo match; biweekly = `(daysSinceAnchor / 7) % 2 === 0`; monthly = mesmo dia-do-mês que `anchor`), e **não está em `exceptions`**, emitir `{ name, start, end, _seriesId: id }`.

### Onde chamar
[blocksForDay](index.html#L1635) hoje faz `const events = state.events[dateKey] || []`. Trocar por `const events = getEventsForDate(dateKey)`. Pronto — `generateBlocks` recebe o array expandido e o resto da pipeline (stats, render, focus) continua funcionando.

`forEachDay` em [index.html:1497](index.html#L1497) **não muda** — ele só itera datas. As stats vêm via `blocksForDay(key)` chamado dentro do callback ([index.html:1776](index.html#L1776), [1724](index.html#L1724)).

### UI no painel de evento
Expandir `#event-panel` ([index.html:1040](index.html#L1040)) com:
- Checkbox "Repetir este evento" (default off → mantém comportamento atual).
- Quando ligada, abrir bloco com:
  - Chips de dia da semana (Seg–Dom), múltipla seleção. Pré-seleciona o dia da data atual.
  - Radio: Toda semana / A cada 2 semanas / Mensalmente.
  - Input de data "Até" (opcional, com botão "Sem fim").

`saveEvent()` decide pelo checkbox: salva em `state.events[key]` ou cria entrada em `state.eventSeries` com `anchor: key`.

### Deletar
Quando o usuário clica o ✕ num evento renderizado e ele tem `_seriesId`, abrir modal **centralizado** (conforme [feedback_modais_centralizados](memory)) com 2 opções:
- "Apagar só este dia" → empurra `dateKey` em `series.exceptions`.
- "Apagar toda a série" → remove a série do array.

Eventos sem `_seriesId` deletam direto (comportamento atual).

### Atualização do `clearBlockCache`
O cache key em [generateBlocks](index.html#L1514) é `JSON.stringify({ cfg, events })`. Como `events` agora é o array já expandido pra aquele dia (passa pra `generateBlocks` igual antes), o cache não precisa conhecer séries — continua funcionando.
Mas é preciso chamar `clearBlockCache()` ao mexer em `state.eventSeries` (criar/editar/deletar/exceções).

### Arquivos a tocar
- [index.html](index.html) — schema, helper `getEventsForDate`, UI do evento, modal de deletar.
- CLAUDE.md — atualizar seção "Schema do Firestore" e "Conceitos do app" pra registrar `eventSeries`.

### Risco
Médio. Mudança de schema com retrocompat (eventos avulsos antigos continuam funcionando). Conferir que `applyPendingPetXP`, stats e focus overlay continuam OK — eles só leem `blocksForDay`, então devem ficar transparentes.

---

## Feature 5 — Botão "Encaixar estudo"

### O que faz
Wizard acessível na aba Rotina das Configurações que pergunta preferências e sugere 2-3 configurações `{pomo, shortBreak, longBreak}` otimizadas pros horários livres do dia.

### Fluxo
1. Botão novo na aba "Rotina" do `#settings-panel`: **"🎯 Encaixar estudo nos meus horários"** (acima do field-group de Pomodoro).
2. Click abre modal centralizado `#fit-study-panel` com inputs:
   - Pomodoro ideal: range 20–60 min (default 25).
   - Pausa curta ideal: range 3–15 min (default 5).
   - Pausa longa ideal: range 15–45 min (default 20).
   - Aceito flexibilidade de: ±5 / ±10 / ±15 min (default ±10).
3. Botão "Calcular" → roda o algoritmo, mostra 3 sugestões em cards:
   ```
   ✨ Sugestão 1 (recomendada)
   Pomo 25 · Pausa 5 · Longa 20
   → 8 estudos · 3h20 efetivos · termina às 18:00
   [Aplicar]
   ```
4. Aplicar = sobrescreve `state.config.pomo/shortBreak/longBreak`, fecha modal, `clearBlockCache()`, `renderAll()`, mostra toast.

### Algoritmo
1. Calcular janelas livres do dia: `[start, end]` cortado por almoço e por **eventos do dia visível** (usa `getEventsForDate` já que #3 estará pronto).
2. Gerar combinações dentro da flexibilidade declarada: variar `pomo` em passos de 5min, `shortBreak` em passos de 1min, `longBreak` em passos de 5min. Cap em ~30 combinações pra rodar rápido (single-thread, JS).
3. Pra cada combinação, simular `generateBlocks(combo, events)` (já existe e é barato graças ao cache).
4. Score cada resultado por:
   - **+** min totais de estudo (peso 1.0).
   - **+** menos sobra no fim do dia (peso 0.3).
   - **+** proximidade aos valores "ideais" do usuário (peso 0.5 — penaliza desvio).
   - **−** se acabar mid-pausa por bater no fim (já evitado por `generateBlocks`, mas double-check).
5. Top 3 únicos. Mostrar.

### Por que não é difícil
`generateBlocks` já é o "encaixador". Esse wizard é só um **buscador** que roda ele com várias combinações e escolhe as melhores. Sem lógica nova de scheduling, só ranking.

### Decisão consciente
Não mexer em `start`/`end`/`lunch` automaticamente. O wizard mexe **só nos parâmetros do pomodoro**. Horários do dia são contrato sagrado do usuário — se ele disse "começo às 9", a gente respeita.

### Arquivos a tocar
- [index.html](index.html) — modal novo, função `fitStudy()`, integração com settings.
- CLAUDE.md — adicionar "Botão Encaixar estudo" na seção "Conceitos do app".

### Risco
Baixo-médio. Toda a lógica é em memória, sem mudar schema. Risco real é UX (3 sugestões podem ser confusas — começar com 1 só + "ver alternativas" se feedback do uso pedir).

---

## Verificação end-to-end

Sempre testar em `index_teste.html` antes de commitar. Cada feature tem seu próprio passo de verificação:

### Feature 1
- Criar evento das 14:00–15:00. Plano deve mostrar o bloco do evento com cor da sessão anterior + borda dashed.
- Verificar que o XP label "evento" continua aparecendo.
- Verificar que a session-divider seguinte aparece (sessão N+1 começa após o evento).

### Feature 4
- Mudar `cfg.end` de 18:00 pra 17:00 → toast "Plano reajustado: -1 estudo, termina às 16:55".
- Criar evento no meio do dia → toast com delta.
- Mudar config sem efeito real (ex: `pomo` 25→25) → sem toast.

### Feature 3
- Criar evento "Aula Mate" recorrente toda Seg/Qua, sem data fim → navegar pelas próximas 4 semanas e ver o evento em todas as segundas/quartas.
- Apagar uma ocorrência → ver que só aquela some, outras continuam.
- Apagar a série → ver que todas somem.
- Stats: `dayStudyPlanned` deve refletir os dias com o evento (menos minutos planejados).
- Recarregar app (Firestore round-trip): séries persistem.

### Feature 5
- Abrir wizard com `start=09:00, end=18:00, almoço=13:00 60min` → ver 3 sugestões plausíveis.
- Aplicar uma → settings atualiza, plano regenera, toast confirma.
- Wizard com flex ±5 → ver sugestões próximas ao default.

---

## Arquivos críticos (rota de modificação)

- [index.html](index.html) — todas as features mexem aqui (HTML, CSS, JS no `<script>` único).
- `index_teste.html` — espelho local de teste, sempre replicar conforme [CLAUDE.md](CLAUDE.md).
- [CLAUDE.md](CLAUDE.md) — atualizar seções "Conceitos do app", "Schema do Firestore", "Sistema de eventos" no fim de cada feature implementada.

## Funções/helpers existentes a reusar

- [generateBlocks](index.html#L1513) — núcleo do encaixador, usado pela feature 5.
- [forEachDay](index.html#L1497) — iteração de datas (não muda com séries).
- [blocksForDay](index.html#L1635) — ponto único de entrada onde a expansão de séries entra.
- [renderBlocks](index.html#L3184) — render dos blocos (feature 1 mexe aqui).
- [saveEvent](index.html#L2518), [deleteEvent](index.html#L2536) — features 3 e 4 estendem.
- [showToast](index.html) — feedback (feature 4).
- [closeIfOutside](index.html) — padrão de modais centralizados.

## Ideias em consideração (não implementar ainda)

- **Objetivo/nome customizado por sessão**: dar ao usuário a opção de renomear uma sessão (ex: "Análise II", "Revisão Geometria") em vez do nome implícito "Sessão 2". Aplicar **na sessão grande** preferencialmente; mini-estudos (gaps) talvez também — a decidir. O Tomi ainda tá pensando no formato (renomear no plano? modal? define antes ou no momento?). Pra registrar a intenção de propósito — saber **o que** vai estudar naquela sessão, não só **que** vai estudar.
- **Tempo customizado por sessão específica**: usuário pode alterar a duração de um pomo individual (ex: "esse aqui quero que seja 30min em vez dos 25 padrão"). Override pontual sem mudar a config global. A decidir: editar inline no plano? Modal? Onde guardar (state.checks já tem chave por horário — podia caber `overrideDur`)? Como o algoritmo de generateBlocks reage (recalcula a cadeia)? Pode interagir com horários de eventos/almoço e causar shift. Útil quando o usuário sabe que vai precisar de mais tempo num bloco específico.
- **"Encaixar estudo" por janela separada**: hoje o wizard sugere uma única config `{pomo, shortBreak, longBreak}` que vale pra todas as janelas. Permitir o usuário rodar o wizard por janela individual — ex: janela manhã (8-12) com pomos de 25min, janela tarde (15-20) com pomos de 50min. Implicaria override de pomo/short/long por janela (`studyWindows[i].pomo?`, etc), e `generateBlocks` usaria esses overrides quando presentes, caindo nos defaults globais quando ausentes. UX: cada card de janela ganha um botão "🎯 Encaixar nesta" que abre o wizard escopado nela. Útil pra quem tem energia diferente em horários diferentes.
- **Janelas de estudo por dia da semana**: hoje `studyWindows` é uma lista única que vale pra todo dia. Permitir override por weekday — ex: segunda tenho aula 8-10, só estudo 10:30-12 e 14-18; quarta tô livre 9-12 e 15-20; sexta só de manhã. Caso real: hoje o usuário cria evento vazio pra bloquear, o que é hack. Schema candidato: `studyWindowsByDay: { 0: [...], 1: [...], ... 6: [...] }` + `studyWindows` como default pra dias sem override (retrocompat). UI: aba Rotina ganha seletor "Aplicar a: [todos os dias ▼] / [seg, qua, sex] / [só sex]" ou um modo "personalizar por dia". `blocksForDay` lê windows do weekday correto. Vale 1 sessão dedicada — não esticar dentro de outro escopo.

## Decisões adiadas conscientemente

- **DnD**: pulado. Reavaliar depois de 3+5 estarem em uso por algumas semanas.
- **Eventos recorrentes mensais no estilo "primeira segunda do mês"**: só mensal por dia-do-mês fixo (anchor). Padrões complexos depois.
- **Múltiplas sugestões "guardadas" no wizard**: aplicar uma é destrutivo. Manter histórico de configs anteriores fica pra depois (ou só usar undo nativo do Firestore restore).
