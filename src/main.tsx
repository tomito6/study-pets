// Entry do app: monta a árvore React e liga a sessão (auth → carregar dados → boot).

import './styles/fonts.css';
import './styles/app.css';
import './styles/login.css';

// O tema Café de casa (o padrão). Só vale sob `:root[data-theme="cafe"]`; sem o atributo, o escuro.
import './styles/themes/cafe.css';

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
