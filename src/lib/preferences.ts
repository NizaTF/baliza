import { PlayerCosmetics } from '../types/game';
import { loadStatsAndAchievements } from './achievements';
import {
  sanitizeEquippedCosmetics,
  sanitizePlatinumAvatarCustomization,
  sanitizePlatinumNameCustomization,
} from './cosmetics';
import { safeLocalGet, safeLocalSet } from './safeStorage';
import { isSecretSandboxUnlocked } from './soloSandbox';

export const APP_VERSION = '1.0.0';
export const APP_AUTHOR = 'NizaTF';
export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/nizatf';

export type AppTheme = 'light' | 'warm' | 'dark';
export type AppFont = 'sans' | 'rounded' | 'mono' | 'serif';
export type MapTileStyle = 'standard';

export interface AppPreferences {
  theme: AppTheme;
  font: AppFont;
  musicEnabled: boolean;
  musicVolume: number; // 0..100
  sfxEnabled: boolean;
  sfxVolume: number; // 0..100
  mapStyle: MapTileStyle;
  vibrationEnabled: boolean;
  reducedMotion: boolean;
  equippedCosmetics: PlayerCosmetics;
  debugCosmetics?: PlayerCosmetics;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'light',
  font: 'sans',
  musicEnabled: true,
  musicVolume: 80,
  sfxEnabled: true,
  sfxVolume: 85,
  mapStyle: 'standard',
  vibrationEnabled: true,
  reducedMotion: false,
  equippedCosmetics: {},
  debugCosmetics: {},
};

const PREFS_STORAGE_KEY = 'baliza_app_preferences_v1';
const listeners = new Set<(prefs: AppPreferences) => void>();

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCosmeticsRaw(raw: unknown): PlayerCosmetics {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: PlayerCosmetics = {};
  if (typeof obj.nameEffectId === 'string' && obj.nameEffectId) {
    out.nameEffectId = obj.nameEffectId;
  }
  if (typeof obj.avatarEffectId === 'string' && obj.avatarEffectId) {
    out.avatarEffectId = obj.avatarEffectId;
  }
  if (obj.platinumName && typeof obj.platinumName === 'object') {
    out.platinumName = sanitizePlatinumNameCustomization(
      obj.platinumName as PlayerCosmetics['platinumName']
    );
  }
  if (obj.platinumAvatar && typeof obj.platinumAvatar === 'object') {
    out.platinumAvatar = sanitizePlatinumAvatarCustomization(
      obj.platinumAvatar as PlayerCosmetics['platinumAvatar']
    );
  }
  return out;
}

export function loadPreferences(): AppPreferences {
  try {
    const raw = safeLocalGet(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES, equippedCosmetics: {}, debugCosmetics: {} };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      theme:
        parsed.theme === 'warm' || parsed.theme === 'dark' || parsed.theme === 'light'
          ? parsed.theme
          : DEFAULT_PREFERENCES.theme,
      font:
        parsed.font === 'rounded' ||
        parsed.font === 'mono' ||
        parsed.font === 'serif' ||
        parsed.font === 'sans'
          ? parsed.font
          : DEFAULT_PREFERENCES.font,
      musicEnabled:
        typeof parsed.musicEnabled === 'boolean'
          ? parsed.musicEnabled
          : DEFAULT_PREFERENCES.musicEnabled,
      musicVolume: clampVolume(parsed.musicVolume, DEFAULT_PREFERENCES.musicVolume),
      sfxEnabled:
        typeof parsed.sfxEnabled === 'boolean'
          ? parsed.sfxEnabled
          : DEFAULT_PREFERENCES.sfxEnabled,
      sfxVolume: clampVolume(parsed.sfxVolume, DEFAULT_PREFERENCES.sfxVolume),
      mapStyle: 'standard',
      vibrationEnabled:
        typeof parsed.vibrationEnabled === 'boolean'
          ? parsed.vibrationEnabled
          : DEFAULT_PREFERENCES.vibrationEnabled,
      reducedMotion:
        typeof parsed.reducedMotion === 'boolean'
          ? parsed.reducedMotion
          : DEFAULT_PREFERENCES.reducedMotion,
      equippedCosmetics: normalizeCosmeticsRaw(parsed.equippedCosmetics),
      debugCosmetics: normalizeCosmeticsRaw(parsed.debugCosmetics),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, equippedCosmetics: {}, debugCosmetics: {} };
  }
}

export function getEquippedCosmetics(): PlayerCosmetics {
  const prefs = loadPreferences();
  const { achievements } = loadStatsAndAchievements();
  const unlockedIds = new Set(
    achievements.filter((a) => a.unlocked).map((a) => a.id)
  );
  const debugMode = isSecretSandboxUnlocked();
  const sourceCosmetics = debugMode
    ? {
        ...(prefs.debugCosmetics || {}),
        ...(prefs.equippedCosmetics || {}),
        ...(prefs.equippedCosmetics?.nameEffectId
          ? {}
          : prefs.debugCosmetics?.nameEffectId
          ? { nameEffectId: prefs.debugCosmetics.nameEffectId }
          : {}),
        ...(prefs.equippedCosmetics?.avatarEffectId
          ? {}
          : prefs.debugCosmetics?.avatarEffectId
          ? { avatarEffectId: prefs.debugCosmetics.avatarEffectId }
          : {}),
      }
    : prefs.equippedCosmetics;
  return sanitizeEquippedCosmetics(sourceCosmetics, unlockedIds, debugMode);
}

export function applyPreferencesToDocument(prefs: AppPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-font', prefs.font);
  root.setAttribute('data-reduce-motion', prefs.reducedMotion ? 'true' : 'false');
}

export function savePreferences(prefs: AppPreferences): AppPreferences {
  const normalizedEquipped = normalizeCosmeticsRaw(prefs.equippedCosmetics);
  const existingDebug = normalizeCosmeticsRaw(prefs.debugCosmetics);
  const debugMode = isSecretSandboxUnlocked();
  const normalized: AppPreferences = {
    ...prefs,
    musicVolume: clampVolume(prefs.musicVolume, DEFAULT_PREFERENCES.musicVolume),
    sfxVolume: clampVolume(prefs.sfxVolume, DEFAULT_PREFERENCES.sfxVolume),
    equippedCosmetics: normalizedEquipped,
    debugCosmetics: debugMode ? normalizedEquipped : existingDebug,
  };
  safeLocalSet(PREFS_STORAGE_KEY, JSON.stringify(normalized));
  applyPreferencesToDocument(normalized);
  listeners.forEach((cb) => cb(normalized));
  return normalized;
}

export function syncDebugCosmeticsOnToggle(unlocked: boolean): void {
  const prefs = loadPreferences();
  if (unlocked && prefs.debugCosmetics) {
    const hasDebugSelection =
      Boolean(prefs.debugCosmetics.nameEffectId) ||
      Boolean(prefs.debugCosmetics.avatarEffectId) ||
      Boolean(prefs.debugCosmetics.platinumName) ||
      Boolean(prefs.debugCosmetics.platinumAvatar);
    if (hasDebugSelection) {
      const merged: PlayerCosmetics = {
        ...prefs.equippedCosmetics,
        ...prefs.debugCosmetics,
      };
      const updated: AppPreferences = {
        ...prefs,
        equippedCosmetics: merged,
      };
      safeLocalSet(PREFS_STORAGE_KEY, JSON.stringify(updated));
      listeners.forEach((cb) => cb(updated));
      return;
    }
  }
  listeners.forEach((cb) => cb(prefs));
}

export function refreshPreferencesFromStorage(): void {
  const loaded = loadPreferences();
  applyPreferencesToDocument(loaded);
  listeners.forEach((cb) => cb(loaded));
}

export function subscribePreferences(
  listener: (prefs: AppPreferences) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMapTileSpec(_style?: MapTileStyle): {
  url: string;
  attribution: string;
} {
  return {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  };
}

export function triggerHaptic(pattern: number | number[] = 16): void {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return;
    }
    const prefs = loadPreferences();
    if (!prefs.vibrationEnabled) return;
    navigator.vibrate(pattern);
  } catch {
    // Ignorar en navegadores sin vibración
  }
}
