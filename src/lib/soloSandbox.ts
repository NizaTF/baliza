import {
  CaughtRecord,
  DecoyRecord,
  ExtractionBeacon,
  InfectedRecord,
  PlayerLocationPayload,
  PlayerRecord,
  PlayerRole,
  StormZonePhase,
} from '../types/game';
import { safeSessionGet, safeSessionSet } from './safeStorage';
import { distanceMeters, VALENCIA_CENTER } from './zones';

const SECRET_UNLOCK_KEY = 'baliza_secret_sandbox_v1';
const FORCE_LOCAL_KEY = 'baliza_force_local_db_v1';

const BOT_PREFIX = 'bot_solo_';

export const BOT_TEMPLATES: ReadonlyArray<{
  name: string;
  emoji: string;
  color: string;
}> = [
  { name: 'Bot Alfa', emoji: '🤖', color: '#2563EB' },
  { name: 'Bot Zorro', emoji: '🦊', color: '#D97706' },
  { name: 'Bot Sombra', emoji: '🥷', color: '#7C3AED' },
  { name: 'Bot Eco', emoji: '🦉', color: '#0D9488' },
  { name: 'Bot Pulpo', emoji: '🐙', color: '#E11D48' },
  { name: 'Bot Rayo', emoji: '⚡', color: '#059669' },
  { name: 'Bot Mapache', emoji: '🦝', color: '#2563EB' },
  { name: 'Bot Tibu', emoji: '🦈', color: '#0D9488' },
];

type SandboxListener = (unlocked: boolean) => void;
const listeners = new Set<SandboxListener>();

export function isBotPlayerId(playerId: string): boolean {
  return playerId.startsWith(BOT_PREFIX);
}

export function isSecretSandboxUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('lab') === '1' || params.get('test') === '1') {
      safeSessionSet(SECRET_UNLOCK_KEY, '1');
      safeSessionSet(FORCE_LOCAL_KEY, '1');
      return true;
    }
  } catch {
    // Ignore URL parse error
  }
  return safeSessionGet(SECRET_UNLOCK_KEY) === '1';
}

export function setSecretSandboxUnlocked(unlocked: boolean): void {
  safeSessionSet(SECRET_UNLOCK_KEY, unlocked ? '1' : '0');
  if (unlocked) {
    safeSessionSet(FORCE_LOCAL_KEY, '1');
  } else {
    safeSessionSet(FORCE_LOCAL_KEY, '0');
  }
  listeners.forEach((fn) => fn(unlocked));
}

export function subscribeSecretSandbox(listener: SandboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isForceLocalSandboxEnabled(): boolean {
  return safeSessionGet(FORCE_LOCAL_KEY) === '1';
}

export function setForceLocalSandboxEnabled(enabled: boolean): void {
  safeSessionSet(FORCE_LOCAL_KEY, enabled ? '1' : '0');
}

export function createBotPlayers(
  count: number,
  existingPlayers: PlayerRecord[],
  roomId: string
): PlayerRecord[] {
  const existingNames = new Set(existingPlayers.map((p) => p.name));
  const now = Date.now();
  const created: PlayerRecord[] = [];
  let templateIdx = 0;

  for (let i = 0; i < count; i++) {
    while (
      templateIdx < BOT_TEMPLATES.length &&
      existingNames.has(BOT_TEMPLATES[templateIdx].name)
    ) {
      templateIdx++;
    }
    const tpl =
      templateIdx < BOT_TEMPLATES.length
        ? BOT_TEMPLATES[templateIdx]
        : {
            name: `Bot #${existingPlayers.length + i + 1}`,
            emoji: '🤖',
            color: '#64748B',
          };
    templateIdx++;
    existingNames.add(tpl.name);

    const id = `${BOT_PREFIX}${now}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    created.push({
      id,
      room_id: roomId,
      name: tpl.name,
      emoji: tpl.emoji,
      color: tpl.color,
      is_host: false,
      joined_at: new Date(now + i + 1).toISOString(),
    });
  }
  return created;
}

export interface BotMotionVector {
  lat: number;
  lng: number;
  headingRad: number;
  speedMps: number;
}

export interface BotIntelligenceContext {
  roles?: Record<string, PlayerRole>;
  caughtMap?: Record<string, CaughtRecord>;
  activeCloaks?: Record<string, string>;
  activeDecoys?: DecoyRecord[];
  humanPos?: {
    id: string;
    lat: number;
    lng: number;
    isStill?: boolean;
    cloakActive?: boolean;
  } | null;
  extractionBeacon?: ExtractionBeacon | null;
  isHuntPhase?: boolean;
  nowMs?: number;
}

function geoBearingRad(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  metersPerDegLng: number
): number {
  const dy = (toLat - fromLat) * 111320;
  const dx = (toLng - fromLng) * metersPerDegLng;
  return Math.atan2(dy, dx);
}

/**
 * Inicializa o actualiza las posiciones virtuales de los bots dentro de la zona segura.
 * En fase de caza, los bots buscadores persiguen objetivos/señuelos y los fugitivos esquivan o van hacia la Baliza.
 */
export function stepBotVectors(
  botIds: string[],
  currentVectors: Record<string, BotMotionVector>,
  anchor: { lat: number; lng: number },
  safeCenter: { lat: number; lng: number },
  safeRadiusM: number,
  dtSec: number,
  nearAnchor = false,
  intelligence?: BotIntelligenceContext
): {
  nextVectors: Record<string, BotMotionVector>;
  payloads: PlayerLocationPayload[];
} {
  const nextVectors: Record<string, BotMotionVector> = {};
  const payloads: PlayerLocationPayload[] = [];
  const now = intelligence?.nowMs ?? Date.now();
  const baseLat = anchor?.lat || safeCenter?.lat || VALENCIA_CENTER.lat;
  const baseLng = anchor?.lng || safeCenter?.lng || VALENCIA_CENTER.lng;
  const metersPerDegLat = 111320;
  const metersPerDegLng = Math.max(
    20000,
    111320 * Math.cos((baseLat * Math.PI) / 180)
  );

  const roles = intelligence?.roles || {};
  const caughtMap = intelligence?.caughtMap || {};
  const activeCloaks = intelligence?.activeCloaks || {};
  const activeDecoys = (intelligence?.activeDecoys || []).filter(
    (d) => new Date(d.expiresAt).getTime() > now
  );
  const human = intelligence?.humanPos ?? null;
  const isHunt = Boolean(intelligence?.isHuntPhase);

  // Construir lista de posiciones actuales conocidas antes de mover cada bot
  const knownPositions: Record<string, { lat: number; lng: number }> = {};
  botIds.forEach((id) => {
    if (currentVectors[id]) {
      knownPositions[id] = {
        lat: currentVectors[id].lat,
        lng: currentVectors[id].lng,
      };
    }
  });
  if (human) {
    knownPositions[human.id] = { lat: human.lat, lng: human.lng };
  }

  botIds.forEach((botId, index) => {
    const prev = currentVectors[botId];
    let lat: number;
    let lng: number;
    let headingRad: number;
    let speedMps: number;

    if (!prev || nearAnchor) {
      const angle = ((index * 137.5) % 360) * (Math.PI / 180);
      const spreadM = nearAnchor
        ? 18 + (index % 4) * 11
        : Math.min(Math.max(35, safeRadiusM * 0.45), 40 + index * 22);
      lat = baseLat + (Math.sin(angle) * spreadM) / metersPerDegLat;
      lng = baseLng + (Math.cos(angle) * spreadM) / metersPerDegLng;
      headingRad = angle + Math.PI / 2;
      speedMps = 2.6 + (index % 3) * 0.9;
    } else {
      const myRole = roles[botId] ?? 'hider';
      headingRad = prev.headingRad + (Math.random() - 0.5) * 0.7;
      speedMps = prev.speedMps;

      if (isHunt && myRole === 'seeker') {
        // Buscador bot: perseguir al fugitivo no oculto más cercano o a un señuelo activo
        let bestTarget: { lat: number; lng: number; dist: number } | null = null;
        const considerTarget = (latVal: number, lngVal: number) => {
          const d = distanceMeters(prev.lat, prev.lng, latVal, lngVal);
          if (!bestTarget || d < bestTarget.dist) {
            bestTarget = { lat: latVal, lng: lngVal, dist: d };
          }
        };

        Object.entries(knownPositions).forEach(([pid, pos]) => {
          if (pid === botId) return;
          if ((roles[pid] ?? 'hider') !== 'hider' || caughtMap[pid]) return;
          const cloakUntil = activeCloaks[pid]
            ? new Date(activeCloaks[pid]).getTime()
            : 0;
          if (cloakUntil > now) return;
          if (human && pid === human.id && (human.isStill || human.cloakActive)) {
            return;
          }
          considerTarget(pos.lat, pos.lng);
        });

        activeDecoys.forEach((decoy) => {
          considerTarget(decoy.lat, decoy.lng);
        });

        const chosenTarget = bestTarget as {
          lat: number;
          lng: number;
          dist: number;
        } | null;
        if (chosenTarget) {
          const targetAngle = geoBearingRad(
            prev.lat,
            prev.lng,
            chosenTarget.lat,
            chosenTarget.lng,
            metersPerDegLng
          );
          headingRad = targetAngle + (Math.random() - 0.5) * 0.28;
          speedMps = 3.5 + (index % 3) * 0.45;
        }
      } else if (isHunt && myRole === 'hider') {
        // Fugitivo bot: huir si hay un buscador cerca, o avanzar hacia la Baliza si está disponible
        let nearestSeeker: { lat: number; lng: number; dist: number } | null = null;
        Object.entries(knownPositions).forEach(([pid, pos]) => {
          if (pid === botId || (roles[pid] ?? 'hider') !== 'seeker') return;
          const d = distanceMeters(prev.lat, prev.lng, pos.lat, pos.lng);
          if (!nearestSeeker || d < nearestSeeker.dist) {
            nearestSeeker = { lat: pos.lat, lng: pos.lng, dist: d };
          }
        });

        const threat = nearestSeeker as {
          lat: number;
          lng: number;
          dist: number;
        } | null;
        if (threat && threat.dist < 95) {
          const awayAngle =
            geoBearingRad(
              prev.lat,
              prev.lng,
              threat.lat,
              threat.lng,
              metersPerDegLng
            ) + Math.PI;
          headingRad = awayAngle + (Math.random() - 0.5) * 0.45;
          speedMps = 3.4 + (index % 2) * 0.4;
        } else if (intelligence?.extractionBeacon && index % 2 === 0) {
          const b = intelligence.extractionBeacon;
          const distBeacon = distanceMeters(prev.lat, prev.lng, b.lat, b.lng);
          if (distBeacon > b.radiusM * 0.8) {
            headingRad =
              geoBearingRad(prev.lat, prev.lng, b.lat, b.lng, metersPerDegLng) +
              (Math.random() - 0.5) * 0.55;
            speedMps = 2.9;
          }
        }
      }

      const stepM = speedMps * Math.max(0.2, Math.min(2.5, dtSec));
      lat = prev.lat + (Math.sin(headingRad) * stepM) / metersPerDegLat;
      lng = prev.lng + (Math.cos(headingRad) * stepM) / metersPerDegLng;

      const distFromSafe = distanceMeters(lat, lng, safeCenter.lat, safeCenter.lng);
      const maxAllow = Math.max(25, safeRadiusM * 0.86);
      if (distFromSafe > maxAllow) {
        headingRad = geoBearingRad(
          lat,
          lng,
          safeCenter.lat,
          safeCenter.lng,
          metersPerDegLng
        );
        lat = prev.lat + (Math.sin(headingRad) * stepM) / metersPerDegLat;
        lng = prev.lng + (Math.cos(headingRad) * stepM) / metersPerDegLng;
      }
    }

    nextVectors[botId] = { lat, lng, headingRad, speedMps };
    const distZone = distanceMeters(lat, lng, safeCenter.lat, safeCenter.lng);
    payloads.push({
      playerId: botId,
      lat,
      lng,
      accuracy: 4,
      inStorm: distZone > safeRadiusM,
      stormExposed: false,
      updatedAt: now,
      locationStatus: 'active',
      locationDisabled: false,
    });
  });

  return { nextVectors, payloads };
}

export function findBotAutoCapture(params: {
  players: PlayerRecord[];
  roles: Record<string, PlayerRole>;
  caughtMap: Record<string, CaughtRecord>;
  locations: Record<string, { lat: number; lng: number }>;
  humanPlayer?: { id: string; lat: number; lng: number } | null;
  captureRadiusM?: number;
}): { seekerBotId: string; targetId: string } | null {
  const {
    players,
    roles,
    caughtMap,
    locations,
    humanPlayer,
    captureRadiusM = 16,
  } = params;

  const seekers = players.filter(
    (p) =>
      isBotPlayerId(p.id) &&
      (roles[p.id] ?? 'hider') === 'seeker' &&
      !caughtMap[p.id]
  );
  const hiders = players.filter(
    (p) => (roles[p.id] ?? 'hider') === 'hider' && !caughtMap[p.id]
  );

  for (const seeker of seekers) {
    const seekerLoc = locations[seeker.id];
    if (!seekerLoc) continue;
    for (const hider of hiders) {
      const hiderLoc =
        humanPlayer && hider.id === humanPlayer.id
          ? { lat: humanPlayer.lat, lng: humanPlayer.lng }
          : locations[hider.id];
      if (!hiderLoc) continue;
      if (
        distanceMeters(
          seekerLoc.lat,
          seekerLoc.lng,
          hiderLoc.lat,
          hiderLoc.lng
        ) <= captureRadiusM
      ) {
        return { seekerBotId: seeker.id, targetId: hider.id };
      }
    }
  }
  return null;
}

export function pickBotAbilityAction(params: {
  players: PlayerRecord[];
  roles: Record<string, PlayerRole>;
  caughtMap: Record<string, CaughtRecord>;
  abilityUses: Record<string, number>;
  abilitiesMax: number;
  preferredBotId?: string;
}): {
  botId: string;
  botName: string;
  role: PlayerRole;
  kind: 'decoy' | 'cloak' | 'sonar' | 'scan';
} | null {
  const {
    players,
    roles,
    caughtMap,
    abilityUses,
    abilitiesMax,
    preferredBotId,
  } = params;

  const eligible = players.filter((p) => {
    if (!isBotPlayerId(p.id) || caughtMap[p.id]) return false;
    return (abilityUses[p.id] ?? 0) < abilitiesMax;
  });
  if (eligible.length === 0) return null;

  const chosen =
    (preferredBotId && eligible.find((p) => p.id === preferredBotId)) ||
    eligible[Math.floor(Math.random() * eligible.length)];
  const role: PlayerRole = roles[chosen.id] === 'seeker' ? 'seeker' : 'hider';
  const kind: 'decoy' | 'cloak' | 'sonar' | 'scan' =
    role === 'seeker'
      ? Math.random() < 0.65
        ? 'sonar'
        : 'scan'
      : Math.random() < 0.55
      ? 'decoy'
      : 'cloak';

  return {
    botId: chosen.id,
    botName: chosen.name,
    role,
    kind,
  };
}

const BOT_CHAT_HIDER_LINES = [
  'Me muevo pegado al borde de la zona segura.',
  '¡Cuidado! Creo que un buscador viene hacia aquí.',
  'Voy acercándome a la zona de la Baliza.',
  'Si alguien tiene Señuelo, guardadlo para el cierre.',
  'Todo tranquilo por mi sector de momento.',
];

const BOT_CHAT_SEEKER_LINES = [
  'Rastreando el perímetro central ahora mismo.',
  '¡Ojo con la Baliza verde, que nadie la active!',
  'Creo haber visto un movimiento hace unos segundos.',
  'Voy directo a por mi objetivo asignado.',
  '¿Alguien ha tirado un señuelo? ¡Sospechoso!',
];

const BOT_CHAT_INFECTED_LINES = [
  '🧟 ¡Ya estoy infectado! Ahora salgo a por los que quedáis.',
  'No vais a poder esconderos mucho más, infectados al ataque.',
  '¡Uno menos! Vamos cerrando el círculo entre todos.',
];

export function pickBotChatMessage(params: {
  players: PlayerRecord[];
  roles: Record<string, PlayerRole>;
  caughtMap: Record<string, CaughtRecord>;
  infectedMap?: Record<string, InfectedRecord>;
  eventHint?: 'catch' | 'ability' | 'beacon' | 'chatter';
  actorBotId?: string;
  forceAllChannel?: boolean;
}): {
  bot: PlayerRecord;
  role: PlayerRole;
  channel: 'all' | 'team';
  text: string;
} | null {
  const {
    players,
    roles,
    caughtMap,
    infectedMap = {},
    eventHint = 'chatter',
    actorBotId,
    forceAllChannel = false,
  } = params;

  const activeBots = players.filter(
    (p) => isBotPlayerId(p.id) && !caughtMap[p.id]
  );
  if (activeBots.length === 0) return null;

  const bot =
    (actorBotId && activeBots.find((p) => p.id === actorBotId)) ||
    activeBots[Math.floor(Math.random() * activeBots.length)];
  const role: PlayerRole = roles[bot.id] === 'seeker' ? 'seeker' : 'hider';
  const isInfected = Boolean(infectedMap[bot.id]);

  let text: string;
  if (eventHint === 'catch') {
    text = isInfected
      ? '🧟 ¡Capturado e infectado! Seguimos a por el siguiente.'
      : '🎯 ¡Objetivo cazado! Siguiente blanco fijado.';
  } else if (eventHint === 'ability') {
    text =
      role === 'seeker'
        ? '📡 Habilidad de rastreo lanzada, atentos al radar.'
        : '🎭 Habilidad táctica activada, a despistar un rato.';
  } else if (eventHint === 'beacon') {
    text =
      role === 'hider'
        ? '🚩 ¡La Baliza ya está activa, voy hacia allí!'
        : '🚩 ¡La Baliza está desbloqueada, hay que cubrirla!';
  } else if (isInfected) {
    text =
      BOT_CHAT_INFECTED_LINES[
        Math.floor(Math.random() * BOT_CHAT_INFECTED_LINES.length)
      ];
  } else if (role === 'seeker') {
    text =
      BOT_CHAT_SEEKER_LINES[
        Math.floor(Math.random() * BOT_CHAT_SEEKER_LINES.length)
      ];
  } else {
    text =
      BOT_CHAT_HIDER_LINES[
        Math.floor(Math.random() * BOT_CHAT_HIDER_LINES.length)
      ];
  }

  const channel: 'all' | 'team' =
    forceAllChannel || eventHint === 'catch'
      ? 'all'
      : Math.random() < 0.72
      ? 'all'
      : 'team';

  return { bot, role, channel, text };
}

export function getSafeZoneAnchor(zones: StormZonePhase[]): {
  lat: number;
  lng: number;
  radius: number;
} {
  const first = zones[0];
  if (!first) {
    return { lat: VALENCIA_CENTER.lat, lng: VALENCIA_CENTER.lng, radius: 500 };
  }
  return { lat: first.lat, lng: first.lng, radius: first.radius };
}
