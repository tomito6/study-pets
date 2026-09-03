# Grupos de estudo no plano (nome + objetivo num trecho do dia)

Criado em 2026-09-03. Branch: `feat/grupos-de-estudo` (worktree `../study-pets-grupos`). Ideia e
avaliação em `IDEIAS.md`; este arquivo registra o que foi construído e as decisões.

## O que é

O usuário seleciona um trecho do plano do dia (ex.: 08:00 às 14:00) e dá nome e objetivo a ele:
"Análise II · terminar a lista 3". O grupo aparece como cabeçalho acima do primeiro bloco, com
progresso (`feitos/total` e minutos), e as linhas membros ficam indentadas com o acento da sessão.

## Decisões

- **Anotação por horário, nunca entrada do gerador.** `state.groups[dateKey] = [{id, start, end,
  name, goal}]`. Pertencimento = bloco que cabe inteiro no intervalo, calculado na render. Config ou
  evento mudando não corrompe nada (mesmo princípio dos checks por horário). Planner intocado.
- **Uma máquina de estados, três portas de entrada** (`features/groups/useGroupSelection.ts`):
  botão direito arrastando (desktop, com pointer capture + `elementFromPoint`), toque longo de 450ms
  numa linha (celular; o click que vem ao soltar o dedo é suprimido), e o botão "Agrupar" (toca no
  primeiro, depois no último; com mouse, hover mostra o intervalo). Esc cancela. A primitiva é
  "intervalo de linhas" — o gesto é só açúcar.
- **Seleção é `useState` do `PlanTab`**, não vai pro store: sobrevive ao re-render por minuto e por
  check porque é estado React, não DOM.
- **Validação** (`domain/groups.ts`): fim > início; sem sobrepor outro grupo (checado antes de
  "sem estudo", porque é o motivo mais útil); ≥ 1 estudo/evento dentro. Recusa vira toast, sem abrir
  o modal.
- **Dia encerrado é read-only; dia futuro pode.** Planejar o amanhã é o ponto.
- **Progresso** conta estudo e evento pela duração real; pausa é membro visual, sem contar.
- **Sem segundo sistema de cores**: cabeçalho neutro com `--sc`/`--sc-border` da sessão do primeiro
  membro. Grupo que ficou sem bloco (plano mudou) continua visível, tracejado, pra editar/apagar.
- **Persistência**: campo `groups` no doc, `hydrateUserDoc` tolera ausente/malformado (só entra
  grupo com id/start/end; nome vazio vira "Grupo"). Grupos em dias futuros contam como dado pra
  `rebuildWeeks`. Cancelar sessão zera.
- **Nome vazio vira "Grupo"** (como evento vira "Evento") — sem travar o fluxo por causa de um campo.

## Fora da v1 (ver IDEIAS.md)

"Cumpri o objetivo?" no fim do grupo alimentando a Análise por assunto; recorrência (reaproveitar
`eventSeries`); entidade "matéria" agregando horas; cores por matéria.

## Testes

- `tests/groups.test.ts` (domínio) e `tests/application-groups.test.ts` (casos de uso, incluindo
  dia encerrado/futuro, semanas e cancelar sessão). `tests/persistence.test.ts` cobre doc sem o
  campo e doc malformado.
- `e2e/smoke.spec.ts` ganhou o 11 (fluxo pelo botão + check + editar + reload) e o 12 (arrastar com
  botão direito + recusa por sobreposição).
- `playwright.config.ts` aceita `PW_PORT` pra rodar a suíte quando a 5174 já está ocupada.
