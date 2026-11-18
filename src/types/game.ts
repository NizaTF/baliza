export interface PlayerProfile {
  name: string;
  emoji: string;
  color: string;
}

export type RoundDuration = 10 | 20 | 30 | 45 | 60;
export type SeekersCount = 1 | 2 | 3 | 'random';
export type RoleAssignment = 'manual' | 'random';
export type PlayZone = 'free' | 'radius_500m' | 'radius_1km' | 'radius_2km';

export interface RoomModifiers {
  forbiddenZones: string[];
  walkOnly: boolean;
  doubleAgent: boolean;
  mustMove: boolean;
  noChat: boolean;
  showCountdown: boolean;
  nightMode: boolean;
}

export interface RoomRules {
  roundDuration: RoundDuration;
  seekersCount: SeekersCount;
  roleAssignment: RoleAssignment;
  playZone: PlayZone;
  hints: boolean;
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

export const DEFAULT_RULES: RoomRules = {
  roundDuration: 30,
  seekersCount: 'random',
  roleAssignment: 'random',
  playZone: 'free',
  hints: false,
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

export const SUGGESTED_FORBIDDEN_ZONES: readonly string[] = [
  'Carreteras principales',
  'Parkings subterráneos',
  'Vías de tren',
  'Propiedad privada',
  'Centros comerciales',
];
