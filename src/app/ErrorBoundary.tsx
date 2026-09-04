// Último recurso: um erro de render dentro da árvore virava tela preta, sem
// mensagem. Aqui ele vira uma tela mínima no padrão do app com "Recarregar".
// Class component porque é o único jeito de pegar erro de render no React.
// Não tenta recuperar estado — recarregar já reidrata do Firestore.

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { strings } from '../shared/strings';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error:', error);
    console.error(info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = strings.errorBoundary;
    return (
      <div id="error-screen" className="error-screen" role="alert">
        <div className="error-card">
          <div className="error-title">{t.title}</div>
          <p className="error-text">{t.text}</p>
          <pre className="error-detail">{error.message || String(error)}</pre>
          <button type="button" className="error-reload" id="error-reload" onClick={() => location.reload()}>
            {t.reload}
          </button>
        </div>
      </div>
    );
  }
}
