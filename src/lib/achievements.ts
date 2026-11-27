import { safeLocalGet, safeLocalRemove, safeLocalSet } from './safeStorage';
import { MatchWinReason } from '../types/game';

export type AchievementCategory =
  | 'presets'
  | 'infection'
  | 'objectives'
  | 'tactics'
  | 'career';

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  presets: 'Presets extremos y Supervivencia',
  infection: 'Modo Infección',
  objectives: 'Baliza, Contratos y Caos',
  tactics: 'Habilidades, Brújula y Pistas',
  career: 'Carrera Legendaria y Platino',
};

export interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  hiderWins: number;
  seekerWins: number;
  totalMeters: number;
  totalCatches: number;
  totalInfections: number;
  beaconExtractions: number;
  contractsCompleted: number;
  abilitiesUsed: number;
  winStreak: number;
  bestWinStreak: number;
  noStopWins: number;
  blackoutWins: number;
  photoCloseWins: number;
  stormEdgeWins: number;
  patientZeroSoloWins: number;
  lastHumanWins: number;
  fastDoubleInfections: number;
  clutchBeacons: number;
  tripleContractMatches: number;
  panicLastCatches: number;
  untouchableWins: number;
  urbanGhostWins: number;
  techHunterCatches: number;
  pocketPureWins: number;
  bloodhoundCatches: number;
  recordedMatchKeys: string[];
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  icon: string;
  target: number;
  getValue: (stats: PlayerStats, unlockedAt: Record<string, string>) => number;
}

export interface AchievementProgress extends AchievementDef {
  current: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface MatchOutcomeInput {
  matchKey: string;
  didWin: boolean;
  myRole: 'seeker' | 'hider';
  winReason?: MatchWinReason;
  metersWalked: number;
  catchesByMe: number;
  infectionsByMe: number;
  activatedBeaconByMe: boolean;
  contractsCompletedByMe: number;
  wasEliminated?: boolean;
  antiCampEliminate?: boolean;
  hadAntiCampWarning?: boolean;
  fogEnabled?: boolean;
  fogRadiusM?: number;
  radarEnabled?: boolean;
  photoCompletedByMe?: boolean;
  nearestSeekerDistAtEndM?: number | null;
  reachedFinalZone?: boolean;
  stormOutsideTotalSec?: number;
  infectionModeEnabled?: boolean;
  isInitialSeeker?: boolean;
  initialSeekersCount?: number;
  aliveHidersAtEnd?: number;
  totalSeekersAtEnd?: number;
  hadFastDoubleInfection?: boolean;
  timeRemainingAtEndSec?: number | null;
  panicEndgameEnabled?: boolean;
  caughtLastHiderByMe?: boolean;
  myAbilityUses?: number;
  usedDecoy?: boolean;
  usedCloak?: boolean;
  hadTechHunterCatch?: boolean;
  pocketCompassRatio?: number;
  trailEnabled?: boolean;
  hotColdEnabled?: boolean;
}

interface StoredAchievementsData {
  stats: PlayerStats;
  unlockedAt: Record<string, string>;
}

const LEGACY_STORAGE_KEY = 'baliza_achievements_v1';
const ACHIEVEMENTS_STORAGE_KEY = 'baliza_achievements_v2';

const DEFAULT_STATS: PlayerStats = {
  matchesPlayed: 0,
  wins: 0,
  hiderWins: 0,
  seekerWins: 0,
  totalMeters: 0,
  totalCatches: 0,
  totalInfections: 0,
  beaconExtractions: 0,
  contractsCompleted: 0,
  abilitiesUsed: 0,
  winStreak: 0,
  bestWinStreak: 0,
  noStopWins: 0,
  blackoutWins: 0,
  photoCloseWins: 0,
  stormEdgeWins: 0,
  patientZeroSoloWins: 0,
  lastHumanWins: 0,
  fastDoubleInfections: 0,
  clutchBeacons: 0,
  tripleContractMatches: 0,
  panicLastCatches: 0,
  untouchableWins: 0,
  urbanGhostWins: 0,
  techHunterCatches: 0,
  pocketPureWins: 0,
  bloodhoundCatches: 0,
  recordedMatchKeys: [],
};

const NON_PLATINUM_IDS = [
  'no_stop_win',
  'blackout_win',
  'photo_close_win',
  'storm_edge_win',
  'patient_zero_solo',
  'last_human_win',
  'double_infection_fast',
  'clutch_beacon',
  'contract_triple',
  'panic_last_catch',
  'untouchable_time',
  'urban_ghost',
  'tech_hunter',
  'pocket_pure_win',
  'bloodhound_5',
  'infernal_streak_5',
  'dual_legend_10',
  'ultramarathon_25k',
  'supreme_reaper_50',
];

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  // Presets extremos y Supervivencia
  {
    id: 'no_stop_win',
    category: 'presets',
    title: 'Corazón a 200',
    description:
      'Gana en No Pares de Correr (anti-camper mortal) sin avisos de quietud y recorriendo >= 1.200 m.',
    icon: '🏃',
    target: 1,
    getValue: (s) => s.noStopWins,
  },
  {
    id: 'blackout_win',
    category: 'presets',
    title: 'Sexto Sentido',
    description:
      'Gana una partida en Apagón Total (niebla <= 40 m y sin radar).',
    icon: '🌑',
    target: 1,
    getValue: (s) => s.blackoutWins,
  },
  {
    id: 'photo_close_win',
    category: 'presets',
    title: 'Selfie a Quemarropa',
    description:
      'Completa Foto con el cazador y gana como fugitivo con un buscador a < 25 m al terminar.',
    icon: '📸',
    target: 1,
    getValue: (s) => s.photoCloseWins,
  },
  {
    id: 'storm_edge_win',
    category: 'presets',
    title: 'Bailando en el Borde',
    description:
      'Llega a la última zona de tormenta y aguanta >= 10 s fuera de zona antes de ganar.',
    icon: '🌪️',
    target: 1,
    getValue: (s) => s.stormEdgeWins,
  },

  // Modo Infección
  {
    id: 'patient_zero_solo',
    category: 'infection',
    title: 'Paciente Cero Absoluto',
    description:
      'Empieza como único infectado inicial, infecta a >= 3 rivales y gana en solitario.',
    icon: '☣️',
    target: 1,
    getValue: (s) => s.patientZeroSoloWins,
  },
  {
    id: 'last_human_win',
    category: 'infection',
    title: 'Último Humano en Pie',
    description:
      'Gana como fugitivo en Infección siendo el último vivo contra >= 3 infectados.',
    icon: '🧬',
    target: 1,
    getValue: (s) => s.lastHumanWins,
  },
  {
    id: 'double_infection_fast',
    category: 'infection',
    title: 'Brotes en Cadena',
    description: 'Infecta a 2 fugitivos en menos de 45 s en una misma partida.',
    icon: '⚡',
    target: 1,
    getValue: (s) => s.fastDoubleInfections,
  },

  // Baliza, Contratos y Caos
  {
    id: 'clutch_beacon',
    category: 'objectives',
    title: 'Extracción en el Último Suspiro',
    description:
      'Activa la Baliza verde quedando < 20 s de partida o con un buscador a < 30 m.',
    icon: '🚩',
    target: 1,
    getValue: (s) => s.clutchBeacons,
  },
  {
    id: 'contract_triple',
    category: 'objectives',
    title: 'Sicario Implacable',
    description:
      'Completa 3 contratos asignados en una sola partida de Caza por Objetivos.',
    icon: '🎯',
    target: 1,
    getValue: (s) => s.tripleContractMatches,
  },
  {
    id: 'panic_last_catch',
    category: 'objectives',
    title: 'Al Límite del Caos',
    description:
      'Atrapa al último fugitivo durante los últimos 30 s con Recta Final Frenética.',
    icon: '⏱️',
    target: 1,
    getValue: (s) => s.panicLastCatches,
  },

  // Habilidades, Brújula y Pistas
  {
    id: 'untouchable_time',
    category: 'tactics',
    title: 'Intocable',
    description:
      'Gana como fugitivo por tiempo sin usar habilidades (0) ni activar la baliza.',
    icon: '🛡️',
    target: 1,
    getValue: (s) => s.untouchableWins,
  },
  {
    id: 'urban_ghost',
    category: 'tactics',
    title: 'Fantasma Urbano',
    description:
      'Gana como fugitivo tras usar Señuelo y Silencio en la misma partida.',
    icon: '🎭',
    target: 1,
    getValue: (s) => s.urbanGhostWins,
  },
  {
    id: 'tech_hunter',
    category: 'tactics',
    title: 'Cazador Tecnológico',
    description:
      'Atrapa o infecta a un fugitivo en < 20 s tras usar Sonar o Rastreo Rápido.',
    icon: '📡',
    target: 1,
    getValue: (s) => s.techHunterCatches,
  },
  {
    id: 'pocket_pure_win',
    category: 'tactics',
    title: 'Modo Bolsillo Puro',
    description:
      'Gana una partida usando la Brújula táctil durante >= 70 % de la cacería.',
    icon: '🧭',
    target: 1,
    getValue: (s) => s.pocketPureWins,
  },
  {
    id: 'bloodhound_5',
    category: 'tactics',
    title: 'Sabueso',
    description:
      'Consigue 5 capturas o infecciones con Modo Rastro o Frío/Caliente activos.',
    icon: '👣',
    target: 5,
    getValue: (s) => s.bloodhoundCatches,
  },

  // Carrera Legendaria y Platino
  {
    id: 'infernal_streak_5',
    category: 'career',
    title: 'Racha Infernal x5',
    description: 'Gana 5 partidas seguidas sin perder ni ser eliminado.',
    icon: '🔥',
    target: 5,
    getValue: (s) => s.bestWinStreak,
  },
  {
    id: 'dual_legend_10',
    category: 'career',
    title: 'Leyenda de Ambos Bandos',
    description: 'Gana 10 partidas como Fugitivo y 10 como Buscador.',
    icon: '👑',
    target: 20,
    getValue: (s) => Math.min(10, s.hiderWins) + Math.min(10, s.seekerWins),
  },
  {
    id: 'ultramarathon_25k',
    category: 'career',
    title: 'Ultramaratón Baliza',
    description: 'Recorre 25.000 metros (25 km) acumulados en partidas.',
    icon: '🥾',
    target: 25000,
    getValue: (s) => Math.round(s.totalMeters),
  },
  {
    id: 'supreme_reaper_50',
    category: 'career',
    title: 'Segador Supremo',
    description: 'Acumula 50 capturas o infecciones totales.',
    icon: '💀',
    target: 50,
    getValue: (s) => s.totalCatches + s.totalInfections,
  },
  {
    id: 'platinum_master',
    category: 'career',
    title: '100 % Platino: Señor de la Baliza',
    description: 'Desbloquea los otros 19 logros tryhard y consigue texto e icono 100 % personalizables.',
    icon: '🏆',
    target: 19,
    getValue: (_s, unlockedAt) =>
      NON_PLATINUM_IDS.filter((id) => Boolean(unlockedAt[id])).length,
  },
];

function sanitizeUnlockedMap(
  rawMap: Record<string, string> | undefined
): Record<string, string> {
  if (!rawMap || typeof rawMap !== 'object') return {};
  const validIds = new Set(ACHIEVEMENT_CATALOG.map((a) => a.id));
  const clean: Record<string, string> = {};
  Object.entries(rawMap).forEach(([k, v]) => {
    if (validIds.has(k) && typeof v === 'string') {
      clean[k] = v;
    }
  });
  return clean;
}

function readStored(): StoredAchievementsData {
  try {
    // Limpiar catálogo antiguo obsoleto si existía
    safeLocalRemove(LEGACY_STORAGE_KEY);
    const raw = safeLocalGet(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) {
      return { stats: { ...DEFAULT_STATS }, unlockedAt: {} };
    }
    const parsed = JSON.parse(raw) as Partial<StoredAchievementsData>;
    return {
      stats: {
        ...DEFAULT_STATS,
        ...(parsed.stats || {}),
        recordedMatchKeys: Array.isArray(parsed.stats?.recordedMatchKeys)
          ? parsed.stats!.recordedMatchKeys.slice(-40)
          : [],
      },
      unlockedAt: sanitizeUnlockedMap(parsed.unlockedAt),
    };
  } catch {
    return { stats: { ...DEFAULT_STATS }, unlockedAt: {} };
  }
}

function writeStored(data: StoredAchievementsData): void {
  safeLocalSet(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(data));
}

function evaluateUnlocked(data: StoredAchievementsData): AchievementDef[] {
  const newlyUnlocked: AchievementDef[] = [];
  const nowIso = new Date().toISOString();

  // Primero evaluar los 19 logros principales
  for (const def of ACHIEVEMENT_CATALOG) {
    if (def.id === 'platinum_master') continue;
    if (!data.unlockedAt[def.id] && def.getValue(data.stats, data.unlockedAt) >= def.target) {
      data.unlockedAt[def.id] = nowIso;
      newlyUnlocked.push(def);
    }
  }

  // Luego evaluar el Platino en base a los 19 restantes
  const platinum = ACHIEVEMENT_CATALOG.find((d) => d.id === 'platinum_master');
  if (
    platinum &&
    !data.unlockedAt[platinum.id] &&
    platinum.getValue(data.stats, data.unlockedAt) >= platinum.target
  ) {
    data.unlockedAt[platinum.id] = nowIso;
    newlyUnlocked.push(platinum);
  }

  return newlyUnlocked;
}

export function loadStatsAndAchievements(): {
  stats: PlayerStats;
  achievements: AchievementProgress[];
} {
  const data = readStored();
  return {
    stats: data.stats,
    achievements: ACHIEVEMENT_CATALOG.map((def) => {
      const current = def.getValue(data.stats, data.unlockedAt);
      const unlockedAt = data.unlockedAt[def.id] ?? null;
      return {
        ...def,
        current,
        unlocked: Boolean(unlockedAt) || current >= def.target,
        unlockedAt,
      };
    }),
  };
}

export function resetAchievementsForTests(): void {
  safeLocalRemove(LEGACY_STORAGE_KEY);
  safeLocalRemove(ACHIEVEMENTS_STORAGE_KEY);
}

export function recordAbilityUsed(): AchievementDef[] {
  const data = readStored();
  data.stats.abilitiesUsed += 1;
  const newlyUnlocked = evaluateUnlocked(data);
  writeStored(data);
  return newlyUnlocked;
}

export function recordMatchOutcome(input: MatchOutcomeInput): {
  stats: PlayerStats;
  newlyUnlocked: AchievementDef[];
} {
  const data = readStored();
  if (input.matchKey && data.stats.recordedMatchKeys.includes(input.matchKey)) {
    return { stats: data.stats, newlyUnlocked: [] };
  }

  data.stats.matchesPlayed += 1;
  if (input.didWin) {
    data.stats.wins += 1;
    if (!input.wasEliminated) {
      data.stats.winStreak += 1;
      data.stats.bestWinStreak = Math.max(
        data.stats.bestWinStreak,
        data.stats.winStreak
      );
    } else {
      data.stats.winStreak = 0;
    }
    if (input.myRole === 'hider') {
      data.stats.hiderWins += 1;
    } else {
      data.stats.seekerWins += 1;
    }
  } else {
    data.stats.winStreak = 0;
  }

  const meters = Math.max(0, Math.round(input.metersWalked));
  const catches = Math.max(0, input.catchesByMe);
  const infections = Math.max(0, input.infectionsByMe);
  const contracts = Math.max(0, input.contractsCompletedByMe);

  data.stats.totalMeters += meters;
  data.stats.totalCatches += catches;
  data.stats.totalInfections += infections;
  if (input.activatedBeaconByMe) {
    data.stats.beaconExtractions += 1;
  }
  data.stats.contractsCompleted += contracts;

  // Evaluar condiciones de logros tryhard de partida
  if (
    input.didWin &&
    !input.wasEliminated &&
    input.antiCampEliminate &&
    !input.hadAntiCampWarning &&
    meters >= 1200
  ) {
    data.stats.noStopWins += 1;
  }

  if (
    input.didWin &&
    input.fogEnabled &&
    (input.fogRadiusM ?? 999) <= 40 &&
    !input.radarEnabled
  ) {
    data.stats.blackoutWins += 1;
  }

  if (
    input.didWin &&
    input.myRole === 'hider' &&
    input.photoCompletedByMe &&
    input.nearestSeekerDistAtEndM !== undefined &&
    input.nearestSeekerDistAtEndM !== null &&
    input.nearestSeekerDistAtEndM < 25
  ) {
    data.stats.photoCloseWins += 1;
  }

  if (
    input.didWin &&
    input.reachedFinalZone &&
    (input.stormOutsideTotalSec ?? 0) >= 10
  ) {
    data.stats.stormEdgeWins += 1;
  }

  if (
    input.didWin &&
    input.infectionModeEnabled &&
    input.isInitialSeeker &&
    input.initialSeekersCount === 1 &&
    infections >= 3
  ) {
    data.stats.patientZeroSoloWins += 1;
  }

  if (
    input.didWin &&
    input.infectionModeEnabled &&
    input.myRole === 'hider' &&
    input.aliveHidersAtEnd === 1 &&
    (input.totalSeekersAtEnd ?? 0) >= 3
  ) {
    data.stats.lastHumanWins += 1;
  }

  if (input.hadFastDoubleInfection) {
    data.stats.fastDoubleInfections += 1;
  }

  if (
    input.activatedBeaconByMe &&
    ((input.timeRemainingAtEndSec !== undefined &&
      input.timeRemainingAtEndSec !== null &&
      input.timeRemainingAtEndSec < 20) ||
      (input.nearestSeekerDistAtEndM !== undefined &&
        input.nearestSeekerDistAtEndM !== null &&
        input.nearestSeekerDistAtEndM < 30))
  ) {
    data.stats.clutchBeacons += 1;
  }

  if (contracts >= 3) {
    data.stats.tripleContractMatches += 1;
  }

  if (
    input.didWin &&
    input.winReason === 'all_caught' &&
    input.panicEndgameEnabled &&
    input.caughtLastHiderByMe &&
    input.timeRemainingAtEndSec !== undefined &&
    input.timeRemainingAtEndSec !== null &&
    input.timeRemainingAtEndSec <= 30
  ) {
    data.stats.panicLastCatches += 1;
  }

  if (
    input.didWin &&
    input.myRole === 'hider' &&
    input.winReason === 'time_expired' &&
    (input.myAbilityUses ?? 0) === 0 &&
    !input.activatedBeaconByMe
  ) {
    data.stats.untouchableWins += 1;
  }

  if (
    input.didWin &&
    input.myRole === 'hider' &&
    input.usedDecoy &&
    input.usedCloak
  ) {
    data.stats.urbanGhostWins += 1;
  }

  if (input.hadTechHunterCatch) {
    data.stats.techHunterCatches += 1;
  }

  if (input.didWin && (input.pocketCompassRatio ?? 0) >= 0.7) {
    data.stats.pocketPureWins += 1;
  }

  if (input.trailEnabled || input.hotColdEnabled) {
    data.stats.bloodhoundCatches += catches + infections;
  }

  if (input.matchKey) {
    data.stats.recordedMatchKeys = [
      ...data.stats.recordedMatchKeys.slice(-39),
      input.matchKey,
    ];
  }

  const newlyUnlocked = evaluateUnlocked(data);
  writeStored(data);
  return { stats: data.stats, newlyUnlocked };
}
