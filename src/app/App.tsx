// O app inteiro. Antes existiam "ilhas" React em cima de um HTML legado; agora
// é uma árvore só. Os ids/classes continuam os do app original — o CSS e o
// smoke test dependem deles.

import { AnalyticsTab } from '../features/analytics/AnalyticsTab';
import { LoginScreen } from '../features/auth/LoginScreen';
import { DayEndModals } from '../features/dayend/DayEndModals';
import { OnboardingModal } from '../features/onboarding/OnboardingModal';
import { PlanTab } from '../features/plan/PlanTab';
import { ProfileTab } from '../features/profile/ProfileTab';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SaveIndicator } from '../features/shell/SaveIndicator';
import { FocusOverlay } from '../features/timer/FocusOverlay';
import { TimerBar } from '../features/timer/TimerBar';
import { useAppState } from '../store/store';
import { Header } from './Header';

export function App() {
  const { loggedIn, tab } = useAppState((s) => ({ loggedIn: !!s.user, tab: s.uiTab }));
  return (
    <>
      <LoginScreen />
      <div id="app" style={{ display: loggedIn ? 'block' : 'none' }}>
        <Header />
        <TimerBar />
        <div className="main" style={{ display: tab === 'plano' ? undefined : 'none' }}>
          <PlanTab />
        </div>
        <AnalyticsTab />
        <ProfileTab />
        <DayEndModals />
        <SettingsPage />
        <FocusOverlay />
        <OnboardingModal />
      </div>
      <SaveIndicator />
    </>
  );
}
