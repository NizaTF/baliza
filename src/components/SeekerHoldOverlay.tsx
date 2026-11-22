import React, { useEffect, useRef, useState } from 'react';
import { Eye, Volume2 } from 'lucide-react';
import {
  playHuntStartSting,
  playSeekerCountdownBeep,
  startSeekerTensionMusic,
  unlockRetroAudio,
} from '../lib/retroAudio';
import { PlayerRecord } from '../types/game';

interface SeekerHoldOverlayProps {
  remainingSec: number;
  totalHideSec: number;
  seekerTeammates: PlayerRecord[];
}

export const SeekerHoldOverlay: React.FC<SeekerHoldOverlayProps> = ({
  remainingSec,
  totalHideSec,
  seekerTeammates,
}) => {
  const [audioBlocked, setAudioBlocked] = useState(false);
  const lastBeepSecRef = useRef<number | null>(null);
  const stingPlayedRef = useRef(false);

  const ceilSec = Math.max(0, Math.ceil(remainingSec));
  const progressPct =
    totalHideSec > 0
      ? Math.min(100, Math.max(0, ((totalHideSec - remainingSec) / totalHideSec) * 100))
      : 100;

  // Música de tensión continua mientras los buscadores esperan en pantalla negra
  useEffect(() => {
    const music = startSeekerTensionMusic();
    setAudioBlocked(music.wasBlocked);
    return () => {
      music.stop();
    };
  }, []);

  // Pitido de cuenta atrás cada segundo y alarma final al llegar a 0
  useEffect(() => {
    if (ceilSec > 0) {
      if (lastBeepSecRef.current !== ceilSec) {
        lastBeepSecRef.current = ceilSec;
        playSeekerCountdownBeep(ceilSec);
      }
    } else if (!stingPlayedRef.current) {
      stingPlayedRef.current = true;
      playHuntStartSting();
    }
  }, [ceilSec]);

  const handleEnableAudio = () => {
    unlockRetroAudio();
    setAudioBlocked(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Espera de buscadores con cuenta atrás"
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black dr-scanlines px-6 py-8 text-white select-none"
    >
      {/* Cabecera */}
      <header className="w-full max-w-md text-center space-y-2 pt-2">
        <div className="inline-flex items-center gap-2 border border-[#FF1E6E] bg-[#FF1E6E]/15 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-[#FF1E6E]">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Eres buscador · Espera en negro</span>
        </div>
        <h1 className="font-display text-xl sm:text-2xl font-bold uppercase tracking-tight text-white">
          Los fugitivos se esconden...
        </h1>
      </header>

      {/* Cuenta atrás central gigante */}
      <main className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6">
        <div
          className={`flex h-48 w-48 sm:h-56 sm:w-56 flex-col items-center justify-center border-4 bg-black transition-colors ${
            ceilSec <= 5
              ? 'border-[#FF1E6E] shadow-[0_0_50px_rgba(255,30,110,0.45)]'
              : 'border-zinc-700 shadow-[0_0_30px_rgba(255,255,255,0.08)]'
          }`}
        >
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-400">
            Sales en
          </span>
          <span
            className={`font-mono text-7xl sm:text-8xl font-extrabold tabular-nums leading-none mt-1 ${
              ceilSec <= 5 ? 'text-[#FF1E6E]' : 'text-white'
            }`}
          >
            {ceilSec}
          </span>
          <span className="font-mono text-xs font-bold uppercase text-zinc-500 mt-2">
            segundos
          </span>
        </div>

        {/* Barra de progreso de tensión */}
        <div className="w-full max-w-xs space-y-2">
          <div className="h-2.5 w-full overflow-hidden border border-zinc-700 bg-zinc-950">
            <div
              className="h-full bg-[#FF1E6E] transition-[width] duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-center text-xs text-zinc-400 leading-relaxed">
            No mires alrededor. Cuando la cuenta llegue a 0 se abrirá el mapa y comenzará la caza.
          </p>
        </div>

        {seekerTeammates.length > 0 && (
          <p className="font-mono text-xs text-zinc-400 text-center">
            Otros buscadores:{' '}
            <span className="text-white font-semibold">
              {seekerTeammates.map((p) => p.name).join(', ')}
            </span>
          </p>
        )}
      </main>

      {/* Pie */}
      <footer className="w-full max-w-md space-y-2 pb-safe text-center">
        {audioBlocked && (
          <button
            type="button"
            onClick={handleEnableAudio}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 border-2 border-[#FF1E6E] bg-[#FF1E6E]/20 px-4 py-2 font-display text-xs font-bold uppercase text-[#FF1E6E] hover:bg-[#FF1E6E]/30"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Activar música de tensión</span>
          </button>
        )}
        <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          Tiempo total de escondite: {totalHideSec}s
        </p>
      </footer>
    </div>
  );
};
