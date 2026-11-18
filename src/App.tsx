import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { MatchScreen } from './components/MatchScreen';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { RulesEditor } from './components/RulesEditor';
import {
  createRoom,
  fetchRoomState,
  joinRoom,
  kickPlayer,
  leaveRoom,
  subscribeToRoom,
  transferHost,
  updatePlayerProfileInRoom,
  updateRoomRules,
} from './lib/roomService';
import { unlockRetroAudio } from './lib/retroAudio';
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
  generateRandomZones,
  normalizeZonesConfig,
  VALENCIA_CENTER,
} from './lib/zones';
import {
  DEFAULT_RULES,
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
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [globalNotice, setGlobalNotice] = useState<string | null>(
    supabaseConfigError
  );
  const leavingSelfRef = useRef(false);

  const handleProfileChange = useCallback((next: PlayerProfile) => {
    setProfile(next);
    saveProfile(next);
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

  // Suscripción en tiempo real a cambios de la sala y jugadores (se reconecta tras reposo)
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

        // Si el jugador actual ya no está en la lista de una sala activa y no salió por su cuenta, fue expulsado
        if (
          !leavingSelfRef.current &&
          updatedPlayers.length > 0 &&
          !updatedPlayers.some((p) => p.id === playerId)
        ) {
          saveActiveSession(null);
          setRoom(null);
          setPlayers([]);
          setView('home');
          setGlobalNotice('Has sido expulsado de la sala por el anfitrión.');
        }
      },
    });

    return unsubscribe;
  }, [room?.id, playerId, reconnectKey]);

  // Prevenir cierre/refresco accidental, mantener pantalla despierta (Wake Lock)
  // y re-sincronizar automáticamente tras modo reposo o reapertura de la app
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
          saveActiveSession(null);
          setRoom(null);
          setPlayers([]);
          setView('home');
          setGlobalNotice('Has sido expulsado de la sala por el anfitrión.');
          return;
        }
        setRoom(state.room);
        setPlayers(state.players);
      } catch {
        // Ignorar fallo transitorio de red al despertar; volverá a intentar
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
      } else {
        const ids = players.map((p) => p.id);
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        const maxSeekers = Math.max(1, ids.length - 1);
        const targetSeekers =
          room.rules.seekersCount === 'random'
            ? 1 + Math.floor(Math.random() * Math.min(2, maxSeekers))
            : Math.min(room.rules.seekersCount, maxSeekers);

        ids.forEach((id, index) => {
          roles[id] = index < targetSeekers ? 'seeker' : 'hider';
        });
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

      const nextRules: RoomRules = {
        ...room.rules,
        matchState: {
          active: true,
          startedAt: new Date().toISOString(),
          roles,
          activeZones,
          caught: {},
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
    byPlayerId: string | 'storm'
  ) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return;
      const existingCaught = baseMatch.caught || {};
      if (existingCaught[targetPlayerId]) return;

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          caught: {
            ...existingCaught,
            [targetPlayerId]: {
              at: new Date().toISOString(),
              byPlayerId,
            },
          },
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

  const handleUndoCaught = async (targetPlayerId: string) => {
    if (!room) return;
    try {
      const latest = await fetchRoomState(room.id);
      const baseRules = latest?.room.rules ?? room.rules;
      const baseMatch = baseRules.matchState;
      if (!baseMatch?.active) return;
      const nextCaught = { ...(baseMatch.caught || {}) };
      delete nextCaught[targetPlayerId];

      const nextRules: RoomRules = {
        ...baseRules,
        matchState: {
          ...baseMatch,
          caught: nextCaught,
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
    try {
      await kickPlayer(room.id, targetPlayerId);
      setPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));
    } catch (err) {
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
    const isHost = room.host_id === playerId;
    await leaveRoom(room.id, playerId, isHost);
    saveActiveSession(null);
    setRoom(null);
    setPlayers([]);
    setView('home');
  };

  const isHost = Boolean(room && room.host_id === playerId);
  const isMatchActive = Boolean(room && room.rules?.matchState?.active);

  if (room && isMatchActive) {
    return (
      <>
        <MatchScreen
          room={room}
          players={players}
          currentPlayerId={playerId}
          onMarkCaught={handleMarkCaught}
          onUndoCaught={handleUndoCaught}
          onEndMatch={handleEndMatch}
          onLeaveRoom={handleLeaveRoom}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 urban-grid-bg flex flex-col">
      {/* Barra superior limpia */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              if (room) {
                setView('lobby');
              } else {
                setView('home');
              }
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            Baliza
          </button>

          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-5 text-sm font-medium text-slate-600"
          >
            {room && (
              <button
                type="button"
                onClick={() => setView('lobby')}
                className={`min-h-[44px] inline-flex items-center hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                  view === 'lobby' ? 'text-emerald-700 font-semibold' : ''
                }`}
              >
                Sala
              </button>
            )}
            {room && isHost && (
              <button
                type="button"
                onClick={() => setView('host_rules')}
                className={`min-h-[44px] inline-flex items-center hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                  view === 'host_rules' ? 'text-emerald-700 font-semibold' : ''
                }`}
              >
                Reglas
              </button>
            )}
          </nav>

          <div className="flex items-center shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        {globalNotice && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
          >
            <span>{globalNotice}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="min-h-[40px] px-2 text-xs font-semibold underline whitespace-nowrap"
            >
              Cerrar
            </button>
          </div>
        )}

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
            submitLabel="Guardar y volver a la sala"
          />
        )}

        {room && view === 'lobby' && (
          <LobbyScreen
            room={room}
            players={players}
            currentPlayerId={playerId}
            profile={profile}
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
      </main>

      {/* Pie discreto */}
      <footer className="border-t border-slate-200/80 bg-white/60 py-4 text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span>Baliza · Juego urbano en tiempo real</span>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
