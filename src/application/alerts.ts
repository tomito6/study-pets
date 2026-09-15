// Os avisos do fim do bloco: o **som** (Web Audio) e a **notificação do navegador**.
//
// O som mora aqui e não no timer porque não é só dele — o check da lista, a leva que
// fecha e o "Parar por aqui" também tocam, e o volume tem casa nas Configurações. O
// que vale é `derived.audio` (runtime, uma fonte só pra barra do timer e pra seção);
// cada mudança é gravada NESTE dispositivo (`infrastructure/audioPrefs.ts`, como o
// tema), e `initAudio` a traz de volta no boot. Nada disso vai pro Firestore: o
// celular no bolso e o laptop na mesa não querem o mesmo volume.
//
// **Preparar o áudio num gesto** (`primeAudio`) é o que impede o silêncio calado: o
// contexto de áudio criado fora de um clique nasce suspenso, e o fim do bloco acontece
// num `setInterval`. Quem inicia, retoma ou reabre um bloco chama isto; os controles
// de volume também. Ver o cabeçalho de `infrastructure/audio/sounds.ts`.

import { playSound as playSoundInfra, primeAudio as primeAudioInfra } from '../infrastructure/audio/sounds';
import type { AudioSettings, SoundType } from '../infrastructure/audio/sounds';
import { readAudioPrefs, writeAudioPrefs } from '../infrastructure/audioPrefs';
import { askNotificationPermission, notificationPermission } from '../infrastructure/notifications/notifications';
import type { NotificationStatus } from '../infrastructure/notifications/notifications';
import { derived, notify } from '../store/store';

export type { NotificationStatus } from '../infrastructure/notifications/notifications';

/** O volume de quem nunca mexeu: alto o bastante pra ouvir, baixo o bastante pra não assustar. */
export const DEFAULT_AUDIO: AudioSettings = { volume: 0.7, muted: false };

/** No boot, antes do React montar: a preferência deste dispositivo vira o runtime. */
export function initAudio(): AudioSettings {
  derived.audio = readAudioPrefs() ?? { ...DEFAULT_AUDIO };
  return derived.audio;
}

function apply(next: AudioSettings): void {
  derived.audio = next;
  writeAudioPrefs(next);
  notify();
}

export function playSound(type: SoundType): void {
  playSoundInfra(type, derived.audio);
}

/** Chamar de dentro de um gesto: cria/acorda o contexto de áudio enquanto o navegador deixa. */
export function primeAudio(): void {
  primeAudioInfra();
}

export function toggleMute(): void {
  setMuted(!derived.audio.muted);
}

/** Ligar de novo com o volume em zero devolveria silêncio: sobe pro padrão. */
export function setMuted(muted: boolean): void {
  primeAudio();
  const volume = !muted && derived.audio.volume === 0 ? DEFAULT_AUDIO.volume : derived.audio.volume;
  apply({ volume, muted });
}

/** Volume 0 silencia; qualquer outro valor reativa — como o slider da barra sempre fez. */
export function setVolume(volume: number): void {
  primeAudio();
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : DEFAULT_AUDIO.volume));
  apply({ volume: v, muted: v === 0 });
}

/** "▶ Ouvir": o som pedido, no volume de agora — e o gesto que o toca prepara o contexto. */
export function previewSound(type: SoundType = 'sucesso'): void {
  primeAudio();
  playSound(type);
}

/** A permissão da notificação do navegador, pra seção das Configurações mostrar. */
export function notificationStatus(): NotificationStatus {
  return notificationPermission();
}

/** "Permitir": pede agora, de dentro do clique, e devolve o que ficou decidido. */
export function enableNotifications(): Promise<NotificationStatus> {
  return askNotificationPermission();
}
