import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Shield, Sparkles, Volume2 } from 'lucide-react';
import {
  playRouletteLock,
  playRouletteTick,
  startRouletteMusicLoop,
  unlockRetroAudio,
} from '../lib/retroAudio';
import { PlayerCosmetics, PlayerRecord } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCosmeticName } from './PlayerCosmeticName';

interface SeekerRouletteOverlayProps {
  players: PlayerRecord[];
  seekerOrder: string[];
  currentPlayerId: string;
  startMs: number;
  totalDurationMs: number;
  clockOffsetMs?: number;
  playerCosmetics?: Record<string, PlayerCosmetics>;
}

export const ROULETTE_ROUND_MS = 7200;
export const ROULETTE_SPIN_MS = 5200;
export const ROULETTE_FINAL_MS = 2200;

const TILE_WIDTH = 112;
const TILE_GAP = 12;
const STRIDE = TILE_WIDTH + TILE_GAP;
const STRIP_LENGTH = 68;
const WIN_TILE_INDEX = 56;

export const SeekerRouletteOverlay: React.FC<SeekerRouletteOverlayProps> = ({
  players,
  seekerOrder,
  currentPlayerId,
  startMs,
  totalDurationMs,
  clockOffsetMs = 0,
  playerCosmetics = {},
}) => {
  const totalSeekers = Math.max(1, seekerOrder.length);
  const roundsEndMs = totalSeekers * ROULETTE_ROUND_MS;

  const clockOffsetRef = useRef(clockOffsetMs);
  clockOffsetRef.current = clockOffsetMs;

  const initialSyncedNow = Date.now() + clockOffsetMs;
  const initialHasStarted = initialSyncedNow >= startMs;
  const initialElapsed = Math.max(0, initialSyncedNow - startMs);
  const initialFinal = initialElapsed >= roundsEndMs;
  const initialRoundIdx = initialFinal
    ? totalSeekers - 1
    : Math.min(totalSeekers - 1, Math.floor(initialElapsed / ROULETTE_ROUND_MS));
  const initialRoundElapsed = initialFinal
    ? ROULETTE_ROUND_MS
    : initialElapsed - initialRoundIdx * ROULETTE_ROUND_MS;

  const [hasStarted, setHasStarted] = useState(initialHasStarted);
  const [roundIdx, setRoundIdx] = useState(initialRoundIdx);
  const [isRoundLocked, setIsRoundLocked] = useState(
    initialFinal || initialRoundElapsed >= ROULETTE_SPIN_MS
  );
  const [isFinalSummary, setIsFinalSummary] = useState(initialFinal);
  const [tensionStage, setTensionStage] = useState<'fast' | 'slow' | 'near'>('fast');
  const [audioBlocked, setAudioBlocked] = useState(false);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const lastTickTileRef = useRef<number>(-1);
  const lockedRoundsRef = useRef<Set<number>>(new Set());
  const stateRef = useRef({
    hasStarted: initialHasStarted,
    roundIdx: initialRoundIdx,
    isRoundLocked: initialFinal || initialRoundElapsed >= ROULETTE_SPIN_MS,
    isFinalSummary: initialFinal,
    tensionStage: 'fast' as 'fast' | 'slow' | 'near',
  });

  // Jugadores ya bloqueados en rondas anteriores
  const lockedEarlierIds = useMemo(
    () => seekerOrder.slice(0, roundIdx),
    [seekerOrder, roundIdx]
  );

  // Buscadores mostrados en la fila inferior
  const revealedSeekerIds = useMemo(() => {
    if (isFinalSummary) return seekerOrder;
    return isRoundLocked
      ? seekerOrder.slice(0, roundIdx + 1)
      : seekerOrder.slice(0, roundIdx);
  }, [seekerOrder, roundIdx, isRoundLocked, isFinalSummary]);

  const candidatePool = useMemo(() => {
    const remaining = players.filter((p) => !lockedEarlierIds.includes(p.id));
    return remaining.length > 0 ? remaining : players;
  }, [players, lockedEarlierIds]);

  const winnerPlayer = useMemo(() => {
    const targetId = seekerOrder[roundIdx];
    return players.find((p) => p.id === targetId) || candidatePool[0] || players[0];
  }, [players, candidatePool, seekerOrder, roundIdx]);

  // Tira horizontal determinista de 68 tarjetas con el ganador garantizado en WIN_TILE_INDEX
  const reelTiles = useMemo(() => {
    if (candidatePool.length === 0) return [];
    const result: PlayerRecord[] = [];
    for (let i = 0; i < STRIP_LENGTH; i++) {
      if (i === WIN_TILE_INDEX && winnerPlayer) {
        result.push(winnerPlayer);
      } else {
        const offsetIdx = (i + roundIdx * 5) % candidatePool.length;
        let picked = candidatePool[offsetIdx];
        if (
          candidatePool.length > 1 &&
          (i === WIN_TILE_INDEX - 1 || i === WIN_TILE_INDEX + 1) &&
          picked.id === winnerPlayer?.id
        ) {
          picked = candidatePool[(offsetIdx + 1) % candidatePool.length];
        }
        result.push(picked);
      }
    }
    return result;
  }, [candidatePool, winnerPlayer, roundIdx]);

  // Música de la ruleta sincronizada exactamente con el inicio t=0
  useEffect(() => {
    if (!hasStarted) return;
    const music = startRouletteMusicLoop();
    setAudioBlocked(music.wasBlocked);
    return () => {
      music.stop();
    };
  }, [hasStarted]);

  // Bucle 60/120 FPS directo al DOM (sin lag ni tirones, usando reloj sincronizado con el anfitrión)
  useEffect(() => {
    let rafId = 0;
    const startX = 2 * STRIDE;
    const targetX = WIN_TILE_INDEX * STRIDE;

    const frame = () => {
      const now = Date.now() + clockOffsetRef.current;
      const startedNow = now >= startMs;
      if (startedNow !== stateRef.current.hasStarted) {
        stateRef.current.hasStarted = startedNow;
        setHasStarted(startedNow);
      }

      const elapsed = Math.max(0, Math.min(totalDurationMs, now - startMs));
      const finalNow = elapsed >= roundsEndMs;
      const rIdx = finalNow
        ? totalSeekers - 1
        : Math.min(totalSeekers - 1, Math.floor(elapsed / ROULETTE_ROUND_MS));
      const rElapsed = finalNow
        ? ROULETTE_ROUND_MS
        : elapsed - rIdx * ROULETTE_ROUND_MS;
      const lockedNow = finalNow || rElapsed >= ROULETTE_SPIN_MS;
      const u = Math.min(1, Math.max(0, rElapsed / ROULETTE_SPIN_MS));
      const stageNow: 'fast' | 'slow' | 'near' =
        u >= 0.72 ? 'near' : u >= 0.38 ? 'slow' : 'fast';

      if (rIdx !== stateRef.current.roundIdx) {
        stateRef.current.roundIdx = rIdx;
        lastTickTileRef.current = -1;
        setRoundIdx(rIdx);
      }
      if (lockedNow !== stateRef.current.isRoundLocked) {
        stateRef.current.isRoundLocked = lockedNow;
        setIsRoundLocked(lockedNow);
      }
      if (finalNow !== stateRef.current.isFinalSummary) {
        stateRef.current.isFinalSummary = finalNow;
        setIsFinalSummary(finalNow);
      }
      if (stageNow !== stateRef.current.tensionStage) {
        stateRef.current.tensionStage = stageNow;
        setTensionStage(stageNow);
      }

      if (progressBarRef.current && !finalNow) {
        progressBarRef.current.style.width = `${
          startedNow ? Math.round(u * 1000) / 10 : 0
        }%`;
      }

      if (trackRef.current && !finalNow) {
        // Desaceleración quíntica larga para máximo suspense sobre los últimos candidatos
        const eased = 1 - Math.pow(1 - u, 4.8);
        const currentX = !startedNow
          ? startX
          : lockedNow
          ? targetX
          : startX + (targetX - startX) * eased;

        trackRef.current.style.transform = `translate3d(calc(50% - ${
          currentX + TILE_WIDTH / 2
        }px), 0, 0)`;

        if (startedNow && !lockedNow) {
          const tileUnderNeedle = Math.round(currentX / STRIDE);
          if (tileUnderNeedle !== lastTickTileRef.current) {
            lastTickTileRef.current = tileUnderNeedle;
            playRouletteTick(tileUnderNeedle);
          }
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [startMs, totalDurationMs, roundsEndMs, totalSeekers]);

  // Sonido de bloqueo cuando la ruleta cae en el buscador
  useEffect(() => {
    if (!isRoundLocked) return;
    if (!lockedRoundsRef.current.has(roundIdx)) {
      lockedRoundsRef.current.add(roundIdx);
      playRouletteLock(roundIdx === totalSeekers - 1);
    }
  }, [isRoundLocked, roundIdx, totalSeekers]);

  const handleEnableAudio = () => {
    unlockRetroAudio();
    setAudioBlocked(false);
  };

  const amISeeker = seekerOrder.includes(currentPlayerId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ruleta aleatoria de buscadores"
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black dr-scanlines px-4 py-6 text-white select-none"
    >
      {/* Brillo de tensión progresivo en el fondo */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          isRoundLocked || tensionStage === 'near'
            ? 'opacity-100'
            : tensionStage === 'slow'
            ? 'opacity-55'
            : 'opacity-25'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(255, 30, 110, 0.18), transparent 68%)',
        }}
      />

      {/* Cabecera */}
      <header className="relative z-10 w-full max-w-xl text-center space-y-1.5 pt-2">
        <div className="inline-flex items-center gap-2 border border-[#FF1E6E] bg-[#FF1E6E]/15 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-[#FF1E6E]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {isFinalSummary
              ? 'Selección completada'
              : `Ruleta aleatoria · Buscador ${roundIdx + 1} de ${totalSeekers}`}
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight text-white">
          {isFinalSummary
            ? amISeeker
              ? '¡Te toca pillar!'
              : '¡Prepárate para correr!'
            : '¿Quién sale a pillar?'}
        </h1>
      </header>

      {/* Carril horizontal GPU a 60 FPS */}
      <main className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 my-2">
        {!isFinalSummary ? (
          <div className="w-full space-y-4">
            <div
              className={`relative w-full overflow-hidden border-y-2 bg-zinc-950 py-6 transition-shadow duration-300 ${
                isRoundLocked
                  ? 'border-[#FF1E6E] shadow-[0_0_60px_rgba(255,30,110,0.45)]'
                  : tensionStage === 'near'
                  ? 'border-[#FF1E6E] shadow-[0_0_45px_rgba(255,30,110,0.28)]'
                  : 'border-zinc-700 shadow-[0_0_30px_rgba(255,30,110,0.14)]'
              }`}
            >
              {/* Aguja superior e inferior */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 border-l-[10px] border-r-[10px] border-t-[13px] border-l-transparent border-r-transparent border-t-[#FF1E6E]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 bottom-0 z-30 -translate-x-1/2 border-l-[10px] border-r-[10px] border-b-[13px] border-l-transparent border-r-transparent border-b-[#FF1E6E]"
              />
              {/* Línea central láser */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-[2px] -translate-x-1/2 bg-[#FF1E6E]/85"
              />
              {/* Viñeta lateral */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 sm:w-28 bg-gradient-to-r from-black to-transparent"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 sm:w-28 bg-gradient-to-l from-black to-transparent"
              />

              {/* Pista deslizante por hardware (translate3d) */}
              <div
                ref={trackRef}
                className="flex items-center will-change-transform"
                style={{ gap: `${TILE_GAP}px` }}
              >
                {reelTiles.map((p, idx) => {
                  const isWinningTile = idx === WIN_TILE_INDEX && isRoundLocked;
                  return (
                    <div
                      key={`${roundIdx}-${idx}-${p.id}`}
                      style={{ width: `${TILE_WIDTH}px`, minWidth: `${TILE_WIDTH}px` }}
                      className={`flex flex-col items-center justify-center gap-2 border-2 px-2 py-3.5 transition-all duration-150 ${
                        isWinningTile
                          ? 'border-[#FF1E6E] bg-[#FF1E6E]/25 shadow-[0_0_28px_rgba(255,30,110,0.75)] scale-[1.05]'
                          : 'border-zinc-800 bg-black/90'
                      }`}
                    >
                      <PlayerAvatar
                        emoji={p.emoji}
                        color={p.color}
                        size="md"
                        name={p.name}
                        avatarEffectId={playerCosmetics[p.id]?.avatarEffectId}
                        platinumAvatar={playerCosmetics[p.id]?.platinumAvatar}
                      />
                      <PlayerCosmeticName
                        name={p.name}
                        cosmetics={playerCosmetics[p.id]}
                        compactTitle
                        className="w-full truncate text-center font-display text-xs font-bold text-white"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Barra inferior de progreso de giro */}
              <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-900">
                <div
                  ref={progressBarRef}
                  className="h-full bg-[#FF1E6E]"
                  style={{ width: '0%' }}
                />
              </div>
            </div>

            {/* Resultado del giro actual */}
            <div className="min-h-[44px] flex items-center justify-center">
              {isRoundLocked && winnerPlayer ? (
                <div className="inline-flex items-center gap-2 border-2 border-[#FF1E6E] bg-[#FF1E6E] px-4 py-1.5 font-display text-xs sm:text-sm font-bold uppercase text-white shadow-[0_0_24px_rgba(255,30,110,0.45)]">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {winnerPlayer.name}
                    {winnerPlayer.id === currentPlayerId ? ' (Tú)' : ''} sale a pillar
                  </span>
                </div>
              ) : (
                <p
                  className={`font-mono text-xs font-bold uppercase tracking-widest ${
                    tensionStage === 'near'
                      ? 'text-[#FF1E6E] animate-pulse'
                      : 'text-zinc-400'
                  }`}
                >
                  {!hasStarted
                    ? 'SINCRONIZANDO PANTALLAS...'
                    : tensionStage === 'near'
                    ? '¿QUIÉN SERÁ...?'
                    : tensionStage === 'slow'
                    ? 'FRENANDO RULETA...'
                    : 'GIRANDO RULETA...'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`w-full max-w-md border-2 p-6 text-center space-y-3 ${
              amISeeker
                ? 'border-[#FF1E6E] bg-[#FF1E6E]/15'
                : 'border-emerald-400 bg-emerald-500/15'
            }`}
          >
            <div
              className={`mx-auto flex h-14 w-14 items-center justify-center border-2 border-white ${
                amISeeker ? 'bg-[#FF1E6E]' : 'bg-emerald-600'
              }`}
            >
              {amISeeker ? (
                <Eye className="h-7 w-7 text-white" aria-hidden="true" />
              ) : (
                <Shield className="h-7 w-7 text-white" aria-hidden="true" />
              )}
            </div>
            <p className="font-display text-xl sm:text-2xl font-bold uppercase text-white">
              {amISeeker ? 'Eres Buscador' : 'Eres Fugitivo'}
            </p>
            <p className="text-xs sm:text-sm text-zinc-300">
              {amISeeker
                ? 'Espera la cuenta atrás en negro mientras se esconden.'
                : '¡Empieza el tiempo para esconderte! Corre a buscar sitio.'}
            </p>
          </div>
        )}

        {/* Buscadores elegidos */}
        <div className="w-full max-w-lg space-y-2">
          <p className="text-center font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Elegidos para pillar ({revealedSeekerIds.length}/{totalSeekers})
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {Array.from({ length: totalSeekers }).map((_, idx) => {
              const sid = revealedSeekerIds[idx];
              const p = sid ? players.find((x) => x.id === sid) : undefined;
              if (!p) {
                return (
                  <div
                    key={`slot-${idx}`}
                    className="flex min-h-[44px] items-center gap-2 border border-dashed border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-500"
                  >
                    <span>? ? ?</span>
                  </div>
                );
              }
              return (
                <div
                  key={p.id}
                  className="flex min-h-[44px] items-center gap-2 border-2 border-[#FF1E6E] bg-zinc-950 px-3 py-1.5"
                >
                  <PlayerAvatar
                    emoji={p.emoji}
                    color={p.color}
                    size="sm"
                    name={p.name}
                    avatarEffectId={playerCosmetics[p.id]?.avatarEffectId}
                    platinumAvatar={playerCosmetics[p.id]?.platinumAvatar}
                  />
                  <PlayerCosmeticName
                    name={p.name}
                    cosmetics={playerCosmetics[p.id]}
                    compactTitle
                    className="font-display text-xs font-bold text-white"
                    suffix={
                      p.id === currentPlayerId ? (
                        <span className="text-[11px] font-semibold text-[#FF85B3]">
                          (Tú)
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Pie */}
      <footer className="relative z-10 w-full max-w-md space-y-2 pb-safe text-center">
        {audioBlocked && (
          <button
            type="button"
            onClick={handleEnableAudio}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 border-2 border-[#FF1E6E] bg-[#FF1E6E]/20 px-4 py-2 font-display text-xs font-bold uppercase text-[#FF1E6E] hover:bg-[#FF1E6E]/30"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Activar sonido</span>
          </button>
        )}
        <p className="font-mono text-[11px] text-zinc-500">
          Sincronizado en todas las pantallas
        </p>
      </footer>
    </div>
  );
};
