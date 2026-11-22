import { LocationGuardStatus } from '../types/game';

/**
 * Comprueba en tiempo real si la ubicación / GPS del dispositivo está activa y permitida.
 */
export async function checkLocationAvailability(): Promise<LocationGuardStatus> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }

  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') {
        return 'disabled';
      }
    } catch {
      // Algunos navegadores (como Safari) pueden fallar en permissions.query
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (status: LocationGuardStatus) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };

    try {
      navigator.geolocation.getCurrentPosition(
        () => finish('active'),
        () => finish('disabled'),
        {
          enableHighAccuracy: true,
          maximumAge: 4000,
          timeout: 5500,
        }
      );
    } catch {
      finish('disabled');
    }
  });
}

/**
 * Suscribe un monitor continuo al estado de la ubicación/GPS del dispositivo.
 * Detecta tanto revocación de permisos en el navegador como desactivación del GPS del móvil.
 */
export function subscribeLocationGuard(
  onStatusChange: (status: LocationGuardStatus) => void
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onStatusChange('unsupported');
    return () => {};
  }

  let disposed = false;
  let lastStatus: LocationGuardStatus | null = null;
  let consecutiveFailures = 0;
  let hasHadActiveFix = false;
  let permStatus: PermissionStatus | null = null;
  let inFlight = false;

  const emit = (next: LocationGuardStatus) => {
    if (disposed || next === lastStatus) return;
    lastStatus = next;
    onStatusChange(next);
  };

  const probe = () => {
    if (disposed || inFlight) return;
    if (permStatus && permStatus.state === 'denied') {
      consecutiveFailures = 2;
      emit('disabled');
      return;
    }

    inFlight = true;
    try {
      navigator.geolocation.getCurrentPosition(
        () => {
          inFlight = false;
          consecutiveFailures = 0;
          hasHadActiveFix = true;
          emit('active');
        },
        (err) => {
          inFlight = false;
          if (err.code === 1) {
            // PERMISSION_DENIED: inmediato
            consecutiveFailures = 2;
            emit('disabled');
            return;
          }

          consecutiveFailures += 1;
          // POSITION_UNAVAILABLE (2) o TIMEOUT (3): confirmar con 2 fallos seguidos (o 1 si nunca estuvo activo y falló por unavailable)
          if (
            consecutiveFailures >= 2 ||
            (!hasHadActiveFix && err.code === 2)
          ) {
            emit('disabled');
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 5000,
        }
      );
    } catch {
      inFlight = false;
      emit('disabled');
    }
  };

  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (disposed) return;
        permStatus = status;
        if (status.state === 'denied') {
          emit('disabled');
        } else {
          probe();
        }
        status.onchange = () => {
          if (disposed) return;
          if (status.state === 'denied') {
            consecutiveFailures = 2;
            emit('disabled');
          } else {
            consecutiveFailures = 0;
            probe();
          }
        };
      })
      .catch(() => {
        probe();
      });
  } else {
    probe();
  }

  const handleVisibilityOrFocus = () => {
    if (document.visibilityState === 'visible') {
      probe();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  window.addEventListener('focus', handleVisibilityOrFocus);
  const pollId = window.setInterval(probe, 3500);

  return () => {
    disposed = true;
    window.clearInterval(pollId);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    window.removeEventListener('focus', handleVisibilityOrFocus);
    if (permStatus) {
      permStatus.onchange = null;
    }
  };
}
