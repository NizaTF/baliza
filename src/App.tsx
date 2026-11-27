import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { AchievementsModal } from './components/AchievementsModal';
import { DebugUnlockModal } from './components/DebugUnlockModal';
import { HomeScreen } from './components/HomeScreen';
import { KickedOverlay } from './components/KickedOverlay';
import { LobbyScreen } from './components/LobbyScreen';
import { LobbyToastHost, LobbyToastItem } from './components/LobbyToastHost';
import { MatchScreen } from './components/MatchScreen';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { PixelBalizaMark } from './components/PixelIcons';
import { RulesEditor } from './components/RulesEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { ShareAppButton } from './components/ShareAppButton';
import {
  ROULETTE_FINAL_MS,
  ROULETTE_ROUND_MS,
} from './components/SeekerRouletteOverlay';
import {
  addBotsToLocalRoom,
  createRoom,
  fetchRoomState,
  joinRoom,
  kickPlayer,
  leaveRoom,
  removeBotsFromLocalRoom,
  subscribeToRoom,
  subscribeToRoomClockSync,
  subscribeToRoomLocationGuard,
  transferHost,
  updatePlayerProfileInRoom,
  updateRoomRules,
  verifyPlayerInRoom,
} from './lib/roomService';
import {
  startBackgroundKeepAlive,
  stopBackgroundKeepAlive,
} from './lib/backgroundRunner';
import {
  checkLocationAvailability,
  subscribeLocationGuard,
} from './lib/locationGuard';
import {
  playPixelUiClick,
  playPlayerKickedSting,
  playSecretUnlockChime,
  playSeekerCountdownBeep,
  unlockRetroAudio,
} from './lib/retroAudio';
import {
  isSecretSandboxUnlocked,
  setForceLocalSandboxEnabled,
  setSecretSandboxUnlocked,
  subscribeSecretSandbox,
} from './lib/soloSandbox';
import {
  applyPreferencesToDocument,
  getEquippedCosmetics,
  loadPreferences,
  refreshPreferencesFromStorage,
  subscribePreferences,
  syncDebugCosmeticsOnToggle,
  triggerHaptic,
} from './lib/preferences';
import { hydrateFromIndexedDbFallback } from './lib/safeStorage';
import {
  getPlayerId,
  loadActiveSession,
  loadProfile,
  markTabInactive,
  sanitizeRoomCode,
  saveActiveSession,
  saveProfile,
  setCachedPlayerId,
  touchSessionHeartbeat,
} from './lib/storage';
import { supabaseConfigError } from './lib/supabaseClient';
import {
  generateExtractionBeacon,
  generateRandomZones,
  normalizeZonesConfig,
  VALENCIA_CENTER,
} from './lib/zones';
import {
  DEFAULT_RULES,
  LocationGuardStatus,
  MatchState,
  MatchWinReason,
  MatchWinner,
  PlayerCosmetics,
  PlayerProfile,
  PlayerRecord,
  PlayerRole,
  RoomRecord,
  RoomRules,
} from './types/game';

type AppView = 'home' | 'host_rules' | 'lobby';

function assignInitialContracts(
  roles: Record<string, PlayerRole>,
  activePlayers: PlayerRecord[]
): Record<string, string> {
  const hiders = activePlayers
    .filter((p) => (roles[p.id] ?? 'hider') === 'hider')
    .map((p) => p.id);
  const seekers = activePlayers
    .filter((p) => (roles[p.id] ?? 'hider') === 'seeker')
    .map((p) => p.id);
  const targets: Record<string, string> = {};
  if (hiders.length === 0) return targets;
  seekers.forEach((seekerId, idx) => {
    targets[seekerId] = hiders[idx % hiders.length];
  });
  return targets;
}

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [playerId, setPlayerId] = useState<string>(() => getPlayerId());
  const [view, setView] = useState<AppView>('home');
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [myLocationStatus, setMyLocationStatus] =
    useState<LocationGuardStatus>('unsupported');
  const [peerLocationStatuses, setPeerLocationStatuses] = useState<
    Record<string, LocationGuardStatus>
  >({});
  const [globalNotice, setGlobalNotice] = useState<string | null>(
    supabaseConfigError
  );
  const [kickedInfo, setKickedInfo] = useState<{
    playerName: string;
    playerEmoji: string;
    playerColor: string;
    roomCode: string;
  } | null>(null);
  const [lobbyToasts, setLobbyToasts] = useState<LobbyToastItem[]>([]);
  const [lobbyCountdownRemainingSec, setLobbyCountdownRemainingSec] = useState<
    number | null
  >(null);
  const [sandboxUnlocked, setSandboxUnlocked] = useState<boolean>(() =>
    isSecretSandboxUnlocked()
  );
  const [showDebugModal, setShowDebugModal] = useState(false);

  const logoTapRef = useRef<{ count: number; lastMs: number }>({
    count: 0,
    lastMs: 0,
  });
  const leavingSelfRef = useRef(false);
  const kickedHandledRef = useRef(false);
  const membershipVerifyInFlightRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const profileSyncTimerRef = useRef<number | null>(null);
  const toastTimersRef = useRef<Record<string, number>>({});
  const knownLobbyPlayersRef = useRef<{
    roomId: string | null;
    ids: Set<string>;
    initialized: boolean;
  }>({ roomId: null, ids: new Set(), initialized: false });
  const lastCountdownBeepSecRef = useRef<number | null>(null);
  const lastCountdownStartedAtRef = useRef<string | null>(null);
  const kickedContextRef = useRef({
    name: profile.name,
    emoji: profile.emoji,
    color: profile.color,
    roomCode: room?.code || '',
  });
  kickedContextRef.current = {
    name: profile.name,
    emoji: profile.emoji,
    color: profile.color,
    roomCode: room?.code || '',
  };
  const locGuardBroadcasterRef = useRef<((s: LocationGuardStatus) => void) | null>(
    null
  );

  const dismissLobbyToast = useCallback((id: string) => {
    const timer = toastTimersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete toastTimersRef.current[id];
    }
    setLobbyToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushLobbyToast = useCallback(
    (toast: Omit<LobbyToastItem, 'id'>, durationMs = 4200) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setLobbyToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
      const timer = window.setTimeout(() => {
        delete toastTimersRef.current[id];
        setLobbyToasts((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
      toastTimersRef.current[id] = timer;
    },
    []
  );

  const triggerKickedOut = useCallback(() => {
    if (leavingSelfRef.current || kickedHandledRef.current) return;
    kickedHandledRef.current = true;
    const ctx = kickedContextRef.current;
    saveActiveSession(null);
    setRoom(null);
    setPlayers([]);
    setView('home');
    setGlobalNotice('Has sido expulsado de la sala por el anfitrión.');
    setKickedInfo({
      playerName: ctx.name,
      playerEmoji: ctx.emoji,
      playerColor: ctx.color,
      roomCode: ctx.roomCode,
    });
  }, []);

  const confirmAndTriggerKick = useCallback(
    async (roomIdToCheck: string, targetId: string) => {
      if (
        leavingSelfRef.current ||
        kickedHandledRef.current ||
        membershipVerifyInFlightRef.current
      ) {
        return;
      }
      membershipVerifyInFlightRef.current = true;
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        if (leavingSelfRef.current || kickedHandledRef.current) return;
        const status = await verifyPlayerInRoom(roomIdToCheck, targetId);
        if (status === 'missing') {
          triggerKickedOut();
        }
      } finally {
        membershipVerifyInFlightRef.current = false;
      }
    },
    [triggerKickedOut]
  );

  const handleProfileChange = useCallback((next: PlayerProfile) => {
    setProfile(next);
    saveProfile(next);
  }, []);

  // Aplicar preferencias guardadas e hidratar respaldo en IndexedDB si hiciera falta
  useEffect(() => {
    applyPreferencesToDocument(loadPreferences());
    let cancelled = false;
    void hydrateFromIndexedDbFallback().then((restoredKeys) => {
      if (cancelled || restoredKeys.length === 0) return;
      if (restoredKeys.includes('baliza_secret_sandbox_v1')) {
        const restoredDebug = isSecretSandboxUnlocked();
        setSandboxUnlocked(restoredDebug);
        syncDebugCosmeticsOnToggle(restoredDebug);
      }
      if (restoredKeys.includes('baliza_app_preferences_v1')) {
        refreshPreferencesFromStorage();
      }
      if (restoredKeys.includes('escondite_urbano_profile')) {
        const restoredProfile = loadProfile();
        setProfile((current) =>
          current.name.trim().length > 0 ? current : restoredProfile
        );
      }
      if (restoredKeys.includes('escondite_urbano_player_id')) {
        const restoredId = getPlayerId();
        setPlayerId(restoredId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sincronizar cosméticos equipados con la sala activa cuando cambien en Ajustes
  const lastSyncedCosmeticsRef = useRef<string>('');
  useEffect(() => {
    if (!room?.id) return;
    const activeRoomId = room.id;

    const pushCosmeticsIfNeeded = async () => {
      const equipped = getEquippedCosmetics();
      const signature = `${activeRoomId}:${playerId}:${JSON.stringify(equipped)}`;
      if (lastSyncedCosmeticsRef.current === signature) return;
      lastSyncedCosmeticsRef.current = signature;
      try {
        const latest = await fetchRoomState(activeRoomId);
        const latestRoom = latest?.room;
        if (!latestRoom) return;
        const currentInRoom = latestRoom.rules.playerCosmetics?.[playerId];
        if (JSON.stringify(currentInRoom ?? {}) === JSON.stringify(equipped)) {
          return;
        }
        const nextRules: RoomRules = {
          ...latestRoom.rules,
          playerCosmetics: {
            ...(latestRoom.rules.playerCosmetics || {}),
            [playerId]: equipped,
          },
        };
        const updated = await updateRoomRules(activeRoomId, nextRules);
        setRoom((prev) => (prev && prev.id === activeRoomId ? updated : prev));
      } catch {
        // Reintentará en el siguiente cambio o sincronización
      }
    };

    void pushCosmeticsIfNeeded();
    const unsubPrefs = subscribePreferences(() => {
      void pushCosmeticsIfNeeded();
    });
    const unsubSandbox = subscribeSecretSandbox(() => {
      void pushCosmeticsIfNeeded();
    });
    return () => {
      unsubPrefs();
      unsubSandbox();
    };
  }, [room?.id, playerId]);

  // Sonido clic pixelado al interactuar con elementos UI (botones, pestañas, interruptores)
  useEffect(() => {
    const handleUiClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest(
        'button, [role="button"], [role="switch"], [role="tab"], [role="radio"]'
      ) as HTMLElement | null;
      if (!interactive) return;
      if (
        (interactive as HTMLButtonElement).disabled ||
        interactive.getAttribute('aria-disabled') === 'true'
      ) {
        return;
      }

      unlockRetroAudio();

      const role = interactive.getAttribute('role');
      const isSubmit = interactive.getAttribute('type') === 'submit';
      if (role === 'switch' || role === 'radio') {
        playPixelUiClick('toggle');
      } else if (isSubmit) {
        playPixelUiClick('confirm');
      } else {
        playPixelUiClick('tap');
      }
    };

    document.addEventListener('click', handleUiClick, true);
    return () => {
      document.removeEventListener('click', handleUiClick, true);
    };
  }, []);

  // Detectar enlace compartido ?sala=XXXX o restaurar sesión activa tras recarga
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const salaParam = params.get('sala');
    if (salaParam) {
      setInitialJoinCode(sanitizeRoomCode(salaParam));
    }

    if (params.has('nuevo')) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('nuevo');
      window.history.replaceState({}, '', cleanUrl.toString());
    }

    const activeSession = loadActiveSession();
    if (activeSession) {
      setCachedPlayerId(activeSession.playerId);
      setPlayerId(activeSession.playerId);
      fetchRoomState(activeSession.roomId)
        .then((state) => {
          if (!state) {
            saveActiveSession(null);
            return;
          }
          const isStillMember = state.players.some(
            (p) => p.id === activeSession.playerId
          );
          if (!isStillMember) {
            saveActiveSession(null);
            return;
          }
          setRoom(state.room);
          setPlayers(state.players);
          setView('lobby');
        })
        .catch(() => {
          // Mantener sesión en errores transitorios de red
        });
    }
  }, []);

  // Reiniciar banderas de salida/expulsión al entrar en una sala
  useEffect(() => {
    if (room?.id) {
      leavingSelfRef.current = false;
      kickedHandledRef.current = false;
    }
  }, [room?.id]);

  // Suscripción en tiempo real a cambios de la sala y jugadores
  useEffect(() => {
    if (!room?.id) return;
    const activeRoomId = room.id;
    const unsubscribe = subscribeToRoom(activeRoomId, {
      onRoomChange: (updatedRoom) => {
        if (!updatedRoom) {
          saveActiveSession(null);
          setRoom(null);
          setPlayers([]);
          setView('home');
          if (!leavingSelfRef.current) {
            setGlobalNotice('El anfitrión cerró la sala.');
          }
          leavingSelfRef.current = false;
          return;
        }
        setRoom(updatedRoom);
      },
      onPlayersChange: (updatedPlayers) => {
        const selfPresent = updatedPlayers.some((p) => p.id === playerId);
        if (selfPresent || leavingSelfRef.current) {
          setPlayers(updatedPlayers);
          return;
        }
        void confirmAndTriggerKick(activeRoomId, playerId);
      },
      onPlayerKicked: (targetPlayerId) => {
        if (targetPlayerId === playerId) {
          triggerKickedOut();
        } else {
          setPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));
        }
      },
    });
    return unsubscribe;
  }, [room?.id, playerId, reconnectKey, triggerKickedOut, confirmAndTriggerKick]);

  // Wake Lock y resincronización automática
  useEffect(() => {
    if (!room?.id) return;
    const activeRoomId = room.id;

    touchSessionHeartbeat(playerId);
    const heartbeatTimer = window.setInterval(() => {
      touchSessionHeartbeat(playerId);
    }, 3000);

    let wakeLockSentinel: WakeLockSentinel | null = null;
    let lastResyncAt = 0;

    const requestWakeLock = async () => {
      try {
        if (
          'wakeLock' in navigator &&
          document.visibilityState === 'visible' &&
          !wakeLockSentinel
        ) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        }
      } catch {
        // Wake Lock no soportado o rechazado por ahorro de batería
      }
    };

    void requestWakeLock();

    const resyncFromServer = async (forceReconnect = false) => {
      const now = Date.now();
      if (!forceReconnect && now - lastResyncAt < 5000) return;
      lastResyncAt = now;

      touchSessionHeartbeat(playerId);
      void requestWakeLock();
      if (forceReconnect) {
        setReconnectKey((k) => k + 1);
      }
      try {
        const state = await fetchRoomState(activeRoomId);
        if (!state) {
          saveActiveSession(null);
          setRoom(null);
          setPlayers([]);
          setView('home');
          setGlobalNotice('La sala ya no existe.');
          return;
        }
        const isStillMember = state.players.some((p) => p.id === playerId);
        if (!isStillMember) {
          void confirmAndTriggerKick(activeRoomId, playerId);
          return;
        }
        setRoom(state.room);
        setPlayers(state.players);
      } catch {
        // Ignorar fallo transitorio de red al despertar
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void resyncFromServer(true);
      }
    };

    const handlePageHide = () => {
      markTabInactive(playerId);
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingSelfRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        void resyncFromServer(true);
      }
    };

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        void resyncFromServer(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (wakeLockSentinel) {
        void wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };
  }, [room?.id, playerId]);

  const isHost = Boolean(room && room.host_id === playerId);
  const isMatchActive = Boolean(room && room.rules?.matchState?.active);

  // Sincronizar reloj con el anfitrión desde que entra en la sala para que todas las pantallas arranquen a la vez
  useEffect(() => {
    if (!room?.id) {
      setClockOffsetMs(0);
      return;
    }
    return subscribeToRoomClockSync(room.id, playerId, isHost, setClockOffsetMs);
  }, [room?.id, playerId, isHost, reconnectKey]);

  // Monitor local del permiso y disponibilidad de ubicación GPS al estar en una sala
  useEffect(() => {
    if (!room?.id) {
      setMyLocationStatus('unsupported');
      return;
    }
    return subscribeLocationGuard((status) => {
      setMyLocationStatus(status);
      locGuardBroadcasterRef.current?.(status);
    });
  }, [room?.id]);

  const handleRecheckLocation = useCallback(async () => {
    const status = await checkLocationAvailability();
    setMyLocationStatus(status);
    locGuardBroadcasterRef.current?.(status);
  }, []);

  // Avisos visuales (toast) cuando un jugador se une al lobby
  useEffect(() => {
    const currentRoomId = room?.id ?? null;
    if (!currentRoomId || isMatchActive) {
      if (!currentRoomId) {
        knownLobbyPlayersRef.current = {
          roomId: null,
          ids: new Set(),
          initialized: false,
        };
        setLobbyToasts([]);
      }
      return;
    }

    const tracker = knownLobbyPlayersRef.current;
    if (tracker.roomId !== currentRoomId) {
      knownLobbyPlayersRef.current = {
        roomId: currentRoomId,
        ids: new Set(players.map((p) => p.id)),
        initialized: players.length > 0,
      };
      return;
    }

    if (!tracker.initialized) {
      if (players.length > 0) {
        tracker.ids = new Set(players.map((p) => p.id));
        tracker.initialized = true;
      }
      return;
    }

    const nextIds = new Set(players.map((p) => p.id));
    players.forEach((p) => {
      if (!tracker.ids.has(p.id) && p.id !== playerId) {
        pushLobbyToast({
          type: 'join',
          title: `${p.emoji} ${p.name} se ha unido a la sala`,
          description: `Ya sois ${players.length} en la sala`,
        });
        playPixelUiClick('confirm');
        triggerHaptic(12);
      }
    });
    tracker.ids = nextIds;
  }, [room?.id, isMatchActive, players, playerId, pushLobbyToast]);

  // Cuenta regresiva visual sincronizada antes de entrar a partida
  const lobbyCountdown = room?.rules?.lobbyCountdown ?? null;
  useEffect(() => {
    if (!room?.id || isMatchActive || !lobbyCountdown?.startedAt) {
      setLobbyCountdownRemainingSec(null);
      lastCountdownBeepSecRef.current = null;
      lastCountdownStartedAtRef.current = null;
      return;
    }

    const startMs = new Date(lobbyCountdown.startedAt).getTime();
    const durationSec = Math.max(1, lobbyCountdown.durationSec || 3);
    if (Number.isNaN(startMs)) {
      setLobbyCountdownRemainingSec(null);
      return;
    }

    if (lastCountdownStartedAtRef.current !== lobbyCountdown.startedAt) {
      lastCountdownStartedAtRef.current = lobbyCountdown.startedAt;
      triggerHaptic([16, 40, 16]);
    }

    const updateTick = () => {
      const syncedNow = Date.now() + clockOffsetMs;
      const elapsedSec = (syncedNow - startMs) / 1000;
      const remaining = durationSec - elapsedSec;

      if (remaining <= 0 || elapsedSec > durationSec + 4) {
        setLobbyCountdownRemainingSec(null);
        return false;
      }

      setLobbyCountdownRemainingSec(remaining);
      const ceilSec = Math.ceil(remaining);
      if (ceilSec > 0 && lastCountdownBeepSecRef.current !== ceilSec) {
        lastCountdownBeepSecRef.current = ceilSec;
        playSeekerCountdownBeep(ceilSec);
      }
      return true;
    };

    if (!updateTick()) return;

    const timer = window.setInterval(() => {
      if (!updateTick()) {
        window.clearInterval(timer);
      }
    }, 150);

    return () => {
      window.clearInterval(timer);
    };
  }, [room?.id, isMatchActive, lobbyCountdown?.startedAt, lobbyCountdown?.durationSec, clockOffsetMs]);

  useEffect(() => {
    return subscribeSecretSandbox((unlocked) => {
      syncDebugCosmeticsOnToggle(unlocked);
      setSandboxUnlocked(unlocked);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCombo =
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') ||
        (e.altKey && e.key.toLowerCase() === 't');
      if (!isCombo) return;
      e.preventDefault();
      unlockRetroAudio();
      playPixelUiClick('toggle');
      setShowDebugModal(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearTimeout(countdownTimerRef.current);
      }
      Object.values(toastTimersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // Sincronización del estado de ubicación GPS de todos los jugadores de la sala
  useEffect(() => {
    if (!room?.id) {
      setPeerLocationStatuses({});
      locGuardBroadcasterRef.current = null;
      return;
    }
    const sub = subscribeToRoomLocationGuard(
      room.id,
      playerId,
      myLocationStatus,
      (peerId, status) => {
        setPeerLocationStatuses((prev) =>
          prev[peerId] === status ? prev : { ...prev, [peerId]: status }
        );
      }
    );
    locGuardBroadcasterRef.current = sub.updateMyStatus;
    sub.updateMyStatus(myLocationStatus);

    return () => {
      locGuardBroadcasterRef.current = null;
      sub.unsubscribe();
    };
  }, [room?.id, playerId, reconnectKey]);

  // Mantener sesión en segundo plano activa y resincronización periódica durante la partida
  useEffect(() => {
    if (!isMatchActive || !room?.id) {
      stopBackgroundKeepAlive();
      return;
    }
    const ensureKeepAlive = () => {
      void startBackgroundKeepAlive();
    };
    ensureKeepAlive();
    window.addEventListener('pointerdown', ensureKeepAlive, { passive: true });

    const activeRoomId = room.id;
    const syncTimer = window.setInterval(() => {
      void fetchRoomState(activeRoomId)
        .then((state) => {
          if (!state) return;
          setRoom(state.room);
          setPlayers(state.players);
        })
        .catch(() => {});
    }, 4000);

    return () => {
      window.removeEventListener('pointerdown', ensureKeepAlive);
      window.clearInterval(syncTimer);
    };
  }, [isMatchActive, room?.id]);

  const handleCreateRoom = async (presetRules?: RoomRules) => {
    setIsBusy(true);
    setJoinError(null);
    setGlobalNotice(null);
    leavingSelfRef.current = false;
    kickedHandledRef.current = false;
    try {
      const equipped = getEquippedCosmetics();
      const baseRules = presetRules
        ? {
            ...structuredClone(presetRules),
            matchState: null,
            lobbyCountdown: null,
            roomLocked: false,
          }
        : structuredClone(DEFAULT_RULES);
      const initialRules: RoomRules = {
        ...baseRules,
        playerCosmetics: {
          [playerId]: equipped,
        },
      };
      const { room: createdRoom, player } = await createRoom(
        profile,
        initialRules,
        playerId
      );
      setCachedPlayerId(player.id);
      setPlayerId(player.id);
      setRoom(createdRoom);
      setPlayers([player]);
      saveActiveSession({
        roomId: createdRoom.id,
        roomCode: createdRoom.code,
        playerId: player.id,
      });
      setView('lobby');
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No pudimos crear la sala. Inténtalo de nuevo.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoom = async (code: string) => {
    setIsBusy(true);
    setJoinError(null);
    setGlobalNotice(null);
    leavingSelfRef.current = false;
    kickedHandledRef.current = false;
    try {
      const result = await joinRoom(code, profile, playerId);
      const equipped = getEquippedCosmetics();
      const mergedCosmetics: Record<string, PlayerCosmetics> = {
        ...(result.room.rules.playerCosmetics || {}),
        [result.player.id]: equipped,
      };
      let joinedRoom = result.room;
      if (
        JSON.stringify(result.room.rules.playerCosmetics?.[result.player.id] ?? {}) !==
        JSON.stringify(equipped)
      ) {
        try {
          joinedRoom = await updateRoomRules(result.room.id, {
            ...result.room.rules,
            playerCosmetics: mergedCosmetics,
          });
        } catch {
          joinedRoom = {
            ...result.room,
            rules: {
              ...result.room.rules,
              playerCosmetics: mergedCosmetics,
            },
          };
        }
      }
      setCachedPlayerId(result.player.id);
      setPlayerId(result.player.id);
      setRoom(joinedRoom);
      setPlayers(result.players);
      saveActiveSession({
        roomId: joinedRoom.id,
        roomCode: joinedRoom.code,
        playerId: result.player.id,
      });
      if (window.location.search.includes('sala=')) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('sala');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
      setView('lobby');
    } catch (err) {
      setJoinError(
        err instanceof Error
          ? err.message
          : 'No encontramos esa sala. Revisa el código.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveRules = async (nextRules: RoomRules) => {
    if (!room) return;
    setIsSavingRules(true);
    try {
      const mergedRules: RoomRules = {
        ...nextRules,
        playerCosmetics: room.rules.playerCosmetics,
      };
      const updated = await updateRoomRules(room.id, mergedRules);
      setRoom(updated);
      setView('lobby');
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'Error al guardar las reglas. Inténtalo de nuevo.'
      );
    } finally {
      setIsSavingRules(false);
    }
  };

  const handleUpdateManualRoles = async (
    manualRoles: Record<string, PlayerRole>
  ) => {
    if (!room) return;
    const nextRules: RoomRules = {
      ...room.rules,
      manualRoles,
    };
    setRoom((prev) => (prev ? { ...prev, rules: nextRules } : prev));
    try {
      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar los roles.'
      );
    }
  };

  const handleStartMatch = async () => {
    unlockRetroAudio();
    if (!room || players.length < 2) {
      setGlobalNotice('Se necesitan mínimo 2 jugadores para iniciar la partida.');
      return;
    }
    if (isStartingMatch || room.rules.lobbyCountdown?.startedAt) return;

    const targetRoomId = room.id;
    const countdownDurationSec = 3;
    setIsStartingMatch(true);

    const launchMatchNow = async () => {
      try {
        const latest = await fetchRoomState(targetRoomId);
        const latestRoom = latest?.room ?? room;
        const activePlayers = latest?.players?.length ? latest.players : players;

        if (!latestRoom || activePlayers.length < 2) {
          if (latestRoom) {
            await updateRoomRules(targetRoomId, {
              ...latestRoom.rules,
              lobbyCountdown: null,
            });
          }
          setGlobalNotice('Se necesitan mínimo 2 jugadores para iniciar la partida.');
          setIsStartingMatch(false);
          return;
        }

        const roles: Record<string, PlayerRole> = {};
        let seekerOrder: string[] = [];
        let rouletteDurationMs = 0;

        if (latestRoom.rules.roleAssignment === 'manual') {
          const manual = latestRoom.rules.manualRoles || {};
          activePlayers.forEach((p) => {
            roles[p.id] = manual[p.id] === 'seeker' ? 'seeker' : 'hider';
          });
          const hasSeeker = Object.values(roles).some((r) => r === 'seeker');
          const hasHider = Object.values(roles).some((r) => r === 'hider');
          if (!hasSeeker) {
            roles[activePlayers[0].id] = 'seeker';
          }
          if (!hasHider) {
            roles[activePlayers[activePlayers.length - 1].id] = 'hider';
          }
          seekerOrder = activePlayers
            .filter((p) => roles[p.id] === 'seeker')
            .map((p) => p.id);
        } else {
          const ids = activePlayers.map((p) => p.id);
          for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
          }
          const maxSeekers = Math.max(1, ids.length - 1);
          const randomMax = Math.max(
            1,
            Math.min(maxSeekers, Math.max(2, Math.round(ids.length / 3)))
          );
          const targetSeekers =
            latestRoom.rules.seekersCount === 'random'
              ? 1 + Math.floor(Math.random() * randomMax)
              : Math.max(
                  1,
                  Math.min(Number(latestRoom.rules.seekersCount) || 1, maxSeekers)
                );

          ids.forEach((id, index) => {
            roles[id] = index < targetSeekers ? 'seeker' : 'hider';
          });
          seekerOrder = ids.slice(0, targetSeekers);
          rouletteDurationMs =
            seekerOrder.length * ROULETTE_ROUND_MS + ROULETTE_FINAL_MS;
        }

        const normalizedZones = normalizeZonesConfig(latestRoom.rules);
        const first = normalizedZones.zones[0];
        const activeZones =
          normalizedZones.mode === 'random'
            ? generateRandomZones({
                anchorLat: first?.lat ?? VALENCIA_CENTER.lat,
                anchorLng: first?.lng ?? VALENCIA_CENTER.lng,
                count: normalizedZones.zones.length,
                initialRadius: first?.radius ?? 900,
                defaultWaitSec: first?.waitTimeSec ?? 90,
                defaultShrinkSec: first?.shrinkTimeSec ?? 45,
              })
            : normalizedZones.zones;

        const hideTimeSec = latestRoom.rules.hideTimeSec ?? 30;
        const beaconVictoryEnabled = latestRoom.rules.beaconVictoryEnabled ?? true;
        const beaconRadiusM = latestRoom.rules.modifiers?.beaconRadiusM ?? 25;
        const extractionBeacon = beaconVictoryEnabled
          ? generateExtractionBeacon(
              activeZones,
              latestRoom.rules.roundDuration || 30,
              beaconRadiusM
            )
          : null;

        void startBackgroundKeepAlive();

        const contractTargets = latestRoom.rules.modifiers?.contractHuntEnabled
          ? assignInitialContracts(roles, activePlayers)
          : {};

        const nextRules: RoomRules = {
          ...latestRoom.rules,
          lobbyCountdown: null,
          matchState: {
            active: true,
            // Margen de 950ms para que el evento Realtime llegue a todos los dispositivos antes de t=0
            startedAt: new Date(Date.now() + 950).toISOString(),
            roles,
            activeZones,
            caught: {},
            infected: {},
            contractTargets,
            contractsCompletedBy: {},
            activeDecoys: [],
            activeCloaks: {},
            abilityUses: {},
            rouletteDurationMs,
            seekerOrder,
            initialSeekers: seekerOrder,
            hideTimeSec,
            extractionBeacon,
            winner: null,
            winReason: null,
            endedAt: null,
          },
        };

        const updated = await updateRoomRules(targetRoomId, nextRules);
        setRoom(updated);
        setView('lobby');
      } catch (err) {
        setGlobalNotice(
          err instanceof Error
            ? err.message
            : 'No se pudo iniciar la partida. Inténtalo de nuevo.'
        );
      } finally {
        setIsStartingMatch(false);
      }
    };

    try {
      void startBackgroundKeepAlive();
      const countdownRules: RoomRules = {
        ...room.rules,
        lobbyCountdown: {
          startedAt: new Date(Date.now() + 200).toISOString(),
          durationSec: countdownDurationSec,
        },
      };
      const updated = await updateRoomRules(targetRoomId, countdownRules);
      setRoom(updated);

      if (countdownTimerRef.current) {
        window.clearTimeout(countdownTimerRef.current);
      }
      countdownTimerRef.current = window.setTimeout(() => {
        countdownTimerRef.current = null;
        void launchMatchNow();
      }, countdownDurationSec * 1000);
    } catch (err) {
      setIsStartingMatch(false);
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar la cuenta regresiva. Inténtalo de nuevo.'
      );
    }
  };

  const handleMarkCaught = async (
    targetPlayerId: string,
    byPlayerId: string | 'storm' | 'anticheat' | 'photo' | 'camp'
  ) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return;

      const existingCaught = baseMatch.caught || {};
      const existingInfected = baseMatch.infected || {};
      if (existingCaught[targetPlayerId] || existingInfected[targetPlayerId]) {
        return;
      }

      const targetRole = baseMatch.roles?.[targetPlayerId] ?? 'hider';
      const isHunterCatch =
        byPlayerId !== 'storm' &&
        byPlayerId !== 'anticheat' &&
        byPlayerId !== 'photo' &&
        byPlayerId !== 'camp';
      const isInfectionCatch =
        Boolean(baseRules.modifiers?.infectionModeEnabled) && isHunterCatch;

      if (isInfectionCatch && targetRole === 'seeker') {
        return;
      }

      const nowIso = new Date().toISOString();
      const nextCaught = isInfectionCatch
        ? existingCaught
        : {
            ...existingCaught,
            [targetPlayerId]: {
              at: nowIso,
              byPlayerId,
            },
          };
      const nextInfected = isInfectionCatch
        ? {
            ...existingInfected,
            [targetPlayerId]: {
              at: nowIso,
              byPlayerId,
            },
          }
        : existingInfected;
      const nextRoles = isInfectionCatch
        ? {
            ...(baseMatch.roles || {}),
            [targetPlayerId]: 'seeker' as PlayerRole,
          }
        : baseMatch.roles || {};

      // Comprobación automática de victoria de buscadores al capturar/infectar al último fugitivo activo
      const activePlayers = latest?.players?.length ? latest.players : players;
      const activePlayerIds = new Set(activePlayers.map((p) => p.id));
      const hadHiders =
        Object.entries(baseMatch.roles || {}).some(
          ([id, role]) =>
            role === 'hider' &&
            (activePlayerIds.size === 0 || activePlayerIds.has(id))
        ) || Object.keys(nextInfected).length > 0;
      const remainingHiders = Object.entries(nextRoles).filter(
        ([id, role]) =>
          role === 'hider' &&
          (activePlayerIds.size === 0 || activePlayerIds.has(id)) &&
          !nextCaught[id]
      ).length;
      const remainingSeekers = Object.entries(nextRoles).filter(
        ([id, role]) =>
          role === 'seeker' &&
          (activePlayerIds.size === 0 || activePlayerIds.has(id)) &&
          !nextCaught[id]
      ).length;
      const shouldSeekersWin =
        !baseMatch.winner && hadHiders && remainingHiders === 0;
      const shouldHidersWin =
        !shouldSeekersWin &&
        !baseMatch.winner &&
        remainingHiders > 0 &&
        remainingSeekers === 0;

      const activeHidersList = activePlayers
        .filter(
          (p) =>
            (nextRoles[p.id] ?? 'hider') === 'hider' && !nextCaught[p.id]
        )
        .map((p) => p.id);

      const nextContractsCompletedBy = {
        ...(baseMatch.contractsCompletedBy || {}),
      };
      if (
        baseRules.modifiers?.contractHuntEnabled &&
        isHunterCatch &&
        baseMatch.contractTargets?.[byPlayerId] === targetPlayerId
      ) {
        nextContractsCompletedBy[byPlayerId] =
          (nextContractsCompletedBy[byPlayerId] ?? 0) + 1;
      }

      const nextContractTargets: Record<string, string> = {
        ...(baseMatch.contractTargets || {}),
      };
      if (baseRules.modifiers?.contractHuntEnabled) {
        let rrIdx = 0;
        Object.entries(nextRoles).forEach(([pid, r]) => {
          if (r !== 'seeker' || nextCaught[pid]) {
            delete nextContractTargets[pid];
            return;
          }
          const curTarget = nextContractTargets[pid];
          if (!curTarget || !activeHidersList.includes(curTarget)) {
            if (activeHidersList.length > 0) {
              nextContractTargets[pid] =
                activeHidersList[rrIdx % activeHidersList.length];
              rrIdx += 1;
            } else {
              delete nextContractTargets[pid];
            }
          }
        });
      }

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          roles: nextRoles,
          caught: nextCaught,
          infected: nextInfected,
          contractTargets: nextContractTargets,
          contractsCompletedBy: nextContractsCompletedBy,
          ...(shouldSeekersWin
            ? {
                winner: 'seekers' as MatchWinner,
                winReason: 'all_caught' as MatchWinReason,
                endedAt: nowIso,
              }
            : shouldHidersWin
            ? {
                winner: 'hiders' as MatchWinner,
                winReason: 'all_caught' as MatchWinReason,
                endedAt: nowIso,
              }
            : {}),
        },
      };

      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar la captura.'
      );
    }
  };

  const handleDeclareWinner = async (
    winner: MatchWinner,
    winReason: MatchWinReason,
    beaconActivatorId?: string
  ): Promise<boolean> => {
    if (!room) return false;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return false;
      if (baseMatch.winner) {
        if (latest?.room) setRoom(latest.room);
        return true;
      }

      const nowIso = new Date().toISOString();
      const nextBeacon =
        beaconActivatorId && baseMatch.extractionBeacon
          ? {
              ...baseMatch.extractionBeacon,
              activatedByPlayerId: beaconActivatorId,
              activatedAt: nowIso,
            }
          : baseMatch.extractionBeacon;

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          winner,
          winReason,
          endedAt: nowIso,
          extractionBeacon: nextBeacon,
        },
      };

      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
      return true;
    } catch {
      return false;
    }
  };

  const handleUndoCaught = async (targetPlayerId: string) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return;

      const nextCaught = { ...(baseMatch.caught || {}) };
      const nextInfected = { ...(baseMatch.infected || {}) };
      const nextRoles = { ...(baseMatch.roles || {}) };

      if (nextCaught[targetPlayerId]) {
        delete nextCaught[targetPlayerId];
      }
      if (nextInfected[targetPlayerId]) {
        delete nextInfected[targetPlayerId];
        nextRoles[targetPlayerId] = 'hider';
      }

      const shouldClearAllCaughtWin =
        baseMatch.winner === 'seekers' && baseMatch.winReason === 'all_caught';

      const activePlayers = latest?.players?.length ? latest.players : players;
      const activeHidersList = activePlayers
        .filter(
          (p) =>
            (nextRoles[p.id] ?? 'hider') === 'hider' && !nextCaught[p.id]
        )
        .map((p) => p.id);
      const nextContractTargets: Record<string, string> = {
        ...(baseMatch.contractTargets || {}),
      };
      if (baseRules.modifiers?.contractHuntEnabled && activeHidersList.length > 0) {
        let rrIdx = 0;
        Object.entries(nextRoles).forEach(([pid, r]) => {
          if (r !== 'seeker' || nextCaught[pid]) {
            delete nextContractTargets[pid];
            return;
          }
          const curTarget = nextContractTargets[pid];
          if (!curTarget || !activeHidersList.includes(curTarget)) {
            nextContractTargets[pid] =
              activeHidersList[rrIdx % activeHidersList.length];
            rrIdx += 1;
          }
        });
      }

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          roles: nextRoles,
          caught: nextCaught,
          infected: nextInfected,
          contractTargets: nextContractTargets,
          ...(shouldClearAllCaughtWin
            ? { winner: null, winReason: null, endedAt: null }
            : {}),
        },
      };

      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo deshacer el registro.'
      );
    }
  };

  const handleActivateAbility = async (
    kind: 'decoy' | 'cloak' | 'sonar' | 'scan',
    coords?: { lat: number; lng: number },
    actorPlayerId?: string
  ): Promise<boolean> => {
    if (!room) return false;
    const actorId = actorPlayerId || playerId;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active || baseMatch.winner) return false;
      if (!(baseRules.modifiers?.abilitiesEnabled ?? true)) return false;

      const maxUses = Math.max(1, baseRules.modifiers?.abilitiesPerPlayer ?? 2);
      const prevUses = baseMatch.abilityUses?.[actorId] ?? 0;
      if (prevUses >= maxUses) return false;

      const nowMs = Date.now() + clockOffsetMs;
      const nextUses = {
        ...(baseMatch.abilityUses || {}),
        [actorId]: prevUses + 1,
      };

      const activeDecoys = (baseMatch.activeDecoys || []).filter(
        (d) => new Date(d.expiresAt).getTime() > nowMs
      );
      const nextCloaks = { ...(baseMatch.activeCloaks || {}) };

      if (kind === 'decoy') {
        if (!coords) return false;
        const playerObj = (latest?.players || players).find(
          (p) => p.id === actorId
        );
        activeDecoys.push({
          id: `decoy_${actorId}_${Math.round(nowMs)}`,
          ownerPlayerId: actorId,
          label: playerObj?.name || 'Fugitivo',
          lat: coords.lat,
          lng: coords.lng,
          expiresAt: new Date(nowMs + 25000).toISOString(),
        });
      } else if (kind === 'cloak') {
        nextCloaks[actorId] = new Date(nowMs + 20000).toISOString();
      }

      const updated = await updateRoomRules(room.id, {
        ...baseRules,
        matchState: {
          ...baseMatch,
          abilityUses: nextUses,
          activeDecoys,
          activeCloaks: nextCloaks,
        },
      });
      setRoom(updated);
      return true;
    } catch {
      return false;
    }
  };

  const handleStartPhotoChallenge = async (windowSec: number) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active || baseMatch.winner) return;

      const existing = baseMatch.photoChallenge;
      if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
        return;
      }

      const nowMs = Date.now() + clockOffsetMs;
      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          photoChallenge: {
            id: `photo_${Math.round(nowMs)}`,
            startedAt: new Date(nowMs).toISOString(),
            expiresAt: new Date(nowMs + windowSec * 1000).toISOString(),
            windowSec,
            completedBy: {},
          },
        },
      };
      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch {
      // Ignorar fallo transitorio; el siguiente ciclo reintentará si hace falta
    }
  };

  const handleSetPhotoChallengeStatus = async (
    challengeId: string,
    targetPlayerId: string,
    status: 'accepted' | 'rejected'
  ) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active || !baseMatch.photoChallenge) return;
      if (baseMatch.photoChallenge.id !== challengeId) return;

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          photoChallenge: {
            ...baseMatch.photoChallenge,
            completedBy: {
              ...(baseMatch.photoChallenge.completedBy || {}),
              [targetPlayerId]: {
                at: new Date().toISOString(),
                status,
              },
            },
          },
        },
      };
      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch {
      // Ignorar
    }
  };

  const handleEliminatePhotoTimeouts = async (targetPlayerIds: string[]) => {
    if (!room || targetPlayerIds.length === 0) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active || baseMatch.winner) return;

      const nowIso = new Date().toISOString();
      const nextCaught = { ...(baseMatch.caught || {}) };
      let changed = false;

      targetPlayerIds.forEach((id) => {
        if (!nextCaught[id]) {
          nextCaught[id] = { at: nowIso, byPlayerId: 'photo' };
          changed = true;
        }
      });

      if (!changed) return;

      const activePlayers = latest?.players?.length ? latest.players : players;
      const roleHiders = Object.entries(baseMatch.roles || {})
        .filter(([, role]) => role === 'hider')
        .map(([id]) => id);
      const activePlayerIds = new Set(activePlayers.map((p) => p.id));
      const hiderIds =
        activePlayerIds.size > 0
          ? roleHiders.filter((id) => activePlayerIds.has(id))
          : roleHiders;
      const hadHiders =
        hiderIds.length > 0 || Object.keys(baseMatch.infected || {}).length > 0;
      const remainingHiders = hiderIds.filter((id) => !nextCaught[id]).length;
      const shouldSeekersWin =
        !baseMatch.winner && hadHiders && remainingHiders === 0;

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          caught: nextCaught,
          ...(shouldSeekersWin
            ? {
                winner: 'seekers' as MatchWinner,
                winReason: 'all_caught' as MatchWinReason,
                endedAt: nowIso,
              }
            : {}),
        },
      };
      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch {
      // Ignorar
    }
  };

  const handleEndMatch = async () => {
    if (!room) return;
    try {
      const nextRules: RoomRules = {
        ...room.rules,
        matchState: null,
      };
      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
      setView('lobby');
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo finalizar la partida.'
      );
    }
  };

  const handleAddBots = async (count: number) => {
    if (!room) return;
    try {
      const nextPlayers = await addBotsToLocalRoom(room.id, count);
      setPlayers(nextPlayers);
      const latest = await fetchRoomState(room.id);
      if (latest?.room) {
        setRoom(latest.room);
      }
    } catch (err) {
      setGlobalNotice(
        err instanceof Error ? err.message : 'No se pudieron añadir bots.'
      );
    }
  };

  const handleRemoveBots = async () => {
    if (!room) return;
    try {
      const nextPlayers = await removeBotsFromLocalRoom(room.id);
      setPlayers(nextPlayers);
      const latest = await fetchRoomState(room.id);
      if (latest?.room) {
        setRoom(latest.room);
      }
    } catch (err) {
      setGlobalNotice(
        err instanceof Error ? err.message : 'No se pudieron quitar los bots.'
      );
    }
  };

  const handleInstantStartMatch = async () => {
    if (!room || players.length < 2 || isStartingMatch) return;
    unlockRetroAudio();
    setIsStartingMatch(true);
    try {
      const latest = await fetchRoomState(room.id);
      const latestRoom = latest?.room ?? room;
      const activePlayers = latest?.players?.length ? latest.players : players;

      const roles: Record<string, PlayerRole> = {};
      if (latestRoom.rules.roleAssignment === 'manual') {
        const manual = latestRoom.rules.manualRoles || {};
        activePlayers.forEach((p) => {
          roles[p.id] = manual[p.id] === 'seeker' ? 'seeker' : 'hider';
        });
        if (!Object.values(roles).some((r) => r === 'seeker')) {
          roles[activePlayers[0].id] = 'seeker';
        }
        if (!Object.values(roles).some((r) => r === 'hider')) {
          roles[activePlayers[activePlayers.length - 1].id] = 'hider';
        }
      } else {
        const ids = activePlayers.map((p) => p.id);
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        const maxSeekers = Math.max(1, ids.length - 1);
        const targetSeekers =
          latestRoom.rules.seekersCount === 'random'
            ? 1
            : Math.max(1, Math.min(Number(latestRoom.rules.seekersCount) || 1, maxSeekers));
        ids.forEach((id, idx) => {
          roles[id] = idx < targetSeekers ? 'seeker' : 'hider';
        });
      }

      const normalizedZones = normalizeZonesConfig(latestRoom.rules);
      const first = normalizedZones.zones[0];
      const activeZones =
        normalizedZones.mode === 'random'
          ? generateRandomZones({
              anchorLat: first?.lat ?? VALENCIA_CENTER.lat,
              anchorLng: first?.lng ?? VALENCIA_CENTER.lng,
              count: normalizedZones.zones.length,
              initialRadius: first?.radius ?? 900,
              defaultWaitSec: first?.waitTimeSec ?? 90,
              defaultShrinkSec: first?.shrinkTimeSec ?? 45,
            })
          : normalizedZones.zones;

      const hideTimeSec = latestRoom.rules.hideTimeSec ?? 15;
      const beaconVictoryEnabled = latestRoom.rules.beaconVictoryEnabled ?? true;
      const beaconRadiusM = latestRoom.rules.modifiers?.beaconRadiusM ?? 25;
      const extractionBeacon = beaconVictoryEnabled
        ? generateExtractionBeacon(
            activeZones,
            latestRoom.rules.roundDuration || 8,
            beaconRadiusM
          )
        : null;

      const contractTargets = latestRoom.rules.modifiers?.contractHuntEnabled
        ? assignInitialContracts(roles, activePlayers)
        : {};

      const nextRules: RoomRules = {
        ...latestRoom.rules,
        lobbyCountdown: null,
        matchState: {
          active: true,
          startedAt: new Date().toISOString(),
          roles,
          activeZones,
          caught: {},
          infected: {},
          contractTargets,
          contractsCompletedBy: {},
          activeDecoys: [],
          activeCloaks: {},
          abilityUses: {},
          rouletteDurationMs: 0,
          seekerOrder: activePlayers
            .filter((p) => roles[p.id] === 'seeker')
            .map((p) => p.id),
          initialSeekers: activePlayers
            .filter((p) => roles[p.id] === 'seeker')
            .map((p) => p.id),
          hideTimeSec,
          extractionBeacon,
          winner: null,
          winReason: null,
          endedAt: null,
        },
      };

      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
      setView('lobby');
    } catch (err) {
      setGlobalNotice(
        err instanceof Error ? err.message : 'No se pudo iniciar al instante.'
      );
    } finally {
      setIsStartingMatch(false);
    }
  };

  const handleQuickStartSoloSandbox = async (infectionMode: boolean) => {
    setIsBusy(true);
    setJoinError(null);
    setGlobalNotice(null);
    leavingSelfRef.current = false;
    kickedHandledRef.current = false;
    setForceLocalSandboxEnabled(true);

    try {
      const sandboxRules: RoomRules = {
        ...structuredClone(DEFAULT_RULES),
        playerCosmetics: {
          [playerId]: getEquippedCosmetics(),
        },
        roundDuration: 8,
        hideTimeSec: 8,
        stormGraceSec: 25,
        seekersCount: 1,
        roleAssignment: 'manual',
        requireLocationGuard: false,
        modifiers: {
          ...structuredClone(DEFAULT_RULES.modifiers),
          infectionModeEnabled: infectionMode,
          contractHuntEnabled: true,
          abilitiesEnabled: true,
          abilitiesPerPlayer: 3,
          radarEnabled: true,
          radarIntervalSec: 15,
          radarRangeM: 400,
          testJoystickEnabled: true,
          testJoystickDefaultSpeed: 'run',
        },
      };

      const { room: createdRoom, player } = await createRoom(
        profile,
        sandboxRules,
        playerId
      );
      setCachedPlayerId(player.id);
      setPlayerId(player.id);

      const allPlayers = await addBotsToLocalRoom(createdRoom.id, 3);
      const afterBots = await fetchRoomState(createdRoom.id);
      const firstBot = allPlayers.find((p) => p.id !== player.id);

      const roles: Record<string, PlayerRole> = {};
      allPlayers.forEach((p) => {
        roles[p.id] = p.id === firstBot?.id ? 'seeker' : 'hider';
      });

      const activeZones = normalizeZonesConfig(sandboxRules).zones;
      const extractionBeacon = generateExtractionBeacon(
        activeZones,
        sandboxRules.roundDuration,
        sandboxRules.modifiers.beaconRadiusM ?? 25
      );
      const contractTargets = assignInitialContracts(roles, allPlayers);

      const launchedRules: RoomRules = {
        ...sandboxRules,
        playerCosmetics:
          afterBots?.room.rules.playerCosmetics ?? sandboxRules.playerCosmetics,
        manualRoles: roles,
        matchState: {
          active: true,
          startedAt: new Date().toISOString(),
          roles,
          activeZones,
          caught: {},
          infected: {},
          contractTargets,
          contractsCompletedBy: {},
          activeDecoys: [],
          activeCloaks: {},
          abilityUses: {},
          rouletteDurationMs: 0,
          seekerOrder: firstBot ? [firstBot.id] : [],
          initialSeekers: firstBot ? [firstBot.id] : [],
          hideTimeSec: sandboxRules.hideTimeSec,
          extractionBeacon,
          winner: null,
          winReason: null,
          endedAt: null,
        },
      };

      const updated = await updateRoomRules(createdRoom.id, launchedRules);
      setRoom(updated);
      setPlayers(allPlayers);
      saveActiveSession({
        roomId: createdRoom.id,
        roomCode: createdRoom.code,
        playerId: player.id,
      });
      setView('lobby');
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar la sala de pruebas.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSandboxUpdateMatchState = async (
    updater: (prevMatch: MatchState, baseRules: RoomRules) => MatchState
  ) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return;
      const nextMatch = updater(baseMatch, baseRules);
      const updated = await updateRoomRules(room.id, {
        ...baseRules,
        matchState: nextMatch,
      });
      setRoom(updated);
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el estado sandbox.'
      );
    }
  };

  const handleToggleRoomLock = async (locked: boolean) => {
    if (!room) return;
    const nextRules: RoomRules = {
      ...room.rules,
      roomLocked: locked,
    };
    setRoom((prev) => (prev ? { ...prev, rules: nextRules } : prev));
    try {
      const updated = await updateRoomRules(room.id, nextRules);
      setRoom(updated);
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo cambiar el estado de entrada de la sala.'
      );
    }
  };

  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!room) return;
    const previousPlayers = players;
    setPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));
    playPlayerKickedSting(false);
    try {
      await kickPlayer(room.id, targetPlayerId);
    } catch (err) {
      setPlayers(previousPlayers);
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo expulsar al jugador.'
      );
    }
  };

  const handleTransferHost = async (nextHostId: string) => {
    if (!room) return;
    try {
      await transferHost(room.id, playerId, nextHostId);
      setRoom((prev) => (prev ? { ...prev, host_id: nextHostId } : prev));
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          is_host: p.id === nextHostId,
        }))
      );
      if (view === 'host_rules') {
        setView('lobby');
      }
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo transferir el mando de anfitrión.'
      );
    }
  };

  const handleUpdateProfileInRoom = async (nextProfile: PlayerProfile) => {
    if (profileSyncTimerRef.current) {
      window.clearTimeout(profileSyncTimerRef.current);
      profileSyncTimerRef.current = null;
    }
    handleProfileChange(nextProfile);
    if (!room) return;
    await updatePlayerProfileInRoom(playerId, room.id, nextProfile);
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              name: nextProfile.name.trim().slice(0, 12),
              emoji: nextProfile.emoji,
              color: nextProfile.color,
            }
          : p
      )
    );
  };

  const handleSettingsProfileChange = (nextProfile: PlayerProfile) => {
    handleProfileChange(nextProfile);
    if (!room || nextProfile.name.trim().length < 2) return;
    const roomId = room.id;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? {
              ...p,
              name: nextProfile.name.trim().slice(0, 12),
              emoji: nextProfile.emoji,
              color: nextProfile.color,
            }
          : p
      )
    );
    if (profileSyncTimerRef.current) {
      window.clearTimeout(profileSyncTimerRef.current);
    }
    profileSyncTimerRef.current = window.setTimeout(() => {
      profileSyncTimerRef.current = null;
      void updatePlayerProfileInRoom(playerId, roomId, nextProfile).catch(
        () => {}
      );
    }, 250);
  };

  const handleLeaveRoom = async () => {
    if (countdownTimerRef.current) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (profileSyncTimerRef.current) {
      window.clearTimeout(profileSyncTimerRef.current);
      profileSyncTimerRef.current = null;
    }
    setIsStartingMatch(false);
    setLobbyCountdownRemainingSec(null);
    if (!room) {
      setView('home');
      return;
    }
    leavingSelfRef.current = true;
    const hostFlag = room.host_id === playerId;
    await leaveRoom(room.id, playerId, hostFlag);
    saveActiveSession(null);
    setRoom(null);
    setPlayers([]);
    setView('home');
  };

  if (room && isMatchActive) {
    return (
      <>
        <MatchScreen
          room={room}
          players={players}
          currentPlayerId={playerId}
          clockOffsetMs={clockOffsetMs}
          myLocationStatus={myLocationStatus}
          peerLocationStatuses={peerLocationStatuses}
          onRecheckLocation={handleRecheckLocation}
          onMarkCaught={handleMarkCaught}
          onUndoCaught={handleUndoCaught}
          onStartPhotoChallenge={handleStartPhotoChallenge}
          onSetPhotoChallengeStatus={handleSetPhotoChallengeStatus}
          onEliminatePhotoTimeouts={handleEliminatePhotoTimeouts}
          onDeclareWinner={handleDeclareWinner}
          onActivateAbility={handleActivateAbility}
          onEndMatch={handleEndMatch}
          onLeaveRoom={handleLeaveRoom}
          sandboxUnlocked={sandboxUnlocked}
          onSandboxUpdateMatchState={handleSandboxUpdateMatchState}
        />
        <OfflineIndicator />
        {kickedInfo && (
          <KickedOverlay
            playerName={kickedInfo.playerName}
            playerEmoji={kickedInfo.playerEmoji}
            playerColor={kickedInfo.playerColor}
            roomCode={kickedInfo.roomCode}
            onClose={() => setKickedInfo(null)}
          />
        )}
      </>
    );
  }

  const handleHeaderBrandClick = () => {
    const now = Date.now();
    if (now - logoTapRef.current.lastMs > 2200) {
      logoTapRef.current.count = 0;
    }
    logoTapRef.current.count += 1;
    logoTapRef.current.lastMs = now;

    if (logoTapRef.current.count >= 5) {
      logoTapRef.current.count = 0;
      unlockRetroAudio();
      playPixelUiClick('toggle');
      setShowDebugModal(true);
      return;
    }

    setShowSettings(false);
    if (room) {
      setView('lobby');
    } else {
      setView('home');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Cabecera limpia de 1 sola línea */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-13 max-w-5xl items-center justify-between gap-2 px-3 sm:px-6">
          <button
            type="button"
            onClick={handleHeaderBrandClick}
            className="inline-flex items-center gap-2 font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <PixelBalizaMark className="h-6 w-6 shrink-0" />
            <span>Baliza</span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div
              role="tablist"
              aria-label="Navegación principal"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100/90 p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!showSettings}
                onClick={() => setShowSettings(false)}
                className={`inline-flex min-h-[32px] items-center rounded-lg px-2.5 sm:px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  !showSettings
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Juego
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showSettings}
                onClick={() => setShowSettings(true)}
                className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 sm:px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  showSettings
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ajustes</span>
              </button>
            </div>

            <ShareAppButton variant="header" />

            {!showSettings && room && view === 'host_rules' ? (
              <button
                type="button"
                onClick={() => setView('lobby')}
                className="inline-flex min-h-[36px] items-center rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Volver a sala
              </button>
            ) : (
              <PWAInstallButton />
            )}
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {globalNotice && !showSettings && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
          >
            <span>{globalNotice}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="text-xs font-semibold text-amber-900 hover:underline shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {showSettings ? (
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            profile={profile}
            onProfileChange={handleSettingsProfileChange}
            isInRoom={Boolean(room)}
            onOpenAchievements={() => setShowAchievements(true)}
          />
        ) : (
          <>
            {view === 'home' && (
              <HomeScreen
                profile={profile}
                onProfileChange={handleProfileChange}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
                initialJoinCode={initialJoinCode}
                isBusy={isBusy}
                joinError={joinError}
                onClearJoinError={() => setJoinError(null)}
                sandboxUnlocked={sandboxUnlocked}
                onQuickStartSoloSandbox={handleQuickStartSoloSandbox}
                onOpenAchievements={() => setShowAchievements(true)}
              />
            )}

            {room && view === 'host_rules' && (
              <RulesEditor
                rules={room.rules}
                roomCode={room.code}
                players={players}
                currentPlayerId={playerId}
                isSaving={isSavingRules}
                onSave={handleSaveRules}
                onCancel={() => setView('lobby')}
                onCloseRoom={handleLeaveRoom}
                submitLabel="Guardar cambios"
              />
            )}

            {room && view === 'lobby' && (
              <LobbyScreen
                room={room}
                players={players}
                currentPlayerId={playerId}
                profile={profile}
                myLocationStatus={myLocationStatus}
                peerLocationStatuses={peerLocationStatuses}
                onRecheckLocation={handleRecheckLocation}
                onUpdateProfileInRoom={handleUpdateProfileInRoom}
                onToggleRoomLock={handleToggleRoomLock}
                onKickPlayer={handleKickPlayer}
                onTransferHost={handleTransferHost}
                onUpdateManualRoles={handleUpdateManualRoles}
                onEditRules={() => setView('host_rules')}
                onStartMatch={handleStartMatch}
                isStartingMatch={isStartingMatch}
                countdownRemainingSec={lobbyCountdownRemainingSec}
                onLeaveRoom={handleLeaveRoom}
                sandboxUnlocked={sandboxUnlocked}
                onAddBots={handleAddBots}
                onRemoveBots={handleRemoveBots}
                onInstantStartMatch={handleInstantStartMatch}
              />
            )}
          </>
        )}
      </main>

      {room && (
        <LobbyToastHost
          toasts={lobbyToasts}
          countdownRemainingSec={lobbyCountdownRemainingSec}
          onDismiss={dismissLobbyToast}
        />
      )}

      <OfflineIndicator />
      {kickedInfo && (
        <KickedOverlay
          playerName={kickedInfo.playerName}
          playerEmoji={kickedInfo.playerEmoji}
          playerColor={kickedInfo.playerColor}
          roomCode={kickedInfo.roomCode}
          onClose={() => setKickedInfo(null)}
        />
      )}
      {showAchievements && (
        <AchievementsModal onClose={() => setShowAchievements(false)} />
      )}
      {showDebugModal && (
        <DebugUnlockModal
          isCurrentlyUnlocked={sandboxUnlocked}
          onConfirmActivate={() => {
            setSecretSandboxUnlocked(true);
            syncDebugCosmeticsOnToggle(true);
            unlockRetroAudio();
            playSecretUnlockChime();
            setGlobalNotice('🧪 Modo Debug activado (Solo · Sin DB · Cosméticos guardados).');
            setShowDebugModal(false);
          }}
          onConfirmDeactivate={() => {
            setSecretSandboxUnlocked(false);
            syncDebugCosmeticsOnToggle(false);
            setGlobalNotice(null);
            setShowDebugModal(false);
          }}
          onClose={() => setShowDebugModal(false)}
        />
      )}
    </div>
  );
}
