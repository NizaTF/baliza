import React, { useEffect, useMemo, useRef } from 'react';
import { playPlayerKickedSting } from '../lib/retroAudio';

interface KickedOverlayProps {
  playerName: string;
  playerEmoji: string;
  playerColor: string;
  roomCode?: string;
  onClose: () => void;
}

const KICK_FONT: Record<string, string[]> = {
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
};

const GAVEL_SPRITE_16: string[] = [
  '................',
  '.....OOOOOO.....',
  '....OMMMMMMO....',
  '....OMWWWWMO....',
  '....OMMMMMMO....',
  '.....OOOOOO.....',
  '.......OO.......',
  '.......OO.......',
  '.......OO.......',
  '......OYYO......',
  '......OYYO......',
  '..OOOOOOOOOOOO..',
  '.OWWWWWWWWWWWWO.',
  '.OOOOOOOOOOOOOO.',
  '................',
  '................',
];

function buildWordRects(word: string) {
  const rects: Array<{ x: number; y: number; key: string }> = [];
  let cursorX = 0;
  for (let i = 0; i < word.length; i++) {
    const glyph = KICK_FONT[word[i]];
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

export const KickedOverlay: React.FC<KickedOverlayProps> = ({
  playerName,
  playerEmoji,
  playerColor,
  roomCode,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const titleRects = useMemo(() => buildWordRects('EXPULSADO'), []);

  useEffect(() => {
    playPlayerKickedSting(true);
    const autoTimer = window.setTimeout(() => {
      onCloseRef.current();
    }, 3400);
    return () => window.clearTimeout(autoTimer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 160;
    const H = 160;

    // Renderizar emoji en mini sprite pixelado 18x18
    const off = document.createElement('canvas');
    off.width = 18;
    off.height = 18;
    const octx = off.getContext('2d', { willReadFrequently: true });
    const emojiPixels: Array<{ x: number; y: number; color: string }> = [];
    if (octx) {
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.font = '14px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      octx.fillText(playerEmoji || '🏃', 9, 10);
      const data = octx.getImageData(0, 0, 18, 18).data;
      for (let y = 0; y < 18; y++) {
        for (let x = 0; x < 18; x++) {
          const idx = (y * 18 + x) * 4;
          if (data[idx + 3] > 90) {
            emojiPixels.push({
              x,
              y,
              color: `rgb(${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]})`,
            });
          }
        }
      }
    }

    const sparks: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }> = [];
    const sparkColors = ['#FF1E6E', '#FFFFFF', playerColor, '#A1A1AA'];
    for (let i = 0; i < 42; i++) {
      const ang = (Math.PI * 2 * i) / 42 + (Math.random() - 0.5) * 0.25;
      const spd = 42 + Math.random() * 96;
      sparks.push({
        x: W / 2,
        y: 92,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20,
        size: i % 3 === 0 ? 3 : 2,
        color: sparkColors[i % sparkColors.length],
      });
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const startMs = performance.now();
    let lastMs = startMs;
    let rafId = 0;

    const drawRect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastMs) / 1000));
      lastMs = now;
      const elapsed = prefersReducedMotion ? 1.2 : (now - startMs) / 1000;

      drawRect(0, 0, W, H, '#000000');

      // Rayas veloces diagonales estilo Danganronpa
      ctx.fillStyle = '#120710';
      for (let i = -H; i < W + H; i += 14) {
        const shift = Math.round((elapsed * 32) % 14);
        drawRect(i + shift, 0, 5, H, '#0E0912');
      }

      // Ficha del jugador expulsado que sale despedida tras el impacto at t=0.45
      const impactT = 0.45;
      const shakeX =
        !prefersReducedMotion && elapsed >= impactT && elapsed < impactT + 0.24
          ? Math.round(Math.sin(elapsed * 85) * 4)
          : 0;

      const flyProg = elapsed > impactT ? Math.min(1, (elapsed - impactT) / 0.65) : 0;
      const cardX = W / 2 - 27 + flyProg * 115 + shakeX;
      const cardY = 66 - flyProg * 26;

      if (flyProg < 1) {
        // Marco del avatar pixelado
        drawRect(cardX - 3, cardY - 3, 60, 60, '#FFFFFF');
        drawRect(cardX, cardY, 54, 54, '#18181B');
        for (const px of emojiPixels) {
          drawRect(cardX + px.x * 3, cardY + px.y * 3, 3, 3, px.color);
        }
      }

      // Mazo de veredicto cayendo sobre la ficha
      const gavelProg = Math.min(1, elapsed / impactT);
      const gavelY = Math.round(-40 + Math.pow(gavelProg, 2) * 82);
      const gavelScale = 4;
      const gavelBaseX = Math.floor(W / 2 - (16 * gavelScale) / 2) + shakeX;

      for (let r = 0; r < 16; r++) {
        const row = GAVEL_SPRITE_16[r];
        for (let c = 0; c < 16; c++) {
          const ch = row[c];
          if (ch === '.') continue;
          const color =
            ch === 'O'
              ? '#09090B'
              : ch === 'M'
              ? '#FF1E6E'
              : ch === 'W'
              ? '#FFFFFF'
              : '#FACC15';
          drawRect(
            gavelBaseX + c * gavelScale,
            gavelY + r * gavelScale,
            gavelScale,
            gavelScale,
            color
          );
        }
      }

      // Tajo/sellado magenta en el impacto
      if (!prefersReducedMotion && elapsed >= impactT && elapsed < impactT + 0.08) {
        drawRect(0, 0, W, H, 'rgba(255, 30, 110, 0.32)');
      }

      // Chispas tras el impacto
      if (!prefersReducedMotion && elapsed >= impactT) {
        for (const s of sparks) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 120 * dt;
          drawRect(s.x, s.y, s.size, s.size, s.color);
        }
      }

      // Sello "OUT" pixelado rojo/magenta tras el golpe
      if (elapsed >= impactT + 0.15) {
        drawRect(18, 126, 124, 22, '#000000');
        drawRect(18, 126, 124, 2, '#FF1E6E');
        drawRect(18, 146, 124, 2, '#FF1E6E');
        drawRect(18, 126, 2, 22, '#FF1E6E');
        drawRect(140, 126, 2, 22, '#FF1E6E');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VEREDICTO: FUERA', W / 2, 140);
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    rafId = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(rafId);
  }, [playerEmoji, playerColor]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Expulsado de la sala"
      className="fixed inset-0 z-[70] flex h-[100dvh] w-full flex-col items-center justify-between overflow-hidden bg-black px-4 py-6 text-white select-none"
    >
      <div
        className="pointer-events-none fixed inset-0 dr-scanlines opacity-60"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 dr-halftone opacity-30"
        aria-hidden="true"
      />

      {/* Cinta superior estilo juicio Danganronpa */}
      <div className="relative z-10 w-full overflow-hidden border-y-2 border-[#FF1E6E] bg-black py-1 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#FF1E6E]">
        <div className="dr-tape-track">
          <span className="px-4">
            EXPULSADO · JUICIO DE SALA {roomCode || ''} · PENALIZACIÓN ·
          </span>
          <span className="px-4">
            EXPULSADO · JUICIO DE SALA {roomCode || ''} · PENALIZACIÓN ·
          </span>
          <span className="px-4">
            EXPULSADO · JUICIO DE SALA {roomCode || ''} · PENALIZACIÓN ·
          </span>
          <span className="px-4">
            EXPULSADO · JUICIO DE SALA {roomCode || ''} · PENALIZACIÓN ·
          </span>
        </div>
      </div>

      <header className="relative z-10 flex w-full max-w-lg flex-col items-center gap-3 pt-2 dr-slam-in">
        <div className="w-full px-2 flex justify-center">
          <svg
            viewBox={`-1 -1 ${titleRects.width + 3} ${titleRects.height + 3}`}
            shapeRendering="crispEdges"
            className="h-auto w-full max-w-[340px] sm:max-w-[420px]"
            role="img"
            aria-label="EXPULSADO"
          >
            {titleRects.rects.map((r) => (
              <rect
                key={`s-${r.key}`}
                x={r.x + 1}
                y={r.y + 1}
                width={1}
                height={1}
                fill="#FF1E6E"
              />
            ))}
            {titleRects.rects.map((r) => (
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
        <p className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-200 text-center">
          {playerName} · El anfitrión te ha expulsado de la sala
        </p>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center my-2">
        <div className="border-2 border-[#FF1E6E] bg-black p-1 shadow-[6px_6px_0_0_#FF1E6E]">
          <canvas
            ref={canvasRef}
            width={160}
            height={160}
            className="block h-[220px] w-[220px] sm:h-[260px] sm:w-[260px] pixelated"
          />
        </div>
      </main>

      <footer className="relative z-10 w-full max-w-md pb-safe">
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-[48px] w-full items-center justify-center border-2 border-white bg-white px-4 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-black hover:bg-zinc-200"
        >
          Volver al inicio
        </button>
      </footer>
    </div>
  );
};
