import React from 'react';
import {
  getNameEffectDef,
  sanitizePlatinumNameCustomization,
} from '../lib/cosmetics';
import { PlatinumSpeed, PlayerCosmetics } from '../types/game';

interface PlayerCosmeticNameProps {
  name: string;
  cosmetics?: PlayerCosmetics;
  eliminated?: boolean;
  suffix?: React.ReactNode;
  className?: string;
  compactTitle?: boolean;
}

const SPEED_SECONDS: Record<PlatinumSpeed, string> = {
  slow: '4.2s',
  normal: '2.5s',
  fast: '1.35s',
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(6, 182, 212, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const PlayerCosmeticName: React.FC<PlayerCosmeticNameProps> = ({
  name,
  cosmetics,
  eliminated = false,
  suffix,
  className = 'text-sm font-semibold text-slate-900',
}) => {
  const nameEffectDef = !eliminated ? getNameEffectDef(cosmetics?.nameEffectId) : null;
  const isPlatinum = nameEffectDef?.id === 'name_platino';

  let platinumClass = '';
  let platinumStyle: React.CSSProperties | undefined;

  if (isPlatinum) {
    const cfg = sanitizePlatinumNameCustomization(cosmetics?.platinumName);
    const [c1, c2, c3] = cfg.colors;
    const dur = SPEED_SECONDS[cfg.speed];
    const glowAlpha = Math.max(0.12, Math.min(0.95, cfg.glowIntensity / 100));
    const glowBlur = Math.round(3 + (cfg.glowIntensity / 100) * 12);
    const glowRgba = hexToRgba(cfg.glowColor, glowAlpha);

    let backgroundImage: string | undefined;
    let backgroundSize: string | undefined;
    let solidColor: string | undefined;

    if (cfg.fillMode === 'solid') {
      if (cfg.animation === 'shimmer' || cfg.animation === 'wave') {
        backgroundImage = `linear-gradient(${cfg.angleDeg}deg, ${c1} 0%, ${c1} 38%, #ffffff 50%, ${c1} 62%, ${c1} 100%)`;
        backgroundSize = '260% 100%';
      } else {
        solidColor = c1;
      }
    } else if (cfg.fillMode === 'gradient2') {
      backgroundImage = `linear-gradient(${cfg.angleDeg}deg, ${c1}, ${c2}, ${c1})`;
      backgroundSize = '220% 220%';
    } else if (cfg.fillMode === 'gradient3') {
      backgroundImage = `linear-gradient(${cfg.angleDeg}deg, ${c1}, ${c2}, ${c3}, ${c1})`;
      backgroundSize = '240% 240%';
    } else {
      backgroundImage = `linear-gradient(${cfg.angleDeg}deg, ${c1}, ${c2}, ${c3}, ${c1}, ${c2})`;
      backgroundSize = '280% 280%';
    }

    const animClass =
      cfg.animation !== 'none' ? `baliza-plat-anim-${cfg.animation}` : '';
    platinumClass = `baliza-name-platinum ${animClass}`;

    platinumStyle = {
      ...(solidColor ? { color: solidColor } : {}),
      ...(backgroundImage
        ? {
            backgroundImage,
            backgroundSize,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }
        : {}),
      fontStyle: cfg.italic ? 'italic' : 'normal',
      textTransform: cfg.uppercase ? 'uppercase' : 'none',
      letterSpacing: cfg.letterSpacing === 'wide' ? '0.07em' : 'normal',
      fontWeight:
        cfg.weight === 'semibold' ? 600 : cfg.weight === 'bold' ? 700 : 900,
      ...(cfg.glowEnabled && cfg.glowIntensity > 0
        ? {
            filter: `drop-shadow(0 0 ${glowBlur}px ${glowRgba})`,
          }
        : {}),
      ['--plat-dur' as string]: dur,
      ['--plat-glow' as string]: glowRgba,
      ['--plat-c1' as string]: c1,
      ['--plat-c2' as string]: c2,
      ['--plat-c3' as string]: c3,
    };
  }

  const cleanBaseClass = nameEffectDef
    ? className
        .replace(/text-(?:slate|zinc|gray|neutral|stone)-\d+/g, '')
        .replace(/\btext-(?:white|black)\b/g, '')
        .trim()
    : className;

  return (
    <div className="min-w-0 flex flex-wrap items-center gap-1.5">
      <span
        className={`truncate ${
          eliminated
            ? 'line-through text-slate-400 text-sm font-semibold'
            : nameEffectDef
            ? `${cleanBaseClass} ${isPlatinum ? platinumClass : nameEffectDef.className}`
            : className
        }`}
        style={!eliminated && isPlatinum ? platinumStyle : undefined}
      >
        {name}
      </span>
      {suffix}
    </div>
  );
};
