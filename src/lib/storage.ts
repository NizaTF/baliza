import { ACCENT_COLORS, EMOJI_PALETTE, PlayerProfile } from '../types/game';

const PROFILE_STORAGE_KEY = 'escondite_urbano_profile';
const PLAYER_ID_STORAGE_KEY = 'escondite_urbano_player_id';
const ACTIVE_SESSION_STORAGE_KEY = 'escondite_urbano_active_session';

// Alfabeto sin caracteres ambiguos (sin O, 0, I, 1)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getPlayerId(): string {
  try {
    const existing = sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (existing) return existing;
    const next = generateUuid();
    sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return generateUuid();
  }
}

export function getDefaultProfile(): PlayerProfile {
  return {
    name: '',
    emoji: EMOJI_PALETTE[0],
    color: ACCENT_COLORS[0].hex,
  };
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return getDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 12) : '',
      emoji:
        typeof parsed.emoji === 'string' && EMOJI_PALETTE.includes(parsed.emoji)
          ? parsed.emoji
          : EMOJI_PALETTE[0],
      color:
        typeof parsed.color === 'string' &&
        ACCENT_COLORS.some((c) => c.hex === parsed.color)
          ? parsed.color
          : ACCENT_COLORS[0].hex,
    };
  } catch {
    return getDefaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: profile.name.slice(0, 12),
        emoji: profile.emoji,
        color: profile.color,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export interface ActiveSession {
  roomId: string;
  roomCode: string;
  playerId: string;
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveSession>;
    if (parsed.roomId && parsed.roomCode && parsed.playerId) {
      return {
        roomId: parsed.roomId,
        roomCode: parsed.roomCode,
        playerId: parsed.playerId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveActiveSession(session: ActiveSession | null): void {
  try {
    if (!session) {
      sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage errors
  }
}

export function generateRoomCode(length = 4): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    result += CODE_ALPHABET[idx];
  }
  return result;
}

export function sanitizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}
