# Pets como instâncias: nome, curva de nível e evolução

Branch: `feat/pets-evolucao`. Origem: IDEIAS.md, "Pets: nome, evolução, vários do mesmo, skins".

## Contexto

O Tomi pediu: nomear o pet ao adotar, pets que evoluem em certos níveis com escolha (cachorro →
continua cachorro ou vira lobo, cada caminho com skills próprias), poder ter mais de um do mesmo
pet, e sprites de cachorro, lobo e pastor alemão com animação. Pra testar, a evolução fica no
**Lv. 2**; o design final (IDEIAS.md) é Lv. 10 (escolha) e Lv. 30 (transformação).

## Decisões

- **Pet vira instância** (`PetInstance`), não espécie. `state.pets.owned` passa de `['cat']` pra
  `[{ id, species, name, xp, path, stage, skill, skillActivatedAt, adoptedAt }]`. O id da instância
  é o da espécie quando livre (`dog`), senão `dog-2`… — pets migrados do formato antigo ganham
  `id = espécie`, então `checks[...].pet` antigo continua apontando pro bicho certo, sem reescrever
  checks. `state.skills` some (a skill mora na instância). `schemaVersion: 2`.
- **Catálogo em três camadas** (`domain/pets.ts`): `FORMS` (sprite + skills), `PETS` (espécie:
  preço, forma base, `paths` com `stages: [{ level, form }]`, nomes sugeridos), instância. A forma
  atual é derivada (`petForm`), não salva.
- **Curva de nível própria do pet**: próximo nível = `50 + 20·(L−1)` XP. Lv. 2 = 1 pomo,
  Lv. 10 ≈ 10h, Lv. 30 ≈ 80h. XP existente não muda, só o mapeamento.
- **Skills viram catálogo** (`SKILLS` em `progression.ts`) com regra por id (`after-hour`,
  `first-study`, `event`, `none`); `skillEligible` generaliza o `noturnoBonusEligible`. Novas:
  `lua-cheia`, `fiel`, `aula`. Anti-exploit fecha também o "equipar no fim do bloco":
  `activatedAt = max(pet.skillActivatedAt, pets.activeSince)`.
- **Nome obrigatório sem fricção**: o campo já vem com sugestão sorteada + 🎲. Renomear grátis.
- **Evolução definitiva**, mas a escolha pode ficar em aberto. `evolve` devolve instância nova
  (não muta); skill que a forma nova não tem cai.
- **Sprites desenhados em código** (`scripts/pixel-sprites.mjs`): 32×32 RGBA, 4 frames
  (respiração + rabo), paleta chapada sem contorno, no padrão do personagem. Arte autoral — zero
  questão de licença. São placeholders honestos até alguém pintar à mão.

## Mudanças

- `domain/types.ts`, `domain/pets.ts`, `domain/progression.ts`, `domain/persistence.ts` (migração
  v0/v1 → v2), `domain/daySummary.ts`, `domain/checks.ts` (só tipos)
- `application/pets.ts` (buy com nome, rename, evolve, activePet), `application/checks.ts`
  (SkillContext novo), `dayEnd.ts`, `session.ts`, `settings.ts`
- `features/pets/PetCard.tsx` (ShopPetCard / OwnedPetCard), `features/pets/PetModals.tsx`
  (adoção com nome, renomear, evoluir), `features/profile/ProfileTab.tsx`,
  `features/dayend/DayEndModals.tsx`, `shared/strings.ts`, `styles/app.css`
- `scripts/pixel-sprites.mjs` + `public/idle/pets/{dog,dog-shepherd,wolf}/`
- Testes: `tests/pets.test.ts` (reescrito), `persistence`, `progression`, `dayend`,
  `application-settings`, `application-plan`; e2e `11.` (adotar com nome → dia seguinte → Lv. 2 →
  escolher Lobo)
- Docs: CLAUDE.md (pets, skills, schema, arquivos), IDEIAS.md (nota)

## Verificação

- `npm run typecheck`, `npm test` (293), `npm run test:e2e` (11), `npm run build`
- Manual no modo teste: adotar com nome, card "Pet ativo", "Meus pets" (renomear, Evoluir), modal
  de caminho, lobo no hero, toast

## Fica pra depois

- Lv. 10 (escolha, mudança visual pequena) e Lv. 30 (transformação) — hoje `DOG_EVOLVE_LEVEL = 2`
- "XP em dobro pro pet" nos blocos em que a skill valeu
- Skins, faixas de preço, gato/coruja/cobra/vaca em 32×32 (o gato atual é IA em 1254×1254 com
  fundo xadrez pintado)
- O `count` do botão "Meus pets" mostra espécies distintas / catálogo — com cópias, pode virar
  "N pets" simples
