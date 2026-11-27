import { PlayerCosmetics } from '../types/game';
import { ACHIEVEMENT_CATALOG } from './achievements';

export type CosmeticKind = 'nameEffect' | 'avatarEffect';

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  label: string;
  description: string;
  unlockAchievementId: string;
  className: string;
}

export const NAME_EFFECT_COSMETICS: CosmeticDef[] = [
  {
    id: 'name_velocidad',
    kind: 'nameEffect',
    label: 'Amarillo Eléctrico',
    description: 'Degradado eléctrico amarillo, lima y ámbar en movimiento.',
    unlockAchievementId: 'no_stop_win',
    className: 'baliza-name-velocity',
  },
  {
    id: 'name_eclipse',
    kind: 'nameEffect',
    label: 'Eclipse Índigo',
    description: 'Gradiente nocturno índigo profundo y plata lunar.',
    unlockAchievementId: 'blackout_win',
    className: 'baliza-name-eclipse',
  },
  {
    id: 'name_paparazzi',
    kind: 'nameEffect',
    label: 'Flash Dorado',
    description: 'Destello fotográfico dorado sobre tu nombre.',
    unlockAchievementId: 'photo_close_win',
    className: 'baliza-name-flash',
  },
  {
    id: 'name_paciente_cero',
    kind: 'nameEffect',
    label: 'Biohazard Ácido',
    description: 'Verde neón y lima radiactivo de brote original.',
    unlockAchievementId: 'patient_zero_solo',
    className: 'baliza-name-biohazard',
  },
  {
    id: 'name_brote',
    kind: 'nameEffect',
    label: 'Pulso Tóxico',
    description: 'Brillo mutante verde ácido y magenta.',
    unlockAchievementId: 'double_infection_fast',
    className: 'baliza-name-toxic',
  },
  {
    id: 'name_caos',
    kind: 'nameEffect',
    label: 'Neón Frenético',
    description: 'Gradiente eléctrico rojo y naranja de alta tensión.',
    unlockAchievementId: 'panic_last_catch',
    className: 'baliza-name-chaos',
  },
  {
    id: 'name_sicario',
    kind: 'nameEffect',
    label: 'Rubí Letal',
    description: 'Degradado carmesí intenso y rosa neón de caza.',
    unlockAchievementId: 'contract_triple',
    className: 'baliza-name-ruby',
  },
  {
    id: 'name_fantasma',
    kind: 'nameEffect',
    label: 'Espectro Violeta',
    description: 'Reflejo espectral violeta y celeste difuso.',
    unlockAchievementId: 'urban_ghost',
    className: 'baliza-name-ghost',
  },
  {
    id: 'name_racha',
    kind: 'nameEffect',
    label: 'Fuego Infernal',
    description: 'Llamas doradas y carmesí en movimiento.',
    unlockAchievementId: 'infernal_streak_5',
    className: 'baliza-name-inferno',
  },
  {
    id: 'name_segador',
    kind: 'nameEffect',
    label: 'Acero Carmesí',
    description: 'Tono afilado en rojo oscuro y plata metálica.',
    unlockAchievementId: 'supreme_reaper_50',
    className: 'baliza-name-reaper',
  },
  {
    id: 'name_platino',
    kind: 'nameEffect',
    label: 'Prisma Platino',
    description: 'Degradado prismático animado exclusivo del 100 % Platino.',
    unlockAchievementId: 'platinum_master',
    className: 'baliza-name-platinum',
  },
];

export const AVATAR_EFFECT_COSMETICS: CosmeticDef[] = [
  {
    id: 'avatar_tormenta',
    kind: 'avatarEffect',
    label: 'Vórtice de Tormenta',
    description: 'Aura violeta giratoria alrededor de tu icono.',
    unlockAchievementId: 'storm_edge_win',
    className: 'baliza-avatar-storm',
  },
  {
    id: 'avatar_inmune',
    kind: 'avatarEffect',
    label: 'Escudo Bio-Cian',
    description: 'Halo protector cian y esmeralda de último humano.',
    unlockAchievementId: 'last_human_win',
    className: 'baliza-avatar-immune',
  },
  {
    id: 'avatar_baliza',
    kind: 'avatarEffect',
    label: 'Señal de Baliza',
    description: 'Pulso verde de extracción alrededor del marco.',
    unlockAchievementId: 'clutch_beacon',
    className: 'baliza-avatar-beacon',
  },
  {
    id: 'avatar_sonar',
    kind: 'avatarEffect',
    label: 'Onda Sonar',
    description: 'Anillo cian escáner de alta tecnología.',
    unlockAchievementId: 'tech_hunter',
    className: 'baliza-avatar-sonar',
  },
  {
    id: 'avatar_intocable',
    kind: 'avatarEffect',
    label: 'Halo Esmeralda',
    description: 'Doble aura esmeralda pura de evasión perfecta.',
    unlockAchievementId: 'untouchable_time',
    className: 'baliza-avatar-untouchable',
  },
  {
    id: 'avatar_brujula',
    kind: 'avatarEffect',
    label: 'Órbita Brújula',
    description: 'Halo dorado de precisión direccional.',
    unlockAchievementId: 'pocket_pure_win',
    className: 'baliza-avatar-compass',
  },
  {
    id: 'avatar_sabueso',
    kind: 'avatarEffect',
    label: 'Marca Sabueso',
    description: 'Aro ardiente ámbar y cobre de rastreador.',
    unlockAchievementId: 'bloodhound_5',
    className: 'baliza-avatar-bloodhound',
  },
  {
    id: 'avatar_corona',
    kind: 'avatarEffect',
    label: 'Doble Corona',
    description: 'Halo bicromático oro y púrpura real de ambos bandos.',
    unlockAchievementId: 'dual_legend_10',
    className: 'baliza-avatar-crown',
  },
  {
    id: 'avatar_maraton',
    kind: 'avatarEffect',
    label: 'Estela Relámpago',
    description: 'Destello azul eléctrico de corredor incansable.',
    unlockAchievementId: 'ultramarathon_25k',
    className: 'baliza-avatar-lightning',
  },
  {
    id: 'avatar_platino',
    kind: 'avatarEffect',
    label: 'Corona Platino',
    description: 'Halo doble dorado y turquesa del 100 % Platino.',
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
  }
  if (
    raw?.avatarEffectId &&
    getAvatarEffectDef(raw.avatarEffectId) &&
    isCosmeticUnlocked(raw.avatarEffectId, unlockedAchievementIds, debugUnlockAll)
  ) {
    clean.avatarEffectId = raw.avatarEffectId;
  }
  return clean;
}

export function cosmeticKindLabel(kind: CosmeticKind): string {
  if (kind === 'nameEffect') return 'Color de texto';
  return 'Efecto de icono';
}
