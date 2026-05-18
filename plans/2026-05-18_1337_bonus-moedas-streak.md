# Bônus diário de moedas + nova regra de streak

## Context

Hoje o sistema de moedas é raso: cada bloco de estudo concluído vale **1 moeda fixa**, independente da duração — então um pomo de 15min vale o mesmo que um de 60min, o que desmotiva esforço maior. E o streak conta qualquer dia com pelo menos 1 check (estudo OU pausa), o que infla o número sem refletir esforço real.

O Tomi quer transformar isso em algo que recompense **tempo de estudo de verdade** e **consistência**:

1. **Moeda por bloco** vira proporcional ao tempo do pomo, com multiplicador crescente pra pomos longos (premia foco prolongado).
2. **Bônus diário** em cima disso, escalando por faixas de streak (3, 7, 14, 30 dias) — torna a sequência tangível.
3. **Streak** passa a exigir um **mínimo diário de estudo** (default 60min, **configurável** pelo usuário em Configurações → Geral) — uma pausa solta de 5min não basta pra contar como "dia estudado".

Resultado esperado: saldo de moedas significativamente maior e mais expressivo do esforço; streak fica mais "honesto" e premia consistência real, não atividade simbólica. Como moedas e streak hoje **não são persistidos no Firestore** (recomputados dos `checks` toda sessão), a mudança é retroativa sem migração — não precisa apagar nada.

## Critical files

- [index.html](index.html) — única fonte de verdade (versão deployada)
- [index_teste.html](index_teste.html) — espelhar todas as mudanças

---

## 1. Nova constante: faixas do bônus

Adicionar logo após `DEFAULT_CFG` (em volta de [index.html:838](index.html#L838)):

```js
// Faixas do bônus diário por dia de streak. Ordem decrescente (do maior pro menor).
const DAILY_BONUS_TIERS = [
  [30, 25],  // dia 30+:    +25 moedas
  [14, 18],  // dia 14-29:  +18
  [7,  12],  // dia 7-13:   +12
  [3,  8],   // dia 3-6:    +8
  [1,  5],   // dia 1-2:    +5
];

function dailyBonusForStreak(streakDay) {
  for (const [min, coins] of DAILY_BONUS_TIERS) {
    if (streakDay >= min) return coins;
  }
  return 0;
}
```

## 2. Nova função: moedas por bloco

Adicionar perto de `DAILY_BONUS_TIERS`. Formula: **1 moeda por minuto**, com multiplicador escalando por duração do pomo.

```js
function coinsForStudyBlock(pomoMins) {
  let mult = 1.0;
  if (pomoMins > 120) mult = 3.0;
  else if (pomoMins > 90) mult = 2.5;
  else if (pomoMins > 60) mult = 2.0;
  else if (pomoMins > 30) mult = 1.5;
  return Math.round(pomoMins * mult);
}
```

Tabela de referência (pra documentar no commit):
- 25min → 25 moedas
- 30min → 30 moedas
- 45min → 68 moedas (45 × 1.5)
- 60min → 90 moedas (60 × 1.5)
- 90min → 180 moedas (90 × 2.0)
- 120min → 300 moedas (120 × 2.5)

> Nota: blocos esticados pelo gap-fill (último estudo do dia pode passar de `pomo`) ainda contam como `state.config.pomo` minutos. É a convenção já existente em `stats.studyMins` ([index.html:1186](index.html#L1186)) — manter pra evitar mudança colateral.

## 3. Novo campo de config: `dailyStudyMin`

Em `DEFAULT_CFG` ([index.html:834-838](index.html#L834-L838)), adicionar:

```js
const DEFAULT_CFG = {
  start:'09:00', lunch:'13:00', lunchDur:60, end:'18:00',
  pomo:25, shortBreak:5, longBreak:20, hasLunch:true,
  periodStart: null, periodEnd: null, skipWeekends: false,
  dailyStudyMin: 60,   // minutos de estudo/dia pra contar pro streak e ganhar bônus
};
```

Como o `loadData` usa `{ ...DEFAULT_CFG, ...(d.config || {}) }` ([index.html:1259](index.html#L1259)), usuários antigos pegam `dailyStudyMin: 60` automaticamente. Sem migração.

## 4. Refatorar `computeStats` ([index.html:1145-1209](index.html#L1145-L1209))

Mudanças:

a) Adicionar `dayStudyMins: {}` ao objeto `stats` inicial (linha ~1158).

b) Dentro do `forEachDay`, **manter um contador de streak corrido** entre iterações (declarar `let runningStreak = 0;` fora do callback do `forEachDay`).

c) Substituir o `stats.coins++` na linha 1185:

```js
// ANTES
if (b.type === 'estudo') {
  stats.coins++;
  stats.studyMins += state.config.pomo;
}

// DEPOIS
if (b.type === 'estudo') {
  stats.coins += coinsForStudyBlock(state.config.pomo);
  stats.studyMins += state.config.pomo;
  dayStudyMins += state.config.pomo;   // nova var local do dia
}
```

> Declarar `let dayStudyMins = 0;` junto com `dayXP`/`dayChecks` na linha 1166.

d) Após o `blocks.forEach` (antes de `stats.dayCheckCounts[key] = dayChecks`), atualizar streak corrido e dar bônus:

```js
stats.dayStudyMins[key] = dayStudyMins;
if (dayStudyMins >= state.config.dailyStudyMin) {
  runningStreak++;
  stats.coins += dailyBonusForStreak(runningStreak);
} else {
  runningStreak = 0;
}
```

> Como `forEachDay` itera cronologicamente e pula fins de semana quando `skipWeekends=true`, o `runningStreak` se comporta corretamente: sexta→segunda vira streak contínuo sem reset (igual à lógica atual em `calcStreaks`).

## 5. Refatorar `calcStreaks` ([index.html:1212-1229](index.html#L1212-L1229))

Trocar a regra de "dia teve check" pra "dia teve estudo suficiente":

```js
function calcStreaks(dayStudyMins) {
  const today = dk(new Date());
  const minMins = state.config.dailyStudyMin;
  let cur = 0, best = 0, temp = 0;
  const allKeys = [];
  forEachDay(key => allKeys.push(key));
  allKeys.forEach(k => {
    if ((dayStudyMins[k] || 0) >= minMins) { temp++; if (temp > best) best = temp; }
    else temp = 0;
  });
  const idx = allKeys.indexOf(today);
  if (idx >= 0) {
    for (let i = idx; i >= 0; i--) {
      if ((dayStudyMins[allKeys[i]] || 0) >= minMins) cur++;
      else break;
    }
  }
  return { cur, best };
}
```

E na chamada em `renderAnalytics` ([index.html:2061](index.html#L2061)):

```js
// ANTES: const { cur, best } = calcStreaks(stats.dayCheckCounts);
// DEPOIS:
const { cur, best } = calcStreaks(stats.dayStudyMins);
```

> Consequência: usuários com streak alto baseado em "qualquer check" vão ver o número **cair** pro real (só dias com ≥ `dailyStudyMin` minutos de estudo). Foi a escolha do usuário ("Streak inteiro adota a regra"). O `dayCheckCounts` pode ser removido se não for usado em nenhum outro lugar — verificar antes.

## 6. UI: input em Configurações → Geral

No `<div data-tab-content="general">` ([index.html:547-569](index.html#L547-L569)), entre o `field-group` do período e a `danger-zone`, adicionar:

```html
<div class="field-group">
  <label>Mínimo diário de estudo</label>
  <div class="field-sublabel">Quantos minutos por dia precisa estudar pra contar o streak e ganhar o bônus de moedas.</div>
  <input type="number" id="cfg-daily-study-min" min="15" max="240" step="15">
</div>
```

> Reaproveitar classes `.field-group`/`.field-sublabel` que já existem no projeto.

## 7. Wire-up das funções de Settings

a) `openSettings` (perto de [index.html:1533](index.html#L1533)) — popular o campo:
```js
document.getElementById('cfg-daily-study-min').value = state.config.dailyStudyMin;
```

b) `saveSettings` (perto de [index.html:1594](index.html#L1594)) — incluir no objeto novo:
```js
dailyStudyMin: parseInt(document.getElementById('cfg-daily-study-min').value) || 60,
```

c) `resetSettings` (perto de [index.html:1560](index.html#L1560)) — voltar pro default:
```js
document.getElementById('cfg-daily-study-min').value = DEFAULT_CFG.dailyStudyMin;
```

d) Validação no preview de config (em volta de [index.html:1606](index.html#L1606)) — se já houver clamp, adicionar `dailyStudyMin` ao range check (≥15, ≤240). Caso contrário, deixar o `min`/`max` do `<input>` cuidar.

## 8. Cache do block generator

Não muda — `dailyStudyMin` afeta só `computeStats`/`calcStreaks`, não blocos. Não precisa chamar `clearBlockCache()` quando muda.

## 9. Atualizar CLAUDE.md

Na seção "Sistema de gamificação", trocar:

> **Moedas**: ganhas em blocos de estudo. Saldo = ganhas − `coinsSpent`.

por algo como:

> **Moedas**: vêm de duas fontes — proporcional ao tempo de cada bloco de estudo concluído (com multiplicador pra pomos longos, ver `coinsForStudyBlock`) + bônus diário por faixa de streak (ver `DAILY_BONUS_TIERS`). Saldo = total − `coinsSpent`.
> **Streak**: dia conta só se total de estudo concluído ≥ `config.dailyStudyMin` (padrão 60min, editável em Configurações → Geral).

Na seção "Schema do Firestore", adicionar `dailyStudyMin` na lista de campos de `config`.

---

## Verification

1. Abrir `index_teste.html` no browser.
2. **Antes/depois — saldo de moedas**: anotar saldo atual antes da mudança. Depois, abrir aba Perfil — saldo deve estar significativamente maior (cada bloco de estudo já feito agora vale `pomo` minutos × multiplicador, não 1).
3. **Streak retroativo**: aba Análises — comparar "Sequência atual" antes e depois. Deve cair se o histórico tem dias com check só de pausa ou só 1 pomo curto.
4. **Bônus diário ativo**: marcar checks suficientes hoje pra bater `dailyStudyMin`. Saldo deve subir além do esperado por blocos (delta = `dailyBonusForStreak(streak)`).
5. **Configurabilidade**: Configurações → Geral → mudar mínimo de 60 pra 30. Salvar. Re-abrir Análises — streak deve mudar conforme nova regra. Mudar pra 180 — streak provavelmente cai pra 0 (difícil bater).
6. **Persistência**: recarregar página após mudar `dailyStudyMin`. Valor deve voltar igual (Firestore).
7. **Pomo curto não infla**: mudar pomo pra 15min em "Dia a dia". Cada bloco de estudo agora dá 15 moedas (15 × 1.0). Comparar com pomo de 60min (60 × 1.5 = 90 moedas).
8. **`skipWeekends`**: com flag ligada, fim de semana não quebra streak (já testado pela lógica existente de `forEachDay`).
9. **Edge cases**:
   - Dia 0 estudo: nada de bônus, streak quebra.
   - `dailyStudyMin = 15`, 1 pomo de 25min: qualifica.
   - Mudar pomo retroativamente: estatísticas se recalculam (limitação conhecida — todos os blocos passados usam o pomo atual, não o que tinha quando foram feitos).
