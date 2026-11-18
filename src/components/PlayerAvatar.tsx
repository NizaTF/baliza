import React from 'react';

interface PlayerAvatarProps {
  emoji: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-10 w-10 text-xl border-2',
  md: 'h-12 w-12 text-2xl border-[3px]',
  lg: 'h-16 w-16 text-3xl border-[3px]',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  emoji,
  color,
  size = 'md',
  name,
}) => {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-slate-100 select-none ${SIZE_CLASSES[size]}`}
      style={{ borderColor: color }}
      aria-label={name ? `Avatar de ${name}` : 'Avatar de jugador'}
    >
      <span role="img" aria-hidden="true">
        {emoji}
      </span>
    </div>
  );
};
