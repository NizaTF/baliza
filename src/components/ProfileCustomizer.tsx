import React from 'react';
import { Check } from 'lucide-react';
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
}

export const ProfileCustomizer: React.FC<ProfileCustomizerProps> = ({
  profile,
  onChange,
  nameError,
}) => {
  const nameLength = profile.name.trim().length;

  return (
    <div className="space-y-6">
      {/* Vista previa del perfil */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-5">
        <PlayerAvatar
          emoji={profile.emoji}
          color={profile.color}
          size="lg"
          name={profile.name || 'Jugador'}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">Vista previa</p>
          <p className="font-display truncate text-xl font-bold text-slate-900">
            {profile.name.trim() || 'Tu nombre'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Se guarda automáticamente en este dispositivo
          </p>
        </div>
      </div>

      {/* Campo Tu nombre */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor="player-name-input"
            className="block text-sm font-semibold text-slate-900"
          >
            Tu nombre
          </label>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {nameLength}/12
          </span>
        </div>
        <input
          id="player-name-input"
          type="text"
          maxLength={12}
          autoComplete="nickname"
          placeholder="Ej. Alex, Nico, Marta..."
          value={profile.name}
          onChange={(e) =>
            onChange({ ...profile, name: e.target.value.slice(0, 12) })
          }
          className={`mt-2 block w-full min-h-[48px] rounded-xl border bg-white px-4 py-2.5 text-base font-medium text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 ${
            nameError
              ? 'border-rose-500 focus:ring-rose-500/20'
              : 'border-slate-300 focus:border-emerald-700 focus:ring-emerald-700/20'
          }`}
        />
        {nameError ? (
          <p className="mt-1.5 text-xs font-medium text-rose-700" role="alert">
            {nameError}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            Entre 2 y 12 caracteres. Sin registro obligatorio.
          </p>
        )}
      </div>

      {/* Paleta de 24 emojis */}
      <div>
        <span className="block text-sm font-semibold text-slate-900">
          Elige tu emoji
        </span>
        <div
          className="mt-2.5 grid grid-cols-6 gap-2 sm:grid-cols-8"
          role="radiogroup"
          aria-label="Selector de emoji"
        >
          {EMOJI_PALETTE.map((emoji) => {
            const selected = profile.emoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Emoji ${emoji}`}
                onClick={() => onChange({ ...profile, emoji })}
                className={`flex min-h-[44px] items-center justify-center rounded-xl border text-xl transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                  selected
                    ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700/25'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>

      {/* 6 colores de acento */}
      <div>
        <span className="block text-sm font-semibold text-slate-900">
          Color de acento
        </span>
        <div
          className="mt-2.5 grid grid-cols-6 gap-2.5"
          role="radiogroup"
          aria-label="Color de borde del avatar"
        >
          {ACCENT_COLORS.map((accent) => {
            const selected = profile.color === accent.hex;
            return (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Color ${accent.label}`}
                title={accent.label}
                onClick={() => onChange({ ...profile, color: accent.hex })}
                className={`flex min-h-[44px] items-center justify-center rounded-xl border transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  selected
                    ? 'border-slate-900 ring-2 ring-slate-900/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                style={{ backgroundColor: accent.hex }}
              >
                {selected && (
                  <Check className="h-5 w-5 text-white drop-shadow-sm" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
