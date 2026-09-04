# Ideias

Caderno aberto de ideias pro app. Não é roadmap — é onde rabiscar antes de virar plano. Quando uma ideia amadurecer e vier pra implementar, vira plan file em `plans/` e (se virar parte estável do design) entra no CLAUDE.md.

---

## Skills desbloqueáveis (usuário + pets)

Sistema de "skills" tipo árvore de talentos de RPG, separado por usuário e por pet.

- **Skills do usuário**: passivos que o estudante destrava conforme sobe de nível ou cumpre marcos. Exemplos pra explorar:
  - "Madrugador": +10% XP em blocos antes das 9h
  - "Fôlego": pausa longa dá +X moedas
  - "Foco profundo": pomos de 90+ min ganham bônus
- **Skills dos pets**: cada pet tem sua árvore própria. O pet equipado aplica suas skills passivamente. Cria diferenciação entre pets além do visual — comprar um pet novo é também desbloquear uma build diferente.
- Como destravar: nível do usuário, blocos completados, streak atingido, ou moedas gastas. Misturar fontes pra ter variedade de gatilhos.

Pontos a pensar antes de implementar:
- Não fazer skills "obrigatórias" — o app não pode virar grind. Deve ser reforço positivo, não pressão.
- Equilibrar: skills muito fortes viram pegadinha (quem não pegou tá perdendo). Preferir skills temáticas/situacionais a numéricas puras.
- UI: provavelmente um modal/aba "Skills" no perfil, parecido com loja de pets. Árvore visual ou lista categorizada?

## ~~Contador "do dia" em tempo real (XP e moedas previstos)~~ → implementado

Implementado no card de XP (linha "Hoje"): mostra `Hoje: +X XP · +Y 🪙` em laranja ("pendente") quando hoje tem checks e não foi encerrado. Vira `✓ Hoje encerrado` em verde quando o dia fecha (os totais já abrigam o ganho). `computeStats` ganhou `todayCoins` (moedas de estudo + bônus de streak se o mínimo foi batido). Pequeno pulse na mudança pra reforço sem virar caça-níquel. XP previsto do pet ativo ficou de fora (sub-ideia que pode virar plan separado).

## Builds de estudo por horário

As skills viram a base pra **builds** — combinações que o usuário monta dependendo do horário/contexto do dia.

- Cada build = um preset de skills ativas + pet equipado + talvez ajustes de pomo/pausa.
- Ex.: "Build manhã" (Madrugador + pet com skill de foco), "Build tarde" (skill de resistência + pet de pausa), "Build maratona" (skill de pomo longo).
- O app pode **sugerir** a build pelo horário atual, mas a troca é sempre manual — sem trocar nada nas costas do usuário.
- Limite de skills ativas por build (tipo 3 de N destravadas) força escolha e dá identidade pra cada build.

Pontos a pensar:
- Pode acabar virando feature complicada demais — começar com 1 build só e ver se incomoda.
- Como o usuário cria/edita builds? Modal? Aba dedicada?
- Se isso for pra acontecer, repensar onde o pet ativo é gerenciado (hoje é só um campo `state.pets.active` — viraria parte da build).

## ~~Grupos de estudo no plano (nome + objetivo num trecho do dia)~~ → implementado

Implementado em 2026-09-03 no branch `feat/grupos-de-estudo` (detalhes em
`plans/2026-09-03_1230_grupos-de-estudo.md`). O texto abaixo fica como registro da avaliação — e a
seção "v2" continua sendo o backlog dessa feature.

Avaliado em 2026-09-02, no meio da migração. **Recomendação: UI depois da Fase 5** — ela mora no
`renderBlocks`, que o React vai reescrever, e fazer em vanilla agora é escrever duas vezes. Domínio e
persistência podem entrar antes, sobrevivem à migração intactos.

A dor: o app modela *quando* você estuda, não *o quê*. Sessão é derivada pelo gerador, muda de número
quando config/evento muda, e se chama "Sessão 2". A ideia: o usuário seleciona um trecho do dia direto no
plano (ex.: 08:00 às 14:00) e cria um grupo com nome e objetivo ("Análise II · terminar lista 3").
Marcar um check dentro de algo com nome pesa mais do que dentro de "Sessão 2".

**Modelo de dados (a decisão que importa):**
- Grupo = anotação sobre um intervalo de horário de um dia: `{ id, start, end, name, goal }`, guardado
  por data (ex.: `state.dayGroups[dateKey] = [...]`). Campo novo no doc → default em `hydrateUserDoc`,
  teste com doc sem o campo, e "Cancelar sessão" zera junto.
- **Nunca é entrada do `generateBlocks`.** Pertencimento se calcula na render: bloco cujo `time`/`endTime`
  cai dentro do intervalo. Mesmo princípio dos checks por horário — se a config muda e os blocos se
  deslocam, o grupo continua cobrindo o intervalo e pega o que estiver lá. Planner e testes dele ficam
  intocados. Amarrar ao índice da sessão seria o erro que os checks por índice já ensinaram.
- Parte pura em `src/domain/groups.ts` com testes: pertencimento, progresso (done/total dos membros via
  checks), validação do intervalo (fim > início; na v1, sem sobrepor outro grupo).

**Interação:**
- A primitiva é "intervalo de linhas" — o plano é lista, não timeline em pixels. O gesto é só açúcar.
- Três portas de entrada pro mesmo estado de seleção: (1) arrastar com botão direito no desktop
  (`contextmenu` prevenido na lista, `pointerdown` com `button === 2`); (2) segurar e arrastar no celular
  — botão direito não existe no touch, e o app é mobile-first; (3) botão "Agrupar" ao lado do "+ Evento",
  como fallback visível/descobrível.
- Pegadinha: a lista é reconstruída inteira a cada check e a cada minuto (tick do bloco atual). A seleção
  em andamento tem que viver no `state`, não só no DOM, senão some no meio do arrasto.

**Visual:**
- Cabeçalho de grupo no padrão do `.session-divider`: nome, objetivo e progresso ("2/4 estudos · 1h10 de
  2h30"). Filete discreto nas linhas que pertencem.
- Sem segundo sistema de cores: a cor da sessão já carrega o ritmo; o grupo fica neutro com o acento da
  sessão. Grupo que atravessa o almoço funciona sem regra extra (pertencimento é por horário).
- Tocar no cabeçalho abre editar/apagar — espelha o clique no evento.

**Escopo v1:** nome + objetivo em texto livre + progresso automático pelos checks. Só isso.

**v2, se a v1 provar que serve:**
- "Cumpri o objetivo?" no fim do grupo → alimenta a aba Análise ("tô fazendo o que planejei?") por
  assunto, não só por tempo.
- Recorrência (reaproveitar a máquina do `eventSeries`), entidade "matéria" agregando horas por assunto,
  cores por matéria.

## Pets: nome, evolução, vários do mesmo, skins — e como pintar (2026-09-03)

> **→ virou implementação** na branch `feat/pets-evolucao` (2026-09-03, plan em
> `plans/2026-09-03_1300_pets-instancias-evolucao.md`): instâncias + nome + curva de nível própria +
> evolução do cachorro (Pastor alemão / Lobo) no **Lv. 5** — o Tomi preferiu 5 a 10: "as pessoas têm um
> senso maior de evolução". Depois vieram os sprites de todo o catálogo e o pet inicial (ver seção
> abaixo). Ainda por fazer: a transformação do Lv. 30, "XP em dobro pro pet", skins, faixas de preço.

Rabisco a partir de quatro pedidos do Tomi: (1) obrigar a nomear o pet ao adotar, (2) pets evoluem em
certos níveis com **escolha** (o cachorro pode continuar cachorro e pegar umas skills, ou virar lobo e
pegar outras — tipo estudo noturno), (3) poder ter vários do mesmo pet (um lobo *e* um cachorro),
(4) skins no futuro. Mais o que eu vi no repo sobre a arte. Nada disso está implementado.

A régua pra tudo aqui: pet é **marco tangível de horas estudadas** (CLAUDE.md). Cada mecânica nova
tem que reforçar isso — nome dá identidade ao marco, evolução dá jornada, instância deixa guardar as
duas pontas da jornada, skin é o que fazer com moeda quando já se tem todos os pets.

### 1. Nomear o pet (obrigatório, sem fricção)

- No modal "Adotar X por 🪙 Y?" entra um campo "Nome". **Já vem preenchido** com uma sugestão
  sorteada de uma lista por espécie (Cachorro: Bolt, Thor, Mel, Pipoca… Coruja: Sofia, Atena, Hugo…),
  com um 🎲 pra sortear outro. Obrigatório = o botão fica desligado se ficar vazio; mas como sempre
  vem preenchido, nunca trava ninguém. É o jeito de "obrigar" sem parecer formulário.
- Regra: 1–16 caracteres, `trim`, sem validação esperta (emoji pode). Renomear é grátis em
  "Meus pets" (tocar no nome) — não tem motivo pra travar.
- Onde o nome aparece (é isso que faz valer a pena): subtítulo do hero (`Dedicado · com Bolt`),
  card "Pet ativo" (`Bolt` grande, `Cachorro · Lv. 3` pequeno), resumo do fim do dia
  (`Bolt subiu pro Lv. 4 ✨`), o modal de evolução (`Bolt chegou ao Lv. 10`) e, quando existir,
  a cena do modo foco (`.focus-scene-stage` já está reservada pra personagem + pet).
- Dá pra fazer sozinho, antes de tudo. Mas depende da decisão de modelo de dados da seção 3
  (o nome pertence à *instância*, não à espécie).

### 2. Níveis do pet e evolução (revisado no mesmo dia, depois de conversar)

A primeira versão dizia "evolui no Lv. 4 (~12h30)". O Tomi achou lento — e é: quatro dings em doze
horas é pouco reforço. A solução não é baratear a evolução, é **separar a escala do pet da do
usuário**.

**Curva própria do pet.** Hoje `petLevel` reaproveita `LEVELS` do usuário (8 níveis, calibrados pra
uma carreira de estudo). Pet precisa de nível rápido no começo e sem teto:
próximo nível = `50 + 20 × (nível − 1)` XP (2 XP/min, creditado ao fechar o dia). Dá isto:

| Nível | XP acumulado | Estudo com o pet equipado |
|---|---|---|
| 2 | 50 | 1 pomo |
| 3 | 120 | 1h |
| 5 | 320 | ~2h40 |
| 10 | 1170 | ~10h |
| 20 | 4370 | ~36h |
| 30 | 9570 | ~80h |

Sem nível máximo — a fórmula continua. XP já acumulado não muda, só o mapeamento: um pet que hoje
está no Lv. 3 acorda no Lv. 8. Sem migração. Os level-ups aparecem no resumo do "Encerrar o dia",
que já existe — vira o momento de celebração de verdade.

**Três momentos, um só bicho.** O Tomi não quer que os animais mudem muito — mas quer que a cobra
possa virar dragão muito tempo depois. As duas coisas cabem se a mudança grande for rara e tardia:

- **Lv. 1–9: base.** Primeira skill destrava cedo (Lv. 3, ~1h), pra pet novo não ser inútil.
- **Lv. 10 (~10h): evolução.** O pet "cresce": mudança visual pequena (2 px maior, postura, um
  detalhe) — continua sendo o mesmo cachorro. É aqui que entra a **escolha de caminho**, que é sobre
  build, não sobre aparência: Cachorro → *Companheiro* (skills de rotina/pausa) ou *Selvagem* (skills
  de noite/maratona). O caminho selvagem já dá uma pista visual (paleta mais escura, olho aceso) de
  pra onde ele vai.
- **Lv. 30 (~80h, "muuuito tempo depois"): transformação.** Quem pegou o caminho selvagem vira o
  bicho de verdade: Lobo, Dragão, Lince. Sprite novo. Quem ficou no companheiro ganha a forma
  **lendária** do próprio animal (acessório + detalhe — o mesmo cachorro, veterano). Ninguém é
  obrigado a transformar: quando chega, aceita ou não.

- A escolha do Lv. 10 é definitiva (é o que dá sentido às instâncias — dois cachorros, dois
  caminhos). Pode ficar em aberto pra sempre; enquanto não escolhe, usa só a skill de base.
- O que carrega: nome, XP, nível, data de adoção. Só muda `form`.
- Arte: Lv. 10 = frame 0 editado (barato). Lv. 30 = sprite novo (o caro), e só pros pets com linha.
  V1: cachorro (o lobo é o exemplo do Tomi) e cobra (o dragão é o sonho).

**Decidido (2026-09-03):** escolha de caminho no Lv. 10, transformação no Lv. 30. O Tomi topou as
~80h contando com os bônus de XP dos próprios pets pra encurtar. Ressalva: +5% de skill mal arranha
(80h viram 76h) — e é pra ser pequeno mesmo, pra não virar "quem não tem tá perdendo". Se a ideia é
o pet se ajudar a chegar lá, o bônus tem que ser maior **do lado do pet** do que do lado do usuário:
o bloco em que a skill valeu dá +5% pro usuário e, por exemplo, **XP em dobro pro pet**. Não mexe na
economia (XP e moeda do usuário ficam iguais), não abre exploit (decidido no check, como hoje) e é
temático — o lobo fica mais forte à noite. Com metade dos blocos batendo a skill, 80h viram ~55h.
Lembrete: XP de pet só entra com ele equipado, então 80h é tempo *exclusivo* com aquele pet, não
tempo total de estudo — dois meses de "meu cachorro" é exatamente a história que a transformação conta.

### 3. Vários do mesmo pet → o pet vira **instância** (a decisão que importa)

Hoje o modelo é por espécie: `pets.owned: ['dog', 'owl']`, `pets.active: 'dog'`,
`pets.xp: { dog: 120 }`, `skills.owl`, e o check guarda `pet: 'dog'`. Nome, evolução e "dois cachorros"
não cabem aí — precisam de identidade por bicho, não por espécie.

- **Instância**: `{ id, species, form, name, xp, skill, skillActivatedAt, skin, adoptedAt }`.
  - `species` = o que foi adotado (`dog`); `form` = a forma atual (`dog` | `dog-adult` | `dog-wild` |
    `dog-legend` | `wolf`).
  - `skill` + `skillActivatedAt` substituem `state.skills.owl` / `activatedAt` (que hoje é global e só
    serve a coruja). Uma skill ativa por instância, mesma regra de exclusividade.
- `pets.owned` vira lista de instâncias; `pets.active` vira id de instância; `pets.xp` some (mora na
  instância); `state.skills` some.
- **Check guarda o id da instância** em `pet`. É o mesmo princípio dos checks por horário: o check
  aponta pra *quem estava lá*, e o XP pendente (`applyPendingPetXP`) credita naquela instância.
- **Migração em `hydrateUserDoc`** (e teste com doc no formato antigo): cada `owned: 'dog'` vira
  instância com **`id: 'dog'`** — assim todo check antigo com `pet: 'dog'` continua apontando pro
  bicho certo, sem reescrever checks. Nome default = nome da espécie (o Tomi renomeia depois).
  `pets.xp.dog` → `xp` da instância; `skills.owl` → `skill` da instância da coruja. Instâncias novas
  ganham id gerado (`dog-2`, ou timestamp). `schemaVersion: 2`.
- **Catálogo**: `PETS` continua sendo o de espécies (o que a loja vende, com preço e sprite). Entra
  `FORMS` (ou as formas dentro da espécie): `{ id, name, sprite, frames, skills: SkillId[] }`, e cada
  espécie diz `evolvesAt: 10`, `transformsAt: 30` e
  `paths: [{ id: 'companheiro', at10: 'dog-adult', at30: 'dog-legend' }, { id: 'selvagem', at10: 'dog-wild', at30: 'wolf' }]`.
  A curva de nível do pet (`petLevel`) sai de `LEVELS` e ganha fórmula própria em `domain/pets.ts`,
  com teste.
- **Skills viram catálogo próprio** (`SKILLS` em `progression.ts`), com a regra de elegibilidade por
  id — generaliza o `noturnoBonusEligible`/`bonusForCheck`, que hoje só conhece a coruja. A forma lista
  ids; a mesma skill pode aparecer em mais de uma forma (Coruja e Lobo com Noturno é ok — a build é
  parecida, o companheiro é outro).
- Loja: comprar uma espécie que já se tem continua custando o preço cheio (é mais um marco de horas).
  Não precisa de limite de cópias.
- Ordem: **isso vem primeiro**, junto com o nome. É a fundação de 2 e 4, e sozinho é pequeno
  (domínio + persistência + o modal de adotar + card).

### 4. Skins

- O problema real que skin resolve: **moeda sem destino**. Hoje, com todos os pets comprados, moeda
  vira número morto. Skin é o ralo (sink) que mantém a moeda significando alguma coisa.
- Por espécie/forma: `skins: [{ id, name, price }]`; `instance.skin`. Sprite em
  `idle/pets/{form}/skins/{skin}/{i}.png` (default continua em `idle/pets/{form}/{i}.png`).
- Maioria por moeda. Uma ou outra por marco, como celebração (ex.: "Formatura" pro pet que passou
  de 100h) — nunca como ameaça ou "só até domingo".
- **Arte quase de graça**: skin = troca de paleta. Um script que lê o sprite default e um mapa
  `cor → cor` gera os 4 frames. Gato preto, cachorro caramelo, lobo branco: minutos, não horas.
- Só faz sentido quando houver uns 6+ pets e o Tomi sentir a moeda sobrando. Fica por último.

### 5. Elenco: linhas de evolução e skills (ideias, valores a calibrar)

Cada pet é um **arquétipo de situação de estudo**. Skill é situacional e pequena (+5% XP ou algumas
moedas), decidida no momento do check como hoje (anti-exploit continua: ativa desde antes do bloco).
Nada aqui pode virar "quem não tem tá perdendo".

| Base | Caminho companheiro (Lv. 10 → Lv. 30) | Caminho selvagem (Lv. 10 → Lv. 30) | Skills (ideias) |
|---|---|---|---|
| Cachorro 🐶 | Cachorro adulto → Cachorro lendário (bandana) | Cachorro selvagem → **Lobo** | Companheiro: Fiel (+5% no 1º estudo do dia) · Selvagem: Noturno (+5% após 18h), Lua cheia (+5% após 21h) |
| Gato 🐱 | Gato adulto → Gato lendário (cachecol) | Gato selvagem → **Lince** | Companheiro: Soneca (pausa longa rende +5 🪙) · Selvagem: Foco (+5% em pomos ≥ 45min) |
| Cobra 🐍 | Cobra adulta → Naja | Cobra selvagem → **Dragão** (o mítico, só por transformação) | Companheiro: Constância (dia que bate a meta rende +3 🪙) · Selvagem: Maratona (+5% do 4º estudo do dia em diante) |
| Coruja 🦉 | — | — | Noturno (já existe). "Voo" é placeholder — trocar por Aula: +5% em eventos que contam como estudo (dia de faculdade) |
| Vaca 🐮 | — | Vaca selvagem → Touro | Em aberto. É engraçada, pode ficar só como companhia |

Bases novas (uma por dor de estudante, não por bicho bonito):

- **Tartaruga** — Devagar e sempre: +5% em dias com ≥ 3 estudos… ou só Constância. Lenta, fiel.
- **Raposa** — Madrugador: +5% antes das 9h (a IDEIAS já pedia isso como skill de usuário).
- **Axolote** — **Recomeço**: o 1º estudo depois de um dia sem estudar rende +10 🪙. É o anti-streak:
  o app dizendo "faltou um dia? tudo bem". Regenera, literalmente. Talvez o mais on-brand da lista.
- **Coelho** — Sprint: pausas curtas rendem 2× o XP de pausa (é pouco XP, é só charme).
- **Pinguim** — Aula (ver coruja) ou Inverno. Em aberto.
- **Camaleão** — Adaptação: bônus no dia em que o plano mudou. **Cuidado**: evento falso vira exploit.
  Provavelmente fica só cosmético.

Contar a skill no check é o que mantém tudo barato: "4º estudo do dia", "1º depois de dia vazio",
"pomo ≥ 45min" são todos calculáveis com o que o `toggleBlockCheck` já tem na mão.

### 6. Preço como marco

Hoje todo pet custa 150 (= 2h30 de estudo). Com elenco maior, faixas contam a história melhor:
150 (2h30) · 300 (5h) · 600 (10h) · 1200 (20h). Míticos não se compram — só por transformação.
Ajustar quando houver 6+ pets; não mexer agora.

### 7. Arte: o que tem no repo e como fazer os próximos

**O que existe hoje** (medido em 2026-09-03):

- Personagem (`public/idle/user/`): 16×28 px, PNG com alpha, ~1 KB por frame, 4 frames de respiração
  sutil, cores chapadas, **sem contorno preto**. É o padrão de estilo do app.
- Gato (`public/idle/pets/cat/`): 1254×1254 px, **RGB sem alpha, com o xadrez de "transparência"
  pintado na imagem** — no tema escuro aparece um quadrado branco atrás do gato. ~1,1 MB por frame
  (4,6 MB o pet; dez pets assim = 45 MB de sprite). Os 4 frames não formam animação: proporção e pose
  mudam, o frame 2 está de olho fechado — a 180 ms isso treme em vez de respirar. É saída de IA em
  alta resolução, não pixel art. Os outros 4 pets não têm sprite (caem no emoji).
- O gato como **personagem** é ótimo: óculos + colete = nerd estudioso, combina com o app. Vale como
  referência de design, não como asset.

**Spec de sprite de pet** (a regra pra qualquer um que entrar):

- Canvas 32×32, o bicho com 20–26 px de altura (menor que os 28 do personagem — pet é companhia).
- PNG com transparência de verdade, resolução nativa (o CSS já escala com `image-rendering:
  pixelated`; não salvar ampliado). ≤ 16 cores. Sem contorno preto, sombra em 1 tom mais escuro —
  seguir o personagem.
- 4 frames idle a 180 ms (`FRAME_MS` em `useSpriteFrame`, mesma cadência do personagem). Frame 0 =
  pose de descanso — é ele que a loja e os cards usam parados. Frames 1–3 são o frame 0 com poucos
  pixels movidos: 1–2 px de respiração, um piscar, o rabo. Nunca redesenhar o bicho por frame.
- Escala: hoje o pet renderiza a 96 px (32 px → 3×) ao lado do personagem a 120 px (28 px → ~4,3×), ou
  seja, pixels de tamanhos diferentes lado a lado. Depois de ter pets de verdade, alinhar os dois a 4×
  (pet 128 px, personagem 112 px) — só CSS.

**Quatro jeitos de produzir** (dá pra misturar):

1. **Desenhar**: Aseprite (~US$20, padrão da indústria, exporta frames direto), Piskel (grátis, no
   browser) ou Pixelorama (grátis, open source). Um pet de 32×32 com 4 frames leva 1–2 h pra quem
   nunca fez; a forma evoluída reaproveita a silhueta (lobo = cachorro com orelha, rabo e paleta cinza)
   e leva metade.
2. **IA como referência + redesenho à mão**: gerar o gato de óculos em alta resolução (como já foi
   feito), e desenhar a versão 32×32 olhando pra ele. Melhor relação qualidade/consistência.
3. **IA de pixel art de verdade** (PixelLab, Retro Diffusion): geram em baixa resolução e animam.
   Ainda assim conferir paleta, grid e fundo. Pra saída de IA em alta resolução (o caso do gato), dá
   pra escrever um script de limpeza: recorta, reduz por vizinho mais próximo pra 32×32, quantiza a
   paleta e apaga o fundo — Claude escreve quando chegar a hora (node + sharp, ou python + Pillow).
4. **Packs prontos** (itch.io, buscar "32x32 animal sprites", "pixel pets"; licença CC0 ou CC-BY):
   é o jeito mais rápido de ter 10 bichos consistentes entre si. Risco: destoar do personagem de
   16×28 — que é pequeno o bastante pra ser redesenhado no estilo do pack, se valer a pena.

**Custo por peça, pra planejar**: pet novo 1–2 h · transformação (Lv. 30, sprite novo) 30–60 min ·
estágio do Lv. 10 e forma lendária (frame editado, acessório) 15 min · skin (script de paleta) 5 min.

### Ordem sugerida

1. **Instâncias + nome** (seção 3 + 1). Fundação. Domínio, migração com teste, modal de adotar,
   card em "Meus pets", nome no hero/card/resumo.
2. **Curva de nível própria + evolução do Lv. 10** pra cachorro e cobra (seção 2): fórmula com
   teste, frames editados pros estágios, catálogo de skills generalizado, modal de caminho. A
   transformação do Lv. 30 (lobo, dragão) pode vir depois — ninguém chega lá em menos de dois meses.
3. **Faixas de preço + 2–3 bases novas** com sprite (Axolote, Raposa, Tartaruga), refazendo o gato em
   32×32 no caminho.
4. **Skins** (seção 4), quando a moeda começar a sobrar.

Perguntas abertas pro Tomi: a escolha do Lv. 10 é definitiva mesmo (eu acho que sim, e é por isso
que instância importa)? O bônus "em dobro pro pet" vale pra toda skill ou só pras de estudo?

## Pet inicial no onboarding (starter, estilo Pokémon) — 2026-09-03

> **→ virou implementação** na branch `feat/pets-evolucao` (2026-09-03, plan em
> `plans/2026-09-03_1400_pet-inicial-starter.md`): sprites de gato, cobra, vaca e pomba (a coruja virou
> pomba), uma skill por espécie, e o starter grátis com nome no onboarding em dois passos, com o aviso.

Ideia do Tomi: quando cria a conta, o usuário escolhe um pet inicial. Ele quer que dê pra escolher uma
cobra, por exemplo. Dúvida dele: oferecer todos os pets vira paralisia de escolha?

**Por que faz sentido (dor real):** hoje uma conta nova passa 2h30 de estudo (150 moedas) sem pet.
O hero do perfil fica vazio, o resumo do fim do dia não tem ninguém subindo de nível, e a premissa do
app ("estudar com companhia") só aparece dias depois. O starter resolve isso no minuto 1 — e o
onboarding, que hoje é só "período + fins de semana", ganha o momento de calor que falta.

**Quantos: todos (decidido pelo Tomi).** A primeira proposta era um trio de arquétipos, na regra do
Pokémon. O Tomi discordou, e o argumento é melhor: com Pokémon a pessoa precisa aprender o que cada
um é antes de escolher; com animais a opinião já vem pronta — todo mundo já sabe se é de gato ou
de cachorro, e quem quer uma cobra quer uma cobra. Escolha rápida, não paralisia. Então o starter é
**qualquer espécie do catálogo**, e a loja continua com razão de existir pelas cópias, pelas
evoluções e pelos pets que forem entrando depois. Se o catálogo crescer muito (15+), aí sim vale
revisitar — mas por curadoria, não por medo de escolha.

Consequência prática: com todos na tela de entrada, **a arte de todos vira pré-requisito** — hoje só
cachorro (e as formas dele) tem sprite de verdade; gato é IA com fundo xadrez, e coruja, vaca e cobra
caem no emoji. E uma skill por espécie deixa de ser "seria bom" e vira necessário, senão a tela
mostra Cachorro e Coruja com skills e o resto sem nada.

**Como funciona:**
- Starter é **grátis** e só existe enquanto `pets.owned` está vazio (conta nova, ou depois de
  Cancelar sessão — que zera moedas junto, então não dá pra farmar). Caso de uso
  `adoptStarter(speciesId, name)` ao lado do `buyPet`, sem cobrar; a espécie continua na loja pelo
  preço cheio pra quem quiser uma segunda cópia.
- **Com nome**, o mesmo `NameField` da adoção (sugestão sorteada + 🎲). É a primeira coisa que o
  usuário nomeia no app — vale mais que o período.
- **Onboarding em dois passos**: (1) "Escolha seu companheiro" — um card por espécie, com sprite
  animado, nome e uma linha de personalidade (não stats), campo de nome embaixo do escolhido;
  (2) o que existe hoje (período + fins de semana). Pet primeiro: é o gancho emocional; o período é
  burocracia. `finishOnboarding` recebe o starter junto e cria a instância antes de fechar.
- Contas existentes sem pet: não mexer (o Tomi já tem pets; quem cancelar sessão passa pelo
  onboarding de novo e ganha o starter).

**Pré-requisitos que não são código:**
- **Arte das cinco espécies** em 32×32 no padrão do `scripts/pixel-sprites.mjs`: gato (refazer),
  coruja, vaca e cobra (criar). Na tela de entrada a arte é o produto.
- **Uma skill por espécie** (gato: *Preguiça*, +5% no estudo logo depois de uma pausa longa; cobra:
  *Constância*, +5% no estudo que bate a meta do dia; vaca: a inventar). As duas são decidíveis no
  momento do check com o que o `toggleBlockCheck` já tem (bloco anterior é pausa longa; minutos
  estudados hoje + este bloco ≥ `dailyStudyMin`) — regra nova em `SkillRule`, sem mexer no schema.

**Ordem:** sprites (gato, cobra, coruja, vaca) → skills → `adoptStarter` + onboarding em dois passos
→ e2e (conta nova escolhe a cobra, nomeia, hero já mostra ela).

## Renomear pet: já existe, mas ninguém acha — 2026-09-03

O Tomi pediu pra anotar "a opção de mudar o nome dos pets". Ela já está implementada: o ✏️ no card
do pet em "Meus pets" abre o modal de renomear (`renamePet`, grátis, 1–16 caracteres). Se quem fez o
app não lembrou dela, o botão está escondido demais — o pedido vira uma ideia de **descoberta**, não
de feature:

- Tocar no **nome** do pet no card "Pet ativo" (perfil) abre o mesmo modal. É onde o nome mais
  aparece, então é onde a pessoa vai querer mudar.
- Em "Meus pets", o nome inteiro clicável (com o ✏️ pequeno colado no texto), em vez de um ícone solto
  na ponta do card.
- Pequeno o bastante pra entrar de carona em qualquer mexida no perfil.

## Modo hardcore: sair do foco custa XP (bem pro futuro) — 2026-09-03

Ideia do Tomi, na linha do Forest: um modo em que **sair do foco tem consequência**. No Forest a
árvore morre; aqui ninguém morre — o usuário **e o pet** recebem XP negativo. Junto vêm duas coisas:
bloquear sites específicos do computador enquanto o foco roda, e o foco deixar de permitir interação
com o resto do app (hoje "← Sair do foco" fecha o overlay e o timer segue; no hardcore essa porta não
existe).

**Por que pode fazer sentido, e onde bate no CLAUDE.md.** "O app NUNCA deve fazer o usuário se sentir
mal" e "nada de ameaça" são regras da base. Hardcore só cabe como **dificuldade escolhida**, nunca
padrão: um botão explícito antes de começar ("entrar em modo hardcore"), com o custo escrito na cara
("sair custa −50 XP pra você e −50 pro Bolt"). O que não pode acontecer: pet morrer, perder
forma/evolução (evolução é definitiva), alguém descer de nível, ou o app cutucar pra ligar o modo. A
pressão é do usuário sobre ele mesmo; o app só cobra o que ele mesmo combinou.

**Regras (rabisco):**
- Ligado por bloco/sequência, no momento de entrar no foco. Vale até a sequência acabar (a emenda
  estudo → pausa → estudo já existe). Pausa: sem penalidade, ou menor — o ponto é o estudo.
- "Sair" vira o único botão do overlay: "Desistir (−X XP)", com confirmação. Sem "Sair do foco", sem
  barra, sem abas — o overlay já cobre a tela (`position:fixed; inset:0`), só falta tirar a porta.
- Sair da aba/janela conta? Uma página web não impede trocar de aba, mas enxerga
  (`visibilitychange`/`blur`) — é o que o Forest faz no celular. Proposta: tolerância de ~30 s
  (notificação, mensagem rápida) e aviso na volta ("você saiu por 12 s"); acima disso, conta como
  desistir. Sem tolerância vira punição por acidente — exatamente o que o app evita.
- Quanto: o mais legível é **perder o que o bloco daria** (−50 XP num pomo de 25 min), pro usuário e
  pro pet equipado. Simétrico, sem tabela nova. Moeda não some (é o que se gasta na loja; XP é a
  jornada). Piso: XP nunca cai abaixo do início do nível atual — ninguém desce de nível.
- O bloco abandonado fica sem check e não pode ser marcado depois (senão desistir é grátis).

**Como caberia na arquitetura:** XP hoje é soma de checks (`computeStats`), e o do pet vem de
`computePendingPetXP`. Negativo precisa de registro próprio, persistido:
`state.penalties[dateKey] = [{ time, xp, pet }]` (quem estava equipado no momento, igual ao check),
agregado na mesma passada do `computeStats` e do XP pendente do pet; campo novo no doc → default em
`hydrateUserDoc` + teste com doc sem o campo. Regra pura em `domain/` (quanto custa, piso do nível),
efeito em `application/timer.ts` (o "Desistir" e o watcher de visibilidade). A aba Análise ganha
"abandonos" quase de graça.

**Bloquear sites: não é o app que faz.** Uma página web não bloqueia nada no computador. Caminhos:
(a) uma extensão de browser própria (MV3, `declarativeNetRequest`) que lê "foco hardcore ativo" da aba
do app e aplica a lista — a parte mais trabalhosa e a que menos generaliza (Firefox, celular);
(b) integrar com um bloqueador que a pessoa já usa — o Tomi já roda o Cold Turkey, que bloqueia por
agenda e por comando local, mas uma página web não dispara isso sem um ajudante instalado. Ordem
natural: **penalidade primeiro** (é o que o app garante sozinho e é o que muda o comportamento),
bloqueio de site depois, se ainda parecer necessário.

**Perguntas abertas:** o pet perde XP mesmo, ou só o usuário (o pet como "vítima" pode ser a pressão
emocional que funciona — ou a que passa do ponto)? Pausa entra? Tolerância de quantos segundos?
Desligar o hardcore no meio da sequência: pode, sem custo, ou é desistir?

## Conta com e-mail e senha, além do Google — 2026-09-03

> **→ virou implementação** na branch `feat/login-email` (2026-09-03, plan em
> `plans/2026-09-03_2000_login-email-senha.md`): `AuthPort` estendida com `signUpWithEmail`/
> `signInWithEmail`/`sendPasswordReset`, motivo de erro tipado em `domain/auth.ts`, formulário na tela
> de login com Entrar/Criar conta/Esqueci a senha, e a reautenticação por senha no apagar conta. Decisões
> tomadas: e-mail já em uso (com Google ou senha) não vincula os provedores — só orienta a usar o outro;
> "esqueci a senha" sempre confirma envio, mesmo sem conta, pra não revelar contas; verificação de
> e-mail é disparada mas sem lembrete no perfil (fora do escopo). Falta abrir Email/Password no console
> do Firebase antes do merge — ver o plan file.

Ideia do Tomi: criar conta com e-mail e senha em vez de (só) conectar o Gmail. Faz sentido pra
ambição de abrir pra qualquer estudante: nem todo mundo tem conta Google, e tem quem não queira ligar
a conta do Google a um app de estudo. O Google continua como atalho; e-mail vira a porta padrão.

**O que já ajuda:** o Firebase Auth tem o provedor Email/Password pronto (criar conta, entrar,
"esqueci a senha" com e-mail de redefinição, verificação de e-mail opcional). Liga com um clique no
console. As regras do Firestore não mudam (são por `request.auth.uid`). E o app já fala com o auth só
pela porta `AuthPort` (`infrastructure/firebase/auth.ts`) — é estender a porta com
`signUpWithEmail`/`signInWithEmail`/`resetPassword`, e o modo memória aceita qualquer coisa.

**UI:** a tela de login vira um formulário curto (e-mail, senha, "Entrar" / "Criar conta" / "Esqueci a
senha") com o botão do Google embaixo. Erros do Firebase traduzidos em `strings.ts` (e-mail já em uso,
senha fraca, credencial inválida — nas versões novas do SDK, senha errada e e-mail inexistente voltam o
mesmo erro de propósito, não dizer qual foi).

**Pegadinhas que precisam de decisão:**
- **Mesmo e-mail nos dois provedores.** Quem entrou com Google e depois tenta criar conta por e-mail com
  o mesmo endereço cai em "e-mail já em uso". Ou orientar ("entre com o Google") ou oferecer vincular a
  senha à conta existente (`linkWithCredential`). Vincular é o certo, mas é um fluxo a mais.
- **Apagar conta** hoje reautentica com popup do Google quando o Firebase pede login recente. Usuário de
  e-mail precisa do equivalente: um campo "digite sua senha" no modal de apagar.
- **Verificação de e-mail**: exigir antes de usar cria fricção no minuto 1 (o oposto do starter);
  não exigir permite conta com e-mail inventado. Proposta: não exigir, mas lembrar no perfil.
- Senha: o Firebase cuida do hash e do mínimo de 6; pedir 8 e nada mais esperto que isso.

**Em aberto:** o modo teste ganha uma tela de login falsa pra testar o formulário sem Firebase, ou o
formulário só é testado em `npm run dev`? (O e2e hoje pula o login inteiro.)

## Tutorial depois de criar a conta — 2026-09-03

Ideia do Tomi: quando a conta é criada, um passo a passo explicando como as coisas funcionam —
explicações **bem gerais** — ou um tutorial. A dor é real e só aparece com um usuário que não é o
autor: a conta nova cai num plano já gerado, com sessões coloridas, checks, XP, pet, e ninguém diz que
tocar no check dá XP, que o XP só entra ao encerrar o dia, que o plano se reajusta sozinho quando entra
um evento, ou que tocar no bloco abre o foco. O Tomi sabe tudo isso porque construiu.

**Dois formatos, e a recomendação:**
- **Passo a passo antes de ver o app** (cartões "Bem-vindo", 4–5 telas). Simples de fazer, mas o
  onboarding já tem dois passos (pet + período); somar cinco cartões antes da primeira tela é muito, e
  explicação sem a coisa na frente evapora.
- **Tour contextual em cima do app de verdade** (recomendado): balões apontando pro elemento real,
  disparados na primeira visita a cada área. Plano: "Seu dia, já montado. Toque no check quando terminar
  um bloco; toque no bloco pra entrar no modo foco." → "Almoçou mais cedo, entrou uma aula? Ajuste aqui
  e o plano se reajusta." → "No fim do dia, encerre pra receber o XP e as moedas." Perfil: "Cada pet é
  uma prova de horas estudadas; equipe um e ele ganha XP com você." Análise: uma frase. **Cinco balões
  no total, duas linhas cada, "Pular" sempre visível.** Geral de propósito: explica o modelo, não os
  botões.
- Alternativa mínima, se o tour parecer grande: um card "Como funciona" com três linhas no topo do
  plano, dispensável, só na primeira semana.

**Regras:** linguagem adulta (o CLAUDE.md já veta infantilizar); não bloquear a tela — dá pra tocar em
volta; revisitável em Configurações ("Ver o tour de novo"). Visto fica salvo (`state.tutorialSeen`,
campo novo → default em `hydrateUserDoc` + teste); Cancelar sessão **não** zera (a pessoa já sabe).
Tentador usar o pet inicial como guia ("Bolt te mostra o app") — é on-brand com "companhia", mas é
justamente onde escorrega pro infantil; se for, uma linha e sem voz de mascote.

**Ordem:** depende de ter outro usuário pra justificar. Enquanto só o Tomi usa, a versão mínima (card
de três linhas) já paga o custo; o tour vem junto com a conta por e-mail, que é o que abre a porta.

## Revisão de 2026-09-03: o que falta, na opinião do Claude

O Tomi perguntou "tem mais alguma coisa que melhoraria muito o projeto?". Lendo o código de save,
timer e sessão, o que apareceu foi menos feature e mais **fundação**: coisas que hoje ninguém sente
porque só o Tomi usa, num dispositivo, quase sempre online. O que já tinha escopo fechado virou
pendência (`PENDENCIAS.md` 1–5: o bug do `merge: true`, reconciliar o timer ao voltar + Wake Lock,
editar evento, error boundary, cache offline). O que ainda pede decisão fica aqui.

**Ordem sugerida:** o bug do merge hoje (uma linha, e está corrompendo dado). Sync entre dispositivos e
o alarme (as duas seções abaixo) antes de qualquer outra pessoa usar. Janela do dia quando incomodar de
novo. O resto é miúdo e pode entrar de carona.

### Sync entre dispositivos (hoje o último a salvar apaga o outro)

> **→ virou implementação** na branch `feat/revisao-fundacao` (2026-09-04, plan em
> `plans/2026-09-04_0600_revisao-fundacao.md`): `UserRepository.subscribe` com `onSnapshot`, carimbo
> `meta: { writer, writtenAt }` em cada save pra reconhecer eco, e `application/sync.ts` aplicando o doc
> remoto — a menos que o onboarding esteja aberto ou haja save local pendente (v1: o local vence). A
> pendência 1 (save sem merge) foi junto.

O doc é carregado **uma vez**, no login, e salvo inteiro com debounce. Celular e notebook abertos ao
mesmo tempo: o que salvou por último ganha, e o outro perde o que fez sem aviso nenhum. O CLAUDE.md já
lista "sync mais responsivo" como direção futura; isto é o argumento pra subir de prioridade — é perda
de dado, não conveniência.

- **Mecânica:** `onSnapshot` em `users/{uid}`, atrás da porta (`UserRepository.subscribe(uid, cb)`; o
  repo em memória pode escutar o evento `storage`, ou ser no-op). Snapshot com `hasPendingWrites` é eco
  da própria escrita — ignorar. Snapshot vindo de fora: `hydrateUserDoc` de novo, `clearBlockCache`,
  `rebuildWeeks`, `notify`. `applyPendingPetXP` é idempotente, então rodar de novo é seguro.
- **Conflito:** se chegar snapshot remoto enquanto há um save local na fila (janela de 800 ms), v1 =
  o remoto entra e o local pendente sobrescreve em seguida. Documentar e aceitar; a janela é curta e
  o cenário (os dois dispositivos mexendo no mesmo segundo) é raro. Se um dia doer, o caminho é
  escrita granular (`updateDoc` com field paths por check/evento) em vez de doc inteiro.
- **Cuidado:** o snapshot não pode tocar `derived` (timer rodando, foco aberto). E numa conta nova,
  um snapshot chegando no meio do onboarding (outra aba) não pode fechar o modal — checar
  `derived.onboardingOpen` antes de reidratar, ou adiar.
- **Depende da pendência 1:** com `merge: true`, dois clientes ressuscitam checks um do outro pra
  sempre; sem merge, o último doc inteiro vence, que é pelo menos previsível.

### O alarme do pomodoro e o celular travado (PWA)

> **→ virou implementação, em parte,** na branch `feat/revisao-fundacao` (2026-09-04, plan em
> `plans/2026-09-04_0600_revisao-fundacao.md`): o app é PWA (manifest, ícones do personagem gerados por
> `scripts/app-icon.mjs`, service worker via `vite-plugin-pwa` com precache e navegação network-first), o
> timer se acerta ao voltar pra aba (`reconcileTimer`) e o Wake Lock segura a tela no modo foco. O que
> continua ideia: notificação pelo service worker e o push do servidor (FCM).

O que uma página web **não** consegue: tocar com o browser em segundo plano ou a tela travada. O
`setInterval` congela, `new Notification` só dispara com a página viva, o Web Audio fica suspenso. As
pendências 2 e 5 cobrem o que dá pra garantir sozinho (a tela não trava durante o foco; ao voltar, o
app reconcilia). Isto aqui é o passo seguinte:

- **Virar PWA de verdade:** `manifest.webmanifest` (nome, `display: standalone`, `theme_color` escuro,
  ícones 192/512) e service worker (`vite-plugin-pwa`, precache do build, estratégia `autoUpdate`).
  Hoje o `index.html` tem só as meta tags da Apple e um `<link rel="icon" href="data:,">` — **não existe
  ícone**, e ícone é arte: o personagem? o cachorro? Decisão do Tomi. Instalado na tela inicial, o app
  ganha janela própria e o Android trata melhor o áudio e a notificação.
- **Notificação pelo service worker** (`registration.showNotification`) em vez de `new Notification`:
  sobrevive melhor à aba em segundo plano, e é o caminho pra ações na notificação ("Marcar como
  feito"). Ainda depende de JS rodando na hora — não resolve tela travada.
- **O único jeito de tocar com o celular travado é push do servidor** (FCM + Cloud Function que sabe
  o plano do dia e agenda o push pro fim de cada bloco). É pesado: backend, tokens por dispositivo,
  plano no servidor. Só faz sentido se, mesmo com Wake Lock, o Tomi ainda perder finais de bloco.
  Anotar, não fazer.

### Janela de estudo só de hoje (e "dia livre")

> **→ virou implementação** na branch `feat/revisao-fundacao` (2026-09-04, plan em
> `plans/2026-09-04_0600_revisao-fundacao.md`): `windowOverrides[dia] = { studyWindows }` (vazio = dia
> livre), botão "🕘 Janelas do dia" ao lado de "+ Evento" com o mesmo editor das Configurações, "Começar
> agora" (próximo múltiplo de 5 min) e "Dia livre" (só sem check no dia). Decisão: dia livre é **neutro**
> na sequência, como o fim de semana pausado; a alternativa (quebra) está na branch
> `feat/revisao-fundacao-alt-dia-livre-quebra`.

Almoço tem override por dia (`lunchOverrides`); janela não. "Acordei tarde, hoje começo às 10" hoje é
mudar a config pra sempre ou criar um evento falso — e isso contradiz a promessa central ("almoçou
cedo? tudo bem, ajusta"). A assimetria é o bug de design mais visível que sobrou.

- **Modelo:** `windowOverrides[dateKey] = { studyWindows: StudyWindow[] }` — mesmo padrão do
  `lunchOverrides`. `blocksForDay` usa o override se existir. Campo novo no doc → default em
  `hydrateUserDoc` + teste com doc sem o campo; Cancelar sessão zera; entra na lista de datas que
  expandem as semanas (`rebuildWeeks`). Nunca entra no gerador como regra especial — é só a config
  daquele dia. Toast "Plano reajustado" e `planDelta` funcionam como estão.
- **UI:** ao lado de "✏️ Almoço" na lista do dia, um "Janelas de hoje" que abre o mesmo
  `StudyWindowsEditor` das configurações, num modal, só pro dia visível. Dia com override ganha o
  mesmo "editado" que o almoço mostra. Atalho que resolve o caso mais comum sem abrir nada:
  **"Começar agora"** — primeira janela de hoje passa a começar no próximo múltiplo de 5 min.
- **"Dia livre":** o mesmo mecanismo com `studyWindows: []` — o dia renderiza "🌴 Dia livre" como o fim
  de semana. Pra feriado bávaro no meio da semana, dia de prova, viagem. Decisão a tomar: dia livre
  declarado conta pro streak como fim de semana com `skipWeekends` (neutro) ou como dia sem estudo
  (quebra)? Neutro é coerente com o que `skipWeekends` já faz e com "a vida não para por causa do
  Pomodoro" — desde que só valha pra hoje/futuro e pra dia **sem check** (declarar depois de falhar
  seria o streak freeze do Duolingo, que é o padrão manipulativo que a gente evita).
- Dia encerrado é read-only; dia futuro pode (planejar a semana é o ponto).

### Miúdos que só aparecem com outro usuário

- **Exportar meus dados:** botão em Configurações → Geral, "Baixar meus dados", que baixa o JSON de
  `serializeState` (blob + `<a download>`). Substitui o `scripts/backup-firestore-console.js` pra quem
  não é o autor, e é a resposta pra "quero meus dados" que o GDPR exige de quem opera na Alemanha.
  Importar fica de fora até alguém pedir.
  > **→ virou implementação** na branch `feat/revisao-fundacao` (2026-09-04): card "Meus dados" em
  > Configurações → Geral, `application/export.ts` + `infrastructure/download.ts`.
- **Inglês:** a ambição é qualquer estudante do mundo, e a TUM é internacional. `strings.ts` já é o
  lugar único da UI, então virar `strings[locale]` é mecânico. O que **não** está lá e teria de sair
  do domínio: nomes de bloco gerados pelo `planner.ts` ("📖 Estudo 3", "🍽️ Almoço"), `DEFAULT_GROUP_NAME`,
  nomes de forma e traços dos pets no catálogo (`FORMS[].name`, `strings.onboarding.traits`), nomes de
  nível em `LEVELS`, descrições de skill em `SKILLS`. Formatação de data via `Intl`. Regra pra hoje:
  texto novo continua indo pro `strings.ts`, e texto de domínio ganha um id em vez de uma frase.
- **Fuso horário:** tudo é horário local (`dk`, `closedDays`, `xpProcessedUntil`). Viajar Munique →
  Brasil no meio do dia muda o "hoje" e pode fechar/abrir dia fora de ordem. Provavelmente só aparece
  no dia da viagem; anotar pra quando um relato estranho chegar.

---

## Como esse arquivo deve crescer

- Adicionar ideias soltas como bullets ou parágrafos curtos. Não precisa ser formal.
- Quando uma ideia for pra virar feature, copiar pra um plan file em `plans/YYYY-MM-DD_HHMM_slug.md` com o detalhamento técnico — e deixar uma linha aqui marcando "→ virou plan X" ou apagar.
- Ideias podem morrer aqui também. Tudo bem.
