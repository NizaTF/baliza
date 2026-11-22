import React from 'react';
import { PixelSkull } from './PixelSkull';

interface PlayerAvatarProps {
  emoji: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string;
  eliminated?: boolean;
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

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  emoji,
  color,
  size = 'md',
  name,
  eliminated = false,
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

  return (
    <div
      className={`flex shrink-0 items-center justify-center border-2 bg-slate-50 select-none ${SIZE_CLASSES[size]}`}
      style={{ borderColor: color }}
      aria-label={name ? `Avatar de ${name}` : 'Avatar de jugador'}
    >
      <span role="img" aria-hidden="true">
        {emoji}
      </span>
    </div>
  );
};
