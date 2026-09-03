# Pet inicial no onboarding, arte pra todo o catálogo e uma skill por espécie

Branch: `feat/pets-evolucao` (continuação). Origem: IDEIAS.md, "Pet inicial no onboarding (starter)".

## Contexto

O Tomi pediu o projeto inteiro de uma vez: sprites pra todos os animais (o gato de IA fora,
coruja vira pomba), o pet inicial escolhido na criação da conta — **qualquer** espécie, porque
com animais a opinião já vem pronta — e um aviso de que todos os outros pets dá pra adotar depois.

## Decisões

- **Arte por script pra todo o catálogo** (`scripts/pixel-sprites.mjs`): gato, cobra, vaca e pomba
  entram no mesmo padrão do cachorro (32×32 RGBA, 4 frames, cores chapadas). Cada forma é uma
  função `(frame) → grid`, então a animação é decidida por bicho (respiração + rabo/língua/asa/orelha).
  O gato de IA (1254×1254 com fundo xadrez) foi substituído.
- **Coruja → Pomba** (`owl` → `dove`). `SPECIES_RENAMES` em `domain/pets.ts` traduz na leitura;
  o id de instância `owl` continua, então checks antigos seguem creditando. Skill que a pomba não
  tem (Noturno) cai; `voo` (placeholder) saiu do catálogo.
- **Uma skill por espécie**, todas decidíveis no check: Gato *Preguiça* (após pausa longa), Cobra
  *Constância* (o bloco que bate a meta), Vaca *Rumina* (após o almoço), Pomba *Madrugador* (antes
  das 9h) + *Aula*. `SkillContext` ganhou `prevBlock`, `studyMinsToday`, `dailyStudyMin`,
  `longBreakMins`; `application/checks.ts` monta tudo a partir do plano do dia.
- **Starter grátis, uma vez**: `adoptStarter(species, name)` só enquanto `pets.owned` está vazio
  (conta nova ou depois de Cancelar sessão — que zera moedas junto, então não dá pra farmar).
  `finishOnboarding` valida tudo antes de mudar qualquer coisa.
- **Onboarding em dois passos, pet primeiro**: um card por espécie (sprite animado, nome, uma linha
  de personalidade), nome com sugestão + 🎲, o aviso "todos os outros dá pra adotar depois", e só
  então período + fins de semana ("← Trocar de pet" volta). Quem já tem pet vai direto pro passo 2.
- `NameField` virou componente próprio (`features/pets/NameField.tsx`), usado em adotar, renomear e
  no starter.

## Verificação

- `npm run typecheck`, `npm test` (332), `npm run test:e2e` (16 — o `abrirApp` agora passa pelo
  starter com o gato; o 16 escolhe a cobra), `npm run build`
- Manual no modo teste: tela do starter, nome, hero com o pet de graça, loja intacta

## Fica pra depois

- Arte à mão no lugar dos placeholders (o script é a espec)
- Lv. 30 (transformação), "XP em dobro pro pet", skins, faixas de preço
