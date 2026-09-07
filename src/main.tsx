// Entry do app: monta a árvore React e liga a sessão (auth → carregar dados → boot).

import './styles/app.css';
import './styles/login.css';

// Os pacotes de tema. Cada um só vale sob `:root[data-theme="<slug>"]`, então importar
// todos é inofensivo: sem o atributo no `<html>`, o app fica no escuro original.
import './styles/themes/cafe.css';
import './styles/themes/noturno.css';
import './styles/themes/papel.css';
import './styles/themes/salvia.css';
import './styles/themes/misto.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { startSession } from './application/session';
import { initTheme } from './shared/theme';

// Antes do createRoot: o tema entra no `<html>` na primeira pintura, sem piscar o errado.
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('index.html sem #root');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
startSession();
