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

---

## Como esse arquivo deve crescer

- Adicionar ideias soltas como bullets ou parágrafos curtos. Não precisa ser formal.
- Quando uma ideia for pra virar feature, copiar pra um plan file em `plans/YYYY-MM-DD_HHMM_slug.md` com o detalhamento técnico — e deixar uma linha aqui marcando "→ virou plan X" ou apagar.
- Ideias podem morrer aqui também. Tudo bem.
