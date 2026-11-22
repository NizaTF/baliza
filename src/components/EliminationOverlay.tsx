import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { playElimination8BitTheme, unlockRetroAudio } from '../lib/retroAudio';

interface EliminationOverlayProps {
  playerName: string;
  playerEmoji: string;
  playerColor: string;
  causeLabel: string;
  autoCloseAfterDone?: boolean;
  onClose: () => void;
}

const PIXEL_FONT: Record<string, string[]> = {
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

/**
 * Matriz 16x16 de la calavera negra pixel-art:
 * '.' = transparente, 'W' = contorno blanco, 'K' = hueso negro (#09090B), 'P' = ojo magenta (#FF1E6E), 'E' = blanco ojo
 */
const SKULL_SPRITE_16: string[] = [
  '....WWWWWWWW....',
  '...WKKKKKKKKW...',
  '..WKKKKKKKKKKW..',
  '..WKKKKKKKKKKW..',
  '..WKKEEEKKKEEW..',
  '..WKKEPKKKEPKW..',
  '..WKKEEEKKKEEW..',
  '..WKKKKKKKKKKW..',
  '...WKKKWWKKKW...',
  '...WKKKKKKKKW...',
  '....WKKKKKKW....',
  '....WKWWKWKW....',
  '....WKWWKWKW....',
  '.....WWWWWW.....',
  '................',
  '................',
];

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

      const r = Math.min(255, Math.round(imgData[idx] / 32) * 32);
      const g = Math.min(255, Math.round(imgData[idx + 1] / 32) * 32);
      const b = Math.min(255, Math.round(imgData[idx + 2] / 32) * 32);
      const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
      pixels.push({ x, y, r, g, b, gray });
    }
  }

  return { gridSize, pixels };
}

function buildPixelTextRects(
  word: string
): { width: number; height: number; rects: Array<{ x: number; y: number; key: string }> } {
  const rects: Array<{ x: number; y: number; key: string }> = [];
  let cursorX = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const glyph = PIXEL_FONT[ch];
    if (!glyph) {
      cursorX += 4;
      continue;
    }
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === '1') {
          rects.push({
            x: cursorX + col,
            y: row,
            key: `${i}-${row}-${col}`,
          });
        }
      }
    }
    cursorX += 6;
  }
  return {
    width: Math.max(1, cursorX - 1),
    height: 7,
    rects,
  };
}

export const EliminationOverlay: React.FC<EliminationOverlayProps> = ({
  playerName,
  playerEmoji,
  playerColor,
  causeLabel,
  autoCloseAfterDone = false,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [sequenceDone, setSequenceDone] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const bannerGlyphRects = useMemo(() => buildPixelTextRects('ELIMINADO'), []);

  // Reproducir sintonía 8-bit sincronizada una sola vez
  useEffect(() => {
    setSequenceDone(false);
    const playback = playElimination8BitTheme();
    setAudioBlocked(playback.wasBlocked);

    const doneTimer = window.setTimeout(() => {
      setSequenceDone(true);
    }, 3900);

    return () => {
      window.clearTimeout(doneTimer);
      playback.stop();
    };
  }, []);

  // Si la partida ya terminó con esta última eliminación, pasar automáticamente a Victoria/Derrota al acabar la animación
  useEffect(() => {
    if (!autoCloseAfterDone || !sequenceDone) return;
    const t = window.setTimeout(() => {
      onCloseRef.current();
    }, 300);
    return () => window.clearTimeout(t);
  }, [autoCloseAfterDone, sequenceDone]);

  // Animación pixel-art 8-bit de eliminación en canvas 160x160 (transformación a calavera negra, SIN muerte ni ejecución)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const sprite = buildEmojiPixelSprite(playerEmoji);
    const pxScale = 3; // 22 * 3 = 66px
    const spriteW = sprite.gridSize * pxScale;
    const spriteBaseX = Math.floor((W - spriteW) / 2);
    const spriteBaseY = 48;

    const particles: PixelParticle[] = [];
    let burstSpawned = false;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const startMs = performance.now();
    let lastMs = startMs;
    let rafId = 0;

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

    const spawnBurst = () => {
      if (burstSpawned) return;
      burstSpawned = true;
      const palette = ['#FF1E6E', '#FFFFFF', '#A1A1AA', '#09090B', playerColor];
      for (let i = 0; i < 64; i++) {
        const angle = (Math.PI * 2 * i) / 64 + (Math.random() - 0.5) * 0.25;
        const speed = 38 + Math.random() * 115;
        particles.push({
          x: W / 2 + (Math.random() - 0.5) * 16,
          y: spriteBaseY + spriteW / 2 + (Math.random() - 0.5) * 16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          size: Math.random() > 0.45 ? 3 : 2,
          color: palette[i % palette.length],
          life: 0,
          maxLife: 1.0 + Math.random() * 1.1,
        });
      }
    };

    const drawBlackSkullSprite = (cx: number, cy: number, scale: number) => {
      const size = 16 * scale;
      const startX = Math.floor(cx - size / 2);
      const startY = Math.floor(cy - size / 2);

      // Marco negro de emblema eliminado con borde magenta/blanco
      drawPixelRect(startX - 6, startY - 6, size + 12, size + 12, '#000000');
      drawPixelRect(startX - 6, startY - 6, size + 12, 2, '#FF1E6E');
      drawPixelRect(startX - 6, startY + size + 4, size + 12, 2, '#FF1E6E');
      drawPixelRect(startX - 6, startY - 6, 2, size + 12, '#FF1E6E');
      drawPixelRect(startX + size + 4, startY - 6, 2, size + 12, '#FF1E6E');

      for (let row = 0; row < SKULL_SPRITE_16.length; row++) {
        const line = SKULL_SPRITE_16[row];
        for (let col = 0; col < line.length; col++) {
          const ch = line[col];
          if (ch === '.') continue;
          const color =
            ch === 'W'
              ? '#F4F4F5'
              : ch === 'K'
              ? '#09090B'
              : ch === 'P'
              ? '#FF1E6E'
              : '#FFFFFF';
          drawPixelRect(
            startX + col * scale,
            startY + row * scale,
            scale,
            scale,
            color
          );
        }
      }
    };

    const renderFrame = (nowMs: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      const elapsedSec = prefersReducedMotion ? 2.4 : (nowMs - startMs) / 1000;

      // 1. Fondo negro puro
      drawPixelRect(0, 0, W, H, '#000000');

      // 2. Cuadrícula pixelada tenue en el fondo negro
      ctx.fillStyle = 'rgba(255, 30, 110, 0.08)';
      for (let gx = 0; gx < W; gx += 16) {
        ctx.fillRect(gx, 0, 1, H);
      }
      for (let gy = 0; gy < H; gy += 16) {
        ctx.fillRect(0, gy, W, 1);
      }

      // 3. Foco cenital pixelado en el escenario
      const spotProgress = Math.min(1, elapsedSec / 0.35);
      if (spotProgress > 0) {
        const topHalf = Math.floor(16 * spotProgress);
        const botHalf = Math.floor(46 * spotProgress);
        for (let row = 12; row < 134; row += 2) {
          const t = (row - 12) / (134 - 12);
          const halfW = Math.round(topHalf + (botHalf - topHalf) * t);
          ctx.fillStyle =
            elapsedSec >= 1.76 && elapsedSec < 1.92
              ? 'rgba(255, 30, 110, 0.30)'
              : 'rgba(255, 255, 255, 0.07)';
          ctx.fillRect(Math.floor(W / 2 - halfW), row, halfW * 2, 2);
        }
        drawPixelRect(W / 2 - botHalf, 132, botHalf * 2, 4, '#27272A');
        drawPixelRect(
          W / 2 - botHalf + 6,
          136,
          (botHalf - 6) * 2,
          2,
          '#18181B'
        );
      }

      const isTransformed = elapsedSec >= 1.76;

      // 4. Rebote inicial del emoji pixelado antes del escaneo -> temblor digital durante escaneo
      const bounceOffsetY =
        elapsedSec < 0.48
          ? -Math.abs(Math.round(Math.sin(elapsedSec * 12) * 5))
          : 0;
      const scanShakeX =
        !isTransformed && elapsedSec >= 0.48
          ? Math.round(Math.sin(elapsedSec * 56) * 2)
          : isTransformed && elapsedSec < 2.02
          ? Math.round(Math.sin(elapsedSec * 85) * 3)
          : 0;
      const scanShakeY =
        isTransformed && elapsedSec < 2.02
          ? Math.round(Math.cos(elapsedSec * 75) * 2)
          : 0;

      const drawX = spriteBaseX + scanShakeX;
      const drawY = spriteBaseY + bounceOffsetY + scanShakeY;

      // Sombra pixelada en el suelo
      drawPixelRect(drawX + 12, 130, spriteW - 24, 3, '#18181B');

      if (!isTransformed) {
        // Dibujar el emoji pixelado del jugador
        if (sprite.pixels.length > 0) {
          for (let i = 0; i < sprite.pixels.length; i++) {
            const cell = sprite.pixels[i];
            // Durante el escaneo (0.48 - 1.76), aplicar pulso blanco/magenta de desincronización
            const scanY =
              spriteBaseY +
              (((elapsedSec - 0.48) * 95) % spriteW);
            const nearBeam =
              elapsedSec >= 0.48 &&
              Math.abs(drawY + cell.y * pxScale - scanY) < 6;
            ctx.fillStyle = nearBeam
              ? '#FF1E6E'
              : `rgb(${cell.r}, ${cell.g}, ${cell.b})`;
            ctx.fillRect(
              drawX + cell.x * pxScale,
              drawY + cell.y * pxScale,
              pxScale,
              pxScale
            );
          }
        } else {
          drawPixelRect(drawX + 12, drawY + 12, 42, 42, playerColor);
          drawPixelRect(drawX + 20, drawY + 24, 8, 8, '#FFFFFF');
          drawPixelRect(drawX + 38, drawY + 24, 8, 8, '#FFFFFF');
        }

        // Retícula / esquinas de fijación estilo Danganronpa cerrándose sobre el emoji
        if (elapsedSec >= 0.25) {
          const lockT = Math.min(1, Math.max(0, (elapsedSec - 0.48) / 1.25));
          const margin = Math.round(14 - lockT * 10);
          const bx0 = drawX - margin;
          const by0 = drawY - margin;
          const bx1 = drawX + spriteW + margin;
          const by1 = drawY + spriteW + margin;
          const cornerLen = 9;
          const bracketColor =
            elapsedSec >= 0.48 && Math.floor(elapsedSec * 12) % 2 === 0
              ? '#FF1E6E'
              : '#FFFFFF';

          // 4 esquinas pixeladas
          drawPixelRect(bx0, by0, cornerLen, 2, bracketColor);
          drawPixelRect(bx0, by0, 2, cornerLen, bracketColor);

          drawPixelRect(bx1 - cornerLen, by0, cornerLen, 2, bracketColor);
          drawPixelRect(bx1 - 2, by0, 2, cornerLen, bracketColor);

          drawPixelRect(bx0, by1 - 2, cornerLen, 2, bracketColor);
          drawPixelRect(bx0, by1 - cornerLen, 2, cornerLen, bracketColor);

          drawPixelRect(bx1 - cornerLen, by1 - 2, cornerLen, 2, bracketColor);
          drawPixelRect(bx1 - 2, by1 - cornerLen, 2, cornerLen, bracketColor);
        }

        // Haz horizontal de escaneo + icono de alerta "!" (eliminación digital, sin violencia)
        if (elapsedSec >= 0.48) {
          const beamY =
            spriteBaseY + (((elapsedSec - 0.48) * 95) % spriteW);
          drawPixelRect(drawX - 8, beamY, spriteW + 16, 2, '#FF1E6E');
          drawPixelRect(drawX - 4, beamY - 1, spriteW + 8, 1, '#FFFFFF');

          if (Math.floor(elapsedSec * 10) % 2 === 0) {
            const ax = W / 2 - 7;
            const ay = drawY - 18;
            drawPixelRect(ax, ay, 14, 14, '#FF1E6E');
            drawPixelRect(ax + 2, ay + 2, 10, 10, '#000000');
            drawPixelRect(ax + 6, ay + 3, 2, 5, '#FFFFFF');
            drawPixelRect(ax + 6, ay + 10, 2, 2, '#FFFFFF');
          }
        }
      } else {
        // 5. Transformación final: Explosión de píxeles + Calavera negra pixelada
        spawnBurst();

        if (!prefersReducedMotion && elapsedSec >= 1.76 && elapsedSec < 1.88) {
          ctx.fillStyle =
            Math.floor(elapsedSec * 60) % 2 === 0
              ? 'rgba(255, 255, 255, 0.85)'
              : 'rgba(255, 30, 110, 0.72)';
          ctx.fillRect(0, 0, W, H);
        }

        // Onda expansiva cuadrada pixelada
        const waveAge = elapsedSec - 1.76;
        if (!prefersReducedMotion && waveAge < 0.45) {
          const r = Math.floor(26 + waveAge * 130);
          ctx.strokeStyle = '#FF1E6E';
          ctx.lineWidth = 2;
          ctx.strokeRect(
            Math.floor(W / 2 - r),
            Math.floor(spriteBaseY + spriteW / 2 - r),
            r * 2,
            r * 2
          );
        }

        // Dibujar calavera negra pixel-art reemplazando el emoji del jugador
        drawBlackSkullSprite(
          W / 2 + scanShakeX,
          spriteBaseY + Math.floor(spriteW / 2) + scanShakeY,
          4
        );

        // Sello pixelado "OUT" debajo de la calavera
        const badgeW = 44;
        const badgeH = 14;
        const badgeX = Math.floor(W / 2 - badgeW / 2);
        const badgeY = 122;
        drawPixelRect(badgeX, badgeY, badgeW, badgeH, '#FF1E6E');
        drawPixelRect(badgeX + 2, badgeY + 2, badgeW - 4, badgeH - 4, '#000000');
        const outWord = buildPixelTextRects('OUT');
        const outStartX = Math.floor(W / 2 - outWord.width / 2);
        const outStartY = badgeY + 3;
        outWord.rects.forEach((r) => {
          drawPixelRect(outStartX + r.x, outStartY + r.y, 1, 1, '#FFFFFF');
        });
      }

      // 6. Partículas pixeladas en movimiento
      if (particles.length > 0) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.life += dt;
          if (pt.life >= pt.maxLife) {
            particles.splice(i, 1);
            continue;
          }
          pt.vy += 240 * dt;
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
  }, [playerEmoji, playerColor]);

  const handleEnableAudio = () => {
    unlockRetroAudio();
    setAudioBlocked(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Has sido eliminado"
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black dr-scanlines px-4 py-6 text-white select-none"
    >
      {/* CABECERA ARRIBA CON MENSAJE PIXELADO "ELIMINADO" */}
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
          <p className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-[#FF1E6E]">
            {causeLabel}
          </p>
          <p className="font-mono text-xs text-zinc-400">
            JUGADOR: {playerName.toUpperCase()}
          </p>
        </div>
      </header>

      {/* ESCENARIO CENTRAL CON FONDO NEGRO, EMOJI PIXELADO Y TRANSFORMACIÓN A CALAVERA NEGRA */}
      <main className="flex flex-1 flex-col items-center justify-center w-full max-w-md my-2">
        <div className="relative flex items-center justify-center border-2 border-[#FF1E6E] bg-black p-1 shadow-[6px_6px_0_0_#FF1E6E]">
          <canvas
            ref={canvasRef}
            width={160}
            height={160}
            className="h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] block bg-black pixelated"
          />
        </div>
      </main>

      {/* CONTROLES INFERIORES */}
      <footer className="flex w-full max-w-md flex-col gap-2.5 pb-safe">
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

        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 border-2 border-white bg-white px-4 py-2.5 font-display text-xs font-bold uppercase text-black dr-btn-shadow-pink hover:bg-zinc-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span>{sequenceDone ? 'Espectador' : 'Saltar'}</span>
        </button>
      </footer>
    </div>
  );
};
