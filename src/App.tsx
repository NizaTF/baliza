import React, { useCallback, useEffect, useState } from 'react';
import { InfoModal } from './components/InfoModal';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { RulesEditor } from './components/RulesEditor';
import {
  createRoom,
  fetchRoomState,
  joinRoom,
  leaveRoom,
  subscribeToRoom,
  updatePlayerProfileInRoom,
  updateRoomRules,
} from './lib/roomService';
import {
  getPlayerId,
  loadActiveSession,
  loadProfile,
  sanitizeRoomCode,
  saveActiveSession,
  saveProfile,
} from './lib/storage';
import {
  DEFAULT_RULES,
  PlayerProfile,
  PlayerRecord,
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
  const [joinError, setJoinError] = useState<string | null>(null);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

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
          setGlobalNotice('El anfitrión cerró la sala.');
          return;
        }
        setRoom(updatedRoom);
      },
      onPlayersChange: (updatedPlayers) => {
        setPlayers(updatedPlayers);
      },
    });

    return unsubscribe;
  }, [room?.id]);

  const handleCreateRoom = async () => {
    setIsBusy(true);
    setJoinError(null);
    setGlobalNotice(null);
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
      setView('host_rules');
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
    const isHost = room.host_id === playerId;
    await leaveRoom(room.id, playerId, isHost);
    saveActiveSession(null);
    setRoom(null);
    setPlayers([]);
    setView('home');
  };

  const isHost = Boolean(room && room.host_id === playerId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 urban-grid-bg flex flex-col">
      {/* Barra superior compacta (3 zonas) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
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
            Escondite Urbano
          </button>

          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-5 text-sm font-medium text-slate-600"
          >
            {room && (
              <button
                type="button"
                onClick={() => setView('lobby')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                  view === 'lobby' ? 'text-emerald-700 font-semibold' : ''
                }`}
              >
                Lobby
              </button>
            )}
            {room && isHost && (
              <button
                type="button"
                onClick={() => setView('host_rules')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
                  view === 'host_rules' ? 'text-emerald-700 font-semibold' : ''
                }`}
              >
                Reglas
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Guía y Supabase
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {globalNotice && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
          >
            <span>{globalNotice}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="text-xs font-semibold underline whitespace-nowrap"
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

        {view === 'host_rules' && room && (
          <RulesEditor
            rules={room.rules}
            roomCode={room.code}
            isSaving={isSavingRules}
            onSave={handleSaveRules}
            onCancel={() => setView('lobby')}
            submitLabel="Guardar e ir al lobby"
          />
        )}

        {view === 'lobby' && room && (
          <LobbyScreen
            room={room}
            players={players}
            currentPlayerId={playerId}
            profile={profile}
            onUpdateProfileInRoom={handleUpdateProfileInRoom}
            onEditRules={() => setView('host_rules')}
            onLeaveRoom={handleLeaveRoom}
          />
        )}
      </main>

      {/* Pie discreto */}
      <footer className="border-t border-slate-200/80 bg-white/60 py-4 text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <span>Escondite Urbano · v0.1 (Creación de sala y modificadores)</span>
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="font-medium text-slate-600 hover:text-slate-900 hover:underline"
          >
            Configurar Supabase y GitHub Pages
          </button>
        </div>
      </footer>

      <InfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />

      <OfflineIndicator />
    </div>
  );
}
