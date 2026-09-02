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

## Grupos de estudo no plano (nome + objetivo num trecho do dia)

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

---

## Como esse arquivo deve crescer

- Adicionar ideias soltas como bullets ou parágrafos curtos. Não precisa ser formal.
- Quando uma ideia for pra virar feature, copiar pra um plan file em `plans/YYYY-MM-DD_HHMM_slug.md` com o detalhamento técnico — e deixar uma linha aqui marcando "→ virou plan X" ou apagar.
- Ideias podem morrer aqui também. Tudo bem.
