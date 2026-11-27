import React, { useMemo } from 'react';
import { Award, CheckCircle2, Flame, Footprints, Trophy, X } from 'lucide-react';
import { loadStatsAndAchievements } from '../lib/achievements';

interface AchievementsModalProps {
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  onClose,
}) => {
  const { stats, achievements } = useMemo(() => loadStatsAndAchievements(), []);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Logros y estadísticas"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 p-0 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Award className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Logros y estadísticas
              </h2>
              <p className="text-xs text-slate-500">
                {unlockedCount} de {achievements.length} desbloqueados en este dispositivo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar logros"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Resumen numérico */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <Trophy className="mx-auto h-4 w-4 text-emerald-600" aria-hidden="true" />
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900">
                {stats.wins}/{stats.matchesPlayed}
              </p>
              <p className="text-[11px] font-medium text-slate-500">Victorias</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <Footprints className="mx-auto h-4 w-4 text-sky-600" aria-hidden="true" />
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900">
                {stats.totalMeters >= 1000
                  ? `${(stats.totalMeters / 1000).toFixed(1)} km`
                  : `${stats.totalMeters} m`}
              </p>
              <p className="text-[11px] font-medium text-slate-500">Distancia</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <Flame className="mx-auto h-4 w-4 text-amber-600" aria-hidden="true" />
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900">
                {stats.bestWinStreak}
              </p>
              <p className="text-[11px] font-medium text-slate-500">Mejor racha</p>
            </div>
          </div>

          {/* Lista de logros */}
          <ul className="space-y-2.5">
            {achievements.map((item) => {
              const pct = Math.min(
                100,
                Math.round((item.current / item.target) * 100)
              );
              return (
                <li
                  key={item.id}
                  className={`rounded-xl border p-3.5 transition-colors ${
                    item.unlocked
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${
                          item.unlocked
                            ? 'bg-emerald-100'
                            : 'bg-slate-100 grayscale opacity-70'
                        }`}
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    {item.unlocked ? (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0 text-emerald-600"
                        aria-label="Desbloqueado"
                      />
                    ) : (
                      <span className="font-mono text-xs font-semibold tabular-nums text-slate-500 shrink-0">
                        {Math.min(item.current, item.target)}/{item.target}
                      </span>
                    )}
                  </div>

                  {!item.unlocked && (
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
