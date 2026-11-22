import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coffee, Settings } from 'lucide-react';
import { HomeScreen } from './components/HomeScreen';
import { KickedOverlay } from './components/KickedOverlay';
import { LobbyScreen } from './components/LobbyScreen';
import { MatchScreen } from './components/MatchScreen';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { PixelBalizaMark } from './components/PixelIcons';
import { RulesEditor } from './components/RulesEditor';
import { SettingsPanel } from './components/SettingsPanel';
import {
  ROULETTE_FINAL_MS,
  ROULETTE_ROUND_MS,
} from './components/SeekerRouletteOverlay';
import {
  createRoom,
  fetchRoomState,
  joinRoom,
  kickPlayer,
  leaveRoom,
  subscribeToRoom,
  subscribeToRoomClockSync,
  subscribeToRoomLocationGuard,
  transferHost,
  updatePlayerProfileInRoom,
  updateRoomRules,
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
  unlockRetroAudio,
} from './lib/retroAudio';
import {
  APP_AUTHOR,
  APP_VERSION,
  BUY_ME_A_COFFEE_URL,
  applyPreferencesToDocument,
  loadPreferences,
} from './lib/preferences';
import {
  getPlayerId,
  loadActiveSession,
  loadProfile,
  markTabInactive,
  sanitizeRoomCode,
  saveActiveSession,
  saveProfile,
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
  MatchWinReason,
  MatchWinner,
  PlayerProfile,
  PlayerRecord,
  PlayerRole,
  RoomRecord,
  RoomRules,
} from './types/game';

type AppView = 'home' | 'host_rules' | 'lobby';

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [playerId] = useState<string>(() => getPlayerId());
  const [view, setView] = useState<AppView>('home');
  const [showSettings, setShowSettings] = useState(false);
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

  const leavingSelfRef = useRef(false);
  const kickedHandledRef = useRef(false);
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

  const handleProfileChange = useCallback((next: PlayerProfile) => {
    setProfile(next);
    saveProfile(next);
  }, []);

  // Aplicar preferencias guardadas (tema, fuente, animaciones) al iniciar
  useEffect(() => {
    applyPreferencesToDocument(loadPreferences());
  }, []);

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
          saveActiveSession(null);
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
    const unsubscribe = subscribeToRoom(room.id, {
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
        setPlayers(updatedPlayers);
        if (
          !leavingSelfRef.current &&
          updatedPlayers.length > 0 &&
          !updatedPlayers.some((p) => p.id === playerId)
        ) {
          triggerKickedOut();
        }
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
  }, [room?.id, playerId, reconnectKey, triggerKickedOut]);

  // Wake Lock y resincronización automática
  useEffect(() => {
    if (!room?.id) return;
    const activeRoomId = room.id;

    touchSessionHeartbeat(playerId);
    const heartbeatTimer = window.setInterval(() => {
      touchSessionHeartbeat(playerId);
    }, 3000);

    let wakeLockSentinel: WakeLockSentinel | null = null;

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

    const resyncFromServer = async () => {
      touchSessionHeartbeat(playerId);
      void requestWakeLock();
      setReconnectKey((k) => k + 1);
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
          triggerKickedOut();
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
        void resyncFromServer();
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

    const handleFocusOrOnline = () => {
      if (document.visibilityState === 'visible') {
        void resyncFromServer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('focus', handleFocusOrOnline);
    window.addEventListener('online', handleFocusOrOnline);

    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('focus', handleFocusOrOnline);
      window.removeEventListener('online', handleFocusOrOnline);
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

  const handleCreateRoom = async () => {
    setIsBusy(true);
    setJoinError(null);
    setGlobalNotice(null);
    leavingSelfRef.current = false;
    try {
      const { room: createdRoom, player } = await createRoom(
        profile,
        DEFAULT_RULES
      );
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
    try {
      const result = await joinRoom(code, profile);
      setRoom(result.room);
      setPlayers(result.players);
      saveActiveSession({
        roomId: result.room.id,
        roomCode: result.room.code,
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
      const updated = await updateRoomRules(room.id, nextRules);
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

    setIsStartingMatch(true);
    try {
      const roles: Record<string, PlayerRole> = {};
      let seekerOrder: string[] = [];
      let rouletteDurationMs = 0;

      if (room.rules.roleAssignment === 'manual') {
        const manual = room.rules.manualRoles || {};
        players.forEach((p) => {
          roles[p.id] = manual[p.id] === 'seeker' ? 'seeker' : 'hider';
        });
        const hasSeeker = Object.values(roles).some((r) => r === 'seeker');
        const hasHider = Object.values(roles).some((r) => r === 'hider');
        if (!hasSeeker) {
          roles[players[0].id] = 'seeker';
        }
        if (!hasHider) {
          roles[players[players.length - 1].id] = 'hider';
        }
        seekerOrder = players
          .filter((p) => roles[p.id] === 'seeker')
          .map((p) => p.id);
      } else {
        const ids = players.map((p) => p.id);
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        const maxSeekers = Math.max(1, ids.length - 1);
        const randomMax = Math.max(1, Math.min(maxSeekers, Math.max(2, Math.round(ids.length / 3))));
        const targetSeekers =
          room.rules.seekersCount === 'random'
            ? 1 + Math.floor(Math.random() * randomMax)
            : Math.max(1, Math.min(Number(room.rules.seekersCount) || 1, maxSeekers));

        ids.forEach((id, index) => {
          roles[id] = index < targetSeekers ? 'seeker' : 'hider';
        });
        seekerOrder = ids.slice(0, targetSeekers);
        rouletteDurationMs =
          seekerOrder.length * ROULETTE_ROUND_MS + ROULETTE_FINAL_MS;
      }

      const normalizedZones = normalizeZonesConfig(room.rules);
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

      const hideTimeSec = room.rules.hideTimeSec ?? 30;
      const beaconVictoryEnabled = room.rules.beaconVictoryEnabled ?? true;
      const beaconRadiusM = room.rules.modifiers?.beaconRadiusM ?? 25;
      const extractionBeacon = beaconVictoryEnabled
        ? generateExtractionBeacon(
            activeZones,
            room.rules.roundDuration || 30,
            beaconRadiusM
          )
        : null;

      void startBackgroundKeepAlive();

      const nextRules: RoomRules = {
        ...room.rules,
        matchState: {
          active: true,
          // Margen de 950ms para que el evento Realtime llegue a todos los dispositivos antes de t=0
          startedAt: new Date(Date.now() + 950).toISOString(),
          roles,
          activeZones,
          caught: {},
          rouletteDurationMs,
          seekerOrder,
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
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar la partida. Inténtalo de nuevo.'
      );
    } finally {
      setIsStartingMatch(false);
    }
  };

  const handleMarkCaught = async (
    targetPlayerId: string,
    byPlayerId: string | 'storm' | 'anticheat' | 'photo'
  ) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return;

      const existingCaught = baseMatch.caught || {};
      if (existingCaught[targetPlayerId]) return;

      const nowIso = new Date().toISOString();
      const nextCaught = {
        ...existingCaught,
        [targetPlayerId]: {
          at: nowIso,
          byPlayerId,
        },
      };

      // Comprobación automática de victoria de buscadores al capturar al último fugitivo activo
      const activePlayers = latest?.players?.length ? latest.players : players;
      const roleHiders = Object.entries(baseMatch.roles || {})
        .filter(([, role]) => role === 'hider')
        .map(([id]) => id);
      const activePlayerIds = new Set(activePlayers.map((p) => p.id));
      const hiderIds =
        activePlayerIds.size > 0
          ? roleHiders.filter((id) => activePlayerIds.has(id))
          : roleHiders;
      const remainingHiders = hiderIds.filter((id) => !nextCaught[id]).length;
      const shouldSeekersWin =
        !baseMatch.winner && hiderIds.length > 0 && remainingHiders === 0;

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
    } catch (err) {
      setGlobalNotice(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar la eliminación.'
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
      delete nextCaught[targetPlayerId];

      const shouldClearAllCaughtWin =
        baseMatch.winner === 'seekers' && baseMatch.winReason === 'all_caught';

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          caught: nextCaught,
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
      const remainingHiders = hiderIds.filter((id) => !nextCaught[id]).length;
      const shouldSeekersWin =
        !baseMatch.winner && hiderIds.length > 0 && remainingHiders === 0;

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

  const handleLeaveRoom = async () => {
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
          onEndMatch={handleEndMatch}
          onLeaveRoom={handleLeaveRoom}
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Cabecera limpia de 1 sola línea */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setShowSettings(false);
              if (room) {
                setView('lobby');
              } else {
                setView('home');
              }
            }}
            className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <PixelBalizaMark className="h-6 w-6 shrink-0" />
            <span>Baliza</span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
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
                className={`inline-flex min-h-[34px] items-center rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
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
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  showSettings
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Configuración</span>
              </button>
            </div>

            {!showSettings && room && view === 'host_rules' ? (
              <button
                type="button"
                onClick={() => setView('lobby')}
                className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Volver a la sala
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
          <SettingsPanel onClose={() => setShowSettings(false)} />
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
                onLeaveRoom={handleLeaveRoom}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white/85 px-4 py-3.5 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span className="font-semibold text-slate-700">Baliza</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-slate-700">
              v{APP_VERSION}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Creado por{' '}
              <strong className="font-semibold text-slate-700">
                {APP_AUTHOR}
              </strong>
            </span>
          </div>
          <a
            href={BUY_ME_A_COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-100"
          >
            <Coffee className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
            <span>Buy Me a Coffee</span>
          </a>
        </div>
      </footer>

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
    </div>
  );
}
