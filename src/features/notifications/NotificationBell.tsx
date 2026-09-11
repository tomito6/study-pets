// O sininho da barra e o painel que ele abre.
//
// Popover ancorado, não modal: `Modal.tsx` centraliza e escurece a tela inteira,
// e uma lista de avisos não merece parar o app. Fecha clicando fora ou com Esc
// (`useDismiss`, o mesmo do menu do avatar).
//
// Marcar como lido acontece ao FECHAR, não ao abrir: fechando é que dá pra ver
// quais linhas eram novas enquanto o painel está aberto. O selo responde "tem
// coisa que você não viu", não é uma caixa de tarefas pra esvaziar — e ele é da
// cor do accent, não vermelho: aqui não chega nada urgente nem nada que cobre você.

import { useCallback, useEffect, useRef, useState } from 'react';
import { markNotificationsRead, clearNotifications, notifications, unreadNotifications } from '../../application/notifications';
import { ageOf } from '../../domain/notifications';
import type { Notification } from '../../domain/notifications';
import { strings } from '../../shared/strings';
import { useDismiss } from '../../shared/useDismiss';
import { setTab, useAppState } from '../../store/store';
import type { Tab } from '../../store/store';

/** O sininho (traço, estilo lucide — o mesmo desenho da engrenagem ao lado). */
function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  );
}

/** Pra onde a linha leva ao ser tocada. `null` = a linha é só texto. */
const DESTINO: Record<Notification['kind'], Tab | null> = {
  nivel: 'perfil',
  'pet-nivel': 'perfil',
  'pet-evolucao': 'perfil',
  dia: 'analise',
  sequencia: 'analise',
  horas: 'analise',
  abandono: null,
};

/**
 * Onde o painel começa, no celular. A `.topbar` é o teto de sempre, mas com um
 * bloco rodando a `.timer-bar` gruda logo abaixo dela e faz parte do mesmo teto
 * fixo — sem isto o painel cobria o relógio do estudo em andamento.
 */
function topoDoPainel(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const barras = ['.timer-bar.active', '.topbar'];
  for (const sel of barras) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.height > 0) return `${Math.round(r.bottom) + 6}px`;
    }
  }
  return undefined;
}

function Item({ n, now, onGo }: { n: Notification; now: number; onGo: (tab: Tab) => void }) {
  const t = strings.notifications;
  const head = t.text[n.kind]?.(n.data) ?? '';
  const body = t.body[n.kind]?.(n.data) ?? '';
  const destino = DESTINO[n.kind];
  const quando = n.at > 0 ? t.when(ageOf(n.at, now)) : '';
  const conteudo = (
    <>
      <span className="notif-icon" aria-hidden="true">{t.icon[n.kind] ?? '•'}</span>
      <span className="notif-text">
        <span className="notif-head">{head}</span>
        {body ? <span className="notif-body">{body}</span> : null}
      </span>
      <span className="notif-when">{quando}</span>
    </>
  );
  const cls = 'notif-item' + (n.read ? '' : ' unread') + (destino ? ' clickable' : '');
  // O papel de botão vai no <button> de dentro, nunca no <li>: `role="button"` num
  // item de lista apaga o `listitem`, e o leitor de tela anuncia uma lista vazia.
  return (
    <li className="notif-row" data-kind={n.kind}>
      {destino ? (
        <button type="button" className={cls} onClick={() => onGo(destino)}>{conteudo}</button>
      ) : (
        <div className={cls}>{conteudo}</div>
      )}
    </li>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [topo, setTopo] = useState<string | undefined>(undefined);
  const { lista, naoLidas } = useAppState(() => ({ lista: notifications(), naoLidas: unreadNotifications() }));
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  // Ao fechar: o que estava na tela passa a contar como visto, e o foco volta pro
  // sininho se ele estava dentro do painel (senão ele cairia no <body>).
  const fechar = useCallback(() => {
    const dentro = painel.current?.contains(document.activeElement);
    setOpen(false);
    markNotificationsRead();
    if (dentro) botao.current?.focus();
  }, []);
  const ref = useDismiss<HTMLDivElement>(open, fechar);
  const t = strings.notifications;

  // Abrir move o foco pro painel: um `role="dialog"` que não recebe foco é um
  // diálogo que o leitor de tela nunca anuncia.
  useEffect(() => {
    if (open) painel.current?.focus();
  }, [open]);

  // Nada de mexer no store dentro do updater do useState: React roda o updater
  // durante a renderização, e um `notify()` ali é atualizar o app no meio do render.
  const alternar = () => {
    if (open) {
      fechar();
      return;
    }
    // `now` congela na abertura: sem tick por segundo, e "há 5 min" não muda
    // debaixo do olho de quem está lendo.
    setNow(Date.now());
    setTopo(topoDoPainel());
    setOpen(true);
  };

  const ir = (tab: Tab) => {
    fechar();
    setTab(tab);
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        className="notif-btn"
        id="notif-btn"
        ref={botao}
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t.open}
        title={t.open}
      >
        <BellIcon />
        {naoLidas > 0 && <span className="notif-badge" id="notif-badge">{t.badge(naoLidas)}</span>}
      </button>
      {open && (
        <div
          className="notif-panel"
          id="notif-panel"
          role="dialog"
          aria-label={t.title}
          ref={painel}
          tabIndex={-1}
          style={topo ? ({ '--notif-top': topo } as React.CSSProperties) : undefined}
        >
          <div className="notif-panel-head">
            <span>{t.title}</span>
            {lista.length > 0 && (
              <button type="button" className="notif-clear" id="notif-clear" onClick={clearNotifications}>{t.clear}</button>
            )}
          </div>
          {lista.length === 0 ? (
            <div className="notif-empty" id="notif-empty">
              <span className="notif-empty-title">{t.emptyTitle}</span>
              <span className="notif-empty-body">{t.emptyBody}</span>
            </div>
          ) : (
            <ul className="notif-list" id="notif-list">
              {lista.map((n) => <Item key={n.id} n={n} now={now} onGo={ir} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
