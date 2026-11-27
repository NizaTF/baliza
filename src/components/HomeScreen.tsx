import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  Compass,
  Flag,
  FlaskConical,
  Plus,
  Shield,
} from 'lucide-react';
import { BUILT_IN_PRESETS, loadCustomPresets } from '../lib/presets';
import { sanitizeRoomCode } from '../lib/storage';
import { PlayerProfile, RoomRules } from '../types/game';
import { ProfileCustomizer } from './ProfileCustomizer';
import { ShareAppButton } from './ShareAppButton';

interface HomeScreenProps {
  profile: PlayerProfile;
  onProfileChange: (next: PlayerProfile) => void;
  onCreateRoom: (presetRules?: RoomRules) => Promise<void>;
  onJoinRoom: (code: string) => Promise<void>;
  initialJoinCode?: string;
  isBusy: boolean;
  joinError: string | null;
  onClearJoinError: () => void;
  sandboxUnlocked?: boolean;
  onQuickStartSoloSandbox?: (infectionMode: boolean) => Promise<void>;
  onOpenAchievements?: () => void;
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
  sandboxUnlocked = false,
  onQuickStartSoloSandbox,
  onOpenAchievements,
}) => {
  const [roomCode, setRoomCode] = useState(initialJoinCode);
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default');

  const allPresets = useMemo(
    () => [...loadCustomPresets(), ...BUILT_IN_PRESETS],
    []
  );

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
    const picked = allPresets.find((p) => p.id === selectedPresetId);
    await onCreateRoom(picked?.rules);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateName()) return;
    await onJoinRoom(roomCode);
  };

  return (
    <div className="mx-auto max-w-5xl py-1 sm:py-6">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:items-center lg:gap-12">
        {/* Panel principal: entra o crea sala en 10 segundos */}
        <section className="clean-card p-5 sm:p-7 space-y-6 lg:col-span-7 lg:order-last">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Empezar a jugar
            </h1>
            <p className="text-sm text-slate-500">
              Pon tu nombre, crea una sala o introduce el código de tus amigos.
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
            {/* Crear sala */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isBusy}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
              >
                <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{isBusy ? 'Creando sala...' : 'Crear sala nueva'}</span>
              </button>

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="home-preset-select"
                  className="text-xs font-medium text-slate-500 whitespace-nowrap"
                >
                  Modo inicial
                </label>
                <select
                  id="home-preset-select"
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="h-9 max-w-[230px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:bg-white focus:outline-none"
                >
                  <option value="default">Estándar (recomendado)</option>
                  {allPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="relative flex items-center py-0.5">
              <div className="flex-grow border-t border-slate-200" />
              <span className="mx-3 shrink-0 text-xs font-medium text-slate-400">
                o únete con código
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            {/* Unirse con código */}
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
                  className="h-12 w-full flex-1 rounded-xl border border-slate-300 bg-white px-4 text-center font-mono text-lg font-bold tracking-[0.2em] text-slate-900 uppercase placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15"
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

            {sandboxUnlocked && onQuickStartSoloSandbox && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-violet-900">
                    <FlaskConical className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
                    <span>Laboratorio Solo (Sin DB)</span>
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-violet-700 tabular-nums">
                    Tú + 3 bots
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      if (!validateName()) return;
                      void onQuickStartSoloSandbox(true);
                    }}
                    className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <span>Probar Infección</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      if (!validateName()) return;
                      void onQuickStartSoloSandbox(false);
                    }}
                    className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-900 hover:bg-violet-100/60 disabled:opacity-50"
                  >
                    <span>Probar Clásico</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Explicación visual breve y directa */}
        <div className="space-y-6 lg:col-span-5">
          <div className="space-y-2.5">
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance leading-[1.12]">
              Escondite en el mundo real sobre el mapa
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Sin cuentas ni registros. Todos usáis el GPS del móvil dentro de una zona que se va cerrando.
            </p>
          </div>

          <ol className="divide-y divide-slate-200/80 border-y border-slate-200/80 text-sm">
            <li className="flex items-start gap-3 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Shield className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">1. Escóndete en la zona</p>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                  Aprovecha los segundos iniciales para alejarte sin salir del círculo seguro.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <Compass className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">2. Busca o infecta</p>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                  Usa el radar, brújula o pistas para localizar y atrapar a los fugitivos.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Flag className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">3. Aguanta o toma la Baliza</p>
                <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                  Sobrevive hasta el final o conquista la bandera verde antes que los buscadores.
                </p>
              </div>
            </li>
          </ol>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex-1 min-w-[200px]">
              <ShareAppButton variant="card" />
            </div>
            {onOpenAchievements && (
              <button
                type="button"
                onClick={onOpenAchievements}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <Award className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span>Logros</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
