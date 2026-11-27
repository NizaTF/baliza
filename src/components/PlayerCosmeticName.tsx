import React from 'react';
import { getNameEffectDef } from '../lib/cosmetics';
import { PlayerCosmetics } from '../types/game';

interface PlayerCosmeticNameProps {
  name: string;
  cosmetics?: PlayerCosmetics;
  eliminated?: boolean;
  suffix?: React.ReactNode;
  className?: string;
  compactTitle?: boolean;
}

export const PlayerCosmeticName: React.FC<PlayerCosmeticNameProps> = ({
  name,
  cosmetics,
  eliminated = false,
  suffix,
  className = 'text-sm font-semibold text-slate-900',
}) => {
  const nameEffectDef = !eliminated ? getNameEffectDef(cosmetics?.nameEffectId) : null;

  return (
    <div className="min-w-0 flex flex-wrap items-center gap-1.5">
      <span
        className={`truncate ${
          eliminated
            ? 'line-through text-slate-400 text-sm font-semibold'
            : nameEffectDef
            ? `${className.replace(/text-slate-\d+/g, '')} ${nameEffectDef.className}`
            : className
        }`}
      >
        {name}
      </span>
      {suffix}
    </div>
  );
};
