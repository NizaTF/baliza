import { ACCENT_COLORS, EMOJI_PALETTE, PlayerProfile } from '../types/game';
import {
  safeLocalGet,
  safeLocalRemove,
  safeLocalSet,
  safeSessionGet,
  safeSessionRemove,
  safeSessionSet,
} from './safeStorage';

const PROFILE_STORAGE_KEY = 'escondite_urbano_profile';
const PLAYER_ID_STORAGE_KEY = 'escondite_urbano_player_id';
const ACTIVE_SESSION_STORAGE_KEY = 'escondite_urbano_active_session';
const TAB_HEARTBEAT_KEY = 'baliza_tab_heartbeat_v1';
const HEARTBEAT_TTL_MS = 2 * 60 * 1000; // 2 minutos

let cachedPlayerId: string | null = null;

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
    const raw = safeLocalGet(TAB_HEARTBEAT_KEY);
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
    safeLocalSet(TAB_HEARTBEAT_KEY, JSON.stringify(payload));
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
    safeLocalSet(TAB_HEARTBEAT_KEY, JSON.stringify(payload));
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

export function setCachedPlayerId(id: string): void {
  cachedPlayerId = id;
  safeSessionSet(PLAYER_ID_STORAGE_KEY, id);
  safeLocalSet(PLAYER_ID_STORAGE_KEY, id);
}

export function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId;

  try {
    const sessionExisting = safeSessionGet(PLAYER_ID_STORAGE_KEY);
    if (sessionExisting) {
      cachedPlayerId = sessionExisting;
      return sessionExisting;
    }

    const forceNew = isForceNewTabRequested();

    // Si se cerró la app/PWA y se vuelve a abrir, recuperar el último jugador de la sesión persistente
    const localSession = parseActiveSessionRaw(
      safeLocalGet(ACTIVE_SESSION_STORAGE_KEY)
    );
    if (
      !forceNew &&
      localSession &&
      !isAnotherTabActivelyHoldingSession(localSession.playerId)
    ) {
      cachedPlayerId = localSession.playerId;
      safeSessionSet(PLAYER_ID_STORAGE_KEY, localSession.playerId);
      return localSession.playerId;
    }

    const localPlayerId = safeLocalGet(PLAYER_ID_STORAGE_KEY);
    if (
      !forceNew &&
      localPlayerId &&
      !isAnotherTabActivelyHoldingSession(localPlayerId)
    ) {
      cachedPlayerId = localPlayerId;
      safeSessionSet(PLAYER_ID_STORAGE_KEY, localPlayerId);
      return localPlayerId;
    }

    const next = generateUuid();
    cachedPlayerId = next;
    safeSessionSet(PLAYER_ID_STORAGE_KEY, next);
    if (!localPlayerId) {
      safeLocalSet(PLAYER_ID_STORAGE_KEY, next);
    }
    return next;
  } catch {
    const fallback = generateUuid();
    cachedPlayerId = fallback;
    return fallback;
  }
}

export function extractEmojiGraphemes(input: string): string[] {
  const cleaned = input.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!cleaned) return [];
  const SegmenterCtor = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string,
        options?: { granularity: 'grapheme' }
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (typeof SegmenterCtor === 'function') {
    const seg = new SegmenterCtor('es', { granularity: 'grapheme' });
    return Array.from(seg.segment(cleaned), (s) => s.segment).filter(
      (s) => s.trim().length > 0
    );
  }
  return Array.from(cleaned).filter((s) => s.trim().length > 0);
}

export function sanitizePlayerEmoji(
  raw: unknown,
  fallback: string = EMOJI_PALETTE[0]
): string {
  if (typeof raw !== 'string') return fallback;
  const graphemes = extractEmojiGraphemes(raw);
  if (graphemes.length === 0) return fallback;
  return graphemes[0].slice(0, 24);
}

export function sanitizeHexColor(
  raw: unknown,
  fallback: string = ACCENT_COLORS[0].hex
): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const shortMatch = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
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
    const raw = safeLocalGet(PROFILE_STORAGE_KEY);
    if (!raw) return getDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 12) : '',
      emoji: sanitizePlayerEmoji(parsed.emoji, EMOJI_PALETTE[0]),
      color: sanitizeHexColor(parsed.color, ACCENT_COLORS[0].hex),
    };
  } catch {
    return getDefaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    safeLocalSet(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: profile.name.slice(0, 12),
        emoji: sanitizePlayerEmoji(profile.emoji, EMOJI_PALETTE[0]),
        color: sanitizeHexColor(profile.color, ACCENT_COLORS[0].hex),
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
      safeSessionGet(ACTIVE_SESSION_STORAGE_KEY)
    );
    if (fromSession) {
      cachedPlayerId = fromSession.playerId;
      return fromSession;
    }

    const fromLocal = parseActiveSessionRaw(
      safeLocalGet(ACTIVE_SESSION_STORAGE_KEY)
    );
    if (
      !isForceNewTabRequested() &&
      fromLocal &&
      !isAnotherTabActivelyHoldingSession(fromLocal.playerId)
    ) {
      cachedPlayerId = fromLocal.playerId;
      safeSessionSet(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(fromLocal));
      safeSessionSet(PLAYER_ID_STORAGE_KEY, fromLocal.playerId);
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
      safeSessionRemove(ACTIVE_SESSION_STORAGE_KEY);
      safeLocalRemove(ACTIVE_SESSION_STORAGE_KEY);
      safeLocalRemove(TAB_HEARTBEAT_KEY);
    } else {
      cachedPlayerId = session.playerId;
      const serialized = JSON.stringify(session);
      safeSessionSet(ACTIVE_SESSION_STORAGE_KEY, serialized);
      safeSessionSet(PLAYER_ID_STORAGE_KEY, session.playerId);
      safeLocalSet(ACTIVE_SESSION_STORAGE_KEY, serialized);
      safeLocalSet(PLAYER_ID_STORAGE_KEY, session.playerId);
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
