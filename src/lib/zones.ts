import {
  DEFAULT_ZONES_CONFIG,
  ExtractionBeacon,
  RoomRules,
  StormZonePhase,
  ZonesConfig,
} from '../types/game';

const EARTH_RADIUS_M = 6371000;
export const VALENCIA_CENTER = { lat: 39.4699, lng: -0.3763 } as const;
export const MIN_ZONES_COUNT = 1;
export const MIN_ZONE_RADIUS_M = 1;

export function offsetLatLng(
  lat: number,
  lng: number,
  distanceMeters: number,
  bearingRad: number
): { lat: number; lng: number } {
  if (distanceMeters <= 0) return { lat, lng };
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDist = distanceMeters / EARTH_RADIUS_M;

  const nextLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
      Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad)
  );
  const nextLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
      Math.cos(angularDist) - Math.sin(latRad) * Math.sin(nextLatRad)
    );

  return {
    lat: Number(((nextLatRad * 180) / Math.PI).toFixed(6)),
    lng: Number(((nextLngRad * 180) / Math.PI).toFixed(6)),
  };
}

export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Calcula el punto más cercano del borde de la zona segura desde la posición del jugador
 * para trazar una línea recta hacia fuera de la tormenta.
 */
export function getClosestSafePoint(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  playerLat: number,
  playerLng: number
): { lat: number; lng: number } {
  const lat1 = (centerLat * Math.PI) / 180;
  const lat2 = (playerLat * Math.PI) / 180;
  const dLng = ((playerLng - centerLng) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = Math.atan2(y, x);

  const targetRadius = Math.max(0, radiusMeters - 2);
  return offsetLatLng(centerLat, centerLng, targetRadius, bearing);
}

export function clampChildInsideParent(
  parent: StormZonePhase,
  child: StormZonePhase
): StormZonePhase {
  const safeRadius = Math.min(child.radius, Math.max(MIN_ZONE_RADIUS_M, parent.radius - 10));
  const maxOffset = Math.max(0, parent.radius - safeRadius);
  const dist = distanceMeters(parent.lat, parent.lng, child.lat, child.lng);
  if (dist <= maxOffset || dist === 0) {
    return { ...child, radius: safeRadius };
  }
  const bearing = Math.atan2(
    (child.lng - parent.lng) * Math.cos((parent.lat * Math.PI) / 180),
    child.lat - parent.lat
  );
  const clamped = offsetLatLng(parent.lat, parent.lng, maxOffset * 0.96, bearing);
  return {
    ...child,
    lat: clamped.lat,
    lng: clamped.lng,
    radius: safeRadius,
  };
}

export function generateRandomZones(options: {
  anchorLat: number;
  anchorLng: number;
  count: number;
  initialRadius?: number;
  defaultWaitSec?: number;
  defaultShrinkSec?: number;
}): StormZonePhase[] {
  const count = Math.max(MIN_ZONES_COUNT, Math.round(options.count));
  const initialRadius = Math.max(
    MIN_ZONE_RADIUS_M,
    Math.round(options.initialRadius ?? 900)
  );
  const baseWait = Math.max(1, Math.round(options.defaultWaitSec ?? 90));
  const baseShrink = Math.max(1, Math.round(options.defaultShrinkSec ?? 45));

  const zones: StormZonePhase[] = [
    {
      id: 'z1',
      lat: Number(options.anchorLat.toFixed(6)),
      lng: Number(options.anchorLng.toFixed(6)),
      radius: initialRadius,
      waitTimeSec: baseWait,
      shrinkTimeSec: baseShrink,
    },
  ];

  for (let i = 1; i < count; i++) {
    const prev = zones[i - 1];
    const ratio = 0.48 + Math.random() * 0.14;
    const rawRadius = Math.max(1, Math.round((prev.radius * ratio) / 5) * 5);
    const radius = Math.max(
      MIN_ZONE_RADIUS_M,
      prev.radius > 10 ? Math.min(prev.radius - 1, rawRadius) : prev.radius
    );
    const maxOffset = Math.max(0, prev.radius - radius);
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * maxOffset * 0.84;
    const nextPos = offsetLatLng(prev.lat, prev.lng, dist, angle);

    const waitTimeSec = Math.max(1, Math.round((baseWait * Math.pow(0.85, i)) / 5) * 5);
    const shrinkTimeSec = Math.max(1, Math.round((baseShrink * Math.pow(0.9, i)) / 5) * 5);

    zones.push({
      id: `z${i + 1}`,
      lat: nextPos.lat,
      lng: nextPos.lng,
      radius,
      waitTimeSec,
      shrinkTimeSec,
    });
  }

  return zones;
}

export function appendNextZone(zones: StormZonePhase[]): StormZonePhase[] {
  if (zones.length === 0) {
    return structuredClone(DEFAULT_ZONES_CONFIG.zones.slice(0, 1));
  }
  const prev = zones[zones.length - 1];
  const radius = Math.max(
    MIN_ZONE_RADIUS_M,
    Math.round((prev.radius * 0.55) / 5) * 5 || Math.max(1, Math.floor(prev.radius / 2))
  );
  const maxOffset = Math.max(0, prev.radius - radius);
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.sqrt(Math.random()) * maxOffset * 0.65;
  const pos = offsetLatLng(prev.lat, prev.lng, dist, angle);

  return [
    ...zones,
    {
      id: `z${zones.length + 1}`,
      lat: pos.lat,
      lng: pos.lng,
      radius,
      waitTimeSec: Math.max(5, prev.waitTimeSec - 15),
      shrinkTimeSec: Math.max(5, prev.shrinkTimeSec - 5),
    },
  ];
}

export function removeLastZone(zones: StormZonePhase[]): StormZonePhase[] {
  if (zones.length <= MIN_ZONES_COUNT) return zones;
  return zones.slice(0, zones.length - 1);
}

export function normalizeZonesConfig(rules: RoomRules): ZonesConfig {
  if (
    rules.zonesConfig &&
    Array.isArray(rules.zonesConfig.zones) &&
    rules.zonesConfig.zones.length > 0
  ) {
    return rules.zonesConfig;
  }
  return structuredClone(DEFAULT_ZONES_CONFIG);
}

export function formatDurationSec(totalSeconds: number): string {
  const sec = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  if (mins === 0) return `${rem} s`;
  if (rem === 0) return `${mins} min`;
  return `${mins}m ${rem}s`;
}

export function formatRadius(meters: number): string {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1);
    return `${km.replace('.', ',')} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Devuelve los dos anillos [exteriorMundial, agujeroSeguro] para dibujar la tormenta
 * estilo Fortnite en Leaflet: el interior del círculo queda limpio/sin colorear y todo
 * el exterior se tiñe de tormenta.
 */
export function getStormMaskRings(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  segments = 72
): [[number, number][], [number, number][]] {
  const outer: [number, number][] = [
    [-85, -180],
    [-85, 180],
    [85, 180],
    [85, -180],
  ];
  const safeRadius = Math.max(5, radiusMeters);
  const hole: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const pt = offsetLatLng(centerLat, centerLng, safeRadius, angle);
    hole.push([pt.lat, pt.lng]);
  }
  return [outer, hole];
}

export interface StormProgressSnapshot {
  phaseIndex: number;
  stage: 'waiting' | 'shrinking' | 'final';
  remainingSec: number;
  currentLat: number;
  currentLng: number;
  currentRadius: number;
  nextZone: StormZonePhase | null;
}

export function evaluateStormAtElapsed(
  zones: StormZonePhase[],
  elapsedSec: number
): StormProgressSnapshot {
  if (zones.length === 0) {
    return {
      phaseIndex: 0,
      stage: 'final',
      remainingSec: 0,
      currentLat: VALENCIA_CENTER.lat,
      currentLng: VALENCIA_CENTER.lng,
      currentRadius: 500,
      nextZone: null,
    };
  }

  let cursor = Math.max(0, elapsedSec);

  for (let i = 0; i < zones.length; i++) {
    const curr = zones[i];
    const next = zones[i + 1] || null;

    if (cursor < curr.waitTimeSec) {
      return {
        phaseIndex: i,
        stage: next ? 'waiting' : 'final',
        remainingSec: Math.max(0, curr.waitTimeSec - cursor),
        currentLat: curr.lat,
        currentLng: curr.lng,
        currentRadius: curr.radius,
        nextZone: next,
      };
    }
    cursor -= curr.waitTimeSec;

    if (!next) {
      return {
        phaseIndex: i,
        stage: 'final',
        remainingSec: 0,
        currentLat: curr.lat,
        currentLng: curr.lng,
        currentRadius: curr.radius,
        nextZone: null,
      };
    }

    const shrink = Math.max(1, next.shrinkTimeSec);
    if (cursor < shrink) {
      const t = Math.min(1, Math.max(0, cursor / shrink));
      return {
        phaseIndex: i,
        stage: 'shrinking',
        remainingSec: Math.max(0, shrink - cursor),
        currentLat: curr.lat + (next.lat - curr.lat) * t,
        currentLng: curr.lng + (next.lng - curr.lng) * t,
        currentRadius: curr.radius + (next.radius - curr.radius) * t,
        nextZone: next,
      };
    }
    cursor -= shrink;
  }

  const last = zones[zones.length - 1];
  return {
    phaseIndex: zones.length - 1,
    stage: 'final',
    remainingSec: 0,
    currentLat: last.lat,
    currentLng: last.lng,
    currentRadius: last.radius,
    nextZone: null,
  };
}

/**
 * Genera una Baliza de Extracción dentro de la zona segura final para que los fugitivos
 * puedan ganar si llegan a ella cuando se desbloquee (además de sobrevivir al tiempo límite).
 */
export function generateExtractionBeacon(
  zones: StormZonePhase[],
  roundDurationMin: number,
  radiusM = 25
): ExtractionBeacon {
  const targetZone = zones[zones.length - 1] ?? {
    lat: VALENCIA_CENTER.lat,
    lng: VALENCIA_CENTER.lng,
    radius: 250,
    waitTimeSec: 60,
    shrinkTimeSec: 30,
  };

  const maxOffset = Math.max(0, targetZone.radius - 30) * 0.55;
  const dist = Math.sqrt(Math.random()) * maxOffset;
  const angle = Math.random() * Math.PI * 2;
  const pos = offsetLatLng(targetZone.lat, targetZone.lng, dist, angle);

  const totalStormSec = zones.reduce((acc, z, idx) => {
    if (idx === 0) return acc + z.waitTimeSec;
    return acc + z.shrinkTimeSec + z.waitTimeSec;
  }, 0);

  const totalRoundSec = Math.max(30, roundDurationMin * 60);
  const targetUnlock = Math.min(
    Math.round(totalRoundSec * 0.45),
    Math.max(20, Math.round(totalStormSec * 0.65))
  );
  const unlockAtSec = Math.max(
    15,
    Math.min(targetUnlock, Math.max(15, totalRoundSec - 20))
  );

  return {
    lat: pos.lat,
    lng: pos.lng,
    radiusM,
    unlockAtSec,
  };
}

