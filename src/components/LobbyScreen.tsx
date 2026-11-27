import React, { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FlaskConical,
  Lock,
  LogOut,
  MapPinOff,
  MoreVertical,
  Pencil,
  Play,
  Share2,
  SlidersHorizontal,
  Trash2,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import { startBackgroundKeepAlive } from '../lib/backgroundRunner';
import { getEquippedCosmetics, subscribePreferences } from '../lib/preferences';
import { isBotPlayerId, subscribeSecretSandbox } from '../lib/soloSandbox';
import {
  LocationGuardStatus,
  PlayerProfile,
  PlayerRecord,
  PlayerRole,
  RoomRecord,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCosmeticName } from './PlayerCosmeticName';
import { ProfileCustomizer } from './ProfileCustomizer';
import { RulesSummary } from './RulesSummary';

interface LobbyScreenProps {
  room: RoomRecord;
  players: PlayerRecord[];
  currentPlayerId: string;
  profile: PlayerProfile;
  myLocationStatus?: LocationGuardStatus;
  peerLocationStatuses?: Record<string, LocationGuardStatus>;
  onRecheckLocation?: () => Promise<void>;
  onUpdateProfileInRoom: (nextProfile: PlayerProfile) => Promise<void>;
  onToggleRoomLock: (locked: boolean) => Promise<void>;
  onKickPlayer: (targetPlayerId: string) => Promise<void>;
  onTransferHost: (nextHostId: string) => Promise<void>;
  onUpdateManualRoles: (manualRoles: Record<string, PlayerRole>) => Promise<void>;
  onEditRules: () => void;
  onStartMatch: () => Promise<void>;
  isStartingMatch?: boolean;
  countdownRemainingSec?: number | null;
  onLeaveRoom: () => Promise<void>;
  sandboxUnlocked?: boolean;
  onAddBots?: (count: number) => Promise<void>;
  onRemoveBots?: () => Promise<void>;
  onInstantStartMatch?: () => Promise<void>;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  players,
  currentPlayerId,
  profile,
  myLocationStatus = 'unsupported',
  peerLocationStatuses = {},
  onRecheckLocation,
  onUpdateProfileInRoom,
  onToggleRoomLock,
  onKickPlayer,
  onTransferHost,
  onUpdateManualRoles,
  onEditRules,
  onStartMatch,
  isStartingMatch = false,
  countdownRemainingSec = null,
  onLeaveRoom,
  sandboxUnlocked = false,
  onAddBots,
  onRemoveBots,
  onInstantStartMatch,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState<PlayerProfile>(profile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [menuPlayerId, setMenuPlayerId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
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

  const isHost = room.host_id === currentPlayerId;
  const isLocked = Boolean(room.rules?.roomLocked);
  const locationGuardEnabled = room.rules?.requireLocationGuard ?? true;
  const isCountingDown =
    countdownRemainingSec !== null && countdownRemainingSec > 0;
  const canStartMatch =
    players.length >= 2 && !isStartingMatch && !isCountingDown;
  const isManualRoles = room.rules.roleAssignment === 'manual';
  const manualRoles = room.rules.manualRoles || {};

  const handleSetManualRole = async (targetId: string, role: PlayerRole) => {
    await onUpdateManualRoles({
      ...manualRoles,
      [targetId]: role,
    });
  };

  const getShareUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('sala', room.code);
    return url.toString();
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleShare = async () => {
    const shareUrl = getShareUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Únete a Baliza (${room.code})`,
          text: `Entra con el código ${room.code}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setSharedFeedback(true);
      setTimeout(() => setSharedFeedback(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSaveProfileModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftProfile.name.trim().length < 2) return;
    setSavingProfile(true);
    try {
      await onUpdateProfileInRoom(draftProfile);
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleStartClick = async () => {
    void startBackgroundKeepAlive();
    await onStartMatch();
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await onLeaveRoom();
    } finally {
      setLeaving(false);
    }
  };

  const handleKick = async (targetId: string) => {
    setMenuPlayerId(null);
    setActionBusyId(targetId);
    try {
      await onKickPlayer(targetId);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleTransfer = async (nextHostId: string) => {
    setMenuPlayerId(null);
    setActionBusyId(nextHostId);
    try {
      await onTransferHost(nextHostId);
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Cabecera simple de sala */}
      <section className="clean-card p-4 sm:p-5">
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {players.length} {players.length === 1 ? 'jugador' : 'jugadores'}
              {' · '}
              {isLocked ? 'Sala cerrada' : 'Sala abierta'}
              {isHost ? ' · Tú organizas' : ''}
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.16em] text-slate-900 select-all">
                {room.code}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                aria-label="Copiar código de sala"
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span className="text-emerald-700">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {sharedFeedback ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  <span>Enlace copiado</span>
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span>Invitar</span>
                </>
              )}
            </button>

            {isHost && (
              <button
                type="button"
                onClick={() => onToggleRoomLock(!isLocked)}
                title={isLocked ? 'Abrir sala' : 'Cerrar sala'}
                aria-label={isLocked ? 'Abrir entrada' : 'Cerrar entrada'}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                {isLocked ? (
                  <>
                    <Unlock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    <span>Abrir</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    <span>Cerrar</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Aviso GPS solo si hace falta */}
      {locationGuardEnabled && myLocationStatus === 'disabled' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <span className="flex items-center gap-2 font-medium">
            <MapPinOff className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
            <span>Activa el GPS del móvil para poder jugar.</span>
          </span>
          {onRecheckLocation && (
            <button
              type="button"
              onClick={() => void onRecheckLocation()}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Comprobar GPS
            </button>
          )}
        </div>
      )}

      {/* Contenido en 2 columnas limpias */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Lista de jugadores */}
        <section className="clean-card p-4 sm:p-5 lg:col-span-7">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Jugadores ({players.length})
            </h2>
            {isManualRoles && (
              <span className="text-xs font-medium text-slate-500">
                Reparto manual
              </span>
            )}
          </div>

          <ul className="divide-y divide-slate-100">
            {players.map((player) => {
              const isSelf = player.id === currentPlayerId;
              const isMenuOpen = menuPlayerId === player.id;
              const isBusyRow = actionBusyId === player.id;
              const locStatus = isSelf
                ? myLocationStatus
                : peerLocationStatuses[player.id];
              const pCosmetics = isSelf
                ? myEquippedCosmetics
                : room.rules.playerCosmetics?.[player.id];

              return (
                <li key={player.id} className="py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar
                        emoji={player.emoji}
                        color={player.color}
                        size="sm"
                        name={player.name}
                        avatarEffectId={pCosmetics?.avatarEffectId}
                      />
                      <div className="min-w-0">
                        <PlayerCosmeticName
                          name={player.name}
                          cosmetics={pCosmetics}
                          compactTitle
                          suffix={
                            isSelf ? (
                              <span className="text-xs font-medium text-emerald-700">
                                (Tú)
                              </span>
                            ) : undefined
                          }
                        />
                        <p className="text-xs text-slate-500">
                          {player.is_host ? 'Anfitrión' : 'Jugador'}
                          {locationGuardEnabled && locStatus === 'disabled' && (
                            <span className="text-rose-600"> · Sin GPS</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isManualRoles && (
                        isHost ? (
                          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                            <button
                              type="button"
                              onClick={() => handleSetManualRole(player.id, 'hider')}
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                (manualRoles[player.id] ?? 'hider') === 'hider'
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Fugitivo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetManualRole(player.id, 'seeker')}
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                manualRoles[player.id] === 'seeker'
                                  ? 'bg-rose-600 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Buscador
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              manualRoles[player.id] === 'seeker'
                                ? 'text-rose-600'
                                : 'text-emerald-700'
                            }`}
                          >
                            {manualRoles[player.id] === 'seeker'
                              ? 'Buscador'
                              : 'Fugitivo'}
                          </span>
                        )
                      )}

                      {isSelf && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftProfile(profile);
                            setEditingProfile(true);
                          }}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span>Editar</span>
                        </button>
                      )}

                      {isHost && !isSelf && (
                        <button
                          type="button"
                          onClick={() =>
                            setMenuPlayerId(isMenuOpen ? null : player.id)
                          }
                          disabled={isBusyRow}
                          aria-label={`Opciones para ${player.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isHost && !isSelf && isMenuOpen && (
                    <div className="flex items-center justify-end gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleTransfer(player.id)}
                        disabled={isBusyRow}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Hacer anfitrión
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKick(player.id)}
                        disabled={isBusyRow}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
                      >
                        Expulsar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Reglas y empezar */}
        <section className="clean-card p-4 sm:p-5 space-y-4 lg:col-span-5">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 mb-1.5">
              Resumen de partida
            </h2>
            <RulesSummary rules={room.rules} />
          </div>

          <div className="space-y-2.5 border-t border-slate-100 pt-4">
            {isHost ? (
              <>
                <button
                  type="button"
                  disabled={!canStartMatch}
                  onClick={handleStartClick}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                >
                  <Play className="h-5 w-5" aria-hidden="true" />
                  <span>
                    {isCountingDown
                      ? `Empezando en ${Math.ceil(countdownRemainingSec!)} s...`
                      : isStartingMatch
                      ? 'Empezando...'
                      : 'Empezar partida'}
                  </span>
                </button>

                {players.length < 2 && (
                  <p className="text-center text-xs text-slate-500">
                    Falta al menos 1 jugador más ({players.length}/2)
                  </p>
                )}

                <button
                  type="button"
                  onClick={onEditRules}
                  disabled={isCountingDown}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span>Cambiar reglas y mapa</span>
                </button>
              </>
            ) : (
              <p
                className={`rounded-xl px-4 py-3 text-center text-sm font-medium ${
                  isCountingDown
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'bg-slate-50 text-slate-600'
                }`}
              >
                {isCountingDown
                  ? `¡Empieza la partida en ${Math.ceil(
                      countdownRemainingSec!
                    )} s!`
                  : players.length < 2
                  ? 'Esperando a que entre al menos 1 amigo más.'
                  : 'Listo. Esperando a que el anfitrión empiece.'}
              </p>
            )}

            {sandboxUnlocked && isHost && onAddBots && onRemoveBots && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-900">
                    <FlaskConical className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
                    <span>Laboratorio Solo (Sin DB)</span>
                  </span>
                  <span className="font-mono text-[10px] font-semibold text-violet-700">
                    {players.filter((p) => isBotPlayerId(p.id)).length} bots
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void onAddBots(1)}
                    className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-semibold text-violet-900 hover:bg-violet-100/60"
                  >
                    <Bot className="h-3 w-3" aria-hidden="true" />
                    <span>+1 Bot</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAddBots(3)}
                    className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-violet-200 bg-white px-2 text-[11px] font-semibold text-violet-900 hover:bg-violet-100/60"
                  >
                    <Bot className="h-3 w-3" aria-hidden="true" />
                    <span>+3 Bots</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onRemoveBots()}
                    className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>Limpiar</span>
                  </button>
                </div>
                {onInstantStartMatch && players.length >= 2 && (
                  <button
                    type="button"
                    disabled={isStartingMatch || isCountingDown}
                    onClick={() => {
                      void startBackgroundKeepAlive();
                      void onInstantStartMatch();
                    }}
                    className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg bg-violet-700 px-3 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Empezar al instante (sin espera)</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleLeave}
              disabled={leaving}
              className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {leaving
                  ? 'Saliendo...'
                  : isHost
                  ? 'Cerrar sala'
                  : 'Salir de la sala'}
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Modal sencillo para editar mi nombre o icono */}
      {editingProfile && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-modal-title"
        >
          <form
            onSubmit={handleSaveProfileModal}
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl space-y-5"
          >
            <div className="flex items-center justify-between gap-4">
              <h3
                id="edit-profile-modal-title"
                className="font-display text-lg font-bold text-slate-900"
              >
                Editar jugador
              </h3>
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                aria-label="Cerrar"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ProfileCustomizer
              profile={draftProfile}
              onChange={setDraftProfile}
              defaultExpanded={true}
              nameError={
                draftProfile.name.trim().length < 2 ? 'Mínimo 2 letras.' : null
              }
            />

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingProfile || draftProfile.name.trim().length < 2}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingProfile ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
