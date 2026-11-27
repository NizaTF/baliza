import { DEFAULT_RULES, RoomRules } from '../types/game';
import { safeLocalGet, safeLocalSet } from './safeStorage';
import { generateRandomZones, VALENCIA_CENTER } from './zones';

export interface RulePreset {
  id: string;
  name: string;
  description: string;
  builtIn?: boolean;
  rules: RoomRules;
}

const CUSTOM_PRESETS_KEY = 'baliza_custom_presets_v1';

export const BUILT_IN_PRESETS: RulePreset[] = [
  {
    id: 'builtin_express',
    name: '⚡ Express 5 min',
    description: 'Ronda rápida con radar corto, baliza temprana y zonas compactas.',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 5,
      hideTimeSec: 20,
      stormGraceSec: 20,
      zonesConfig: {
        mode: 'random',
        zones: generateRandomZones({
          anchorLat: VALENCIA_CENTER.lat,
          anchorLng: VALENCIA_CENTER.lng,
          count: 3,
          initialRadius: 420,
          defaultWaitSec: 55,
          defaultShrinkSec: 30,
        }),
      },
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        radarEnabled: true,
        radarIntervalSec: 15,
        radarRangeM: 220,
        hotColdEnabled: true,
        hotColdNearM: 25,
        abilitiesEnabled: true,
        abilitiesPerPlayer: 2,
      },
    },
  },
  {
    id: 'builtin_infection_night',
    name: '🧟 Noche de Infección',
    description: 'Cada fugitivo cazado pasa al bando buscador con niebla y señuelos.',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 10,
      hideTimeSec: 25,
      stormGraceSec: 25,
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        infectionModeEnabled: true,
        fogEnabled: true,
        fogRadiusM: 80,
        radarEnabled: true,
        radarIntervalSec: 20,
        radarRangeM: 280,
        abilitiesEnabled: true,
        abilitiesPerPlayer: 2,
      },
    },
  },
  {
    id: 'builtin_contracts',
    name: '🎯 Caza por Objetivos',
    description: 'Cada buscador caza a un fugitivo asignado con brújula y habilidades.',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 12,
      hideTimeSec: 30,
      stormGraceSec: 25,
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        contractHuntEnabled: true,
        hotColdEnabled: true,
        hotColdNearM: 35,
        trailEnabled: true,
        trailDurationSec: 75,
        abilitiesEnabled: true,
        abilitiesPerPlayer: 2,
      },
    },
  },
];

export function loadCustomPresets(): RulePreset[] {
  try {
    const raw = safeLocalGet(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RulePreset =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        Boolean(item.rules && typeof item.rules === 'object')
    );
  } catch {
    return [];
  }
}

export function saveCustomPreset(name: string, rules: RoomRules): RulePreset[] {
  const cleanName = name.trim().slice(0, 32) || 'Mi preset';
  const sanitizedRules: RoomRules = {
    ...structuredClone(rules),
    matchState: null,
    lobbyCountdown: null,
    roomLocked: false,
  };
  const current = loadCustomPresets();
  const next: RulePreset[] = [
    {
      id: `custom_${Date.now()}`,
      name: cleanName,
      description: `${sanitizedRules.roundDuration} min · ${
        sanitizedRules.modifiers.infectionModeEnabled
          ? 'Infección'
          : sanitizedRules.modifiers.contractHuntEnabled
          ? 'Contratos'
          : 'Clásico'
      }`,
      builtIn: false,
      rules: sanitizedRules,
    },
    ...current,
  ].slice(0, 12);
  safeLocalSet(CUSTOM_PRESETS_KEY, JSON.stringify(next));
  return next;
}

export function deleteCustomPreset(id: string): RulePreset[] {
  const next = loadCustomPresets().filter((p) => p.id !== id);
  safeLocalSet(CUSTOM_PRESETS_KEY, JSON.stringify(next));
  return next;
}
