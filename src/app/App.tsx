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
import { useWide } from '../shared/useWide';
import { useAppState } from '../store/store';
import { Header } from './Header';

export function App() {
  const { loggedIn, tab } = useAppState((s) => ({ loggedIn: !!s.user, tab: s.uiTab }));
  const wide = useWide();
  // Escondido por classe, não por style: em tela grande o #app é um grid (CSS), e um display inline venceria.
  return (
    <>
      <LoginScreen />
      <div id="app" className={loggedIn ? undefined : 'app-hidden'}>
        <Header />
        <TimerBar />
        <div className="main" style={{ display: tab === 'plano' ? undefined : 'none' }}>
          <PlanTab />
        </div>
        <AnalyticsTab />
        <ProfileTab />
        {/* A coluna da direita do Plano só existe em tela grande (a barra do timer fica em cima dela, via CSS). */}
        {wide && tab === 'plano' && <PlanSidebar />}
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
