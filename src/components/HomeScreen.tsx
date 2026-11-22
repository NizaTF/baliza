import React, { useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
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
  const [roomCode, setRoomCode] = useState(initialJoinCode);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (initialJoinCode) {
      setRoomCode(sanitizeRoomCode(initialJoinCode));
    }
  }, [initialJoinCode]);

  const validateName = (): boolean => {
    const trimmed = profile.name.trim();
    if (trimmed.length < 2) {
      setNameError('Escribe un nombre de al menos 2 letras.');
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

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateName()) return;
    await onJoinRoom(roomCode);
  };

  return (
    <div className="mx-auto max-w-4xl py-2 sm:py-6">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Tarjeta principal de juego (primero en móvil) */}
        <section className="clean-card p-5 sm:p-7 space-y-6 lg:col-span-7 lg:order-last">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Jugar ahora
            </h1>
            <p className="text-sm text-slate-500">
              Elige tu nombre y crea una sala nueva o entra con el código de tus amigos.
            </p>
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

          <div className="space-y-4 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={handleCreate}
              disabled={isBusy}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{isBusy ? 'Creando sala...' : 'Crear sala nueva'}</span>
            </button>

            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-slate-200" />
              <span className="mx-3 shrink-0 text-xs font-medium text-slate-400">
                o entrar con código
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-2">
              <div className="flex gap-2">
                <input
                  id="room-code-input"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={6}
                  placeholder="Código (ej. K7X2)"
                  aria-label="Código de la sala"
                  value={roomCode}
                  onChange={(e) => {
                    onClearJoinError();
                    setRoomCode(sanitizeRoomCode(e.target.value));
                  }}
                  className="h-12 w-full flex-1 rounded-xl border border-slate-300 bg-white px-4 text-center font-mono text-lg font-bold tracking-[0.2em] text-slate-900 uppercase placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                <button
                  type="submit"
                  disabled={isBusy || roomCode.length < 4}
                  className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Entrar</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {joinError && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {joinError}
                </p>
              )}
            </form>
          </div>
        </section>

        {/* Explicación sencilla en 3 líneas (sin cajas ni ruido) */}
        <div className="space-y-6 lg:col-span-5">
          <div className="space-y-2">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Escondite en el mapa con tus amigos
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Sin cuentas ni contraseñas. Todo el grupo usa el GPS del móvil dentro de una zona segura que se va cerrando.
            </p>
          </div>

          <ol className="space-y-4 border-t border-slate-200 pt-5 text-sm">
            <li>
              <p className="font-semibold text-slate-900">1. Corre y escóndete</p>
              <p className="mt-0.5 text-slate-500">
                Los fugitivos aprovechan los primeros segundos para alejarse sin salir del círculo seguro.
              </p>
            </li>
            <li>
              <p className="font-semibold text-slate-900">2. Busca y atrapa</p>
              <p className="mt-0.5 text-slate-500">
                Los buscadores salen después y marcan en el móvil a quien encuentren.
              </p>
            </li>
            <li>
              <p className="font-semibold text-slate-900">3. Gana la ronda</p>
              <p className="mt-0.5 text-slate-500">
                Los fugitivos ganan si aguantan el tiempo o llegan a la Baliza verde; los buscadores si cazan a todos.
              </p>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
