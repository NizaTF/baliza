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
  {
    id: 'builtin_no_stop',
    name: '🏃 No Pares de Correr',
    description: 'Si te detienes más de 12 s quedas eliminado al instante (todos los bandos).',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 8,
      hideTimeSec: 15,
      stormGraceSec: 15,
      zonesConfig: {
        mode: 'random',
        zones: generateRandomZones({
          anchorLat: VALENCIA_CENTER.lat,
          anchorLng: VALENCIA_CENTER.lng,
          count: 4,
          initialRadius: 480,
          defaultWaitSec: 45,
          defaultShrinkSec: 25,
        }),
      },
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        antiCampEnabled: true,
        antiCampEliminate: true,
        antiCampLimitSec: 12,
        antiCampRadiusM: 15,
        mustMove: true,
        abilitiesEnabled: false,
        radarEnabled: true,
        radarIntervalSec: 20,
        radarRangeM: 280,
      },
    },
  },
  {
    id: 'builtin_blackout',
    name: '🌑 Apagón Total',
    description: 'Niebla cerrada de 35 m, sin radar ni rastros ni chat. Sobrevive a ciegas.',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 10,
      hideTimeSec: 25,
      stormGraceSec: 20,
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        fogEnabled: true,
        fogRadiusM: 35,
        radarEnabled: false,
        trailEnabled: false,
        hotColdEnabled: false,
        classicModeEnabled: false,
        noChat: true,
        abilitiesEnabled: true,
        abilitiesPerPlayer: 2,
      },
    },
  },
  {
    id: 'builtin_paparazzi',
    name: '📸 Paparazzi Suicida',
    description: 'Foto obligatoria de 35 s con recta final frenética y baliza exigente.',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 10,
      hideTimeSec: 20,
      stormGraceSec: 15,
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        hunterPhotoEnabled: true,
        hunterPhotoWindowSec: 35,
        hunterPhotoDelaySec: 15,
        panicEndgameEnabled: true,
        panicWindowSec: 45,
        panicPingIntervalSec: 10,
        beaconHoldSec: 10,
        beaconRadiusM: 20,
        abilitiesEnabled: true,
        abilitiesPerPlayer: 2,
      },
    },
  },
  {
    id: 'builtin_pandemic_zero',
    name: '☣️ Pandemia Cero',
    description: 'Un único Paciente Cero, rastro de 120 s y contratos activos.',
    builtIn: true,
    rules: {
      ...structuredClone(DEFAULT_RULES),
      roundDuration: 12,
      seekersCount: 1,
      roleAssignment: 'random',
      hideTimeSec: 20,
      stormGraceSec: 20,
      modifiers: {
        ...structuredClone(DEFAULT_RULES.modifiers),
        infectionModeEnabled: true,
        contractHuntEnabled: true,
        trailEnabled: true,
        trailDurationSec: 120,
        radarEnabled: true,
        radarIntervalSec: 25,
        radarRangeM: 320,
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
    playerCosmetics: undefined,
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
