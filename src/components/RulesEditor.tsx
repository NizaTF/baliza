import React, { useState } from 'react';
import { Crown, Eye, LogOut, RotateCcw, Save, Shield } from 'lucide-react';
import { normalizeZonesConfig } from '../lib/zones';
import {
  DEFAULT_RULES,
  PlayerRecord,
  PlayerRole,
  RoomRules,
  RoundDuration,
  SeekersCount,
  ZonesConfig,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { ZoneMapEditor } from './ZoneMapEditor';

interface RulesEditorProps {
  rules: RoomRules;
  roomCode: string;
  players: PlayerRecord[];
  currentPlayerId: string;
  isSaving: boolean;
  onSave: (nextRules: RoomRules) => Promise<void>;
  onCancel?: () => void;
  onCloseRoom?: () => Promise<void>;
  submitLabel?: string;
}

const DURATIONS: RoundDuration[] = [10, 20, 30, 45, 60];
const STORM_GRACE_OPTIONS = [15, 30, 45, 60] as const;
const SEEKER_OPTIONS: { value: SeekersCount; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 'random', label: 'Aleatorio' },
];

export const RulesEditor: React.FC<RulesEditorProps> = ({
  rules,
  roomCode,
  players,
  currentPlayerId,
  isSaving,
  onSave,
  onCancel,
  onCloseRoom,
  submitLabel = 'Guardar y volver a la sala',
}) => {
  const [draft, setDraft] = useState<RoomRules>(() => structuredClone(rules));

  const zonesConfig = normalizeZonesConfig(draft);
  const manualRoles = draft.manualRoles || {};
  const selectedSeekersCount = players.filter(
    (p) => manualRoles[p.id] === 'seeker'
  ).length;

  const handleZonesChange = (nextZonesConfig: ZonesConfig) => {
    setDraft((prev) => ({
      ...prev,
      zonesConfig: nextZonesConfig,
    }));
  };

  const handleSetPlayerRole = (playerId: string, role: PlayerRole) => {
    setDraft((prev) => ({
      ...prev,
      manualRoles: {
        ...(prev.manualRoles || {}),
        [playerId]: role,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
      {/* Cabecera del panel */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Reglas y zonas · Sala{' '}
            <span className="font-mono font-bold tracking-wider">{roomCode}</span>
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Configura reglas y zonas de cierre
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Ajusta los parámetros de partida y define en el mapa las fases estilo tormenta.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDraft(structuredClone(DEFAULT_RULES))}
          className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>Restablecer valores</span>
        </button>
      </div>

      {/* Grid de dos columnas en escritorio */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Columna izquierda: Reglas básicas */}
        <section
          aria-labelledby="basic-rules-heading"
          className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs lg:col-span-5"
        >
          <h2
            id="basic-rules-heading"
            className="font-display text-lg font-bold text-slate-900"
          >
            01. Reglas básicas
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Duración máxima, equipo buscador y reparto de roles.
          </p>

          <div className="mt-6 space-y-6">
            {/* Duración de ronda */}
            <div>
              <span className="block text-sm font-semibold text-slate-900">
                Duración máxima de ronda
              </span>
              <div className="mt-2 grid grid-cols-5 gap-1.5 rounded-xl bg-slate-100 p-1">
                {DURATIONS.map((mins) => {
                  const active = draft.roundDuration === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, roundDuration: mins }))
                      }
                      className={`min-h-[44px] rounded-lg px-2 py-2 font-mono text-sm font-semibold tabular-nums transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mins}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Asignación de roles */}
            <div>
              <span className="block text-sm font-semibold text-slate-900">
                Asignación de roles
              </span>
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { value: 'random', label: 'Aleatoria' },
                    { value: 'manual', label: 'Manual' },
                  ] as const
                ).map((opt) => {
                  const active = draft.roleAssignment === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, roleAssignment: opt.value }))
                      }
                      className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nº de buscadores (si es aleatoria) O Selector directo de jugadores (si es manual) */}
            {draft.roleAssignment === 'random' ? (
              <div>
                <span className="block text-sm font-semibold text-slate-900">
                  Nº de buscadores
                </span>
                <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-xl bg-slate-100 p-1">
                  {SEEKER_OPTIONS.map((opt) => {
                    const active = draft.seekersCount === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, seekersCount: opt.value }))
                        }
                        className={`min-h-[44px] rounded-lg px-2 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-emerald-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    Elegir buscadores ({selectedSeekersCount})
                  </span>
                  <span className="text-xs text-slate-500">
                    {players.length} en sala
                  </span>
                </div>

                {players.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No hay jugadores conectados todavía.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200/80">
                    {players.map((p) => {
                      const role: PlayerRole =
                        manualRoles[p.id] === 'seeker' ? 'seeker' : 'hider';
                      return (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <PlayerAvatar
                              emoji={p.emoji}
                              color={p.color}
                              size="sm"
                              name={p.name}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {p.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                {p.is_host && (
                                  <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700">
                                    <Crown className="h-3 w-3" aria-hidden="true" />
                                    Anfitrión
                                  </span>
                                )}
                                {p.id === currentPlayerId && (
                                  <span className="font-medium text-emerald-700">
                                    Tú
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="inline-flex rounded-xl bg-slate-200/80 p-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSetPlayerRole(p.id, 'hider')}
                              className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                                role === 'hider'
                                  ? 'bg-white text-emerald-700 shadow-xs'
                                  : 'text-slate-600'
                              }`}
                            >
                              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Escondido</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetPlayerRole(p.id, 'seeker')}
                              className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                                role === 'seeker'
                                  ? 'bg-white text-rose-700 shadow-xs'
                                  : 'text-slate-600'
                              }`}
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Buscador</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {selectedSeekersCount === 0 && (
                  <p className="text-xs font-medium text-amber-800">
                    Elige al menos 1 buscador de la lista (si no eliges ninguno, se asignará automáticamente al iniciar).
                  </p>
                )}
              </div>
            )}

            {/* Pistas periódicas */}
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Pistas periódicas
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Envía avisos automáticos a los buscadores durante la ronda.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.hints}
                aria-label="Alternar pistas periódicas"
                onClick={() =>
                  setDraft((prev) => ({ ...prev, hints: !prev.hints }))
                }
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                  draft.hints ? 'bg-emerald-700' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                    draft.hints ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Visibilidad en el mapa: Jugadores <-> Buscador */}
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Visibilidad en el mapa durante la partida
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Elige si unos pueden ver la ubicación GPS de los otros.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    Los jugadores ven al buscador
                  </p>
                  <p className="text-xs text-slate-500">
                    Los escondidos verán la posición del buscador en el mapa.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(draft.hidersCanSeeSeekers)}
                  aria-label="Los jugadores ven al buscador"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      hidersCanSeeSeekers: !prev.hidersCanSeeSeekers,
                    }))
                  }
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                    draft.hidersCanSeeSeekers ? 'bg-emerald-700' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                      draft.hidersCanSeeSeekers ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    El buscador ve a los jugadores
                  </p>
                  <p className="text-xs text-slate-500">
                    El buscador verá la ubicación GPS de los escondidos.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(draft.seekersCanSeeHiders)}
                  aria-label="El buscador ve a los jugadores"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      seekersCanSeeHiders: !prev.seekersCanSeeHiders,
                    }))
                  }
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                    draft.seekersCanSeeHiders ? 'bg-emerald-700' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                      draft.seekersCanSeeHiders ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Castigo por tormenta */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-2">
                <span className="block text-sm font-semibold text-slate-900">
                  Tiempo máximo en tormenta
                </span>
                <span className="font-mono text-xs font-semibold text-violet-700">
                  {draft.stormGraceSec ?? 30} s
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                A mitad de tiempo se revela tu posición en el mapa; al llegar a 0 s quedas eliminado por la tormenta.
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-xl bg-slate-100 p-1">
                {STORM_GRACE_OPTIONS.map((sec) => {
                  const active = (draft.stormGraceSec ?? 30) === sec;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, stormGraceSec: sec }))
                      }
                      className={`min-h-[44px] rounded-lg px-2 py-2 font-mono text-sm font-semibold tabular-nums transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-violet-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {sec}s
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Columna derecha: Selección y mapa de zonas estilo Fortnite */}
        <section
          aria-labelledby="zones-config-heading"
          className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs lg:col-span-7"
        >
          <div className="mb-4 border-b border-slate-100 pb-3">
            <h2
              id="zones-config-heading"
              className="font-display text-lg font-bold text-slate-900"
            >
              02. Mapa y selección de zonas
            </h2>
          </div>

          <ZoneMapEditor
            zonesConfig={zonesConfig}
            isHost={true}
            onUpdateZonesConfig={handleZonesChange}
          />
        </section>
      </div>

      {/* Barra de acción inferior */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onCloseRoom ? (
          <button
            type="button"
            onClick={onCloseRoom}
            disabled={isSaving}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50 whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Cerrar y borrar sala</span>
          </button>
        ) : (
          <div />
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              Ir a la sala
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{isSaving ? 'Guardando...' : submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
