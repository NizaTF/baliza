import {
  PlatinumAvatarCustomization,
  PlatinumAvatarPattern,
  PlatinumNameAnimation,
  PlatinumNameCustomization,
  PlatinumNameFillMode,
  PlatinumRingStyle,
  PlatinumSpeed,
  PlayerCosmetics,
} from '../types/game';
import { ACHIEVEMENT_CATALOG } from './achievements';
import { sanitizeHexColor } from './storage';

export type CosmeticKind = 'nameEffect' | 'avatarEffect';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  label: string;
  description: string;
  unlockAchievementId: string;
  className: string;
}

export const DEFAULT_PLATINUM_NAME: PlatinumNameCustomization = {
  fillMode: 'prism',
  colors: ['#F59E0B', '#06B6D4', '#EC4899'],
  angleDeg: 115,
  animation: 'shimmer',
  speed: 'normal',
  glowEnabled: true,
  glowColor: '#06B6D4',
  glowIntensity: 55,
  italic: false,
  uppercase: false,
  letterSpacing: 'normal',
  weight: 'black',
};

export const DEFAULT_PLATINUM_AVATAR: PlatinumAvatarCustomization = {
  pattern: 'dual_spin',
  primaryColor: '#F59E0B',
  secondaryColor: '#06B6D4',
  glowColor: '#F59E0B',
  glowIntensity: 65,
  ringWidth: 3,
  ringStyle: 'dashed',
  speed: 'normal',
  reverse: false,
  badge: '👑',
};

export const NAME_EFFECT_COSMETICS: CosmeticDef[] = [
  {
    id: 'name_velocidad',
    kind: 'nameEffect',
    label: 'Voltaje Cinético',
    description: 'Inclinación de sprint con destello relámpago diagonal.',
    unlockAchievementId: 'no_stop_win',
    className: 'baliza-name-velocity',
  },
  {
    id: 'name_eclipse',
    kind: 'nameEffect',
    label: 'Eclipse Lunar',
    description: 'Índigo nocturno con corona plateada que respira alrededor.',
    unlockAchievementId: 'blackout_win',
    className: 'baliza-name-eclipse',
  },
  {
    id: 'name_paparazzi',
    kind: 'nameEffect',
    label: 'Flash Paparazzi',
    description: 'Oro metálico atravesado por disparos periódicos de flash.',
    unlockAchievementId: 'photo_close_win',
    className: 'baliza-name-flash',
  },
  {
    id: 'name_paciente_cero',
    kind: 'nameEffect',
    label: 'Brote Radiactivo',
    description: 'Fosforescencia verde ácida con aura biohazard pulsante.',
    unlockAchievementId: 'patient_zero_solo',
    className: 'baliza-name-biohazard',
  },
  {
    id: 'name_brote',
    kind: 'nameEffect',
    label: 'Mutación Dual',
    description: 'Corte diagonal bicolor entre lima tóxica y magenta vivo.',
    unlockAchievementId: 'double_infection_fast',
    className: 'baliza-name-toxic',
  },
  {
    id: 'name_caos',
    kind: 'nameEffect',
    label: 'Glitch de Tensión',
    description: 'Desfase cromático RGB y micro-interferencia de pánico.',
    unlockAchievementId: 'panic_last_catch',
    className: 'baliza-name-chaos',
  },
  {
    id: 'name_sicario',
    kind: 'nameEffect',
    label: 'Filo Carmesí',
    description: 'Brillo oblicuo de acero y rubí con trazo espaciado.',
    unlockAchievementId: 'contract_triple',
    className: 'baliza-name-ruby',
  },
  {
    id: 'name_fantasma',
    kind: 'nameEffect',
    label: 'Espejismo Espectral',
    description: 'Desvanecimiento etéreo con estela celeste y violeta.',
    unlockAchievementId: 'urban_ghost',
    className: 'baliza-name-ghost',
  },
  {
    id: 'name_racha',
    kind: 'nameEffect',
    label: 'Brasa Viva',
    description: 'Llama ascendente de ámbar a carmesí con parpadeo térmico.',
    unlockAchievementId: 'infernal_streak_5',
    className: 'baliza-name-inferno',
  },
  {
    id: 'name_segador',
    kind: 'nameEffect',
    label: 'Acero Templado',
    description: 'Cromo oscuro cepillado con destello frío de hoja afilada.',
    unlockAchievementId: 'supreme_reaper_50',
    className: 'baliza-name-reaper',
  },
  {
    id: 'name_platino',
    kind: 'nameEffect',
    label: 'Estudio Platino (100 %)',
    description: 'Colores, degradado, animación, brillo y letra 100 % personalizables.',
    unlockAchievementId: 'platinum_master',
    className: 'baliza-name-platinum',
  },
];

export const AVATAR_EFFECT_COSMETICS: CosmeticDef[] = [
  {
    id: 'avatar_tormenta',
    kind: 'avatarEffect',
    label: 'Vórtice de Tormenta',
    description: 'Espiral cónica violeta girando alrededor de tu icono.',
    unlockAchievementId: 'storm_edge_win',
    className: 'baliza-avatar-storm',
  },
  {
    id: 'avatar_inmune',
    kind: 'avatarEffect',
    label: 'Escudo Bio-Cian',
    description: 'Barrera segmentada giratoria con núcleo protector cian.',
    unlockAchievementId: 'last_human_win',
    className: 'baliza-avatar-immune',
  },
  {
    id: 'avatar_baliza',
    kind: 'avatarEffect',
    label: 'Señal de Baliza',
    description: 'Onda expansiva verde emitida continuamente hacia fuera.',
    unlockAchievementId: 'clutch_beacon',
    className: 'baliza-avatar-beacon',
  },
  {
    id: 'avatar_sonar',
    kind: 'avatarEffect',
    label: 'Barrido Sonar',
    description: 'Haz de radar cian rotando 360° sobre tu avatar.',
    unlockAchievementId: 'tech_hunter',
    className: 'baliza-avatar-sonar',
  },
  {
    id: 'avatar_intocable',
    kind: 'avatarEffect',
    label: 'Aura Cristalina',
    description: 'Doble halo esmeralda flotante de evasión perfecta.',
    unlockAchievementId: 'untouchable_time',
    className: 'baliza-avatar-untouchable',
  },
  {
    id: 'avatar_brujula',
    kind: 'avatarEffect',
    label: 'Órbita Brújula',
    description: 'Marcas cardinales y satélite dorado en órbita continua.',
    unlockAchievementId: 'pocket_pure_win',
    className: 'baliza-avatar-compass',
  },
  {
    id: 'avatar_sabueso',
    kind: 'avatarEffect',
    label: 'Mira Sabueso',
    description: 'Retícula táctica giratoria en cobre y ámbar ardiente.',
    unlockAchievementId: 'bloodhound_5',
    className: 'baliza-avatar-bloodhound',
  },
  {
    id: 'avatar_corona',
    kind: 'avatarEffect',
    label: 'Doble Corona',
    description: 'Dos aros contrarrotatorios en oro real y amatista.',
    unlockAchievementId: 'dual_legend_10',
    className: 'baliza-avatar-crown',
  },
  {
    id: 'avatar_maraton',
    kind: 'avatarEffect',
    label: 'Arco Relámpago',
    description: 'Doble arco eléctrico azul girando a alta velocidad.',
    unlockAchievementId: 'ultramarathon_25k',
    className: 'baliza-avatar-lightning',
  },
  {
    id: 'avatar_platino',
    kind: 'avatarEffect',
    label: 'Aura Platino (100 %)',
    description: 'Patrón, colores, borde, velocidad e insignia 100 % personalizables.',
    unlockAchievementId: 'platinum_master',
    className: 'baliza-avatar-platinum',
  },
];

export const ALL_COSMETICS: CosmeticDef[] = [
  ...NAME_EFFECT_COSMETICS,
  ...AVATAR_EFFECT_COSMETICS,
];

const COSMETIC_BY_ID = new Map<string, CosmeticDef>(
  ALL_COSMETICS.map((c) => [c.id, c])
);

const VALID_FILL_MODES: readonly PlatinumNameFillMode[] = [
  'solid',
  'gradient2',
  'gradient3',
  'prism',
];

const VALID_NAME_ANIMS: readonly PlatinumNameAnimation[] = [
  'none',
  'shimmer',
  'pulse',
  'glitch',
  'wave',
  'neon',
];

const VALID_AVATAR_PATTERNS: readonly PlatinumAvatarPattern[] = [
  'halo',
  'vortex',
  'radar',
  'orbit',
  'pulse_wave',
  'reticle',
  'dual_spin',
];

const VALID_RING_STYLES: readonly PlatinumRingStyle[] = [
  'solid',
  'dashed',
  'dotted',
  'double',
];

const VALID_SPEEDS: readonly PlatinumSpeed[] = ['slow', 'normal', 'fast'];

export function sanitizePlatinumNameCustomization(
  raw?: Partial<PlatinumNameCustomization> | null
): PlatinumNameCustomization {
  const base = DEFAULT_PLATINUM_NAME;
  if (!raw || typeof raw !== 'object') {
    return { ...base, colors: [...base.colors] as [string, string, string] };
  }
  const rawColors = Array.isArray(raw.colors) ? raw.colors : base.colors;
  const c0 = sanitizeHexColor(String(rawColors[0] ?? base.colors[0]), base.colors[0]);
  const c1 = sanitizeHexColor(String(rawColors[1] ?? base.colors[1]), base.colors[1]);
  const c2 = sanitizeHexColor(String(rawColors[2] ?? base.colors[2]), base.colors[2]);

  const angleRaw =
    typeof raw.angleDeg === 'number' && !Number.isNaN(raw.angleDeg)
      ? Math.round(raw.angleDeg)
      : base.angleDeg;
  const angleDeg = ((angleRaw % 360) + 360) % 360;

  const glowIntensityRaw =
    typeof raw.glowIntensity === 'number' && !Number.isNaN(raw.glowIntensity)
      ? Math.round(raw.glowIntensity)
      : base.glowIntensity;

  return {
    fillMode: VALID_FILL_MODES.includes(raw.fillMode as PlatinumNameFillMode)
      ? (raw.fillMode as PlatinumNameFillMode)
      : base.fillMode,
    colors: [c0, c1, c2],
    angleDeg,
    animation: VALID_NAME_ANIMS.includes(raw.animation as PlatinumNameAnimation)
      ? (raw.animation as PlatinumNameAnimation)
      : base.animation,
    speed: VALID_SPEEDS.includes(raw.speed as PlatinumSpeed)
      ? (raw.speed as PlatinumSpeed)
      : base.speed,
    glowEnabled:
      typeof raw.glowEnabled === 'boolean' ? raw.glowEnabled : base.glowEnabled,
    glowColor: sanitizeHexColor(String(raw.glowColor ?? c1), base.glowColor),
    glowIntensity: Math.max(0, Math.min(100, glowIntensityRaw)),
    italic: typeof raw.italic === 'boolean' ? raw.italic : base.italic,
    uppercase: typeof raw.uppercase === 'boolean' ? raw.uppercase : base.uppercase,
    letterSpacing: raw.letterSpacing === 'wide' ? 'wide' : 'normal',
    weight:
      raw.weight === 'semibold' || raw.weight === 'bold' || raw.weight === 'black'
        ? raw.weight
        : base.weight,
  };
}

export function sanitizePlatinumAvatarCustomization(
  raw?: Partial<PlatinumAvatarCustomization> | null
): PlatinumAvatarCustomization {
  const base = DEFAULT_PLATINUM_AVATAR;
  if (!raw || typeof raw !== 'object') {
    return { ...base };
  }
  const glowIntensityRaw =
    typeof raw.glowIntensity === 'number' && !Number.isNaN(raw.glowIntensity)
      ? Math.round(raw.glowIntensity)
      : base.glowIntensity;
  const ringWidth: 2 | 3 | 4 =
    raw.ringWidth === 2 || raw.ringWidth === 3 || raw.ringWidth === 4
      ? raw.ringWidth
      : base.ringWidth;

  let badge = '';
  if (typeof raw.badge === 'string') {
    const trimmed = raw.badge.trim();
    if (trimmed) {
      if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const seg = new Intl.Segmenter('es', { granularity: 'grapheme' });
        const first = Array.from(seg.segment(trimmed))[0]?.segment ?? '';
        badge = first.slice(0, 8);
      } else {
        badge = Array.from(trimmed)[0] ?? '';
      }
    }
  } else {
    badge = base.badge;
  }

  return {
    pattern: VALID_AVATAR_PATTERNS.includes(raw.pattern as PlatinumAvatarPattern)
      ? (raw.pattern as PlatinumAvatarPattern)
      : base.pattern,
    primaryColor: sanitizeHexColor(
      String(raw.primaryColor ?? base.primaryColor),
      base.primaryColor
    ),
    secondaryColor: sanitizeHexColor(
      String(raw.secondaryColor ?? base.secondaryColor),
      base.secondaryColor
    ),
    glowColor: sanitizeHexColor(
      String(raw.glowColor ?? base.glowColor),
      base.glowColor
    ),
    glowIntensity: Math.max(0, Math.min(100, glowIntensityRaw)),
    ringWidth,
    ringStyle: VALID_RING_STYLES.includes(raw.ringStyle as PlatinumRingStyle)
      ? (raw.ringStyle as PlatinumRingStyle)
      : base.ringStyle,
    speed: VALID_SPEEDS.includes(raw.speed as PlatinumSpeed)
      ? (raw.speed as PlatinumSpeed)
      : base.speed,
    reverse: typeof raw.reverse === 'boolean' ? raw.reverse : base.reverse,
    badge,
  };
}

const CREATIVE_HEX_SWATCHES = [
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#A855F7',
  '#6366F1',
  '#06B6D4',
  '#10B981',
  '#84CC16',
  '#38BDF8',
  '#FB7185',
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomizePlatinumNameCustomization(): PlatinumNameCustomization {
  const c1 = pickRandom(CREATIVE_HEX_SWATCHES);
  const c2 = pickRandom(CREATIVE_HEX_SWATCHES.filter((c) => c !== c1));
  const c3 = pickRandom(CREATIVE_HEX_SWATCHES.filter((c) => c !== c1 && c !== c2));
  return {
    fillMode: pickRandom(VALID_FILL_MODES),
    colors: [c1, c2, c3],
    angleDeg: Math.floor(Math.random() * 12) * 30,
    animation: pickRandom(['shimmer', 'pulse', 'glitch', 'wave', 'neon'] as const),
    speed: pickRandom(VALID_SPEEDS),
    glowEnabled: Math.random() > 0.15,
    glowColor: c2,
    glowIntensity: 35 + Math.floor(Math.random() * 55),
    italic: Math.random() > 0.65,
    uppercase: Math.random() > 0.75,
    letterSpacing: Math.random() > 0.6 ? 'wide' : 'normal',
    weight: pickRandom(['bold', 'black'] as const),
  };
}

export function randomizePlatinumAvatarCustomization(): PlatinumAvatarCustomization {
  const primary = pickRandom(CREATIVE_HEX_SWATCHES);
  const secondary = pickRandom(CREATIVE_HEX_SWATCHES.filter((c) => c !== primary));
  const badges = ['', '👑', '💎', '⚡', '🔥', '⭐', '✨'];
  return {
    pattern: pickRandom(VALID_AVATAR_PATTERNS),
    primaryColor: primary,
    secondaryColor: secondary,
    glowColor: primary,
    glowIntensity: 40 + Math.floor(Math.random() * 55),
    ringWidth: pickRandom([2, 3, 4] as const),
    ringStyle: pickRandom(VALID_RING_STYLES),
    speed: pickRandom(VALID_SPEEDS),
    reverse: Math.random() > 0.5,
    badge: pickRandom(badges),
  };
}

export function getCosmeticById(id?: string): CosmeticDef | null {
  if (!id || id === 'none') return null;
  return COSMETIC_BY_ID.get(id) ?? null;
}

export function getNameEffectDef(id?: string): CosmeticDef | null {
  const item = getCosmeticById(id);
  return item?.kind === 'nameEffect' ? item : null;
}

export function getAvatarEffectDef(id?: string): CosmeticDef | null {
  const item = getCosmeticById(id);
  return item?.kind === 'avatarEffect' ? item : null;
}

export function getCosmeticsForAchievement(achievementId: string): CosmeticDef[] {
  return ALL_COSMETICS.filter((c) => c.unlockAchievementId === achievementId);
}

export function getAchievementTitleById(achievementId: string): string {
  return (
    ACHIEVEMENT_CATALOG.find((a) => a.id === achievementId)?.title ??
    'Logro secreto'
  );
}

export function isCosmeticUnlocked(
  cosmeticId: string,
  unlockedAchievementIds: Set<string>,
  debugUnlockAll = false
): boolean {
  const def = getCosmeticById(cosmeticId);
  if (!def) return false;
  if (debugUnlockAll) return true;
  return unlockedAchievementIds.has(def.unlockAchievementId);
}

export function sanitizeEquippedCosmetics(
  raw: Partial<PlayerCosmetics> | undefined,
  unlockedAchievementIds: Set<string>,
  debugUnlockAll = false
): PlayerCosmetics {
  const clean: PlayerCosmetics = {};
  if (
    raw?.nameEffectId &&
    getNameEffectDef(raw.nameEffectId) &&
    isCosmeticUnlocked(raw.nameEffectId, unlockedAchievementIds, debugUnlockAll)
  ) {
    clean.nameEffectId = raw.nameEffectId;
    if (raw.nameEffectId === 'name_platino') {
      clean.platinumName = sanitizePlatinumNameCustomization(raw.platinumName);
    }
  }
  if (
    raw?.avatarEffectId &&
    getAvatarEffectDef(raw.avatarEffectId) &&
    isCosmeticUnlocked(raw.avatarEffectId, unlockedAchievementIds, debugUnlockAll)
  ) {
    clean.avatarEffectId = raw.avatarEffectId;
    if (raw.avatarEffectId === 'avatar_platino') {
      clean.platinumAvatar = sanitizePlatinumAvatarCustomization(raw.platinumAvatar);
    }
  }
  return clean;
}

export function cosmeticKindLabel(kind: CosmeticKind): string {
  if (kind === 'nameEffect') return 'Color de texto';
  return 'Efecto de icono';
}

export function createRandomBotCosmetics(): PlayerCosmetics {
  const pickedName =
    NAME_EFFECT_COSMETICS[
      Math.floor(Math.random() * NAME_EFFECT_COSMETICS.length)
    ];
  const pickedAvatar =
    AVATAR_EFFECT_COSMETICS[
      Math.floor(Math.random() * AVATAR_EFFECT_COSMETICS.length)
    ];

  return {
    nameEffectId: pickedName.id,
    avatarEffectId: pickedAvatar.id,
    ...(pickedName.id === 'name_platino'
      ? { platinumName: randomizePlatinumNameCustomization() }
      : {}),
    ...(pickedAvatar.id === 'avatar_platino'
      ? { platinumAvatar: randomizePlatinumAvatarCustomization() }
      : {}),
  };
}
