import React, { useEffect, useState } from 'react';
import { Check, Palette, Plus, Shuffle } from 'lucide-react';
import {
  getEquippedCosmetics,
  subscribePreferences,
} from '../lib/preferences';
import { subscribeSecretSandbox } from '../lib/soloSandbox';
import {
  extractEmojiGraphemes,
  sanitizeHexColor,
  sanitizePlayerEmoji,
} from '../lib/storage';
import {
  ACCENT_COLORS,
  EMOJI_PALETTE,
  PlayerCosmetics,
  PlayerProfile,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCosmeticName } from './PlayerCosmeticName';

interface ProfileCustomizerProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  nameError?: string | null;
  defaultExpanded?: boolean;
}

const EXTRA_EMOJIS: readonly string[] = [
  '😎', '🤠', '🥳', '🤯', '🥶', '😈', '🤡', '💀',
  '👾', '🤖', '🎃', '🧚', '🧛', '🧟', '🧞', '🕵️',
  '🥷', '🧑‍🚀', '🧙', '🦸', '🦁', '🐯', '🐺', '🦝',
  '🐼', '🐸', '🐙', '🦈', '🦖', '🐉', '🦅', '🦉',
  '🐝', '🦋', '🦂', '🐢', '🐬', '🦩', '🦄', '🐳',
  '🍕', '🍔', '🌮', '🍣', '🍩', '🌶️', '🍉', '☕',
  '⚡', '🔥', '❄️', '🌈', '⭐', '💎', '👑', '🎯',
  '🚀', '🛸', '💣', '🧲', '🔮', '🎮', '🏆', '🎭',
];

export const ProfileCustomizer: React.FC<ProfileCustomizerProps> = ({
  profile,
  onChange,
  nameError,
  defaultExpanded = false,
}) => {
  const [showPicker, setShowPicker] = useState(defaultExpanded);
  const [showMoreEmojis, setShowMoreEmojis] = useState(false);
  const [emojiDraft, setEmojiDraft] = useState(() =>
    sanitizePlayerEmoji(profile.emoji)
  );
  const [hexDraft, setHexDraft] = useState(() =>
    sanitizeHexColor(profile.color)
  );
  const [equippedCosmetics, setEquippedCosmetics] = useState<PlayerCosmetics>(
    () => getEquippedCosmetics()
  );

  const safeEmoji = sanitizePlayerEmoji(profile.emoji);
  const safeColor = sanitizeHexColor(profile.color);
  const isPresetColor = ACCENT_COLORS.some(
    (c) => c.hex.toUpperCase() === safeColor
  );

  useEffect(() => {
    setEmojiDraft(safeEmoji);
  }, [safeEmoji]);

  useEffect(() => {
    setHexDraft(safeColor);
  }, [safeColor]);

  useEffect(() => {
    setEquippedCosmetics(getEquippedCosmetics());
    const unsubPrefs = subscribePreferences(() => {
      setEquippedCosmetics(getEquippedCosmetics());
    });
    const unsubSandbox = subscribeSecretSandbox(() => {
      setEquippedCosmetics(getEquippedCosmetics());
    });
    return () => {
      unsubPrefs();
      unsubSandbox();
    };
  }, []);

  const handleCustomEmojiChange = (rawValue: string) => {
    setEmojiDraft(rawValue);
    const graphemes = extractEmojiGraphemes(rawValue);
    if (graphemes.length === 0) return;
    const chosen =
      graphemes.length > 1 && graphemes[0] === safeEmoji
        ? graphemes[graphemes.length - 1]
        : graphemes[0];
    const sanitized = sanitizePlayerEmoji(chosen, safeEmoji);
    setEmojiDraft(sanitized);
    onChange({
      ...profile,
      emoji: sanitized,
    });
  };

  const handleRandomEmoji = () => {
    const pool = Array.from(new Set([...EMOJI_PALETTE, ...EXTRA_EMOJIS]));
    const candidates = pool.filter((e) => e !== safeEmoji);
    const picked =
      candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
    onChange({ ...profile, emoji: picked });
  };

  const handleHexInputChange = (value: string) => {
    const withHash = value.startsWith('#') ? value : `#${value}`;
    const cleaned = `#${withHash.slice(1).replace(/[^0-9a-fA-F]/g, '').slice(0, 6)}`;
    setHexDraft(cleaned);
    if (/^#[0-9a-f]{6}$/i.test(cleaned)) {
      onChange({ ...profile, color: cleaned.toUpperCase() });
    }
  };

  const visibleEmojis = showMoreEmojis
    ? Array.from(new Set([...EMOJI_PALETTE, ...EXTRA_EMOJIS]))
    : EMOJI_PALETTE.slice(0, 14);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="player-name-input"
            className="text-sm font-semibold text-slate-900"
          >
            Tu nombre
          </label>
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="min-h-[32px] text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
          >
            {showPicker ? 'Cerrar estilo' : 'Personalizar avatar'}
          </button>
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            aria-expanded={showPicker}
            aria-label="Cambiar icono y color"
            title="Toca para elegir icono y color"
            className="shrink-0 rounded-full p-0.5 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <PlayerAvatar
              emoji={safeEmoji}
              color={safeColor}
              size="md"
              name={profile.name || 'Jugador'}
              avatarEffectId={equippedCosmetics.avatarEffectId}
            />
          </button>

          <input
            id="player-name-input"
            type="text"
            maxLength={12}
            autoComplete="nickname"
            placeholder="¿Cómo te llamas?"
            value={profile.name}
            onChange={(e) =>
              onChange({ ...profile, name: e.target.value.slice(0, 12) })
            }
            className={`h-12 w-full flex-1 rounded-xl border bg-white px-4 text-base font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
              nameError
                ? 'border-rose-500 focus:ring-rose-500/20'
                : 'border-slate-300 focus:border-emerald-600 focus:ring-emerald-600/20'
            }`}
          />
        </div>

        {equippedCosmetics.nameEffectId && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-1.5">
            <span className="text-[11px] font-medium text-slate-500 shrink-0">
              Color de texto:
            </span>
            <PlayerCosmeticName
              name={profile.name.trim() || 'Jugador'}
              cosmetics={equippedCosmetics}
              className="text-xs font-semibold text-slate-900"
            />
          </div>
        )}

        {nameError && (
          <p className="mt-1.5 text-xs font-semibold text-rose-600" role="alert">
            {nameError}
          </p>
        )}
      </div>

      {showPicker && (
        <div className="space-y-3.5 border-t border-slate-100 pt-3.5">
          {/* Emoji */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Icono o emoji propio
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRandomEmoji}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Shuffle className="h-3 w-3" aria-hidden="true" />
                  <span>Azar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMoreEmojis((v) => !v)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus
                    className={`h-3 w-3 transition-transform ${
                      showMoreEmojis ? 'rotate-45' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span>{showMoreEmojis ? 'Menos' : 'Más'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex min-w-0 flex-1 items-center">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  aria-label="Escribe o pega cualquier emoji"
                  placeholder="O escribe cualquier emoji de tu teclado..."
                  value={emojiDraft}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => setEmojiDraft(safeEmoji)}
                  onChange={(e) => handleCustomEmojiChange(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-10 text-sm font-medium text-slate-900 placeholder:text-xs placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 text-lg leading-none"
                >
                  {safeEmoji}
                </span>
              </div>
            </div>

            <div
              className="grid max-h-40 grid-cols-7 gap-1.5 overflow-y-auto sm:grid-cols-8"
              role="radiogroup"
              aria-label="Icono de jugador"
            >
              {visibleEmojis.map((emoji) => {
                const selected = safeEmoji === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Icono ${emoji}`}
                    onClick={() => onChange({ ...profile, emoji })}
                    className={`flex h-10 items-center justify-center rounded-xl text-lg transition-colors ${
                      selected
                        ? 'bg-emerald-600/15 ring-2 ring-emerald-600'
                        : 'bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Color</span>
              <div className="flex items-center gap-1.5">
                <label className="relative flex h-8 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Otro</span>
                  <input
                    type="color"
                    aria-label="Selector libre de color"
                    value={safeColor}
                    onChange={(e) =>
                      onChange({
                        ...profile,
                        color: sanitizeHexColor(e.target.value, safeColor),
                      })
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
                <input
                  type="text"
                  aria-label="Código hexadecimal de color"
                  maxLength={7}
                  value={hexDraft}
                  onChange={(e) => handleHexInputChange(e.target.value)}
                  onBlur={() => setHexDraft(safeColor)}
                  className="h-8 w-[76px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-center font-mono text-[11px] font-semibold uppercase text-slate-700 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-2"
              role="radiogroup"
              aria-label="Colores rápidos"
            >
              {ACCENT_COLORS.map((accent) => {
                const selected = safeColor === accent.hex.toUpperCase();
                return (
                  <button
                    key={accent.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Color ${accent.label}`}
                    onClick={() => onChange({ ...profile, color: accent.hex })}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95 ${
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

              <label
                title="Elegir cualquier color"
                className={`relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full transition-transform active:scale-95 ${
                  !isPresetColor ? 'ring-2 ring-slate-900 ring-offset-2' : ''
                }`}
                style={{
                  background: isPresetColor
                    ? 'conic-gradient(#EF4444, #F59E0B, #10B981, #06B6D4, #3B82F6, #EC4899, #EF4444)'
                    : safeColor,
                }}
              >
                <input
                  type="color"
                  aria-label="Color personalizado"
                  value={safeColor}
                  onChange={(e) =>
                    onChange({
                      ...profile,
                      color: sanitizeHexColor(e.target.value, safeColor),
                    })
                  }
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                {!isPresetColor && (
                  <Check
                    className="pointer-events-none h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                    aria-hidden="true"
                  />
                )}
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
