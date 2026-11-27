import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  ChevronRight,
  Clock,
  Crown,
  Eye,
  Map as MapIcon,
  Save,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  BUILT_IN_PRESETS,
  deleteCustomPreset,
  loadCustomPresets,
  RulePreset,
  saveCustomPreset,
} from '../lib/presets';
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

interface ExtraRuleRowProps {
  emoji: string;
  title: string;
  description: string;
  checked: boolean;
  ariaLabel: string;
  onToggle: () => void;
  children?: React.ReactNode;
}

const ExtraRuleRow: React.FC<ExtraRuleRowProps> = ({
  emoji,
  title,
  description,
  checked,
  ariaLabel,
  onToggle,
  children,
}) => (
  <div className="py-3.5 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">
          <span className="mr-1.5" aria-hidden="true">
            {emoji}
          </span>
          {title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <CleanSwitch checked={checked} ariaLabel={ariaLabel} onToggle={onToggle} />
    </div>
    {checked && children && (
      <div className="rounded-xl bg-slate-50/80 p-3 space-y-3">{children}</div>
    )}
  </div>
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
  const [customPresets, setCustomPresets] = useState<RulePreset[]>(() =>
    loadCustomPresets()
  );
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

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
    if (m.infectionModeEnabled) count++;
    if (m.contractHuntEnabled) count++;
    if (m.abilitiesEnabled ?? true) count++;
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
      <div className="border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Sala {roomCode} · {rec.playersTag}
            </p>
            <h1 className="font-display mt-0.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Reglas de partida
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setShowSavePreset((v) => !v);
                setPresetNotice(null);
              }}
              className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 underline underline-offset-2"
            >
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Guardar preset</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => applyRecommendedToRules(prev, players.length))
              }
              className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
            >
              Recomendados
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

        {/* Presets rápidos y propios */}
        <div className="mt-3.5 space-y-2">
          {showSavePreset && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <input
                type="text"
                value={presetName}
                maxLength={32}
                placeholder="Nombre de tu preset (ej. Parque nocturno)"
                aria-label="Nombre del preset personalizado"
                onChange={(e) => setPresetName(e.target.value)}
                className="h-9 min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const next = saveCustomPreset(presetName, draft);
                  setCustomPresets(next);
                  setPresetName('');
                  setShowSavePreset(false);
                  setPresetNotice('Preset guardado en este dispositivo.');
                }}
                className="min-h-[36px] rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Guardar
              </button>
            </div>
          )}

          {presetNotice && (
            <p className="text-xs font-medium text-emerald-700">{presetNotice}</p>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[...customPresets, ...BUILT_IN_PRESETS].map((preset) => (
              <div
                key={preset.id}
                className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
              >
                <button
                  type="button"
                  title={preset.description}
                  onClick={() => {
                    setDraft((prev) => ({
                      ...structuredClone(preset.rules),
                      manualRoles: prev.manualRoles,
                    }));
                    setPresetNotice(`Preset "${preset.name}" aplicado.`);
                  }}
                  className="min-h-[32px] px-2.5 py-1 hover:bg-slate-50 rounded-l-lg whitespace-nowrap"
                >
                  {preset.name}
                </button>
                {!preset.builtIn && (
                  <button
                    type="button"
                    aria-label={`Borrar preset ${preset.name}`}
                    onClick={() => {
                      const next = deleteCustomPreset(preset.id);
                      setCustomPresets(next);
                    }}
                    className="flex h-[32px] w-7 items-center justify-center border-l border-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-r-lg"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 3 pestañas limpias */}
        <div
          role="tablist"
          aria-label="Secciones de configuración"
          className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
        >
          {(
            [
              {
                id: 'general',
                label: '1. Esencial',
                Icon: Clock,
              },
              {
                id: 'zones',
                label: `2. Mapa (${zonesConfig.zones.length})`,
                Icon: MapIcon,
              },
              {
                id: 'modes',
                label: `3. Extras (${activeModesCount})`,
                Icon: Sparkles,
              },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido de la pestaña */}
      <div className="p-4 sm:p-6">
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Selector principal de modo de juego */}
            <div className="space-y-2.5">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Modo de juego
                </h2>
                <p className="text-xs text-slate-500">
                  Elige qué ocurre cuando un buscador atrapa a un fugitivo.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      modifiers: {
                        ...prev.modifiers,
                        infectionModeEnabled: false,
                      },
                    }))
                  }
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    !draft.modifiers.infectionModeEnabled
                      ? 'border-slate-900 bg-white shadow-xs'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">
                    💀 Clásico (Eliminación)
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Quien es pillado queda eliminado y pasa a espectador.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      modifiers: {
                        ...prev.modifiers,
                        infectionModeEnabled: true,
                      },
                    }))
                  }
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    draft.modifiers.infectionModeEnabled
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">
                    🧟 Infección (Cambio de bando)
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Al cazar a un fugitivo, se infecta y pasa a pillar contigo.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 border-t border-slate-100 pt-5 lg:grid-cols-12">
              {/* Tiempos y reglas */}
              <div className="space-y-5 lg:col-span-6">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Tiempos
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ajusta la duración de cada fase.
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
                  <h2 className="font-display text-base font-bold text-slate-900">
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
                          setDraft((prev) => ({
                            ...prev,
                            roleAssignment: opt.value,
                          }))
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
                                        <Crown
                                          className="h-3 w-3"
                                          aria-hidden="true"
                                        />
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
                                  onClick={() =>
                                    handleSetPlayerRole(p.id, 'hider')
                                  }
                                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                    role === 'hider'
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Shield
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Fugitivo</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSetPlayerRole(p.id, 'seeker')
                                  }
                                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                    role === 'seeker'
                                      ? 'bg-rose-600 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Eye
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
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
          <div className="space-y-6">
            {/* Grupo 1: Victoria y objetivos */}
            <section className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Victoria y objetivos
              </h2>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                <ExtraRuleRow
                  emoji="⏳"
                  title="Victoria por tiempo"
                  description="Los fugitivos ganan si llegan vivos al final del reloj."
                  checked={draft.timeVictoryEnabled ?? true}
                  ariaLabel="Alternar victoria por tiempo para fugitivos"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      timeVictoryEnabled: !(prev.timeVictoryEnabled ?? true),
                    }))
                  }
                >
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
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="🚩"
                  title="Baliza de extracción"
                  description="Bandera verde: si un fugitivo aguanta dentro, gana al instante."
                  checked={draft.beaconVictoryEnabled ?? true}
                  ariaLabel="Alternar baliza de extracción"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      beaconVictoryEnabled: !(prev.beaconVictoryEnabled ?? true),
                    }))
                  }
                >
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
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="🎯"
                  title="Caza por objetivos (Contratos)"
                  description="Cada buscador recibe un fugitivo objetivo asignado."
                  checked={Boolean(draft.modifiers.contractHuntEnabled)}
                  ariaLabel="Alternar caza por objetivos"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      modifiers: {
                        ...prev.modifiers,
                        contractHuntEnabled: !prev.modifiers.contractHuntEnabled,
                      },
                    }))
                  }
                />
              </div>
            </section>

            {/* Grupo 2: Rastreo, niebla y pistas */}
            <section className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Rastreo, visibilidad y pistas
              </h2>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                <ExtraRuleRow
                  emoji="🎮"
                  title="Juego clásico"
                  description="Muestra jugadores en el mapa o enseña pistas cada pocos segundos."
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
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Fugitivos ven buscador
                      </span>
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
                      <span className="text-xs font-semibold text-slate-900">
                        Buscador ve fugitivos
                      </span>
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
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Pistas periódicas
                      </span>
                      <CleanSwitch
                        checked={Boolean(draft.hints)}
                        ariaLabel="Alternar pistas periódicas"
                        onToggle={() =>
                          setDraft((prev) => ({ ...prev, hints: !prev.hints }))
                        }
                      />
                    </div>
                  </div>
                  {draft.hints && (
                    <div className="border-t border-slate-200/70 pt-3 space-y-3">
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
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="🌑"
                  title="Apagón total (Niebla)"
                  description="Oscurece el mapa con un radio muy bajo: los jugadores solo se ven entre sí si están dentro del radio."
                  checked={Boolean(draft.modifiers.fogEnabled)}
                  ariaLabel="Alternar apagón total"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      modifiers: {
                        ...prev.modifiers,
                        fogEnabled: !prev.modifiers.fogEnabled,
                      },
                    }))
                  }
                >
                  <UnboundedNumberField
                    id="mod-fog-radius"
                    label="Radio de visibilidad"
                    value={draft.modifiers.fogRadiusM ?? 25}
                    unit="m"
                    step={5}
                    min={1}
                    recommendedValue={rec.fogRadiusM}
                    onChange={(m) =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: { ...prev.modifiers, fogRadiusM: m },
                      }))
                    }
                  />
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="📡"
                  title="Modo radar"
                  description="Envía un pulso cada pocos segundos con la posición cercana."
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
                >
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
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="👣"
                  title="Modo rastro"
                  description="Deja huellas temporales en el mapa para seguir pasos."
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
                >
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
                        modifiers: {
                          ...prev.modifiers,
                          trailDurationSec: sec,
                        },
                      }))
                    }
                  />
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="🌡️"
                  title="Frío / Caliente"
                  description="Indica si estás lejos o muy cerca del rival más cercano."
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
                >
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
                </ExtraRuleRow>
              </div>
            </section>

            {/* Grupo 3: Táctica, habilidades y retos */}
            <section className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Táctica, habilidades y retos
              </h2>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                <ExtraRuleRow
                  emoji="🪄"
                  title="Señuelos y habilidades"
                  description="Fugitivos: señuelo y silencio. Buscadores: sonar y rastreo."
                  checked={draft.modifiers.abilitiesEnabled ?? true}
                  ariaLabel="Alternar señuelos y habilidades"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      modifiers: {
                        ...prev.modifiers,
                        abilitiesEnabled: !(prev.modifiers.abilitiesEnabled ?? true),
                      },
                    }))
                  }
                >
                  <UnboundedNumberField
                    id="mod-abilities-charges"
                    label="Cargas por jugador"
                    value={draft.modifiers.abilitiesPerPlayer ?? 2}
                    unit="usos"
                    step={1}
                    min={1}
                    recommendedValue={2}
                    onChange={(uses) =>
                      setDraft((prev) => ({
                        ...prev,
                        modifiers: {
                          ...prev.modifiers,
                          abilitiesPerPlayer: uses,
                        },
                      }))
                    }
                  />
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="📸"
                  title="Foto con el cazador"
                  description="Los fugitivos deben hacerse un selfie donde salga el buscador."
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
                >
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
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="🥷"
                  title="Sigilo inmóvil"
                  description="Al quedarte quieto, desapareces del radar y no dejas huellas."
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
                >
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
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="🚨"
                  title="Prohibido campear"
                  description="Si un fugitivo no se mueve mucho rato, aparece en el mapa."
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
                >
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
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">
                        Modo mortal: No pares de correr
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Elimina al instante (fugitivos y buscadores) si se detienen.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(draft.modifiers.antiCampEliminate)}
                      aria-label="Alternar eliminación mortal por quietud"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          modifiers: {
                            ...prev.modifiers,
                            antiCampEliminate: !prev.modifiers.antiCampEliminate,
                          },
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                        draft.modifiers.antiCampEliminate
                          ? 'bg-rose-600'
                          : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                          draft.modifiers.antiCampEliminate
                            ? 'translate-x-5'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </ExtraRuleRow>

                <ExtraRuleRow
                  emoji="⚡"
                  title="Recta final frenética"
                  description="En los últimos segundos, el buscador ve los metros hasta el fugitivo."
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
                >
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
                </ExtraRuleRow>
              </div>
            </section>

            {/* Grupo 4: Pruebas */}
            <section className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Pruebas
              </h2>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                <ExtraRuleRow
                  emoji="🕹️"
                  title="Mando virtual para probar"
                  description="Permite moverse sin caminar. Apágalo para jugar por la calle."
                  checked={draft.modifiers.testJoystickEnabled ?? true}
                  ariaLabel="Alternar joystick de prueba"
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      modifiers: {
                        ...prev.modifiers,
                        testJoystickEnabled: !(
                          prev.modifiers.testJoystickEnabled ?? true
                        ),
                      },
                    }))
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                          (draft.modifiers.testJoystickDefaultSpeed ?? 'run') ===
                          opt.id;
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
                </ExtraRuleRow>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Pie simple */}
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
                {activeTab === 'general' ? 'Siguiente: Mapa' : 'Siguiente: Extras'}
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
