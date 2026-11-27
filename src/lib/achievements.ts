import { safeLocalGet, safeLocalSet } from './safeStorage';

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
  recordedMatchKeys: string[];
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  getValue: (stats: PlayerStats) => number;
}

export interface AchievementProgress extends AchievementDef {
  current: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

interface StoredAchievementsData {
  stats: PlayerStats;
  unlockedAt: Record<string, string>;
}

const ACHIEVEMENTS_STORAGE_KEY = 'baliza_achievements_v1';

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
  recordedMatchKeys: [],
};

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  {
    id: 'first_match',
    title: 'Primera Baliza',
    description: 'Completa tu primera partida en Baliza.',
    icon: '🚩',
    target: 1,
    getValue: (s) => s.matchesPlayed,
  },
  {
    id: 'survivor',
    title: 'Superviviente',
    description: 'Gana una partida jugando como fugitivo.',
    icon: '🛡️',
    target: 1,
    getValue: (s) => s.hiderWins,
  },
  {
    id: 'hunter_3',
    title: 'Cazador Implacable',
    description: 'Acumula 3 capturas siendo buscador.',
    icon: '👁️',
    target: 3,
    getValue: (s) => s.totalCatches,
  },
  {
    id: 'patient_zero',
    title: 'Paciente Cero',
    description: 'Infecta a un fugitivo en el Modo Infección.',
    icon: '🧟',
    target: 1,
    getValue: (s) => s.totalInfections,
  },
  {
    id: 'clean_extract',
    title: 'Extracción Limpia',
    description: 'Activa la Baliza de Extracción verde.',
    icon: '📡',
    target: 1,
    getValue: (s) => s.beaconExtractions,
  },
  {
    id: 'bounty_hunter',
    title: 'Cazarrecompensas',
    description: 'Caza a tu objetivo asignado en Caza por Objetivos.',
    icon: '🎯',
    target: 1,
    getValue: (s) => s.contractsCompleted,
  },
  {
    id: 'trickster',
    title: 'Maestro del Engaño',
    description: 'Usa 3 habilidades o señuelos en partida.',
    icon: '🎭',
    target: 3,
    getValue: (s) => s.abilitiesUsed,
  },
  {
    id: 'marathon_1km',
    title: 'Corredor Urbano',
    description: 'Recorre 1.000 metros acumulados en partidas.',
    icon: '👟',
    target: 1000,
    getValue: (s) => Math.round(s.totalMeters),
  },
  {
    id: 'streak_3',
    title: 'Imparable x3',
    description: 'Consigue una racha de 3 victorias seguidas.',
    icon: '🔥',
    target: 3,
    getValue: (s) => s.bestWinStreak,
  },
  {
    id: 'veteran_10',
    title: 'Veterano de Baliza',
    description: 'Juega un total de 10 partidas.',
    icon: '🏆',
    target: 10,
    getValue: (s) => s.matchesPlayed,
  },
];

function readStored(): StoredAchievementsData {
  try {
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
      unlockedAt:
        parsed.unlockedAt && typeof parsed.unlockedAt === 'object'
          ? parsed.unlockedAt
          : {},
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
  ACHIEVEMENT_CATALOG.forEach((def) => {
    if (!data.unlockedAt[def.id] && def.getValue(data.stats) >= def.target) {
      data.unlockedAt[def.id] = nowIso;
      newlyUnlocked.push(def);
    }
  });
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
      const current = def.getValue(data.stats);
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

export function recordAbilityUsed(): AchievementDef[] {
  const data = readStored();
  data.stats.abilitiesUsed += 1;
  const newlyUnlocked = evaluateUnlocked(data);
  writeStored(data);
  return newlyUnlocked;
}

export function recordMatchOutcome(input: {
  matchKey: string;
  didWin: boolean;
  myRole: 'seeker' | 'hider';
  metersWalked: number;
  catchesByMe: number;
  infectionsByMe: number;
  activatedBeaconByMe: boolean;
  contractsCompletedByMe: number;
}): {
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
    data.stats.winStreak += 1;
    data.stats.bestWinStreak = Math.max(
      data.stats.bestWinStreak,
      data.stats.winStreak
    );
    if (input.myRole === 'hider') {
      data.stats.hiderWins += 1;
    } else {
      data.stats.seekerWins += 1;
    }
  } else {
    data.stats.winStreak = 0;
  }

  data.stats.totalMeters += Math.max(0, Math.round(input.metersWalked));
  data.stats.totalCatches += Math.max(0, input.catchesByMe);
  data.stats.totalInfections += Math.max(0, input.infectionsByMe);
  if (input.activatedBeaconByMe) {
    data.stats.beaconExtractions += 1;
  }
  data.stats.contractsCompleted += Math.max(0, input.contractsCompletedByMe);
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
