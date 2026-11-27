import React from 'react';
import {
  getAvatarEffectDef,
  sanitizePlatinumAvatarCustomization,
} from '../lib/cosmetics';
import { PlatinumAvatarCustomization, PlatinumSpeed } from '../types/game';
import { PixelSkull } from './PixelSkull';

interface PlayerAvatarProps {
  emoji: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string;
  eliminated?: boolean;
  avatarEffectId?: string;
  platinumAvatar?: PlatinumAvatarCustomization;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-9 w-9 text-lg rounded-full',
  md: 'h-11 w-11 text-xl rounded-full',
  lg: 'h-14 w-14 text-2xl rounded-full',
};

const SKULL_SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const SPEED_DURATIONS: Record<PlatinumSpeed, string> = {
  slow: '5.5s',
  normal: '3.2s',
  fast: '1.5s',
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(245, 158, 11, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  emoji,
  color,
  size = 'md',
  name,
  eliminated = false,
  avatarEffectId,
  platinumAvatar,
}) => {
  if (eliminated) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border-2 border-rose-500 bg-slate-900 select-none ${SIZE_CLASSES[size]}`}
        aria-label={
          name ? `Avatar eliminado de ${name}` : 'Jugador eliminado'
        }
      >
        <PixelSkull className={SKULL_SIZE_CLASSES[size]} />
      </div>
    );
  }

  const avatarEffect = getAvatarEffectDef(avatarEffectId);
  const effectId = avatarEffect?.id;
  const platCfg =
    effectId === 'avatar_platino'
      ? sanitizePlatinumAvatarCustomization(platinumAvatar)
      : null;

  const renderPresetEffectLayers = () => {
    if (!effectId || effectId === 'avatar_platino') return null;

    switch (effectId) {
      case 'avatar_tormenta':
        return (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[3px] rounded-full baliza-spin"
            style={{
              background:
                'conic-gradient(from 0deg, #7c3aed, #4f46e5, #e879f9, rgba(124,58,237,0.12), #7c3aed)',
              boxShadow: '0 0 12px rgba(124, 58, 237, 0.55)',
              ['--baliza-spin-dur' as string]: '2.8s',
            }}
          />
        );
      case 'avatar_inmune':
        return (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[4px] rounded-full border-2 border-dashed border-cyan-400 baliza-spin"
              style={{
                boxShadow: '0 0 10px rgba(6, 182, 212, 0.45)',
                ['--baliza-spin-dur' as string]: '6s',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[1px] rounded-full border border-emerald-400/70"
            />
          </>
        );
      case 'avatar_baliza':
        return (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[2px] rounded-full border-2 border-emerald-400 baliza-ping-wave"
              style={{ ['--baliza-spin-dur' as string]: '1.9s' }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[2px] rounded-full border border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
            />
          </>
        );
      case 'avatar_sonar':
        return (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[3px] rounded-full border border-cyan-400/80 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 rounded-full baliza-spin"
              style={{
                background:
                  'conic-gradient(from 0deg, rgba(34,211,238,0.48) 0deg 68deg, transparent 82deg 360deg)',
                ['--baliza-spin-dur' as string]: '2.4s',
              }}
            />
          </>
        );
      case 'avatar_intocable':
        return (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[3px] rounded-full border-2 border-emerald-400/85"
            style={{
              boxShadow:
                '0 0 0 2px rgba(110, 231, 183, 0.35), 0 0 14px rgba(16, 185, 129, 0.6)',
            }}
          />
        );
      case 'avatar_brujula':
        return (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[3px] rounded-full border border-amber-500/75"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[5px] rounded-full baliza-spin"
              style={{ ['--baliza-spin-dur' as string]: '3.8s' }}
            >
              <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
            </span>
          </>
        );
      case 'avatar_sabueso':
        return (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[4px] rounded-full baliza-spin"
            style={{ ['--baliza-spin-dur' as string]: '5.2s' }}
          >
            <span className="absolute inset-0 rounded-full border border-orange-500/50" />
            <span className="absolute left-1/2 -top-0.5 h-2 w-0.5 -translate-x-1/2 bg-orange-500" />
            <span className="absolute left-1/2 -bottom-0.5 h-2 w-0.5 -translate-x-1/2 bg-orange-500" />
            <span className="absolute top-1/2 -left-0.5 h-0.5 w-2 -translate-y-1/2 bg-amber-400" />
            <span className="absolute top-1/2 -right-0.5 h-0.5 w-2 -translate-y-1/2 bg-amber-400" />
          </span>
        );
      case 'avatar_corona':
        return (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[4px] rounded-full border-2 border-dashed border-amber-400 baliza-spin"
              style={{
                boxShadow: '0 0 10px rgba(234, 179, 8, 0.5)',
                ['--baliza-spin-dur' as string]: '7s',
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[1px] rounded-full border-2 border-dotted border-purple-500 baliza-spin-rev"
              style={{ ['--baliza-spin-dur' as string]: '4.5s' }}
            />
          </>
        );
      case 'avatar_maraton':
        return (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[3px] rounded-full border-[2.5px] border-t-sky-400 border-b-blue-600 border-l-transparent border-r-transparent baliza-spark-spin"
            style={{
              filter: 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.75))',
            }}
          />
        );
      default:
        return null;
    }
  };

  const renderPlatinumLayers = () => {
    if (!platCfg) return null;
    const dur = SPEED_DURATIONS[platCfg.speed];
    const spinCls = platCfg.reverse ? 'baliza-spin-rev' : 'baliza-spin';
    const counterSpinCls = platCfg.reverse ? 'baliza-spin' : 'baliza-spin-rev';
    const glowAlpha = Math.max(0, Math.min(0.95, platCfg.glowIntensity / 100));
    const glowBlur = Math.round(4 + (platCfg.glowIntensity / 100) * 16);
    const glowShadow =
      platCfg.glowIntensity > 0
        ? `0 0 ${glowBlur}px ${hexToRgba(platCfg.glowColor, glowAlpha)}`
        : 'none';

    return (
      <>
        {platCfg.pattern === 'halo' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[3px] rounded-full"
            style={{
              borderWidth: platCfg.ringWidth,
              borderStyle: platCfg.ringStyle,
              borderColor: platCfg.primaryColor,
              boxShadow: `0 0 0 2px ${hexToRgba(platCfg.secondaryColor, 0.45)}, ${glowShadow}`,
            }}
          />
        )}

        {platCfg.pattern === 'vortex' && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-[4px] rounded-full ${spinCls}`}
            style={{
              background: `conic-gradient(from 0deg, ${platCfg.primaryColor}, ${platCfg.secondaryColor}, transparent 270deg, ${platCfg.primaryColor})`,
              boxShadow: glowShadow,
              ['--baliza-spin-dur' as string]: dur,
            }}
          />
        )}

        {platCfg.pattern === 'radar' && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[3px] rounded-full"
              style={{
                borderWidth: platCfg.ringWidth,
                borderStyle: platCfg.ringStyle,
                borderColor: platCfg.primaryColor,
                boxShadow: glowShadow,
              }}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 z-10 rounded-full ${spinCls}`}
              style={{
                background: `conic-gradient(from 0deg, ${hexToRgba(
                  platCfg.secondaryColor,
                  0.52
                )} 0deg 72deg, transparent 86deg 360deg)`,
                ['--baliza-spin-dur' as string]: dur,
              }}
            />
          </>
        )}

        {platCfg.pattern === 'orbit' && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[3px] rounded-full"
              style={{
                borderWidth: platCfg.ringWidth,
                borderStyle: platCfg.ringStyle,
                borderColor: hexToRgba(platCfg.primaryColor, 0.78),
                boxShadow: glowShadow,
              }}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-[5px] rounded-full ${spinCls}`}
              style={{ ['--baliza-spin-dur' as string]: dur }}
            >
              <span
                className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                style={{
                  backgroundColor: platCfg.secondaryColor,
                  boxShadow: `0 0 8px ${platCfg.secondaryColor}`,
                }}
              />
            </span>
          </>
        )}

        {platCfg.pattern === 'pulse_wave' && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[2px] rounded-full baliza-ping-wave"
              style={{
                borderWidth: platCfg.ringWidth,
                borderStyle: platCfg.ringStyle,
                borderColor: platCfg.secondaryColor,
                ['--baliza-spin-dur' as string]: dur,
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-[2px] rounded-full"
              style={{
                borderWidth: Math.max(2, platCfg.ringWidth - 1),
                borderStyle: 'solid',
                borderColor: platCfg.primaryColor,
                boxShadow: glowShadow,
              }}
            />
          </>
        )}

        {platCfg.pattern === 'reticle' && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-[4px] rounded-full ${spinCls}`}
            style={{
              ['--baliza-spin-dur' as string]: dur,
              filter:
                platCfg.glowIntensity > 0
                  ? `drop-shadow(0 0 ${Math.round(glowBlur * 0.6)}px ${hexToRgba(
                      platCfg.glowColor,
                      glowAlpha
                    )})`
                  : undefined,
            }}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{
                borderWidth: Math.max(1, platCfg.ringWidth - 1),
                borderStyle: platCfg.ringStyle,
                borderColor: hexToRgba(platCfg.primaryColor, 0.65),
              }}
            />
            <span
              className="absolute left-1/2 -top-0.5 h-2 w-0.5 -translate-x-1/2"
              style={{ backgroundColor: platCfg.secondaryColor }}
            />
            <span
              className="absolute left-1/2 -bottom-0.5 h-2 w-0.5 -translate-x-1/2"
              style={{ backgroundColor: platCfg.secondaryColor }}
            />
            <span
              className="absolute top-1/2 -left-0.5 h-0.5 w-2 -translate-y-1/2"
              style={{ backgroundColor: platCfg.primaryColor }}
            />
            <span
              className="absolute top-1/2 -right-0.5 h-0.5 w-2 -translate-y-1/2"
              style={{ backgroundColor: platCfg.primaryColor }}
            />
          </span>
        )}

        {platCfg.pattern === 'dual_spin' && (
          <>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-[4px] rounded-full ${spinCls}`}
              style={{
                borderWidth: platCfg.ringWidth,
                borderStyle: platCfg.ringStyle,
                borderColor: platCfg.primaryColor,
                boxShadow: glowShadow,
                ['--baliza-spin-dur' as string]: dur,
              }}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-[1px] rounded-full ${counterSpinCls}`}
              style={{
                borderWidth: Math.max(2, platCfg.ringWidth - 1),
                borderStyle: 'dotted',
                borderColor: platCfg.secondaryColor,
                ['--baliza-spin-dur' as string]: dur,
              }}
            />
          </>
        )}

        {platCfg.badge && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1.5 -right-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-white/95 text-[10px] leading-none shadow-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
          >
            {platCfg.badge}
          </span>
        )}
      </>
    );
  };

  const wrapperFloatClass =
    effectId === 'avatar_intocable' ? 'baliza-float-soft' : '';

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center select-none ${SIZE_CLASSES[size]} ${wrapperFloatClass}`}
      aria-label={name ? `Avatar de ${name}` : 'Avatar de jugador'}
    >
      {renderPresetEffectLayers()}
      {renderPlatinumLayers()}
      <div
        className="relative z-[1] flex h-full w-full items-center justify-center rounded-full border-2 bg-slate-50"
        style={{ borderColor: platCfg ? platCfg.primaryColor : color }}
      >
        <span role="img" aria-hidden="true">
          {emoji}
        </span>
      </div>
    </div>
  );
};
