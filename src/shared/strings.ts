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
} as const;
