import { ACCENT_COLORS, EMOJI_PALETTE, PlayerProfile } from '../types/game';

const PROFILE_STORAGE_KEY = 'escondite_urbano_profile';
const PLAYER_ID_STORAGE_KEY = 'escondite_urbano_player_id';
const ACTIVE_SESSION_STORAGE_KEY = 'escondite_urbano_active_session';
const TAB_HEARTBEAT_KEY = 'baliza_tab_heartbeat_v1';
const HEARTBEAT_TTL_MS = 30000;

// Alfabeto sin caracteres ambiguos (sin O, 0, I, 1)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface TabHeartbeat {
  playerId: string;
  ts: number;
  active: boolean;
}

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

function readHeartbeat(): TabHeartbeat | null {
  try {
    const raw = localStorage.getItem(TAB_HEARTBEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TabHeartbeat>;
    if (
      typeof parsed.playerId === 'string' &&
      typeof parsed.ts === 'number' &&
      typeof parsed.active === 'boolean'
    ) {
      return {
        playerId: parsed.playerId,
        ts: parsed.ts,
        active: parsed.active,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function isAnotherTabActivelyHoldingSession(candidatePlayerId: string): boolean {
  const hb = readHeartbeat();
  if (!hb) return false;
  return (
    hb.playerId === candidatePlayerId &&
    hb.active &&
    Date.now() - hb.ts <= HEARTBEAT_TTL_MS
  );
}

export function touchSessionHeartbeat(playerId: string): void {
  try {
    const payload: TabHeartbeat = {
      playerId,
      ts: Date.now(),
      active: true,
    };
    localStorage.setItem(TAB_HEARTBEAT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

export function markTabInactive(playerId: string): void {
  try {
    const hb = readHeartbeat();
    if (hb && hb.playerId !== playerId) return;
    const payload: TabHeartbeat = {
      playerId,
      ts: Date.now(),
      active: false,
    };
    localStorage.setItem(TAB_HEARTBEAT_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors
  }
}

function isForceNewTabRequested(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('nuevo') === '1';
  } catch {
    return false;
  }
}

export function getPlayerId(): string {
  try {
    const sessionExisting = sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (sessionExisting) return sessionExisting;

    const forceNew = isForceNewTabRequested();

    // Si se cerró la app/PWA y se vuelve a abrir, recuperar el último jugador de la sesión persistente
    const localSession = parseActiveSessionRaw(
      localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)
    );
    if (
      !forceNew &&
      localSession &&
      !isAnotherTabActivelyHoldingSession(localSession.playerId)
    ) {
      sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, localSession.playerId);
      return localSession.playerId;
    }

    const localPlayerId = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (
      !forceNew &&
      localPlayerId &&
      !isAnotherTabActivelyHoldingSession(localPlayerId)
    ) {
      sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, localPlayerId);
      return localPlayerId;
    }

    const next = generateUuid();
    sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, next);
    if (!localPlayerId) {
      localStorage.setItem(PLAYER_ID_STORAGE_KEY, next);
    }
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

function parseActiveSessionRaw(raw: string | null): ActiveSession | null {
  if (!raw) return null;
  try {
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

export function loadActiveSession(): ActiveSession | null {
  try {
    const fromSession = parseActiveSessionRaw(
      sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)
    );
    if (fromSession) return fromSession;

    const fromLocal = parseActiveSessionRaw(
      localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)
    );
    if (
      !isForceNewTabRequested() &&
      fromLocal &&
      !isAnotherTabActivelyHoldingSession(fromLocal.playerId)
    ) {
      sessionStorage.setItem(
        ACTIVE_SESSION_STORAGE_KEY,
        JSON.stringify(fromLocal)
      );
      sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, fromLocal.playerId);
      return fromLocal;
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
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      localStorage.removeItem(TAB_HEARTBEAT_KEY);
    } else {
      const serialized = JSON.stringify(session);
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, serialized);
      sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, session.playerId);
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, serialized);
      localStorage.setItem(PLAYER_ID_STORAGE_KEY, session.playerId);
      touchSessionHeartbeat(session.playerId);
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
