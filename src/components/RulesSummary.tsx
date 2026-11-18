import React from 'react';
import { formatDurationSec, normalizeZonesConfig } from '../lib/zones';
import { RoomRules, SeekersCount } from '../types/game';

interface RulesSummaryProps {
  rules: RoomRules;
  isHost: boolean;
}

function formatSeekers(count: SeekersCount): string {
  return count === 'random' ? 'Aleatorio' : `${count}`;
}

export const RulesSummary: React.FC<RulesSummaryProps> = ({ rules, isHost }) => {
  const zonesConfig = normalizeZonesConfig(rules);
  const totalStormSec = zonesConfig.zones.reduce((acc, z, idx) => {
    if (idx === 0) return acc + z.waitTimeSec;
    return acc + z.shrinkTimeSec + z.waitTimeSec;
  }, 0);

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="font-display text-lg font-bold text-slate-900">
          Reglas de la partida
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {isHost
            ? 'Configura reglas y zonas desde la pestaña Reglas.'
            : 'Solo lectura · Se actualizan en vivo si el anfitrión las modifica.'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <dt className="text-xs font-medium text-slate-500">Duración máxima</dt>
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
          <dt className="text-xs font-medium text-slate-500">Pistas periódicas</dt>
          <dd
            className={`mt-1 text-base font-semibold ${
              rules.hints ? 'text-emerald-700' : 'text-slate-600'
            }`}
          >
            {rules.hints ? 'Activado' : 'Desactivado'}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-slate-500">Modo de zonas</dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">
            {zonesConfig.mode === 'random' ? 'Aleatoria (oculta)' : 'Manual'}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-slate-500">Fases de tormenta</dt>
          <dd className="mt-1 font-mono text-base font-bold tabular-nums text-slate-900">
            {zonesConfig.zones.length} · {formatDurationSec(totalStormSec)}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-slate-500">
            Ven al buscador
          </dt>
          <dd
            className={`mt-1 text-base font-semibold ${
              rules.hidersCanSeeSeekers ? 'text-emerald-700' : 'text-slate-600'
            }`}
          >
            {rules.hidersCanSeeSeekers ? 'Sí' : 'No'}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium text-slate-500">
            Buscador ve jugadores
          </dt>
          <dd
            className={`mt-1 text-base font-semibold ${
              rules.seekersCanSeeHiders ? 'text-emerald-700' : 'text-slate-600'
            }`}
          >
            {rules.seekersCanSeeHiders ? 'Sí' : 'No'}
          </dd>
        </div>

        <div className="col-span-2">
          <dt className="text-xs font-medium text-slate-500">
            Tiempo máximo en tormenta
          </dt>
          <dd className="mt-1 font-mono text-base font-bold tabular-nums text-violet-700">
            {rules.stormGraceSec ?? 30} s (revela y elimina)
          </dd>
        </div>
      </dl>
    </div>
  );
};
