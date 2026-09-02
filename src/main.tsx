// Entry do app.
//
// Durante a migração o React vive em ILHAS: cada pedaço já migrado monta num
// ponto fixo do index.html, e o resto continua sendo o legado (src/legacy/app.js)
// mexendo no DOM por id. Os dois compartilham o store (src/store).
//
// Ordem importa: as ilhas são montadas de forma síncrona (flushSync) ANTES de o
// legado carregar, porque ele procura elementos por id em tempo de execução.

import './styles/app.css';
import './styles/login.css';

import { StrictMode, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Header } from './app/Header';
import { LoginScreen } from './features/auth/LoginScreen';
import { PlanTab } from './features/plan/PlanTab';
import { SaveIndicator } from './features/shell/SaveIndicator';
import { FocusOverlay } from './features/timer/FocusOverlay';
import { TimerBar } from './features/timer/TimerBar';

function mountIsland(hostId: string, element: ReactElement): void {
  const host = document.getElementById(hostId);
  if (!host) throw new Error(`ilha React sem host: #${hostId}`);
  flushSync(() => {
    createRoot(host).render(<StrictMode>{element}</StrictMode>);
  });
}

mountIsland('login-root', <LoginScreen />);
mountIsland('header-root', <Header />);
mountIsland('plan-root', <PlanTab />);
mountIsland('timer-root', <TimerBar />);
mountIsland('focus-root', <FocusOverlay />);
mountIsland('save-root', <SaveIndicator />);

// Legado por último. Ele registra o listener de auth (assíncrono) e daí em diante
// renderiza as partes ainda não migradas.
void import('./legacy/app.js');
