// Textos da interface. Um lugar só, pra que "abrir pra outras línguas" um dia seja
// trocar este arquivo — e não caçar 300 literais. Só o que já migrou pro React
// entra aqui; o legado ainda tem os textos dele inline.

/** Os números e nomes de uma notificação (ver domain/notifications.ts). Estrutural de
 *  propósito: `strings.ts` não importa domínio. */
/** "2026-09-10" → "10/09 · ". Vazio se não houver data. */
const curtaData = (dia?: string): string => (dia && dia.length === 10 ? `${dia.slice(8, 10)}/${dia.slice(5, 7)} · ` : '');

/** 155 → "2h35", 120 → "2h", 45 → "45min". */
const curtaDuracao = (m?: number): string => {
  if (!m || m <= 0) return '';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
};

type NotifData = {
  n?: number;
  nome?: string;
  pet?: string;
  xp?: number;
  petXp?: number;
  coins?: number;
  mins?: number;
  recorde?: boolean;
  dia?: string;
};

export const strings = {
  login: {
    charAlt: 'Personagem',
    eyebrow: '✦ SISTEMA DE ESTUDOS ✦',
    title: ['STUDY', 'PETS'],
    sub: ['Transforme sua rotina de estudos', 'numa aventura. Suba de nível. Evolua.'],
    features: [
      { icon: '⚡', label: ['Foco', 'inteligente'] },
      { icon: '📊', label: ['Analytics', 'pessoal'] },
      { icon: '🎮', label: ['XP &', 'Níveis'] },
    ],
    emailPlaceholder: 'E-mail',
    passwordPlaceholder: 'Senha',
    signIn: 'Entrar',
    signUp: 'Criar conta',
    loading: 'Aguarde…',
    needAccount: 'Criar conta',
    haveAccount: 'Já tenho conta',
    forgotPassword: 'Esqueci a senha',
    resetSent: (email: string) => `Enviamos um e-mail pra ${email}.`,
    or: 'ou',
    errors: {
      'email-in-use': "Já existe uma conta com este e-mail. Entre com o Google ou use \"Esqueci a senha\".",
      'invalid-credential': 'E-mail ou senha incorretos.',
      'weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
      'invalid-email': 'Digite um e-mail válido.',
      'too-many-requests': 'Muitas tentativas. Espere um pouco e tente de novo.',
      'network': 'Sem conexão. Verifique sua internet e tente de novo.',
      'unknown': 'Não deu pra completar. Tenta de novo.',
    } satisfies Record<import('../domain/auth').AuthErrorReason, string>,
    google: 'Continuar com Google',
    legal: { privacy: 'Privacidade', terms: 'Termos', imprint: 'Impressum' },
    finePrint: 'Dados salvos na nuvem · Sincronizado em todos os dispositivos',
  },
  tabs: {
    plano: 'Plano',
    analise: 'Análise',
    perfil: 'Perfil',
  },
  header: {
    sair: 'Sair',
    brand: 'study pets',
    settings: 'Configurações',
    menu: 'Conta',
    xp: (total: number) => `${total} XP`,
  },
  plan: {
    /** O quarto do pacote "Café de casa", na coluna do laptop. */
    room: {
      tagline: 'Boa companhia para o seu próximo passo.',
      seePets: 'Ver meus pets →',
      noPet: 'Sem pet equipado',
      noPetHint: 'Adote um na loja e ele vem morar aqui.',
      adopt: 'Adotar um pet →',
      level: (lv: number) => `Lv. ${lv}`,
    },
    xpTotal: 'XP Total',
    weekXp: (xp: number) => `Semana: ${xp} XP`,
    todayNone: 'Hoje: —',
    todayPending: (xp: number, coins: number) => `Hoje: +${xp} XP · +${coins} 🪙`,
    todayClosed: '✓ Hoje encerrado',
    stats: { estudos: 'Estudos', pausas: 'Pausas', semana: 'Semana' },
    weekChecks: (n: number) => `${n} ✓`,
    weekOption: (n: number, start: string, end: string) => `Semana ${n}  ·  ${start} – ${end}`,
    weekLabel: 'Semana visível',
    days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    cycles: ['Ciclo 1', 'Ciclo 2', 'Ciclo 3', 'Ciclo 4', 'Ciclo 5', 'Ciclo 6'],
    cycleFallback: 'Ciclo',
    /** A leva fechada: o divisor vira verde e uma faixa comemora (ver domain/cycles.ts). */
    cycleDone: (name: string, dur: string) => `${name} ✓ · ${dur}`,
    cycleCheer: {
      title: (name: string) => `✓ ${name} completo`,
      sub: (studies: number, dur: string, xp: number, pending: boolean) =>
        `${studies} ${studies === 1 ? 'estudo' : 'estudos'} · ${dur} · +${xp} XP` + (pending ? ' no fim do dia' : ''),
    },
    addEvent: '+ Evento',
    dayWindows: '🕘 Janelas do dia',
    dayWindowsEdited: '🕘 Janelas · editado',
    freeDay: '🌴 Dia livre',
    xpGain: (xp: number) => `+${xp} XP`,
    free: 'livre',
    eventTitle: 'Toque pra editar ou apagar este evento',
    checkLabel: (name: string) => `Marcar ${name} como concluído`,
    dragTitle: 'Arraste pra mudar o horário',
    dragGhost: (start: string, end: string) => `${start} – ${end}`,
    freeWeekend: '🌴 Fim de semana livre',
    freeDayHint: 'Quer estudar mesmo assim? Toque em 🕘 Janelas do dia e abra uma janela — só pra este dia.',
    notYet: 'Ainda não chegou 🔮',
    dayClosed: 'Dia encerrado 🔒',
    finishDay: 'Encerrar o dia',
    dayClosedBanner: 'Dia encerrado',
    floatXp: (xp: number) => `+${xp} XP`,
    floatCoins: (coins: number) => `+${coins} 🪙`,
    /** Na linha do bloco: quanto o timer ficou pausado dentro dele. */
    pausedTag: (mins: number) => `⏸ ${mins} min`,
    pausedTitle: (mins: number) => `O timer ficou ${mins} min pausado neste bloco — o fim inclui isso; o XP não`,
    /** Tela grande: o toggle Dia · Semana, a coluna da direita e a Semana. */
    view: { day: 'Dia', week: 'Semana' },
    side: {
      today: 'Hoje',
      pendingCoins: (coins: number) => `+${coins} moedas · pendente`,
      closed: 'Dia encerrado',
      none: 'Nada marcado ainda',
      goal: (min: number) => `Meta diária · ${min} min`,
      goalMin: 'min',
      goalDaysShort: (met: number, total: number) => `${met} de ${total} dias`,
    },
    week: {
      hour: (h: number) => `${h}h`,
      rest: { weekend: 'Fim de semana', off: 'Dia livre' },
      open: (day: string) => `Abrir ${day}`,
      drag: 'Arraste pra mover — pra outro horário ou outro dia',
    },
  },
  groups: {
    button: 'Agrupar',
    cancel: 'Cancelar',
    hintFirst: 'Toque no primeiro bloco do grupo',
    hintLast: 'Agora toque no último bloco',
    hintDrag: 'Arraste até o último bloco e solte',
    hintResize: 'Solte pra ajustar o trecho',
    panelNew: '✏️ Novo grupo',
    panelEdit: '✏️ Editar grupo',
    summary: (start: string, end: string, count: number, dur: string) =>
      `${start} – ${end} · ${count === 1 ? '1 estudo' : `${count} estudos`} · ${dur}`,
    range: (start: string, end: string) => `${start} – ${end}`,
    name: 'Nome',
    namePlaceholder: 'Ex: Análise II, Cap. 4 de Física...',
    goal: 'Objetivo (opcional)',
    goalPlaceholder: 'Ex: terminar a lista 3',
    create: 'Criar grupo',
    save: 'Salvar',
    delete: 'Apagar grupo',
    deleted: 'Grupo apagado',
    progress: (done: number, total: number) => `${done}/${total}`,
    progressDone: (done: number, total: number) => `✓ ${done}/${total}`,
    progressMins: (done: string, total: string) => `${done} de ${total}`,
    noStudy: 'sem estudos neste trecho',
    headerTitle: 'Toque pra editar o grupo',
    gripTitle: 'Arraste pra ajustar o trecho',
    refusal: {
      closed: 'Dia encerrado 🔒',
      'end-before-start': 'O fim tem que ser depois do início.',
      overlap: 'Já existe um grupo nesse trecho.',
      'no-study': 'Escolha um trecho com pelo menos um estudo.',
      'not-found': 'Esse grupo não existe mais.',
    },
  },
  events: {
    panel: {
      title: '📅 Novo Evento',
      tip1Title: 'Considere o deslocamento até a aula.',
      tip1: 'Antes de qualquer compromisso você precisa sair da sala de estudo e ir até o lugar do evento — isso leva tempo. Se a aula começa às 11:30 e o caminho leva uns 15 minutos, defina o evento a partir das 11:15. Assim os pomodoros param na hora certa e você não fica no meio de um bloco quando precisar sair.',
      tip2Title: 'E o tempo depois também.',
      tip2: 'Quando o evento acaba, geralmente tem um intervalo até você voltar a estudar. Considere adicionar 15 minutos ao fim do evento.',
      name: 'Nome do evento',
      namePlaceholder: 'Ex: Aula de Álgebra, Consulta...',
      time: 'Horário',
      start: 'Início',
      end: 'Fim',
      counts: 'Conta como estudo (dá XP e moedas)',
      presets: 'Atalhos',
      presetOther: '✏️ Outro',
      scope: 'Aplicar a',
      scopeDay: 'Só este dia',
      scopeSeries: 'Toda a série',
      editDayNote: 'Este dia sai da série e ganha um evento próprio com o que você mudar. Os outros dias continuam iguais.',
      countsHint: 'Marca pra aula, prova, palestra etc. (vira bloco de estudo, com check e XP). Desliga pra consulta, reunião, evento social etc. (bloqueia o tempo, sem XP).',
      repeat: 'Repetir este evento',
      weekdays: 'Dias da semana',
      freq: 'Frequência',
      freqs: { weekly: 'Toda semana', biweekly: 'A cada 2 semanas', monthly: 'Mensalmente' },
      until: 'Até',
      importLink: 'Tem tudo num calendário? Importe de um arquivo .ics →',
      noEnd: 'Sem fim',
      cancel: 'Cancelar',
      add: 'Adicionar',
      editTitle: '✏️ Editar evento',
      editSeriesNote: 'Vale pra série inteira — todos os dias em que ela aparece. Os dias já apagados continuam apagados.',
      save: 'Salvar',
      validation: {
        'end-before-start': 'O horário de fim deve ser depois do início.',
        'no-weekdays': 'Escolha pelo menos um dia da semana pra repetição.',
        'not-found': 'Esse evento não existe mais.',
      },
    },
    /** Arrastar um evento: o toast do que aconteceu e a pergunta de escopo da série. */
    moved: (name: string, start: string, day: Date | null): string => {
      const limpo = name.replace(/^📅\s*/, '');
      if (!day) return `${limpo} → ${start}`;
      return `${limpo} → ${day.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${start}`;
    },
    move: {
      title: '📅 Mover evento',
      text: (name: string, start: string, end: string) =>
        `"${name}" ia de ${start} a ${end}. Vale só pra este dia ou pra toda a série?`,
      onlyToday: 'Só este dia',
      series: 'Toda a série',
      cancel: 'Cancelar',
      refusal: {
        'end-before-start': 'O fim tem que ser depois do início.',
        'not-found': 'Esse evento não existe mais.',
        closed: 'Dia encerrado 🔒',
        'not-movable': 'Estudos e pausas são gerados pelo plano — mexa nas janelas ou nos eventos.',
        'series-other-day': 'Pra mudar o dia da semana da série, edite a série.',
      },
    },
    remove: {
      title: '📅 Evento',
      singleText: ['Vai apagar o evento ', '. Os checks ligados a ele somem junto.'],
      seriesText: ['Este evento faz parte de uma série recorrente (', '). Quer apagar só este dia ou toda a série?'],
      cancel: 'Cancelar',
      edit: '✏️ Editar',
      onlyToday: 'Só este dia',
      delete: 'Apagar',
      deleteSeries: 'Apagar a série',
    },
  },
  dayWindows: {
    title: '🕘 Janelas do dia',
    intro: 'Só pra este dia. A rotina em Configurações continua igual.',
    windowsLabel: 'Janelas de estudo',
    add: '+ Adicionar',
    startNow: '▶ Começar agora',
    dayOff: '🌴 Dia livre',
    dayOffConfirm: 'Declarar este dia como livre? Ele fica de fora da sequência e da meta — sem cobrança.',
    dayOffYes: 'Sim, dia livre',
    back: 'Voltar',
    restore: '↺ Restaurar rotina',
    offNote: '🌴 Dia livre. Restaure a rotina ou adicione uma janela pra estudar mesmo assim.',
    cancel: 'Cancelar',
    save: 'Salvar',
    saved: 'Janelas do dia ajustadas ✓',
    startedNow: (start: string) => `Começando às ${start} ▶`,
    dayOffSet: 'Dia livre 🌴',
    restored: 'Rotina de volta ↺',
    weekendNote: '🌴 Fim de semana livre. Adicione uma janela pra estudar mesmo assim — só neste dia; os outros continuam de folga.',
    refusal: {
      closed: 'Dia encerrado 🔒',
      past: 'Esse dia já passou.',
      'not-today': 'Só dá pra começar agora no dia de hoje.',
      'has-checks': 'Hoje já tem bloco marcado — dia livre é só antes de começar.',
      empty: 'Adicione pelo menos uma janela (ou declare o dia livre).',
      'invalid-window': 'Tem janela com o fim antes do início.',
      overlap: 'Duas janelas se sobrepõem.',
      'nothing-left': 'Não sobrou janela pra hoje — o dia de estudo já acabou.',
    },
  },
  session: {
    loadError: '⚠️ Erro ao carregar dados',
    loadFailed: {
      title: 'Não deu pra carregar seus dados',
      // Não afirma que existe histórico guardado: quem acabou de criar a conta e abre
      // sem rede cai aqui também, e ainda não tem documento nenhum no servidor.
      text: 'A leitura falhou no meio do caminho — provavelmente a conexão. Nada vai ser salvo enquanto o app não conseguir ler o que já existe, então o que estiver no servidor continua intacto.',
      reload: 'Tentar de novo',
      leave: 'Sair da conta',
    },
    booting: {
      title: 'Carregando seus dados…',
      text: 'Buscando seu plano, seus pets e seu histórico.',
    },
  },
  sync: {
    updated: 'Atualizado de outro dispositivo',
  },
  errorBoundary: {
    title: 'Algo quebrou',
    text: 'Um erro inesperado derrubou a tela. Seus dados estão salvos — recarregar resolve na maioria das vezes.',
    reload: 'Recarregar',
  },
  onboarding: {
    /** "Passo 2 de 3" — quem entra quer saber quanto falta. */
    stepOf: (i: number, n: number) => `Passo ${i} de ${n}`,
    windowsTitle: '🕘 A que horas você estuda',
    windowsIntro:
      'É daqui que sai o seu dia: o app enche essas faixas de pomodoros e pausas. Estuda de manhã e de noite? Dá pra ter mais de uma. Muda quando quiser.',
    windowsAdd: '+ Adicionar faixa',
    windowsPreview: (pomos: number, dur: string) => `Dá ${pomos} pomodoros · ${dur} de estudo`,
    windowsPreviewNone: 'Essa combinação não gera nenhum bloco ainda.',
    skipWeekends: 'Pular finais de semana (sáb e dom)',
    ageConfirm: 'Tenho 16 anos ou mais',
    ageWhy: 'É a idade mínima pra criar conta. O porquê está em:',
    begin: 'Começar',
    windowsInvalid: '⚠️ Confira as faixas: o fim tem que vir depois do início.',
    windowsOverlap: '⚠️ Duas faixas se sobrepõem.',
    windowsEmpty: '⚠️ Deixe pelo menos uma faixa de estudo.',
    avatarTitle: '👋 Bem-vindo! Quem vai estudar?',
    avatarIntro: 'Monte o seu personagem. Ele aparece no Perfil e no quarto, ao lado do pet — e dá pra mudar quando quiser.',
    avatarBack: '← Mudar personagem',
    starterTitle: '🐾 Escolha seu companheiro',
    starterIntro: 'Ele estuda com você desde o primeiro bloco e ganha XP junto. Escolhe um e dá um nome.',
    starterNotice: 'Sem estresse: todos os outros dá pra adotar depois, na loja, com as moedas que você ganha estudando.',
    next: 'Continuar',
    back: '← Trocar de pet',
    starterMissing: 'Escolhe um pet e dá um nome pra ele.',
  },
  tutorial: {
    next: 'Próximo',
    done: 'Entendi',
    skip: 'Pular',
    counter: (i: number, n: number) => `${i}/${n}`,
    /** Indexado pelo id do passo (`domain/tutorial.ts`). Duas linhas no máximo: explica o modelo, não o botão. */
    steps: {
      'plan-blocks': {
        title: 'Seu dia já está montado',
        text: 'Marque o check quando terminar um bloco. Tocar no bloco abre o modo foco.',
      },
      'plan-events': {
        title: 'A vida muda, o plano acompanha',
        text: 'Entrou uma aula, almoçou fora de hora? Registre aqui e o resto do dia se reorganiza. Sem culpa.',
      },
      'plan-finish': {
        title: 'No fim do dia, encerre',
        text: 'É aí que o XP e as moedas dos blocos marcados entram de verdade — pra você e pro seu pet.',
      },
      'profile-pet': {
        title: 'Pets são horas estudadas',
        text: 'O pet equipado ganha XP com cada bloco que você conclui. Com as moedas, adote outros na loja.',
      },
      'analytics-subnav': {
        title: 'Tô fazendo o que planejei?',
        text: 'Cumprido contra planejado, meta diária e os horários em que você mais rende.',
      },
    },
  },
  dayEnd: {
    confirmTitle: 'Encerrar o dia?',
    confirmText: ['Isso vai ', 'creditar o XP', ' dos blocos marcados de hoje (no usuário e no pet equipado) e ', 'travar os checks', ' deste dia.'],
    confirmFinal: 'Decisão final — não dá pra reabrir o dia depois.',
    cancel: 'Cancelar',
    confirm: 'Encerrar dia',
    summaryTitle: '🎉 Dia encerrado',
    xp: 'XP',
    coins: 'Moedas',
    levelUp: (level: number, name: string) => `Subiu pro nível ${level} — ${name}!`,
    petLevelUp: (from: number, to: number) => `Lv. ${from} → ${to} ✨`,
    petCanEvolve: '✨ Pode evoluir — quando quiser',
    empty: ['Nenhum bloco marcado hoje.', 'Dia encerrado sem ganhos.'],
    pauses: (count: number, mins: number) => `⏸ ${count === 1 ? '1 pausa' : `${count} pausas`} · ${mins} min`,
    continue: 'Continuar',
    promptTitle: '🌙 Passou do horário',
    promptIntro: (lastEnd: string) => `O último bloco de estudo (${lastEnd}) já passou. O que você quer fazer?`,
    promptFinishTitle: 'Encerrar o dia',
    promptFinishSub: 'Creditar XP, travar checks. Decisão final.',
    promptExtendTitle: 'Prolongar estudos',
    promptExtendSub: 'Mudar o horário de fim do dia.',
    newEnd: 'Novo horário de fim',
    back: 'Voltar',
    extend: 'Prolongar',
    extended: (end: string) => `Fim do dia: ${end} ⏰`,
  },
  profile: {
    name: 'Estudante',
    /**
     * O Perfil mostrava 0 XP, 0 blocos, 0 moedas logo depois de marcar três estudos —
     * a regra é boa (XP só entra com o dia fechado), mas só o Plano contava essa
     * metade. Quem vem ver o pet crescer merece a mesma frase.
     */
    pending: (xp: number, coins: number) => `Hoje: +${xp} XP · +${coins} 🪙 — entram quando você encerrar o dia`,

    nextLevel: 'próximo nível',
    max: 'MÁX',
    xpTotal: 'XP total',
    blocks: 'Blocos',
    study: 'Estudo',
    coins: 'Moedas',
    activeTag: 'Pet ativo',
    apXp: (xp: number, next: number, remaining: number, nextLevel: number) =>
      `${xp} / ${next} XP · faltam ${remaining} pro Lv. ${nextLevel}`,
    noActivePet: 'Nenhum pet equipado. Adote um na loja e equipe em "🐾 Meus pets".',
    myPets: 'Meus pets',
    shop: 'Loja de pets',
    count: (owned: number, total: number) => `${owned}/${total} ✨`,
    canEvolve: '✨ Pode evoluir',
    canEvolveCount: (n: number) => (n === 1 ? '1 pode evoluir' : `${n} podem evoluir`),
  },
  pets: {
    shopTitle: '🛒 Loja de pets',
    /** Uma linha por espécie: o que ela faz por você. Mostrada no onboarding E na loja. */
    traits: {
      dog: 'Fiel. Comemora o seu primeiro estudo do dia.',
      cat: 'Independente. Rende mais depois de uma pausa longa.',
      snake: 'Paciente. Fica forte quando você bate a meta do dia.',
      cow: 'Tranquila. Rende mais depois de uma refeição.',
      dove: 'Pontual. Rende mais nas aulas e nos compromissos do plano.',
    },
    /** O saldo no cabeçalho da loja: sem ele, o preço não diz nada. */
    balance: (coins: number) => `🪙 ${coins}`,
    balanceTitle: (coins: number) => `Você tem ${coins} moedas`,
    owned: (n: number) => (n === 1 ? '✓ você já tem um' : `✓ você já tem ${n}`),
    myPetsTitle: '🐾 Meus pets',
    empty: ['Nenhum pet ainda.', 'Visite a loja pra adotar um!'],
    badgeActive: 'Em uso',
    lv: (n: number) => `Lv. ${n}`,
    price: (p: number) => `🪙 ${p}`,
    adopt: 'Adotar',
    equip: 'Equipar',
    equipped: '✓ Em uso',
    skills: 'Skills',
    insufficient: 'Moedas insuficientes',
    buyTitle: 'Adotar pet?',
    buyText: ['Adotar ', ' por 🪙 ', '?'],
    cancel: 'Cancelar',
    nameLabel: 'Nome',
    namePlaceholder: 'Como vai se chamar?',
    nameDice: 'Sortear outro nome',
    nameInvalid: 'O nome precisa ter de 1 a 16 caracteres.',
    adopted: (name: string) => `${name} chegou! 🐾`,
    rename: 'Renomear',
    renameTitle: '✏️ Renomear',
    save: 'Salvar',
    evolve: '✨ Evoluir',
    evolveHint: (level: number) => `Evolui no Lv. ${level}`,
    evolveTitle: (name: string) => `✨ ${name} pode evoluir`,
    evolveChoose: 'Escolha o caminho. A escolha é definitiva — nome, XP e nível continuam.',
    evolveAdvance: (form: string) => `Próximo estágio: ${form}. Nome, XP e nível continuam.`,
    evolveNext: (form: string, level: number) => `depois: ${form} · Lv. ${level}`,
    evolveConfirm: 'Evoluir',
    evolved: (name: string, form: string) => `${name} evoluiu: ${form}! ✨`,
    detailTitle: (name: string) => `🐾 ${name}`,
    detailAll: 'Ver todos os pets ›',
  },
  analytics: {
    toNext: (xp: number, name: string) => `Faltam ${xp} XP para ${name}`,
    maxLevel: 'Nível máximo atingido! 🏆',
    sparkline: 'Tendência (8 sem)',
    sparklineTitle: (mins: readonly number[]) => `Últimas 8 semanas: ${mins.map((m) => `${m} min`).join(' · ')}`,
    views: { hoje: 'Hoje', semana: 'Semana', geral: 'Geral', recordes: 'Recordes' },
    adhToday: 'Realizado hoje',
    adhWeek: 'Realizado na semana',
    adhAll: 'Realizado no geral',
    /** A régua é a meta do período; o plano vem na linha de baixo, como contexto. */
    adhVal: (done: number, goal: number) => `${done} / ${goal} min`,
    adhValNone: '— / — min',
    adhSub: (doneH: number, plannedH: number) => `${doneH}h de estudo · ${plannedH}h no plano`,
    adhPct: (pct: number, met: boolean) => `${pct}%${met ? ' ✓' : ''}`,
    noData: 'nenhum dia cobra meta aqui',
    goalHeadline: ['Você bateu a meta de ', ' min em ', ' esta semana'],
    day: 'dia',
    days: 'dias',
    dotBefore: (d: string) => `${d} — antes de você começar`,
    dotWeekend: (d: string) => `${d} — fim de semana pausado`,
    dotOff: (d: string) => `${d} — dia livre`,
    dotFuture: (d: string) => `${d} — futuro`,
    dotMet: (d: string, done: number) => `${d}: ${done} min ✓`,
    dotMiss: (d: string, done: number, min: number) => `${d}: ${done} min (meta ${min})`,
    dropoffTitle: 'Conclusão por ciclo',
    historic: '(histórico)',
    dropoffEmpty: 'Ainda não há dados suficientes.',
    cycle: (n: number) => `Ciclo ${n}`,
    heatmapTitle: 'Plano cumprido — 16 semanas',
    cellFuture: (d: string) => `${d} — futuro`,
    cellBefore: (d: string) => `${d} — antes de você começar`,
    cellWeekend: (d: string) => `${d} — fim de semana`,
    cellOff: (d: string) => `${d} — dia livre`,
    cellValue: (d: string, today: boolean, done: number, goal: number, pct: number) =>
      `${d}${today ? ' (hoje)' : ''}: ${done} de ${goal} min (${pct}%)`,
    hoursTitle: 'Horários onde mais estuda',
    hourTitle: (h: number, count: number) => `${h}h: ${count} blocos concluídos`,
    blocksDone: 'Blocos feitos',
    daysInRow: 'Dias seguidos',
    bestWeek: 'Melhor semana',
    curStreak: '🔥 Sequência atual',
    bestStreak: '🏆 Maior sequência',
    bestDay: '📖 Melhor dia (blocos)',
    bestXp: '⚡ XP num único dia',
    daysCount: (n: number) => `${n} dias`,
  },
  settings: {
    fab: 'Configurações',
    back: '← Voltar',
    title: 'Configurações',
    tabs: { day: 'Estrutura do dia', general: 'Geral' },
    reset: '↺ Padrão',
    save: 'Salvar',
    incomplete: 'Preencha todos os campos antes de salvar.',
    summary: {
      title: 'Como fica o dia',
      desc: 'Um dia com as janelas e o ritmo acima. Refeições e eventos entram pelo Plano.',
      warn: {
        incomplete: 'Preencha todos os campos para ver o resumo.',
        'no-windows': 'Adicione pelo menos uma janela de estudo válida.',
        'no-blocks': 'Essa combinação não gera nenhum bloco. Ajuste as janelas ou as durações.',
      },
      tiles: { pomos: 'pomos', study: 'estudo', pauses: 'pausas', xp: 'XP/dia' },
      xpApprox: (xp: number) => `~${xp}`,
      windows: (n: number) => `Distribuídos em ${n} janelas de estudo.`,
      noteOk: (end: string) => `Fecha o dia às ${end}, certinho no fim da última janela.`,
      noteOver: (diff: number, end: string) => `Passa ${diff} min das ${end} — o último bloco vaza da janela.`,
      noteUnder: (actual: string, diff: number, end: string) =>
        `Para às ${actual}, ${diff} min antes das ${end} — sobra um tempo sem bloco.`,
    },
    windows: {
      title: 'Janelas de estudo',
      add: '+ Adicionar',
      desc: 'Os intervalos do dia em que você estuda. Valem para todos os dias — refeições e compromissos entram como eventos, no Plano.',
      startLabel: 'Início da janela',
      endLabel: 'Fim da janela',
      remove: 'Remover janela',
      endBeforeStart: 'fim antes do início',
      atLeastOne: 'Pelo menos uma janela é necessária.',
    },
    timeline: {
      study: 'estudo',
      pause: 'pausa',
      event: 'evento',
      interval: 'refeição / intervalo',
      now: 'agora',
    },
    rhythm: {
      title: 'Ritmo do pomodoro',
      desc: 'A duração de cada bloco. A pausa longa entra a cada 4 pomodoros.',
      study: 'Estudo (min)',
      short: 'Pausa curta (min)',
      long: 'Pausa longa (min)',
      fit: '🎯 Encaixar estudo nos meus horários',
      fitHint: 'Testa combinações de duração e mostra as que melhor preenchem suas janelas, sem sobrar tempo morto.',
    },
    period: {
      title: 'Período de uso',
      desc: 'O intervalo em que você quer ganhar XP e acompanhar seu progresso.',
      start: 'Início',
      end: 'Fim',
      startFixed: 'O início é fixo. Use "Apagar todo o histórico" pra recomeçar.',
      hint: 'O início é fixo — só muda apagando todo o histórico.',
      clearEnd: 'Usar sem data de fim',
      skipWeekends: 'Pular finais de semana',
      skipWeekendsSub: 'Sábado e domingo ficam livres, sem blocos e sem cobrança de meta. Num fim de semana específico dá pra abrir uma janela em 🕘 Janelas do dia.',
    },
    goal: {
      title: 'Meta diária',
      desc: 'Quanto você precisa estudar num dia para manter a sequência e ganhar o bônus de moedas.',
      label: 'Minutos por dia (15–240)',
    },
    data: {
      title: 'Meus dados',
      desc: 'Tudo que o app guarda sobre você, num arquivo seu.',
      rowTitle: 'Baixar meus dados',
      rowDesc: 'Um JSON com checks, eventos, pets, configurações — o documento inteiro, sem e-mail nem identificador.',
      button: 'Baixar (JSON)',
      done: 'Arquivo gerado ✓',
      failed: 'Não deu pra gerar o arquivo neste navegador.',
    },
    avatar: {
      title: 'Seu personagem',
      desc: 'Quem aparece no Perfil e no quarto, ao lado do pet. Muda na hora e vale em todos os seus aparelhos.',
      previewAlt: 'Seu personagem',
      skin: 'Tom de pele',
      hair: 'Cor do cabelo',
      style: 'Cabelo',
      body: 'Corpo',
      hint: 'Apagar o histórico não mexe nisto — o personagem é seu, não do plano.',
    },
    tema: {
      title: 'Aparência do app',
      desc: 'A cara do app. Só cor e tipografia mudam — o plano, os horários e os dados continuam iguais.',
      hint: 'Vale só neste dispositivo. Pra comparar rápido, dá pra abrir o app com ?tema=cafe no fim do endereço.',
    },
    tour: {
      title: 'Tutorial',
      desc: 'Os balões que apresentam cada aba na primeira vez que você entra nela.',
      rowTitle: 'Ver o tour de novo',
      rowDesc: 'Os cinco balões voltam, começando pelo Plano. Nada mais muda.',
      button: 'Ver de novo',
    },
    legal: {
      title: 'Documentos',
      desc: 'Quem é o responsável, o que o app guarda sobre você, e as regras do serviço.',
      privacy: 'Política de privacidade',
      privacyDesc: 'Que dados o app guarda, por quê, com quem, e como apagar tudo.',
      terms: 'Termos de uso',
      termsDesc: 'O que o serviço promete — e o que ele não promete.',
      imprint: 'Impressum',
      imprintDesc: 'A identificação do responsável, como o § 5 DDG exige.',
      open: 'Abrir ↗',
    },
    danger: {
      title: 'Zona de perigo',
      cancelTitle: 'Apagar todo o histórico',
      cancelDesc: 'Apaga checks, eventos, pets e configurações, e reabre o onboarding. Sua conta continua existindo.',
      cancelBtn: 'Apagar todo o histórico',
      deleteTitle: 'Apagar minha conta',
      deleteDesc: 'Remove a conta e todos os dados do servidor. Você é desconectado e nada pode ser recuperado.',
      deleteBtn: 'Apagar conta',
    },
    fit: {
      title: '🎯 Encaixar estudo',
      intro: '💡 Diz como você gosta de estudar e eu sugiro 3 combinações que melhor encaixam nas janelas livres do dia visível (respeita as janelas e os eventos do dia, refeições incluídas).',
      pomo: 'Pomodoro ideal (min)',
      short: 'Pausa curta ideal (min)',
      long: 'Pausa longa ideal (min)',
      flex: 'Aceito flexibilidade de',
      flexOption: (n: number) => `±${n} min`,
      cancel: 'Cancelar',
      run: 'Calcular sugestões',
      none: 'Não encontrei combinações válidas. Aumente a flexibilidade ou ajuste os ideais.',
      best: '✨ Recomendada',
      option: (n: number) => `Opção ${n}`,
      stats: { pomo: 'Pomo', short: 'Pausa', long: 'Longa' },
      meta: (count: number, dur: string, end: string) => `${count} estudos · ${dur} efetivos · termina às ${end}`,
      apply: 'Aplicar',
      applied: 'Sugestão preenchida — clica em Salvar pra confirmar',
    },
    cancel: {
      title: '⚠️ Apagar todo o histórico?',
      intro: 'Isso vai apagar ',
      introStrong: 'tudo',
      items: ['Todos os checks feitos', 'Eventos, refeições e séries recorrentes', 'Pets adotados e moedas', 'Configurações personalizadas'],
      outro: 'Depois você vai começar do zero, como uma conta nova. ',
      outroStrong: 'Esta ação não pode ser desfeita.',
      back: 'Voltar',
      confirm: 'Sim, apagar tudo',
      done: 'Histórico apagado — começando do zero',
      exportFirst: '⬇ Baixar seus dados antes',
    },
    deleteAccount: {
      title: '🗑️ Apagar sua conta?',
      intro: 'Isso apaga ',
      introStrong: 'a conta inteira',
      introRest: ', não só a sessão:',
      items: ['Todo o histórico de checks, XP e moedas', 'Eventos e séries recorrentes (refeições incluídas)', 'Pets adotados e skills', 'Seu acesso — você será desconectado'],
      outro: 'Nada disso pode ser recuperado. Se você só quer recomeçar do zero mantendo a conta, use ',
      outroStrong: 'Apagar todo o histórico',
      typeToConfirm: ['Digite ', 'APAGAR', ' pra confirmar'],
      keyword: 'APAGAR',
      passwordLabel: 'Confirme sua senha pra apagar a conta',
      passwordPlaceholder: 'Senha',
      back: 'Voltar',
      confirm: 'Apagar para sempre',
      status: {
        deleting: 'Apagando...',
        reauth: 'Confirmando sua identidade pra finalizar...',
        'no-user': 'Ninguém logado',
        'data-failed': '⚠️ Não deu pra apagar seus dados. Tenta de novo.',
        'reauth-failed': '⚠️ Seus dados foram apagados, mas a conta continua. Entre de novo e repita pra concluir.',
        'delete-failed': '⚠️ Seus dados foram apagados, mas não deu pra remover a conta. Tenta de novo.',
      },
      done: 'Conta apagada. Até mais 👋',
    },
  },
  timer: {
    /** O cartão "Agora · Iniciar" do laptop, quando nenhum timer roda. */
    now: {
      kicker: (time: string) => `Agora · ${time}`,
      next: (time: string) => `Próximo · ${time}`,
      dur: (min: number, type: string) => `${min} min de ${type === 'pausa' ? 'pausa' : 'estudo'}`,
      start: 'Iniciar',
    },
    inProgress: 'Em andamento',
    startsIn: 'Começa em',
    /** "Pausado · 03:12" — o rótulo da barra enquanto o relógio está congelado (o "há" saía como "há 00:00" no primeiro segundo). */
    pausedFor: (since: string) => `Pausado · ${since}`,
    pause: '⏸ Pausar',
    resume: '▶ Retomar',
    stop: '✕ Parar',
    mute: 'Silenciar',
    /** Ao retomar: quanto durou e o que mudou no plano (os pedaços vêm de `planDeltaParts`). */
    pauseRecorded: (mins: number, parts: string[], droppedChecks: number) =>
      `⏸ Pausa de ${mins} min · o dia anda ${mins} min` +
      (parts.length ? ` · ${parts.join(' · ')}` : '') +
      (droppedChecks > 0 ? ` · ${droppedChecks === 1 ? '1 check ficou sem bloco' : `${droppedChecks} checks ficaram sem bloco`}` : ''),
    pauseEnded: 'O bloco terminou durante a pausa — marque à mão se quiser ✓',
    pauseMidnight: 'A pausa atravessou a meia-noite: o timer foi encerrado 🌙',
    pauseRefusal: (r: { reason: 'no-timer' } | { reason: 'hardcore' } | { reason: 'not-running' } | { reason: 'day-closed' }) =>
      r.reason === 'hardcore' ? 'No modo hardcore não tem pausa 🔥'
      : r.reason === 'not-running' ? 'O bloco ainda não começou ⏳'
      : r.reason === 'day-closed' ? 'Dia encerrado 🔒'
      : 'Nenhum bloco rodando',
    refusal: (r: { reason: import('../domain/timer').StartRefusal['reason'] }) =>
      r.reason === 'not-today' ? 'Só dá pra iniciar timer em blocos de hoje 📅'
      : r.reason === 'day-closed' ? 'Dia encerrado 🔒'
      : r.reason === 'forfeited' ? 'Você desistiu deste bloco 🔥'
      : 'Este bloco já terminou ⏎',
    /** "✓ Estudo 3 concluído · +50 XP · +25 🪙" — a faixa no foco e o toast no plano. */
    completed: (c: { name: string; type: string; xp: number; coins: number }) =>
      `✓ ${c.name} ${c.type === 'pausa' ? 'concluída' : 'concluído'}` +
      (c.xp ? ` · +${c.xp} XP` : '') +
      (c.coins ? ` · +${c.coins} 🪙` : ''),
    notification: {
      study: '📖 Estudo concluído! Hora da pausa.',
      break: '🧘 Pausa concluída! Hora de estudar.',
    },
    focus: {
      exit: '← Sair do foco',
      chip: (cycle: string) => cycle,
      pomodoroOf: (min: number) => `Pomodoro de ${min} min`,
      breakOf: (min: number) => `Pausa de ${min} min`,
      completed: (pct: number) => `${pct}% concluído`,
      startsAt: (time: string) => `começa às ${time}`,
      pausedFor: (since: string) => `pausado · ${since}`,
      onComplete: ' ao concluir',
      next: 'Em seguida',
      endOfDay: 'Fim do dia 🌙',
      minutes: (min: number) => `${min} min`,
    },
  },
  siteBlock: {
    settings: {
      title: 'Bloqueio de sites',
      desc: 'Enquanto um estudo está rodando, os sites da sua lista mostram o seu pet em vez da página. Funciona com ou sem o modo hardcore.',
      toggle: 'Bloquear sites durante o estudo',
      toggleSub: 'Vale só neste navegador, e só enquanto um estudo está rodando — a pausa libera. Precisa da extensão.',
      modes: { blacklist: 'Bloquear estes', whitelist: 'Permitir só estes' },
      sitesLabel: 'Sites',
      sitesPlaceholder: 'chess.com\nyoutube.com\ninstagram.com',
      sitesHint: 'Um por linha. Pode colar a URL inteira — o que vale é o domínio, e ele cobre todo subdomínio, caminho e porta.',
      previewEmpty: 'Escreva pelo menos um site pra bloquear.',
      previewEmptyWhitelist: 'Sem nenhum site liberado, tudo fica bloqueado durante o estudo.',
      alias: (list: readonly string[]) => ` (+ ${list.join(', ')})`,
      invalid: (list: readonly string[]) => `Não entendi: ${list.join(', ')}`,
      ext: {
        ok: (version: string | null) => `✓ Extensão encontrada${version ? ` · v${version}` : ''} — a lista vale neste navegador.`,
        missing: 'Uma página web não consegue bloquear site nenhum — quem faz isso é uma extensão de navegador, que vem junto com o Study Pets (a pasta extension/ do projeto). Ela ainda não está neste navegador:',
        steps: [
          'Abra chrome://extensions (ou edge://extensions).',
          'Ligue o "Modo do desenvolvedor" ("Developer mode"), no canto de cima à direita.',
          'Clique em "Carregar sem compactação" ("Load unpacked") — o primeiro dos três botões, não o "Pack extension" — e escolha a pasta extension/. Ela parece vazia no seletor porque só tem arquivos: confirme assim mesmo.',
        ],
        reload: 'Já instalou? Clique em ↻ na extensão e recarregue esta página.',
        privacy: 'Ela é sua e roda só aqui: não manda seus dados pra lugar nenhum e não guarda seu histórico — só o bloco que está rodando agora, apagado quando ele acaba. A única coisa que ela busca na rede é a imagem do seu pet, no próprio Study Pets.',
        blocking: (n: number, until: string) => `✓ Bloqueando ${n} ${n === 1 ? 'site' : 'sites'} até ${until}`,
        blockingTest: (n: number, until: string) => `✓ Teste rodando · ${n} ${n === 1 ? 'site' : 'sites'} até ${until}`,
      },
      test: {
        start: '▶ Testar por 1 min',
        stop: '■ Parar teste',
        hint: 'Arma o bloqueio por um minuto com a lista acima — sem salvar, sem esperar um estudo.',
        running: (sec: number) => `Abra um dos sites: ele vira a tela do pet. Acaba em ${sec}s.`,
        noSites: 'Escreva pelo menos um site pra testar.',
        noExt: 'Extensão não encontrada neste navegador.',
      },
    },
    /** A linha discreta na barra do timer e no foco, enquanto a extensão confirma o bloqueio. */
    live: (n: number) => `🛡️ ${n} ${n === 1 ? 'site bloqueado' : 'sites bloqueados'}`,
    liveWhitelist: (n: number) => `🛡️ só ${n} ${n === 1 ? 'site liberado' : 'sites liberados'}`,
    /** "chess.com, youtube.com e mais 1" — a lista curta que cabe numa linha. */
    shortList: (sites: readonly string[]) => {
      const shown = sites.slice(0, 2).join(', ');
      const rest = sites.length - 2;
      return rest > 0 ? `${shown} e mais ${rest}` : shown;
    },
  },
  hardcore: {
    settings: {
      title: 'Modo hardcore',
      desc: 'Dificuldade escolhida: sair de um estudo no modo foco custa XP. Nada muda enquanto estiver desligado.',
      toggle: 'Ativar modo hardcore',
      toggleSub: 'Desistir de um estudo custa 2× o XP do bloco — pra você e pro pet equipado, na hora. Pausa é saída livre.',
      siteNote: "Bloquear sites é separado — veja 'Bloqueio de sites' acima. Funciona com ou sem hardcore.",
    },
    start: {
      title: '🔥 Modo hardcore',
      block: (name: string, min: number) => `${name} · ${min} min`,
      cost: (xp: number, pet: string | null) =>
        pet ? `Sair antes do fim custa −${xp} XP pra você e −${xp} XP pro ${pet}.` : `Sair antes do fim custa −${xp} XP.`,
      sites: (list: string) => `🛡️ ${list} ficam bloqueados até o fim.`,
      sitesOne: (site: string) => `🛡️ ${site} fica bloqueado até o fim.`,
      sitesWhitelist: (list: string) => `🛡️ Só ${list} continuam abertos até o fim.`,
      sitesNoExt: '🛡️ Extensão não encontrada — sem bloqueio de sites neste navegador.',
      rules: 'Sem "Sair do foco" até o bloco acabar. Na pausa você pode parar de graça; fechar a aba conta como sair.',
      confirm: 'Começar',
      normal: 'Só desta vez, sem hardcore',
      cancel: 'Cancelar',
    },
    focus: {
      chip: '🔥 Hardcore',
      quit: 'Desistir…',
      stop: 'Parar aqui (sem custo)',
      cancel: 'Cancelar (sem custo)',
      quitTitle: (name: string) => `Desistir de ${name}?`,
      quitUser: (xp: number, from: number, to: number) =>
        `Você perde ${xp} XP` + (to < from ? ` e desce do nível ${from} pro ${to}` : '') + '.',
      quitUserNothing: 'Você não tem XP a perder — mas o bloco fica sem check.',
      quitPet: (name: string, xp: number, from: number, to: number) =>
        `${name} perde ${xp} XP` + (to < from ? ` e cai do Lv. ${from} pro Lv. ${to}` : '') + '.',
      quitPetNothing: (name: string) => `${name} não tem XP a perder.`,
      quitFinal: 'O bloco fica sem check e não pode ser marcado depois.',
      keepGoing: 'Continuar estudando',
      quitConfirm: 'Desistir',
    },
    plan: {
      forfeited: 'desistiu',
      forfeitedToast: 'Você desistiu deste bloco 🔥',
    },
    toast: {
      quit: (name: string, cost: { userXp: number; petXp: number }, pet: string | null) =>
        `🔥 Desistiu de ${name.replace(/📖|🧘|☕/g, '').trim()} · −${cost.userXp} XP` + (pet && cost.petXp > 0 ? ` · ${pet} −${cost.petXp} XP` : ''),
      abandoned: (name: string, cost: { userXp: number; petXp: number }, pet: string | null) =>
        `🔥 O app fechou no meio de ${name.replace(/📖|🧘|☕/g, '').trim()} · −${cost.userXp} XP` + (pet && cost.petXp > 0 ? ` · ${pet} −${cost.petXp} XP` : ''),
    },
  },
  notifications: {
    open: 'Notificações',
    title: 'Notificações',
    /** Passou de 9, o selo vira "9+" — o número exato ali não muda nada. */
    badge: (n: number) => (n > 9 ? '9+' : String(n)),
    clear: 'Limpar',
    emptyTitle: 'Nada por aqui ainda.',
    emptyBody: 'O que acontece enquanto você não está olhando aparece aqui: o dia que fechou, o nível que subiu, o pet que pode evoluir.',
    /** "há 5 min", "ontem". Recebe o que `ageOf` devolve. */
    when: (age: { unit: string; n?: number }) => {
      if (age.unit === 'agora') return 'agora';
      if (age.unit === 'min') return `há ${age.n} min`;
      if (age.unit === 'h') return `há ${age.n}h`;
      if (age.unit === 'ontem') return 'ontem';
      return `há ${age.n} dias`;
    },
    icon: {
      nivel: '🆙',
      'pet-nivel': '🐾',
      'pet-evolucao': '✨',
      dia: '✓',
      sequencia: '🔥',
      horas: '⏳',
      abandono: '💀',
    } as Record<string, string>,
    /** A primeira linha. Sempre existe — e nunca escreve "undefined": um documento
     *  antigo ou torto pode chegar aqui sem um dos números (teste varre os dois mapas). */
    text: {
      nivel: (d: NotifData) => (d.n ? `Você chegou no nível ${d.n}` : 'Você subiu de nível'),
      'pet-nivel': (d: NotifData) => `${d.nome ?? 'Seu pet'} chegou no Lv. ${d.n ?? 1}`,
      'pet-evolucao': (d: NotifData) => `${d.nome ?? 'Seu pet'} pode evoluir`,
      dia: () => 'Dia encerrado',
      sequencia: (d: NotifData) => `${d.n ?? 0} dias seguidos batendo a meta`,
      horas: (d: NotifData) => `${d.n ?? 0} horas de estudo`,
      abandono: (d: NotifData) => `O app fechou no meio de ${d.nome ?? 'um estudo'}`,
    } as Record<string, (d: NotifData) => string>,
    /** A segunda linha. Pode ser vazia. */
    body: {
      nivel: (d: NotifData) => d.nome ?? '',
      'pet-nivel': () => '',
      'pet-evolucao': () => 'Escolha o caminho quando quiser — é pra sempre.',
      // A data vai junto: voltar depois de uns dias fora rende até três linhas de
      // "Dia encerrado" de uma vez, todas carimbadas no mesmo instante — sem o dia,
      // as três ficam idênticas. E o tempo estudado no lugar das moedas: é o que
      // tira a linha de ser cópia do resumo que a pessoa acabou de fechar.
      dia: (d: NotifData) =>
        `${curtaData(d.dia)}+${d.xp ?? 0} XP` +
        (d.mins ? ` · ${curtaDuracao(d.mins)}` : '') +
        (d.recorde ? ' · 🏆 melhor dia' : ''),
      sequencia: (d: NotifData) => (d.coins ? `Rende ${d.coins} 🪙 de bônus por dia.` : ''),
      horas: () => 'Desde o primeiro pomodoro.',
      abandono: (d: NotifData) =>
        `−${d.xp ?? 0} XP pra você` + (d.pet && d.petXp ? ` · ${d.pet} −${d.petXp} XP` : ''),
    } as Record<string, (d: NotifData) => string>,
  },
  calendarImport: {
    settings: {
      title: 'Importar calendário',
      desc: 'As aulas do semestre, os compromissos fixos — o que já está no seu calendário não precisa ser digitado de novo aqui.',
      rowTitle: 'Importar de um arquivo',
      rowDesc: 'Exporte o calendário do Google, do Outlook ou do sistema da faculdade como .ics. Você revê tudo antes de qualquer coisa entrar no plano.',
      button: 'Escolher arquivo (.ics)',
      reading: 'Lendo…',
      howTitle: 'Onde achar esse arquivo',
      howSteps: [
        'Google Agenda: Configurações → Importar e exportar → Exportar. Vem um .zip; use o .ics de dentro.',
        'Outlook: Arquivo → Salvar Calendário; no site, Adicionar calendário → Publicar.',
        'Faculdade: procure por “exportar”, “iCal” ou “assinar calendário” no sistema de matrícula.',
      ],
      errors: {
        unreadable: 'Não deu pra ler esse arquivo neste navegador.',
        'not-ics': 'Esse arquivo não parece um calendário (.ics).',
        empty: 'Não achei nenhum compromisso nesse arquivo.',
      },
    },
    review: {
      title: 'O que importar',
      from: (name: string | null) => (name ? `De “${name}”` : 'Do arquivo escolhido'),
      intro: 'Marque o que deve entrar no plano, e o que dá XP. Nada é importado antes de você confirmar.',
      all: 'Marcar todos',
      none: 'Desmarcar todos',
      xp: 'XP',
      xpHint: 'Aula e monitoria contam como estudo e dão XP; consulta e deslocamento só reservam o tempo.',
      nothing: 'Nada nesse arquivo cai daqui pra frente — só compromissos que já passaram.',
      weekdays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
      everyDay: 'todo dia',
      freq: { weekly: 'toda semana', biweekly: 'a cada 2 semanas', monthly: 'todo mês' } as Record<string, string>,
      times: (n: number) => (n === 1 ? '1 vez' : `${n} vezes`),
      dates: (n: number) => (n === 1 ? '1 data' : `${n} datas`),
      until: (d: string) => `até ${d}`,
      notes: {
        'crosses-midnight': 'passa da meia-noite — entra até 23:59',
        expanded: 'repetição irregular — importada data a data',
      } as Record<string, string>,
      skippedTitle: (n: number) => (n === 1 ? '1 ficou de fora' : `${n} ficaram de fora`),
      skipped: {
        'all-day': 'dia inteiro, sem horário',
        cancelled: 'cancelado',
        'no-start': 'sem data legível',
        'no-end': 'sem duração',
        'out-of-range': 'já passou',
      } as Record<string, string>,
      cancel: 'Cancelar',
      submit: (n: number) => (n === 0 ? 'Escolha o que importar' : `Importar ${n === 1 ? '1 compromisso' : `${n} compromissos`}`),
      done: (n: number, replaced: number) =>
        `📅 ${n === 1 ? '1 compromisso' : `${n} compromissos`} no plano` + (replaced > 0 ? ' · a importação anterior foi substituída' : ''),
      empty: 'Nada marcado — nada mudou.',
    },
  },
} as const;
