# Habilidades que valem a pena, um bestiário que não envelhece, e um personagem de verdade

**Branch:** `chore/pendencias` (o mesmo em que o trabalho estava; **nada foi commitado** — o commit é decisão do Tomi)
**Quando:** 2026-09-09, madrugada, sessão do Mac da noite
**Outra sessão estava trabalhando no mesmo repo ao mesmo tempo** (extensão, `app-icon.mjs`,
`stats.ts`, `cafe.css`, ícones do PWA) — nada disso foi tocado aqui; as duas frentes não se cruzam.

## O pedido

> "Dê uma olhada em todos os animais e pense em habilidades boas, tipo habilidades que realmente
> seriam utilizadas. Elas em geral também deveriam ter o mesmo nível de 'força'.
> Eu gostaria de um plano também. Tipo algum tipo de gráfico, visualização, de todos os bichos e
> suas evoluções e suas habilidades. Alguma visualização que seja fácil de ver, abrir, expandir,
> modificar. Meio que sirva pro resto da vida do projeto.
> Cada evolução pode receber mais uma habilidade né."

## O que estava errado (medido, não achismo)

O catálogo tinha 8 skills e três defeitos estruturais:

1. **Uma skill morta.** `lua-cheia` (≥21h) e `noturno` (≥18h) davam **o mesmo bônus**, e todo bloco
   das 21h também é depois das 18h. Como só uma skill fica ativa por pet, a Lua cheia era
   estritamente pior — em três formas (Lobo, Tigre, Dragão) havia uma opção que ninguém escolheria.
2. **Força desigual por um fator de ~6.** `noturno` acende em todo bloco da noite (5–6 num dia de
   coruja); `fiel` acende **uma vez**, sempre. Mesmo bônus, seis vezes o valor.
3. **Faixas do dia sem cobertura e features sem skill.** Nada entre 9h e 18h — quem estuda de tarde
   não tinha skill nenhuma. E os **grupos de estudo**, o **dia livre** e o **dia bônus** — features
   que existem e o app já sabe calcular — não apareciam em skill nenhuma.

Também: a Pomba tinha 2 skills na base enquanto todas as outras espécies tinham 1, e as formas de
Lv. 15 dela terminavam com 4 skills contra 3 das outras.

## O princípio (é isto que responde ao "mesmo nível de força")

> **Uma skill vale o mesmo por dia pro estudante cuja rotina ela combina. O que muda entre elas é
> *quando* acontece, não *quanto* vale.**

Implementado com um **tier** por skill. O tier declara duas coisas: `share`, a fatia do XP de um dia
típico que a skill encosta (referência: 8 estudos de 25 min), e `weight`, o multiplicador do bônus.
O produto é o mesmo nos três:

| Tier | Acontece | `share` | `weight` | No Lv. 1 | No teto (Lv. 11) |
|---|---|---|---|---|---|
| `alta` | ~3 de 8 estudos | 0,375 | ×1 | +5% | +15% |
| `media` | ~1,5 de 8 | 0,1875 | ×2 | +10% | +30% |
| `baixa` | 1 de 8, sempre | 0,125 | ×3 | +15% | +45% |

`share × weight = 0,375` nos três — **um teste cobra isso** (`SKILL_DAY_SHARE`). Na prática toda
skill rende ~2% do XP do dia no Lv. 1 e ~6% no teto: reconhecimento, nunca obrigação.

Isso também **conserta a skill morta sem regra nova**: a Lua cheia é mais estreita, então pesa o
dobro. Às 19h só a Noturno paga; às 22h a Lua cheia paga mais. Escolher passa a ser uma decisão de
verdade. Um teste garante que, quando duas faixas de horário moram na mesma forma, a mais estreita
sempre pesa mais.

### O que o princípio *não* promete, de propósito

Se a sua rotina não combina, a skill não acontece — um madrugador com a Noturno ganha zero. E quem
só estuda das 18h às 23h tira ~3× da Noturno, não 1×. Isso é o jogo, não um bug: a variação é o que
faz escolher o pet significar alguma coisa. O que o princípio elimina é a comparação **entre**
skills pra um mesmo estudante.

## As 17 habilidades

**`alta` — acompanha o dia** · Madrugador (antes das 9h) · **Vespertino** (12h–18h, a faixa que não
tinha nada) · Noturno (a partir das 18h) · **Maratona** (do 5º estudo em diante) · **Recomeço** (todo
estudo do dia em que você volta depois de um dia em branco) · **Descansado** (todo estudo do dia
seguinte a uma folga) · **Hora extra** (estudo num dia de folga) · **Afinco** (estudo dentro de um
grupo).

**`media` — acontece às vezes** · Lua cheia (a partir das 21h) · Preguiça (depois da pausa longa) ·
Aula (evento que conta como estudo).

**`baixa` — uma vez por dia** · Fiel (o primeiro estudo) · **Ponto final** (o último estudo do
*plano*) · Rumina (depois da refeição) · **Retomada** (depois de um evento — a volta da aula) ·
Constância (o estudo que bate a meta) · **Empenho** (o estudo que fecha um grupo).

**Nove são novas.** Nenhuma foi removida — todos os ids antigos continuam valendo, então nenhum pet
salvo perde a skill ativa por sumiço de catálogo.

### As três que dão identidade ao app

- **Recomeço** é o anti-streak que a IDEIAS.md já pedia ("talvez o mais on-brand da lista"). Vale em
  **todo** estudo do dia da volta, não só no primeiro — o dia inteiro rende mais quando você
  reaparece. É o oposto de cobrar sequência.
- **Descansado** existe pra que Recomeço não confunda **folga** com **sumiço**: quem descansou de
  propósito não "voltou de lugar nenhum". `previousCountingDay` pula as folgas, exatamente como
  `allDays()` faz.
- **Afinco** e **Empenho** premiam usar os **grupos de estudo** — dar nome e objetivo a um trecho do
  dia. É a única skill que paga por estudar com intenção, e não por horário.

## O elenco: a escada é 1 → 2 → 3

Toda espécie nasce com **1** skill; a escolha do Lv. 5 tem **2**; o avanço do Lv. 15 tem **3**. O
avanço **nunca tira**, só acrescenta; a escolha **pode trocar** a da base — é isso que faz o caminho
selvagem parecer transformação (o Lobo larga a Fiel) e o de companhia parecer crescimento.
**Nenhuma forma repete o conjunto de outra.** Testes cobram os três.

| Espécie | Base | Caminho | Lv. 5 | Lv. 15 |
|---|---|---|---|---|
| Cachorro | fiel | Companheiro | Pastor alemão · +retomada | Cão lendário · +constancia |
| | | Selvagem | Lobo · noturno, maratona | Lobo lunar · +lua-cheia |
| Gato | preguica | Sábio | Gato egípcio · +afinco | Esfinge · +empenho |
| | | Selvagem | Lince · +noturno | Tigre · +hora-extra |
| Cobra | constancia | Ancestral | Naja · +rumina | Basilisco · +ponto-final |
| | | Mítico | Serpe · lua-cheia, maratona | Dragão · +descansado |
| Vaca | rumina | Campeã | Vaca premiada · +descansado | Vaca dourada · +fiel |
| | | Selvagem | Touro · madrugador, hora-extra | Bisão · +maratona |
| Pomba | aula | Solar | Pássaro de fogo · +recomeco | Fênix · +descansado |
| | | Rapina | Falcão · madrugador, vespertino | Águia · +ponto-final |

A Fênix com **Recomeço** é o encaixe temático da lista: o bicho que renasce é o bicho do dia em que
você volta.

**Consequência conhecida e aceita:** a Pomba perdeu a `madrugador` (foi pro Falcão). Um pet Pomba
com essa skill ativa tem ela **desligada na leitura** por `normalizePetInstance` — comportamento que
já existia e está testado. Vale por um catálogo com invariante limpa (base = 1 skill, sem exceção).

## O que mudou no código

- **`src/domain/progression.ts`** — `SkillTier` + `SKILL_TIERS` + `SKILL_DAY_SHARE`; `SkillDefinition`
  ganha `tier`; `skillBonus(skill, level)` (nível × peso) e `skillDesc` já com o tier. `SkillRule`
  virou 12 formatos, e as quatro faixas de horário viraram um só (`hour-range`). `SkillContext`
  ganhou 6 campos, todos derivados do plano do dia.
- **`src/domain/pets.ts`** — `FORMS` reatribuído; as descrições dos caminhos agora dizem **o que a
  build faz**, não só como o bicho fica.
- **`src/domain/checks.ts`** — `previousCountingDay` e `previousDayKey` (puros).
- **`src/application/checks.ts`** — o contexto novo. Grupos por `groupOf`/`blockInGroup`, folga por
  `isRestDayKey`, dia bônus por `isBonusDayKey`.
- **Testes** — 640 passando. Novos: a área igual dos tiers, nenhuma condição repetida, nenhuma forma
  com o conjunto de outra, toda skill morando em alguma forma, nenhuma skill valendo pra pausa
  (varre as 17), a escada 1→2→3, e os casos de aplicação de Afinco/Empenho/Recomeço/Descansado/
  Ponto final.

**Nada mudou no documento salvo.** Sem `schemaVersion` novo, sem migração. Bônus já gravado em check
antigo continua valendo o que valia — é permanente por design.

## O bestiário

`docs/bestiario.html`, gerado por `node --import ./scripts/ts-loader.mjs scripts/bestiary.mjs`.

Um arquivo só, 108 KB, **sprites embutidos em base64** — abre offline, com dois cliques, e continua
abrindo daqui a anos. Tem: o elenco com as árvores de evolução (sprites animados no ritmo do app), as
17 skills em três colunas por tier, o gráfico do equilíbrio, um **editor** e as instruções de
manutenção.

Três decisões que fazem ele "servir pro resto da vida do projeto":

1. **Não guarda dados.** Lê `FORMS`, `PETS` e `SKILLS` direto do TypeScript. Não existe versão dele
   que discorde do app — no máximo uma desatualizada, e regerar custa um comando.
2. **O gráfico é uma prova, não uma ilustração.** Três retângulos: largura = quantas vezes acontece,
   altura = quanto paga. Mesma área, e os cantos caem na curva `x·y = 0,375`.
3. **Dá pra editar e sair com código.** Trocar as skills de qualquer forma na página, ver ao vivo as
   mesmas regras que os testes cobram, e copiar o bloco `FORMS` pronto pra colar em `pets.ts`.
   Desenhar → colar → `npm test` → regerar.

`scripts/ts-loader.mjs` é o que permite isso: um hook de 20 linhas que resolve import sem extensão
(`./time` → `./time.ts`). O Node 24 já tira os tipos sozinho; só a resolução faltava. Serve pra
qualquer script futuro que queira ler o domínio sem build.

## Decisões, e onde trocar de ideia

**Skill que paga em moedas ficou de fora.** A IDEIAS.md sugere ("pausa longa rende +5 🪙"). Daria
variedade de verdade, e é a única forma decente de premiar **pausa** (o XP de pausa é pequeno demais
pra um % significar algo). Custo: campo novo no `CheckRecord` (`coins?`), migração, e os pontos de
`computeStats`/`daySummary`. Mais fundo: XP e moeda não são comparáveis (moeda tem ralo, XP é
progressão), então a promessa de "mesma força" ficaria mole. Fica pra quando o Tomi quiser um eixo
novo de propósito.

**Skill por usar o modo foco ("Presença") foi desenhada e descartada.** Premiaria quem conclui o
bloco dentro do foco. Descartada por princípio, não por equilíbrio: puniria quem estuda longe do
computador e marca depois — é a rigidez que o app promete não ter.

**Skill por sequência de dias foi descartada.** Pagar por streak transforma falhar em perda. O
CLAUDE.md proíbe isso explicitamente.

**"Imersão" (estudo ≥ 45 min) foi descartada.** Quem configura pomo de 50 min ganharia em 100% dos
blocos — vira "todo mundo devia usar pomo longo", que é a pegadinha do "quem não pegou tá perdendo".

**Fiel continua sendo "o primeiro que você marcou", não "o primeiro do plano".** Quem pulou o bloco
das 8h e começou às 10h ainda ganha. Ponto final é o oposto (posição no plano) porque ele fala do
**feitio do dia**, não do seu esforço — e assim não dá pra marcar fora de ordem pra caçar bônus.

## O personagem

> "Criar um personagem de verdade, não esse placeholder do momento. Um que tenha bastante variedade.
> Que dê pra fazer ele loiro, negro, pardo, branco, ruivo etc. No futuro teriam mais cosméticos, mas
> por enquanto pode só mudar isso."

O antigo era 16×28 com cabelo loiro e pele clara **assados no PNG** — variedade zero sem multiplicar
arquivos. O novo é 24×42 (mesma proporção, então nenhuma caixa de CSS mudou de tamanho) e, o que
importa, **a aparência é dado, não arquivo**.

**Como funciona.** `src/domain/avatar.ts` guarda a arte como um grid de letras, e cada letra é um
*papel* de cor: `S`/`s` pele e sombra, `K` o traço, `H`/`h` cabelo e sombra, `W`/`E` olho, `C`/`c`
camiseta, `P`/`p` calça, `B` sapato. A paleta é montada da escolha do usuário. Resultado:
**6 tons de pele × 9 cores de cabelo × 6 penteados = 324 aparências, e nenhum PNG a mais.**
`src/infrastructure/avatar/sprite.ts` pinta num canvas e devolve `data:` URI, memoizado.

**Três decisões de desenho que valem lembrar:**

1. **O contorno sai sozinho.** Um passe no fim escurece todo pixel que faz fronteira com o vazio,
   usando o tom escuro *daquele material* — cabelo ganha contorno de cabelo, pele de pele. E o traço
   da pele é uma versão bem escura do próprio tom, **nunca preto**: contorno preto chapado achata pele
   escura, e é o erro mais comum em pixel art com variação de tom. Teste garante a ordem
   `line < shade < base` em luminância nos seis tons.
2. **Camadas: cabelo de trás → corpo → cabelo da frente.** É o que faz o Longo cair atrás dos ombros
   e o Cacheado passar das orelhas em vez de virar um capacete.
3. **Os penteados incluem textura, não só comprimento.** Cacheado tem volume que passa da cabeça, com
   textura por pontos de sombra; Raspado é uma camada rente ao crânio. Sem isso, "dá pra fazer ele
   negro" seria só trocar a cor da pele — que é meia resposta.

**Onde vive:** `state.avatar`, **fora de `config`**. É identidade, não regra do dia — "Cancelar
sessão" não mexe nela, igual ao `tutorialSeen`. Campo novo no doc com default em `hydrateUserDoc`;
sem `schemaVersion` novo, e um id que sumir do catálogo cai no padrão em vez de virar buraco na tela.

**A UI** é Configurações → Geral → "Seu personagem", acima de "Aparência do app": preview animado,
swatches de pele e de cabelo, pills de penteado. Aplica **na hora**, sem "Salvar" — trocar de tom de
pele sem ver o resultado no mesmo segundo não faz sentido.

`public/idle/user/*.png` continua existindo, agora gerado por `scripts/character-sprites.mjs`, mas o
app não usa: serve ao `scripts/app-icon.mjs`, que faz os ícones do PWA. E `scripts/png.mjs` saiu de
dentro do `pixel-sprites.mjs` pra ser compartilhado pelos dois (24 das 25 formas de pet saem byte a
byte idênticas depois da extração — a 25ª difere só pelo zlib da máquina).

**Cosmético novo** = uma letra a mais na paleta e um desenho a mais. Roupa, óculos e acessório são a
direção óbvia.

## Perguntas pro Tomi (não dava pra perguntar no meio)

1. **A Maratona (do 5º estudo em diante) incomoda?** É a única que paga mais em dia longo. Não cobra
   nada e é opt-in (você escolhe o pet e a skill), mas se soar como "estude mais", troco por outra
   coisa — o Lobo e o Bisão são os donos dela.
2. **Vespertino é 12h–18h.** Se a sua tarde real começa mais cedo ou termina mais tarde, é um número
   só em `SKILLS`.
3. **Maratona no 5º estudo** ≈ 2h05 de pomos. Se o seu dia normal tem 6 blocos, ela acende 2×, não 3
   — o tier `alta` ficaria um pouco generoso. Fácil de mover pro 4º ou pro 6º.
4. **Nomes.** "Ponto final", "Retomada", "Descansado", "Hora extra", "Afinco", "Empenho",
   "Vespertino" — troquei o tom pra adulto e curto. Se algum não soar como você fala, é uma string.
5. **Commit.** Deixei tudo sem commitar porque a árvore tinha trabalho de outra sessão (extensão,
   `app-icon.mjs`, `app.css`) e `tests/__scratch.test.ts`, um arquivo de rascunho **não versionado**
   que quebra `npm run typecheck` (chama `generateBlocks` com 3 argumentos). Não apaguei porque não é
   meu. Provavelmente é lixo — se for, `rm tests/__scratch.test.ts`.
6. **`docs/` é uma pasta nova.** Se preferir o bestiário fora do repo, é só mudar `OUT` no gerador.
7. **O personagem não entrou no onboarding.** Hoje só dá pra escolher a aparência em Configurações.
   Escolher o personagem junto com o pet inicial seria o lugar natural — deixei de fora porque mexe
   num fluxo que já tem dois passos e é decisão sua.
8. **A roupa é a mesma pra todo mundo** (camiseta verde sálvia, calça azul). Não virou escolha porque
   você disse "por enquanto pode só mudar isso" — mas a paleta já tem as letras (`C`/`c`, `P`/`p`),
   então é só acrescentar catálogo.
9. **Os nomes dos tons de pele são materiais** — Areia, Mel, Amêndoa, Canela, Castanha, Ébano — de
   propósito: nomeiam a tinta, não a pessoa. Se preferir só as bolinhas sem nome, o nome hoje serve de
   `aria-label` e `title`.

## O que não foi feito

- **UI do app não mudou.** O card de skill em "Meus pets" já lê `SKILLS` e `skillDesc`, então mostra
  as novas sozinho. Mas o modal de evolução ainda não *explica* que escolher caminho é escolher uma
  build — agora que a escolha é mecanicamente relevante, vale uma linha ali.
- **`e2e` não rodou** (o smoke não toca skills; o `test:ext` só funciona em certas horas nesta
  máquina).
