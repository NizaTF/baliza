import React, { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  ACCENT_COLORS,
  EMOJI_PALETTE,
  PlayerProfile,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';

interface ProfileCustomizerProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  nameError?: string | null;
  defaultExpanded?: boolean;
}

export const ProfileCustomizer: React.FC<ProfileCustomizerProps> = ({
  profile,
  onChange,
  nameError,
  defaultExpanded = false,
}) => {
  const [showPicker, setShowPicker] = useState(defaultExpanded);

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="player-name-input"
          className="block text-sm font-semibold text-slate-900"
        >
          Tu nombre
        </label>

        <div className="mt-1.5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            aria-expanded={showPicker}
            aria-label="Cambiar icono y color"
            title="Cambiar icono y color"
            className="group relative flex items-center gap-1 rounded-full p-0.5 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <PlayerAvatar
              emoji={profile.emoji}
              color={profile.color}
              size="md"
              name={profile.name || 'Jugador'}
            />
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 group-hover:text-slate-800">
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showPicker ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </span>
          </button>

          <input
            id="player-name-input"
            type="text"
            maxLength={12}
            autoComplete="nickname"
            placeholder="Escribe tu nombre..."
            value={profile.name}
            onChange={(e) =>
              onChange({ ...profile, name: e.target.value.slice(0, 12) })
            }
            className={`h-11 w-full flex-1 rounded-xl border bg-white px-3.5 text-base font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
              nameError
                ? 'border-rose-500 focus:ring-rose-500/20'
                : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-600/20'
            }`}
          />
        </div>

        {nameError && (
          <p className="mt-1.5 text-xs font-semibold text-rose-600" role="alert">
            {nameError}
          </p>
        )}
      </div>

      {showPicker && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <div
            className="grid grid-cols-6 gap-1.5 sm:grid-cols-8"
            role="radiogroup"
            aria-label="Icono de jugador"
          >
            {EMOJI_PALETTE.slice(0, 16).map((emoji) => {
              const selected = profile.emoji === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Icono ${emoji}`}
                  onClick={() => onChange({ ...profile, emoji })}
                  className={`flex h-10 items-center justify-center rounded-lg text-lg transition-colors ${
                    selected
                      ? 'bg-emerald-600/15 ring-2 ring-emerald-600'
                      : 'bg-white hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center gap-2 pt-1 border-t border-slate-200"
            role="radiogroup"
            aria-label="Color"
          >
            <span className="text-xs font-medium text-slate-500 mr-1">
              Color:
            </span>
            {ACCENT_COLORS.map((accent) => {
              const selected = profile.color === accent.hex;
              return (
                <button
                  key={accent.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Color ${accent.label}`}
                  onClick={() => onChange({ ...profile, color: accent.hex })}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-95 ${
                    selected ? 'ring-2 ring-slate-900 ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: accent.hex }}
                >
                  {selected && (
                    <Check className="h-4 w-4 text-white" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
