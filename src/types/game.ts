export interface PlayerProfile {
  name: string;
  emoji: string;
  color: string;
}

export type RoundDuration = number;
export type SeekersCount = 'random' | number;
export type RoleAssignment = 'manual' | 'random';
export type PlayZone = 'free' | 'radius_500m' | 'radius_1km' | 'radius_2km';
export type ZoneMode = 'manual' | 'random';
export type PlayerRole = 'seeker' | 'hider';

export interface StormZonePhase {
  id: string;
  lat: number;
  lng: number;
  radius: number; // metros
  waitTimeSec: number; // tiempo entre cada zona (espera antes de cerrar)
  shrinkTimeSec: number; // tiempo de cierre hacia esta zona
}

export interface ZonesConfig {
  mode: ZoneMode;
  zones: StormZonePhase[];
}

export type MatchWinner = 'seekers' | 'hiders';
export type MatchWinReason = 'all_caught' | 'time_expired' | 'beacon_extracted';
export type LocationGuardStatus = 'active' | 'disabled' | 'unsupported';

export interface ExtractionBeacon {
  lat: number;
  lng: number;
  radiusM: number;
  unlockAtSec: number;
  activatedByPlayerId?: string;
  activatedAt?: string;
}

export interface CaughtRecord {
  at: string;
  byPlayerId: string | 'storm' | 'anticheat' | 'photo';
}

export interface InfectedRecord {
  at: string;
  byPlayerId: string;
}

export interface PhotoSubmissionRecord {
  at: string;
  status: 'accepted' | 'rejected';
}

export interface PhotoChallengeState {
  id: string;
  startedAt: string;
  expiresAt: string;
  windowSec: number;
  completedBy: Record<string, PhotoSubmissionRecord>;
}

export interface MatchPathPoint {
  lat: number;
  lng: number;
  tSec: number;
}

export interface PlayerRecapRoute {
  playerId: string;
  points: MatchPathPoint[];
  totalMeters: number;
}

export interface MatchState {
  active: boolean;
  startedAt: string;
  roles: Record<string, PlayerRole>;
  activeZones: StormZonePhase[];
  caught?: Record<string, CaughtRecord>;
  infected?: Record<string, InfectedRecord>;
  rouletteDurationMs?: number;
  seekerOrder?: string[];
  hideTimeSec?: number;
  extractionBeacon?: ExtractionBeacon | null;
  photoChallenge?: PhotoChallengeState | null;
  winner?: MatchWinner | null;
  winReason?: MatchWinReason | null;
  endedAt?: string | null;
}

export interface RoomModifiers {
  forbiddenZones: string[];
  walkOnly: boolean;
  doubleAgent: boolean;
  mustMove: boolean;
  noChat: boolean;
  showCountdown: boolean;
  nightMode: boolean;
  // Modificadores activos configurables en partida
  classicModeEnabled?: boolean;
  classicHintIntervalSec?: number;
  classicHintsIncludeSeeker?: boolean;
  beaconHoldSec?: number;
  beaconRadiusM?: number;
  hunterPhotoEnabled?: boolean;
  hunterPhotoWindowSec?: number;
  hunterPhotoDelaySec?: number;
  fogEnabled?: boolean;
  fogRadiusM?: number;
  radarEnabled?: boolean;
  radarIntervalSec?: number;
  radarRangeM?: number;
  trailEnabled?: boolean;
  trailDurationSec?: number;
  // Modificadores extra opcionales
  stealthStillEnabled?: boolean;
  stealthStillDelaySec?: number;
  antiCampEnabled?: boolean;
  antiCampLimitSec?: number;
  antiCampRadiusM?: number;
  hotColdEnabled?: boolean;
  hotColdNearM?: number;
  panicEndgameEnabled?: boolean;
  panicWindowSec?: number;
  panicPingIntervalSec?: number;
  infectionModeEnabled?: boolean;
  testJoystickEnabled?: boolean;
  testJoystickDefaultSpeed?: 'walk' | 'run' | 'fast';
}

export interface PlayerLocationPayload {
  playerId: string;
  lat: number;
  lng: number;
  accuracy: number;
  inStorm: boolean;
  stormExposed: boolean;
  updatedAt: number;
  locationStatus?: LocationGuardStatus;
  locationDisabled?: boolean;
  isStill?: boolean;
  campExposed?: boolean;
}

export interface RoomRules {
  roundDuration: RoundDuration;
  seekersCount: SeekersCount;
  roleAssignment: RoleAssignment;
  playZone: PlayZone;
  hints: boolean;
  hidersCanSeeSeekers?: boolean;
  seekersCanSeeHiders?: boolean;
  stormGraceSec?: number;
  hideTimeSec?: number;
  timeVictoryEnabled?: boolean;
  beaconVictoryEnabled?: boolean;
  requireLocationGuard?: boolean;
  roomLocked?: boolean;
  zonesConfig?: ZonesConfig;
  manualRoles?: Record<string, PlayerRole>;
  lobbyCountdown?: {
    startedAt: string;
    durationSec: number;
  } | null;
  matchState?: MatchState | null;
  modifiers: RoomModifiers;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomRecord {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  rules: RoomRules;
  created_at: string;
}

export interface PlayerRecord {
  id: string;
  room_id: string;
  name: string;
  emoji: string;
  color: string;
  is_host: boolean;
  joined_at: string;
}

export const EMOJI_PALETTE: readonly string[] = [
  '🦊', '🦝', '🦉', '🐸', '🦁', '🐼',
  '🐙', '🦈', '😎', '🕵️', '🥷', '🤠',
  '🏃', '🛹', '🚲', '🧭', '🌳', '🏙️',
  '🔦', '🎭', '⚡', '🔥', '🍀', '🎯',
];

export interface AccentColorOption {
  id: string;
  label: string;
  hex: string;
}

export const ACCENT_COLORS: readonly AccentColorOption[] = [
  { id: 'emerald', label: 'Esmeralda', hex: '#059669' },
  { id: 'amber', label: 'Ámbar', hex: '#D97706' },
  { id: 'cobalt', label: 'Cobalto', hex: '#2563EB' },
  { id: 'coral', label: 'Coral', hex: '#E11D48' },
  { id: 'violet', label: 'Violeta', hex: '#7C3AED' },
  { id: 'teal', label: 'Turquesa', hex: '#0D9488' },
];

export const DEFAULT_ZONES_CONFIG: ZonesConfig = {
  mode: 'manual',
  zones: [
    {
      id: 'z1',
      lat: 39.4699,
      lng: -0.3763,
      radius: 900,
      waitTimeSec: 120,
      shrinkTimeSec: 60,
    },
    {
      id: 'z2',
      lat: 39.4714,
      lng: -0.3741,
      radius: 520,
      waitTimeSec: 90,
      shrinkTimeSec: 45,
    },
    {
      id: 'z3',
      lat: 39.4706,
      lng: -0.3752,
      radius: 260,
      waitTimeSec: 60,
      shrinkTimeSec: 45,
    },
    {
      id: 'z4',
      lat: 39.4701,
      lng: -0.3756,
      radius: 100,
      waitTimeSec: 45,
      shrinkTimeSec: 30,
    },
  ],
};

export const DEFAULT_RULES: RoomRules = {
  roundDuration: 10,
  seekersCount: 'random',
  roleAssignment: 'random',
  playZone: 'free',
  hints: false,
  hidersCanSeeSeekers: false,
  seekersCanSeeHiders: false,
  stormGraceSec: 30,
  hideTimeSec: 30,
  timeVictoryEnabled: true,
  beaconVictoryEnabled: true,
  requireLocationGuard: true,
  roomLocked: false,
  zonesConfig: DEFAULT_ZONES_CONFIG,
  manualRoles: {},
  matchState: null,
  modifiers: {
    forbiddenZones: [],
    walkOnly: true,
    doubleAgent: false,
    mustMove: false,
    noChat: false,
    showCountdown: true,
    nightMode: false,
    classicModeEnabled: false,
    classicHintIntervalSec: 30,
    classicHintsIncludeSeeker: false,
    beaconHoldSec: 8,
    beaconRadiusM: 25,
    hunterPhotoEnabled: false,
    hunterPhotoWindowSec: 60,
    hunterPhotoDelaySec: 15,
    fogEnabled: false,
    fogRadiusM: 60,
    radarEnabled: false,
    radarIntervalSec: 20,
    radarRangeM: 300,
    trailEnabled: false,
    trailDurationSec: 90,
    stealthStillEnabled: false,
    stealthStillDelaySec: 10,
    antiCampEnabled: false,
    antiCampLimitSec: 45,
    antiCampRadiusM: 12,
    hotColdEnabled: false,
    hotColdNearM: 35,
    panicEndgameEnabled: false,
    panicWindowSec: 60,
    panicPingIntervalSec: 15,
    infectionModeEnabled: false,
    testJoystickEnabled: true,
    testJoystickDefaultSpeed: 'run',
  },
};
