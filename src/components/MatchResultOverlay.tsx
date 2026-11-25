import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Eye,
  Flag,
  MapPin,
  Radio,
  Route,
  Shield,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import { playMatchResultTheme, unlockRetroAudio } from '../lib/retroAudio';
import {
  CaughtRecord,
  ExtractionBeacon,
  InfectedRecord,
  MatchWinReason,
  MatchWinner,
  PlayerRecapRoute,
  PlayerRecord,
  PlayerRole,
  StormZonePhase,
} from '../types/game';
import { MatchRecapMap } from './MatchRecapMap';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchResultOverlayProps {
  winner: MatchWinner;
  winReason: MatchWinReason;
  myRole: PlayerRole;
  isHost: boolean;
  players: PlayerRecord[];
  roles: Record<string, PlayerRole>;
  caughtMap: Record<string, CaughtRecord>;
  infectedMap?: Record<string, InfectedRecord>;
  infectionModeEnabled?: boolean;
  extractionBeacon?: ExtractionBeacon | null;
  recapRoutes?: Record<string, PlayerRecapRoute>;
  activeZones?: StormZonePhase[];
  matchDurationSec?: number;
  onEndMatch: () => Promise<void>;
  onDismiss: () => void;
}

const CINEMATIC_DURATION_MS = 8200;

const RESULT_PIXEL_FONT: Record<string, string[]> = {
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
};

// Trofeo dorado pixel-art 16x16 para VICTORIA
const TROPHY_SPRITE_16: string[] = [
  '....OOOOOOOO....',
  '...OYYYYYYYYO...',
  '.OOOYWWWWYYYO...',
  'OYYOYWWYYYYYYOYO',
  'OYOYOYYYYYYYYOYO',
  'OO.OYYYYYYYYO.OO',
  '...OYYGGGYYYO...',
  '....OYYYYYYO....',
  '.....OYYYYO.....',
  '......OYYO......',
  '......OYYO......',
  '.....OYYYYO.....',
  '....OYYYYYYO....',
  '...OOBBBBBBOO...',
  '...OBBBBBBBBO...',
  '...OOOOOOOOOO...',
];

// Escudo partido pixel-art 16x16 para DERROTA (distinto de la calavera de eliminación)
const DEFEAT_SHIELD_SPRITE_16: string[] = [
  '..OOOOOOOOOOOO..',
  '.OSSSSSSSSSSSSO.',
  '.OSDDDDDDDDDDSO.',
  '.OSDD..WW..DDSO.',
  '.OSD...WW...DSO.',
  '.OSD..WW....DSO.',
  '.OSDDWWDDDDDDSO.',
  '.OSDDWWDDDDDDSO.',
  '..OSDDWWDDDDDSO.',
  '..OSDDDWWDDDSO..',
  '...OSDDDWDDDSO..',
  '...OSDDDDWDSO...',
  '....OSDDDDDSO...',
  '.....OSDDDSO....',
  '......OSDSO.....',
  '.......OOO......',
];

function buildWordRects(word: string): {
  width: number;
  height: number;
  rects: Array<{ x: number; y: number; key: string }>;
} {
  const rects: Array<{ x: number; y: number; key: string }> = [];
  let cursorX = 0;
  for (let i = 0; i < word.length; i++) {
    const glyph = RESULT_PIXEL_FONT[word[i]];
    if (!glyph) {
      cursorX += 4;
      continue;
    }
    for (let r = 0; r < glyph.length; r++) {
      for (let c = 0; c < glyph[r].length; c++) {
        if (glyph[r][c] === '1') {
          rects.push({ x: cursorX + c, y: r, key: `${i}-${r}-${c}` });
        }
      }
    }
    cursorX += 6;
  }
  return { width: Math.max(1, cursorX - 1), height: 7, rects };
}

interface AnimParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

export const MatchResultOverlay: React.FC<MatchResultOverlayProps> = ({
  winner,
  winReason,
  myRole,
  isHost,
  players,
  roles,
  caughtMap,
  infectedMap = {},
  infectionModeEnabled = false,
  extractionBeacon,
  recapRoutes = {},
  activeZones = [],
  matchDurationSec = 60,
  onEndMatch,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<'cinematic' | 'summary'>('cinematic');
  const [summaryTab, setSummaryTab] = useState<'scoreboard' | 'recap'>('scoreboard');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const didIWin =
    (winner === 'hiders' && myRole === 'hider') ||
    (winner === 'seekers' && myRole === 'seeker');

  const bannerWord = useMemo(
    () => buildWordRects(didIWin ? 'VICTORIA' : 'DERROTA'),
    [didIWin]
  );

  // Reproducir música de Victoria o Derrota al aparecer la cinemática
  useEffect(() => {
    const playback = playMatchResultTheme(didIWin);
    setAudioBlocked(playback.wasBlocked);

    const timer = window.setTimeout(() => {
      setPhase('summary');
    }, CINEMATIC_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
      playback.stop();
    };
  }, [didIWin]);

  // Animación pixel-art estilo Danganronpa (Juicio Escolar: Bala de la Verdad en Victoria / Veredicto monocromo + tajo magenta en Derrota)
  useEffect(() => {
    if (phase !== 'cinematic') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const particles: AnimParticle[] = [];
    const shatterShards: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }> = [];

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (didIWin) {
      const confettiPalette = ['#00F5D4', '#FACC15', '#FFFFFF', '#10B981', '#FDE047'];
      for (let i = 0; i < 48; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 44,
          vy: 30 + Math.random() * 58,
          size: i % 3 === 0 ? 3 : 2,
          color: confettiPalette[i % confettiPalette.length],
        });
      }
      // Fragmentos de cristal al impactar la Bala de la Verdad
      for (let i = 0; i < 28; i++) {
        const ang = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.2;
        const spd = 45 + Math.random() * 95;
        shatterShards.push({
          x: W / 2,
          y: H / 2,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: i % 2 === 0 ? 4 : 3,
          color: i % 3 === 0 ? '#FF1E6E' : i % 2 === 0 ? '#00F5D4' : '#FFFFFF',
        });
      }
    } else {
      const sparkPalette = ['#FF1E6E', '#FFFFFF', '#A1A1AA', '#52525B'];
      for (let i = 0; i < 38; i++) {
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 26,
          vy: -(24 + Math.random() * 48), // chispas y cenizas ascendentes
          size: i % 4 === 0 ? 3 : 2,
          color: sparkPalette[i % sparkPalette.length],
        });
      }
    }

    const startMs = performance.now();
    let lastMs = startMs;
    let rafId = 0;

    const drawRect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastMs) / 1000));
      lastMs = now;
      const elapsed = prefersReducedMotion ? 1.8 : (now - startMs) / 1000;

      // Fondo base de juicio
      drawRect(0, 0, W, H, '#000000');

      // Líneas cinéticas de velocidad (Class Trial)
      const speedColor = didIWin ? '#061A18' : '#160710';
      for (let y = 0; y < H; y += 6) {
        const stripeShift = Math.floor((y + elapsed * 36) % 12);
        if (stripeShift < 5) {
          drawRect(0, y, W, 2, speedColor);
        }
      }

      // En Derrota: fondo dividido icónico blanco/negro estilo Monokuma tras el emblema
      if (!didIWin) {
        drawRect(0, 0, W / 2, H, '#09090B');
        drawRect(W / 2, 0, W / 2, H, '#18181B');
        // Línea central divisoria sutil
        drawRect(W / 2 - 1, 0, 2, H, 'rgba(255, 255, 255, 0.08)');
      }

      // Barras superior e inferior tipo cinta policial de juicio (blanco/negro + color clave)
      const bandAccent = didIWin ? '#00F5D4' : '#FF1E6E';
      drawRect(0, 0, W, 5, '#18181B');
      drawRect(0, H - 5, W, 5, '#18181B');
      for (let x = -16; x < W + 16; x += 16) {
        const shift = Math.round((elapsed * 28) % 16);
        drawRect(x + shift, 0, 8, 5, bandAccent);
        drawRect(x - shift, H - 5, 8, 5, bandAccent);
      }

      const impactT = 0.65;

      if (didIWin) {
        // Haz de foco radial giratorio + tambor revólver de Balas de la Verdad
        const rayRot = elapsed * 1.15;
        ctx.fillStyle = 'rgba(0, 245, 212, 0.16)';
        for (let r = 0; r < 8; r++) {
          const ang = rayRot + (r * Math.PI) / 4;
          for (let step = 18; step < 76; step += 4) {
            const rx = W / 2 + Math.cos(ang) * step;
            const ry = H / 2 + Math.sin(ang) * step;
            ctx.fillRect(Math.round(rx) - 1, Math.round(ry) - 1, 3, 3);
          }
        }

        // Tambor de 6 cámaras en la esquina/centro girando antes del disparo (0 - 0.7s)
        if (elapsed < impactT + 0.15) {
          const cylSpin = elapsed * 10;
          const cx = W / 2;
          const cy = H / 2;
          drawRect(cx - 26, cy - 26, 52, 52, '#18181B');
          drawRect(cx - 26, cy - 26, 52, 2, '#00F5D4');
          drawRect(cx - 26, cy + 24, 52, 2, '#00F5D4');
          for (let ch = 0; ch < 6; ch++) {
            const a = cylSpin + (ch * Math.PI) / 3;
            const hx = cx + Math.cos(a) * 14;
            const hy = cy + Math.sin(a) * 14;
            drawRect(hx - 4, hy - 4, 8, 8, ch === 0 ? '#FACC15' : '#00F5D4');
            drawRect(hx - 2, hy - 2, 4, 4, '#09090B');
          }
        }

        // Mirilla / rombo geométrico pulsante tras el trofeo tras el impacto
        if (elapsed >= impactT) {
          const haloPulse = Math.round(Math.sin(elapsed * 6.5) * 3);
          const boxR = 42 + haloPulse;
          drawRect(W / 2 - boxR, H / 2 - boxR, boxR * 2, boxR * 2, 'rgba(0, 245, 212, 0.08)');
          drawRect(W / 2 - boxR, H / 2 - boxR, boxR * 2, 2, 'rgba(0, 245, 212, 0.55)');
          drawRect(W / 2 - boxR, H / 2 + boxR - 2, boxR * 2, 2, 'rgba(0, 245, 212, 0.55)');
          drawRect(W / 2 - boxR, H / 2 - boxR, 2, boxR * 2, 'rgba(250, 204, 21, 0.35)');
          drawRect(W / 2 + boxR - 2, H / 2 - boxR, 2, boxR * 2, 'rgba(250, 204, 21, 0.35)');
        }
      } else {
        // Foco frío de juicio + retícula de veredicto en Derrota
        const spotPulse = Math.round(Math.sin(elapsed * 4.2) * 3);
        const spotW = 82 + spotPulse;
        drawRect(W / 2 - spotW / 2, 10, spotW, H - 20, 'rgba(255, 255, 255, 0.05)');
        drawRect(W / 2 - 44, H / 2 - 44, 88, 88, 'rgba(255, 30, 110, 0.09)');
        // Círculo monocromo mitad negro / mitad blanco detrás del escudo
        const crestR = 44;
        for (let dy = -crestR; dy <= crestR; dy += 3) {
          const halfSpan = Math.floor(Math.sqrt(Math.max(0, crestR * crestR - dy * dy)));
          drawRect(W / 2 - halfSpan, H / 2 + dy, halfSpan, 3, 'rgba(24, 24, 27, 0.85)');
          drawRect(W / 2, H / 2 + dy, halfSpan, 3, 'rgba(255, 255, 255, 0.14)');
        }
      }

      // Dibujar sprite 16x16 (en Victoria aparece con fuerza tras el disparo de Bala de la Verdad)
      const sprite = didIWin ? TROPHY_SPRITE_16 : DEFEAT_SHIELD_SPRITE_16;
      const scale = 5; // 80x80
      const spriteSize = 16 * scale;
      const impactShake =
        !prefersReducedMotion && elapsed >= impactT && elapsed < impactT + 0.28
          ? Math.round(Math.sin(elapsed * 82) * 4)
          : 0;
      const bounceY = didIWin
        ? Math.round(Math.sin(elapsed * 6.4) * 4)
        : Math.min(4, Math.floor(elapsed * 2.4));
      const splitOffset =
        !didIWin && elapsed > impactT
          ? Math.min(5, Math.floor((elapsed - impactT) * 10))
          : 0;

      const showMainSprite = !didIWin || elapsed >= impactT - 0.06;

      if (showMainSprite) {
        const baseX = Math.floor(W / 2 - spriteSize / 2) + impactShake;
        const baseY = Math.floor(H / 2 - spriteSize / 2) + bounceY;

        // Sombra suelo nítida
        drawRect(W / 2 - 32, 134, 64, 4, didIWin ? '#064E3B' : '#27272A');

        const shineCol = Math.floor((elapsed * 18) % 24) - 4;

        for (let row = 0; row < 16; row++) {
          const line = sprite[row];
          for (let col = 0; col < 16; col++) {
            const ch = line[col];
            if (ch === '.') continue;
            let color = '#FFFFFF';
            if (didIWin) {
              color =
                ch === 'O'
                  ? '#09090B'
                  : ch === 'Y'
                  ? col === shineCol || col === shineCol + 1
                    ? '#FEF08A'
                    : '#FACC15'
                  : ch === 'W'
                  ? '#FFFFFF'
                  : ch === 'G'
                  ? '#00F5D4'
                  : '#10B981';
            } else {
              color =
                ch === 'O'
                  ? '#FFFFFF'
                  : ch === 'S'
                  ? col < 8
                    ? '#E4E4E7'
                    : '#52525B'
                  : ch === 'D'
                  ? col < 8
                    ? '#27272A'
                    : '#09090B'
                  : '#FF1E6E'; // grieta magenta Danganronpa
            }
            const crackShiftX = !didIWin ? (col < 8 ? -splitOffset : splitOffset) : 0;
            const crackShiftY = !didIWin && elapsed > impactT ? (col < 8 ? -1 : 1) : 0;
            drawRect(
              baseX + col * scale + crackShiftX,
              baseY + row * scale + crackShiftY,
              scale,
              scale,
              color
            );
          }
        }
      }

      // Bala de la Verdad cruzando de lado a lado (Victoria) / Tajo diagonal magenta (Derrota)
      if (!prefersReducedMotion && elapsed >= 0.42 && elapsed <= 0.92) {
        const slashProg = (elapsed - 0.42) / 0.5;
        const lineX = Math.round(slashProg * (W + 40));
        if (didIWin) {
          // Estela + proyectil Bala de Verdad
          drawRect(Math.max(0, lineX - 52), H / 2 - 3, 44, 6, '#00F5D4');
          drawRect(Math.max(0, lineX - 18), H / 2 - 5, 16, 10, '#FACC15');
          drawRect(Math.max(0, lineX - 8), H / 2 - 3, 12, 6, '#FFFFFF');
        } else {
          for (let s = 0; s < 40; s++) {
            const px = Math.round(slashProg * (W + 44)) - s * 4;
            const py = Math.round(H - (px / W) * H);
            if (px >= 0 && px < W && py >= 0 && py < H) {
              drawRect(px, py - 2, 5, 4, s < 7 ? '#FFFFFF' : '#FF1E6E');
            }
          }
        }
      }

      // Fragmentos de cristal estallando tras impacto en Victoria
      if (!prefersReducedMotion && didIWin && elapsed >= impactT && elapsed < impactT + 1.1) {
        for (const sh of shatterShards) {
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          drawRect(sh.x, sh.y, sh.size, sh.size, sh.color);
        }
      }

      // Destello breve en el instante del veredicto
      if (!prefersReducedMotion && elapsed >= impactT && elapsed < impactT + 0.07) {
        drawRect(
          0,
          0,
          W,
          H,
          didIWin ? 'rgba(0, 245, 212, 0.34)' : 'rgba(255, 30, 110, 0.34)'
        );
      }

      // Partículas continuas de confeti o ceniza del juicio
      if (!prefersReducedMotion) {
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (didIWin && p.y > H - 6) {
            p.y = 6;
            p.x = Math.random() * W;
          } else if (!didIWin && p.y < 6) {
            p.y = H - 6;
            p.x = Math.random() * W;
          }
          if (p.x < 0) p.x += W;
          if (p.x > W) p.x -= W;
          drawRect(p.x, p.y, p.size, p.size, p.color);
        }
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [phase, didIWin]);

  const activatorName = extractionBeacon?.activatedByPlayerId
    ? players.find((p) => p.id === extractionBeacon.activatedByPlayerId)?.name
    : undefined;

  const reasonText =
    winReason === 'all_caught'
      ? infectionModeEnabled
        ? 'Todos los fugitivos han sido infectados o eliminados.'
        : 'Todos los fugitivos han sido eliminados.'
      : winReason === 'beacon_extracted'
      ? activatorName
        ? `${activatorName} activó la Baliza de Extracción.`
        : 'Los fugitivos activaron la Baliza de Extracción.'
      : 'Los fugitivos sobrevivieron hasta agotarse el tiempo de ronda.';

  const hiders = players.filter((p) => (roles[p.id] ?? 'hider') === 'hider');
  const seekers = players.filter((p) => (roles[p.id] ?? 'hider') === 'seeker');

  const handleBackToLobby = async () => {
    setBusy(true);
    try {
      await onEndMatch();
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'cinematic') {
    const winningTeamLabel =
      winner === 'hiders' ? '¡GANAN LOS FUGITIVOS!' : '¡GANAN LOS BUSCADORES!';
    const tapeLabel = didIWin
      ? '· CLASE BALIZA · ¡CONTRAATAQUE! · BALA DE LA VERDAD · VICTORIA ·'
      : '· VEREDICTO DEL JUICIO · CASO CERRADO · DERROTA ·';

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={didIWin ? 'Victoria' : 'Derrota'}
        className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black text-white select-none"
      >
        {/* Capas de textura CRT + semitono estilo Danganronpa */}
        <div
          className="pointer-events-none fixed inset-0 dr-scanlines opacity-55"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none fixed inset-0 dr-halftone opacity-35"
          aria-hidden="true"
        />

        {/* Cinta superior continua estilo juicio escolar */}
        <div
          className={`relative z-10 w-full overflow-hidden border-y-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] ${
            didIWin
              ? 'border-[#00F5D4] bg-[#00F5D4]/15 text-[#00F5D4]'
              : 'border-[#FF1E6E] bg-[#FF1E6E]/15 text-[#FF1E6E]'
          }`}
        >
          <div className="dr-tape-track">
            <span className="px-4">{tapeLabel}</span>
            <span className="px-4">{tapeLabel}</span>
            <span className="px-4">{tapeLabel}</span>
            <span className="px-4">{tapeLabel}</span>
          </div>
        </div>

        {/* Cabecera pixel-art VICTORIA / DERROTA estilo Danganronpa */}
        <header className="relative z-10 flex w-full max-w-xl flex-col items-center gap-2.5 px-4 pt-3 dr-slam-in">
          <div
            className={`-skew-x-12 border-2 px-4 py-1 font-mono text-[11px] font-extrabold uppercase tracking-[0.24em] ${
              didIWin
                ? 'border-[#00F5D4] bg-[#00F5D4] text-black shadow-[4px_4px_0_0_#FACC15]'
                : 'border-[#FF1E6E] bg-[#FF1E6E] text-white shadow-[4px_4px_0_0_#FFFFFF]'
            }`}
          >
            <span className="inline-block skew-x-12">
              {didIWin ? '¡CONTRAATAQUE · BALA DE LA VERDAD!' : 'VEREDICTO DEL JUICIO'}
            </span>
          </div>

          <div className="w-full px-2 flex justify-center">
            <svg
              viewBox={`-1 -1 ${bannerWord.width + 3} ${bannerWord.height + 3}`}
              shapeRendering="crispEdges"
              className="h-auto w-full max-w-[350px] sm:max-w-[440px]"
              role="img"
              aria-label={didIWin ? 'VICTORIA' : 'DERROTA'}
            >
              {bannerWord.rects.map((r) => (
                <rect
                  key={`s-${r.key}`}
                  x={r.x + 1}
                  y={r.y + 1}
                  width={1}
                  height={1}
                  fill={didIWin ? '#00F5D4' : '#FF1E6E'}
                />
              ))}
              {bannerWord.rects.map((r) => (
                <rect
                  key={r.key}
                  x={r.x}
                  y={r.y}
                  width={1}
                  height={1}
                  fill="#FFFFFF"
                />
              ))}
            </svg>
          </div>

          <div className="text-center space-y-1">
            <p
              className={`font-display text-sm sm:text-base font-bold uppercase tracking-wider ${
                didIWin ? 'text-[#FACC15]' : 'text-[#FF1E6E]'
              }`}
            >
              {winningTeamLabel}
            </p>
            <p className="font-mono text-xs text-zinc-300">{reasonText}</p>
          </div>
        </header>

        {/* Escenario central animado con marco nítido de juicio */}
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center w-full max-w-md px-4 my-2">
          <div
            className={`relative flex items-center justify-center border-2 bg-black p-1 ${
              didIWin
                ? 'border-[#00F5D4] shadow-[8px_8px_0_0_#00F5D4]'
                : 'border-[#FF1E6E] shadow-[8px_8px_0_0_#FF1E6E]'
            }`}
          >
            <canvas
              ref={canvasRef}
              width={160}
              height={160}
              className="h-[235px] w-[235px] sm:h-[290px] sm:w-[290px] block pixelated"
            />
          </div>
        </main>

        {/* Controles y cinta inferior */}
        <footer className="relative z-10 flex w-full flex-col items-center gap-2.5 pb-safe">
          <div className="flex w-full max-w-md flex-col gap-2 px-4">
            {audioBlocked && (
              <button
                type="button"
                onClick={() => {
                  unlockRetroAudio();
                  setAudioBlocked(false);
                }}
                className={`flex min-h-[44px] w-full items-center justify-center gap-2 border-2 px-4 py-2 font-display text-xs font-bold uppercase text-white ${
                  didIWin
                    ? 'border-[#00F5D4] bg-[#00F5D4]/15 hover:bg-[#00F5D4]/25'
                    : 'border-[#FF1E6E] bg-[#FF1E6E]/15 hover:bg-[#FF1E6E]/25'
                }`}
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                <span>Activar música</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setPhase('summary')}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 border-2 border-white bg-white px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-black hover:bg-zinc-200"
            >
              <span>Ver marcador</span>
            </button>
          </div>

          <div
            className={`w-full overflow-hidden border-t-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] ${
              didIWin
                ? 'border-[#FACC15] bg-black text-[#FACC15]'
                : 'border-white/30 bg-black text-zinc-400'
            }`}
          >
            <div className="dr-tape-track">
              <span className="px-4">{tapeLabel}</span>
              <span className="px-4">{tapeLabel}</span>
              <span className="px-4">{tapeLabel}</span>
              <span className="px-4">{tapeLabel}</span>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resultado de la partida"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        className={`my-auto w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl transition-all ${
          summaryTab === 'recap' ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        {/* Cabecera limpia */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                winner === 'hiders'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p
                className={`text-xs font-semibold ${
                  didIWin ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {didIWin ? 'Victoria' : 'Derrota'}
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                {winner === 'hiders'
                  ? '¡Ganan los Fugitivos!'
                  : '¡Ganan los Buscadores!'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {/* Selector Marcador / Recorridos */}
          <div
            role="tablist"
            aria-label="Vistas del resultado"
            className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={summaryTab === 'scoreboard'}
              onClick={() => setSummaryTab('scoreboard')}
              className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                summaryTab === 'scoreboard'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Marcador</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={summaryTab === 'recap'}
              onClick={() => setSummaryTab('recap')}
              className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                summaryTab === 'recap'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Route className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Recorridos</span>
            </button>
          </div>

          {summaryTab === 'recap' ? (
            <MatchRecapMap
              players={players}
              roles={roles}
              caughtMap={caughtMap}
              infectedMap={infectedMap}
              recapRoutes={recapRoutes}
              activeZones={activeZones}
              extractionBeacon={extractionBeacon}
              matchDurationSec={matchDurationSec}
            />
          ) : (
            <>
              {/* Motivo de victoria */}
              <div
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                  winner === 'hiders'
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'bg-rose-50 text-rose-900'
                }`}
              >
                {winReason === 'beacon_extracted' ? (
                  <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : winReason === 'time_expired' ? (
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{reasonText}</span>
              </div>

              {/* Resumen por equipos */}
              <div className="space-y-4 max-h-[38vh] overflow-y-auto pr-1">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Fugitivos ({hiders.length})</span>
                  </p>
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {hiders.map((p) => {
                      const caught = caughtMap[p.id];
                      const isActivator = extractionBeacon?.activatedByPlayerId === p.id;
                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <PlayerAvatar
                              emoji={p.emoji}
                              color={p.color}
                              size="sm"
                              name={p.name}
                              eliminated={Boolean(caught)}
                            />
                            <span
                              className={`truncate text-sm font-semibold ${
                                caught ? 'line-through text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {p.name}
                            </span>
                          </div>
                          <span
                            className={`text-xs font-medium shrink-0 ${
                              isActivator
                                ? 'text-amber-700'
                                : caught
                                ? 'text-slate-500'
                                : 'text-emerald-700'
                            }`}
                          >
                            {isActivator
                              ? 'Activó Baliza'
                              : caught
                              ? caught.byPlayerId === 'storm'
                                ? 'Tormenta'
                                : caught.byPlayerId === 'anticheat'
                                ? 'GPS apagado'
                                : caught.byPlayerId === 'photo'
                                ? 'Sin foto'
                                : 'Pillado'
                              : 'A salvo'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Buscadores ({seekers.length})</span>
                  </p>
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {seekers.map((p) => {
                      const catchesCount =
                        Object.values(caughtMap).filter(
                          (c) => c.byPlayerId === p.id
                        ).length +
                        Object.values(infectedMap).filter(
                          (c) => c.byPlayerId === p.id
                        ).length;
                      const wasInfected = Boolean(infectedMap[p.id]);
                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <PlayerAvatar
                              emoji={p.emoji}
                              color={p.color}
                              size="sm"
                              name={p.name}
                            />
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {p.name}
                              </span>
                              {wasInfected && (
                                <span className="block text-[11px] font-medium text-rose-600">
                                  Infectado
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 shrink-0">
                            {catchesCount} {catchesCount === 1 ? 'captura' : 'capturas'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Acciones */}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span>Ver mapa</span>
            </button>

            {isHost && (
              <button
                type="button"
                onClick={handleBackToLobby}
                disabled={busy}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Flag className="h-4 w-4" aria-hidden="true" />
                <span>{busy ? 'Volviendo...' : 'Volver a la sala'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
