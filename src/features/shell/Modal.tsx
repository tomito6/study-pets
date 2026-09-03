// Modal centralizado — a mesma casca `.panel-overlay.center > .panel-sheet` do app
// inteiro. Clicar fora fecha (como o closeIfOutside antigo).

import type { MouseEvent, ReactNode } from 'react';

interface Props {
  id: string;
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ id, open, title, onClose, children }: Props) {
  const onOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div className={'panel-overlay center' + (open ? ' open' : '')} id={id} onClick={onOverlayClick}>
      <div className="panel-sheet">
        <div className="panel-header">
          <h2>{title}</h2>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>
        {/* Conteúdo só existe enquanto aberto, como no app antigo (que montava o modal ao abrir).
            Senão a loja e o Meus pets carregam os sprites de todos os pets já na tela de login. */}
        {open ? children : null}
      </div>
    </div>
  );
}
