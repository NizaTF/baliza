import { distanceMeters } from './zones';

export interface RawGpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  timestampMs: number;
}

export interface SmoothedGpsFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface GpsFilterState {
  lastAccepted: RawGpsFix | null;
  smoothed: SmoothedGpsFix | null;
  pendingJump: RawGpsFix | null;
  rejectedJumps: number;
  rejectedLowAccuracy: number;
}

export interface GpsFilterResult {
  accepted: boolean;
  reason: 'accepted' | 'low_accuracy' | 'jump_filtered' | 'deadband';
  position: SmoothedGpsFix | null;
  state: GpsFilterState;
}

const MAX_COLD_ACCURACY_M = 140;
const MAX_LOCKED_ACCURACY_M = 65;
const MAX_PLAUSIBLE_SPEED_MPS = 19; // ~68 km/h para tolerar sprint/bici sin permitir saltos GPS
const MIN_JUMP_DISTANCE_M = 32;
const STATIONARY_DEADBAND_M = 1.8;

export function createGpsFilterState(): GpsFilterState {
  return {
    lastAccepted: null,
    smoothed: null,
    pendingJump: null,
    rejectedJumps: 0,
    rejectedLowAccuracy: 0,
  };
}

export function filterGpsSample(
  prevState: GpsFilterState,
  sample: RawGpsFix
): GpsFilterResult {
  const acc = Number.isFinite(sample.accuracy) ? Math.max(1, sample.accuracy) : 25;

  // 1. Filtro de precisión mínima (rechaza rebotes severos de antena en interiores)
  if (!prevState.lastAccepted) {
    if (acc > MAX_COLD_ACCURACY_M) {
      return {
        accepted: false,
        reason: 'low_accuracy',
        position: prevState.smoothed,
        state: {
          ...prevState,
          rejectedLowAccuracy: prevState.rejectedLowAccuracy + 1,
        },
      };
    }
    const initFix: RawGpsFix = { ...sample, accuracy: acc };
    const initSmooth: SmoothedGpsFix = {
      lat: sample.lat,
      lng: sample.lng,
      accuracy: acc,
    };
    return {
      accepted: true,
      reason: 'accepted',
      position: initSmooth,
      state: {
        lastAccepted: initFix,
        smoothed: initSmooth,
        pendingJump: null,
        rejectedJumps: prevState.rejectedJumps,
        rejectedLowAccuracy: prevState.rejectedLowAccuracy,
      },
    };
  }

  if (acc > MAX_LOCKED_ACCURACY_M) {
    return {
      accepted: false,
      reason: 'low_accuracy',
      position: prevState.smoothed,
      state: {
        ...prevState,
        rejectedLowAccuracy: prevState.rejectedLowAccuracy + 1,
      },
    };
  }

  const prev = prevState.lastAccepted;
  const prevSmooth = prevState.smoothed ?? {
    lat: prev.lat,
    lng: prev.lng,
    accuracy: prev.accuracy,
  };

  const dtSec = Math.max(0.5, (sample.timestampMs - prev.timestampMs) / 1000);
  const jumpDistM = distanceMeters(prev.lat, prev.lng, sample.lat, sample.lng);
  const speedMps = jumpDistM / dtSec;

  // 2. Filtro anti-saltos: bloquea teletransportes imposibles salvo 2 lecturas coherentes seguidas
  const isSuspiciousSpike =
    jumpDistM >= MIN_JUMP_DISTANCE_M &&
    speedMps > MAX_PLAUSIBLE_SPEED_MPS &&
    jumpDistM > acc * 1.4;

  if (isSuspiciousSpike) {
    const pending = prevState.pendingJump;
    if (pending) {
      const confirmDist = distanceMeters(
        pending.lat,
        pending.lng,
        sample.lat,
        sample.lng
      );
      const confirmDt = Math.max(0.5, (sample.timestampMs - pending.timestampMs) / 1000);
      if (confirmDist / confirmDt <= MAX_PLAUSIBLE_SPEED_MPS || confirmDist <= acc * 1.5) {
        // Dos lecturas consecutivas confirman el desplazamiento real (reenganche)
        const relockSmooth: SmoothedGpsFix = {
          lat: sample.lat,
          lng: sample.lng,
          accuracy: acc,
        };
        return {
          accepted: true,
          reason: 'accepted',
          position: relockSmooth,
          state: {
            lastAccepted: { ...sample, accuracy: acc },
            smoothed: relockSmooth,
            pendingJump: null,
            rejectedJumps: prevState.rejectedJumps,
            rejectedLowAccuracy: prevState.rejectedLowAccuracy,
          },
        };
      }
    }

    return {
      accepted: false,
      reason: 'jump_filtered',
      position: prevSmooth,
      state: {
        ...prevState,
        pendingJump: { ...sample, accuracy: acc },
        rejectedJumps: prevState.rejectedJumps + 1,
      },
    };
  }

  // 3. Zona muerta para evitar micro-deriva cuando el jugador está quieto
  const smoothDistM = distanceMeters(
    prevSmooth.lat,
    prevSmooth.lng,
    sample.lat,
    sample.lng
  );
  if (smoothDistM < STATIONARY_DEADBAND_M && acc > 8) {
    return {
      accepted: false,
      reason: 'deadband',
      position: prevSmooth,
      state: {
        ...prevState,
        pendingJump: null,
      },
    };
  }

  // 4. Suavizado adaptativo ponderado por precisión GPS y desplazamiento
  const confidenceRatio = Math.min(1, Math.max(0.22, smoothDistM / Math.max(6, acc)));
  const alpha = Math.min(0.85, Math.max(0.28, 0.28 + confidenceRatio * 0.57));

  const nextLat = prevSmooth.lat + (sample.lat - prevSmooth.lat) * alpha;
  const nextLng = prevSmooth.lng + (sample.lng - prevSmooth.lng) * alpha;
  const nextAcc = Math.round(prevSmooth.accuracy * 0.4 + acc * 0.6);

  const nextSmooth: SmoothedGpsFix = {
    lat: Number(nextLat.toFixed(6)),
    lng: Number(nextLng.toFixed(6)),
    accuracy: nextAcc,
  };

  return {
    accepted: true,
    reason: 'accepted',
    position: nextSmooth,
    state: {
      lastAccepted: { ...sample, accuracy: acc },
      smoothed: nextSmooth,
      pendingJump: null,
      rejectedJumps: prevState.rejectedJumps,
      rejectedLowAccuracy: prevState.rejectedLowAccuracy,
    },
  };
}
