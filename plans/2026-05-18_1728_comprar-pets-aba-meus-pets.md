# Comprar pets de verdade + aba "Meus pets" no lugar de Cosméticos

## Context

Hoje a loja de pets é cosmética: clicar em "Adotar" só faz `state.pets.owned.push(...)` sem checar nem descontar moedas. O `state.coinsSpent` existe no schema (inicializado em 0, salvo no Firestore) mas nunca é escrito nem lido. Saldo exibido em `#char-coins` é só `stats.coins` (total ganho).

Além disso, abaixo do botão "🛒 Loja de pets" no perfil tem um card placeholder "🎨 Cosméticos — Em breve" que promete uma feature futura. O usuário quer transformar esse espaço numa vitrine real dos pets já adotados.

Mudanças:
1. **Economia real**: subtrair `price` do saldo ao comprar; bloquear compra se saldo < preço.
2. **Confirmação de compra** via modal centralizado antes de descontar.
3. **Card "Cosméticos"** vira **"Meus pets"** — grid 2-col só com os pets já comprados, cada um com botão Equipar/Ativo. Empty state quando vazio.

Arquivos a tocar (mudanças idênticas em ambos, por regra de workflow):
- `index.html`
- `index_teste.html`
- `CLAUDE.md` — atualizar a nota "price é só display" no fim da seção "Sistema de pets".

---

## Mudanças no JS

### 1. Helper de saldo

```js
function getCoinBalance() {
  const stats = computeStats();
  return Math.max(0, stats.coins - (state.coinsSpent || 0));
}
```

`#char-coins` em `renderProfile` passa a usar `getCoinBalance()`. Mantém `stats.coins` como "ganho total" interno.

### 2. Compra real com confirmação

Em `renderShop()`, substituir o `btn.onclick`:

- **Se não possui** (botão "Adotar"):
  - Se `balance < pet.price`: botão fica desabilitado/cinza. Clicar mostra `showToast('Moedas insuficientes')`.
  - Se saldo OK: clicar abre modal `#pet-buy-confirm`. Ao confirmar:
    - `state.pets.owned.push(pet.id)`
    - `state.pets.active = pet.id`
    - `state.coinsSpent += pet.price`
    - `scheduleSave(); renderShop(); renderProfile(); startPetAnim();`
    - `showToast('Gato adotado! 🎉')`
- **Possui e ativo**: desativa (sem confirmação, sem custo).
- **Possui e inativo**: equipa (sem confirmação, sem custo).

### 3. `renderOwnedPets()`

Itera só `state.pets.owned`, reusa shape de card do `renderShop()` mas sem preço, botão é "Equipar"/"Ativo". Empty state "Nenhum pet ainda. Visite a loja!" se vazio. Chamado em `renderProfile()`.

### 4. Modal de confirmação

Padrão `.panel-overlay.center`. Funções `openBuyConfirm(petId)`, `closeBuyConfirm()`, `confirmBuy()`. `let pendingBuy = null` no escopo do módulo.

---

## Mudanças no HTML

Substituir o bloco `<!-- COMING SOON: COSMETICS -->` por:

```html
<div class="my-pets-card">
  <div class="my-pets-title">Meus pets</div>
  <div id="my-pets-grid" class="my-pets-grid"></div>
</div>
```

Adicionar modal `#pet-buy-confirm` no bloco de painéis.

---

## CSS

- Reusar `.shop-item` e `.shop-btn`.
- `.shop-btn.locked { opacity:.4; cursor:not-allowed }`.
- `.my-pets-grid { display:grid; grid-template-columns:1fr 1fr; gap:... }`.
- `.my-pets-empty` centralizado.

---

## CLAUDE.md

Trocar a nota final da seção "Sistema de pets" (que dizia "price é só display") por:

> **Economia**: ao adotar, `coinsSpent += pet.price`. Saldo = `stats.coins - coinsSpent` via `getCoinBalance()`. Compra exige confirmação em modal e só passa com saldo ≥ preço. Equipar/desequipar é grátis.
>
> **Aba "Meus pets"**: grid 2-col abaixo da loja com os pets já comprados.

Remover "Cosméticos pro personagem" de "Direções futuras".

---

## Verificação

1. Abrir `index_teste.html`. Aba Perfil.
2. **Meus pets vazia** quando ainda não comprou nada.
3. **Sem saldo**: botão "Adotar" desabilitado, clique → toast.
4. **Acumular ≥150 moedas**, abrir loja → "Adotar" do Gato fica clicável.
5. **Comprar**: modal confirma "Adotar Gato por 🪙 150?". Cancelar → nada. Confirmar → toast, saldo −150, loja vira "Ativo", Gato aparece em "Meus pets".
6. **Equipar/desequipar** no card "Meus pets".
7. **Persistência**: recarregar no `index.html` logado.

## Arquivos críticos

| Arquivo | Trecho |
|---|---|
| `index.html` | Perfil HTML (~770-820), `renderShop` (~1896-1948), `renderProfile` (~2220-2239), `scheduleSave` (~1353-1359) |
| `index_teste.html` | Mesmas seções, sem Firestore |
| `CLAUDE.md` | Seção "Sistema de pets" + "Direções futuras" |

## Não fazer agora

- Não migrar `coinsSpent` pra subcollection.
- Não cobrar equipar/desequipar.
- Não mexer em XP, níveis, cálculo de moedas.
