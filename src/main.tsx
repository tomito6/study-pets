// Entry do app: monta a árvore React e liga a sessão (auth → carregar dados → boot).

import './styles/app.css';
import './styles/login.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { startSession } from './application/session';

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
