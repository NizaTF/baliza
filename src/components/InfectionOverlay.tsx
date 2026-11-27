import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, Zap } from 'lucide-react';
import { playInfection8BitTheme, unlockRetroAudio } from '../lib/retroAudio';

interface InfectionOverlayProps {
  playerName: string;
  playerEmoji: string;
  playerColor: string;
  causeLabel: string;
  autoCloseAfterDone?: boolean;
  onClose: () => void;
}

const INFECT_PIXEL_FONT: Record<string, string[]> = {
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
};

/**
 * Matriz 16x16 del cazador infectado pixel-art (distinto de la calavera negra):
 * '.' = transparente
 * 'G' = contorno verde tóxico (#22FF66)
 * 'M' = sombra verde oscuro (#064E3B)
 * 'K' = base oscura (#09130D)
 * 'V' = acento violeta biohazard (#C026D3)
 * 'R' = ojo rojo cazador (#FF2A55)
 * 'W' = colmillo/brillo blanco (#F8FAFC)
 */
const INFECTED_HUNTER_SPRITE_16: string[] = [
  '....GGGGGGGG....',
  '...GMMMMMMMMG...',
  '..GMMKKKKKKMMG..',
  '..GMKKVKKVKKMG..',
  '..GMKRRKKRRKMG..',
  '..GMKWRKKRWKMG..',
  '..GMKKKKKKKKMG..',
  '..GMMKKGGKKMMG..',
  '...GMKKKKKKMG...',
  '...GMKWKKWKMG...',
  '..GGMKWWWWKMGG..',
  '.GVVKKKKKKKKVVG.',
  '..G.GKWKKWKG.G..',
  '....GKKKKKKG....',
  '.....GGGGGG.....',
  '................',
];

interface PixelCell {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
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

interface SporePixel {
  x: number;
  y: number;
  vy: number;
  size: number;
  color: string;
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
      pixels.push({ x, y, r, g, b });
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
    const glyph = INFECT_PIXEL_FONT[ch];
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

export const InfectionOverlay: React.FC<InfectionOverlayProps> = ({
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

  const bannerGlyphRects = useMemo(() => buildPixelTextRects('INFECTADO'), []);

  useEffect(() => {
    setSequenceDone(false);
    const playback = playInfection8BitTheme();
    setAudioBlocked(playback.wasBlocked);

    const doneTimer = window.setTimeout(() => {
      setSequenceDone(true);
    }, 3950);

    return () => {
      window.clearTimeout(doneTimer);
      playback.stop();
    };
  }, []);

  useEffect(() => {
    if (!autoCloseAfterDone || !sequenceDone) return;
    const t = window.setTimeout(() => {
      onCloseRef.current();
    }, 320);
    return () => window.clearTimeout(t);
  }, [autoCloseAfterDone, sequenceDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const sprite = buildEmojiPixelSprite(playerEmoji);
    const pxScale = 3;
    const spriteW = sprite.gridSize * pxScale;
    const spriteBaseX = Math.floor((W - spriteW) / 2);
    const spriteBaseY = 44;

    const particles: PixelParticle[] = [];
    const spores: SporePixel[] = Array.from({ length: 22 }, (_, idx) => ({
      x: Math.floor((idx * 29 + 7) % W),
      y: Math.floor((idx * 41) % H),
      vy: 14 + (idx % 5) * 6,
      size: idx % 4 === 0 ? 2 : 1,
      color: idx % 3 === 0 ? '#C026D3' : '#22FF66',
    }));
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

    const spawnMutationBurst = () => {
      if (burstSpawned) return;
      burstSpawned = true;
      const palette = ['#22FF66', '#10B981', '#C026D3', '#FFFFFF', '#FF2A55', playerColor];
      for (let i = 0; i < 68; i++) {
        const angle = (Math.PI * 2 * i) / 68 + (Math.random() - 0.5) * 0.25;
        const speed = 42 + Math.random() * 120;
        particles.push({
          x: W / 2 + (Math.random() - 0.5) * 14,
          y: spriteBaseY + spriteW / 2 + (Math.random() - 0.5) * 14,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 32,
          size: Math.random() > 0.42 ? 3 : 2,
          color: palette[i % palette.length],
          life: 0,
          maxLife: 1.05 + Math.random() * 1.15,
        });
      }
    };

    const drawInfectedHunterSprite = (cx: number, cy: number, scale: number) => {
      const size = 16 * scale;
      const startX = Math.floor(cx - size / 2);
      const startY = Math.floor(cy - size / 2);

      // Marco doble biohazard verde tóxico + violeta
      drawPixelRect(startX - 7, startY - 7, size + 14, size + 14, '#030A06');
      drawPixelRect(startX - 7, startY - 7, size + 14, 2, '#22FF66');
      drawPixelRect(startX - 7, startY + size + 5, size + 14, 2, '#22FF66');
      drawPixelRect(startX - 7, startY - 7, 2, size + 14, '#22FF66');
      drawPixelRect(startX + size + 5, startY - 7, 2, size + 14, '#22FF66');

      drawPixelRect(startX - 4, startY - 4, size + 8, 1, '#C026D3');
      drawPixelRect(startX - 4, startY + size + 3, size + 8, 1, '#C026D3');

      for (let row = 0; row < INFECTED_HUNTER_SPRITE_16.length; row++) {
        const line = INFECTED_HUNTER_SPRITE_16[row];
        for (let col = 0; col < line.length; col++) {
          const ch = line[col];
          if (ch === '.') continue;
          const color =
            ch === 'G'
              ? '#22FF66'
              : ch === 'M'
              ? '#065F46'
              : ch === 'K'
              ? '#09130D'
              : ch === 'V'
              ? '#C026D3'
              : ch === 'R'
              ? '#FF2A55'
              : '#F8FAFC';
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
      const elapsedSec = prefersReducedMotion ? 2.5 : (nowMs - startMs) / 1000;

      // 1. Fondo biohazard oscuro
      drawPixelRect(0, 0, W, H, '#030A06');

      // 2. Cuadrícula pixelada verde/violeta
      ctx.fillStyle = 'rgba(34, 255, 102, 0.08)';
      for (let gx = 0; gx < W; gx += 16) {
        ctx.fillRect(gx, 0, 1, H);
      }
      for (let gy = 0; gy < H; gy += 16) {
        ctx.fillRect(0, gy, W, 1);
      }

      // Esporas flotantes
      spores.forEach((sp) => {
        if (!prefersReducedMotion) {
          sp.y -= sp.vy * dt;
          if (sp.y < -4) sp.y = H + 2;
        }
        drawPixelRect(sp.x, sp.y, sp.size, sp.size, sp.color);
      });

      // 3. Foco biohazard cenital
      const spotProgress = Math.min(1, elapsedSec / 0.35);
      if (spotProgress > 0) {
        const topHalf = Math.floor(18 * spotProgress);
        const botHalf = Math.floor(48 * spotProgress);
        for (let row = 10; row < 130; row += 2) {
          const t = (row - 10) / (130 - 10);
          const halfW = Math.round(topHalf + (botHalf - topHalf) * t);
          ctx.fillStyle =
            elapsedSec >= 1.78 && elapsedSec < 1.94
              ? 'rgba(34, 255, 102, 0.34)'
              : elapsedSec >= 0.5
              ? 'rgba(34, 255, 102, 0.09)'
              : 'rgba(192, 38, 211, 0.08)';
          ctx.fillRect(Math.floor(W / 2 - halfW), row, halfW * 2, 2);
        }
        drawPixelRect(W / 2 - botHalf, 128, botHalf * 2, 4, '#064E3B');
        drawPixelRect(W / 2 - botHalf + 6, 132, (botHalf - 6) * 2, 2, '#022C22');
      }

      const isMutated = elapsedSec >= 1.78;
      const bounceOffsetY =
        elapsedSec < 0.5
          ? -Math.abs(Math.round(Math.sin(elapsedSec * 12) * 5))
          : 0;
      const glitchShakeX =
        !isMutated && elapsedSec >= 0.5
          ? Math.round(Math.sin(elapsedSec * 62) * (elapsedSec > 1.2 ? 3 : 2))
          : isMutated && elapsedSec < 2.04
          ? Math.round(Math.sin(elapsedSec * 90) * 3)
          : 0;
      const glitchShakeY =
        isMutated && elapsedSec < 2.04
          ? Math.round(Math.cos(elapsedSec * 80) * 2)
          : 0;

      const drawX = spriteBaseX + glitchShakeX;
      const drawY = spriteBaseY + bounceOffsetY + glitchShakeY;

      drawPixelRect(drawX + 12, 126, spriteW - 24, 3, '#052E16');

      if (!isMutated) {
        const infectionProgress =
          elapsedSec >= 0.5 ? Math.min(1, (elapsedSec - 0.5) / 1.26) : 0;
        const corruptCutoffY = spriteBaseY + infectionProgress * spriteW;

        if (sprite.pixels.length > 0) {
          for (let i = 0; i < sprite.pixels.length; i++) {
            const cell = sprite.pixels[i];
            const py = drawY + cell.y * pxScale;
            const isWaveEdge =
              elapsedSec >= 0.5 && Math.abs(py - corruptCutoffY) < 5;
            const isCorrupted = elapsedSec >= 0.5 && py <= corruptCutoffY;

            if (isWaveEdge) {
              ctx.fillStyle = '#FFFFFF';
            } else if (isCorrupted) {
              // Mutación progresiva de los píxeles del emoji hacia verde tóxico / violeta
              ctx.fillStyle =
                (cell.x + cell.y) % 5 === 0
                  ? '#C026D3'
                  : (cell.x * 3 + cell.y) % 2 === 0
                  ? '#22FF66'
                  : '#10B981';
            } else {
              ctx.fillStyle = `rgb(${cell.r}, ${cell.g}, ${cell.b})`;
            }
            ctx.fillRect(drawX + cell.x * pxScale, py, pxScale, pxScale);
          }
        } else {
          drawPixelRect(drawX + 12, drawY + 12, 42, 42, playerColor);
        }

        // Retícula biohazard cerrándose
        if (elapsedSec >= 0.25) {
          const lockT = Math.min(1, Math.max(0, (elapsedSec - 0.5) / 1.25));
          const margin = Math.round(14 - lockT * 10);
          const bx0 = drawX - margin;
          const by0 = drawY - margin;
          const bx1 = drawX + spriteW + margin;
          const by1 = drawY + spriteW + margin;
          const cornerLen = 10;
          const bracketColor =
            elapsedSec >= 0.5 && Math.floor(elapsedSec * 14) % 2 === 0
              ? '#22FF66'
              : '#C026D3';

          drawPixelRect(bx0, by0, cornerLen, 2, bracketColor);
          drawPixelRect(bx0, by0, 2, cornerLen, bracketColor);
          drawPixelRect(bx1 - cornerLen, by0, cornerLen, 2, bracketColor);
          drawPixelRect(bx1 - 2, by0, 2, cornerLen, bracketColor);
          drawPixelRect(bx0, by1 - 2, cornerLen, 2, bracketColor);
          drawPixelRect(bx0, by1 - cornerLen, 2, cornerLen, bracketColor);
          drawPixelRect(bx1 - cornerLen, by1 - 2, cornerLen, 2, bracketColor);
          drawPixelRect(bx1 - 2, by1 - cornerLen, 2, cornerLen, bracketColor);
        }

        // Haz de contagio + icono biohazard pixelado encima
        if (elapsedSec >= 0.5) {
          drawPixelRect(drawX - 8, corruptCutoffY, spriteW + 16, 2, '#22FF66');
          drawPixelRect(drawX - 4, corruptCutoffY - 1, spriteW + 8, 1, '#C026D3');

          if (Math.floor(elapsedSec * 10) % 2 === 0) {
            const bx = W / 2 - 7;
            const by = drawY - 19;
            drawPixelRect(bx, by, 14, 14, '#22FF66');
            drawPixelRect(bx + 2, by + 2, 10, 10, '#030A06');
            // Cruz/núcleo biohazard pixelado
            drawPixelRect(bx + 6, by + 3, 2, 8, '#C026D3');
            drawPixelRect(bx + 3, by + 6, 8, 2, '#C026D3');
            drawPixelRect(bx + 6, by + 6, 2, 2, '#FFFFFF');
          }
        }
      } else {
        // 5. Mutación completada: explosión tóxica + Cazador Infectado pixel-art
        spawnMutationBurst();

        if (!prefersReducedMotion && elapsedSec >= 1.78 && elapsedSec < 1.9) {
          ctx.fillStyle =
            Math.floor(elapsedSec * 60) % 2 === 0
              ? 'rgba(34, 255, 102, 0.85)'
              : 'rgba(192, 38, 211, 0.72)';
          ctx.fillRect(0, 0, W, H);
        }

        const waveAge = elapsedSec - 1.78;
        if (!prefersReducedMotion && waveAge < 0.45) {
          const r = Math.floor(24 + waveAge * 135);
          ctx.strokeStyle = '#22FF66';
          ctx.lineWidth = 2;
          ctx.strokeRect(
            Math.floor(W / 2 - r),
            Math.floor(spriteBaseY + spriteW / 2 - r),
            r * 2,
            r * 2
          );
        }

        drawInfectedHunterSprite(
          W / 2 + glitchShakeX,
          spriteBaseY + Math.floor(spriteW / 2) + glitchShakeY,
          4
        );

        // Sello pixelado "CAZADOR" debajo del sprite mutado
        const hunterWord = buildPixelTextRects('CAZADOR');
        const badgeW = hunterWord.width + 14;
        const badgeH = 14;
        const badgeX = Math.floor(W / 2 - badgeW / 2);
        const badgeY = 122;
        drawPixelRect(badgeX, badgeY, badgeW, badgeH, '#22FF66');
        drawPixelRect(badgeX + 2, badgeY + 2, badgeW - 4, badgeH - 4, '#030A06');
        const wordStartX = Math.floor(W / 2 - hunterWord.width / 2);
        const wordStartY = badgeY + 3;
        hunterWord.rects.forEach((r) => {
          drawPixelRect(wordStartX + r.x, wordStartY + r.y, 1, 1, '#FFFFFF');
        });
      }

      if (particles.length > 0) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.life += dt;
          if (pt.life >= pt.maxLife) {
            particles.splice(i, 1);
            continue;
          }
          pt.vy += 225 * dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          if (pt.y > 128) {
            pt.y = 128;
            pt.vy = -pt.vy * 0.48;
            pt.vx *= 0.84;
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
      aria-label="Has sido infectado"
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-[#030A06] dr-scanlines px-4 py-6 text-white select-none"
    >
      {/* CABECERA PIXELADA "INFECTADO" */}
      <header className="flex w-full max-w-xl flex-col items-center gap-3 pt-2 sm:pt-4">
        <div className="w-full px-2 flex justify-center">
          <svg
            viewBox={`-1 -1 ${bannerGlyphRects.width + 3} ${
              bannerGlyphRects.height + 3
            }`}
            shapeRendering="crispEdges"
            className="h-auto w-full max-w-[360px] sm:max-w-[440px]"
            role="img"
            aria-label="INFECTADO"
          >
            {bannerGlyphRects.rects.map((r) => (
              <rect
                key={`s-${r.key}`}
                x={r.x + 1}
                y={r.y + 1}
                width={1}
                height={1}
                fill="#22FF66"
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
          <p className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-[#22FF66]">
            {causeLabel}
          </p>
          <p className="font-mono text-xs text-emerald-200/80">
            {playerName.toUpperCase()} · CAMBIO DE BANDO → BUSCADOR
          </p>
        </div>
      </header>

      {/* ESCENARIO CENTRAL PIXEL-ART */}
      <main className="flex flex-1 flex-col items-center justify-center w-full max-w-md my-2">
        <div className="relative flex items-center justify-center border-2 border-[#22FF66] bg-[#030A06] p-1 shadow-[6px_6px_0_0_#C026D3]">
          <canvas
            ref={canvasRef}
            width={160}
            height={160}
            className="h-[260px] w-[260px] sm:h-[320px] sm:w-[320px] block bg-[#030A06] pixelated"
          />
        </div>
      </main>

      {/* CONTROLES INFERIORES */}
      <footer className="flex w-full max-w-md flex-col gap-2.5 pb-safe">
        {audioBlocked && (
          <button
            type="button"
            onClick={handleEnableAudio}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 border-2 border-[#22FF66] bg-[#22FF66]/15 px-4 py-2 font-display text-xs font-bold uppercase text-[#22FF66] hover:bg-[#22FF66]/25"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Activar sonido</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 border-2 border-[#22FF66] bg-[#22FF66] px-4 py-2.5 font-display text-xs font-bold uppercase text-black shadow-[4px_4px_0_0_#FFFFFF] hover:bg-[#4ADE80]"
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
          <span>{sequenceDone ? '¡A cazar!' : 'Saltar'}</span>
        </button>
      </footer>
    </div>
  );
};
