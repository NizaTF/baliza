import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Volume2, X } from 'lucide-react';
import {
  playElimination8BitTheme,
  unlockRetroAudio,
} from '../lib/retroAudio';

interface EliminationOverlayProps {
  playerName: string;
  playerEmoji: string;
  playerColor: string;
  causeLabel: string;
  onClose: () => void;
}

// Matriz pixel-art 5x7 para "ELIMINADO" en 8-bit auténtico
const PIXEL_FONT_5X7: Record<string, string[]> = {
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
};

interface PixelCell {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  gray: number;
}

interface PixelParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

function buildEmojiPixelSprite(emoji: string): {
  gridSize: number;
  pixels: PixelCell[];
} {
  const gridSize = 22;
  const offscreen = document.createElement('canvas');
  offscreen.width = gridSize;
  offscreen.height = gridSize;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { gridSize, pixels: [] };
  }

  ctx.clearRect(0, 0, gridSize, gridSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '17px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(emoji, gridSize / 2, gridSize / 2 + 1);

  const imgData = ctx.getImageData(0, 0, gridSize, gridSize).data;
  const pixels: PixelCell[] = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = (y * gridSize + x) * 4;
      const a = imgData[idx + 3];
      if (a < 85) continue;
      // Cuantización ligera 8-bit para colores más vivos y retro
      const r = Math.min(255, Math.round(imgData[idx] / 32) * 32);
      const g = Math.min(255, Math.round(imgData[idx + 1] / 32) * 32);
      const b = Math.min(255, Math.round(imgData[idx + 2] / 32) * 32);
      const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
      pixels.push({ x, y, r, g, b, gray });
    }
  }

  return { gridSize, pixels };
}

export const EliminationOverlay: React.FC<EliminationOverlayProps> = ({
  playerName,
  playerEmoji,
  playerColor,
  causeLabel,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [replayCount, setReplayCount] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [sequenceDone, setSequenceDone] = useState(false);

  const bannerGlyphRects = useMemo(() => {
    const word = 'ELIMINADO';
    const rects: Array<{ x: number; y: number; key: string }> = [];
    let offsetX = 0;
    for (let i = 0; i < word.length; i++) {
      const glyph = PIXEL_FONT_5X7[word[i]];
      if (!glyph) continue;
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] === '1') {
            rects.push({
              x: offsetX + col,
              y: row,
              key: `${i}-${row}-${col}`,
            });
          }
        }
      }
      offsetX += 6; // 5px ancho + 1px espacio
    }
    return {
      width: offsetX - 1,
      height: 7,
      rects,
    };
  }, []);

  // Reproducir sintonía 8-bit de derrota
  useEffect(() => {
    unlockRetroAudio();
    const handle = playElimination8BitTheme();
    setAudioBlocked(handle.wasBlocked);
    return () => {
      handle.stop();
    };
  }, [replayCount]);

  // Animación 8-bit en canvas estilo ejecución Danganronpa
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const sprite = buildEmojiPixelSprite(playerEmoji);
    const pxScale = 3; // 22 * 3 = 66px de alto/ancho por sprite
    const spriteW = sprite.gridSize * pxScale;
    const spriteBaseX = Math.floor((W - spriteW) / 2);
    const spriteBaseY = Math.floor((H - spriteW) / 2) + 8;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let particles: PixelParticle[] = [];
    let burstSpawned = false;
    let rafId = 0;
    const startMs = performance.now();
    let lastFrameMs = startMs;
    setSequenceDone(false);

    const spawnBurst = () => {
      if (burstSpawned) return;
      burstSpawned = true;
      const palette = ['#FF1E6E', '#FF1E6E', '#FFFFFF', '#00E5FF', playerColor];
      const nextParticles: PixelParticle[] = [];

      // Píxeles arrancados directamente del emoji + bloques magenta estilo Danganronpa
      const sampleStep = Math.max(1, Math.floor(sprite.pixels.length / 36));
      for (let i = 0; i < sprite.pixels.length; i += sampleStep) {
        const cell = sprite.pixels[i];
        const angle = Math.random() * Math.PI * 2;
        const speed = 45 + Math.random() * 115;
        nextParticles.push({
          x: spriteBaseX + cell.x * pxScale,
          y: spriteBaseY + cell.y * pxScale,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 45,
          size: Math.random() > 0.4 ? 3 : 4,
          color:
            Math.random() > 0.35
              ? '#FF1E6E'
              : `rgb(${cell.r}, ${cell.g}, ${cell.b})`,
          life: 0,
          maxLife: 1.2 + Math.random() * 0.9,
        });
      }

      for (let k = 0; k < 22; k++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 130;
        nextParticles.push({
          x: W / 2 + (Math.random() * 16 - 8),
          y: spriteBaseY + spriteW / 2 + (Math.random() * 16 - 8),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          size: Math.random() > 0.5 ? 3 : 2,
          color: palette[k % palette.length],
          life: 0,
          maxLife: 1.0 + Math.random() * 1.1,
        });
      }

      particles = nextParticles;
    };

    const drawPixelRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: string
    ) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    const renderFrame = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
      lastFrameMs = nowMs;
      const elapsedSec = prefersReducedMotion ? 3.5 : (nowMs - startMs) / 1000;

      if (elapsedSec >= 2.6) {
        setSequenceDone(true);
      }

      // 1. Fondo negro puro
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      // 2. Bandas diagonales/pixeladas Danganronpa arriba y abajo
      const stripeShift = Math.floor(elapsedSec * 28) % 12;
      for (let x = -12; x < W + 12; x += 12) {
        drawPixelRect(x + stripeShift, 4, 6, 4, '#FF1E6E');
        drawPixelRect(x - stripeShift, H - 8, 6, 4, '#FF1E6E');
      }

      // 3. Foco de escenario pixelado (spotlight)
      const spotProgress = Math.min(1, elapsedSec / 0.35);
      if (spotProgress > 0) {
        const topHalf = Math.floor(14 * spotProgress);
        const botHalf = Math.floor(42 * spotProgress);
        for (let row = 12; row < 134; row += 2) {
          const t = (row - 12) / (134 - 12);
          const halfW = Math.round(topHalf + (botHalf - topHalf) * t);
          ctx.fillStyle =
            elapsedSec >= 1.76 && elapsedSec < 1.9
              ? 'rgba(255, 30, 110, 0.28)'
              : 'rgba(255, 255, 255, 0.08)';
          ctx.fillRect(Math.floor(W / 2 - halfW), row, halfW * 2, 2);
        }
        // Suelo circular pixelado
        drawPixelRect(W / 2 - botHalf, 132, botHalf * 2, 4, '#27272A');
        drawPixelRect(
          W / 2 - botHalf + 6,
          136,
          (botHalf - 6) * 2,
          2,
          '#18181B'
        );
      }

      // 4. Posición y temblor del personaje pixelado
      const isStruck = elapsedSec >= 1.76;
      const panicShakeX =
        !isStruck && elapsedSec >= 0.45
          ? Math.round(Math.sin(elapsedSec * 52) * 2)
          : isStruck && elapsedSec < 2.05
          ? Math.round(Math.sin(elapsedSec * 90) * 3)
          : 0;
      const panicShakeY =
        isStruck && elapsedSec < 2.05
          ? Math.round(Math.cos(elapsedSec * 80) * 2)
          : 0;

      const drawX = spriteBaseX + panicShakeX;
      const drawY = spriteBaseY + panicShakeY;

      // Sombra pixelada en el suelo
      drawPixelRect(drawX + 12, spriteBaseY + spriteW - 2, spriteW - 24, 4, '#09090B');

      // Dibujar personaje pixelado (color antes del golpe, gris derrotado después)
      if (sprite.pixels.length > 0) {
        for (let i = 0; i < sprite.pixels.length; i++) {
          const cell = sprite.pixels[i];
          if (isStruck) {
            // Tono monocromo sombrío con ligero tinte magenta en bordes
            const v = Math.max(45, Math.min(200, cell.gray));
            ctx.fillStyle = `rgb(${Math.min(255, v + 12)}, ${Math.max(
              30,
              v - 10
            )}, ${v})`;
          } else {
            ctx.fillStyle = `rgb(${cell.r}, ${cell.g}, ${cell.b})`;
          }
          ctx.fillRect(
            drawX + cell.x * pxScale,
            drawY + cell.y * pxScale,
            pxScale,
            pxScale
          );
        }
      } else {
        // Respaldo geométrico 8-bit por si el navegador no renderizó fuente emoji en canvas
        drawPixelRect(drawX + 12, drawY + 12, 42, 42, isStruck ? '#52525B' : playerColor);
        drawPixelRect(drawX + 20, drawY + 24, 8, 8, '#FFFFFF');
        drawPixelRect(drawX + 38, drawY + 24, 8, 8, '#FFFFFF');
      }

      // 5. Burbuja de alerta pixelada "!" durante el pánico
      if (elapsedSec >= 0.5 && elapsedSec < 1.76) {
        const blink = Math.floor(elapsedSec * 10) % 2 === 0;
        if (blink) {
          const bx = W / 2 - 7;
          const by = drawY - 18;
          drawPixelRect(bx, by, 14, 14, '#FF1E6E');
          drawPixelRect(bx + 2, by + 2, 10, 10, '#000000');
          drawPixelRect(bx + 6, by + 3, 2, 5, '#FFFFFF');
          drawPixelRect(bx + 6, by + 10, 2, 2, '#FFFFFF');
        }
      }

      // 6. Cadena pixelada descendiendo desde arriba (estilo ejecución Danganronpa)
      if (elapsedSec >= 0.72 && elapsedSec < 2.25) {
        const dropProgress = Math.min(1, (elapsedSec - 0.72) / 1.0);
        const chainBottomY = Math.floor(
          10 + dropProgress * (spriteBaseY + 14 - 10)
        );
        const cx = Math.floor(W / 2);
        for (let cy = 8; cy < chainBottomY; cy += 6) {
          const linkFlip = Math.floor(cy / 6) % 2 === 0;
          drawPixelRect(
            cx - (linkFlip ? 3 : 2),
            cy,
            linkFlip ? 6 : 4,
            5,
            '#94A3B8'
          );
          drawPixelRect(cx - 1, cy + 1, 2, 3, '#000000');
        }
        // Garra / grillete pixelado en la punta
        drawPixelRect(cx - 8, chainBottomY - 2, 16, 4, '#E2E8F0');
        drawPixelRect(cx - 8, chainBottomY + 2, 4, 5, '#CBD5E1');
        drawPixelRect(cx + 4, chainBottomY + 2, 4, 5, '#CBD5E1');
      }

      // 7. Impacto: flash + sello gigante pixelado ✕ + explosión de píxeles
      if (isStruck) {
        spawnBurst();

        if (!prefersReducedMotion && elapsedSec >= 1.76 && elapsedSec < 1.86) {
          ctx.fillStyle =
            Math.floor(elapsedSec * 60) % 2 === 0
              ? 'rgba(255, 255, 255, 0.85)'
              : 'rgba(255, 30, 110, 0.7)';
          ctx.fillRect(0, 0, W, H);
        }

        // Sello X pixelado sobre el personaje
        const xThickness = 5;
        const xRadius = 26;
        const xCenter = W / 2;
        const yCenter = spriteBaseY + Math.floor(spriteW / 2);
        for (let d = -xRadius; d <= xRadius; d += 2) {
          // Sombra oscura del trazo
          drawPixelRect(
            xCenter + d - 2,
            yCenter + d - 2,
            xThickness + 2,
            xThickness + 2,
            '#000000'
          );
          drawPixelRect(
            xCenter + d - 2,
            yCenter - d - 2,
            xThickness + 2,
            xThickness + 2,
            '#000000'
          );
        }
        for (let d = -xRadius; d <= xRadius; d += 2) {
          drawPixelRect(
            xCenter + d - 2,
            yCenter + d - 2,
            xThickness,
            xThickness,
            '#FF1E6E'
          );
          drawPixelRect(
            xCenter + d - 2,
            yCenter - d - 2,
            xThickness,
            xThickness,
            '#FF1E6E'
          );
        }
      }

      // 8. Actualizar y dibujar partículas pixeladas
      if (particles.length > 0) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.life += dt;
          if (pt.life >= pt.maxLife) {
            particles.splice(i, 1);
            continue;
          }
          pt.vy += 260 * dt; // gravedad retro
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          if (pt.y > 132) {
            pt.y = 132;
            pt.vy = -pt.vy * 0.45;
            pt.vx *= 0.82;
          }
          drawPixelRect(pt.x, pt.y, pt.size, pt.size, pt.color);
        }
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [playerEmoji, playerColor, replayCount]);

  const handleReplay = () => {
    unlockRetroAudio();
    setReplayCount((c) => c + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Has sido eliminado"
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black px-4 py-6 text-white select-none"
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px)',
      }}
    >
      {/* CABECERA 8-BIT "ELIMINADO" */}
      <header className="flex w-full max-w-xl flex-col items-center gap-3 pt-2 sm:pt-4">
        <div className="w-full px-2 flex justify-center">
          <svg
            viewBox={`-1 -1 ${bannerGlyphRects.width + 3} ${
              bannerGlyphRects.height + 3
            }`}
            shapeRendering="crispEdges"
            className="h-auto w-full max-w-[360px] sm:max-w-[440px]"
            role="img"
            aria-label="ELIMINADO"
          >
            {/* Sombra magenta desplazada estilo Danganronpa 8-bit */}
            {bannerGlyphRects.rects.map((r) => (
              <rect
                key={`s-${r.key}`}
                x={r.x + 1}
                y={r.y + 1}
                width={1}
                height={1}
                fill="#FF1E6E"
              />
            ))}
            {/* Texto blanco pixelado */}
            {bannerGlyphRects.rects.map((r) => (
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
          <p className="font-mono text-xs sm:text-sm font-bold uppercase tracking-[0.22em] text-[#FF1E6E]">
            {causeLabel}
          </p>
          <p className="font-mono text-xs text-zinc-400">
            JUGADOR: {playerName.toUpperCase()}
          </p>
        </div>
      </header>

      {/* ESCENARIO CENTRAL CON PERSONAJE PIXELADO */}
      <main className="flex flex-1 flex-col items-center justify-center w-full max-w-md my-2">
        <div className="relative flex items-center justify-center rounded-none border-2 border-[#FF1E6E]/70 bg-black p-1 shadow-[0_0_40px_rgba(255,30,110,0.22)]">
          <canvas
            ref={canvasRef}
            width={160}
            height={160}
            className="h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] block bg-black"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </main>

      {/* CONTROLES INFERIORES */}
      <footer className="flex w-full max-w-md flex-col gap-2.5 pb-safe">
        {audioBlocked && (
          <button
            type="button"
            onClick={handleReplay}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 border border-[#FF1E6E] bg-[#FF1E6E]/15 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#FF1E6E] hover:bg-[#FF1E6E]/25"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Activar sintonía 8-bit</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleReplay}
            className="flex min-h-[48px] items-center justify-center gap-2 border border-zinc-700 bg-zinc-950 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Repetir</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] items-center justify-center gap-2 border border-white bg-white px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-black hover:bg-zinc-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>{sequenceDone ? 'Espectador' : 'Saltar'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
