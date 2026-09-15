// Configurações → Geral → "Sons e notificações": o volume dos sons do app e a permissão
// da notificação do navegador. Nasceu porque o único controle de volume morava na barra
// do timer — e desde que o foco fica aberto enquanto o relógio corre, a barra só aparece
// pausada. Quem queria baixar o som não achava onde.
//
// É preferência DESTE dispositivo (como o tema): aplica na hora, sem rascunho nem
// "Salvar", e fica no `localStorage` (ver application/alerts.ts). O "▶ Ouvir" e o slider
// tocam de dentro do gesto — é também o que prepara o contexto de áudio, que criado fora
// de um clique nasce mudo (o cabeçalho de infrastructure/audio/sounds.ts explica).

import { useState } from 'react';
import { enableNotifications, notificationStatus, previewSound, setMuted, setVolume } from '../../application/alerts';
import type { NotificationStatus } from '../../application/alerts';
import { strings } from '../../shared/strings';
import { useAppState } from '../../store/store';

const t = strings.settings.sound;

export function SoundSection() {
  const audio = useAppState((_s, d) => d.audio);
  // Lida a cada render, não uma vez: a pessoa pode mudar a permissão no cadeado com a
  // página aberta, e o clique em "Permitir" atualiza pelo estado local.
  const [decidido, setDecidido] = useState<NotificationStatus | null>(null);
  const status: NotificationStatus = decidido ?? notificationStatus();

  const permitir = async (): Promise<void> => {
    setDecidido(await enableNotifications());
  };

  // Ao soltar o slider (ponteiro ou tecla), um check no volume novo: é o jeito de ouvir o
  // que "40%" quer dizer sem procurar o botão — e é um gesto, então também prepara o áudio.
  const tocarAmostra = (): void => {
    if (!audio.muted) previewSound('check');
  };

  return (
    <div className="st-section" id="st-sec-sound">
      <div className="st-section-head"><div className="st-section-title">{t.title}</div></div>
      <div className="st-section-desc">{t.desc}</div>
      <div className="st-card">
        <div className="st-toggle-row">
          <div>
            <div className="st-toggle-txt">{t.toggle}</div>
            <div className="st-toggle-sub">{t.toggleSub}</div>
          </div>
          <label className="st-switch">
            <input type="checkbox" id="cfg-sound" checked={!audio.muted} onChange={(e) => setMuted(!e.target.checked)} />
            <span className="st-switch-track"><span className="st-switch-knob" /></span>
          </label>
        </div>

        <div className={'st-volume' + (audio.muted ? ' off' : '')}>
          <label className="st-field-label" htmlFor="sound-volume">{t.volume}</label>
          <div className="st-volume-row">
            <input
              type="range"
              className="st-vol-slider"
              id="sound-volume"
              min="0"
              max="1"
              step="0.05"
              value={audio.volume}
              disabled={audio.muted}
              aria-label={t.volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              onPointerUp={tocarAmostra}
              onKeyUp={(e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') tocarAmostra(); }}
            />
            <span className="st-vol-val" id="sound-volume-val">{t.pct(audio.volume)}</span>
          </div>
        </div>

        <div className="st-divider" />
        <div className="st-action-row">
          <div>
            <div className="ar-title">{t.testTitle}</div>
            <div className="ar-desc">{t.testDesc}</div>
          </div>
          <button type="button" className="st-action-btn" id="sound-test" onClick={() => previewSound('sucesso')}>{t.testButton}</button>
        </div>
        <div className="st-hint">{t.hint}</div>

        <div className="st-divider" />
        <div className="st-action-row st-sound-notif">
          <div>
            <div className="ar-title">{t.notif.title}</div>
            <div className="ar-desc" id="notif-perm-status" data-status={status}>{t.notif.status[status]}</div>
          </div>
          {status === 'default' && (
            <button type="button" className="st-action-btn" id="notif-perm-btn" onClick={() => void permitir()}>{t.notif.button}</button>
          )}
        </div>
      </div>
    </div>
  );
}
