import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, X } from 'lucide-react';

interface VirtualJoystickProps {
  initialSpeedId?: 'walk' | 'run' | 'fast';
  followMap: boolean;
  onToggleFollowMap: () => void;
  onMove: (dx: number, dy: number, speedMps: number, dtSec: number) => void;
  onClose: () => void;
}

const SPEED_OPTIONS = [
  { id: 'walk', label: '1x', mps: 6 },
  { id: 'run', label: '3x', mps: 20 },
  { id: 'fast', label: '8x', mps: 55 },
] as const;

const PAD_RADIUS_PX = 44;
const DEADZONE = 0.08;

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  initialSpeedId = 'run',
  followMap,
  onToggleFollowMap,
  onMove,
  onClose,
}) => {
  const [speedId, setSpeedId] = useState<'walk' | 'run' | 'fast'>(initialSpeedId);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const vectorRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const speedMpsRef = useRef(20);
  const onMoveRef = useRef(onMove);

  onMoveRef.current = onMove;
  speedMpsRef.current =
    SPEED_OPTIONS.find((s) => s.id === speedId)?.mps ?? 20;

  useEffect(() => {
    if (!isDragging) return;
    let rafId = 0;
    let lastMs = performance.now();

    const step = (now: number) => {
      const dtSec = Math.min(0.08, Math.max(0.001, (now - lastMs) / 1000));
      lastMs = now;
      const { dx, dy } = vectorRef.current;
      const mag = Math.hypot(dx, dy);
      if (mag > DEADZONE) {
        onMoveRef.current(dx, dy, speedMpsRef.current, dtSec);
      }
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [isDragging]);

  const updateFromClientPoint = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rawX = clientX - cx;
    const rawY = clientY - cy;
    const dist = Math.hypot(rawX, rawY);
    const clampedDist = Math.min(dist, PAD_RADIUS_PX);
    const angle = Math.atan2(rawY, rawX);
    const px = Math.cos(angle) * clampedDist;
    const py = Math.sin(angle) * clampedDist;

    setKnobOffset({ x: px, y: py });
    vectorRef.current = {
      dx: px / PAD_RADIUS_PX,
      dy: -py / PAD_RADIUS_PX,
    };
  };

  const resetStick = () => {
    pointerIdRef.current = null;
    vectorRef.current = { dx: 0, dy: 0 };
    setKnobOffset({ x: 0, y: 0 });
    setIsDragging(false);
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="pointer-events-auto w-[148px] select-none rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur-md"
      aria-label="Joystick virtual para mover ubicación"
    >
      {/* Cabecera minimalista */}
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-slate-600 pl-0.5">
          Mando
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleFollowMap}
            title={followMap ? 'Cámara siguiendo' : 'Cámara libre'}
            aria-label="Alternar seguimiento de cámara"
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              followMap
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar mando virtual"
            title="Volver al GPS real"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Selector rápido de velocidad */}
      <div className="mb-2.5 grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {SPEED_OPTIONS.map((opt) => {
          const active = speedId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSpeedId(opt.id)}
              className={`h-6 rounded-md font-mono text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Pad circular */}
      <div className="flex justify-center">
        <div
          ref={padRef}
          role="application"
          aria-label="Control direccional"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            pointerIdRef.current = e.pointerId;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignorar si no soporta captura
            }
            setIsDragging(true);
            updateFromClientPoint(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            e.preventDefault();
            e.stopPropagation();
            updateFromClientPoint(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            e.stopPropagation();
            resetStick();
          }}
          onPointerCancel={(e) => {
            if (pointerIdRef.current !== e.pointerId) return;
            e.stopPropagation();
            resetStick();
          }}
          className="relative flex h-[106px] w-[106px] touch-none items-center justify-center rounded-full border border-slate-200 bg-slate-100"
        >
          <div className="pointer-events-none h-10 w-10 rounded-full border border-dashed border-slate-300" />
          <div
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
            className={`pointer-events-none absolute h-10 w-10 rounded-full shadow-md transition-transform ${
              isDragging
                ? 'bg-emerald-600 duration-0'
                : 'bg-slate-800 duration-150'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
