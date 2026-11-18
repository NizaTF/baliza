import React, { useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Eye,
  Lock,
  LogOut,
  Play,
  Share2,
  Shield,
  SlidersHorizontal,
  Unlock,
  UserCheck,
  UserCog,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import {
  PlayerProfile,
  PlayerRecord,
  PlayerRole,
  RoomRecord,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { ProfileCustomizer } from './ProfileCustomizer';
import { RulesSummary } from './RulesSummary';

interface LobbyScreenProps {
  room: RoomRecord;
  players: PlayerRecord[];
  currentPlayerId: string;
  profile: PlayerProfile;
  onUpdateProfileInRoom: (nextProfile: PlayerProfile) => Promise<void>;
  onToggleRoomLock: (locked: boolean) => Promise<void>;
  onKickPlayer: (targetPlayerId: string) => Promise<void>;
  onTransferHost: (nextHostId: string) => Promise<void>;
  onUpdateManualRoles: (manualRoles: Record<string, PlayerRole>) => Promise<void>;
  onEditRules: () => void;
  onStartMatch: () => Promise<void>;
  isStartingMatch?: boolean;
  onLeaveRoom: () => Promise<void>;
}

type MobileLobbyTab = 'players' | 'rules';

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  players,
  currentPlayerId,
  profile,
  onUpdateProfileInRoom,
  onToggleRoomLock,
  onKickPlayer,
  onTransferHost,
  onUpdateManualRoles,
  onEditRules,
  onStartMatch,
  isStartingMatch = false,
  onLeaveRoom,
}) => {
  const [mobileTab, setMobileTab] = useState<MobileLobbyTab>('players');
  const [copiedCode, setCopiedCode] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState<PlayerProfile>(profile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);
  const [confirmHostId, setConfirmHostId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const isHost = room.host_id === currentPlayerId;
  const isLocked = Boolean(room.rules?.roomLocked);
  const canStartMatch = players.length >= 2 && !isStartingMatch;
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
      setTimeout(() => setCopiedCode(false), 2000);
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
          text: `Entra a nuestra sala de Baliza con el código ${room.code}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to copy link if user cancels or share fails
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setSharedFeedback(true);
      setTimeout(() => setSharedFeedback(false), 2200);
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

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await onLeaveRoom();
    } finally {
      setLeaving(false);
    }
  };

  const handleKick = async (targetId: string) => {
    setActionBusyId(targetId);
    try {
      await onKickPlayer(targetId);
      setConfirmKickId(null);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleTransfer = async (nextHostId: string) => {
    setActionBusyId(nextHostId);
    try {
      await onTransferHost(nextHostId);
      setConfirmHostId(null);
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Cabecera de sala + código + estado */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className={isLocked ? 'text-amber-700' : 'text-emerald-700'}>
                {isLocked ? 'Entrada cerrada' : 'Sala abierta'}
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600">
                {players.length} {players.length === 1 ? 'jugador' : 'jugadores'}
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600">
                {isHost ? 'Eres anfitrión' : 'Invitado'}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-sm font-medium text-slate-500">Código:</span>
              <p
                className="font-mono text-3xl font-bold tracking-[0.22em] text-slate-900 sm:text-5xl select-all"
                aria-label={`Código de sala ${room.code}`}
              >
                {room.code}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isHost && (
              <button
                type="button"
                onClick={() => onToggleRoomLock(!isLocked)}
                className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  isLocked
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isLocked ? (
                  <>
                    <Unlock className="h-4 w-4" aria-hidden="true" />
                    <span>Abrir entrada</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    <span>Cerrar entrada</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              {copiedCode ? (
                <>
                  <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <span className="text-emerald-700">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <span>Copiar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
            >
              {sharedFeedback ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Enlace copiado</span>
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span>Compartir</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Selector de pestañas en móvil dentro de Sala (sin mapa) */}
      <div
        className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 lg:hidden"
        role="tablist"
        aria-label="Secciones de la sala"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'players'}
          onClick={() => setMobileTab('players')}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
            mobileTab === 'players'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600'
          }`}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>Jugadores ({players.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'rules'}
          onClick={() => setMobileTab('rules')}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
            mobileTab === 'rules'
              ? 'bg-white text-emerald-700 shadow-xs'
              : 'text-slate-600'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span>Reglas</span>
        </button>
      </div>

      {/* Layout principal sin mapa en Sala: Jugadores (7 cols) + Reglas y Acciones (5 cols) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Columna izquierda: Jugadores conectados y gestión de usuarios */}
        <section
          aria-labelledby="players-heading"
          className={`${
            mobileTab === 'players' ? 'block' : 'hidden'
          } lg:block rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs lg:col-span-7`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2
                id="players-heading"
                className="font-display text-lg font-bold text-slate-900"
              >
                Jugadores en la sala
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {isHost
                  ? 'Gestiona jugadores o selecciona quién será buscador si los roles son manuales.'
                  : 'Lista sincronizada en tiempo real. La zona se revelará al comenzar.'}
              </p>
            </div>
            <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
              {players.length}
            </span>
          </div>

          <ul className="mt-4 divide-y divide-slate-100">
            {players.map((player) => {
              const isSelf = player.id === currentPlayerId;
              const isConfirmingKick = confirmKickId === player.id;
              const isConfirmingHost = confirmHostId === player.id;
              const isBusyRow = actionBusyId === player.id;

              return (
                <li
                  key={player.id}
                  className="py-3 first:pt-1 last:pb-1 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar
                        emoji={player.emoji}
                        color={player.color}
                        size="md"
                        name={player.name}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {player.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          {player.is_host && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                              <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                              Anfitrión
                            </span>
                          )}
                          {player.is_host && isSelf && (
                            <span aria-hidden="true">·</span>
                          )}
                          {isSelf && (
                            <span className="font-medium text-emerald-700">
                              Tú
                            </span>
                          )}
                          {!player.is_host && !isSelf && <span>Jugador</span>}
                        </div>
                      </div>
                    </div>

                    {isSelf ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftProfile(profile);
                          setEditingProfile(true);
                        }}
                        aria-label="Editar mi perfil"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <UserCog className="h-4 w-4" aria-hidden="true" />
                        <span>Editar</span>
                      </button>
                    ) : isHost ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmKickId(null);
                            setConfirmHostId(
                              isConfirmingHost ? null : player.id
                            );
                          }}
                          disabled={isBusyRow}
                          title="Hacer anfitrión"
                          aria-label={`Hacer anfitrión a ${player.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300"
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmHostId(null);
                            setConfirmKickId(
                              isConfirmingKick ? null : player.id
                            );
                          }}
                          disabled={isBusyRow}
                          title="Expulsar de la sala"
                          aria-label={`Expulsar a ${player.name}`}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Rol manual si está activado */}
                  {isManualRoles && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-medium text-slate-600">
                        Rol asignado:
                      </span>
                      {isHost ? (
                        <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleSetManualRole(player.id, 'hider')}
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition-colors whitespace-nowrap ${
                              (manualRoles[player.id] ?? 'hider') === 'hider'
                                ? 'bg-white text-emerald-700 shadow-xs'
                                : 'text-slate-600'
                            }`}
                          >
                            <Shield className="h-3 w-3" aria-hidden="true" />
                            <span>Escondido</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetManualRole(player.id, 'seeker')}
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition-colors whitespace-nowrap ${
                              manualRoles[player.id] === 'seeker'
                                ? 'bg-white text-rose-700 shadow-xs'
                                : 'text-slate-600'
                            }`}
                          >
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            <span>Buscador</span>
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`font-semibold ${
                            manualRoles[player.id] === 'seeker'
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {manualRoles[player.id] === 'seeker'
                            ? 'Buscador'
                            : 'Escondido'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Confirmación en línea para móvil (evita pulsaciones accidentales) */}
                  {isHost && isConfirmingKick && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
                      <span className="font-medium text-rose-900">
                        ¿Expulsar a {player.name}?
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmKickId(null)}
                          className="min-h-[36px] px-2.5 font-semibold text-slate-600"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKick(player.id)}
                          disabled={isBusyRow}
                          className="min-h-[36px] rounded-lg bg-rose-700 px-3 font-semibold text-white hover:bg-rose-800"
                        >
                          Expulsar
                        </button>
                      </div>
                    </div>
                  )}

                  {isHost && isConfirmingHost && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                      <span className="font-medium text-amber-900">
                        ¿Ceder anfitrión a {player.name}?
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmHostId(null)}
                          className="min-h-[36px] px-2.5 font-semibold text-slate-600"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTransfer(player.id)}
                          disabled={isBusyRow}
                          className="min-h-[36px] rounded-lg bg-amber-700 px-3 font-semibold text-white hover:bg-amber-800"
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
        </section>

        {/* Columna derecha: Reglas + Acciones */}
        <div className="space-y-6 lg:col-span-5">
          <section
            className={`${
              mobileTab === 'rules' ? 'block' : 'hidden'
            } lg:block rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs`}
          >
            <RulesSummary rules={room.rules} isHost={isHost} />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-3">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={onEditRules}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-4 w-4 text-slate-700" aria-hidden="true" />
                  <span>Editar reglas y zonas</span>
                </button>

                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    disabled={!canStartMatch}
                    onClick={onStartMatch}
                    className={`flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition-colors ${
                      canStartMatch
                        ? 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800'
                        : 'cursor-not-allowed bg-slate-200 text-slate-500'
                    }`}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {isStartingMatch ? 'Iniciando partida...' : 'Iniciar partida'}
                    </span>
                  </button>
                  <p className="text-center text-xs text-slate-500">
                    {players.length < 2
                      ? `Se necesitan mínimo 2 jugadores para iniciar (${players.length}/2).`
                      : `Listo para iniciar con ${players.length} jugadores.`}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed">
                {players.length < 2
                  ? 'Esperando a que entre al menos 1 jugador más (mínimo 2).'
                  : 'Listo. La zona aparecerá al iniciar la partida.'}
              </p>
            )}

            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>
                  {leaving
                    ? 'Saliendo...'
                    : isHost
                    ? 'Cerrar y borrar sala'
                    : 'Salir de la sala'}
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Modal para editar perfil sin salir del lobby */}
      {editingProfile && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-0 sm:p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-modal-title"
        >
          <form
            onSubmit={handleSaveProfileModal}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3
                id="edit-profile-modal-title"
                className="font-display text-xl font-bold text-slate-900"
              >
                Actualizar tu perfil
              </h3>
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                aria-label="Cerrar"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ProfileCustomizer
              profile={draftProfile}
              onChange={setDraftProfile}
              nameError={
                draftProfile.name.trim().length < 2
                  ? 'Mínimo 2 caracteres.'
                  : null
              }
            />

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingProfile || draftProfile.name.trim().length < 2}
                className="min-h-[48px] flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {savingProfile ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
