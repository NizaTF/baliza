import React from 'react';
import { Bell, Timer, UserPlus, X } from 'lucide-react';

export interface LobbyToastItem {
  id: string;
  type: 'join' | 'countdown' | 'info';
  title: string;
  description?: string;
}

interface LobbyToastHostProps {
  toasts: LobbyToastItem[];
  countdownRemainingSec?: number | null;
  onDismiss: (id: string) => void;
}

export const LobbyToastHost: React.FC<LobbyToastHostProps> = ({
  toasts,
  countdownRemainingSec = null,
  onDismiss,
}) => {
  const hasActiveCountdown =
    countdownRemainingSec !== null && countdownRemainingSec > 0;

  if (toasts.length === 0 && !hasActiveCountdown) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Avisos de la sala"
      className="pointer-events-none fixed top-16 left-1/2 z-40 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2"
    >
      {hasActiveCountdown && (
        <div
          role="status"
          className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950 shadow-lg backdrop-blur-md transition-all"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <Timer className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">
                ¡Cuenta regresiva iniciada!
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                El anfitrión va a empezar la partida...
              </p>
            </div>
          </div>
          <span className="flex h-9 min-w-[38px] shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-2.5 font-mono text-base font-bold tabular-nums text-white">
            {Math.ceil(countdownRemainingSec)}s
          </span>
        </div>
      )}

      {toasts.map((toast) => {
        const isJoin = toast.type === 'join';
        const isCountdown = toast.type === 'countdown';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md transition-all ${
              isCountdown
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-slate-200 bg-white/95 text-slate-900'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  isJoin
                    ? 'bg-emerald-50 text-emerald-700'
                    : isCountdown
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {isJoin ? (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                ) : isCountdown ? (
                  <Timer className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Bell className="h-4 w-4" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="truncate text-xs text-slate-500 mt-0.5">
                    {toast.description}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar aviso"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
