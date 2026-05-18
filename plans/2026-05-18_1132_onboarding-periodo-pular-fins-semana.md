# Onboarding: período de uso + pular fins de semana

## Contexto

Hoje o app gera blocos pra "hoje + 24 semanas à frente" pra todo mundo, e analytics conta todos os dias do range — incluindo dias vazios (ex: sábado/domingo, ou meses depois do semestre acabar). Isso suja a análise: heatmap fica cheio de buracos, "melhor dia" e médias contam dias que o usuário nem ia estudar.

**Objetivo**: quando um usuário cria conta nova (primeiro login Google), aparece uma tela perguntando:
1. **Quando ele vai usar o app** — período de datas (início + fim) ou "sempre" (sem fim, comportamento atual)
2. **Pular finais de semana** — sáb/dom não geram blocos nem entram nas estatísticas

Cada usuário tem sua config (já é o caso: `users/{uid}/config` no Firestore). Usuários existentes (cuja config não tem os campos novos) **não veem a tela** — ficam com defaults `periodStart=null` + `periodEnd=null` + `skipWeekends=false` (= comportamento atual). A config também é editável depois no painel de Configurações.

---

## Mudanças no schema

`DEFAULT_CFG` em [index.html:723-726](index.html#L723-L726) ganha 3 campos:

```js
const DEFAULT_CFG = {
  start:'09:00', lunch:'13:00', lunchDur:60, end:'18:00',
  pomo:25, shortBreak:5, longBreak:20, hasLunch:true,
  periodStart: null,   // "YYYY-MM-DD" ou null (= "sempre")
  periodEnd:   null,   // "YYYY-MM-DD" ou null (= "sempre")
  skipWeekends: false,
};
```

`CLAUDE.md` é atualizado pra documentar os 3 campos novos no schema do Firestore.

---

## Detecção de "novo usuário"

`loadData(uid)` em [index.html:1108](index.html#L1108) hoje não retorna nada. Mudança: retorna `isNew = !snap.exists()`.

`onAuthStateChanged` em [index.html:1172-1187](index.html#L1172-L1187) passa a chamar `openOnboarding()` depois de `initApp()` se `isNew === true`.

```js
onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.user = user;
    const isNew = await loadData(user.uid);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    initApp();
    if (isNew) openOnboarding();
  } else { /* ... */ }
});
```

Não usa flag persistida em `state` — `isNew` vive só no escopo da função.

---

## Modal de onboarding

Reaproveita o padrão `.panel-overlay` + `.panel-sheet` já usado por settings/lunch/event ([index.html:475-519](index.html#L475-L519), CSS em [index.html:105-107](index.html#L105-L107)). Sem botão ✕ (forçar setup); o único caminho de saída é o botão "Começar".

HTML novo (próximo aos outros panels, ~linha 540):

```html
<div class="panel-overlay" id="onboarding-panel">
  <div class="panel-sheet">
    <div class="panel-header">
      <h2>👋 Bem-vindo!</h2>
    </div>
    <p class="onb-intro">Quando você quer usar o app?</p>
    <div class="field-group">
      <div class="field-row">
        <div><div class="field-sublabel">Início</div>
          <input type="date" id="onb-start"></div>
        <div><div class="field-sublabel">Fim</div>
          <input type="date" id="onb-end"></div>
      </div>
      <button class="ghost-btn" id="onb-always">Usar sempre (sem data fim)</button>
    </div>
    <div class="field-group">
      <label class="check-label">
        <input type="checkbox" id="onb-skip-weekends">
        Pular finais de semana (sáb e dom)
      </label>
    </div>
    <div class="btn-row">
      <button class="save-btn" id="onb-start-btn">Começar</button>
    </div>
  </div>
</div>
```

JS novo (perto das outras funções de painel, ~linha 1500):

- `openOnboarding()` — adiciona `.open`, popula defaults (hoje em `onb-start`, vazio em `onb-end`).
- Botão "Usar sempre" — limpa os dois date inputs e marca um data-attribute no painel.
- `finishOnboarding()` — lê os campos, escreve em `state.config.periodStart/periodEnd/skipWeekends`, fecha o modal, chama `buildWeeks()` + `clearBlockCache()` + `scheduleSave()` + `renderAll()`.

Validação: se o usuário preencher só uma das datas, trata como "sempre" (avisa via `showToast`).

---

## `buildWeeks()` — respeitar o período

[index.html:799-827](index.html#L799-L827). Lógica nova:

```js
function buildWeeks() {
  const today = new Date();
  let startDate = mondayOf(today);
  let endDate;  // será calculada

  // Expansão pra trás se há dados antigos (mantém o comportamento atual)
  const allKeys = [...Object.keys(state.checks), ...Object.keys(state.events), ...Object.keys(state.lunchOverrides)];
  if (allKeys.length > 0) {
    allKeys.sort();
    const earliestDate = new Date(allKeys[0] + 'T12:00:00');
    const earliestMon = mondayOf(earliestDate);
    if (earliestMon < startDate) startDate = earliestMon;
  }

  // Se periodStart definido: empurra startDate pra ele (mas não sobrescreve expansão pra trás)
  const { periodStart, periodEnd } = state.config;
  if (periodStart) {
    const ps = mondayOf(new Date(periodStart + 'T12:00:00'));
    if (ps < startDate) startDate = ps;
  }

  // Se periodEnd definido: endDate = domingo da semana do periodEnd. Senão: hoje + FUTURE_WEEKS.
  if (periodEnd) {
    const pe = new Date(periodEnd + 'T12:00:00');
    endDate = mondayOf(pe); endDate.setDate(endDate.getDate() + 6);
  } else {
    const currentMon = mondayOf(today);
    endDate = new Date(currentMon); endDate.setDate(endDate.getDate() + FUTURE_WEEKS*7 - 1);
  }

  const totalWeeks = Math.max(1, Math.round((endDate - startDate) / (7*86400000)) + 1);
  WEEKS = [];
  for (let i = 0; i < totalWeeks; i++) {
    const s = new Date(startDate); s.setDate(s.getDate() + i*7);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    WEEKS.push({ n: i+1, start: s, end: e });
  }
}
```

Casos:
- `periodStart=null, periodEnd=null` → idêntico ao atual.
- `periodStart="2026-05-18", periodEnd="2026-07-31"` → WEEKS cobre apenas esse intervalo (mais expansão pra trás se houver dados antes).
- `periodStart="2026-05-18", periodEnd=null` → começa na semana de 18/05 mas estende até hoje+24sem (comporta-se como "sempre" pra frente).

---

## `forEachDay()` e `blocksForDay()` — pular fins de semana

`forEachDay` em [index.html:829-836](index.html#L829-L836) vira:

```js
function forEachDay(callback) {
  const skip = state.config.skipWeekends === true;
  for (let wi = 0; wi < WEEKS.length; wi++) {
    for (let di = 0; di < 7; di++) {
      if (skip && di >= 5) continue;  // 5 = sáb, 6 = dom (segunda = di 0)
      const d = new Date(WEEKS[wi].start); d.setDate(d.getDate() + di);
      callback(dk(d), d, wi, di);
    }
  }
}
```

Isso já faz `computeStats` ([index.html:1003-1068](index.html#L1003-L1068)) e qualquer outro consumidor de `forEachDay` ignorarem sáb/dom automaticamente, sem mudança neles.

`blocksForDay` em [index.html:965-970](index.html#L965-L970) vira:

```js
function blocksForDay(dateKey) {
  if (state.config.skipWeekends) {
    const d = new Date(dateKey + 'T12:00:00');
    const dow = d.getDay();  // 0=dom, 6=sáb
    if (dow === 0 || dow === 6) return [];
  }
  const events = state.events[dateKey] || [];
  const lunchOv = state.lunchOverrides[dateKey];
  const cfg = lunchOv ? { ...state.config, ...lunchOv } : state.config;
  return generateBlocks(cfg, events);
}
```

`renderBlocks` ([index.html:1691](index.html#L1691)) hoje renderiza o container vazio se `blocks=[]`. Adiciono um fallback simples:

```js
if (blocks.length === 0) {
  c.innerHTML = '<div class="empty-day">🌴 Dia livre</div>';
  document.getElementById('stat-e').textContent = '0/0';
  document.getElementById('stat-p').textContent = '0/0';
  return;
}
```

CSS leve pro `.empty-day` (padding, cor secundária, centro).

---

## Settings panel — campos editáveis

Painel em [index.html:475-519](index.html#L475-L519). Adiciono uma nova `field-group` antes do botão de salvar:

```html
<div class="field-group">
  <label>Período de uso</label>
  <div class="field-row">
    <div><div class="field-sublabel">Início</div>
      <input type="date" id="cfg-period-start"></div>
    <div><div class="field-sublabel">Fim</div>
      <input type="date" id="cfg-period-end"></div>
  </div>
  <button class="ghost-btn" id="cfg-period-always" type="button">Usar sempre</button>
  <label class="check-label">
    <input type="checkbox" id="cfg-skip-weekends">
    Pular finais de semana
  </label>
</div>
```

Atualizo:
- `openSettings` ([index.html:1376-1388](index.html#L1376-L1388)) — popula os 3 inputs novos com `state.config.*`.
- `readCfgForm` ([index.html:1413-1424](index.html#L1413-L1424)) — lê os 3 inputs novos.
- `resetSettings` ([index.html:1401-1411](index.html#L1401-L1411)) — limpa pros defaults.
- `saveSettings` ([index.html:1450-1456](index.html#L1450-L1456)) — depois de salvar `state.config`, chama `buildWeeks()` e `clearBlockCache()` (já existem) e `renderAll()`.

---

## `index_teste.html`

Mesmas mudanças, replicadas. Como o `_teste` não tem Firebase, o onboarding nunca dispara via `onAuthStateChanged`. Pra eu conseguir testar localmente:

- Adicionar `window.openOnboarding = openOnboarding;` no fim do script (já tem padrão `window.openSettings` etc).
- Permite chamar `openOnboarding()` no console pra ver a tela.

Não vou criar um botão de teste visível — não precisa poluir a UI; o console basta pro desenvolvimento.

---

## Arquivos modificados

- `index.html` — único arquivo de app real
- `index_teste.html` — espelho de teste
- `CLAUDE.md` — documentar os 3 campos novos no schema do Firestore + a feature de onboarding

---

## Verificação

1. Abrir `index_teste.html` no browser, abrir devtools.
2. `window.openOnboarding()` → modal aparece com 2 inputs de data, botão "Usar sempre", checkbox de fim de semana, botão "Começar".
3. Preencher início `2026-05-18` e fim `2026-05-31`, marcar "pular fins de semana", clicar Começar.
4. Esperado: aba Plano agora mostra apenas a semana de 18/05; navegar pra sábado/domingo mostra "🌴 Dia livre"; aba Análise mostra heatmap com 2 semanas e sem sáb/dom.
5. Abrir Configurações → os 3 campos novos refletem o que foi setado.
6. Clicar "Usar sempre" → datas limpam; Salvar → app volta a mostrar 24 semanas à frente.
7. Desmarcar "pular fins de semana" → Salvar → sáb/dom voltam com blocos normais.
8. Depois de validado, commit + push → Vercel deploya → testar em produção fazendo logout/login (não cria conta nova, apenas verifica que app não quebra com config existente).

Nota: testar o caminho de "primeiro login real" requer criar uma conta Google diferente e logar em produção; não dá pra simular isso localmente sem mexer no Firebase. Vou validar a lógica via `openOnboarding()` no `_teste` e confirmar o caminho de novo usuário só lendo o código de `loadData` + `onAuthStateChanged`.
