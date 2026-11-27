import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  Crown,
  Eye,
  Flag,
  FlaskConical,
  Gamepad2,
  History,
  LocateFixed,
  LogOut,
  Map as MapIcon,
  MapPinOff,
  MessageSquare,
  Minus,
  Navigation,
  Plus,
  Radio,
  RotateCcw,
  Settings,
  Shield,
  SlidersHorizontal,
  Target,
  Trophy,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  PhotoProofPayload,
  subscribeToMatchLocations,
  subscribeToPhotoProofs,
} from '../lib/roomService';
import {
  getNotificationPermissionStatus,
  isBackgroundKeepAliveActive,
  requestBackgroundNotificationPermission,
  sendBackgroundNotification,
  startBackgroundKeepAlive,
} from '../lib/backgroundRunner';
import {
  distanceMeters,
  evaluateStormAtElapsed,
  formatDurationSec,
  formatRadius,
  getClosestSafePoint,
  getStormMaskRings,
  VALENCIA_CENTER,
} from '../lib/zones';
import {
  playBeaconUnlockAlert,
  playEndgameCountdownTick,
  playGlobalEliminationAlert,
  playGlobalInfectionAlert,
  playHuntStartSting,
  playInfectionAlert,
  playLocationTamperAlarm,
  playMatchStartSignal,
  playMatchStartSuspenseTheme,
  playPhotoChallengeAlert,
  playRadarSweepPing,
  playSeekerCountdownBeep,
  unlockRetroAudio,
} from '../lib/retroAudio';
import {
  LocationGuardStatus,
  MatchPathPoint,
  MatchState,
  MatchWinReason,
  MatchWinner,
  PlayerLocationPayload,
  PlayerRecapRoute,
  PlayerRecord,
  PlayerRole,
  RoomRecord,
  RoomRules,
} from '../types/game';
import {
  APP_AUTHOR,
  APP_VERSION,
  getEquippedCosmetics,
  getMapTileSpec,
  loadPreferences,
  subscribePreferences,
  triggerHaptic,
} from '../lib/preferences';
import { recordAbilityUsed } from '../lib/achievements';
import {
  computeBearingDeg,
  getCardinalLabel,
  getPocketPulseSpec,
  normalizeRelativeAngleDeg,
  speakPocketCue,
} from '../lib/compassHaptics';
import {
  FeatureTestSuiteReport,
  runAllBalizaFeatureTests,
} from '../lib/featureTests';
import { sendRoomChatMessage } from '../lib/firebase';
import {
  createGpsFilterState,
  filterGpsSample,
  GpsFilterState,
} from '../lib/gpsFilter';
import { safeSessionGet, safeSessionSet } from '../lib/safeStorage';
import {
  BotMotionVector,
  findBotAutoCapture,
  isBotPlayerId,
  pickBotAbilityAction,
  pickBotChatMessage,
  setSecretSandboxUnlocked,
  stepBotVectors,
  subscribeSecretSandbox,
} from '../lib/soloSandbox';
import { EliminationOverlay } from './EliminationOverlay';
import { InfectionOverlay } from './InfectionOverlay';
import { MatchChatDrawer } from './MatchChatDrawer';
import { MatchResultOverlay } from './MatchResultOverlay';
import { getPixelSkullSvgHtml, PixelSkull } from './PixelSkull';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCosmeticName } from './PlayerCosmeticName';
import { SeekerHoldOverlay } from './SeekerHoldOverlay';
import { SeekerRouletteOverlay } from './SeekerRouletteOverlay';
import { SettingsPanel } from './SettingsPanel';
import { VirtualJoystick } from './VirtualJoystick';

interface MatchScreenProps {
  room: RoomRecord;
  players: PlayerRecord[];
  currentPlayerId: string;
  clockOffsetMs?: number;
  myLocationStatus?: LocationGuardStatus;
  peerLocationStatuses?: Record<string, LocationGuardStatus>;
  onRecheckLocation?: () => Promise<void>;
  onMarkCaught: (
    targetPlayerId: string,
    byPlayerId: string | 'storm' | 'anticheat' | 'photo' | 'camp'
  ) => Promise<void>;
  onUndoCaught: (targetPlayerId: string) => Promise<void>;
  onStartPhotoChallenge: (windowSec: number) => Promise<void>;
  onSetPhotoChallengeStatus: (
    challengeId: string,
    targetPlayerId: string,
    status: 'accepted' | 'rejected'
  ) => Promise<void>;
  onEliminatePhotoTimeouts: (targetPlayerIds: string[]) => Promise<void>;
  onDeclareWinner: (
    winner: MatchWinner,
    winReason: MatchWinReason,
    beaconActivatorId?: string
  ) => Promise<boolean>;
  onActivateAbility?: (
    kind: 'decoy' | 'cloak' | 'sonar' | 'scan',
    coords?: { lat: number; lng: number },
    actorPlayerId?: string
  ) => Promise<boolean>;
  onEndMatch: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  sandboxUnlocked?: boolean;
  onSandboxUpdateMatchState?: (
    updater: (prevMatch: MatchState, baseRules: RoomRules) => MatchState
  ) => Promise<void>;
}

type MatchTab = 'map' | 'players' | 'storm' | 'match';

const GPS_STORM_TOLERANCE_M = 5;
const BEACON_CAPTURE_HOLD_SEC = 8;
const LOCATION_GRACE_SEC = 15;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compressSelfieFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no compatible.'));
      img.onload = () => {
        const maxSide = 420;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la foto.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const MatchScreen: React.FC<MatchScreenProps> = ({
  room,
  players,
  currentPlayerId,
  clockOffsetMs = 0,
  myLocationStatus = 'unsupported',
  peerLocationStatuses = {},
  onRecheckLocation,
  onMarkCaught,
  onUndoCaught,
  onStartPhotoChallenge,
  onSetPhotoChallengeStatus,
  onEliminatePhotoTimeouts,
  onDeclareWinner,
  onActivateAbility,
  onEndMatch,
  onLeaveRoom,
  sandboxUnlocked = false,
  onSandboxUpdateMatchState,
}) => {
  const match = room.rules.matchState;
  const isHost = room.host_id === currentPlayerId;
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const myRole = match?.roles?.[currentPlayerId] ?? 'hider';
  const activeZones = match?.activeZones ?? [];
  const caughtMap = match?.caught || {};
  const infectedMap = match?.infected || {};
  const myCaughtRecord = caughtMap[currentPlayerId];
  const myInfectedRecord = infectedMap[currentPlayerId];
  const stormGraceMaxSec = room.rules.stormGraceSec ?? 30;
  const timeVictoryEnabled = room.rules.timeVictoryEnabled ?? true;
  const locationGuardEnabled = room.rules.requireLocationGuard ?? true;
  const extractionBeacon = match?.extractionBeacon ?? null;
  const photoChallenge = match?.photoChallenge ?? null;
  const matchWinner = match?.winner ?? null;
  const matchWinReason = match?.winReason ?? null;

  // Modificadores de partida
  const mods = room.rules.modifiers;
  const classicModeEnabled = Boolean(mods?.classicModeEnabled);
  const hidersCanSeeSeekers = Boolean(classicModeEnabled && room.rules.hidersCanSeeSeekers);
  const seekersCanSeeHiders = Boolean(classicModeEnabled && room.rules.seekersCanSeeHiders);
  const classicHintsEnabled = Boolean(classicModeEnabled && room.rules.hints);
  const classicHintIntervalSec = mods?.classicHintIntervalSec ?? 30;
  const classicHintsIncludeSeeker = Boolean(
    classicModeEnabled && mods?.classicHintsIncludeSeeker
  );
  const beaconHoldSec = mods?.beaconHoldSec ?? BEACON_CAPTURE_HOLD_SEC;
  const hunterPhotoEnabled = Boolean(mods?.hunterPhotoEnabled);
  const hunterPhotoWindowSec = mods?.hunterPhotoWindowSec ?? 60;
  const hunterPhotoDelaySec = mods?.hunterPhotoDelaySec ?? 15;
  const fogEnabled = Boolean(mods?.fogEnabled);
  const fogRadiusM = mods?.fogRadiusM ?? 60;
  const radarEnabled = Boolean(mods?.radarEnabled);
  const radarIntervalSec = mods?.radarIntervalSec ?? 20;
  const radarRangeM = mods?.radarRangeM ?? 300;
  const trailEnabled = Boolean(mods?.trailEnabled);
  const trailDurationSec = mods?.trailDurationSec ?? 90;
  const stealthStillEnabled = Boolean(mods?.stealthStillEnabled);
  const stealthStillDelaySec = mods?.stealthStillDelaySec ?? 10;
  const antiCampEnabled = Boolean(mods?.antiCampEnabled);
  const antiCampEliminate = Boolean(mods?.antiCampEliminate);
  const antiCampLimitSec = mods?.antiCampLimitSec ?? 45;
  const antiCampRadiusM = mods?.antiCampRadiusM ?? 12;
  const hotColdEnabled = Boolean(mods?.hotColdEnabled);
  const hotColdNearM = mods?.hotColdNearM ?? 35;
  const panicEndgameEnabled = Boolean(mods?.panicEndgameEnabled);
  const panicWindowSec = mods?.panicWindowSec ?? 60;
  const panicPingIntervalSec = mods?.panicPingIntervalSec ?? 15;
  const infectionModeEnabled = Boolean(mods?.infectionModeEnabled);
  const contractHuntEnabled = Boolean(mods?.contractHuntEnabled);
  const abilitiesEnabled = mods?.abilitiesEnabled ?? true;
  const abilitiesMax = Math.max(1, mods?.abilitiesPerPlayer ?? 2);
  const chatAllowed = !(mods?.noChat ?? false);
  const allowTestJoystick = mods?.testJoystickEnabled ?? true;
  const testJoystickDefaultSpeed = mods?.testJoystickDefaultSpeed ?? 'run';

  const [activeTab, setActiveTab] = useState<MatchTab>('map');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [myPos, setMyPos] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsRejectedJumps, setGpsRejectedJumps] = useState(0);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickFollowMap, setJoystickFollowMap] = useState(true);
  const [otherLocations, setOtherLocations] = useState<
    Record<string, PlayerLocationPayload>
  >({});
  const [photoProofs, setPhotoProofs] = useState<Record<string, PhotoProofPayload>>({});
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [radarBlips, setRadarBlips] = useState<
    Array<{ playerId: string; name: string; lat: number; lng: number; atMs: number }>
  >([]);
  const [classicHintLabel, setClassicHintLabel] = useState<string | null>(null);
  const [classicHintRevealUntilMs, setClassicHintRevealUntilMs] = useState<number>(0);
  const lastClassicHintBucketRef = useRef<number>(-1);
  const [trailVersion, setTrailVersion] = useState(0);
  const [recapVersion, setRecapVersion] = useState(0);
  const [stormEnteredAtMs, setStormEnteredAtMs] = useState<number | null>(null);
  const [locDisabledSinceMs, setLocDisabledSinceMs] = useState<number | null>(null);
  const [beaconHoldStartMs, setBeaconHoldStartMs] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<'end' | 'leave' | null>(
    null
  );
  const [confirmCatchId, setConfirmCatchId] = useState<string | null>(null);
  const [busyCatchId, setBusyCatchId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  const [showEliminationOverlay, setShowEliminationOverlay] = useState(false);
  const [showInfectionOverlay, setShowInfectionOverlay] = useState(false);
  const [showSandboxModal, setShowSandboxModal] = useState(false);
  const [sandboxBotsMoving, setSandboxBotsMoving] = useState(true);
  const [sandboxBotsAutoPlay, setSandboxBotsAutoPlay] = useState(true);
  const [sandboxTestReport, setSandboxTestReport] =
    useState<FeatureTestSuiteReport | null>(null);
  const [sandboxTestingBusy, setSandboxTestingBusy] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [seenEventsCount, setSeenEventsCount] = useState(0);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showMapTools, setShowMapTools] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [pocketCompassOn, setPocketCompassOn] = useState(false);
  const [pocketVoiceOn, setPocketVoiceOn] = useState(false);
  const [deviceHeadingDeg, setDeviceHeadingDeg] = useState<number | null>(null);
  const [abilityBusy, setAbilityBusy] = useState(false);
  const [abilityToast, setAbilityToast] = useState<string | null>(null);
  const [quickScanUntilMs, setQuickScanUntilMs] = useState(0);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [resultWaitDone, setResultWaitDone] = useState(true);
  const [bgKeepAliveOn, setBgKeepAliveOn] = useState(() =>
    isBackgroundKeepAliveActive()
  );
  const [notifPerm, setNotifPerm] = useState(() =>
    getNotificationPermissionStatus()
  );
  const [myEquippedCosmetics, setMyEquippedCosmetics] = useState(() =>
    getEquippedCosmetics()
  );

  useEffect(() => {
    const unsubPrefs = subscribePreferences(() => {
      setMyEquippedCosmetics(getEquippedCosmetics());
    });
    const unsubSandbox = subscribeSecretSandbox(() => {
      setMyEquippedCosmetics(getEquippedCosmetics());
    });
    return () => {
      unsubPrefs();
      unsubSandbox();
    };
  }, []);

  const effectivePlayerCosmetics = useMemo(
    () => ({
      ...(room.rules.playerCosmetics || {}),
      [currentPlayerId]: myEquippedCosmetics,
    }),
    [room.rules.playerCosmetics, currentPlayerId, myEquippedCosmetics]
  );

  const gpsFilterRef = useRef<GpsFilterState>(createGpsFilterState());
  const lastPocketVoiceAtRef = useRef<number>(0);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stormLayerRef = useRef<L.LayerGroup | null>(null);
  const stormMaskRef = useRef<L.Polygon | null>(null);
  const stormBorderRef = useRef<L.Circle | null>(null);
  const nextZoneCircleRef = useRef<L.Circle | null>(null);
  const lastNextZoneIdRef = useRef<string | null>(null);
  const beaconLayerRef = useRef<L.LayerGroup | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);
  const radarLayerRef = useRef<L.LayerGroup | null>(null);
  const radarWaveCirclesRef = useRef<L.Circle[]>([]);
  const fogLayerRef = useRef<L.LayerGroup | null>(null);
  const fogMaskRef = useRef<L.Polygon | null>(null);
  const fogCircleRef = useRef<L.Circle | null>(null);
  const guideLayerRef = useRef<L.LayerGroup | null>(null);
  const guideLineRef = useRef<L.Polyline | null>(null);
  const guideExitRef = useRef<L.Marker | null>(null);
  const othersLayerRef = useRef<L.LayerGroup | null>(null);
  const selfLayerRef = useRef<L.LayerGroup | null>(null);
  const sendLocationRef = useRef<((p: PlayerLocationPayload) => void) | null>(
    null
  );
  const sendPhotoProofRef = useRef<((p: PhotoProofPayload) => void) | null>(
    null
  );
  const trailHistoryRef = useRef<
    Record<string, Array<{ lat: number; lng: number; at: number }>>
  >({});
  const fullPathHistoryRef = useRef<
    Record<string, { points: MatchPathPoint[]; totalMeters: number }>
  >({});
  const recapLoadedKeyRef = useRef<string | null>(null);
  const joystickActiveRef = useRef(false);
  const lastSimBroadcastMsRef = useRef(0);
  const canRecordRecapRef = useRef(false);
  const recapAnchorMsRef = useRef(Date.now());
  const lastMoveStepRef = useRef<{ lat: number; lng: number; atMs: number } | null>(
    null
  );
  const motionAnchorRef = useRef<{ lat: number; lng: number; sinceMs: number } | null>(
    null
  );
  const lastRadarCycleRef = useRef<number>(-1);
  const radarSweepStartMsRef = useRef<number>(0);
  const radarSweepOriginsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const photoAutoStartedRef = useRef(false);
  const lastPhotoChallengeIdRef = useRef<string | null>(null);
  const photoTimeoutSentRef = useRef<string | null>(null);

  const activeZonesRef = useRef(activeZones);
  const startedAtRef = useRef(match?.startedAt);
  const stormDelayMsRef = useRef(0);
  const myRoleRef = useRef(myRole);
  const myPosRef = useRef(myPos);
  const fogConfigRef = useRef({ enabled: fogEnabled, radiusM: fogRadiusM });
  const radarRangeRef = useRef(radarRangeM);
  const isPhaseActiveForEffectsRef = useRef(false);
  const stormEliminationSentRef = useRef(false);
  const locEliminationSentRef = useRef(false);
  const winnerSentRef = useRef(false);
  const beaconUnlockNotifiedRef = useRef(false);
  const lastWinnerNotifiedRef = useRef<string | null>(null);
  const waitTriggeredForEndRef = useRef<string | null>(null);
  const waitDeadlineMsRef = useRef<number | null>(null);
  const seenCaughtIdsRef = useRef<Set<string>>(new Set(Object.keys(caughtMap)));
  const seenInfectedIdsRef = useRef<Set<string>>(
    new Set(Object.keys(infectedMap))
  );
  const shownEliminationKeysRef = useRef<Set<string>>(new Set());
  const shownInfectionKeysRef = useRef<Set<string>>(new Set());
  const botVectorsRef = useRef<Record<string, BotMotionVector>>({});
  const botStartAtMsRef = useRef<number>(Date.now());
  const lastNearAnchorAtRef = useRef<number>(0);
  const lastBotCaptureAtRef = useRef<number>(0);
  const rolesRef = useRef(match?.roles || {});
  const playersRef = useRef(players);
  const abilityUsesRef = useRef(match?.abilityUses || {});
  const activeCloaksRef = useRef(match?.activeCloaks || {});
  const activeDecoysRef = useRef(match?.activeDecoys || []);
  const extractionBeaconRef = useRef(extractionBeacon);
  const isHuntPhaseRef = useRef(false);
  const matchWinnerRef = useRef(matchWinner);
  const otherLocationsRef = useRef(otherLocations);
  const isMyStealthStillRef = useRef(false);
  const isMyCloakActiveRef = useRef(false);
  const startSignalPlayedRef = useRef(false);
  const hiderHideThemePlayedRef = useRef(false);
  const prevPhaseRef = useRef<'roulette' | 'hiding' | 'hunting' | null>(null);
  const lastHideTickSecRef = useRef<number | null>(null);
  const lastEndgameTickSecRef = useRef<number | null>(null);
  const campEliminationSentRef = useRef(false);
  const hadAntiCampWarningRef = useRef(false);
  const stormOutsideTotalMsRef = useRef(0);
  const pocketActiveMsRef = useRef(0);
  const pocketTotalMsRef = useRef(0);
  const lastTelemetryTickMsRef = useRef<number>(Date.now());
  const reachedFinalZoneRef = useRef(false);
  const usedAbilityKindsRef = useRef<{ decoy: boolean; cloak: boolean }>({
    decoy: false,
    cloak: false,
  });
  const lastTechAbilityAtMsRef = useRef<number>(0);
  const hadTechHunterCatchRef = useRef(false);
  const endSnapshotTelemetryRef = useRef<{
    nearestSeekerDistM: number | null;
    timeRemainingSec: number | null;
  }>({ nearestSeekerDistM: null, timeRemainingSec: null });

  const clockOffsetRef = useRef(clockOffsetMs);

  activeZonesRef.current = activeZones;
  startedAtRef.current = match?.startedAt;
  myRoleRef.current = myRole;
  myPosRef.current = myPos;
  clockOffsetRef.current = clockOffsetMs;
  fogConfigRef.current = { enabled: fogEnabled, radiusM: fogRadiusM };
  radarRangeRef.current = radarRangeM;
  joystickActiveRef.current = joystickActive;
  rolesRef.current = match?.roles || {};
  playersRef.current = players;
  abilityUsesRef.current = match?.abilityUses || {};
  activeCloaksRef.current = match?.activeCloaks || {};
  activeDecoysRef.current = match?.activeDecoys || [];
  extractionBeaconRef.current = extractionBeacon;
  matchWinnerRef.current = matchWinner;
  otherLocationsRef.current = otherLocations;

  const recapStorageKey = `baliza_recap_${room.id}_${match?.startedAt ?? ''}`;
  if (recapLoadedKeyRef.current !== recapStorageKey) {
    recapLoadedKeyRef.current = recapStorageKey;
    try {
      const raw = safeSessionGet(recapStorageKey);
      fullPathHistoryRef.current = raw ? JSON.parse(raw) : {};
    } catch {
      fullPathHistoryRef.current = {};
    }
  }

  const recordRecapPoint = (pid: string, lat: number, lng: number, tSec: number) => {
    const prev = fullPathHistoryRef.current[pid] || {
      points: [],
      totalMeters: 0,
    };
    const last = prev.points[prev.points.length - 1];
    const stepMeters = last ? distanceMeters(last.lat, last.lng, lat, lng) : 0;
    if (!last || stepMeters >= 5) {
      const nextPoints = [
        ...prev.points,
        { lat, lng, tSec: Math.max(0, Number(tSec.toFixed(1))) },
      ].slice(-500);
      fullPathHistoryRef.current[pid] = {
        points: nextPoints,
        totalMeters: prev.totalMeters + (last ? stepMeters : 0),
      };
      safeSessionSet(
        recapStorageKey,
        JSON.stringify(fullPathHistoryRef.current)
      );
      setRecapVersion((v) => v + 1);
    }
  };

  // Reloj preciso (100ms) para que transiciones de fase y cuentas atrás vayan a la vez en todos los móviles
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  // Desbloquear Web Audio con el primer toque
  useEffect(() => {
    const handleUnlock = () => unlockRetroAudio();
    window.addEventListener('pointerdown', handleUnlock, {
      once: true,
      passive: true,
    });
    return () => window.removeEventListener('pointerdown', handleUnlock);
  }, []);

  const myCaughtAt = myCaughtRecord?.at ?? null;

  // Mostrar animación pixel-art de eliminación una sola vez cuando el jugador actual es eliminado
  useEffect(() => {
    if (!myCaughtAt) {
      setShowEliminationOverlay(false);
      return;
    }
    const seenKey = `baliza_elim_seen_${room.id}_${currentPlayerId}_${myCaughtAt}`;
    if (
      shownEliminationKeysRef.current.has(seenKey) ||
      safeSessionGet(seenKey) === '1'
    ) {
      return;
    }
    shownEliminationKeysRef.current.add(seenKey);
    safeSessionSet(seenKey, '1');
    setShowEliminationOverlay(true);
  }, [myCaughtAt, room.id, currentPlayerId]);

  // Detectar nuevas eliminaciones y avisar a toda la sala
  useEffect(() => {
    const currentKeys = Object.keys(caughtMap);
    const newlyCaught = currentKeys.filter(
      (id) => !seenCaughtIdsRef.current.has(id)
    );
    seenCaughtIdsRef.current = new Set(currentKeys);

    if (newlyCaught.length > 0) {
      const targetId = newlyCaught[newlyCaught.length - 1];
      const rec = caughtMap[targetId];
      const targetName =
        players.find((p) => p.id === targetId)?.name || 'Un jugador';
      if (rec?.byPlayerId === 'storm') {
        setCaptureToast(`${targetName} ha sido eliminado por la tormenta.`);
      } else if (rec?.byPlayerId === 'anticheat') {
        setCaptureToast(`${targetName} ha sido eliminado por desactivar la ubicación.`);
      } else if (rec?.byPlayerId === 'photo') {
        setCaptureToast(`${targetName} eliminado por no hacerse la foto con el cazador.`);
      } else if (rec?.byPlayerId === 'camp') {
        setCaptureToast(`${targetName} ha sido eliminado por quedarse quieto.`);
      } else {
        const hunterName =
          players.find((p) => p.id === rec?.byPlayerId)?.name || 'Un buscador';
        setCaptureToast(`${hunterName} ha eliminado a ${targetName}.`);
        if (
          rec?.byPlayerId === currentPlayerId &&
          lastTechAbilityAtMsRef.current > 0 &&
          Date.now() - lastTechAbilityAtMsRef.current <= 20000
        ) {
          hadTechHunterCatchRef.current = true;
        }
      }

      // Sonido global para todos los jugadores cuando alguien es eliminado
      if (newlyCaught.some((id) => id !== currentPlayerId)) {
        playGlobalEliminationAlert();
      }

      const timeout = window.setTimeout(() => {
        setCaptureToast(null);
      }, 6500);
      return () => window.clearTimeout(timeout);
    }
  }, [caughtMap, players, currentPlayerId]);

  const myInfectedAt = myInfectedRecord?.at ?? null;

  // Mostrar animación pixel-art propia de INFECCIÓN cuando el jugador actual cambia de bando
  useEffect(() => {
    if (!myInfectedAt) {
      setShowInfectionOverlay(false);
      return;
    }
    const seenKey = `baliza_inf_seen_${room.id}_${currentPlayerId}_${myInfectedAt}`;
    if (
      shownInfectionKeysRef.current.has(seenKey) ||
      safeSessionGet(seenKey) === '1'
    ) {
      return;
    }
    shownInfectionKeysRef.current.add(seenKey);
    safeSessionSet(seenKey, '1');
    setShowInfectionOverlay(true);
  }, [myInfectedAt, room.id, currentPlayerId]);

  // Detectar nuevas infecciones y avisar a toda la sala
  useEffect(() => {
    const currentKeys = Object.keys(infectedMap);
    const newlyInfected = currentKeys.filter(
      (id) => !seenInfectedIdsRef.current.has(id)
    );
    seenInfectedIdsRef.current = new Set(currentKeys);

    if (newlyInfected.length > 0) {
      const targetId = newlyInfected[newlyInfected.length - 1];
      const rec = infectedMap[targetId];
      const targetName =
        players.find((p) => p.id === targetId)?.name || 'Un jugador';
      const hunterName =
        players.find((p) => p.id === rec?.byPlayerId)?.name || 'Un buscador';
      const selfInfected = newlyInfected.includes(currentPlayerId);

      setCaptureToast(
        selfInfected
          ? '🧟 ¡Te han infectado! Ahora pasas a pillar como Buscador.'
          : `🧟 ${hunterName} infectó a ${targetName}. ¡Ahora es buscador!`
      );

      if (
        rec?.byPlayerId === currentPlayerId &&
        lastTechAbilityAtMsRef.current > 0 &&
        Date.now() - lastTechAbilityAtMsRef.current <= 20000
      ) {
        hadTechHunterCatchRef.current = true;
      }

      if (!selfInfected) {
        playGlobalInfectionAlert();
      } else if (!myInfectedAt) {
        playInfectionAlert(true);
      }

      if (selfInfected && document.visibilityState === 'hidden') {
        void sendBackgroundNotification(
          '🧟 ¡Has sido infectado!',
          `${hunterName} te atrapó. Ahora juegas como Buscador.`,
          'baliza-infected'
        );
      }

      const timeout = window.setTimeout(() => {
        setCaptureToast(null);
      }, 6500);
      return () => window.clearTimeout(timeout);
    }
  }, [infectedMap, players, currentPlayerId, myInfectedAt]);

  const applyFilteredGpsFix = (
    lat: number,
    lng: number,
    accuracy: number,
    timestampMs: number
  ) => {
    const res = filterGpsSample(gpsFilterRef.current, {
      lat,
      lng,
      accuracy,
      timestampMs,
    });
    gpsFilterRef.current = res.state;
    setGpsRejectedJumps(res.state.rejectedJumps);
    if (res.position) {
      setMyPos(res.position);
      return res.position;
    }
    return myPosRef.current;
  };

  // Seguimiento GPS propio con filtro anti-saltos y suavizado EMA
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no admite GPS en vivo.');
      return;
    }

    const onSuccess = (pos: GeolocationPosition) => {
      if (joystickActiveRef.current) return;
      setGpsError((prev) => {
        if (prev) {
          void onRecheckLocation?.();
        }
        return null;
      });
      applyFilteredGpsFix(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy,
        pos.timestamp || Date.now()
      );
    };

    const onErr = () => {
      if (joystickActiveRef.current) return;
      setGpsError('Activa el GPS para ver tu posición y guía de zona.');
    };

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 4000,
      timeout: 10000,
    };

    const watchId = navigator.geolocation.watchPosition(
      onSuccess,
      onErr,
      geoOptions
    );

    const handleResumeFromSleep = () => {
      if (document.visibilityState === 'visible' && !joystickActiveRef.current) {
        void startBackgroundKeepAlive().then((ok) => setBgKeepAliveOn(ok));
        navigator.geolocation.getCurrentPosition(onSuccess, () => {}, geoOptions);
      }
    };

    document.addEventListener('visibilitychange', handleResumeFromSleep);
    window.addEventListener('focus', handleResumeFromSleep);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', handleResumeFromSleep);
      window.removeEventListener('focus', handleResumeFromSleep);
    };
  }, []);

  // Canal en vivo para compartir ubicaciones, rastros y pruebas de foto
  useEffect(() => {
    const sub = subscribeToMatchLocations(room.id, (payload) => {
      if (payload.playerId === currentPlayerId) return;
      setOtherLocations((prev) => ({
        ...prev,
        [payload.playerId]: payload,
      }));
      if (canRecordRecapRef.current) {
        const tSec =
          (Date.now() + clockOffsetRef.current - recapAnchorMsRef.current) / 1000;
        recordRecapPoint(payload.playerId, payload.lat, payload.lng, tSec);
      }
      if (trailEnabled && !payload.isStill) {
        const list = trailHistoryRef.current[payload.playerId] || [];
        const last = list[list.length - 1];
        if (!last || distanceMeters(last.lat, last.lng, payload.lat, payload.lng) >= 4) {
          const cutoff = Date.now() - trailDurationSec * 1000;
          trailHistoryRef.current[payload.playerId] = [
            ...list.filter((pt) => pt.at >= cutoff),
            { lat: payload.lat, lng: payload.lng, at: Date.now() },
          ].slice(-90);
          setTrailVersion((v) => v + 1);
        }
      }
    });
    sendLocationRef.current = sub.sendLocation;

    const photoSub = subscribeToPhotoProofs(room.id, (proof) => {
      setPhotoProofs((prev) => ({
        ...prev,
        [`${proof.challengeId}:${proof.playerId}`]: proof,
      }));
    });
    sendPhotoProofRef.current = photoSub.sendProof;

    return () => {
      sendLocationRef.current = null;
      sendPhotoProofRef.current = null;
      sub.unsubscribe();
      photoSub.unsubscribe();
    };
  }, [room.id, currentPlayerId, trailEnabled, trailDurationSec]);

  const syncedNowMs = nowMs + clockOffsetMs;

  const startMs = useMemo(() => {
    if (!match?.startedAt) return syncedNowMs;
    const parsed = new Date(match.startedAt).getTime();
    return Number.isNaN(parsed) ? syncedNowMs : parsed;
  }, [match?.startedAt]);

  const rouletteDurationMs = match?.rouletteDurationMs ?? 0;
  const seekerOrder = match?.seekerOrder ?? [];
  const hideTimeSec = match?.hideTimeSec ?? room.rules.hideTimeSec ?? 30;
  const hideDurationMs = hideTimeSec * 1000;
  const rouletteEndMs = startMs + rouletteDurationMs;
  const huntStartMs = rouletteEndMs + hideDurationMs;
  stormDelayMsRef.current = rouletteDurationMs + hideDurationMs;

  const isRoulettePhase =
    rouletteDurationMs > 0 && seekerOrder.length > 0 && syncedNowMs < rouletteEndMs;
  const isHidePhase = !isRoulettePhase && syncedNowMs < huntStartMs;
  const isHuntPhase = !isRoulettePhase && !isHidePhase;
  const hideRemainingSec = isHidePhase
    ? Math.min(hideTimeSec, Math.max(0, (huntStartMs - syncedNowMs) / 1000))
    : 0;

  const huntElapsedSec = useMemo(() => {
    return Math.max(0, (syncedNowMs - huntStartMs) / 1000);
  }, [syncedNowMs, huntStartMs]);

  const roundRemainingSec = useMemo(() => {
    const totalRoundSec = (room.rules.roundDuration || 30) * 60;
    return Math.max(0, totalRoundSec - huntElapsedSec);
  }, [room.rules.roundDuration, huntElapsedSec]);

  const hasMatchStarted = syncedNowMs >= startMs;
  canRecordRecapRef.current = hasMatchStarted && !isRoulettePhase && !matchWinner;
  recapAnchorMsRef.current = rouletteEndMs;

  // Sonido de inicio para todos los jugadores justo en t=0 sincronizado
  useEffect(() => {
    if (!hasMatchStarted || startSignalPlayedRef.current) return;
    if (syncedNowMs - startMs < 15000) {
      startSignalPlayedRef.current = true;
      playMatchStartSignal();
    }
  }, [hasMatchStarted, startMs, syncedNowMs]);

  // Sintonía cuando los fugitivos empiezan a correr y aviso a todos al terminar la cuenta atrás
  useEffect(() => {
    if (!hasMatchStarted) return;
    const currentPhase: 'roulette' | 'hiding' | 'hunting' = isRoulettePhase
      ? 'roulette'
      : isHidePhase
      ? 'hiding'
      : 'hunting';
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = currentPhase;

    if (
      myRole === 'hider' &&
      currentPhase === 'hiding' &&
      !hiderHideThemePlayedRef.current &&
      huntStartMs - (Date.now() + clockOffsetRef.current) > 2000
    ) {
      hiderHideThemePlayedRef.current = true;
      const playback = playMatchStartSuspenseTheme();
      return () => {
        playback.stop();
      };
    }

    if (prevPhase === 'hiding' && currentPhase === 'hunting') {
      playHuntStartSting();
      if (document.visibilityState === 'hidden') {
        void sendBackgroundNotification(
          '¡Empieza la caza!',
          myRole === 'seeker'
            ? 'La cuenta atrás terminó. ¡Sal a buscar!'
            : 'Los buscadores acaban de salir.',
          'baliza-hunt-start'
        );
      }
    }
  }, [hasMatchStarted, isRoulettePhase, isHidePhase, myRole, huntStartMs]);

  // Tics de cuenta atrás también para los fugitivos durante el escondite inicial
  useEffect(() => {
    if (matchWinner || !isHidePhase || myRole !== 'hider') {
      lastHideTickSecRef.current = null;
      return;
    }
    const ceilSec = Math.max(0, Math.ceil(hideRemainingSec));
    if (ceilSec > 0 && lastHideTickSecRef.current !== ceilSec) {
      lastHideTickSecRef.current = ceilSec;
      playSeekerCountdownBeep(ceilSec);
    }
  }, [matchWinner, isHidePhase, myRole, hideRemainingSec]);

  // Tics de cuenta atrás finales cuando quedan <= 30 segundos para acabar la partida
  useEffect(() => {
    if (!timeVictoryEnabled || !isHuntPhase || matchWinner) {
      lastEndgameTickSecRef.current = null;
      return;
    }
    const ceilEndSec = Math.ceil(roundRemainingSec);
    if (ceilEndSec <= 0 || ceilEndSec > 30) {
      if (ceilEndSec > 30) {
        lastEndgameTickSecRef.current = null;
      }
      return;
    }
    if (lastEndgameTickSecRef.current !== ceilEndSec) {
      lastEndgameTickSecRef.current = ceilEndSec;
      playEndgameCountdownTick(ceilEndSec);
    }
  }, [timeVictoryEnabled, isHuntPhase, matchWinner, roundRemainingSec]);

  const snapshot = useMemo(() => {
    return evaluateStormAtElapsed(activeZones, huntElapsedSec);
  }, [activeZones, huntElapsedSec]);

  const stormOverflowMeters = useMemo(() => {
    if (!myPos) return null;
    const d = distanceMeters(
      myPos.lat,
      myPos.lng,
      snapshot.currentLat,
      snapshot.currentLng
    );
    return d - snapshot.currentRadius;
  }, [myPos, snapshot.currentLat, snapshot.currentLng, snapshot.currentRadius]);

  // Los buscadores pueden permanecer en la tormenta indefinidamente sin penalización
  const isInStorm =
    !matchWinner &&
    isHuntPhase &&
    myRole === 'hider' &&
    stormOverflowMeters !== null &&
    stormOverflowMeters > GPS_STORM_TOLERANCE_M;

  useEffect(() => {
    if (isInStorm) {
      setStormEnteredAtMs((prev) => {
        if (prev === null && document.visibilityState === 'hidden') {
          void sendBackgroundNotification(
            '⚠️ ¡Estás en la tormenta!',
            `Vuelve a la zona segura antes de ${stormGraceMaxSec} s o serás eliminado.`,
            'baliza-storm'
          );
        }
        return prev ?? Date.now();
      });
    } else {
      setStormEnteredAtMs(null);
      stormEliminationSentRef.current = false;
    }
  }, [isInStorm, stormGraceMaxSec]);

  const stormTimeSpentSec =
    isInStorm && stormEnteredAtMs !== null
      ? Math.max(0, (nowMs - stormEnteredAtMs) / 1000)
      : 0;
  const stormGraceRemainingSec = Math.max(
    0,
    stormGraceMaxSec - stormTimeSpentSec
  );

  const isStormExposed =
    isInStorm && stormTimeSpentSec >= stormGraceMaxSec / 2;

  useEffect(() => {
    if (
      !matchWinner &&
      isHuntPhase &&
      isInStorm &&
      stormGraceRemainingSec <= 0 &&
      !myCaughtRecord &&
      !stormEliminationSentRef.current
    ) {
      stormEliminationSentRef.current = true;
      void onMarkCaught(currentPlayerId, 'storm');
    }
  }, [
    matchWinner,
    isHuntPhase,
    isInStorm,
    stormGraceRemainingSec,
    myCaughtRecord,
    currentPlayerId,
    onMarkCaught,
  ]);

  // Guardia anti-trampas de ubicación GPS: bloqueo, revelación de última posición y eliminación tras 15 s
  const isMyLocationTampered =
    locationGuardEnabled &&
    !joystickActive &&
    hasMatchStarted &&
    !isRoulettePhase &&
    !matchWinner &&
    !myCaughtRecord &&
    (myLocationStatus === 'disabled' || Boolean(gpsError));

  useEffect(() => {
    if (isMyLocationTampered) {
      setLocDisabledSinceMs((prev) => {
        if (prev === null) {
          playLocationTamperAlarm();
        }
        return prev ?? Date.now();
      });
    } else {
      setLocDisabledSinceMs(null);
      locEliminationSentRef.current = false;
    }
  }, [isMyLocationTampered]);

  const locOffElapsedSec =
    isMyLocationTampered && locDisabledSinceMs !== null
      ? Math.max(0, (nowMs - locDisabledSinceMs) / 1000)
      : 0;
  const locGraceRemainingSec = Math.max(
    0,
    LOCATION_GRACE_SEC - locOffElapsedSec
  );

  useEffect(() => {
    if (
      isMyLocationTampered &&
      myRole === 'hider' &&
      locGraceRemainingSec <= 0 &&
      !myCaughtRecord &&
      !locEliminationSentRef.current
    ) {
      locEliminationSentRef.current = true;
      void onMarkCaught(currentPlayerId, 'anticheat');
    }
  }, [
    isMyLocationTampered,
    myRole,
    locGraceRemainingSec,
    myCaughtRecord,
    currentPlayerId,
    onMarkCaught,
  ]);

  // Baliza de Extracción (forma activa para que los fugitivos ganen antes de que acabe el tiempo)
  const isBeaconUnlocked = Boolean(
    extractionBeacon &&
      isHuntPhase &&
      huntElapsedSec >= extractionBeacon.unlockAtSec
  );
  const beaconUnlockRemainingSec = extractionBeacon
    ? Math.max(0, extractionBeacon.unlockAtSec - huntElapsedSec)
    : 0;
  const beaconDistanceMeters = useMemo(() => {
    if (!extractionBeacon || !myPos) return null;
    return distanceMeters(
      myPos.lat,
      myPos.lng,
      extractionBeacon.lat,
      extractionBeacon.lng
    );
  }, [extractionBeacon, myPos]);

  useEffect(() => {
    if (isBeaconUnlocked && !beaconUnlockNotifiedRef.current && !matchWinner) {
      beaconUnlockNotifiedRef.current = true;
      playBeaconUnlockAlert();
      if (document.visibilityState === 'hidden') {
        void sendBackgroundNotification(
          '🚩 ¡Baliza de Extracción activa!',
          myRole === 'hider'
            ? `Llega a la Baliza en el mapa y mantente ${beaconHoldSec} s para ganar.`
            : 'Los fugitivos ya pueden extraer en la Baliza. ¡Vigílala!',
          'baliza-beacon-unlock'
        );
      }
    }
  }, [isBeaconUnlocked, matchWinner, myRole, beaconHoldSec]);

  const isCapturingBeacon = Boolean(
    !matchWinner &&
      !myCaughtRecord &&
      myRole === 'hider' &&
      isBeaconUnlocked &&
      extractionBeacon &&
      beaconDistanceMeters !== null &&
      beaconDistanceMeters <= extractionBeacon.radiusM + GPS_STORM_TOLERANCE_M
  );

  useEffect(() => {
    if (isCapturingBeacon) {
      setBeaconHoldStartMs((prev) => prev ?? Date.now());
    } else {
      setBeaconHoldStartMs(null);
    }
  }, [isCapturingBeacon]);

  const beaconHoldElapsedSec =
    isCapturingBeacon && beaconHoldStartMs !== null
      ? Math.max(0, (nowMs - beaconHoldStartMs) / 1000)
      : 0;
  const beaconHoldRemainingSec = Math.max(
    0,
    beaconHoldSec - beaconHoldElapsedSec
  );

  useEffect(() => {
    if (
      isCapturingBeacon &&
      beaconHoldRemainingSec <= 0 &&
      !matchWinner &&
      !winnerSentRef.current
    ) {
      winnerSentRef.current = true;
      void onDeclareWinner('hiders', 'beacon_extracted', currentPlayerId);
    }
  }, [
    isCapturingBeacon,
    beaconHoldRemainingSec,
    matchWinner,
    currentPlayerId,
    onDeclareWinner,
  ]);

  // Seguimiento de movimiento propio (Sigilo inmóvil, Anti-camper y Rastro propio)
  useEffect(() => {
    if (!myPos) return;
    const now = Date.now();
    if (
      !lastMoveStepRef.current ||
      distanceMeters(lastMoveStepRef.current.lat, lastMoveStepRef.current.lng, myPos.lat, myPos.lng) >= 3
    ) {
      lastMoveStepRef.current = { lat: myPos.lat, lng: myPos.lng, atMs: now };
    }
    if (
      !motionAnchorRef.current ||
      distanceMeters(motionAnchorRef.current.lat, motionAnchorRef.current.lng, myPos.lat, myPos.lng) >= antiCampRadiusM
    ) {
      motionAnchorRef.current = { lat: myPos.lat, lng: myPos.lng, sinceMs: now };
    }

    if (canRecordRecapRef.current && !myCaughtRecord) {
      const tSec = (Date.now() + clockOffsetRef.current - recapAnchorMsRef.current) / 1000;
      recordRecapPoint(currentPlayerId, myPos.lat, myPos.lng, tSec);
    }

    if (trailEnabled && !myCaughtRecord && isHuntPhase) {
      const stillCheck =
        stealthStillEnabled &&
        myRole === 'hider' &&
        lastMoveStepRef.current !== null &&
        now - lastMoveStepRef.current.atMs >= stealthStillDelaySec * 1000;
      if (!stillCheck) {
        const list = trailHistoryRef.current[currentPlayerId] || [];
        const last = list[list.length - 1];
        if (!last || distanceMeters(last.lat, last.lng, myPos.lat, myPos.lng) >= 4) {
          const cutoff = now - trailDurationSec * 1000;
          trailHistoryRef.current[currentPlayerId] = [
            ...list.filter((pt) => pt.at >= cutoff),
            { lat: myPos.lat, lng: myPos.lng, at: now },
          ].slice(-90);
          setTrailVersion((v) => v + 1);
        }
      }
    }
  }, [
    myPos,
    currentPlayerId,
    trailEnabled,
    trailDurationSec,
    stealthStillEnabled,
    stealthStillDelaySec,
    antiCampRadiusM,
    myRole,
    myCaughtRecord,
    isHuntPhase,
  ]);

  const isMyStealthStill = Boolean(
    stealthStillEnabled &&
      myRole === 'hider' &&
      isHuntPhase &&
      !myCaughtRecord &&
      lastMoveStepRef.current !== null &&
      nowMs - lastMoveStepRef.current.atMs >= stealthStillDelaySec * 1000
  );

  const antiCampElapsedSec =
    antiCampEnabled &&
    (antiCampEliminate || myRole === 'hider') &&
    isHuntPhase &&
    !myCaughtRecord &&
    !matchWinner &&
    motionAnchorRef.current !== null
      ? Math.max(0, (nowMs - motionAnchorRef.current.sinceMs) / 1000)
      : 0;
  const antiCampWarningLeadSec = Math.min(
    15,
    Math.max(4, Math.floor(antiCampLimitSec / 2))
  );
  const isMyCampExposed = antiCampEnabled && antiCampElapsedSec >= antiCampLimitSec;
  const antiCampWarningSec =
    antiCampEnabled &&
    antiCampElapsedSec >= antiCampLimitSec - antiCampWarningLeadSec &&
    antiCampElapsedSec < antiCampLimitSec
      ? Math.ceil(antiCampLimitSec - antiCampElapsedSec)
      : null;

  useEffect(() => {
    if (antiCampWarningSec !== null || isMyCampExposed) {
      hadAntiCampWarningRef.current = true;
    }
  }, [antiCampWarningSec, isMyCampExposed]);

  useEffect(() => {
    if (!isMyCampExposed) {
      campEliminationSentRef.current = false;
      return;
    }
    if (
      antiCampEnabled &&
      antiCampEliminate &&
      isHuntPhase &&
      !matchWinner &&
      !myCaughtRecord &&
      !campEliminationSentRef.current
    ) {
      campEliminationSentRef.current = true;
      void onMarkCaught(currentPlayerId, 'camp');
    }
  }, [
    isMyCampExposed,
    antiCampEnabled,
    antiCampEliminate,
    isHuntPhase,
    matchWinner,
    myCaughtRecord,
    currentPlayerId,
    onMarkCaught,
  ]);

  // Telemetría ligera para logros tryhard (tormenta, zona final, brújula, buscador más cercano)
  useEffect(() => {
    const now = Date.now();
    const dtMs = Math.min(1000, Math.max(0, now - lastTelemetryTickMsRef.current));
    lastTelemetryTickMsRef.current = now;

    if (matchWinner) return;

    if (isHuntPhase && !myCaughtRecord) {
      if (isInStorm) {
        stormOutsideTotalMsRef.current += dtMs;
      }
      pocketTotalMsRef.current += dtMs;
      if (pocketCompassOn) {
        pocketActiveMsRef.current += dtMs;
      }
      if (activeZones.length > 0 && snapshot.phaseIndex >= activeZones.length - 1) {
        reachedFinalZoneRef.current = true;
      }
    }

    let nearestSeekerDistM: number | null = null;
    if (myPos && myRole === 'hider') {
      let best = Infinity;
      players.forEach((p) => {
        if ((match?.roles?.[p.id] ?? 'hider') !== 'seeker' || caughtMap[p.id]) return;
        const loc = otherLocations[p.id];
        if (!loc || now - loc.updatedAt > 45000) return;
        const d = distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng);
        if (d < best) best = d;
      });
      if (Number.isFinite(best)) {
        nearestSeekerDistM = Math.round(best);
      }
    }
    endSnapshotTelemetryRef.current = {
      nearestSeekerDistM,
      timeRemainingSec: Math.round(roundRemainingSec),
    };
  }, [
    nowMs,
    matchWinner,
    isHuntPhase,
    myCaughtRecord,
    isInStorm,
    pocketCompassOn,
    activeZones.length,
    snapshot.phaseIndex,
    myPos,
    myRole,
    players,
    match?.roles,
    caughtMap,
    otherLocations,
    roundRemainingSec,
  ]);

  useEffect(() => {
    if (!myPos || myCaughtRecord) return;
    const emit = () => {
      sendLocationRef.current?.({
        playerId: currentPlayerId,
        lat: myPos.lat,
        lng: myPos.lng,
        accuracy: myPos.accuracy,
        inStorm: isInStorm,
        stormExposed: isStormExposed,
        updatedAt: Date.now(),
        locationStatus: joystickActive ? 'active' : myLocationStatus,
        locationDisabled: joystickActive ? false : isMyLocationTampered,
        isStill: isMyStealthStill,
        campExposed: isMyCampExposed,
      });
    };

    if (joystickActive) {
      const now = Date.now();
      if (now - lastSimBroadcastMsRef.current >= 450) {
        lastSimBroadcastMsRef.current = now;
        emit();
      }
    } else {
      emit();
    }

    const timer = window.setInterval(emit, 2500);
    return () => window.clearInterval(timer);
  }, [
    myPos,
    currentPlayerId,
    isInStorm,
    isStormExposed,
    myCaughtRecord,
    myLocationStatus,
    isMyLocationTampered,
    isMyStealthStill,
    isMyCampExposed,
    joystickActive,
  ]);

  // Foto con el cazador: inicio automático (tras hunterPhotoDelaySec de cacería) + temporizador + eliminación al vencer
  useEffect(() => {
    if (
      isHost &&
      hunterPhotoEnabled &&
      isHuntPhase &&
      !matchWinner &&
      !photoChallenge &&
      !photoAutoStartedRef.current &&
      huntElapsedSec >= hunterPhotoDelaySec
    ) {
      photoAutoStartedRef.current = true;
      void onStartPhotoChallenge(hunterPhotoWindowSec);
    }
  }, [
    isHost,
    hunterPhotoEnabled,
    isHuntPhase,
    matchWinner,
    photoChallenge,
    huntElapsedSec,
    hunterPhotoDelaySec,
    hunterPhotoWindowSec,
    onStartPhotoChallenge,
  ]);

  const photoChallengeExpiresMs = photoChallenge
    ? new Date(photoChallenge.expiresAt).getTime()
    : 0;
  const photoChallengeRemainingSec =
    photoChallenge && !Number.isNaN(photoChallengeExpiresMs)
      ? Math.max(0, (photoChallengeExpiresMs - syncedNowMs) / 1000)
      : 0;
  const isPhotoChallengeActive = Boolean(
    photoChallenge && !matchWinner && photoChallengeRemainingSec > 0
  );
  const myPhotoStatus = photoChallenge
    ? photoChallenge.completedBy?.[currentPlayerId]?.status ?? null
    : null;

  useEffect(() => {
    if (!photoChallenge) return;
    if (lastPhotoChallengeIdRef.current !== photoChallenge.id) {
      lastPhotoChallengeIdRef.current = photoChallenge.id;
      photoTimeoutSentRef.current = null;
      playPhotoChallengeAlert();
      if (document.visibilityState === 'hidden') {
        void sendBackgroundNotification(
          '📸 ¡Reto: Foto con el cazador!',
          myRole === 'hider'
            ? `Tienes ${photoChallenge.windowSec} s para hacerte una foto con el buscador.`
            : `Los fugitivos deben hacerse una foto contigo en ${photoChallenge.windowSec} s.`,
          'baliza-photo-challenge'
        );
      }
    }
  }, [photoChallenge, myRole]);

  useEffect(() => {
    if (
      !photoChallenge ||
      matchWinner ||
      !isHuntPhase ||
      photoChallengeRemainingSec > 0 ||
      photoTimeoutSentRef.current === photoChallenge.id
    ) {
      return;
    }

    const activeMissingHiders = players
      .filter((p) => {
        const role = match?.roles?.[p.id] ?? 'hider';
        if (role !== 'hider' || caughtMap[p.id]) return false;
        return photoChallenge.completedBy?.[p.id]?.status !== 'accepted';
      })
      .map((p) => p.id);

    if (activeMissingHiders.length === 0) {
      photoTimeoutSentRef.current = photoChallenge.id;
      return;
    }

    if (isHost) {
      photoTimeoutSentRef.current = photoChallenge.id;
      void onEliminatePhotoTimeouts(activeMissingHiders);
    } else if (
      myRole === 'hider' &&
      !myCaughtRecord &&
      activeMissingHiders.includes(currentPlayerId)
    ) {
      photoTimeoutSentRef.current = photoChallenge.id;
      void onMarkCaught(currentPlayerId, 'photo');
    }
  }, [
    photoChallenge,
    matchWinner,
    isHuntPhase,
    photoChallengeRemainingSec,
    players,
    match?.roles,
    caughtMap,
    isHost,
    myRole,
    myCaughtRecord,
    currentPlayerId,
    onEliminatePhotoTimeouts,
    onMarkCaught,
  ]);

  // Modo Radar: pulso periódico desde los buscadores que detecta escondidos
  useEffect(() => {
    isPhaseActiveForEffectsRef.current = hasMatchStarted && !isRoulettePhase && !matchWinner;
    if (!radarEnabled || !isHuntPhase || matchWinner) return;

    const currentCycle = Math.floor(huntElapsedSec / radarIntervalSec);
    if (currentCycle <= lastRadarCycleRef.current) return;
    lastRadarCycleRef.current = currentCycle;

    // Obtener orígenes (buscadores activos)
    const seekerOrigins: Array<{ lat: number; lng: number }> = [];
    const now = Date.now();
    players.forEach((p) => {
      const role = match?.roles?.[p.id] ?? 'hider';
      if (role !== 'seeker') return;
      if (p.id === currentPlayerId && myPos) {
        seekerOrigins.push({ lat: myPos.lat, lng: myPos.lng });
      } else {
        const loc = otherLocations[p.id];
        if (loc && now - loc.updatedAt <= 35000) {
          seekerOrigins.push({ lat: loc.lat, lng: loc.lng });
        }
      }
    });

    if (seekerOrigins.length === 0) return;

    radarSweepOriginsRef.current = seekerOrigins;
    radarSweepStartMsRef.current = now;

    // Detectar escondidos dentro del alcance del radar (salvo si Sigilo inmóvil o Silencio de Radar están activos)
    const detected: Array<{
      playerId: string;
      name: string;
      lat: number;
      lng: number;
      atMs: number;
    }> = [];
    const activeCloaks = match?.activeCloaks || {};
    const activeDecoys = (match?.activeDecoys || []).filter(
      (d) => new Date(d.expiresAt).getTime() > syncedNowMs
    );
    players.forEach((p) => {
      const role = match?.roles?.[p.id] ?? 'hider';
      if (role !== 'hider' || caughtMap[p.id]) return;
      const cloakUntil = activeCloaks[p.id] ? new Date(activeCloaks[p.id]).getTime() : 0;
      if (cloakUntil > syncedNowMs) return;
      const loc =
        p.id === currentPlayerId && myPos
          ? { lat: myPos.lat, lng: myPos.lng, updatedAt: now, isStill: isMyStealthStill }
          : otherLocations[p.id];
      if (!loc || now - loc.updatedAt > 35000) return;
      if (stealthStillEnabled && loc.isStill) return;

      const inRange = seekerOrigins.some(
        (origin) =>
          distanceMeters(origin.lat, origin.lng, loc.lat, loc.lng) <= radarRangeM
      );
      if (inRange) {
        detected.push({
          playerId: p.id,
          name: p.name,
          lat: loc.lat,
          lng: loc.lng,
          atMs: now,
        });
      }
    });

    activeDecoys.forEach((decoy) => {
      const inRange = seekerOrigins.some(
        (origin) =>
          distanceMeters(origin.lat, origin.lng, decoy.lat, decoy.lng) <= radarRangeM
      );
      if (inRange) {
        detected.push({
          playerId: decoy.id,
          name: decoy.label,
          lat: decoy.lat,
          lng: decoy.lng,
          atMs: now,
        });
      }
    });

    if (myRole === 'seeker') {
      setRadarBlips(detected);
    }
    playRadarSweepPing(myRole === 'seeker' ? detected.length : 0);

    const clearTimer = window.setTimeout(() => {
      setRadarBlips((prev) => prev.filter((b) => Date.now() - b.atMs < 4600));
    }, 4700);
    return () => window.clearTimeout(clearTimer);
  }, [
    radarEnabled,
    isHuntPhase,
    hasMatchStarted,
    isRoulettePhase,
    matchWinner,
    huntElapsedSec,
    radarIntervalSec,
    radarRangeM,
    players,
    match?.roles,
    match?.activeCloaks,
    match?.activeDecoys,
    syncedNowMs,
    currentPlayerId,
    myPos,
    otherLocations,
    caughtMap,
    myRole,
    stealthStillEnabled,
    isMyStealthStill,
  ]);

  // Termómetro Frío / Caliente: distancia al rival activo más cercano sin revelar dirección
  const hotColdInfo = useMemo(() => {
    if (!hotColdEnabled || !isHuntPhase || matchWinner || !myPos) return null;
    const now = Date.now();
    let minDist = Infinity;
    players.forEach((p) => {
      if (p.id === currentPlayerId || caughtMap[p.id]) return;
      const otherRole = match?.roles?.[p.id] ?? 'hider';
      if (otherRole === myRole) return;
      const loc = otherLocations[p.id];
      if (!loc || now - loc.updatedAt > 35000) return;
      const d = distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng);
      if (d < minDist) minDist = d;
    });
    if (!Number.isFinite(minDist)) return null;
    if (minDist <= hotColdNearM) {
      return { label: '¡Muy cerca!', tone: 'hot' as const, dist: minDist };
    }
    if (minDist <= hotColdNearM * 3) {
      return { label: 'Caliente', tone: 'warm' as const, dist: minDist };
    }
    if (minDist <= hotColdNearM * 7) {
      return { label: 'Templado', tone: 'mild' as const, dist: minDist };
    }
    return { label: 'Helado', tone: 'cold' as const, dist: minDist };
  }, [
    hotColdEnabled,
    hotColdNearM,
    isHuntPhase,
    matchWinner,
    myPos,
    players,
    currentPlayerId,
    caughtMap,
    match?.roles,
    myRole,
    otherLocations,
  ]);

  // Pistas periódicas del modo Juego clásico: revelan ubicación actual en mapa de fugitivos (y buscador si se marca)
  useEffect(() => {
    if (!classicHintsEnabled || !isHuntPhase || matchWinner) {
      if (!classicHintsEnabled || matchWinner) {
        setClassicHintLabel(null);
        setClassicHintRevealUntilMs(0);
        lastClassicHintBucketRef.current = -1;
      }
      return;
    }

    const bucket = Math.floor(huntElapsedSec / classicHintIntervalSec);
    if (bucket < 1 || bucket <= lastClassicHintBucketRef.current) return;
    lastClassicHintBucketRef.current = bucket;

    const now = Date.now();
    setClassicHintRevealUntilMs(now + 6500);

    let revealedHiders = 0;
    let revealedSeekers = 0;
    let bestDist = Infinity;
    let bestLoc: { lat: number; lng: number } | null = null;
    let bestRoleLabel = 'Fugitivo';

    const activeCloaks = match?.activeCloaks || {};
    players.forEach((p) => {
      if (p.id === currentPlayerId || caughtMap[p.id]) return;
      const otherRole = match?.roles?.[p.id] ?? 'hider';
      const cloakUntil = activeCloaks[p.id] ? new Date(activeCloaks[p.id]).getTime() : 0;
      if (otherRole === 'hider' && cloakUntil > syncedNowMs) return;
      const isIncluded =
        otherRole === 'hider' ||
        (classicHintsIncludeSeeker && otherRole === 'seeker');
      if (!isIncluded) return;

      const loc = otherLocations[p.id];
      if (!loc || now - loc.updatedAt > 35000) return;

      if (otherRole === 'hider') revealedHiders++;
      else revealedSeekers++;

      // Elegir objetivo prioritario para la etiqueta de distancia/rumbo en pantalla
      const wantsDistanceToThis =
        (myRole === 'seeker' && otherRole === 'hider') ||
        (myRole === 'hider' &&
          (classicHintsIncludeSeeker ? otherRole === 'seeker' : otherRole === 'hider'));

      if (wantsDistanceToThis && myPos) {
        const d = distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng);
        if (d < bestDist) {
          bestDist = d;
          bestLoc = { lat: loc.lat, lng: loc.lng };
          bestRoleLabel = otherRole === 'seeker' ? 'Buscador' : p.name;
        }
      }
    });

    playRadarSweepPing(revealedHiders + revealedSeekers);

    if (bestLoc && myPos && Number.isFinite(bestDist)) {
      const target = bestLoc as { lat: number; lng: number };
      const dLat = target.lat - myPos.lat;
      const dLng = (target.lng - myPos.lng) * Math.cos((myPos.lat * Math.PI) / 180);
      const deg = (Math.atan2(dLng, dLat) * 180) / Math.PI;
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
      const dir = dirs[Math.round(((deg + 360) % 360) / 45) % 8];
      const approxM = Math.max(10, Math.round(bestDist / 10) * 10);
      setClassicHintLabel(`${bestRoleLabel} ~${approxM} m (${dir})`);
    } else if (revealedHiders + revealedSeekers > 0) {
      setClassicHintLabel(
        classicHintsIncludeSeeker
          ? 'Fugitivos y buscador visibles'
          : 'Ubicación de fugitivos visible'
      );
    } else {
      setClassicHintLabel('Sin señal cercana');
    }
  }, [
    classicHintsEnabled,
    classicHintIntervalSec,
    classicHintsIncludeSeeker,
    isHuntPhase,
    matchWinner,
    huntElapsedSec,
    myPos,
    players,
    currentPlayerId,
    caughtMap,
    match?.roles,
    myRole,
    otherLocations,
  ]);

  const hiderStats = useMemo(() => {
    const hiders = players.filter(
      (p) => (match?.roles?.[p.id] ?? 'hider') === 'hider'
    );
    const activeHiders = hiders.filter((p) => !caughtMap[p.id]);
    return {
      totalHiders: hiders.length,
      activeHiders: activeHiders.length,
      seekersCount: Math.max(0, players.length - hiders.length),
    };
  }, [players, match?.roles, caughtMap]);

  const infectedCount = Object.keys(infectedMap).length;
  const hadAnyHiders = hiderStats.totalHiders > 0 || infectedCount > 0;
  const canCheckAllCaught = hasMatchStarted && !isRoulettePhase;
  const isTimeLimitReached =
    timeVictoryEnabled && isHuntPhase && roundRemainingSec <= 0;

  // Recta final frenética: últimos panicWindowSec segundos o último fugitivo activo
  const isPanicActive = Boolean(
    panicEndgameEnabled &&
      isHuntPhase &&
      !matchWinner &&
      (roundRemainingSec <= panicWindowSec ||
        (hiderStats.totalHiders + infectedCount > 1 &&
          hiderStats.activeHiders === 1))
  );
  const panicPulseBucket = Math.floor(huntElapsedSec / panicPingIntervalSec);
  const panicTargetDistM = useMemo(() => {
    if (!isPanicActive || myRole !== 'seeker' || !myPos) return null;
    const now = Date.now();
    let best = Infinity;
    players.forEach((p) => {
      if ((match?.roles?.[p.id] ?? 'hider') !== 'hider' || caughtMap[p.id]) return;
      const loc = otherLocations[p.id];
      if (!loc || now - loc.updatedAt > 35000) return;
      const d = distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng);
      if (d < best) best = d;
    });
    return Number.isFinite(best) ? Math.round(best) : null;
  }, [isPanicActive, myRole, myPos, panicPulseBucket, players, match?.roles, caughtMap, otherLocations]);

  // Comprobación automática de victoria (buscadores por captura total o escondidos por tiempo agotado)
  useEffect(() => {
    if (matchWinner || !canCheckAllCaught) {
      if (matchWinner) winnerSentRef.current = false;
      return;
    }

    const activeSeekersCount = players.filter(
      (p) => (match?.roles?.[p.id] ?? 'hider') === 'seeker' && !caughtMap[p.id]
    ).length;
    let pendingWin: { winner: MatchWinner; reason: MatchWinReason } | null = null;
    if (hadAnyHiders && hiderStats.activeHiders === 0) {
      pendingWin = { winner: 'seekers', reason: 'all_caught' };
    } else if (
      hiderStats.activeHiders > 0 &&
      hiderStats.seekersCount > 0 &&
      activeSeekersCount === 0
    ) {
      pendingWin = { winner: 'hiders', reason: 'all_caught' };
    } else if (isTimeLimitReached && hiderStats.activeHiders > 0) {
      pendingWin = { winner: 'hiders', reason: 'time_expired' };
    }

    if (!pendingWin || winnerSentRef.current) return;

    const triggerDeclare = () => {
      if (!pendingWin || winnerSentRef.current) return;
      winnerSentRef.current = true;
      void onDeclareWinner(pendingWin.winner, pendingWin.reason).then((ok) => {
        if (!ok) {
          winnerSentRef.current = false;
        }
      });
    };

    if (isHost) {
      triggerDeclare();
      return;
    }

    // Respaldo por si el anfitrión perdió conexión momentáneamente
    const fallbackTimer = window.setTimeout(triggerDeclare, 1500);
    return () => window.clearTimeout(fallbackTimer);
  }, [
    matchWinner,
    canCheckAllCaught,
    hadAnyHiders,
    hiderStats.activeHiders,
    isTimeLimitReached,
    isHost,
    onDeclareWinner,
  ]);

  const waitTimerRef = useRef<number | null>(null);
  const matchEndedAtRef = useRef(match?.endedAt);
  matchEndedAtRef.current = match?.endedAt;
  const caughtMapRef = useRef(caughtMap);
  caughtMapRef.current = caughtMap;
  const infectedMapRef = useRef(infectedMap);
  infectedMapRef.current = infectedMap;

  // Esperar a que termine la animación de eliminación cuando todos han sido pillados antes de lanzar Victoria/Derrota
  useEffect(() => {
    if (!matchWinner || !matchWinReason) {
      if (waitTimerRef.current !== null) {
        window.clearTimeout(waitTimerRef.current);
        waitTimerRef.current = null;
      }
      waitTriggeredForEndRef.current = null;
      waitDeadlineMsRef.current = null;
      setResultWaitDone(true);
      return;
    }

    const endKey = `${match?.startedAt ?? ''}-${matchWinner}-${matchWinReason}`;
    if (waitTriggeredForEndRef.current === endKey) {
      return;
    }
    waitTriggeredForEndRef.current = endKey;

    if (waitTimerRef.current !== null) {
      window.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }

    if (matchWinReason !== 'all_caught') {
      waitDeadlineMsRef.current = null;
      setResultWaitDone(true);
      return;
    }

    const endedAtParsed = matchEndedAtRef.current
      ? new Date(matchEndedAtRef.current).getTime()
      : NaN;
    const isFreshEnding =
      Number.isNaN(endedAtParsed) ||
      Math.abs(Date.now() + clockOffsetRef.current - endedAtParsed) < 30000;

    if (!isFreshEnding) {
      waitDeadlineMsRef.current = null;
      setResultWaitDone(true);
      return;
    }

    const latestCaughtMs = Object.values(caughtMapRef.current).reduce((max, rec) => {
      const t = new Date(rec.at).getTime();
      return Number.isNaN(t) ? max : Math.max(max, t);
    }, 0);
    const latestInfectedMs = Object.values(infectedMapRef.current).reduce((max, rec) => {
      const t = new Date(rec.at).getTime();
      return Number.isNaN(t) ? max : Math.max(max, t);
    }, 0);
    const waitMs = latestInfectedMs > latestCaughtMs ? 4350 : 4250;

    waitDeadlineMsRef.current = Date.now() + waitMs;
    setResultWaitDone(false);
    waitTimerRef.current = window.setTimeout(() => {
      waitTimerRef.current = null;
      waitDeadlineMsRef.current = null;
      setResultWaitDone(true);
    }, waitMs);
  }, [match?.startedAt, matchWinner, matchWinReason]);

  useEffect(() => {
    return () => {
      if (waitTimerRef.current !== null) {
        window.clearTimeout(waitTimerRef.current);
      }
    };
  }, []);

  // Notificación en segundo plano cuando termina la partida
  useEffect(() => {
    if (!matchWinner || !matchWinReason) return;
    const key = `${matchWinner}-${matchWinReason}`;
    if (lastWinnerNotifiedRef.current === key) return;
    lastWinnerNotifiedRef.current = key;
    setResultDismissed(false);
    if (document.visibilityState === 'hidden') {
      void sendBackgroundNotification(
        matchWinner === 'hiders'
          ? '🏆 ¡Ganan los Fugitivos!'
          : '🏆 ¡Ganan los Buscadores!',
        matchWinReason === 'beacon_extracted'
          ? 'Se activó la Baliza de Extracción.'
          : matchWinReason === 'time_expired'
          ? 'Se agotó el tiempo de la ronda.'
          : infectionModeEnabled
          ? 'Todos los fugitivos fueron infectados o eliminados.'
          : 'Todos los fugitivos fueron eliminados.',
        'baliza-winner'
      );
    }
  }, [matchWinner, matchWinReason, infectionModeEnabled]);

  const locationTamperingPlayers = useMemo(() => {
    if (!locationGuardEnabled || matchWinner) return [];
    return players.filter((p) => {
      if (p.id === currentPlayerId || caughtMap[p.id]) return false;
      const loc = otherLocations[p.id];
      const peerLoc = peerLocationStatuses[p.id];
      return (
        peerLoc === 'disabled' ||
        Boolean(loc && Date.now() - loc.updatedAt <= 45000 && loc.locationDisabled)
      );
    });
  }, [
    locationGuardEnabled,
    matchWinner,
    players,
    currentPlayerId,
    caughtMap,
    otherLocations,
    peerLocationStatuses,
  ]);

  // Inicializar mapa Leaflet a pantalla completa
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const first = activeZones[0];
    const map = L.map(mapContainerRef.current, {
      center: [
        first?.lat ?? VALENCIA_CENTER.lat,
        first?.lng ?? VALENCIA_CENTER.lng,
      ],
      zoom: 15,
      zoomControl: false,
    });

    const initialTile = getMapTileSpec(loadPreferences().mapStyle);
    const tileLayer = L.tileLayer(initialTile.url, {
      attribution: initialTile.attribution,
      maxZoom: 19,
    }).addTo(map);

    const unsubscribePrefs = subscribePreferences((prefs) => {
      const nextSpec = getMapTileSpec(prefs.mapStyle);
      tileLayer.setUrl(nextSpec.url);
    });

    const trailGroup = L.layerGroup().addTo(map);
    const stormGroup = L.layerGroup().addTo(map);
    const beaconGroup = L.layerGroup().addTo(map);
    const radarGroup = L.layerGroup().addTo(map);
    const guideGroup = L.layerGroup().addTo(map);
    const othersGroup = L.layerGroup().addTo(map);
    const fogGroup = L.layerGroup().addTo(map);
    const selfGroup = L.layerGroup().addTo(map);

    const initialSnap = evaluateStormAtElapsed(activeZonesRef.current, 0);

    const maskPoly = L.polygon(
      getStormMaskRings(
        initialSnap.currentLat,
        initialSnap.currentLng,
        initialSnap.currentRadius,
        96
      ),
      {
        color: 'transparent',
        weight: 0,
        fillColor: '#6D28D9',
        fillOpacity: 0.28,
        interactive: false,
      }
    ).addTo(stormGroup);

    const borderCircle = L.circle(
      [initialSnap.currentLat, initialSnap.currentLng],
      {
        radius: initialSnap.currentRadius,
        color: '#7C3AED',
        weight: 3.5,
        fill: false,
        interactive: false,
      }
    ).addTo(stormGroup);

    mapRef.current = map;
    trailLayerRef.current = trailGroup;
    stormMaskRef.current = maskPoly;
    stormBorderRef.current = borderCircle;
    stormLayerRef.current = stormGroup;
    beaconLayerRef.current = beaconGroup;
    radarLayerRef.current = radarGroup;
    fogLayerRef.current = fogGroup;
    guideLayerRef.current = guideGroup;
    othersLayerRef.current = othersGroup;
    selfLayerRef.current = selfGroup;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(mapContainerRef.current);

    return () => {
      unsubscribePrefs();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      trailLayerRef.current = null;
      stormMaskRef.current = null;
      stormBorderRef.current = null;
      nextZoneCircleRef.current = null;
      lastNextZoneIdRef.current = null;
      stormLayerRef.current = null;
      beaconLayerRef.current = null;
      radarLayerRef.current = null;
      radarWaveCirclesRef.current = [];
      fogLayerRef.current = null;
      fogMaskRef.current = null;
      fogCircleRef.current = null;
      guideLayerRef.current = null;
      guideLineRef.current = null;
      guideExitRef.current = null;
      othersLayerRef.current = null;
      selfLayerRef.current = null;
    };
  }, []);

  // Interpolación continua de la tormenta y línea guía a 60 FPS
  useEffect(() => {
    let rafId = 0;
    const frame = () => {
      const mask = stormMaskRef.current;
      const border = stormBorderRef.current;
      const stormGroup = stormLayerRef.current;
      const guideGroup = guideLayerRef.current;

      if (mask && border && stormGroup) {
        const startedAt = startedAtRef.current;
        const syncedNow = Date.now() + clockOffsetRef.current;
        const startTimestamp = startedAt
          ? new Date(startedAt).getTime()
          : syncedNow;
        const exactElapsed = Number.isNaN(startTimestamp)
          ? 0
          : Math.max(
              0,
              (syncedNow - startTimestamp - stormDelayMsRef.current) / 1000
            );
        const snap = evaluateStormAtElapsed(activeZonesRef.current, exactElapsed);

        mask.setLatLngs(
          getStormMaskRings(
            snap.currentLat,
            snap.currentLng,
            snap.currentRadius,
            96
          )
        );
        border.setLatLng([snap.currentLat, snap.currentLng]);
        border.setRadius(snap.currentRadius);

        const nextId = snap.nextZone?.id ?? null;
        if (nextId !== lastNextZoneIdRef.current) {
          if (nextZoneCircleRef.current) {
            stormGroup.removeLayer(nextZoneCircleRef.current);
            nextZoneCircleRef.current = null;
          }
          if (snap.nextZone) {
            nextZoneCircleRef.current = L.circle(
              [snap.nextZone.lat, snap.nextZone.lng],
              {
                radius: snap.nextZone.radius,
                color: '#0F172A',
                weight: 2.5,
                dashArray: '7, 6',
                fill: false,
                interactive: false,
              }
            ).addTo(stormGroup);
          }
          lastNextZoneIdRef.current = nextId;
        }

        const pos = myPosRef.current;

        // Actualizar niebla de guerra en el mapa si el Modo Niebla está activo
        const fogGroup = fogLayerRef.current;
        const fogCfg = fogConfigRef.current;
        if (fogGroup) {
          if (fogCfg.enabled && isPhaseActiveForEffectsRef.current && pos) {
            const rings = getStormMaskRings(pos.lat, pos.lng, fogCfg.radiusM, 64);
            if (!fogMaskRef.current) {
              fogMaskRef.current = L.polygon(rings, {
                color: 'transparent',
                weight: 0,
                fillColor: '#0F172A',
                fillOpacity: 0.88,
                interactive: false,
              }).addTo(fogGroup);
            } else {
              fogMaskRef.current.setLatLngs(rings);
            }
            if (!fogCircleRef.current) {
              fogCircleRef.current = L.circle([pos.lat, pos.lng], {
                radius: fogCfg.radiusM,
                color: '#94A3B8',
                weight: 2,
                dashArray: '5, 5',
                fill: false,
                interactive: false,
              }).addTo(fogGroup);
            } else {
              fogCircleRef.current.setLatLng([pos.lat, pos.lng]);
              fogCircleRef.current.setRadius(fogCfg.radiusM);
            }
          } else {
            if (fogMaskRef.current) {
              fogGroup.removeLayer(fogMaskRef.current);
              fogMaskRef.current = null;
            }
            if (fogCircleRef.current) {
              fogGroup.removeLayer(fogCircleRef.current);
              fogCircleRef.current = null;
            }
          }
        }

        // Animar onda expansiva del Modo Radar desde los buscadores
        const radarGroup = radarLayerRef.current;
        if (radarGroup) {
          const sweepElapsed = Date.now() - radarSweepStartMsRef.current;
          const sweepDuration = 2200;
          if (
            radarSweepStartMsRef.current > 0 &&
            sweepElapsed >= 0 &&
            sweepElapsed <= sweepDuration &&
            radarSweepOriginsRef.current.length > 0
          ) {
            const p = sweepElapsed / sweepDuration;
            const currentR = Math.max(4, p * radarRangeRef.current);
            const alpha = Math.max(0.05, 0.72 * (1 - p));
            const origins = radarSweepOriginsRef.current;
            while (radarWaveCirclesRef.current.length < origins.length) {
              const c = L.circle([origins[0].lat, origins[0].lng], {
                radius: currentR,
                color: '#E11D48',
                weight: 2.5,
                opacity: alpha,
                fillColor: '#E11D48',
                fillOpacity: alpha * 0.14,
                interactive: false,
              }).addTo(radarGroup);
              radarWaveCirclesRef.current.push(c);
            }
            origins.forEach((origin, i) => {
              const circle = radarWaveCirclesRef.current[i];
              if (circle) {
                circle.setLatLng([origin.lat, origin.lng]);
                circle.setRadius(currentR);
                circle.setStyle({ opacity: alpha, fillOpacity: alpha * 0.14 });
              }
            });
          } else if (radarWaveCirclesRef.current.length > 0) {
            radarWaveCirclesRef.current.forEach((c) => radarGroup.removeLayer(c));
            radarWaveCirclesRef.current = [];
          }
        }

        if (guideGroup && pos) {
          const dist = distanceMeters(
            pos.lat,
            pos.lng,
            snap.currentLat,
            snap.currentLng
          );
          if (
            myRoleRef.current === 'hider' &&
            dist > snap.currentRadius + GPS_STORM_TOLERANCE_M
          ) {
            const safeExit = getClosestSafePoint(
              snap.currentLat,
              snap.currentLng,
              snap.currentRadius,
              pos.lat,
              pos.lng
            );
            if (!guideLineRef.current) {
              guideLineRef.current = L.polyline(
                [
                  [pos.lat, pos.lng],
                  [safeExit.lat, safeExit.lng],
                ],
                {
                  color: '#059669',
                  weight: 4.5,
                  dashArray: '10, 8',
                  opacity: 0.95,
                  interactive: false,
                }
              ).addTo(guideGroup);
            } else {
              guideLineRef.current.setLatLngs([
                [pos.lat, pos.lng],
                [safeExit.lat, safeExit.lng],
              ]);
            }

            if (!guideExitRef.current) {
              const exitIcon = L.divIcon({
                className: 'baliza-safe-exit-marker',
                html: `<div style="width:16px;height:16px;border-radius:9999px;background:#059669;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
              });
              guideExitRef.current = L.marker([safeExit.lat, safeExit.lng], {
                icon: exitIcon,
                interactive: false,
              }).addTo(guideGroup);
            } else {
              guideExitRef.current.setLatLng([safeExit.lat, safeExit.lng]);
            }
          } else {
            if (guideLineRef.current) {
              guideGroup.removeLayer(guideLineRef.current);
              guideLineRef.current = null;
            }
            if (guideExitRef.current) {
              guideGroup.removeLayer(guideExitRef.current);
              guideExitRef.current = null;
            }
          }
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Dibujar Baliza de Extracción en el mapa
  useEffect(() => {
    const beaconGroup = beaconLayerRef.current;
    if (!beaconGroup) return;
    beaconGroup.clearLayers();
    if (!extractionBeacon || !isHuntPhase) return;

    const ringColor = isBeaconUnlocked ? '#059669' : '#D97706';
    L.circle([extractionBeacon.lat, extractionBeacon.lng], {
      radius: extractionBeacon.radiusM,
      color: ringColor,
      weight: 2.5,
      dashArray: isBeaconUnlocked ? undefined : '6, 5',
      fillColor: ringColor,
      fillOpacity: isBeaconUnlocked ? 0.22 : 0.08,
      interactive: false,
    }).addTo(beaconGroup);

    const labelText = isBeaconUnlocked
      ? 'BALIZA ACTIVA'
      : `Baliza en ${formatDurationSec(beaconUnlockRemainingSec)}`;

    const icon = L.divIcon({
      className: 'baliza-extraction-marker',
      html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
        <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:${ringColor};border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.35);font-size:15px;">🚩</div>
        <span style="margin-top:3px;padding:1px 7px;border-radius:9999px;background:${ringColor};color:#ffffff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);">${labelText}</span>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    L.marker([extractionBeacon.lat, extractionBeacon.lng], {
      icon,
      interactive: false,
    }).addTo(beaconGroup);
  }, [extractionBeacon, isHuntPhase, isBeaconUnlocked, Math.floor(beaconUnlockRemainingSec)]);

  // Dibujar huellas visibles (Modo Rastro)
  useEffect(() => {
    const trailGroup = trailLayerRef.current;
    if (!trailGroup) return;
    trailGroup.clearLayers();
    if (!trailEnabled || !isHuntPhase) return;

    const cutoff = Date.now() - trailDurationSec * 1000;
    Object.entries(trailHistoryRef.current).forEach(([pid, points]) => {
      if (caughtMap[pid]) return;
      const role = match?.roles?.[pid] ?? 'hider';
      const playerObj = players.find((p) => p.id === pid);
      const color = role === 'seeker' ? '#E11D48' : playerObj?.color || '#059669';

      const valid = points.filter((pt) => {
        if (pt.at < cutoff) return false;
        if (fogEnabled && myPos) {
          return distanceMeters(myPos.lat, myPos.lng, pt.lat, pt.lng) <= fogRadiusM;
        }
        return true;
      });
      if (valid.length === 0) return;

      if (valid.length >= 2) {
        L.polyline(
          valid.map((pt) => [pt.lat, pt.lng] as [number, number]),
          {
            color,
            weight: 3,
            dashArray: '4, 6',
            opacity: 0.7,
            interactive: false,
          }
        ).addTo(trailGroup);
      }

      valid.forEach((pt, idx) => {
        const ageRatio = (Date.now() - pt.at) / (trailDurationSec * 1000);
        const opacity = Math.max(0.2, 0.9 - ageRatio * 0.7);
        if (idx % 2 === 0 || idx === valid.length - 1) {
          L.circleMarker([pt.lat, pt.lng], {
            radius: 3.5,
            color: '#ffffff',
            weight: 1,
            fillColor: color,
            fillOpacity: opacity,
            opacity,
            interactive: false,
          }).addTo(trailGroup);
        }
      });
    });
  }, [
    trailEnabled,
    trailDurationSec,
    isHuntPhase,
    trailVersion,
    caughtMap,
    match?.roles,
    players,
    fogEnabled,
    fogRadiusM,
    myPos,
  ]);

  // Dibujar señales de sonar detectadas por el Modo Radar (para buscadores)
  useEffect(() => {
    const radarGroup = radarLayerRef.current;
    if (!radarGroup) return;
    // Eliminar solo marcadores de detección previos conservando las ondas activas
    radarGroup.eachLayer((layer) => {
      if (!radarWaveCirclesRef.current.includes(layer as L.Circle)) {
        radarGroup.removeLayer(layer);
      }
    });
    if (!radarEnabled || myRole !== 'seeker') return;

    const now = Date.now();
    radarBlips.forEach((blip) => {
      if (now - blip.atMs > 4600) return;
      if (fogEnabled && myPos && distanceMeters(myPos.lat, myPos.lng, blip.lat, blip.lng) > fogRadiusM) {
        return;
      }
      const pingIcon = L.divIcon({
        className: 'baliza-radar-blip',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="width:18px;height:18px;border-radius:9999px;background:#E11D48;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(225,29,72,0.35);"></div>
          <span style="margin-top:3px;padding:1px 6px;border-radius:9999px;background:#E11D48;color:#fff;font-size:10px;font-weight:700;white-space:nowrap;">Radar: ${escapeHtml(blip.name)}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([blip.lat, blip.lng], { icon: pingIcon, interactive: false }).addTo(radarGroup);
    });
  }, [radarBlips, radarEnabled, myRole, fogEnabled, fogRadiusM, myPos]);

  // Dibujar otros jugadores visibles y señuelos activos
  useEffect(() => {
    const othersGroup = othersLayerRef.current;
    if (!othersGroup) return;
    othersGroup.clearLayers();

    const now = Date.now();
    const activeCloaks = match?.activeCloaks || {};
    const isClassicHintActive = Boolean(
      classicHintsEnabled && isHuntPhase && classicHintRevealUntilMs > now
    );

    players.forEach((p) => {
      if (p.id === currentPlayerId) return;
      if (caughtMap[p.id]) return;
      const loc = otherLocations[p.id];
      if (!loc) return;

      const otherRole = match?.roles?.[p.id] ?? 'hider';
      const cloakUntil = activeCloaks[p.id] ? new Date(activeCloaks[p.id]).getTime() : 0;
      const isCloaked = otherRole === 'hider' && cloakUntil > syncedNowMs;

      const isLocOff =
        locationGuardEnabled &&
        (peerLocationStatuses[p.id] === 'disabled' || Boolean(loc.locationDisabled));
      if (!isLocOff && now - loc.updatedAt > 35000) return;

      // Modo Niebla: solo ves jugadores dentro de X metros de tu ubicación
      if (fogEnabled) {
        if (!myPos) return;
        const dist = distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng);
        if (dist > fogRadiusM) return;
      }

      const allowedByRule =
        (myRole === 'hider' && otherRole === 'seeker' && hidersCanSeeSeekers) ||
        (myRole === 'seeker' && otherRole === 'hider' && seekersCanSeeHiders);
      const isCampExposed = Boolean(antiCampEnabled && loc.campExposed);
      const isClassicHintRevealed = Boolean(
        !isCloaked &&
          isClassicHintActive &&
          (otherRole === 'hider' ||
            (classicHintsIncludeSeeker && otherRole === 'seeker'))
      );

      if (
        !allowedByRule &&
        !loc.stormExposed &&
        !isLocOff &&
        !isCampExposed &&
        !isClassicHintRevealed
      ) {
        return;
      }

      const borderColor = isLocOff
        ? '#DC2626'
        : isCampExposed
        ? '#D97706'
        : loc.stormExposed
        ? '#7C3AED'
        : !allowedByRule && isClassicHintRevealed
        ? otherRole === 'seeker'
          ? '#E11D48'
          : '#0284C7'
        : otherRole === 'seeker'
        ? '#E11D48'
        : '#047857';

      const badgeLabel = escapeHtml(
        isLocOff
          ? `${p.name} · GPS apagado`
          : isCampExposed
          ? `${p.name} · Quieto`
          : loc.stormExposed
          ? '¡En tormenta!'
          : !allowedByRule && isClassicHintRevealed
          ? otherRole === 'seeker'
            ? '🧭 Buscador'
            : `🧭 ${p.name}`
          : otherRole === 'seeker'
          ? 'Buscador'
          : p.name
      );
      const safeEmoji = escapeHtml(p.emoji);

      const icon = L.divIcon({
        className: 'baliza-other-player-marker',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#ffffff;border:3px solid ${borderColor};box-shadow:0 3px 10px rgba(15,23,42,0.3);font-size:18px;">${safeEmoji}</div>
          <span style="margin-top:3px;padding:1px 6px;border-radius:9999px;background:${borderColor};color:#ffffff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);">${badgeLabel}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([loc.lat, loc.lng], {
        icon,
        interactive: false,
      }).addTo(othersGroup);
    });

    // Señuelos activos desplegados por fugitivos
    if (isHuntPhase) {
      const activeDecoys = (match?.activeDecoys || []).filter(
        (d) => new Date(d.expiresAt).getTime() > syncedNowMs
      );
      activeDecoys.forEach((decoy) => {
        if (fogEnabled && myPos && distanceMeters(myPos.lat, myPos.lng, decoy.lat, decoy.lng) > fogRadiusM) {
          return;
        }
        const isOwner = decoy.ownerPlayerId === currentPlayerId;
        if (myRole !== 'seeker' && !isOwner) return;

        const decoyColor = isOwner ? '#7C3AED' : '#0284C7';
        const decoyBadge = isOwner
          ? '🎭 Señuelo activo'
          : `🧭 ${escapeHtml(decoy.label)}`;
        const decoyEmoji = isOwner ? '🎭' : '🏃';

        const icon = L.divIcon({
          className: 'baliza-decoy-marker',
          html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);opacity:${isOwner ? '0.85' : '1'};">
            <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#ffffff;border:3px dashed ${decoyColor};box-shadow:0 3px 10px rgba(15,23,42,0.3);font-size:18px;">${decoyEmoji}</div>
            <span style="margin-top:3px;padding:1px 6px;border-radius:9999px;background:${decoyColor};color:#ffffff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);">${decoyBadge}</span>
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        L.marker([decoy.lat, decoy.lng], { icon, interactive: false }).addTo(othersGroup);
      });
    }
  }, [
    players,
    otherLocations,
    currentPlayerId,
    match?.roles,
    match?.activeCloaks,
    match?.activeDecoys,
    syncedNowMs,
    myRole,
    hidersCanSeeSeekers,
    seekersCanSeeHiders,
    caughtMap,
    locationGuardEnabled,
    peerLocationStatuses,
    fogEnabled,
    fogRadiusM,
    myPos,
    antiCampEnabled,
    classicHintsEnabled,
    classicHintsIncludeSeeker,
    classicHintRevealUntilMs,
    isHuntPhase,
    nowMs,
  ]);

  // Dibujar mi propia ubicación GPS (o calavera negra pixelada si estoy eliminado)
  useEffect(() => {
    const selfGroup = selfLayerRef.current;
    if (!selfGroup) return;
    selfGroup.clearLayers();
    if (!myPos) return;

    if (myCaughtRecord) {
      const skullIcon = L.divIcon({
        className: 'baliza-self-skull-marker',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:#000000;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.45);">${getPixelSkullSvgHtml(20)}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      L.marker([myPos.lat, myPos.lng], {
        icon: skullIcon,
        interactive: false,
      }).addTo(selfGroup);
      return;
    }

    const dotColor = myRole === 'seeker' ? '#E11D48' : '#059669';

    const selfIcon = L.divIcon({
      className: 'baliza-self-marker',
      html: `<div style="width:18px;height:18px;border-radius:9999px;background:${dotColor};border:3px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.45);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    L.marker([myPos.lat, myPos.lng], {
      icon: selfIcon,
      interactive: false,
    }).addTo(selfGroup);
  }, [myPos, myRole, myCaughtRecord]);

  const handleCenterMyGps = () => {
    if (myPos && mapRef.current) {
      mapRef.current.setView([myPos.lat, myPos.lng], 16, { animate: true });
      return;
    }
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsError(null);
        const filtered = applyFilteredGpsFix(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.timestamp || Date.now()
        );
        const target = filtered ?? {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        mapRef.current?.setView([target.lat, target.lng], 16, { animate: true });
      },
      () => {
        setGpsError('No pudimos obtener tu ubicación GPS.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCenterZone = () => {
    const map = mapRef.current;
    if (!map) return;
    const zoom =
      snapshot.currentRadius >= 1500
        ? 13
        : snapshot.currentRadius >= 600
        ? 14
        : snapshot.currentRadius >= 250
        ? 15
        : 16;
    map.setView([snapshot.currentLat, snapshot.currentLng], zoom, {
      animate: true,
    });
  };

  const handleZoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom(map.getZoom() + delta);
  };

  const handleToggleJoystick = () => {
    if (!allowTestJoystick) return;
    setJoystickActive((prev) => {
      const next = !prev;
      if (next) {
        setGpsError(null);
        const seedLat =
          myPosRef.current?.lat ?? activeZones[0]?.lat ?? VALENCIA_CENTER.lat;
        const seedLng =
          myPosRef.current?.lng ?? activeZones[0]?.lng ?? VALENCIA_CENTER.lng;
        if (!myPosRef.current) {
          setMyPos({ lat: seedLat, lng: seedLng, accuracy: 3 });
        }
        mapRef.current?.setView([seedLat, seedLng], 16, { animate: true });
      } else {
        gpsFilterRef.current = createGpsFilterState();
        setGpsRejectedJumps(0);
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGpsError(null);
              applyFilteredGpsFix(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy,
                pos.timestamp || Date.now()
              );
            },
            () => {},
            { enableHighAccuracy: true, timeout: 6000 }
          );
        }
      }
      return next;
    });
  };

  const handleJoystickMove = (
    dx: number,
    dy: number,
    speedMps: number,
    dtSec: number
  ) => {
    const base = myPosRef.current ?? {
      lat: activeZones[0]?.lat ?? VALENCIA_CENTER.lat,
      lng: activeZones[0]?.lng ?? VALENCIA_CENTER.lng,
      accuracy: 3,
    };
    const eastMeters = dx * speedMps * dtSec;
    const northMeters = dy * speedMps * dtSec;
    const dLat = northMeters / 111320;
    const cosLat = Math.max(0.15, Math.cos((base.lat * Math.PI) / 180));
    const dLng = eastMeters / (111320 * cosLat);
    const nextLat = Math.max(-85, Math.min(85, base.lat + dLat));
    const nextLng = base.lng + dLng;

    setMyPos({ lat: nextLat, lng: nextLng, accuracy: 3 });
    if (joystickFollowMap && mapRef.current) {
      mapRef.current.panTo([nextLat, nextLng], { animate: false });
    }
  };

  const recapRoutes = useMemo<Record<string, PlayerRecapRoute>>(() => {
    const result: Record<string, PlayerRecapRoute> = {};
    players.forEach((p) => {
      const rec = fullPathHistoryRef.current[p.id];
      result[p.id] = {
        playerId: p.id,
        points: rec?.points ? [...rec.points] : [],
        totalMeters: rec?.totalMeters ?? 0,
      };
    });
    return result;
  }, [players, recapVersion, matchWinner]);

  const recapMatchDurationSec = useMemo(() => {
    const endedMs = match?.endedAt
      ? new Date(match.endedAt).getTime()
      : syncedNowMs;
    if (Number.isNaN(endedMs)) return Math.max(10, hideTimeSec + huntElapsedSec);
    return Math.max(10, (endedMs - rouletteEndMs) / 1000);
  }, [match?.endedAt, rouletteEndMs, syncedNowMs, hideTimeSec, huntElapsedSec]);

  const handleCatchPlayer = async (
    targetId: string,
    byId: string | 'storm'
  ) => {
    unlockRetroAudio();
    setBusyCatchId(targetId);
    try {
      await onMarkCaught(targetId, byId);
      setConfirmCatchId(null);
    } finally {
      setBusyCatchId(null);
    }
  };

  const handleUndo = async (targetId: string) => {
    setBusyCatchId(targetId);
    try {
      await onUndoCaught(targetId);
    } finally {
      setBusyCatchId(null);
    }
  };

  const handleConfirmEnd = async () => {
    setBusyAction(true);
    try {
      await onEndMatch();
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmLeave = async () => {
    setBusyAction(true);
    try {
      await onLeaveRoom();
    } finally {
      setBusyAction(false);
    }
  };

  const phaseTimeline = useMemo(() => {
    let cursor = 0;
    return activeZones.map((zone, idx) => {
      const waitStart = cursor;
      const waitEnd = waitStart + zone.waitTimeSec;
      const next = activeZones[idx + 1] || null;
      const shrinkEnd = next ? waitEnd + next.shrinkTimeSec : waitEnd;
      cursor = shrinkEnd;
      return {
        zone,
        idx,
        waitStart,
        waitEnd,
        shrinkEnd,
        hasNext: Boolean(next),
      };
    });
  }, [activeZones]);

  interface MatchHistoryEvent {
    id: string;
    atMs: number;
    kind:
      | 'phase'
      | 'storm'
      | 'elimination'
      | 'infection'
      | 'beacon'
      | 'photo'
      | 'winner';
    title: string;
    detail?: string;
  }

  const matchEvents = useMemo<MatchHistoryEvent[]>(() => {
    if (!hasMatchStarted) return [];
    const list: MatchHistoryEvent[] = [];

    list.push({
      id: 'match-start',
      atMs: startMs,
      kind: 'phase',
      title: 'Partida iniciada',
      detail:
        rouletteDurationMs > 0
          ? 'Sorteo de buscadores en marcha.'
          : 'Comienza la fase para esconderse.',
    });

    if (isHuntPhase) {
      list.push({
        id: 'hunt-start',
        atMs: huntStartMs,
        kind: 'phase',
        title: '¡Empieza la búsqueda!',
        detail: 'Los buscadores ya pueden salir a cazar.',
      });
    }

    phaseTimeline.forEach((step) => {
      if (!step.hasNext) return;
      const nextZone = activeZones[step.idx + 1];
      if (!nextZone) return;

      if (huntElapsedSec >= step.waitEnd) {
        list.push({
          id: `zone-closing-${step.idx}`,
          atMs: huntStartMs + step.waitEnd * 1000,
          kind: 'storm',
          title: `La zona ${step.idx + 1} empezó a cerrarse`,
          detail: `Reduciéndose hacia Zona ${step.idx + 2} (${formatRadius(
            nextZone.radius
          )}).`,
        });
      }

      if (huntElapsedSec >= step.shrinkEnd) {
        list.push({
          id: `zone-closed-${step.idx}`,
          atMs: huntStartMs + step.shrinkEnd * 1000,
          kind: 'storm',
          title: `La zona ${step.idx + 1} se ha cerrado`,
          detail:
            step.idx + 1 === activeZones.length - 1
              ? `Zona final activa (${formatRadius(nextZone.radius)}).`
              : `Nueva zona segura activa (${formatRadius(nextZone.radius)}).`,
        });
      }
    });

    if (extractionBeacon && isHuntPhase && huntElapsedSec >= extractionBeacon.unlockAtSec) {
      list.push({
        id: 'beacon-unlocked',
        atMs: huntStartMs + extractionBeacon.unlockAtSec * 1000,
        kind: 'beacon',
        title: 'Baliza de extracción desbloqueada',
        detail: 'Los fugitivos ya pueden acudir al punto verde para escapar.',
      });
    }

    if (extractionBeacon?.activatedAt) {
      const activatorName =
        players.find((p) => p.id === extractionBeacon.activatedByPlayerId)?.name ||
        'Un fugitivo';
      const activatedMs = new Date(extractionBeacon.activatedAt).getTime();
      if (!Number.isNaN(activatedMs)) {
        list.push({
          id: 'beacon-activated',
          atMs: activatedMs,
          kind: 'beacon',
          title: `${activatorName} activó la baliza`,
          detail: 'Extracción completada.',
        });
      }
    }

    if (photoChallenge?.startedAt) {
      const photoMs = new Date(photoChallenge.startedAt).getTime();
      if (!Number.isNaN(photoMs)) {
        list.push({
          id: `photo-${photoChallenge.id}`,
          atMs: photoMs,
          kind: 'photo',
          title: `Reto foto lanzado (${photoChallenge.windowSec} s)`,
          detail: 'Los fugitivos debían hacerse una foto con el cazador.',
        });
      }
    }

    Object.entries(caughtMap).forEach(([targetId, rec]) => {
      const targetName =
        players.find((p) => p.id === targetId)?.name || 'Un jugador';
      const parsedAt = new Date(rec.at).getTime();
      const atMs = Number.isNaN(parsedAt) ? syncedNowMs : parsedAt;

      let title = `${targetName} fue eliminado`;
      let detail = 'Eliminado durante la ronda.';

      if (rec.byPlayerId === 'storm') {
        title = `${targetName} fue eliminado por la tormenta`;
        detail = 'Pasó demasiado tiempo fuera de la zona segura.';
      } else if (rec.byPlayerId === 'anticheat') {
        title = `${targetName} fue eliminado`;
        detail = 'Desactivó la ubicación GPS durante la partida.';
      } else if (rec.byPlayerId === 'photo') {
        title = `${targetName} fue eliminado`;
        detail = 'No completó el reto foto a tiempo.';
      } else if (rec.byPlayerId === 'camp') {
        title = `${targetName} fue eliminado`;
        detail = 'Se quedó quieto demasiado tiempo.';
      } else {
        const hunterName =
          players.find((p) => p.id === rec.byPlayerId)?.name || 'Un buscador';
        title = `${targetName} fue eliminado por ${hunterName}`;
        detail = 'Capturado en la caza.';
      }

      list.push({
        id: `elim-${targetId}-${rec.at}`,
        atMs,
        kind: 'elimination',
        title,
        detail,
      });
    });

    Object.entries(infectedMap).forEach(([targetId, rec]) => {
      const targetName =
        players.find((p) => p.id === targetId)?.name || 'Un jugador';
      const hunterName =
        players.find((p) => p.id === rec.byPlayerId)?.name || 'Un buscador';
      const parsedAt = new Date(rec.at).getTime();
      const atMs = Number.isNaN(parsedAt) ? syncedNowMs : parsedAt;

      list.push({
        id: `inf-${targetId}-${rec.at}`,
        atMs,
        kind: 'infection',
        title: `${targetName} fue infectado por ${hunterName}`,
        detail: 'Pasó al bando de los buscadores.',
      });
    });

    if (matchWinner) {
      const endedMs = match?.endedAt ? new Date(match.endedAt).getTime() : NaN;
      list.push({
        id: `winner-${matchWinner}`,
        atMs: Number.isNaN(endedMs) ? syncedNowMs : endedMs,
        kind: 'winner',
        title:
          matchWinner === 'hiders'
            ? '¡Ganan los Fugitivos!'
            : '¡Ganan los Buscadores!',
        detail:
          matchWinReason === 'beacon_extracted'
            ? 'Se activó la baliza de extracción.'
            : matchWinReason === 'time_expired'
            ? 'Se agotó el tiempo de la partida.'
            : infectionModeEnabled
            ? 'Todos los fugitivos fueron infectados o eliminados.'
            : 'Todos los fugitivos fueron eliminados.',
      });
    }

    return list.sort((a, b) => b.atMs - a.atMs);
  }, [
    hasMatchStarted,
    startMs,
    rouletteDurationMs,
    isHuntPhase,
    huntStartMs,
    phaseTimeline,
    activeZones,
    huntElapsedSec,
    extractionBeacon,
    photoChallenge,
    caughtMap,
    infectedMap,
    infectionModeEnabled,
    players,
    syncedNowMs,
    matchWinner,
    matchWinReason,
    match?.endedAt,
  ]);

  useEffect(() => {
    if (showEventsModal) {
      setSeenEventsCount(matchEvents.length);
    }
  }, [showEventsModal, matchEvents.length]);

  const unreadEventsCount = showEventsModal
    ? 0
    : Math.max(0, matchEvents.length - seenEventsCount);

  const allHidersCaught = hadAnyHiders && hiderStats.activeHiders === 0;

  const eliminationCauseLabel = useMemo(() => {
    if (!myCaughtRecord) return '';
    if (myCaughtRecord.byPlayerId === 'storm') {
      return 'ELIMINADO POR LA TORMENTA';
    }
    if (myCaughtRecord.byPlayerId === 'anticheat') {
      return 'ELIMINADO · UBICACIÓN DESACTIVADA';
    }
    if (myCaughtRecord.byPlayerId === 'photo') {
      return 'ELIMINADO · SIN FOTO CON EL CAZADOR';
    }
    if (myCaughtRecord.byPlayerId === 'camp') {
      return 'ELIMINADO · QUIETUD EXCEDIDA';
    }
    const hunterName =
      players.find((p) => p.id === myCaughtRecord.byPlayerId)?.name ||
      'BUSCADOR';
    return `PILLADO POR ${hunterName.toUpperCase()}`;
  }, [myCaughtRecord, players]);

  const infectionCauseLabel = useMemo(() => {
    if (!myInfectedRecord) return '';
    const hunterName =
      players.find((p) => p.id === myInfectedRecord.byPlayerId)?.name ||
      'BUSCADOR';
    return `INFECTADO POR ${hunterName.toUpperCase()}`;
  }, [myInfectedRecord, players]);

  const handleCloseEliminationOverlay = () => {
    if (myCaughtRecord) {
      const seenKey = `baliza_elim_seen_${room.id}_${currentPlayerId}_${myCaughtRecord.at}`;
      shownEliminationKeysRef.current.add(seenKey);
      safeSessionSet(seenKey, '1');
    }
    setShowEliminationOverlay(false);
  };

  const handleCloseInfectionOverlay = () => {
    if (myInfectedRecord) {
      const seenKey = `baliza_inf_seen_${room.id}_${currentPlayerId}_${myInfectedRecord.at}`;
      shownInfectionKeysRef.current.add(seenKey);
      safeSessionSet(seenKey, '1');
    }
    setShowInfectionOverlay(false);
  };

  // Simulación local de bots en el mapa (solo activa en Modo Test Secreto sin DB)
  const botPlayerIds = useMemo(
    () => players.filter((p) => isBotPlayerId(p.id)).map((p) => p.id),
    [players]
  );

  isHuntPhaseRef.current = isHuntPhase;

  useEffect(() => {
    if (!sandboxUnlocked || botPlayerIds.length === 0) return;

    // Si estamos en escritorio sin GPS real, inicializar posición virtual en el centro de la zona
    if (!myPosRef.current) {
      const seedLat = activeZones[0]?.lat ?? VALENCIA_CENTER.lat;
      const seedLng = activeZones[0]?.lng ?? VALENCIA_CENTER.lng;
      setGpsError(null);
      setMyPos({ lat: seedLat, lng: seedLng, accuracy: 3 });
      setJoystickActive(true);
    }

    const tickBots = (nearAnchor = false) => {
      const activeBotIds = botPlayerIds.filter((id) => !caughtMapRef.current[id]);
      if (activeBotIds.length === 0) return;

      const anchor = myPosRef.current ?? {
        lat: snapshot.currentLat,
        lng: snapshot.currentLng,
      };
      const syncedNow = Date.now() + clockOffsetRef.current;
      const { nextVectors, payloads } = stepBotVectors(
        activeBotIds,
        botVectorsRef.current,
        anchor,
        { lat: snapshot.currentLat, lng: snapshot.currentLng },
        snapshot.currentRadius,
        1.1,
        nearAnchor,
        {
          roles: rolesRef.current,
          caughtMap: caughtMapRef.current,
          activeCloaks: activeCloaksRef.current,
          activeDecoys: activeDecoysRef.current,
          humanPos: myPosRef.current
            ? {
                id: currentPlayerId,
                lat: myPosRef.current.lat,
                lng: myPosRef.current.lng,
                isStill: isMyStealthStillRef.current,
                cloakActive: isMyCloakActiveRef.current,
              }
            : null,
          extractionBeacon: extractionBeaconRef.current,
          isHuntPhase: isHuntPhaseRef.current,
          nowMs: syncedNow,
        }
      );
      botVectorsRef.current = nextVectors;

      const mergedLocations: Record<string, PlayerLocationPayload> = {
        ...otherLocationsRef.current,
      };
      payloads.forEach((pl) => {
        mergedLocations[pl.playerId] = pl;
      });
      setOtherLocations(mergedLocations);

      if (canRecordRecapRef.current) {
        const tSec =
          (Date.now() + clockOffsetRef.current - recapAnchorMsRef.current) / 1000;
        payloads.forEach((pl) => {
          recordRecapPoint(pl.playerId, pl.lat, pl.lng, tSec);
        });
      }

      if (trailEnabled) {
        const cutoff = Date.now() - trailDurationSec * 1000;
        let updatedTrail = false;
        payloads.forEach((pl) => {
          const list = trailHistoryRef.current[pl.playerId] || [];
          const last = list[list.length - 1];
          if (!last || distanceMeters(last.lat, last.lng, pl.lat, pl.lng) >= 4) {
            trailHistoryRef.current[pl.playerId] = [
              ...list.filter((pt) => pt.at >= cutoff),
              { lat: pl.lat, lng: pl.lng, at: Date.now() },
            ].slice(-90);
            updatedTrail = true;
          }
        });
        if (updatedTrail) setTrailVersion((v) => v + 1);
      }

      // Captura / infección automática por parte de bots buscadores
      const realNow = Date.now();
      if (
        sandboxBotsAutoPlay &&
        isHuntPhaseRef.current &&
        !matchWinnerRef.current &&
        realNow - botStartAtMsRef.current > 3500 &&
        realNow - lastNearAnchorAtRef.current > 3000 &&
        realNow - lastBotCaptureAtRef.current > 4500
      ) {
        const autoHit = findBotAutoCapture({
          players: playersRef.current,
          roles: rolesRef.current,
          caughtMap: caughtMapRef.current,
          locations: mergedLocations,
          humanPlayer: myPosRef.current
            ? {
                id: currentPlayerId,
                lat: myPosRef.current.lat,
                lng: myPosRef.current.lng,
              }
            : null,
          captureRadiusM: 16,
        });
        if (autoHit) {
          lastBotCaptureAtRef.current = realNow;
          void onMarkCaught(autoHit.targetId, autoHit.seekerBotId);
          if (chatAllowed) {
            const msgPick = pickBotChatMessage({
              players: playersRef.current,
              roles: rolesRef.current,
              caughtMap: caughtMapRef.current,
              infectedMap: infectedMapRef.current,
              eventHint: 'catch',
              actorBotId: autoHit.seekerBotId,
              forceAllChannel: true,
            });
            if (msgPick) {
              void sendRoomChatMessage({
                roomId: room.id,
                roomCode: room.code,
                senderPlayerId: msgPick.bot.id,
                senderName: msgPick.bot.name,
                senderEmoji: msgPick.bot.emoji,
                senderRole: msgPick.role,
                channel: msgPick.channel,
                text: msgPick.text,
                forceLocal: true,
              });
            }
          }
        }
      }
    };

    tickBots(Object.keys(botVectorsRef.current).length === 0);
    if (!sandboxBotsMoving || matchWinner) return;

    const timer = window.setInterval(() => {
      tickBots(false);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [
    sandboxUnlocked,
    sandboxBotsMoving,
    sandboxBotsAutoPlay,
    botPlayerIds,
    matchWinner,
    snapshot.currentLat,
    snapshot.currentLng,
    snapshot.currentRadius,
    trailEnabled,
    trailDurationSec,
    currentPlayerId,
    chatAllowed,
    room.id,
    room.code,
  ]);

  // Chat y habilidades autónomas de los bots durante la partida en Sandbox
  useEffect(() => {
    if (
      !sandboxUnlocked ||
      !sandboxBotsAutoPlay ||
      botPlayerIds.length === 0 ||
      !hasMatchStarted ||
      isRoulettePhase ||
      matchWinner
    ) {
      return;
    }

    const chatTimer = window.setInterval(() => {
      if (!chatAllowed || matchWinnerRef.current) return;
      const msgPick = pickBotChatMessage({
        players: playersRef.current,
        roles: rolesRef.current,
        caughtMap: caughtMapRef.current,
        infectedMap: infectedMapRef.current,
        eventHint: Math.random() < 0.15 && isBeaconUnlocked ? 'beacon' : 'chatter',
      });
      if (!msgPick) return;
      void sendRoomChatMessage({
        roomId: room.id,
        roomCode: room.code,
        senderPlayerId: msgPick.bot.id,
        senderName: msgPick.bot.name,
        senderEmoji: msgPick.bot.emoji,
        senderRole: msgPick.role,
        channel: msgPick.channel,
        text: msgPick.text,
        forceLocal: true,
      });
    }, 11000);

    const abilityTimer = window.setInterval(() => {
      if (
        !abilitiesEnabled ||
        !isHuntPhaseRef.current ||
        matchWinnerRef.current ||
        !onActivateAbility
      ) {
        return;
      }
      const pick = pickBotAbilityAction({
        players: playersRef.current,
        roles: rolesRef.current,
        caughtMap: caughtMapRef.current,
        abilityUses: abilityUsesRef.current,
        abilitiesMax,
      });
      if (!pick) return;
      const botLoc =
        botVectorsRef.current[pick.botId] || otherLocationsRef.current[pick.botId];
      const coords = botLoc
        ? { lat: botLoc.lat, lng: botLoc.lng }
        : { lat: snapshot.currentLat, lng: snapshot.currentLng };
      void onActivateAbility(pick.kind, coords, pick.botId).then((ok) => {
        if (!ok) return;
        const label =
          pick.kind === 'decoy'
            ? '🎭 soltó un señuelo'
            : pick.kind === 'cloak'
            ? '🫥 activó silencio de radar'
            : pick.kind === 'sonar'
            ? '📡 lanzó un sonar'
            : '⚡ activó rastreo rápido';
        triggerAbilityToast(`${pick.botName} ${label}`);
        if (chatAllowed && Math.random() < 0.5) {
          void sendRoomChatMessage({
            roomId: room.id,
            roomCode: room.code,
            senderPlayerId: pick.botId,
            senderName: pick.botName,
            senderEmoji:
              playersRef.current.find((p) => p.id === pick.botId)?.emoji || '🤖',
            senderRole: pick.role,
            channel: 'all',
            text:
              pick.role === 'seeker'
                ? '📡 ¡Habilidad de rastreo activada!'
                : '🎭 ¡Señuelo / sigilo activado!',
            forceLocal: true,
          });
        }
      });
    }, 13500);

    return () => {
      window.clearInterval(chatTimer);
      window.clearInterval(abilityTimer);
    };
  }, [
    sandboxUnlocked,
    sandboxBotsAutoPlay,
    botPlayerIds.length,
    hasMatchStarted,
    isRoulettePhase,
    matchWinner,
    chatAllowed,
    abilitiesEnabled,
    abilitiesMax,
    isBeaconUnlocked,
    room.id,
    room.code,
    snapshot.currentLat,
    snapshot.currentLng,
  ]);

  // Participación automática de los bots en el Reto Foto
  useEffect(() => {
    if (
      !sandboxUnlocked ||
      !sandboxBotsAutoPlay ||
      !isPhotoChallengeActive ||
      !photoChallenge
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const botHiders = playersRef.current.filter(
        (p) =>
          isBotPlayerId(p.id) &&
          (rolesRef.current[p.id] ?? 'hider') === 'hider' &&
          !caughtMapRef.current[p.id]
      );
      botHiders.forEach((b, idx) => {
        if (!photoChallenge.completedBy?.[b.id]) {
          sendPhotoProofRef.current?.({
            challengeId: photoChallenge.id,
            playerId: b.id,
            playerName: b.name,
            dataUrl: '',
            at: new Date().toISOString(),
          });
          if (idx === 0) {
            void onSetPhotoChallengeStatus(photoChallenge.id, b.id, 'accepted');
          }
        }
      });
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [
    sandboxUnlocked,
    sandboxBotsAutoPlay,
    isPhotoChallengeActive,
    photoChallenge?.id,
  ]);

  const handleBringBotsNearMe = () => {
    const activeBotIds = botPlayerIds.filter((id) => !caughtMap[id]);
    if (activeBotIds.length === 0) return;
    lastNearAnchorAtRef.current = Date.now();
    const anchor = myPos ?? { lat: snapshot.currentLat, lng: snapshot.currentLng };
    const { nextVectors, payloads } = stepBotVectors(
      activeBotIds,
      botVectorsRef.current,
      anchor,
      { lat: snapshot.currentLat, lng: snapshot.currentLng },
      snapshot.currentRadius,
      1.0,
      true
    );
    botVectorsRef.current = nextVectors;
    setOtherLocations((prev) => {
      const next = { ...prev };
      payloads.forEach((pl) => {
        next[pl.playerId] = pl;
      });
      return next;
    });
  };

  const handleSandboxForceBotChat = async () => {
    const pick = pickBotChatMessage({
      players,
      roles: match?.roles || {},
      caughtMap,
      infectedMap,
      forceAllChannel: true,
    });
    if (!pick) return;
    await sendRoomChatMessage({
      roomId: room.id,
      roomCode: room.code,
      senderPlayerId: pick.bot.id,
      senderName: pick.bot.name,
      senderEmoji: pick.bot.emoji,
      senderRole: pick.role,
      channel: 'all',
      text: pick.text,
      forceLocal: true,
    });
    triggerAbilityToast(`💬 ${pick.bot.name}: "${pick.text}"`);
  };

  const handleSandboxForceBotAbility = async () => {
    if (!onActivateAbility) return;
    const pick = pickBotAbilityAction({
      players,
      roles: match?.roles || {},
      caughtMap,
      abilityUses: match?.abilityUses || {},
      abilitiesMax: Math.max(abilitiesMax, 99),
    });
    if (!pick) return;
    const botLoc =
      botVectorsRef.current[pick.botId] || otherLocations[pick.botId];
    const coords = botLoc
      ? { lat: botLoc.lat, lng: botLoc.lng }
      : myPos ?? { lat: snapshot.currentLat, lng: snapshot.currentLng };
    const ok = await onActivateAbility(pick.kind, coords, pick.botId);
    if (ok) {
      triggerAbilityToast(`🤖 ${pick.botName} usó ${pick.kind.toUpperCase()}`);
    }
  };

  const handleSandboxRunFeatureTests = async () => {
    setSandboxTestingBusy(true);
    try {
      const report = await runAllBalizaFeatureTests();
      setSandboxTestReport(report);
    } finally {
      setSandboxTestingBusy(false);
    }
  };

  // Caza por Objetivos (Contratos)
  const myContractTargetId =
    contractHuntEnabled && myRole === 'seeker'
      ? match?.contractTargets?.[currentPlayerId] ?? null
      : null;
  const myContractPlayer = myContractTargetId
    ? players.find((p) => p.id === myContractTargetId) ?? null
    : null;
  const myContractsCompleted = match?.contractsCompletedBy?.[currentPlayerId] ?? 0;

  // Señuelos y Habilidades activas
  const myAbilityUses = match?.abilityUses?.[currentPlayerId] ?? 0;
  const abilitiesRemaining = Math.max(0, abilitiesMax - myAbilityUses);
  const myCloakUntilMs = match?.activeCloaks?.[currentPlayerId]
    ? new Date(match.activeCloaks[currentPlayerId]).getTime()
    : 0;
  const isMyCloakActive = myCloakUntilMs > syncedNowMs;
  isMyStealthStillRef.current = isMyStealthStill;
  isMyCloakActiveRef.current = isMyCloakActive;
  const myCloakRemainingSec = Math.max(
    0,
    Math.ceil((myCloakUntilMs - syncedNowMs) / 1000)
  );
  const isQuickScanActive = quickScanUntilMs > syncedNowMs;

  const triggerAbilityToast = (msg: string) => {
    setAbilityToast(msg);
    window.setTimeout(() => {
      setAbilityToast((cur) => (cur === msg ? null : cur));
    }, 3600);
  };

  const handleUseAbility = async (
    kind: 'decoy' | 'cloak' | 'sonar' | 'scan'
  ) => {
    if (abilityBusy || !abilitiesEnabled || abilitiesRemaining <= 0) return;
    if ((kind === 'decoy' || kind === 'sonar') && !myPos) {
      triggerAbilityToast('Esperando señal GPS para activar habilidad.');
      return;
    }
    setAbilityBusy(true);
    try {
      const ok = onActivateAbility
        ? await onActivateAbility(
            kind,
            myPos ? { lat: myPos.lat, lng: myPos.lng } : undefined
          )
        : true;
      if (!ok) return;
      recordAbilityUsed();
      triggerHaptic([24, 30, 24]);

      if (kind === 'decoy') {
        usedAbilityKindsRef.current.decoy = true;
        triggerAbilityToast('🎭 Señuelo desplegado (25 s).');
      } else if (kind === 'cloak') {
        usedAbilityKindsRef.current.cloak = true;
        triggerAbilityToast('🫥 Silencio de radar activo (20 s).');
      } else if (kind === 'sonar') {
        lastTechAbilityAtMsRef.current = Date.now();
        if (myPos) {
          const now = Date.now();
          const range = Math.max(250, radarRangeM);
          const cloaks = match?.activeCloaks || {};
          const found: Array<{
            playerId: string;
            name: string;
            lat: number;
            lng: number;
            atMs: number;
          }> = [];
          players.forEach((p) => {
            if ((match?.roles?.[p.id] ?? 'hider') !== 'hider' || caughtMap[p.id]) {
              return;
            }
            const cloakUntil = cloaks[p.id] ? new Date(cloaks[p.id]).getTime() : 0;
            if (cloakUntil > syncedNowMs) return;
            const loc = otherLocations[p.id];
            if (!loc || now - loc.updatedAt > 40000) return;
            if (distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng) <= range) {
              found.push({
                playerId: p.id,
                name: p.name,
                lat: loc.lat,
                lng: loc.lng,
                atMs: now,
              });
            }
          });
          (match?.activeDecoys || [])
            .filter((d) => new Date(d.expiresAt).getTime() > syncedNowMs)
            .forEach((d) => {
              if (distanceMeters(myPos.lat, myPos.lng, d.lat, d.lng) <= range) {
                found.push({
                  playerId: d.id,
                  name: d.label,
                  lat: d.lat,
                  lng: d.lng,
                  atMs: now,
                });
              }
            });
          radarSweepOriginsRef.current = [{ lat: myPos.lat, lng: myPos.lng }];
          radarSweepStartMsRef.current = now;
          setRadarBlips(found);
          playRadarSweepPing(found.length);
          triggerAbilityToast(
            found.length > 0
              ? `📡 Sonar detectó ${found.length} señal(es) en ${range}m.`
              : `📡 Sonar sin señales en ${range}m.`
          );
        }
      } else if (kind === 'scan') {
        lastTechAbilityAtMsRef.current = Date.now();
        setQuickScanUntilMs(syncedNowMs + 7000);
        playRadarSweepPing(1);
        triggerAbilityToast('⚡ Rastreo rápido activo (7 s).');
      }
    } finally {
      setAbilityBusy(false);
    }
  };

  // Orientación del móvil para Brújula táctica y Modo Bolsillo
  useEffect(() => {
    if (!pocketCompassOn) {
      setDeviceHeadingDeg(null);
      return;
    }
    const handleOrientation = (ev: DeviceOrientationEvent) => {
      const webkitHeading = (ev as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      }).webkitCompassHeading;
      if (typeof webkitHeading === 'number' && !Number.isNaN(webkitHeading)) {
        setDeviceHeadingDeg(webkitHeading);
        return;
      }
      if (typeof ev.alpha === 'number' && !Number.isNaN(ev.alpha)) {
        setDeviceHeadingDeg((360 - ev.alpha) % 360);
      }
    };
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener);
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [pocketCompassOn]);

  const handleTogglePocketCompass = async () => {
    const next = !pocketCompassOn;
    if (next) {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          await DOE.requestPermission();
        } catch {
          // Seguir usando cálculo relativo al norte si deniega giroscopio
        }
      }
    }
    setPocketCompassOn(next);
  };

  const pocketCompassTarget = useMemo(() => {
    if (!myPos) return null;
    const now = Date.now();
    if (myRole === 'hider') {
      if (isInStorm) {
        const exitPt = getClosestSafePoint(
          snapshot.currentLat,
          snapshot.currentLng,
          snapshot.currentRadius,
          myPos.lat,
          myPos.lng
        );
        return { label: 'Salida de tormenta', lat: exitPt.lat, lng: exitPt.lng };
      }
      if (extractionBeacon && isHuntPhase) {
        return {
          label: isBeaconUnlocked ? 'Baliza activa' : 'Baliza verde',
          lat: extractionBeacon.lat,
          lng: extractionBeacon.lng,
        };
      }
      return {
        label: 'Centro seguro',
        lat: snapshot.currentLat,
        lng: snapshot.currentLng,
      };
    }

    // Buscador: prioriza Contrato si hay posición visible/rastreo, si no blip de radar o fugitivo expuesto
    const cloaks = match?.activeCloaks || {};
    if (myContractPlayer && !caughtMap[myContractPlayer.id]) {
      const cloakUntil = cloaks[myContractPlayer.id]
        ? new Date(cloaks[myContractPlayer.id]).getTime()
        : 0;
      const loc = otherLocations[myContractPlayer.id];
      const isVisible =
        loc &&
        now - loc.updatedAt <= 40000 &&
        cloakUntil <= syncedNowMs &&
        (isQuickScanActive ||
          seekersCanSeeHiders ||
          loc.stormExposed ||
          loc.campExposed ||
          (classicHintsEnabled && classicHintRevealUntilMs > now));
      if (isVisible && loc) {
        return {
          label: `🎯 ${myContractPlayer.name}`,
          lat: loc.lat,
          lng: loc.lng,
        };
      }
    }

    if (radarBlips.length > 0) {
      let bestBlip = radarBlips[0];
      let bestDist = Infinity;
      radarBlips.forEach((b) => {
        const d = distanceMeters(myPos.lat, myPos.lng, b.lat, b.lng);
        if (d < bestDist) {
          bestDist = d;
          bestBlip = b;
        }
      });
      return { label: `📡 ${bestBlip.name}`, lat: bestBlip.lat, lng: bestBlip.lng };
    }

    if (isQuickScanActive || seekersCanSeeHiders) {
      let bestP: { name: string; lat: number; lng: number } | null = null;
      let bestDist = Infinity;
      players.forEach((p) => {
        if ((match?.roles?.[p.id] ?? 'hider') !== 'hider' || caughtMap[p.id]) return;
        const cloakUntil = cloaks[p.id] ? new Date(cloaks[p.id]).getTime() : 0;
        if (cloakUntil > syncedNowMs) return;
        const loc = otherLocations[p.id];
        if (!loc || now - loc.updatedAt > 40000) return;
        const d = distanceMeters(myPos.lat, myPos.lng, loc.lat, loc.lng);
        if (d < bestDist) {
          bestDist = d;
          bestP = { name: p.name, lat: loc.lat, lng: loc.lng };
        }
      });
      if (bestP) return bestP;
    }

    if (extractionBeacon && isBeaconUnlocked) {
      return {
        label: 'Vigilar Baliza',
        lat: extractionBeacon.lat,
        lng: extractionBeacon.lng,
      };
    }

    return {
      label: 'Centro de zona',
      lat: snapshot.currentLat,
      lng: snapshot.currentLng,
    };
  }, [
    myPos,
    myRole,
    isInStorm,
    snapshot.currentLat,
    snapshot.currentLng,
    snapshot.currentRadius,
    extractionBeacon,
    isHuntPhase,
    isBeaconUnlocked,
    match?.activeCloaks,
    match?.roles,
    myContractPlayer,
    caughtMap,
    otherLocations,
    syncedNowMs,
    isQuickScanActive,
    seekersCanSeeHiders,
    classicHintsEnabled,
    classicHintRevealUntilMs,
    radarBlips,
    players,
  ]);

  const pocketGuidance = useMemo(() => {
    if (!myPos || !pocketCompassTarget) return null;
    const distM = Math.round(
      distanceMeters(
        myPos.lat,
        myPos.lng,
        pocketCompassTarget.lat,
        pocketCompassTarget.lng
      )
    );
    const bearingDeg = computeBearingDeg(
      myPos.lat,
      myPos.lng,
      pocketCompassTarget.lat,
      pocketCompassTarget.lng
    );
    const relDeg = normalizeRelativeAngleDeg(bearingDeg, deviceHeadingDeg);
    const isAligned =
      deviceHeadingDeg !== null ? Math.abs(relDeg) <= 28 : true;
    const pulse = getPocketPulseSpec(distM, isAligned);
    return {
      label: pocketCompassTarget.label,
      distM,
      bearingDeg,
      cardinal: getCardinalLabel(bearingDeg),
      relDeg,
      isAligned,
      pulse,
    };
  }, [myPos, pocketCompassTarget, deviceHeadingDeg]);

  const pocketGuidanceRef = useRef(pocketGuidance);
  pocketGuidanceRef.current = pocketGuidance;
  const pocketVoiceRef = useRef(pocketVoiceOn);
  pocketVoiceRef.current = pocketVoiceOn;

  // Cadencia háptica y voz opcional en Modo Bolsillo
  useEffect(() => {
    if (!pocketCompassOn || matchWinner || myCaughtRecord) return;
    let timerId = 0;
    let cancelled = false;

    const tickPulse = () => {
      if (cancelled) return;
      const g = pocketGuidanceRef.current;
      let nextDelay = 3000;
      if (g) {
        triggerHaptic(g.pulse.pattern);
        nextDelay = g.pulse.intervalMs;
        if (
          pocketVoiceRef.current &&
          Date.now() - lastPocketVoiceAtRef.current >= 12000
        ) {
          lastPocketVoiceAtRef.current = Date.now();
          speakPocketCue(`${g.label} a ${g.distM} metros, rumbo ${g.cardinal}`);
        }
      }
      timerId = window.setTimeout(tickPulse, nextDelay);
    };

    timerId = window.setTimeout(tickPulse, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [pocketCompassOn, matchWinner, myCaughtRecord]);

  return (
    <div className="fixed inset-0 z-30 flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-100">
      {/* Mapa a pantalla completa */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-0 h-full w-full"
        aria-label="Mapa en vivo de la partida"
      />

      {/* Cabecera flotante mínima (prioridad total al mapa) */}
      <header className="pointer-events-none relative z-20 px-2.5 pt-2.5 sm:px-5 sm:pt-3.5">
        <div className="pointer-events-auto mx-auto max-w-2xl space-y-1.5">
          {/* Barra superior compacta de 1 sola línea */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur-md">
            {/* Rol + libres */}
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  myCaughtRecord
                    ? 'bg-slate-900 text-white'
                    : myInfectedRecord
                    ? 'bg-emerald-600 text-white'
                    : myRole === 'seeker'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {myCaughtRecord ? (
                  <PixelSkull className="h-4 w-4" />
                ) : myRole === 'seeker' ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex items-baseline gap-1.5">
                <h1 className="font-display truncate text-xs sm:text-sm font-bold text-slate-900">
                  {myCaughtRecord
                    ? 'Espectador'
                    : myInfectedRecord
                    ? 'Infectado'
                    : myRole === 'seeker'
                    ? 'Buscador'
                    : 'Fugitivo'}
                </h1>
                <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums shrink-0">
                  · {hiderStats.activeHiders}/{hiderStats.totalHiders}
                </span>
              </div>
            </div>

            {/* Reloj, Zona y Eventos */}
            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
              {isHuntPhase && timeVictoryEnabled && (
                <span
                  className={`font-mono text-xs sm:text-sm font-bold tabular-nums ${
                    roundRemainingSec <= 30 && !matchWinner
                      ? 'text-rose-600 animate-pulse'
                      : 'text-slate-900'
                  }`}
                  title={myRole === 'hider' ? 'Tiempo para ganar' : 'Tiempo restante'}
                >
                  {formatDurationSec(roundRemainingSec)}
                </span>
              )}

              <span className="font-mono text-[11px] sm:text-xs font-semibold tabular-nums text-violet-700">
                {isHidePhase
                  ? `Escondite ${Math.ceil(hideRemainingSec)}s`
                  : snapshot.stage === 'final'
                  ? `Final · ${formatRadius(snapshot.currentRadius)}`
                  : `Z${snapshot.phaseIndex + 1} · ${formatDurationSec(
                      snapshot.remainingSec
                    )} · ${formatRadius(snapshot.currentRadius)}`}
              </span>

              <button
                type="button"
                onClick={() => {
                  setShowMapTools(false);
                  setShowEventsModal(true);
                }}
                aria-label={`Ver historial de eventos (${matchEvents.length})`}
                title="Historial de eventos"
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                {unreadEventsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white">
                    {unreadEventsCount > 9 ? '9+' : unreadEventsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Única franja prioritaria: muestra solo lo más urgente sin tapar el mapa */}
          {matchWinner && resultDismissed ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm backdrop-blur-xs"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                <span>
                  {matchWinner === 'hiders'
                    ? '¡Ganan los Fugitivos!'
                    : '¡Ganan los Buscadores!'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setResultDismissed(false)}
                className="min-h-[28px] rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800 shrink-0"
              >
                Ver resultado
              </button>
            </div>
          ) : !myCaughtRecord && isInStorm && stormOverflowMeters !== null ? (
            <div
              role="alert"
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-sm ${
                isStormExposed ? 'bg-rose-600' : 'bg-violet-600'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {isStormExposed
                    ? `Fuera de zona · Visible · ${Math.ceil(stormGraceRemainingSec)}s`
                    : `Vuelve a la zona en ${Math.ceil(stormGraceRemainingSec)}s`}
                </span>
              </span>
              <span className="font-mono tabular-nums shrink-0">
                +{Math.round(stormOverflowMeters)}m
              </span>
            </div>
          ) : locationTamperingPlayers.length > 0 ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <MapPinOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {locationTamperingPlayers.map((p) => p.name).join(', ')} apagó su GPS
              </span>
            </div>
          ) : allHidersCaught && (!matchWinner || !resultWaitDone) ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {matchWinner
                  ? `Fin de cacería · Resultado en ${
                      waitDeadlineMsRef.current
                        ? Math.max(
                            1,
                            Math.ceil((waitDeadlineMsRef.current - nowMs) / 1000)
                          )
                        : 1
                    }s...`
                  : 'Calculando resultado...'}
              </span>
            </div>
          ) : isPhotoChallengeActive && photoChallenge ? (
            <div
              role="status"
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm ${
                myRole === 'hider' && !myCaughtRecord && myPhotoStatus !== 'accepted'
                  ? 'border border-amber-200 bg-amber-50/95 text-amber-950'
                  : 'border border-slate-200 bg-white/95 text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {myRole === 'seeker'
                    ? `Reto foto · ${Math.ceil(photoChallengeRemainingSec)}s`
                    : myPhotoStatus === 'accepted'
                    ? `Foto enviada (${Math.ceil(photoChallengeRemainingSec)}s)`
                    : myPhotoStatus === 'rejected'
                    ? `Foto rechazada · Repítela (${Math.ceil(photoChallengeRemainingSec)}s)`
                    : `Selfie con cazador (${Math.ceil(photoChallengeRemainingSec)}s)`}
                </span>
              </span>

              {myRole === 'hider' &&
                !myCaughtRecord &&
                myPhotoStatus !== 'accepted' && (
                  <label className="inline-flex min-h-[28px] cursor-pointer items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800 shrink-0">
                    <Camera className="h-3 w-3" aria-hidden="true" />
                    <span>{photoUploading ? 'Subiendo...' : 'Hacer foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      disabled={photoUploading}
                      className="sr-only"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file || !photoChallenge) return;
                        setPhotoUploading(true);
                        try {
                          const dataUrl = await compressSelfieFile(file);
                          const proof: PhotoProofPayload = {
                            challengeId: photoChallenge.id,
                            playerId: currentPlayerId,
                            playerName: currentPlayer?.name || 'Jugador',
                            dataUrl,
                            at: new Date().toISOString(),
                          };
                          setPhotoProofs((prev) => ({
                            ...prev,
                            [`${proof.challengeId}:${proof.playerId}`]: proof,
                          }));
                          sendPhotoProofRef.current?.(proof);
                          await onSetPhotoChallengeStatus(
                            photoChallenge.id,
                            currentPlayerId,
                            'accepted'
                          );
                        } finally {
                          setPhotoUploading(false);
                        }
                      }}
                    />
                  </label>
                )}

              {myRole === 'seeker' && (
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(true)}
                  className="min-h-[28px] rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800 shrink-0"
                >
                  Fotos (
                  {
                    Object.values(photoChallenge.completedBy || {}).filter(
                      (s) => s.status === 'accepted'
                    ).length
                  }
                  /{hiderStats.activeHiders})
                </button>
              )}
            </div>
          ) : !matchWinner && isHuntPhase && isCapturingBeacon ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Activando baliza... aguanta {Math.ceil(beaconHoldRemainingSec)}s
                </span>
              </span>
            </div>
          ) : isHidePhase && myRole === 'hider' ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>¡Escóndete antes de que salgan!</span>
              </span>
              <span className="font-mono font-bold tabular-nums shrink-0">
                {Math.ceil(hideRemainingSec)}s
              </span>
            </div>
          ) : captureToast || abilityToast ? (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <PixelSkull className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{captureToast || abilityToast}</span>
            </div>
          ) : antiCampWarningSec !== null || isMyCampExposed ? (
            <div
              role="alert"
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm ${
                isMyCampExposed
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-400 text-slate-950'
              }`}
            >
              <span>
                🚨{' '}
                {isMyCampExposed
                  ? antiCampEliminate
                    ? 'Eliminado por quedarte quieto'
                    : 'Visible en el mapa por quedarte quieto'
                  : antiCampEliminate
                  ? `¡No pares! Muévete en ${antiCampWarningSec}s o serás eliminado`
                  : `Muévete en ${antiCampWarningSec}s o aparecerás en el mapa`}
              </span>
            </div>
          ) : !matchWinner && contractHuntEnabled && myRole === 'seeker' && myContractPlayer ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-1.5 text-xs font-semibold text-rose-950 shadow-sm"
            >
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <Target className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                <span className="truncate">
                  Objetivo: {myContractPlayer.emoji} {myContractPlayer.name}
                </span>
              </span>
              {myContractsCompleted > 0 && (
                <span className="font-mono text-[11px] font-bold text-rose-700 shrink-0">
                  {myContractsCompleted} {myContractsCompleted === 1 ? 'hecho' : 'hechos'}
                </span>
              )}
            </div>
          ) : !matchWinner && isHuntPhase && isBeaconUnlocked && extractionBeacon ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/95 px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm"
            >
              <span className="flex items-center gap-1.5 truncate">
                <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="truncate">
                  {myRole === 'hider'
                    ? `Baliza activa · aguanta ${beaconHoldSec}s dentro`
                    : 'Baliza activa · vigila el punto verde'}
                </span>
              </span>
              {beaconDistanceMeters !== null && (
                <span className="font-mono tabular-nums shrink-0">
                  {Math.round(beaconDistanceMeters)}m
                </span>
              )}
            </div>
          ) : !matchWinner && isHuntPhase && classicHintsEnabled && classicHintRevealUntilMs > nowMs ? (
            <div
              role="status"
              className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <span>🧭</span>
              <span className="truncate">
                {classicHintLabel ||
                  `Posición visible (${Math.max(
                    1,
                    Math.ceil((classicHintRevealUntilMs - nowMs) / 1000)
                  )}s)`}
              </span>
            </div>
          ) : !matchWinner && isHuntPhase && isPanicActive ? (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <span>⚡ Recta final</span>
              {myRole === 'seeker' && panicTargetDistM !== null && (
                <span className="font-mono tabular-nums">
                  {panicTargetDistM}m
                </span>
              )}
            </div>
          ) : !matchWinner && isHuntPhase && hotColdInfo ? (
            <div
              role="status"
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-semibold shadow-sm ${
                hotColdInfo.tone === 'hot'
                  ? 'bg-rose-600 text-white'
                  : hotColdInfo.tone === 'warm'
                  ? 'bg-amber-400 text-slate-950'
                  : 'border border-slate-200 bg-white/95 text-slate-800'
              }`}
            >
              <span aria-hidden="true">
                {hotColdInfo.tone === 'cold' ? '❄️' : '🌡️'}
              </span>
              <span>{hotColdInfo.label}</span>
            </div>
          ) : null}

          {/* Brújula táctica (solo si el usuario la enciende) */}
          {pocketCompassOn && pocketGuidance && !matchWinner && !myCaughtRecord && (
            <div
              role="status"
              className="flex items-center justify-between gap-2.5 rounded-xl bg-slate-900/95 px-3 py-1.5 text-xs text-white shadow-md backdrop-blur-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                  <Navigation
                    className="h-3.5 w-3.5 transition-transform duration-150"
                    style={{
                      transform: `rotate(${Math.round(pocketGuidance.relDeg)}deg)`,
                    }}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0 flex items-baseline gap-1.5">
                  <span className="truncate font-semibold">{pocketGuidance.label}</span>
                  <span className="font-mono text-[11px] text-slate-300 tabular-nums shrink-0">
                    · {pocketGuidance.distM}m {pocketGuidance.cardinal}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPocketVoiceOn((v) => !v)}
                  aria-label={
                    pocketVoiceOn ? 'Silenciar voz' : 'Activar avisos por voz'
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                >
                  {pocketVoiceOn ? (
                    <Volume2 className="h-3.5 w-3.5" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPocketCompassOn(false)}
                  aria-label="Desactivar brújula"
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {gpsError && activeTab === 'map' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-xs">
              {gpsError}
            </div>
          )}
        </div>
      </header>

      {/* Controles flotantes del mapa en zona de pulgar */}
      <div className="pointer-events-none relative z-10 flex-1">
        {activeTab === 'map' && (
          <>
            {/* Esquina inferior izquierda: Habilidades, Captura y/o Joystick */}
            <div className="pointer-events-auto absolute left-3 bottom-3 sm:left-5 sm:bottom-4 z-20 flex flex-col items-start gap-2">
              {myRole === 'seeker' && !allHidersCaught && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMapTools(false);
                    setActiveTab('players');
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-rose-700"
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {infectionModeEnabled ? 'Infectar' : 'Capturar'} (
                    {hiderStats.activeHiders})
                  </span>
                </button>
              )}

              {!matchWinner &&
                isHuntPhase &&
                !myCaughtRecord &&
                abilitiesEnabled &&
                !(allowTestJoystick && joystickActive) && (
                  <div className="flex items-center gap-1.5">
                    {myRole === 'hider' ? (
                      <>
                        <button
                          type="button"
                          disabled={abilityBusy || abilitiesRemaining <= 0}
                          onClick={() => void handleUseAbility('decoy')}
                          title={`Colocar señuelo (${abilitiesRemaining}/${abilitiesMax})`}
                          className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-violet-200 bg-white/95 px-3 text-xs font-semibold text-violet-900 shadow-md backdrop-blur-xs hover:bg-violet-50 disabled:opacity-45"
                        >
                          <span>🎭 Señuelo</span>
                          <span className="font-mono text-[10px] text-violet-600 tabular-nums">
                            ({abilitiesRemaining})
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={abilityBusy || abilitiesRemaining <= 0 || isMyCloakActive}
                          onClick={() => void handleUseAbility('cloak')}
                          title="Ocultarse del radar y pistas"
                          className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-sky-200 bg-white/95 px-3 text-xs font-semibold text-sky-900 shadow-md backdrop-blur-xs hover:bg-sky-50 disabled:opacity-45"
                        >
                          <span>
                            {isMyCloakActive ? `🫥 ${myCloakRemainingSec}s` : '🫥 Silencio'}
                          </span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={abilityBusy || abilitiesRemaining <= 0}
                          onClick={() => void handleUseAbility('sonar')}
                          title={`Lanzar sonar (${abilitiesRemaining}/${abilitiesMax})`}
                          className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-rose-200 bg-white/95 px-3 text-xs font-semibold text-rose-900 shadow-md backdrop-blur-xs hover:bg-rose-50 disabled:opacity-45"
                        >
                          <span>📡 Sonar</span>
                          <span className="font-mono text-[10px] text-rose-600 tabular-nums">
                            ({abilitiesRemaining})
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={abilityBusy || abilitiesRemaining <= 0 || isQuickScanActive}
                          onClick={() => void handleUseAbility('scan')}
                          title="Rastreo rápido"
                          className="inline-flex min-h-[42px] items-center gap-1 rounded-xl border border-amber-200 bg-white/95 px-3 text-xs font-semibold text-amber-900 shadow-md backdrop-blur-xs hover:bg-amber-50 disabled:opacity-45"
                        >
                          <span>
                            {isQuickScanActive ? '⚡ Rastreando...' : '⚡ Rastreo'}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}

              {allowTestJoystick && joystickActive && (
                <VirtualJoystick
                  initialSpeedId={testJoystickDefaultSpeed}
                  followMap={joystickFollowMap}
                  onToggleFollowMap={() => setJoystickFollowMap((v) => !v)}
                  onMove={handleJoystickMove}
                  onClose={handleToggleJoystick}
                />
              )}
            </div>

            {/* Esquina inferior derecha: 4 botones esenciales + cajón de herramientas */}
            <div className="pointer-events-auto absolute right-3 bottom-3 sm:right-5 sm:bottom-4 z-20 flex flex-col items-end gap-2">
              {showMapTools && (
                <div className="w-60 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-md space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-display font-bold text-slate-900">
                      Herramientas del mapa
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMapTools(false)}
                      aria-label="Cerrar herramientas"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Controles rápidos */}
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        void handleTogglePocketCompass();
                        setShowMapTools(false);
                      }}
                      className={`flex w-full min-h-[38px] items-center justify-between rounded-xl border px-3 font-semibold transition-colors ${
                        pocketCompassOn
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Brújula y vibración</span>
                      </span>
                      <span className="text-[10px] opacity-80">
                        {pocketCompassOn ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {allowTestJoystick && (
                      <button
                        type="button"
                        onClick={() => {
                          handleToggleJoystick();
                          setShowMapTools(false);
                        }}
                        className={`flex w-full min-h-[38px] items-center justify-between rounded-xl border px-3 font-semibold transition-colors ${
                          joystickActive
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Mando virtual</span>
                        </span>
                        <span className="text-[10px] opacity-80">
                          {joystickActive ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    )}

                    {/* Zoom accesible dentro de herramientas para móvil */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleZoom(1)}
                        className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Acercar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleZoom(-1)}
                        className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Alejar</span>
                      </button>
                    </div>

                    {abilitiesEnabled &&
                      isHuntPhase &&
                      !myCaughtRecord &&
                      allowTestJoystick &&
                      joystickActive && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-100">
                          {myRole === 'hider' ? (
                            <>
                              <button
                                type="button"
                                disabled={abilityBusy || abilitiesRemaining <= 0}
                                onClick={() => void handleUseAbility('decoy')}
                                className="min-h-[36px] rounded-xl border border-violet-200 bg-violet-50 px-2 font-semibold text-violet-900 disabled:opacity-45"
                              >
                                🎭 Señuelo ({abilitiesRemaining})
                              </button>
                              <button
                                type="button"
                                disabled={abilityBusy || abilitiesRemaining <= 0 || isMyCloakActive}
                                onClick={() => void handleUseAbility('cloak')}
                                className="min-h-[36px] rounded-xl border border-sky-200 bg-sky-50 px-2 font-semibold text-sky-900 disabled:opacity-45"
                              >
                                {isMyCloakActive ? `🫥 ${myCloakRemainingSec}s` : '🫥 Silencio'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={abilityBusy || abilitiesRemaining <= 0}
                                onClick={() => void handleUseAbility('sonar')}
                                className="min-h-[36px] rounded-xl border border-rose-200 bg-rose-50 px-2 font-semibold text-rose-900 disabled:opacity-45"
                              >
                                📡 Sonar ({abilitiesRemaining})
                              </button>
                              <button
                                type="button"
                                disabled={abilityBusy || abilitiesRemaining <= 0 || isQuickScanActive}
                                onClick={() => void handleUseAbility('scan')}
                                className="min-h-[36px] rounded-xl border border-amber-200 bg-amber-50 px-2 font-semibold text-amber-900 disabled:opacity-45"
                              >
                                {isQuickScanActive ? '⚡ Activo' : '⚡ Rastreo'}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                    {sandboxUnlocked && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMapTools(false);
                          setShowSandboxModal(true);
                        }}
                        className="flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 font-semibold text-white hover:bg-violet-700"
                      >
                        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Laboratorio Solo</span>
                      </button>
                    )}
                  </div>

                  {/* Estado resumido de modificadores y baliza sin saturar el mapa */}
                  {(extractionBeacon ||
                    fogEnabled ||
                    radarEnabled ||
                    trailEnabled ||
                    isMyStealthStill ||
                    classicHintsEnabled) && (
                    <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-600 space-y-1">
                      {extractionBeacon && !isBeaconUnlocked && isHuntPhase && (
                        <p className="font-medium text-slate-700">
                          🚩 Baliza en{' '}
                          <span className="font-mono tabular-nums">
                            {formatDurationSec(beaconUnlockRemainingSec)}
                          </span>
                          {beaconDistanceMeters !== null
                            ? ` · ${Math.round(beaconDistanceMeters)}m`
                            : ''}
                        </p>
                      )}
                      {classicHintsEnabled && isHuntPhase && (
                        <p>
                          🧭 Próxima pista:{' '}
                          <span className="font-mono tabular-nums">
                            {Math.max(
                              1,
                              Math.ceil(
                                classicHintIntervalSec -
                                  (huntElapsedSec % classicHintIntervalSec)
                              )
                            )}
                            s
                          </span>
                        </p>
                      )}
                      <p className="text-slate-500">
                        {[
                          fogEnabled ? `🌫️ Niebla ${fogRadiusM}m` : null,
                          radarEnabled ? `📡 Radar ${radarIntervalSec}s` : null,
                          trailEnabled ? `👣 Rastro ${trailDurationSec}s` : null,
                          isMyStealthStill ? '🥷 Sigilo activo' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Zoom directo solo en pantallas medianas/grandes sin gesto táctil */}
              <div className="hidden sm:flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-md divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => handleZoom(1)}
                  aria-label="Acercar mapa"
                  className="flex h-9 w-11 items-center justify-center text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(-1)}
                  aria-label="Alejar mapa"
                  className="flex h-9 w-11 items-center justify-center text-slate-700 hover:bg-slate-50"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowMapTools((v) => !v)}
                aria-label="Abrir herramientas del mapa"
                aria-expanded={showMapTools}
                title="Herramientas del mapa"
                className={`relative flex h-11 w-11 items-center justify-center rounded-xl border shadow-md transition-colors ${
                  showMapTools || pocketCompassOn || joystickActive
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white/95 text-slate-700 hover:bg-white'
                }`}
              >
                <SlidersHorizontal className="h-5 w-5" />
                {sandboxUnlocked && !showMapTools && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-violet-500" />
                )}
              </button>

              {chatAllowed && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMapTools(false);
                    setShowChatDrawer(true);
                  }}
                  aria-label="Abrir chat de partida"
                  title="Chat de sala"
                  className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-md hover:bg-white"
                >
                  <MessageSquare className="h-5 w-5" />
                  {unreadChatCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 font-mono text-[10px] font-bold text-white">
                      {unreadChatCount > 9 ? '9+' : unreadChatCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleCenterZone}
                aria-label="Centrar en la zona segura"
                title="Ver zona segura"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-violet-600 shadow-md hover:bg-white"
              >
                <Target className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={handleCenterMyGps}
                aria-label="Centrar en mi ubicación"
                title="Mi ubicación"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md hover:bg-emerald-700"
              >
                <LocateFixed className="h-5 w-5" />
              </button>
            </div>
          </>
        )}

        {/* Paneles de las pestañas inferiores */}
        {activeTab !== 'map' && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 top-2 flex items-end justify-center px-2 sm:px-4 pb-2">
            <section
              aria-label={
                activeTab === 'players'
                  ? 'Jugadores en partida'
                  : activeTab === 'storm'
                  ? 'Fases de tormenta'
                  : 'Opciones de partida'
              }
              className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    {activeTab === 'players'
                      ? `Jugadores (${players.length})`
                      : activeTab === 'storm'
                      ? 'Zonas de tormenta'
                      : 'Opciones'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeTab === 'players'
                      ? infectionModeEnabled && infectedCount > 0
                        ? `${hiderStats.activeHiders} fugitivos libres · ${infectedCount} infectados`
                        : `${hiderStats.activeHiders} de ${hiderStats.totalHiders} fugitivos libres`
                      : activeTab === 'storm'
                      ? `Tiempo restante: ${formatDurationSec(roundRemainingSec)}`
                      : `Sala ${room.code} · ${room.rules.roundDuration} min`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('map')}
                  aria-label="Volver al mapa"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="overflow-y-auto">
                {/* PESTAÑA JUGADORES */}
                {activeTab === 'players' && (
                  <ul className="divide-y divide-slate-100">
                    {players.map((p) => {
                      const isSelf = p.id === currentPlayerId;
                      const pRole = match?.roles?.[p.id] ?? 'hider';
                      const caughtInfo = caughtMap[p.id];
                      const infectedInfo = infectedMap[p.id];
                      const catcherName =
                        caughtInfo &&
                        caughtInfo.byPlayerId !== 'storm' &&
                        caughtInfo.byPlayerId !== 'anticheat' &&
                        caughtInfo.byPlayerId !== 'photo' &&
                        caughtInfo.byPlayerId !== 'camp'
                          ? players.find((x) => x.id === caughtInfo.byPlayerId)
                              ?.name || 'Buscador'
                          : null;
                      const infectorName = infectedInfo
                        ? players.find((x) => x.id === infectedInfo.byPlayerId)
                            ?.name || 'Buscador'
                        : null;
                      const loc = otherLocations[p.id];
                      const otherExposed = Boolean(
                        !caughtInfo &&
                          loc &&
                          Date.now() - loc.updatedAt <= 35000 &&
                          loc.stormExposed
                      );
                      const otherLocOff = Boolean(
                        locationGuardEnabled &&
                          !caughtInfo &&
                          ((isSelf &&
                            (myLocationStatus === 'disabled' || Boolean(gpsError))) ||
                            (!isSelf &&
                              (peerLocationStatuses[p.id] === 'disabled' ||
                                (loc &&
                                  Date.now() - loc.updatedAt <= 45000 &&
                                  loc.locationDisabled))))
                      );
                      const seekerCanCatchThis =
                        myRole === 'seeker' &&
                        !isSelf &&
                        pRole === 'hider' &&
                        !caughtInfo;
                      const hiderCanReportSelf =
                        isSelf && myRole === 'hider' && !caughtInfo;

                      const pCosmetics = effectivePlayerCosmetics[p.id];

                      return (
                        <li
                          key={p.id}
                          className={`px-4 py-3 space-y-2 ${
                            caughtInfo ? 'bg-slate-50/70' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <PlayerAvatar
                                emoji={p.emoji}
                                color={p.color}
                                size="sm"
                                name={p.name}
                                eliminated={Boolean(caughtInfo)}
                                avatarEffectId={pCosmetics?.avatarEffectId}
                              />
                              <div className="min-w-0">
                                <PlayerCosmeticName
                                  name={p.name}
                                  cosmetics={pCosmetics}
                                  eliminated={Boolean(caughtInfo)}
                                  compactTitle
                                />
                                <p className="text-xs text-slate-500">
                                  {p.is_host && (
                                    <span className="inline-flex items-center gap-0.5 text-amber-600 mr-1.5">
                                      <Crown className="h-3 w-3" aria-hidden="true" />
                                      Anfitrión ·
                                    </span>
                                  )}
                                  {isSelf && (
                                    <span className="font-medium text-emerald-700 mr-1.5">
                                      Tú ({myRole === 'seeker' ? 'Buscador' : 'Fugitivo'})
                                    </span>
                                  )}
                                  {caughtInfo && (
                                    <span className="text-slate-600">
                                      {caughtInfo.byPlayerId === 'storm'
                                        ? 'Eliminado · Tormenta'
                                        : caughtInfo.byPlayerId === 'anticheat'
                                        ? 'Eliminado · GPS apagado'
                                        : caughtInfo.byPlayerId === 'photo'
                                        ? 'Eliminado · Sin foto'
                                        : caughtInfo.byPlayerId === 'camp'
                                        ? 'Eliminado · Quietud'
                                        : `Eliminado · Pillado por ${catcherName}`}
                                    </span>
                                  )}
                                  {!caughtInfo && myContractTargetId === p.id && (
                                    <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700 mr-1.5">
                                      🎯 Tu objetivo
                                    </span>
                                  )}
                                  {!caughtInfo && infectedInfo && (
                                    <span className="font-medium text-rose-600">
                                      Buscador · Infectado por {infectorName}
                                    </span>
                                  )}
                                  {!caughtInfo && otherExposed && (
                                    <span className="text-violet-700 ml-1">
                                      · En tormenta
                                    </span>
                                  )}
                                  {otherLocOff && (
                                    <span className="text-rose-600 ml-1">
                                      · GPS apagado
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {seekerCanCatchThis && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmCatchId(
                                      confirmCatchId === p.id ? null : p.id
                                    )
                                  }
                                  disabled={busyCatchId === p.id}
                                  className="min-h-[36px] rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 whitespace-nowrap"
                                >
                                  {infectionModeEnabled ? 'Infectar' : 'Pillado'}
                                </button>
                              )}

                              {hiderCanReportSelf && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmCatchId(
                                      confirmCatchId === p.id ? null : p.id
                                    )
                                  }
                                  disabled={busyCatchId === p.id}
                                  className="min-h-[36px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap"
                                >
                                  Me han pillado
                                </button>
                              )}

                              {(caughtInfo || infectedInfo) && isHost && (
                                <button
                                  type="button"
                                  onClick={() => handleUndo(p.id)}
                                  disabled={busyCatchId === p.id}
                                  title={
                                    infectedInfo
                                      ? 'Deshacer infección'
                                      : 'Deshacer eliminación'
                                  }
                                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Deshacer</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {confirmCatchId === p.id && (
                            <div className="flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs">
                              <span className="font-semibold text-rose-900">
                                {isSelf
                                  ? infectionModeEnabled
                                    ? '¿Confirmar que te han pillado? Pasarás a ser buscador.'
                                    : '¿Confirmar que te han pillado?'
                                  : infectionModeEnabled
                                  ? `¿Confirmas que infectaste a ${p.name}? Pasará a ser buscador.`
                                  : `¿Confirmas que pillaste a ${p.name}?`}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setConfirmCatchId(null)}
                                  className="min-h-[32px] rounded-lg border border-slate-200 bg-white px-2.5 font-semibold text-slate-700"
                                >
                                  No
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCatchPlayer(
                                      p.id,
                                      isSelf
                                        ? players.find(
                                            (x) =>
                                              (match?.roles?.[x.id] ??
                                                'hider') === 'seeker'
                                          )?.id || currentPlayerId
                                        : currentPlayerId
                                    )
                                  }
                                  disabled={busyCatchId === p.id}
                                  className="min-h-[32px] rounded-lg bg-rose-600 px-2.5 font-semibold text-white hover:bg-rose-700"
                                >
                                  Confirmar
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* PESTAÑA TORMENTA */}
                {activeTab === 'storm' && (
                  <ol className="divide-y divide-slate-100">
                    {phaseTimeline.map((item) => {
                      const isCurrent = item.idx === snapshot.phaseIndex;
                      const isDone = item.idx < snapshot.phaseIndex;
                      return (
                        <li
                          key={item.zone.id}
                          className={`flex items-center justify-between gap-3 px-4 py-3 ${
                            isCurrent
                              ? 'bg-violet-50/60'
                              : isDone
                              ? 'opacity-50'
                              : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                                isCurrent
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              Z{item.idx + 1}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Radio {formatRadius(item.zone.radius)}
                              </p>
                              <p className="text-xs text-slate-500">
                                Espera {formatDurationSec(item.zone.waitTimeSec)}
                                {item.hasNext
                                  ? ` · Cierre ${formatDurationSec(
                                      activeZones[item.idx + 1].shrinkTimeSec
                                    )}`
                                  : ' · Zona final'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold shrink-0 ${
                              isCurrent
                                ? 'rounded-md bg-violet-100 px-2 py-0.5 text-violet-800'
                                : isDone
                                ? 'text-slate-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {isCurrent
                              ? 'Activa'
                              : isDone
                              ? 'Completada'
                              : 'Pendiente'}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {/* PESTAÑA OPCIONES */}
                {activeTab === 'match' && (
                  <div className="p-4 space-y-4">
                    <dl className="divide-y divide-slate-100 text-sm">
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-slate-500">Tu rol</dt>
                        <dd className="font-semibold text-slate-900 text-right">
                          {myRole === 'seeker' ? 'Buscador' : 'Fugitivo'}
                          {myCaughtRecord ? ' (Eliminado)' : ''}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-slate-500">Señal GPS</dt>
                        <dd className="font-mono text-xs font-semibold text-slate-900 text-right">
                          {joystickActive
                            ? 'Mando virtual'
                            : myPos
                            ? `Suavizado (±${Math.round(myPos.accuracy)}m${
                                gpsRejectedJumps > 0
                                  ? ` · ${gpsRejectedJumps} saltos filtrados`
                                  : ''
                              })`
                            : gpsError || 'Buscando...'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-slate-500">Fuera de zona</dt>
                        <dd className="font-mono text-xs font-semibold text-slate-900 text-right">
                          {stormGraceMaxSec} s
                        </dd>
                      </div>
                    </dl>

                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      {chatAllowed && (
                        <button
                          type="button"
                          onClick={() => setShowChatDrawer(true)}
                          className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span>
                            Abrir chat de sala
                            {unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleTogglePocketCompass()}
                        className={`flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                          pocketCompassOn
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Navigation className="h-4 w-4 shrink-0" />
                        <span>
                          {pocketCompassOn
                            ? 'Apagar brújula y vibración'
                            : 'Activar brújula y distancia por vibración'}
                        </span>
                      </button>

                      {allowTestJoystick && (
                        <button
                          type="button"
                          onClick={() => {
                            handleToggleJoystick();
                            setActiveTab('map');
                          }}
                          className={`flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                            joystickActive
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Gamepad2 className="h-4 w-4 shrink-0" />
                          <span>
                            {joystickActive
                              ? 'Quitar mando virtual (usar GPS real)'
                              : 'Usar mando virtual (moverse sin caminar)'}
                          </span>
                        </button>
                      )}

                      {hunterPhotoEnabled &&
                        (isHost || myRole === 'seeker') &&
                        isHuntPhase &&
                        !matchWinner &&
                        !isPhotoChallengeActive && (
                          <button
                            type="button"
                            onClick={() => void onStartPhotoChallenge(hunterPhotoWindowSec)}
                            className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                          >
                            <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                              Lanzar reto foto ({hunterPhotoWindowSec} s)
                            </span>
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await startBackgroundKeepAlive();
                          setBgKeepAliveOn(ok);
                          const perm = await requestBackgroundNotificationPermission();
                          setNotifPerm(perm);
                        }}
                        className={`flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                          bgKeepAliveOn && notifPerm === 'granted'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Bell className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          {bgKeepAliveOn && notifPerm === 'granted'
                            ? 'Avisos con pantalla apagada activos'
                            : 'Activar avisos con pantalla apagada'}
                        </span>
                      </button>

                      {isHost &&
                        (confirmAction === 'end' ? (
                          <div className="rounded-xl bg-slate-100 p-3 space-y-2">
                            <p className="text-xs font-semibold text-slate-900">
                              ¿Terminar la partida y volver todos a la sala?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmAction(null)}
                                disabled={busyAction}
                                className="min-h-[38px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleConfirmEnd}
                                disabled={busyAction}
                                className="min-h-[38px] flex-1 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                              >
                                {busyAction ? 'Finalizando...' : 'Sí, terminar'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmAction('end')}
                            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            <Flag className="h-4 w-4" aria-hidden="true" />
                            <span>Terminar partida</span>
                          </button>
                        ))}

                      {confirmAction === 'leave' ? (
                        <div className="rounded-xl bg-rose-50 p-3 space-y-2">
                          <p className="text-xs font-semibold text-rose-900">
                            {isHost
                              ? '¿Cerrar y borrar la sala para todos?'
                              : '¿Seguro que quieres salir?'}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmAction(null)}
                              disabled={busyAction}
                              className="min-h-[38px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmLeave}
                              disabled={busyAction}
                              className="min-h-[38px] flex-1 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                            >
                              {busyAction ? 'Saliendo...' : 'Sí, salir'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmAction('leave')}
                          className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <LogOut className="h-4 w-4" aria-hidden="true" />
                          <span>
                            {isHost ? 'Cerrar sala' : 'Salir de la partida'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowEventsModal(true)}
                        className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <History className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Historial de eventos ({matchEvents.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowSettingsModal(true)}
                        className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>Configuración (tema, sonido, fuente)</span>
                      </button>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <span>
                          Baliza <strong className="font-mono text-slate-700">v{APP_VERSION}</strong>
                        </span>
                        <span>
                          Creado por <strong className="text-slate-700">{APP_AUTHOR}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Navegación inferior compacta */}
      <nav
        aria-label="Pestañas de partida"
        className="relative z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1 px-2 py-1 pb-safe">
          {(
            [
              { id: 'map', label: 'Mapa', Icon: MapIcon },
              {
                id: 'players',
                label: `Jugadores (${players.length})`,
                Icon: Users,
              },
              { id: 'storm', label: 'Zonas', Icon: Compass },
              { id: 'match', label: 'Opciones', Icon: Clock },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setConfirmAction(null);
                  setConfirmCatchId(null);
                  setShowMapTools(false);
                  setActiveTab(id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[42px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {isMyLocationTampered && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Ubicación desactivada"
          className="fixed inset-0 z-[48] flex h-[100dvh] w-full flex-col items-center justify-center bg-slate-900/80 px-6 text-center backdrop-blur-xs select-none"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <MapPinOff className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Ubicación apagada
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Tu último punto GPS se mostró a la sala. Activa el permiso de ubicación para seguir jugando.
              </p>
            </div>
            {myRole === 'hider' && (
              <div className="rounded-xl bg-rose-50 px-4 py-3">
                <p className="text-xs font-medium text-rose-800">
                  Eliminación automática en
                </p>
                <p className="font-mono text-3xl font-bold tabular-nums text-rose-600 mt-0.5">
                  {Math.ceil(locGraceRemainingSec)} s
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                handleCenterMyGps();
                void onRecheckLocation?.();
              }}
              className="w-full min-h-[44px] rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Activar ubicación
            </button>
          </div>
        </div>
      )}

      {showEliminationOverlay && myCaughtRecord && (
        <EliminationOverlay
          playerName={currentPlayer?.name || 'Jugador'}
          playerEmoji={currentPlayer?.emoji || '🏃'}
          playerColor={currentPlayer?.color || '#059669'}
          causeLabel={eliminationCauseLabel}
          autoCloseAfterDone={Boolean(matchWinner)}
          onClose={handleCloseEliminationOverlay}
        />
      )}

      {showInfectionOverlay && myInfectedRecord && (
        <InfectionOverlay
          playerName={currentPlayer?.name || 'Jugador'}
          playerEmoji={currentPlayer?.emoji || '🏃'}
          playerColor={currentPlayer?.color || '#059669'}
          causeLabel={infectionCauseLabel}
          autoCloseAfterDone={Boolean(matchWinner)}
          onClose={handleCloseInfectionOverlay}
        />
      )}

      {sandboxUnlocked && showSandboxModal && onSandboxUpdateMatchState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Laboratorio secreto de pruebas"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 p-3 sm:p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md max-h-[88dvh] flex flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-violet-600" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Laboratorio Solo (Sin DB)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Prueba animaciones, infección, bots y fases en solitario.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSandboxModal(false)}
                aria-label="Cerrar laboratorio"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 space-y-4 text-xs">
              {/* Acciones de infección y eliminación */}
              <div className="space-y-2">
                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                  Animaciones, bando e infección
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      unlockRetroAudio();
                      setShowSandboxModal(false);
                      const hunterId =
                        players.find(
                          (p) =>
                            p.id !== currentPlayerId &&
                            (match?.roles?.[p.id] ?? 'hider') === 'seeker'
                        )?.id ||
                        players.find((p) => p.id !== currentPlayerId)?.id ||
                        'bot_solo';
                      await onSandboxUpdateMatchState((prev, baseRules) => {
                        const nextInfected = { ...(prev.infected || {}) };
                        const nextCaught = { ...(prev.caught || {}) };
                        delete nextCaught[currentPlayerId];
                        nextInfected[currentPlayerId] = {
                          at: new Date().toISOString(),
                          byPlayerId: hunterId,
                        };
                        return {
                          ...prev,
                          roles: {
                            ...(prev.roles || {}),
                            [currentPlayerId]: 'seeker',
                          },
                          caught: nextCaught,
                          infected: nextInfected,
                          winner: null,
                          winReason: null,
                          endedAt: null,
                        };
                      });
                    }}
                    className="min-h-[38px] rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-700"
                  >
                    🧟 Simular que me infectan
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      unlockRetroAudio();
                      setShowSandboxModal(false);
                      const hunterId =
                        players.find(
                          (p) =>
                            p.id !== currentPlayerId &&
                            (match?.roles?.[p.id] ?? 'hider') === 'seeker'
                        )?.id ||
                        players.find((p) => p.id !== currentPlayerId)?.id ||
                        'bot_solo';
                      await onSandboxUpdateMatchState((prev) => {
                        const nextCaught = { ...(prev.caught || {}) };
                        nextCaught[currentPlayerId] = {
                          at: new Date().toISOString(),
                          byPlayerId: hunterId,
                        };
                        return {
                          ...prev,
                          caught: nextCaught,
                        };
                      });
                    }}
                    className="min-h-[38px] rounded-xl bg-rose-600 px-3 py-2 font-bold text-white hover:bg-rose-700"
                  >
                    💀 Simular eliminación
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const nextRole: PlayerRole =
                        myRole === 'seeker' ? 'hider' : 'seeker';
                      await onSandboxUpdateMatchState((prev) => {
                        const prevInitial =
                          prev.initialSeekers ?? prev.seekerOrder ?? [];
                        const nextInitial =
                          nextRole === 'seeker'
                            ? Array.from(new Set([...prevInitial, currentPlayerId]))
                            : prevInitial.filter((id) => id !== currentPlayerId);
                        const nextInfected = { ...(prev.infected || {}) };
                        if (nextRole === 'seeker') {
                          delete nextInfected[currentPlayerId];
                        }
                        return {
                          ...prev,
                          roles: {
                            ...(prev.roles || {}),
                            [currentPlayerId]: nextRole,
                          },
                          initialSeekers: nextInitial,
                          infected: nextInfected,
                        };
                      });
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    🔄 Cambiar a {myRole === 'seeker' ? 'Fugitivo' : 'Buscador'}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await onSandboxUpdateMatchState((prev) => {
                        const nextCaught = { ...(prev.caught || {}) };
                        const nextInfected = { ...(prev.infected || {}) };
                        delete nextCaught[currentPlayerId];
                        delete nextInfected[currentPlayerId];
                        return {
                          ...prev,
                          caught: nextCaught,
                          infected: nextInfected,
                          winner: null,
                          winReason: null,
                          endedAt: null,
                        };
                      });
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ♻️ Revivir / Limpiar estado
                  </button>
                </div>
              </div>

              {/* Simulación de bots */}
              {botPlayerIds.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                    IA y simulación de bots ({botPlayerIds.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSandboxBotsMoving((v) => !v)}
                      className={`min-h-[36px] rounded-xl border px-3 py-2 font-semibold ${
                        sandboxBotsMoving
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {sandboxBotsMoving ? '🤖 Bots moviéndose' : '⏸️ Bots quietos'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSandboxBotsAutoPlay((v) => !v)}
                      className={`min-h-[36px] rounded-xl border px-3 py-2 font-semibold ${
                        sandboxBotsAutoPlay
                          ? 'border-violet-200 bg-violet-50 text-violet-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {sandboxBotsAutoPlay
                        ? '🧠 IA autónoma: ON'
                        : '🧠 IA autónoma: OFF'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleBringBotsNearMe();
                        setShowSandboxModal(false);
                      }}
                      className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      📍 Traer bots aquí
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSandboxForceBotChat()}
                      className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      💬 Bot habla en chat
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSandboxForceBotAbility()}
                      className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      🪄 Bot usa habilidad
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const targetBot = players.find(
                          (p) =>
                            isBotPlayerId(p.id) &&
                            (match?.roles?.[p.id] ?? 'hider') === 'hider' &&
                            !caughtMap[p.id]
                        );
                        if (!targetBot) return;
                        const seekerId =
                          players.find(
                            (p) =>
                              (match?.roles?.[p.id] ?? 'hider') === 'seeker' &&
                              p.id !== targetBot.id
                          )?.id || currentPlayerId;
                        await onMarkCaught(targetBot.id, seekerId);
                      }}
                      className="min-h-[36px] rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      🎯 {infectionModeEnabled ? 'Bot infecta Bot' : 'Bot caza Bot'}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const seekerBot = players.find(
                          (p) =>
                            isBotPlayerId(p.id) &&
                            (match?.roles?.[p.id] ?? 'hider') === 'seeker'
                        );
                        const hidersLeft = players.filter(
                          (p) =>
                            (match?.roles?.[p.id] ?? 'hider') === 'hider' &&
                            !caughtMap[p.id]
                        );
                        if (hidersLeft.length === 0) return;
                        const nowIso = new Date().toISOString();
                        const actorId = seekerBot?.id || currentPlayerId;
                        await onSandboxUpdateMatchState((prev, baseRules) => {
                          const nextRoles = { ...(prev.roles || {}) };
                          const nextInfected = { ...(prev.infected || {}) };
                          const nextCaught = { ...(prev.caught || {}) };
                          const isInf = Boolean(
                            baseRules.modifiers?.infectionModeEnabled
                          );
                          hidersLeft.forEach((h) => {
                            if (isInf) {
                              nextRoles[h.id] = 'seeker';
                              nextInfected[h.id] = { at: nowIso, byPlayerId: actorId };
                            } else {
                              nextCaught[h.id] = { at: nowIso, byPlayerId: actorId };
                            }
                          });
                          return {
                            ...prev,
                            roles: nextRoles,
                            infected: nextInfected,
                            caught: nextCaught,
                            winner: 'seekers',
                            winReason: 'all_caught',
                            endedAt: nowIso,
                          };
                        });
                        setShowSandboxModal(false);
                      }}
                      className="col-span-2 min-h-[36px] rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-900 hover:bg-rose-100"
                    >
                      🧟 Infectar/cazar a TODOS (probar victoria Paciente Cero)
                    </button>
                  </div>
                </div>
              )}

              {/* Suite automática de tests */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                    Tests de todas las funciones
                  </p>
                  {sandboxTestReport && (
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        sandboxTestReport.failed === 0
                          ? 'text-emerald-700'
                          : 'text-rose-600'
                      }`}
                    >
                      {sandboxTestReport.passed}/{sandboxTestReport.total} OK
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={sandboxTestingBusy}
                  onClick={() => void handleSandboxRunFeatureTests()}
                  className="w-full min-h-[38px] rounded-xl bg-slate-900 px-3 py-2 font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {sandboxTestingBusy
                    ? 'Ejecutando tests...'
                    : '🧪 Ejecutar Suite completa de Tests (10 funciones)'}
                </button>
                {sandboxTestReport && (
                  <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-1">
                    {sandboxTestReport.results.map((t) => (
                      <li key={t.id} className="py-1.5 text-[11px]">
                        <p
                          className={`font-semibold ${
                            t.passed ? 'text-emerald-800' : 'text-rose-700'
                          }`}
                        >
                          {t.passed ? '✅' : '❌'} {t.name}
                        </p>
                        <p className="text-[10px] text-slate-500">{t.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Fases, tormenta, baliza y resultado */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500">
                  Tiempo, zonas y eventos
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onSandboxUpdateMatchState((prev) => ({
                        ...prev,
                        rouletteDurationMs: 0,
                        startedAt: new Date(
                          Date.now() - ((prev.hideTimeSec ?? 30) + 2) * 1000
                        ).toISOString(),
                      }));
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    ⏩ Saltar a Caza
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await onSandboxUpdateMatchState((prev) => ({
                        ...prev,
                        startedAt: new Date(
                          new Date(prev.startedAt).getTime() - 60000
                        ).toISOString(),
                      }));
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    🌪️ Avanzar +60 s
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await onSandboxUpdateMatchState((prev) => {
                        const baseBeacon = prev.extractionBeacon ?? {
                          lat: snapshot.currentLat,
                          lng: snapshot.currentLng,
                          radiusM: 25,
                          unlockAtSec: 0,
                        };
                        return {
                          ...prev,
                          extractionBeacon: {
                            ...baseBeacon,
                            unlockAtSec: 0,
                          },
                        };
                      });
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    📡 Desbloquear Baliza
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!extractionBeacon) return;
                      setJoystickActive(true);
                      setGpsError(null);
                      setMyPos({
                        lat: extractionBeacon.lat,
                        lng: extractionBeacon.lng,
                        accuracy: 3,
                      });
                      mapRef.current?.setView(
                        [extractionBeacon.lat, extractionBeacon.lng],
                        17,
                        { animate: true }
                      );
                      setShowSandboxModal(false);
                    }}
                    disabled={!extractionBeacon}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    📍 Ir a la Baliza
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await onStartPhotoChallenge(hunterPhotoWindowSec || 45);
                      setShowSandboxModal(false);
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    📸 Reto Foto ya
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setJoystickActive((v) => !v);
                      setShowSandboxModal(false);
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    🕹️ {joystickActive ? 'Apagar Joystick' : 'Encender Joystick'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const base = myPos ?? {
                        lat: snapshot.currentLat,
                        lng: snapshot.currentLng,
                        accuracy: 8,
                      };
                      gpsFilterRef.current = filterGpsSample(createGpsFilterState(), {
                        lat: base.lat,
                        lng: base.lng,
                        accuracy: 8,
                        timestampMs: Date.now() - 2000,
                      }).state;
                      const spike = filterGpsSample(gpsFilterRef.current, {
                        lat: base.lat + 0.015,
                        lng: base.lng + 0.015,
                        accuracy: 12,
                        timestampMs: Date.now(),
                      });
                      gpsFilterRef.current = spike.state;
                      setGpsRejectedJumps(spike.state.rejectedJumps);
                      triggerAbilityToast(
                        spike.reason === 'jump_filtered'
                          ? `🛡️ Salto GPS imposible filtrado (${spike.state.rejectedJumps}).`
                          : 'Filtro GPS actualizado.'
                      );
                      setShowSandboxModal(false);
                    }}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    🛰️ Probar anti-salto GPS
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSandboxModal(false);
                      void onDeclareWinner('seekers', 'all_caught');
                    }}
                    className="min-h-[36px] rounded-xl bg-slate-900 px-3 py-2 font-semibold text-white hover:bg-slate-800"
                  >
                    🏆 Ganan Buscadores
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSandboxModal(false);
                      void onDeclareWinner('hiders', 'time_expired');
                    }}
                    className="col-span-2 min-h-[36px] rounded-xl bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800"
                  >
                    🏆 Ganan Fugitivos
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSecretSandboxUnlocked(false);
                    setShowSandboxModal(false);
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 underline underline-offset-2"
                >
                  Ocultar modo secreto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {matchWinner &&
        matchWinReason &&
        resultWaitDone &&
        !showEliminationOverlay &&
        !showInfectionOverlay &&
        !resultDismissed && (
          <MatchResultOverlay
            winner={matchWinner}
            winReason={matchWinReason}
            myRole={myRole}
            isHost={isHost}
            currentPlayerId={currentPlayerId}
            matchKey={`${room.id}_${match?.startedAt ?? ''}`}
            contractsCompletedBy={match?.contractsCompletedBy || {}}
            players={players}
            roles={match?.roles || {}}
            caughtMap={caughtMap}
            infectedMap={infectedMap}
            initialSeekers={match?.initialSeekers ?? match?.seekerOrder}
            infectionModeEnabled={infectionModeEnabled}
            extractionBeacon={extractionBeacon}
            recapRoutes={recapRoutes}
            activeZones={activeZones}
            matchDurationSec={recapMatchDurationSec}
            playerCosmetics={effectivePlayerCosmetics}
            achievementContext={{
              antiCampEliminate,
              hadAntiCampWarning: hadAntiCampWarningRef.current,
              fogEnabled,
              fogRadiusM,
              radarEnabled,
              photoCompletedByMe: myPhotoStatus === 'accepted',
              nearestSeekerDistAtEndM:
                endSnapshotTelemetryRef.current.nearestSeekerDistM,
              reachedFinalZone: reachedFinalZoneRef.current,
              stormOutsideTotalSec: Math.round(
                stormOutsideTotalMsRef.current / 1000
              ),
              timeRemainingAtEndSec:
                endSnapshotTelemetryRef.current.timeRemainingSec,
              panicEndgameEnabled,
              myAbilityUses,
              usedDecoy: usedAbilityKindsRef.current.decoy,
              usedCloak: usedAbilityKindsRef.current.cloak,
              hadTechHunterCatch: hadTechHunterCatchRef.current,
              pocketCompassRatio:
                pocketTotalMsRef.current > 0
                  ? pocketActiveMsRef.current / pocketTotalMsRef.current
                  : 0,
              trailEnabled,
              hotColdEnabled,
            }}
            onEndMatch={onEndMatch}
            onDismiss={() => setResultDismissed(true)}
          />
        )}

      {chatAllowed && (
        <MatchChatDrawer
          isOpen={showChatDrawer}
          onClose={() => setShowChatDrawer(false)}
          roomId={room.id}
          roomCode={room.code}
          currentPlayerId={currentPlayerId}
          playerName={currentPlayer?.name || 'Jugador'}
          playerEmoji={currentPlayer?.emoji || '🦊'}
          myRole={myRole}
          sandboxUnlocked={sandboxUnlocked}
          onUnreadCountChange={setUnreadChatCount}
        />
      )}

      {isRoulettePhase && (
        <SeekerRouletteOverlay
          players={players}
          seekerOrder={seekerOrder}
          currentPlayerId={currentPlayerId}
          startMs={startMs}
          totalDurationMs={rouletteDurationMs}
          clockOffsetMs={clockOffsetMs}
          playerCosmetics={effectivePlayerCosmetics}
        />
      )}

      {showPhotoModal && photoChallenge && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fotos del reto"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 p-4 backdrop-blur-xs"
        >
          <div className="flex w-full max-w-md max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Fotos con el cazador
                </h2>
                <p className="text-xs text-slate-500">
                  Rechaza una foto si no sale contigo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoModal(false)}
                aria-label="Cerrar fotos"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto">
              {players
                .filter((p) => (match?.roles?.[p.id] ?? 'hider') === 'hider' && !caughtMap[p.id])
                .map((p) => {
                  const sub = photoChallenge.completedBy?.[p.id];
                  const proof = photoProofs[`${photoChallenge.id}:${p.id}`];
                  return (
                    <div key={p.id} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {p.emoji} {p.name}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            sub?.status === 'accepted'
                              ? 'bg-emerald-50 text-emerald-700'
                              : sub?.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {sub?.status === 'accepted'
                            ? 'Completada'
                            : sub?.status === 'rejected'
                            ? 'Rechazada'
                            : 'Pendiente'}
                        </span>
                      </div>
                      {proof?.dataUrl && (
                        <img
                          src={proof.dataUrl}
                          alt={`Foto de ${p.name}`}
                          className="w-full max-h-52 rounded-xl object-cover border border-slate-200"
                        />
                      )}
                      {sub?.status === 'accepted' && isPhotoChallengeActive && (
                        <button
                          type="button"
                          onClick={() =>
                            void onSetPhotoChallengeStatus(
                              photoChallenge.id,
                              p.id,
                              'rejected'
                            )
                          }
                          className="w-full min-h-[38px] rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Rechazar foto
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {isHidePhase && myRole === 'seeker' && (
        <SeekerHoldOverlay
          remainingSec={hideRemainingSec}
          totalHideSec={hideTimeSec}
          seekerTeammates={players.filter(
            (p) => p.id !== currentPlayerId && match?.roles?.[p.id] === 'seeker'
          )}
        />
      )}
      {showEventsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Historial de eventos de la partida"
          className="fixed inset-0 z-[54] flex items-end sm:items-center justify-center bg-slate-900/55 p-3 sm:p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[82dvh]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Historial de eventos
                </h2>
                <p className="text-xs text-slate-500">
                  {matchEvents.length}{' '}
                  {matchEvents.length === 1
                    ? 'suceso registrado'
                    : 'sucesos registrados'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEventsModal(false)}
                aria-label="Cerrar historial de eventos"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {matchEvents.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Todavía no hay eventos registrados en esta partida.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {matchEvents.map((ev) => {
                    const relSec = Math.max(
                      0,
                      Math.floor((ev.atMs - startMs) / 1000)
                    );
                    return (
                      <li
                        key={ev.id}
                        className="flex items-start justify-between gap-3 py-3"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                              ev.kind === 'elimination' || ev.kind === 'infection'
                                ? 'bg-rose-50 text-rose-600'
                                : ev.kind === 'storm'
                                ? 'bg-violet-50 text-violet-700'
                                : ev.kind === 'beacon'
                                ? 'bg-emerald-50 text-emerald-700'
                                : ev.kind === 'photo' || ev.kind === 'winner'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {ev.kind === 'elimination' ? (
                              <PixelSkull className="h-4 w-4" />
                            ) : ev.kind === 'infection' ? (
                              <UserCheck className="h-4 w-4" aria-hidden="true" />
                            ) : ev.kind === 'storm' ? (
                              <Compass className="h-4 w-4" aria-hidden="true" />
                            ) : ev.kind === 'beacon' ? (
                              <Radio className="h-4 w-4" aria-hidden="true" />
                            ) : ev.kind === 'photo' ? (
                              <Camera className="h-4 w-4" aria-hidden="true" />
                            ) : ev.kind === 'winner' ? (
                              <Trophy className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Clock className="h-4 w-4" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 leading-snug">
                              {ev.title}
                            </p>
                            {ev.detail && (
                              <p className="mt-0.5 text-xs text-slate-500">
                                {ev.detail}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-slate-500 pt-0.5">
                          {formatDurationSec(relSec)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      {showSettingsModal && (
        <SettingsPanel asModal onClose={() => setShowSettingsModal(false)} />
      )}
    </div>
  );
};
