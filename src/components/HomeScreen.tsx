import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, KeyRound, PlusCircle, Users } from 'lucide-react';
import { sanitizeRoomCode } from '../lib/storage';
import { PlayerProfile } from '../types/game';
import { ProfileCustomizer } from './ProfileCustomizer';

interface HomeScreenProps {
  profile: PlayerProfile;
  onProfileChange: (next: PlayerProfile) => void;
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (code: string) => Promise<void>;
  initialJoinCode?: string;
  isBusy: boolean;
  joinError: string | null;
  onClearJoinError: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  profile,
  onProfileChange,
  onCreateRoom,
  onJoinRoom,
  initialJoinCode = '',
  isBusy,
  joinError,
  onClearJoinError,
}) => {
  const [showJoinInput, setShowJoinInput] = useState(Boolean(initialJoinCode));
  const [roomCode, setRoomCode] = useState(() => sanitizeRoomCode(initialJoinCode));
  const [nameError, setNameError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialJoinCode) {
      setShowJoinInput(true);
      setRoomCode(sanitizeRoomCode(initialJoinCode));
    }
  }, [initialJoinCode]);

  const validateName = (): boolean => {
    const trimmed = profile.name.trim();
    if (trimmed.length < 2) {
      setNameError('Escribe un nombre de al menos 2 caracteres.');
      document.getElementById('player-name-input')?.focus();
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleCreate = async () => {
    if (!validateName()) return;
    await onCreateRoom();
  };

  const handleOpenJoin = () => {
    setShowJoinInput(true);
    onClearJoinError();
    setTimeout(() => {
      codeInputRef.current?.focus();
    }, 50);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateName()) return;
    await onJoinRoom(roomCode);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-6">
      {/* 1. Cabecera del juego */}
      <section className="order-1 space-y-3 lg:col-span-6 lg:col-start-1 lg:row-start-1">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-3xl sm:text-4xl" aria-hidden="true">
            <span>📍</span>
            <span>🏃‍♂️</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl text-balance leading-[1.08]">
            Baliza
          </h1>
        </div>

        <p className="max-w-xl text-sm sm:text-base text-slate-600 leading-relaxed">
          Convierte tu ciudad en el tablero. Crea una sala en segundos, dibuja las zonas de cierre
          en el mapa con tu grupo y coordina la partida desde el móvil sin cuentas ni descargas.
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
          <span>Zonas en mapa</span>
          <span aria-hidden="true">·</span>
          <span>Sin cuentas</span>
          <span aria-hidden="true">·</span>
          <span>Código de 4–6 caracteres</span>
        </div>
      </section>

      {/* 2. En móvil aparece antes de los botones para escribir nombre y elegir emoji rápido; en desktop ocupa la columna derecha */}
      <section
        aria-labelledby="profile-section-heading"
        className="order-2 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs lg:col-span-6 lg:col-start-7 lg:row-start-1 lg:row-span-3"
      >
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2
            id="profile-section-heading"
            className="font-display text-lg font-bold text-slate-900"
          >
            Tu perfil de jugador
          </h2>
          <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </div>

        <ProfileCustomizer
          profile={profile}
          onChange={(next) => {
            if (nameError && next.name.trim().length >= 2) {
              setNameError(null);
            }
            onProfileChange(next);
          }}
          nameError={nameError}
        />
      </section>

      {/* 3. Tarjeta de acciones de entrada (Crear sala / Unirse) */}
      <section className="order-3 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4 lg:col-span-6 lg:col-start-1 lg:row-start-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={isBusy}
          className="flex w-full min-h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PlusCircle className="h-5 w-5" aria-hidden="true" />
          <span>{isBusy ? 'Preparando sala...' : 'Crear sala'}</span>
        </button>

        {!showJoinInput ? (
          <button
            type="button"
            onClick={handleOpenJoin}
            disabled={isBusy}
            className="flex w-full min-h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-900 transition-colors hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60"
          >
            <KeyRound className="h-5 w-5 text-slate-600" aria-hidden="true" />
            <span>Unirse con código</span>
          </button>
        ) : (
          <form
            onSubmit={handleJoinSubmit}
            className="space-y-3 border-t border-slate-200 pt-4"
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="room-code-input"
                className="text-sm font-semibold text-slate-900"
              >
                Código de sala (4–6 caracteres)
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowJoinInput(false);
                  onClearJoinError();
                }}
                className="min-h-[36px] px-2 text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                Cancelar
              </button>
            </div>

            <div className="flex gap-2">
              <input
                ref={codeInputRef}
                id="room-code-input"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                placeholder="K7X2"
                value={roomCode}
                onChange={(e) => {
                  onClearJoinError();
                  setRoomCode(sanitizeRoomCode(e.target.value));
                }}
                className="min-h-[52px] w-full flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-4 text-center font-mono text-2xl font-bold tracking-[0.25em] text-slate-900 uppercase placeholder:text-slate-300 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              />
              <button
                type="submit"
                disabled={isBusy || roomCode.length < 4}
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
              >
                <span>Entrar</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {joinError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
              >
                {joinError}
              </p>
            )}
          </form>
        )}
      </section>

      {/* 4. Cómo funciona en 3 pasos claros */}
      <section className="order-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-6 lg:col-start-1 lg:row-start-3">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <p className="font-mono text-xs font-bold text-emerald-700">01</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Tu perfil</p>
          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
            Elige nombre, emoji y color. Se guarda solo en tu móvil.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <p className="font-mono text-xs font-bold text-emerald-700">02</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Reglas en vivo</p>
          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
            El anfitrión define duración, zonas vetadas y modificadores.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <p className="font-mono text-xs font-bold text-emerald-700">03</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Lobby grupal</p>
          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
            Comparte el código y mira quién entra al instante.
          </p>
        </div>
      </section>
    </div>
  );
};
