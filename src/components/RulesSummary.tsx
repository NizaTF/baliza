import React from 'react';
import { formatDurationSec, normalizeZonesConfig } from '../lib/zones';
import { RoomRules, SeekersCount } from '../types/game';

interface RulesSummaryProps {
  rules: RoomRules;
}

function formatSeekers(count: SeekersCount): string {
  return count === 'random' ? 'Al azar' : `${count}`;
}

export const RulesSummary: React.FC<RulesSummaryProps> = ({ rules }) => {
  const zonesConfig = normalizeZonesConfig(rules);
  const totalStormSec = zonesConfig.zones.reduce((acc, z, idx) => {
    if (idx === 0) return acc + z.waitTimeSec;
    return acc + z.shrinkTimeSec + z.waitTimeSec;
  }, 0);

  const activeModesList = (() => {
    const m = rules.modifiers;
    const labels: string[] = [];
    if (m?.infectionModeEnabled) labels.push('🧟 Infección');
    else labels.push('💀 Clásico');
    if (m?.contractHuntEnabled) labels.push('🎯 Contratos');
    if (m?.abilitiesEnabled ?? true) labels.push('🪄 Habilidades');
    if (rules.beaconVictoryEnabled ?? true) labels.push('🚩 Baliza');
    if (m?.hunterPhotoEnabled) labels.push('📸 Foto');
    if (m?.fogEnabled) labels.push('🌫️ Niebla');
    if (m?.radarEnabled) labels.push('📡 Radar');
    if (m?.trailEnabled) labels.push('👣 Rastro');
    if (m?.stealthStillEnabled) labels.push('🥷 Sigilo');
    if (m?.antiCampEnabled) {
      labels.push(
        m?.antiCampEliminate ? '🏃 No pares (Mortal)' : '🚨 Anti-camper'
      );
    }
    if (m?.hotColdEnabled) labels.push('🌡️ Frío/Caliente');
    if (m?.panicEndgameEnabled) labels.push('⚡ Recta final');
    if (m?.testJoystickEnabled ?? true) labels.push('🕹️ Mando virtual');
    return labels;
  })();

  return (
    <dl className="divide-y divide-slate-100 text-sm">
      <div className="flex items-center justify-between gap-3 py-2">
        <dt className="text-slate-500">Duración</dt>
        <dd className="font-semibold tabular-nums text-slate-900">
          {rules.roundDuration} min
        </dd>
      </div>

      <div className="flex items-center justify-between gap-3 py-2">
        <dt className="text-slate-500">Buscadores</dt>
        <dd className="font-semibold tabular-nums text-slate-900">
          {formatSeekers(rules.seekersCount)} ·{' '}
          {rules.roleAssignment === 'random' ? 'Ruleta' : 'Manual'}
        </dd>
      </div>

      <div className="flex items-center justify-between gap-3 py-2">
        <dt className="text-slate-500">Escondite inicial</dt>
        <dd className="font-semibold tabular-nums text-slate-900">
          {formatDurationSec(rules.hideTimeSec ?? 30)}
        </dd>
      </div>

      <div className="flex items-center justify-between gap-3 py-2">
        <dt className="text-slate-500">Zonas de tormenta</dt>
        <dd className="font-semibold tabular-nums text-slate-900">
          {zonesConfig.zones.length} ({formatDurationSec(totalStormSec)})
        </dd>
      </div>

      <div className="pt-2.5">
        <dt className="text-xs font-medium text-slate-500">Reglas activas</dt>
        <dd className="mt-1 text-xs font-medium text-slate-800 leading-relaxed">
          {activeModesList.join(' · ')}
        </dd>
      </div>
    </dl>
  );
};
