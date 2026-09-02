// Textos da interface. Um lugar só, pra que "abrir pra outras línguas" um dia seja
// trocar este arquivo — e não caçar 300 literais. Só o que já migrou pro React
// entra aqui; o legado ainda tem os textos dele inline.

export const strings = {
  login: {
    charAlt: 'Personagem',
    eyebrow: '✦ SISTEMA DE ESTUDOS ✦',
    title: ['STUDY', 'PETS'],
    sub: ['Transforme sua rotina de estudos', 'numa aventura. Suba de nível. Evolua.'],
    features: [
      { icon: '⚡', label: ['Pomodoro', 'inteligente'] },
      { icon: '📊', label: ['Analytics', 'pessoal'] },
      { icon: '🎮', label: ['XP &', 'Níveis'] },
    ],
    google: 'Continuar com Google',
    finePrint: 'Dados salvos na nuvem · Sincronizado em todos os dispositivos',
  },
  tabs: {
    plano: '📚 Plano',
    analise: '📊 Análise',
    perfil: '🧑 Perfil',
  },
  header: {
    sair: 'Sair',
    xp: (total: number) => `${total} XP`,
  },
  plan: {
    xpTotal: 'XP Total',
    weekXp: (xp: number) => `Semana: ${xp} XP`,
    todayNone: 'Hoje: —',
    todayPending: (xp: number, coins: number) => `Hoje: +${xp} XP · +${coins} 🪙`,
    todayClosed: '✓ Hoje encerrado',
    stats: { estudos: 'Estudos', pausas: 'Pausas', semana: 'Semana' },
    weekChecks: (n: number) => `${n} ✓`,
    weekOption: (n: number, start: string, end: string) => `Semana ${n}  ·  ${start} – ${end}`,
    days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    sessions: ['Sessão 1', 'Sessão 2', 'Sessão 3', 'Sessão 4', 'Sessão 5', 'Sessão 6'],
    sessionFallback: 'Sessão',
    addEvent: '+ Evento',
    freeDay: '🌴 Dia livre',
    xpGain: (xp: number) => `+${xp} XP`,
    lunchEdit: '✏️ editar',
    lunchEdited: '✏️ editado',
    lunchTitle: 'Clique para editar o almoço de hoje',
    free: 'livre',
    eventTitle: 'Clique pra apagar este evento',
    notYet: 'Ainda não chegou 🔮',
    dayClosed: 'Dia encerrado 🔒',
    finishDay: 'Encerrar o dia',
    dayClosedBanner: 'Dia encerrado',
    floatXp: (xp: number) => `+${xp} XP`,
    floatCoins: (coins: number) => `+${coins} 🪙`,
  },
} as const;
