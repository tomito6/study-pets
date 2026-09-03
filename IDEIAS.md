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
> senso maior de evolução". Ainda por fazer: a transformação do Lv. 30, "XP em dobro pro pet", skins,
> faixas de preço, o gato em 32×32.

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

---

## Como esse arquivo deve crescer

- Adicionar ideias soltas como bullets ou parágrafos curtos. Não precisa ser formal.
- Quando uma ideia for pra virar feature, copiar pra um plan file em `plans/YYYY-MM-DD_HHMM_slug.md` com o detalhamento técnico — e deixar uma linha aqui marcando "→ virou plan X" ou apagar.
- Ideias podem morrer aqui também. Tudo bem.
