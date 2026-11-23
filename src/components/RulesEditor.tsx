import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Clock,
  Crown,
  Eye,
  Map as MapIcon,
  Save,
  Shield,
  Sparkles,
} from 'lucide-react';
import {
  applyRecommendedToRules,
  getRecommendedSettings,
} from '../lib/recommendations';
import { normalizeZonesConfig } from '../lib/zones';
import {
  DEFAULT_RULES,
  PlayerRecord,
  PlayerRole,
  RoomRules,
  ZonesConfig,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { UnboundedNumberField } from './UnboundedNumberField';
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

type StudioTab = 'general' | 'zones' | 'modes';

interface CleanSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

const CleanSwitch: React.FC<CleanSwitchProps> = ({
  checked,
  onToggle,
  ariaLabel,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onToggle}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
      checked ? 'bg-emerald-600' : 'bg-slate-200'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

export const RulesEditor: React.FC<RulesEditorProps> = ({
  rules,
  roomCode,
  players,
  currentPlayerId,
  isSaving,
  onSave,
  onCancel,
  onCloseRoom,
  submitLabel = 'Guardar cambios',
}) => {
  const [draft, setDraft] = useState<RoomRules>(() => structuredClone(rules));
  const [activeTab, setActiveTab] = useState<StudioTab>('general');

  const zonesConfig = normalizeZonesConfig(draft);
  const manualRoles = draft.manualRoles || {};
  const selectedSeekersCount = players.filter(
    (p) => manualRoles[p.id] === 'seeker'
  ).length;

  const rec = useMemo(
    () => getRecommendedSettings(players.length),
    [players.length]
  );

  const activeModesCount = useMemo(() => {
    const m = draft.modifiers;
    let count = 0;
    if (m.classicModeEnabled) count++;
    if (draft.timeVictoryEnabled ?? true) count++;
    if (draft.beaconVictoryEnabled ?? true) count++;
    if (m.hunterPhotoEnabled) count++;
    if (m.fogEnabled) count++;
    if (m.radarEnabled) count++;
    if (m.trailEnabled) count++;
    if (m.stealthStillEnabled) count++;
    if (m.antiCampEnabled) count++;
    if (m.hotColdEnabled) count++;
    if (m.panicEndgameEnabled) count++;
    if (m.testJoystickEnabled ?? true) count++;
    return count;
  }, [draft]);

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
    <form onSubmit={handleSubmit} className="clean-card overflow-hidden">
      {/* Cabecera simple */}
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Sala {roomCode} · {rec.playersTag}
            </p>
            <h1 className="font-display mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
              Ajustes de partida
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => applyRecommendedToRules(prev, players.length))
              }
              className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
            >
              Usar recomendados ({rec.playersTag})
            </button>
            <button
              type="button"
              onClick={() => setDraft(structuredClone(DEFAULT_RULES))}
              className="text-slate-500 hover:text-slate-800"
            >
              Por defecto
            </button>
          </div>
        </div>

        {/* 3 pestañas intuitivas con icono, nombre y resumen */}
        <div
          role="tablist"
          aria-label="Secciones de configuración"
          className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1"
        >
          {(
            [
              {
                id: 'general',
                label: 'Básico',
                hint: 'Tiempos y roles',
                Icon: Clock,
              },
              {
                id: 'zones',
                label: 'Mapa',
                hint: `${zonesConfig.zones.length} ${
                  zonesConfig.zones.length === 1 ? 'zona' : 'zonas'
                }`,
                Icon: MapIcon,
              },
              {
                id: 'modes',
                label: 'Modos',
                hint: `${activeModesCount} activos`,
                Icon: Sparkles,
              },
            ] as const
          ).map(({ id, label, hint, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-center transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold">
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 leading-none">
                  {hint}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2.5 text-xs text-slate-500">
          {activeTab === 'general'
            ? 'Ajusta cuánto dura la partida, el tiempo para esconderse y cómo se eligen los buscadores.'
            : activeTab === 'zones'
            ? 'Mueve las zonas seguras en el mapa y configura cómo se irá cerrando la tormenta.'
            : 'Activa o desactiva reglas extra como la baliza, pistas, radar, niebla o reto foto.'}
        </p>
      </div>

      {/* Contenido de la pestaña */}
      <div className="p-5 sm:p-6">
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Tiempos y reglas */}
            <div className="space-y-5 lg:col-span-6">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Tiempos
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pon el número que quieras, sin límite máximo.
                </p>
              </div>

              <UnboundedNumberField
                id="rule-round-duration"
                label="Duración de la partida"
                description="Minutos totales para jugar la ronda."
                value={draft.roundDuration}
                unit="min"
                step={1}
                min={1}
                recommendedValue={rec.roundDuration}
                onChange={(val) =>
                  setDraft((prev) => ({ ...prev, roundDuration: val }))
                }
              />

              <div className="border-t border-slate-100 pt-4">
                <UnboundedNumberField
                  id="rule-hide-time"
                  label="Tiempo para esconderse"
                  description="Los buscadores esperan sin ver el mapa al empezar."
                  value={draft.hideTimeSec ?? 30}
                  unit="s"
                  step={5}
                  min={1}
                  recommendedValue={rec.hideTimeSec}
                  onChange={(val) =>
                    setDraft((prev) => ({ ...prev, hideTimeSec: val }))
                  }
                />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <UnboundedNumberField
                  id="rule-storm-grace"
                  label="Tiempo fuera de zona"
                  description="Segundos máximos fuera del círculo antes de ser eliminado."
                  value={draft.stormGraceSec ?? 30}
                  unit="s"
                  step={5}
                  min={1}
                  recommendedValue={rec.stormGraceSec}
                  onChange={(val) =>
                    setDraft((prev) => ({ ...prev, stormGraceSec: val }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Bloquear si apagan el GPS
                  </p>
                  <p className="text-xs text-slate-500">
                    Avisa a la sala y elimina tras 15 s sin ubicación.
                  </p>
                </div>
                <CleanSwitch
                  checked={draft.requireLocationGuard ?? true}
                  ariaLabel="Alternar bloqueo por GPS apagado"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      requireLocationGuard: !(prev.requireLocationGuard ?? true),
                    }))
                  }
                />
              </div>
            </div>

            {/* Equipos y buscadores */}
            <div className="space-y-5 border-t border-slate-100 pt-6 lg:col-span-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Equipos
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Elige quién busca al azar o manualmente.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { value: 'random', label: 'Al azar' },
                    { value: 'manual', label: 'Elegir a mano' },
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
                      className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {draft.roleAssignment === 'random' ? (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Buscadores al azar
                      </p>
                      <p className="text-xs text-slate-500">
                        Si lo apagas, eliges el número exacto.
                      </p>
                    </div>
                    <CleanSwitch
                      checked={draft.seekersCount === 'random'}
                      ariaLabel="Cantidad aleatoria de buscadores"
                      onToggle={() =>
                        setDraft((prev) => ({
                          ...prev,
                          seekersCount:
                            prev.seekersCount === 'random'
                              ? rec.seekersCount
                              : 'random',
                        }))
                      }
                    />
                  </div>

                  {draft.seekersCount !== 'random' && (
                    <UnboundedNumberField
                      id="rule-seekers-count"
                      label="Cuántos buscan"
                      description="Siempre queda al menos 1 fugitivo."
                      value={Number(draft.seekersCount) || 1}
                      unit="pers."
                      step={1}
                      min={1}
                      recommendedValue={rec.seekersCount}
                      onChange={(val) =>
                        setDraft((prev) => ({ ...prev, seekersCount: val }))
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Buscadores: {selectedSeekersCount}</span>
                    <span>Recomendado: {rec.seekersCount}</span>
                  </div>

                  {players.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Todavía no hay jugadores conectados.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {players.map((p) => {
                        const role: PlayerRole =
                          manualRoles[p.id] === 'seeker' ? 'seeker' : 'hider';
                        return (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
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
                                    <span className="inline-flex items-center gap-0.5 text-amber-600">
                                      <Crown className="h-3 w-3" aria-hidden="true" />
                                      Anfitrión
                                    </span>
                                  )}
                                  {p.id === currentPlayerId && (
                                    <span className="font-semibold text-emerald-700">
                                      Tú
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSetPlayerRole(p.id, 'hider')}
                                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                  role === 'hider'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Fugitivo</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetPlayerRole(p.id, 'seeker')}
                                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                  role === 'seeker'
                                    ? 'bg-rose-600 text-white'
                                    : 'text-slate-600 hover:text-slate-900'
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
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'zones' && (
          <ZoneMapEditor
            zonesConfig={zonesConfig}
            isHost={true}
            playerCount={players.length}
            onUpdateZonesConfig={handleZonesChange}
          />
        )}

        {activeTab === 'modes' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Enciende solo las reglas que quieras usar. Al activar una verás sus números.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {/* 1. Juego clásico */}
              <div
                className={`rounded-2xl border p-4 space-y-3 md:col-span-2 transition-colors ${
                  draft.modifiers.classicModeEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🎮</span>
                      Juego clásico
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Muestra jugadores en el mapa o enseña pistas cada cierto tiempo.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.classicModeEnabled)}
                    ariaLabel="Alternar juego clásico"
                    onToggle={() =>
                      setDraft((prev) => {
                        const nextOn = !prev.modifiers.classicModeEnabled;
                        const anySubEnabled =
                          prev.hints ||
                          prev.hidersCanSeeSeekers ||
                          prev.seekersCanSeeHiders;
                        return {
                          ...prev,
                          hints: nextOn && !anySubEnabled ? true : prev.hints,
                          modifiers: {
                            ...prev.modifiers,
                            classicModeEnabled: nextOn,
                          },
                        };
                      })
                    }
                  />
                </div>

                {draft.modifiers.classicModeEnabled && (
                  <div className="border-t border-slate-200/70 pt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          Fugitivos ven al buscador
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Visible siempre en el mapa.
                        </p>
                      </div>
                      <CleanSwitch
                        checked={Boolean(draft.hidersCanSeeSeekers)}
                        ariaLabel="Los fugitivos ven al buscador"
                        onToggle={() =>
                          setDraft((prev) => ({
                            ...prev,
                            hidersCanSeeSeekers: !prev.hidersCanSeeSeekers,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          Buscador ve a fugitivos
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Visible siempre en el mapa.
                        </p>
                      </div>
                      <CleanSwitch
                        checked={Boolean(draft.seekersCanSeeHiders)}
                        ariaLabel="El buscador ve a los fugitivos"
                        onToggle={() =>
                          setDraft((prev) => ({
                            ...prev,
                            seekersCanSeeHiders: !prev.seekersCanSeeHiders,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            Pistas cada poco
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Muestra dónde están un momento.
                          </p>
                        </div>
                        <CleanSwitch
                          checked={Boolean(draft.hints)}
                          ariaLabel="Alternar pistas periódicas"
                          onToggle={() =>
                            setDraft((prev) => ({ ...prev, hints: !prev.hints }))
                          }
                        />
                      </div>

                      {draft.hints && (
                        <div className="space-y-3 border-t border-slate-200/70 pt-2.5">
                          <UnboundedNumberField
                            id="mod-classic-hint-sec"
                            label="Cada cuántos segundos"
                            value={draft.modifiers.classicHintIntervalSec ?? 30}
                            unit="s"
                            step={5}
                            min={1}
                            recommendedValue={rec.classicHintIntervalSec}
                            onChange={(sec) =>
                              setDraft((prev) => ({
                                ...prev,
                                modifiers: {
                                  ...prev.modifiers,
                                  classicHintIntervalSec: sec,
                                },
                              }))
                            }
                          />

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-700">
                              Enseñar también al buscador
                            </span>
                            <CleanSwitch
                              checked={Boolean(
                                draft.modifiers.classicHintsIncludeSeeker
                              )}
                              ariaLabel="Mostrar también al buscador en las pistas"
                              onToggle={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  modifiers: {
                                    ...prev.modifiers,
                                    classicHintsIncludeSeeker:
                                      !prev.modifiers.classicHintsIncludeSeeker,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Victoria por tiempo */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.timeVictoryEnabled ?? true
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">⏳</span>
                      Victoria por tiempo
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Los fugitivos ganan si llegan vivos al final del reloj.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={draft.timeVictoryEnabled ?? true}
                    ariaLabel="Alternar victoria por tiempo para fugitivos"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        timeVictoryEnabled: !(prev.timeVictoryEnabled ?? true),
                      }))
                    }
                  />
                </div>
                {(draft.timeVictoryEnabled ?? true) && (
                  <div className="border-t border-slate-200/70 pt-3">
                    <UnboundedNumberField
                      id="mod-time-victory"
                      label="Minutos para ganar"
                      value={draft.roundDuration}
                      unit="min"
                      step={1}
                      min={1}
                      recommendedValue={rec.roundDuration}
                      onChange={(mins) =>
                        setDraft((prev) => ({ ...prev, roundDuration: mins }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 3. Baliza de extracción */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.beaconVictoryEnabled ?? true
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🚩</span>
                      Baliza de extracción
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Bandera verde: si un fugitivo aguanta dentro, gana al instante.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={draft.beaconVictoryEnabled ?? true}
                    ariaLabel="Alternar baliza de extracción"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        beaconVictoryEnabled: !(prev.beaconVictoryEnabled ?? true),
                      }))
                    }
                  />
                </div>
                {(draft.beaconVictoryEnabled ?? true) && (
                  <div className="border-t border-slate-200/70 pt-3 space-y-3">
                    <UnboundedNumberField
                      id="mod-beacon-hold"
                      label="Segundos dentro"
                      value={draft.modifiers.beaconHoldSec ?? 8}
                      unit="s"
                      step={1}
                      min={1}
                      recommendedValue={rec.beaconHoldSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, beaconHoldSec: sec },
                        }))
                      }
                    />
                    <UnboundedNumberField
                      id="mod-beacon-radius"
                      label="Radio de la baliza"
                      value={draft.modifiers.beaconRadiusM ?? 25}
                      unit="m"
                      step={5}
                      min={1}
                      recommendedValue={rec.beaconRadiusM}
                      onChange={(m) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, beaconRadiusM: m },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 4. Foto con el cazador */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.hunterPhotoEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">📸</span>
                      Foto con el cazador
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Los fugitivos deben hacerse un selfie donde salga el buscador.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.hunterPhotoEnabled)}
                    ariaLabel="Alternar foto con el cazador"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          hunterPhotoEnabled: !prev.modifiers.hunterPhotoEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.hunterPhotoEnabled && (
                  <div className="border-t border-slate-200/70 pt-3 space-y-3">
                    <UnboundedNumberField
                      id="mod-photo-window"
                      label="Tiempo para hacerla"
                      value={draft.modifiers.hunterPhotoWindowSec ?? 60}
                      unit="s"
                      step={10}
                      min={1}
                      recommendedValue={rec.hunterPhotoWindowSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: {
                            ...prev.modifiers,
                            hunterPhotoWindowSec: sec,
                          },
                        }))
                      }
                    />
                    <UnboundedNumberField
                      id="mod-photo-delay"
                      label="Cuándo empieza el reto"
                      value={draft.modifiers.hunterPhotoDelaySec ?? 15}
                      unit="s"
                      step={5}
                      min={1}
                      recommendedValue={rec.hunterPhotoDelaySec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: {
                            ...prev.modifiers,
                            hunterPhotoDelaySec: sec,
                          },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 5. Modo niebla */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.fogEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🌫️</span>
                      Modo niebla
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Oscurece el mapa: solo ves a otros si están muy cerca.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.fogEnabled)}
                    ariaLabel="Alternar modo niebla"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          fogEnabled: !prev.modifiers.fogEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.fogEnabled && (
                  <div className="border-t border-slate-200/70 pt-3">
                    <UnboundedNumberField
                      id="mod-fog-radius"
                      label="Distancia visible"
                      value={draft.modifiers.fogRadiusM ?? 60}
                      unit="m"
                      step={10}
                      min={1}
                      recommendedValue={rec.fogRadiusM}
                      onChange={(m) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, fogRadiusM: m },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 6. Modo radar */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.radarEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">📡</span>
                      Modo radar
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Envía un pulso cada pocos segundos con la posición cercana.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.radarEnabled)}
                    ariaLabel="Alternar modo radar"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          radarEnabled: !prev.modifiers.radarEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.radarEnabled && (
                  <div className="border-t border-slate-200/70 pt-3 space-y-3">
                    <UnboundedNumberField
                      id="mod-radar-interval"
                      label="Cada cuántos segundos"
                      value={draft.modifiers.radarIntervalSec ?? 20}
                      unit="s"
                      step={5}
                      min={1}
                      recommendedValue={rec.radarIntervalSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, radarIntervalSec: sec },
                        }))
                      }
                    />
                    <UnboundedNumberField
                      id="mod-radar-range"
                      label="Alcance del radar"
                      value={draft.modifiers.radarRangeM ?? 300}
                      unit="m"
                      step={25}
                      min={1}
                      recommendedValue={rec.radarRangeM}
                      onChange={(m) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, radarRangeM: m },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 7. Modo rastro */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.trailEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">👣</span>
                      Modo rastro
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Deja huellas temporales en el mapa para seguir pasos.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.trailEnabled)}
                    ariaLabel="Alternar modo rastro"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          trailEnabled: !prev.modifiers.trailEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.trailEnabled && (
                  <div className="border-t border-slate-200/70 pt-3">
                    <UnboundedNumberField
                      id="mod-trail-duration"
                      label="Duración de las huellas"
                      value={draft.modifiers.trailDurationSec ?? 90}
                      unit="s"
                      step={15}
                      min={1}
                      recommendedValue={rec.trailDurationSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, trailDurationSec: sec },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 8. Sigilo inmóvil */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.stealthStillEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🥷</span>
                      Sigilo inmóvil
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Al quedarte quieto, desapareces del radar y no dejas huellas.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.stealthStillEnabled)}
                    ariaLabel="Alternar sigilo inmóvil"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          stealthStillEnabled: !prev.modifiers.stealthStillEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.stealthStillEnabled && (
                  <div className="border-t border-slate-200/70 pt-3">
                    <UnboundedNumberField
                      id="mod-stealth-delay"
                      label="Segundos quieto"
                      value={draft.modifiers.stealthStillDelaySec ?? 10}
                      unit="s"
                      step={2}
                      min={1}
                      recommendedValue={rec.stealthStillDelaySec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: {
                            ...prev.modifiers,
                            stealthStillDelaySec: sec,
                          },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 9. Prohibido campear */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.antiCampEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🚨</span>
                      Prohibido campear
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Si un fugitivo no se mueve durante mucho tiempo, aparece en el mapa.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.antiCampEnabled)}
                    ariaLabel="Alternar prohibido campear"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          antiCampEnabled: !prev.modifiers.antiCampEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.antiCampEnabled && (
                  <div className="border-t border-slate-200/70 pt-3 space-y-3">
                    <UnboundedNumberField
                      id="mod-anticamp-limit"
                      label="Tiempo quieto máximo"
                      value={draft.modifiers.antiCampLimitSec ?? 45}
                      unit="s"
                      step={5}
                      min={1}
                      recommendedValue={rec.antiCampLimitSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, antiCampLimitSec: sec },
                        }))
                      }
                    />
                    <UnboundedNumberField
                      id="mod-anticamp-radius"
                      label="Distancia mínima"
                      value={draft.modifiers.antiCampRadiusM ?? 12}
                      unit="m"
                      step={2}
                      min={1}
                      recommendedValue={rec.antiCampRadiusM}
                      onChange={(m) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, antiCampRadiusM: m },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 10. Frío / Caliente */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.hotColdEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🌡️</span>
                      Frío / Caliente
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Indica arriba si estás lejos o muy cerca del rival más cercano.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.hotColdEnabled)}
                    ariaLabel="Alternar termómetro frío caliente"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          hotColdEnabled: !prev.modifiers.hotColdEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.hotColdEnabled && (
                  <div className="border-t border-slate-200/70 pt-3">
                    <UnboundedNumberField
                      id="mod-hotcold-near"
                      label="Distancia de cerca"
                      value={draft.modifiers.hotColdNearM ?? 35}
                      unit="m"
                      step={5}
                      min={1}
                      recommendedValue={rec.hotColdNearM}
                      onChange={(m) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, hotColdNearM: m },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 11. Recta final frenética */}
              <div
                className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                  draft.modifiers.panicEndgameEnabled
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">⚡</span>
                      Recta final frenética
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      En los últimos segundos, el buscador ve los metros hasta el fugitivo.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={Boolean(draft.modifiers.panicEndgameEnabled)}
                    ariaLabel="Alternar recta final frenética"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          panicEndgameEnabled: !prev.modifiers.panicEndgameEnabled,
                        },
                      }))
                    }
                  />
                </div>
                {draft.modifiers.panicEndgameEnabled && (
                  <div className="border-t border-slate-200/70 pt-3 space-y-3">
                    <UnboundedNumberField
                      id="mod-panic-window"
                      label="Últimos segundos"
                      value={draft.modifiers.panicWindowSec ?? 60}
                      unit="s"
                      step={10}
                      min={1}
                      recommendedValue={rec.panicWindowSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: { ...prev.modifiers, panicWindowSec: sec },
                        }))
                      }
                    />
                    <UnboundedNumberField
                      id="mod-panic-ping"
                      label="Frecuencia de aviso"
                      value={draft.modifiers.panicPingIntervalSec ?? 15}
                      unit="s"
                      step={5}
                      min={1}
                      recommendedValue={rec.panicPingIntervalSec}
                      onChange={(sec) =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: {
                            ...prev.modifiers,
                            panicPingIntervalSec: sec,
                          },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* 12. Joystick de prueba */}
              <div
                className={`rounded-2xl border p-4 space-y-3 md:col-span-2 transition-colors ${
                  draft.modifiers.testJoystickEnabled ?? true
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      <span className="mr-1.5" aria-hidden="true">🕹️</span>
                      Mando virtual para probar
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Permite moverse sin caminar. Apágalo para jugar por la calle.
                    </p>
                  </div>
                  <CleanSwitch
                    checked={draft.modifiers.testJoystickEnabled ?? true}
                    ariaLabel="Alternar joystick de prueba"
                    onToggle={() =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          testJoystickEnabled: !(prev.modifiers.testJoystickEnabled ?? true),
                        },
                      }))
                    }
                  />
                </div>
                {(draft.modifiers.testJoystickEnabled ?? true) && (
                  <div className="border-t border-slate-200/70 pt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      Velocidad inicial
                    </span>
                    <div className="inline-flex rounded-xl bg-white p-1 border border-slate-200">
                      {(
                        [
                          { id: 'walk', label: '1x' },
                          { id: 'run', label: '3x' },
                          { id: 'fast', label: '8x' },
                        ] as const
                      ).map((opt) => {
                        const active =
                          (draft.modifiers.testJoystickDefaultSpeed ?? 'run') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                modifiers: {
                                  ...prev.modifiers,
                                  testJoystickDefaultSpeed: opt.id,
                                },
                              }))
                            }
                            className={`min-h-[34px] rounded-lg px-3 font-mono text-xs font-semibold transition-colors ${
                              active
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pie simple */}
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {onCloseRoom ? (
          <button
            type="button"
            onClick={onCloseRoom}
            disabled={isSaving}
            className="self-start text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
          >
            Cerrar y borrar sala
          </button>
        ) : (
          <div />
        )}

        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              Volver
            </button>
          )}
          {activeTab !== 'modes' && (
            <button
              type="button"
              onClick={() =>
                setActiveTab(activeTab === 'general' ? 'zones' : 'modes')
              }
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <span>
                {activeTab === 'general' ? 'Siguiente: Mapa' : 'Siguiente: Modos'}
              </span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{isSaving ? 'Guardando...' : submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
