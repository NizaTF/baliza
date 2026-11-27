import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, KeyRound, Lock, ShieldCheck, X } from 'lucide-react';

interface DebugUnlockModalProps {
  isCurrentlyUnlocked: boolean;
  onConfirmActivate: () => void;
  onConfirmDeactivate: () => void;
  onClose: () => void;
}

const VALID_CODES = new Set(['DEBUG', 'BALIZA']);
const HOLD_DURATION_MS = 1200;

export const DebugUnlockModal: React.FC<DebugUnlockModalProps> = ({
  isCurrentlyUnlocked,
  onConfirmActivate,
  onConfirmDeactivate,
  onClose,
}) => {
  const [code, setCode] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);

  const normalizedCode = code.trim().toUpperCase();
  const isCodeValid = VALID_CODES.has(normalizedCode);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const stopHold = () => {
    setIsHolding(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoldProgress(0);
  };

  const startHold = () => {
    if (!isCodeValid) {
      setError('Introduce la clave de acceso (DEBUG o BALIZA) antes de mantener pulsado.');
      return;
    }
    setError(null);
    setIsHolding(true);
    holdStartRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - holdStartRef.current;
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        rafRef.current = null;
        setIsHolding(false);
        onConfirmActivate();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verificación de Modo Debug"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/65 p-0 sm:p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                {isCurrentlyUnlocked
                  ? 'Modo Debug activo'
                  : 'Verificación · Paso 2 de 2'}
              </h2>
              <p className="text-xs text-slate-500">
                {isCurrentlyUnlocked
                  ? 'Tus cosméticos equipados en Debug se guardarán.'
                  : 'Confirmación extra tras los 5 toques secretos'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar verificación"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isCurrentlyUnlocked ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                  <span>Laboratorio y cosméticos libres activos</span>
                </p>
                <p className="text-amber-900/90">
                  Si desactivas el modo debug volverás al juego normal, pero tus cosméticos equipados aquí quedarán guardados para cuando regreses.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Mantener activo
                </button>
                <button
                  type="button"
                  onClick={onConfirmDeactivate}
                  className="min-h-[44px] rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Desactivar Debug
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="debug-access-code"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
                >
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>1. Escribe la palabra clave (DEBUG)</span>
                </label>
                <input
                  id="debug-access-code"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Escribe DEBUG o BALIZA…"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.slice(0, 12));
                    setError(null);
                  }}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 font-mono text-sm font-semibold uppercase tracking-wider text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                />
                {error && (
                  <p className="text-xs font-semibold text-rose-600" role="alert">
                    {error}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>2. Mantén pulsado 1,2 s para confirmar</span>
                </p>
                <button
                  type="button"
                  onPointerDown={startHold}
                  onPointerUp={stopHold}
                  onPointerLeave={stopHold}
                  onPointerCancel={stopHold}
                  onKeyDown={(e) => {
                    if ((e.key === ' ' || e.key === 'Enter') && !isHolding) {
                      e.preventDefault();
                      startHold();
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      stopHold();
                    }
                  }}
                  className={`relative flex min-h-[48px] w-full items-center justify-center overflow-hidden rounded-xl border text-sm font-bold transition-colors select-none ${
                    isCodeValid
                      ? 'border-amber-400 bg-amber-100 text-amber-950'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-amber-400 transition-[width] duration-75"
                    style={{ width: `${holdProgress}%` }}
                  />
                  <span className="relative z-10">
                    {isHolding
                      ? `Calibrando… ${Math.round(holdProgress)}%`
                      : 'Mantén pulsado para activar Debug'}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
