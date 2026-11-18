export interface PlayerProfile {
  name: string;
  emoji: string;
  color: string;
}

export type RoundDuration = 10 | 20 | 30 | 45 | 60;
export type SeekersCount = 1 | 2 | 3 | 'random';
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

export interface CaughtRecord {
  at: string;
  byPlayerId: string | 'storm';
}

export interface MatchState {
  active: boolean;
  startedAt: string;
  roles: Record<string, PlayerRole>;
  activeZones: StormZonePhase[];
  caught?: Record<string, CaughtRecord>;
}

export interface RoomModifiers {
  forbiddenZones: string[];
  walkOnly: boolean;
  doubleAgent: boolean;
  mustMove: boolean;
  noChat: boolean;
  showCountdown: boolean;
  nightMode: boolean;
}

export interface PlayerLocationPayload {
  playerId: string;
  lat: number;
  lng: number;
  accuracy: number;
  inStorm: boolean;
  stormExposed: boolean;
  updatedAt: number;
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
  roomLocked?: boolean;
  zonesConfig?: ZonesConfig;
  manualRoles?: Record<string, PlayerRole>;
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
  roundDuration: 30,
  seekersCount: 'random',
  roleAssignment: 'random',
  playZone: 'free',
  hints: false,
  hidersCanSeeSeekers: false,
  seekersCanSeeHiders: false,
  stormGraceSec: 30,
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
  },
};
