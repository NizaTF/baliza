export function computeBearingDeg(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function getCardinalLabel(bearingDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8];
}

export function normalizeRelativeAngleDeg(
  targetBearingDeg: number,
  deviceHeadingDeg: number | null
): number {
  if (deviceHeadingDeg === null || Number.isNaN(deviceHeadingDeg)) {
    return targetBearingDeg;
  }
  const diff = (targetBearingDeg - deviceHeadingDeg + 540) % 360 - 180;
  return diff;
}

export function getPocketPulseSpec(
  distanceM: number,
  isAligned: boolean
): {
  intervalMs: number;
  pattern: number[];
  zoneLabel: string;
} {
  if (distanceM <= 20) {
    return {
      intervalMs: 1400,
      pattern: isAligned ? [90, 50, 90, 50, 110] : [75, 60, 75],
      zoneLabel: 'Encima (<20m)',
    };
  }
  if (distanceM <= 55) {
    return {
      intervalMs: 2200,
      pattern: isAligned ? [70, 55, 70] : [55],
      zoneLabel: 'Muy cerca',
    };
  }
  if (distanceM <= 120) {
    return {
      intervalMs: 3400,
      pattern: isAligned ? [55, 60, 55] : [40],
      zoneLabel: 'Cerca',
    };
  }
  return {
    intervalMs: 5200,
    pattern: isAligned ? [45, 70, 35] : [28],
    zoneLabel: 'Lejos',
  };
}

export function speakPocketCue(text: string): void {
  try {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance !== 'function'
    ) {
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 1.08;
    utter.volume = 0.85;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignorar en navegadores sin síntesis de voz
  }
}
