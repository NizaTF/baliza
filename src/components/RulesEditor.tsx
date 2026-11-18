import React, { useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  DEFAULT_RULES,
  PlayZone,
  RoomModifiers,
  RoomRules,
  RoundDuration,
  SeekersCount,
  SUGGESTED_FORBIDDEN_ZONES,
} from '../types/game';

interface RulesEditorProps {
  rules: RoomRules;
  roomCode: string;
  isSaving: boolean;
  onSave: (nextRules: RoomRules) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

const DURATIONS: RoundDuration[] = [10, 20, 30, 45, 60];
const SEEKER_OPTIONS: { value: SeekersCount; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 'random', label: 'Aleatorio' },
];
const PLAY_ZONES: { value: PlayZone; label: string }[] = [
  { value: 'free', label: 'Libre' },
  { value: 'radius_500m', label: 'Radio 500 m' },
  { value: 'radius_1km', label: 'Radio 1 km' },
  { value: 'radius_2km', label: 'Radio 2 km' },
];

interface ModifierMeta {
  key: Exclude<keyof RoomModifiers, 'forbiddenZones'>;
  emoji: string;
  title: string;
  description: string;
}

const MODIFIER_ITEMS: ModifierMeta[] = [
  {
    key: 'walkOnly',
    emoji: '🏃',
    title: 'Solo a pie',
    description: 'Prohíbe bicis, patinetes y transporte (regla de honor).',
  },
  {
    key: 'doubleAgent',
    emoji: '🎭',
    title: 'Modo "doble agente"',
    description: 'Un escondido trabaja en secreto para los buscadores.',
  },
  {
    key: 'mustMove',
    emoji: '💨',
    title: 'Cambio de escondite',
    description: 'Los escondidos deben cambiar de zona periódicamente.',
  },
  {
    key: 'noChat',
    emoji: '🔇',
    title: 'Sin chat',
    description: 'Solo posición y señales visuales durante la partida.',
  },
  {
    key: 'showCountdown',
    emoji: '⏱️',
    title: 'Cuenta atrás visible',
    description: 'Los escondidos pueden ver el tiempo restante.',
  },
  {
    key: 'nightMode',
    emoji: '🌙',
    title: 'Modo nocturno',
    description: 'Restringe zonas con poca visibilidad o sin alumbrado.',
  },
];

export const RulesEditor: React.FC<RulesEditorProps> = ({
  rules,
  roomCode,
  isSaving,
  onSave,
  onCancel,
  submitLabel = 'Guardar e ir al lobby',
}) => {
  const [draft, setDraft] = useState<RoomRules>(() => structuredClone(rules));
  const [zoneInput, setZoneInput] = useState('');

  const addForbiddenZone = (rawName: string) => {
    const clean = rawName.trim().slice(0, 40);
    if (!clean) return;
    if (
      draft.modifiers.forbiddenZones.some(
        (z) => z.toLowerCase() === clean.toLowerCase()
      )
    ) {
      setZoneInput('');
      return;
    }
    setDraft((prev) => ({
      ...prev,
      modifiers: {
        ...prev.modifiers,
        forbiddenZones: [...prev.modifiers.forbiddenZones, clean],
      },
    }));
    setZoneInput('');
  };

  const removeForbiddenZone = (zone: string) => {
    setDraft((prev) => ({
      ...prev,
      modifiers: {
        ...prev.modifiers,
        forbiddenZones: prev.modifiers.forbiddenZones.filter((z) => z !== zone),
      },
    }));
  };

  const toggleModifier = (
    key: Exclude<keyof RoomModifiers, 'forbiddenZones'>
  ) => {
    setDraft((prev) => ({
      ...prev,
      modifiers: {
        ...prev.modifiers,
        [key]: !prev.modifiers[key],
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(draft);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Cabecera del panel */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">
            Panel del anfitrión · Sala{' '}
            <span className="font-mono font-bold tracking-wider">{roomCode}</span>
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Configura las reglas de la partida
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Ajusta los tiempos y modificadores. Todos los jugadores en el lobby verán
            estos cambios al instante.
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
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Columna izquierda: Reglas básicas */}
        <section
          aria-labelledby="basic-rules-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5"
        >
          <h2
            id="basic-rules-heading"
            className="font-display text-lg font-bold text-slate-900"
          >
            01. Reglas básicas
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Parámetros principales de duración, equipo y zona.
          </p>

          <div className="mt-6 space-y-6">
            {/* Duración de ronda */}
            <div>
              <span className="block text-sm font-semibold text-slate-900">
                Duración de ronda
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
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mins}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nº de buscadores */}
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
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
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
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Zona de juego */}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="block text-sm font-semibold text-slate-900">
                  Zona de juego
                </span>
                <span className="text-xs text-slate-500">Mapa GPS en v0.3</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                {PLAY_ZONES.map((zone) => {
                  const active = draft.playZone === zone.value;
                  return (
                    <button
                      key={zone.value}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, playZone: zone.value }))
                      }
                      className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {zone.label}
                    </button>
                  );
                })}
              </div>
            </div>

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
          </div>
        </section>

        {/* Columna derecha: Modificadores de juego y Zonas prohibidas */}
        <section
          aria-labelledby="modifiers-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7"
        >
          <h2
            id="modifiers-heading"
            className="font-display text-lg font-bold text-slate-900"
          >
            02. Modificadores de juego
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Personaliza las reglas especiales y define los límites seguros de la ciudad.
          </p>

          {/* Lista editable de Zonas prohibidas */}
          <div className="mt-6 border-b border-slate-200 pb-6">
            <label
              htmlFor="forbidden-zone-input"
              className="block text-sm font-semibold text-slate-900"
            >
              🚫 Zonas prohibidas
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Sitios vetados donde ningún jugador puede esconderse ni cruzar.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                id="forbidden-zone-input"
                type="text"
                maxLength={40}
                placeholder="Ej. Parque cerrado, parking sur..."
                value={zoneInput}
                onChange={(e) => setZoneInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addForbiddenZone(zoneInput);
                  }
                }}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
              <button
                type="button"
                onClick={() => addForbiddenZone(zoneInput)}
                disabled={!zoneInput.trim()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Añadir</span>
              </button>
            </div>

            {/* Sugerencias rápidas */}
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_FORBIDDEN_ZONES.filter(
                (s) =>
                  !draft.modifiers.forbiddenZones.some(
                    (z) => z.toLowerCase() === s.toLowerCase()
                  )
              ).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => addForbiddenZone(suggestion)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>

            {/* Lista actual de zonas prohibidas */}
            {draft.modifiers.forbiddenZones.length > 0 ? (
              <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/70">
                {draft.modifiers.forbiddenZones.map((zone) => (
                  <li
                    key={zone}
                    className="flex items-center justify-between gap-3 px-3.5 py-2"
                  >
                    <span className="truncate text-sm font-medium text-slate-800">
                      {zone}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeForbiddenZone(zone)}
                      aria-label={`Eliminar zona prohibida ${zone}`}
                      className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-400">
                Sin zonas vetadas por ahora (toda la zona de juego permitida).
              </p>
            )}
          </div>

          {/* Toggles de modificadores */}
          <div className="mt-4 divide-y divide-slate-100">
            {MODIFIER_ITEMS.map((item) => {
              const active = draft.modifiers[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 py-3.5 first:pt-2 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-base">
                        {item.emoji}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">
                        {item.title}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`hidden sm:inline text-xs font-semibold ${
                        active ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {active ? 'Activado' : 'Desactivado'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={`${item.title}: ${active ? 'Activado' : 'Desactivado'}`}
                      onClick={() => toggleModifier(item.key)}
                      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                        active ? 'bg-emerald-700' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                          active ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Barra de acción inferior */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            Volver sin guardar
          </button>
        )}
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          <span>{isSaving ? 'Sincronizando reglas...' : submitLabel}</span>
        </button>
      </div>
    </form>
  );
};
