// O app inteiro. Antes existiam "ilhas" React em cima de um HTML legado; agora
// é uma árvore só. Os ids/classes continuam os do app original — o CSS e o
// smoke test dependem deles.

import { AnalyticsTab } from '../features/analytics/AnalyticsTab';
import { LoginScreen } from '../features/auth/LoginScreen';
import { DayEndModals } from '../features/dayend/DayEndModals';
import { OnboardingModal } from '../features/onboarding/OnboardingModal';
import { PlanSidebar } from '../features/plan/PlanSidebar';
import { PlanTab } from '../features/plan/PlanTab';
import { ProfileTab } from '../features/profile/ProfileTab';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SaveIndicator } from '../features/shell/SaveIndicator';
import { FocusOverlay } from '../features/timer/FocusOverlay';
import { TimerBar } from '../features/timer/TimerBar';
import { TourBalloon } from '../features/tutorial/TourBalloon';
import { signOut } from '../application/session';
import { strings } from '../shared/strings';
import { useWide } from '../shared/useWide';
import { useAppState } from '../store/store';
import { Header } from './Header';

export function App() {
  const { loggedIn, tab, loadFailed, booting } = useAppState((s, d) => ({
    loggedIn: !!s.user,
    tab: s.uiTab,
    loadFailed: d.loadFailed,
    booting: d.booting,
  }));
  const wide = useWide();

  // A leitura do documento falhou. O app NÃO segue com a tela vazia: vazio é
  // indistinguível de conta nova, e qualquer save a partir dali apaga o histórico
  // de verdade (ver loadUserData). Aqui só dá pra recarregar — que é justamente
  // tentar ler de novo.
  if (loadFailed) {
    const t = strings.session.loadFailed;
    return (
      <div id="load-failed-screen" className="error-screen" role="alert">
        <div className="error-card">
          <div className="error-title">{t.title}</div>
          <p className="error-text">{t.text}</p>
          <button
            type="button"
            className="error-reload"
            id="load-failed-reload"
            onClick={() => location.reload()}
          >
            {t.reload}
          </button>
          {/* A saída: sem isto, quem cai numa falha permanente (uma regra do Firestore
              negando, por exemplo) fica preso recarregando, porque o botão Sair mora
              no cabeçalho, que esta tela substituiu. */}
          <button type="button" className="error-leave" id="load-failed-leave" onClick={() => void signOut()}>
            {t.leave}
          </button>
        </div>
      </div>
    );
  }

  // Logado, documento a caminho. Antes o #app aparecia aqui, gerado a partir da
  // config padrão e totalmente clicável: marcar um estudo nesse intervalo dava som,
  // XP flutuante e ripple, e o check era jogado fora sem uma palavra assim que o
  // documento chegava (o save está travado até lá, de propósito).
  if (loggedIn && booting) {
    return (
      <div id="boot-screen" className="error-screen" role="status" aria-live="polite">
        <div className="error-card">
          <div className="error-title">{strings.session.booting.title}</div>
          <p className="error-text">{strings.session.booting.text}</p>
        </div>
      </div>
    );
  }
  // Escondido por classe, não por style: em tela grande o #app é um grid (CSS), e um display inline venceria.
  return (
    <>
      <LoginScreen />
      <div id="app" className={loggedIn ? undefined : 'app-hidden'}>
        <Header />
        {/* Em tela grande e no Plano, a coluna da esquerda é um bloco só, da altura da lista: o PlanSidebar e,
            por último, a barra do timer (o cartão "Agora"), que gruda no topo E no rodapé da tela ao rolar.
            Fora disso a barra fica onde sempre ficou (logo abaixo do cabeçalho). */}
        {wide && tab === 'plano' ? (
          <aside className="plan-col" id="plan-col">
            <PlanSidebar />
            <TimerBar />
          </aside>
        ) : (
          <TimerBar />
        )}
        <div className="main" style={{ display: tab === 'plano' ? undefined : 'none' }}>
          <PlanTab />
        </div>
        <AnalyticsTab />
        <ProfileTab />
        <DayEndModals />
        <SettingsPage />
        <FocusOverlay />
        <OnboardingModal />
        {/* Dentro de #app: some com o logout junto com o resto. Posição absoluta = coordenadas do documento. */}
        <TourBalloon />
      </div>
      <SaveIndicator />
    </>
  );
}
