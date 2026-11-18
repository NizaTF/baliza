import React from 'react';
import { CheckCircle2, MinusCircle } from 'lucide-react';
import { PlayZone, RoomRules, SeekersCount } from '../types/game';

interface RulesSummaryProps {
  rules: RoomRules;
  isHost: boolean;
}

function formatSeekers(count: SeekersCount): string {
  return count === 'random' ? 'Aleatorio' : `${count}`;
}

function formatPlayZone(zone: PlayZone): string {
  switch (zone) {
    case 'free':
      return 'Libre';
    case 'radius_500m':
      return 'Radio 500 m';
    case 'radius_1km':
      return 'Radio 1 km';
    case 'radius_2km':
      return 'Radio 2 km';
  }
}

export const RulesSummary: React.FC<RulesSummaryProps> = ({ rules, isHost }) => {
  const modifierRows = [
    {
      key: 'walkOnly',
      emoji: '🏃',
      label: 'Solo a pie',
      detail: 'Sin bicis ni patinetes',
      enabled: rules.modifiers.walkOnly,
    },
    {
      key: 'doubleAgent',
      emoji: '🎭',
      label: 'Modo "doble agente"',
      detail: 'Un escondido colabora con buscadores',
      enabled: rules.modifiers.doubleAgent,
    },
    {
      key: 'mustMove',
      emoji: '💨',
      label: 'Cambio de escondite',
      detail: 'Moverse periódicamente',
      enabled: rules.modifiers.mustMove,
    },
    {
      key: 'noChat',
      emoji: '🔇',
      label: 'Sin chat',
      detail: 'Solo señales visuales',
      enabled: rules.modifiers.noChat,
    },
    {
      key: 'showCountdown',
      emoji: '⏱️',
      label: 'Cuenta atrás visible',
      detail: 'Temporizador visible para escondidos',
      enabled: rules.modifiers.showCountdown,
    },
    {
      key: 'nightMode',
      emoji: '🌙',
      label: 'Modo nocturno',
      detail: 'Restringe zonas oscuras',
      enabled: rules.modifiers.nightMode,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Reglas de la partida
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {isHost
              ? 'Puedes ajustarlas en cualquier momento antes de iniciar.'
              : 'Solo lectura · Se actualizan automáticamente cuando el anfitrión las cambia.'}
          </p>
        </div>
      </div>

      {/* Reglas básicas en rejilla limpia */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-slate-200 pb-6 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-slate-500">Duración de ronda</dt>
          <dd className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900">
            {rules.roundDuration} min
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Buscadores</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {formatSeekers(rules.seekersCount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Roles</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {rules.roleAssignment === 'random' ? 'Aleatoria' : 'Manual'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Zona de juego</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {formatPlayZone(rules.playZone)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Pistas periódicas</dt>
          <dd
            className={`mt-1 text-base font-semibold ${
              rules.hints ? 'text-emerald-700' : 'text-slate-600'
            }`}
          >
            {rules.hints ? 'Activado' : 'Desactivado'}
          </dd>
        </div>
      </dl>

      {/* Zonas prohibidas */}
      <div className="border-b border-slate-200 pb-6">
        <h3 className="text-sm font-semibold text-slate-900">
          🚫 Zonas prohibidas
        </h3>
        {rules.modifiers.forbiddenZones.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5 text-sm text-slate-700">
            {rules.modifiers.forbiddenZones.map((zone) => (
              <li key={zone} className="flex items-center gap-2">
                <span className="text-rose-600 font-bold" aria-hidden="true">
                  ×
                </span>
                <span>{zone}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-slate-500">
            Ninguna zona restringida añadida.
          </p>
        )}
      </div>

      {/* Lista de modificadores */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          Modificadores activos y opciones
        </h3>
        <ul className="mt-3 divide-y divide-slate-100">
          {modifierRows.map((mod) => (
            <li
              key={mod.key}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  <span className="mr-1.5" aria-hidden="true">
                    {mod.emoji}
                  </span>
                  {mod.label}
                </p>
                <p className="text-xs text-slate-500">{mod.detail}</p>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 whitespace-nowrap ${
                  mod.enabled ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                {mod.enabled ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <MinusCircle className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{mod.enabled ? 'Activado' : 'Desactivado'}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
