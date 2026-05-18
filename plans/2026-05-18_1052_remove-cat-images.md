# Plano: Remover todas as imagens do gato em `index_teste.html`

## Context
O usuário pediu para tirar **todas as imagens do gato** (pet) do arquivo de teste `index_teste.html`, mantendo a imagem do personagem (`char-sprite`). Existem duas ocorrências de imagem do gato:
1. Na cena do personagem (`pet-sprite`) — **já foi removida** na rodada anterior.
2. No shop de pets (`shop-item-sprite`) — ainda está lá, renderizada via JS em `renderPetsShop()`.

## Mudança
Arquivo: [index_teste.html](index_teste.html)

Remover a linha do `<img>` no template do shop de pets, em [index_teste.html:1412](index_teste.html#L1412), dentro da função `renderPetsShop()`:

De:
```js
item.innerHTML = `
  <img class="shop-item-sprite" src="${pet.sprite(0)}" alt="${pet.name}">
  <div class="shop-item-info">
    <div class="shop-item-name">${pet.name}</div>
    <div class="shop-item-desc">${pet.desc}</div>
  </div>
`;
```

Para:
```js
item.innerHTML = `
  <div class="shop-item-info">
    <div class="shop-item-name">${pet.name}</div>
    <div class="shop-item-desc">${pet.desc}</div>
  </div>
`;
```

## O que será mantido
- `<img id="char-sprite">` (personagem do usuário) em [index_teste.html:533](index_teste.html#L533) — **fica**.
- Toda a lógica do shop de pets (registry `PETS`, função `renderPetsShop`, botões Adotar/Equipar) continua funcionando — só o sprite (imagem do gato) é removido do card.
- CSS `.pet-sprite` / `.shop-item-sprite` e o filtro SVG `pet-remove-white` ficam no arquivo (não atrapalham, vão virar regras órfãs).

## Verificação
1. Abrir `index_teste.html` no navegador.
2. Ir para a aba "Perfil".
3. Confirmar:
   - Personagem do usuário aparece normalmente na cena.
   - Nenhuma imagem do gato aparece em lugar nenhum (nem na cena, nem no shop).
   - O card do gato no shop ainda mostra nome + descrição + botão "Adotar".
