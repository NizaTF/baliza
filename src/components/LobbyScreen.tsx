import React, { useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  LogOut,
  Play,
  Share2,
  SlidersHorizontal,
  UserCog,
  X,
} from 'lucide-react';
import { PlayerProfile, PlayerRecord, RoomRecord } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { ProfileCustomizer } from './ProfileCustomizer';
import { RulesSummary } from './RulesSummary';

interface LobbyScreenProps {
  room: RoomRecord;
  players: PlayerRecord[];
  currentPlayerId: string;
  profile: PlayerProfile;
  onUpdateProfileInRoom: (nextProfile: PlayerProfile) => Promise<void>;
  onEditRules: () => void;
  onLeaveRoom: () => Promise<void>;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  players,
  currentPlayerId,
  profile,
  onUpdateProfileInRoom,
  onEditRules,
  onLeaveRoom,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [sharedFeedback, setSharedFeedback] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState<PlayerProfile>(profile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isHost = room.host_id === currentPlayerId;

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
      // Fallback ignored if clipboard blocked
    }
  };

  const handleShare = async () => {
    const shareUrl = getShareUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Únete a Escondite Urbano (${room.code})`,
          text: `Entra a nuestra sala de Escondite Urbano con el código ${room.code}`,
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

  return (
    <div className="space-y-8">
      {/* Cabecera superior de sala + código gigante */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-700">
              <span>Sala en espera</span>
              <span aria-hidden="true">·</span>
              <span>{players.length} {players.length === 1 ? 'jugador' : 'jugadores'}</span>
              <span aria-hidden="true">·</span>
              <span>{isHost ? 'Eres el anfitrión' : 'Modo invitado'}</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <span className="text-sm font-medium text-slate-500">Código:</span>
              <p
                className="font-mono text-4xl font-bold tracking-[0.22em] text-slate-900 sm:text-5xl select-all"
                aria-label={`Código de sala ${room.code}`}
              >
                {room.code}
              </p>
            </div>
          </div>

          {/* Botones Copiar y Compartir */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex min-h-[48px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              {copiedCode ? (
                <>
                  <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <span className="text-emerald-700">Código copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  <span>Copiar código</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex min-h-[48px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
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

      {/* Grid principal del Lobby: Jugadores (izquierda) + Reglas (derecha) */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Columna izquierda: Lista de jugadores y acciones */}
        <div className="space-y-6 lg:col-span-5">
          <section
            aria-labelledby="players-heading"
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2
                  id="players-heading"
                  className="font-display text-lg font-bold text-slate-900"
                >
                  Jugadores conectados
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Actualización en tiempo real al entrar o editar perfil.
                </p>
              </div>
              <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
                {players.length}
              </span>
            </div>

            <ul className="mt-4 divide-y divide-slate-100">
              {players.map((player) => {
                const isSelf = player.id === currentPlayerId;
                return (
                  <li
                    key={player.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
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

                    {isSelf && (
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
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Controles de sala */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
            {isHost ? (
              <>
                <button
                  type="button"
                  onClick={onEditRules}
                  className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-4 w-4 text-slate-700" aria-hidden="true" />
                  <span>Editar reglas</span>
                </button>

                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="flex w-full min-h-[52px] cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-slate-200 px-5 py-3 text-base font-semibold text-slate-500"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>Iniciar partida</span>
                  </button>
                  <p className="text-center text-xs text-slate-500">
                    Disponible en v0.2 (asignación de roles y arranque de ronda).
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600 leading-relaxed">
                Esperando a que el anfitrión ajuste las reglas. En v0.2 podrás recibir tu rol directamente desde esta pantalla.
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
                    ? 'Cerrar y salir de la sala'
                    : 'Salir de la sala'}
                </span>
              </button>
            </div>
          </section>
        </div>

        {/* Columna derecha: Reglas de la sala */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7">
          <RulesSummary rules={room.rules} isHost={isHost} />
        </section>
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
