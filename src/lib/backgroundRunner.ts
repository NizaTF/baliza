let keepAliveAudio: HTMLAudioElement | null = null;
let keepAliveUrl: string | null = null;
let keepAliveActive = false;

/**
 * Genera un archivo WAV PCM de 1 segundo en silencio absoluto (0 dB reales)
 * para mantener viva la sesión multimedia del navegador al apagar la pantalla del móvil.
 */
function getSilentWavUrl(): string {
  if (keepAliveUrl) return keepAliveUrl;

  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 segundo
  const dataSize = numSamples;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8-bit unsigned PCM
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  // 128 = silencio exacto en PCM 8-bit unsigned
  for (let i = 0; i < dataSize; i++) {
    view.setUint8(44 + i, 128);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  keepAliveUrl = URL.createObjectURL(blob);
  return keepAliveUrl;
}

function updateMediaSession(playing: boolean): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (playing) {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Baliza · Partida en curso',
          artist: 'GPS, tormenta y alertas en segundo plano',
          album: 'Baliza',
          artwork: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        });
      }
      navigator.mediaSession.playbackState = 'playing';
    } else {
      navigator.mediaSession.playbackState = 'none';
    }
  } catch {
    // Ignorar si MediaSession falla en algún navegador
  }
}

/**
 * Inicia el bucle silencioso MediaSession para que Android/iOS no suspendan
 * el GPS ni la conexión Realtime cuando el jugador apaga la pantalla del móvil.
 */
export async function startBackgroundKeepAlive(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  try {
    if (!keepAliveAudio) {
      const audio = new Audio(getSilentWavUrl());
      audio.loop = true;
      audio.muted = false;
      audio.volume = 0.02;
      audio.setAttribute('playsinline', 'true');
      keepAliveAudio = audio;
    }

    if (keepAliveAudio.paused) {
      await keepAliveAudio.play();
    }
    keepAliveActive = true;
    updateMediaSession(true);
    return true;
  } catch {
    keepAliveActive = false;
    return false;
  }
}

export function stopBackgroundKeepAlive(): void {
  keepAliveActive = false;
  if (keepAliveAudio) {
    try {
      keepAliveAudio.pause();
      keepAliveAudio.currentTime = 0;
    } catch {
      // Ignorar
    }
  }
  updateMediaSession(false);
}

export function isBackgroundKeepAliveActive(): boolean {
  return Boolean(keepAliveActive && keepAliveAudio && !keepAliveAudio.paused);
}

export function getNotificationPermissionStatus():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBackgroundNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Envía una notificación al sistema/pantalla de bloqueo cuando la app está en segundo plano.
 */
export async function sendBackgroundNotification(
  title: string,
  body: string,
  tag = 'baliza-event'
): Promise<void> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, {
          body,
          tag,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          renotify: true,
        } as NotificationOptions);
        return;
      }
    }
    new Notification(title, {
      body,
      tag,
      icon: '/pwa-192x192.png',
    });
  } catch {
    // Ignorar si el navegador bloquea la notificación
  }
}
