import { RoomRules, StormZonePhase } from '../types/game';
import { generateRandomZones, VALENCIA_CENTER } from './zones';

export interface RecommendedSettings {
  effectivePlayers: number;
  playersTag: string;
  roundDuration: number;
  hideTimeSec: number;
  seekersCount: number;
  stormGraceSec: number;
  zoneCount: number;
  initialRadiusM: number;
  zoneWaitSec: number;
  zoneShrinkSec: number;
  classicHintIntervalSec: number;
  beaconHoldSec: number;
  beaconRadiusM: number;
  hunterPhotoWindowSec: number;
  hunterPhotoDelaySec: number;
  fogRadiusM: number;
  radarIntervalSec: number;
  radarRangeM: number;
  trailDurationSec: number;
  stealthStillDelaySec: number;
  antiCampLimitSec: number;
  antiCampRadiusM: number;
  hotColdNearM: number;
  panicWindowSec: number;
  panicPingIntervalSec: number;
}

export function getRecommendedSettings(rawPlayerCount: number): RecommendedSettings {
  const n = Math.max(2, Math.round(rawPlayerCount || 2));
  const playersTag =
    rawPlayerCount >= 2 ? `${rawPlayerCount} jugadores` : '2+ jugadores';

  const seekersCount =
    n <= 4 ? 1 : n <= 8 ? 2 : n <= 13 ? 3 : Math.max(3, Math.round(n / 4));

  const roundDuration =
    n <= 3 ? 6 : n <= 6 ? 10 : n <= 10 ? 15 : n <= 16 ? 20 : 25;

  const hideTimeSec = n <= 4 ? 20 : n <= 8 ? 30 : n <= 14 ? 45 : 60;
  const stormGraceSec = n <= 5 ? 20 : n <= 10 ? 30 : 40;

  const zoneCount = n <= 4 ? 3 : n <= 10 ? 4 : 5;
  const initialRadiusM =
    n <= 3 ? 450 : n <= 6 ? 800 : n <= 10 ? 1100 : 1500;
  const zoneWaitSec = n <= 4 ? 75 : n <= 8 ? 105 : 130;
  const zoneShrinkSec = n <= 4 ? 35 : n <= 8 ? 50 : 65;

  return {
    effectivePlayers: n,
    playersTag,
    roundDuration,
    hideTimeSec,
    seekersCount,
    stormGraceSec,
    zoneCount,
    initialRadiusM,
    zoneWaitSec,
    zoneShrinkSec,
    classicHintIntervalSec: n <= 4 ? 25 : n <= 9 ? 30 : 45,
    beaconHoldSec: n <= 4 ? 6 : n <= 9 ? 8 : 10,
    beaconRadiusM: n <= 5 ? 20 : n <= 10 ? 25 : 35,
    hunterPhotoWindowSec: n <= 5 ? 45 : n <= 10 ? 60 : 90,
    hunterPhotoDelaySec: n <= 5 ? 15 : 25,
    fogRadiusM: n <= 4 ? 50 : n <= 9 ? 65 : 90,
    radarIntervalSec: n <= 4 ? 15 : n <= 9 ? 20 : 25,
    radarRangeM: n <= 4 ? 220 : n <= 9 ? 320 : 450,
    trailDurationSec: n <= 4 ? 60 : n <= 9 ? 90 : 120,
    stealthStillDelaySec: n <= 5 ? 8 : 12,
    antiCampLimitSec: n <= 5 ? 35 : n <= 10 ? 45 : 60,
    antiCampRadiusM: n <= 5 ? 10 : 15,
    hotColdNearM: n <= 4 ? 25 : n <= 9 ? 35 : 50,
    panicWindowSec: n <= 5 ? 45 : 60,
    panicPingIntervalSec: n <= 5 ? 10 : 15,
  };
}

export function buildRecommendedZones(
  currentZones: StormZonePhase[],
  playerCount: number
): StormZonePhase[] {
  const rec = getRecommendedSettings(playerCount);
  const anchor = currentZones[0];
  return generateRandomZones({
    anchorLat: anchor?.lat ?? VALENCIA_CENTER.lat,
    anchorLng: anchor?.lng ?? VALENCIA_CENTER.lng,
    count: rec.zoneCount,
    initialRadius: rec.initialRadiusM,
    defaultWaitSec: rec.zoneWaitSec,
    defaultShrinkSec: rec.zoneShrinkSec,
  });
}

export function applyRecommendedToRules(
  base: RoomRules,
  playerCount: number
): RoomRules {
  const rec = getRecommendedSettings(playerCount);
  const currentZones = base.zonesConfig?.zones || [];
  const anchor = currentZones[0];
  const recommendedZones = generateRandomZones({
    anchorLat: anchor?.lat ?? VALENCIA_CENTER.lat,
    anchorLng: anchor?.lng ?? VALENCIA_CENTER.lng,
    count: rec.zoneCount,
    initialRadius: rec.initialRadiusM,
    defaultWaitSec: rec.zoneWaitSec,
    defaultShrinkSec: rec.zoneShrinkSec,
  });

  return {
    ...base,
    roundDuration: rec.roundDuration,
    hideTimeSec: rec.hideTimeSec,
    stormGraceSec: rec.stormGraceSec,
    seekersCount:
      base.seekersCount === 'random' ? 'random' : rec.seekersCount,
    zonesConfig: {
      mode: base.zonesConfig?.mode ?? 'manual',
      zones: recommendedZones,
    },
    modifiers: {
      ...base.modifiers,
      classicHintIntervalSec: rec.classicHintIntervalSec,
      beaconHoldSec: rec.beaconHoldSec,
      beaconRadiusM: rec.beaconRadiusM,
      hunterPhotoWindowSec: rec.hunterPhotoWindowSec,
      hunterPhotoDelaySec: rec.hunterPhotoDelaySec,
      fogRadiusM: rec.fogRadiusM,
      radarIntervalSec: rec.radarIntervalSec,
      radarRangeM: rec.radarRangeM,
      trailDurationSec: rec.trailDurationSec,
      stealthStillDelaySec: rec.stealthStillDelaySec,
      antiCampLimitSec: rec.antiCampLimitSec,
      antiCampRadiusM: rec.antiCampRadiusM,
      hotColdNearM: rec.hotColdNearM,
      panicWindowSec: rec.panicWindowSec,
      panicPingIntervalSec: rec.panicPingIntervalSec,
    },
  };
}
