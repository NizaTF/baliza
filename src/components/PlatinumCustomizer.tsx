import React, { useEffect, useState } from 'react';
import { Check, Lock, RotateCcw, Shuffle, Sparkles, X } from 'lucide-react';
import {
  DEFAULT_PLATINUM_AVATAR,
  DEFAULT_PLATINUM_NAME,
  randomizePlatinumAvatarCustomization,
  randomizePlatinumNameCustomization,
  sanitizePlatinumAvatarCustomization,
  sanitizePlatinumNameCustomization,
} from '../lib/cosmetics';
import { sanitizeHexColor } from '../lib/storage';
import {
  PlatinumAvatarCustomization,
  PlatinumAvatarPattern,
  PlatinumNameAnimation,
  PlatinumNameCustomization,
  PlatinumNameFillMode,
  PlatinumRingStyle,
  PlatinumSpeed,
  PlayerProfile,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCosmeticName } from './PlayerCosmeticName';

export type PlatinumTab = 'name' | 'avatar';

interface PlatinumCustomizerProps {
  initialTab: PlatinumTab;
  profile: PlayerProfile;
  platinumName?: PlatinumNameCustomization;
  platinumAvatar?: PlatinumAvatarCustomization;
  unlocked: boolean;
  onChangePlatinumName: (next: PlatinumNameCustomization, equipToo: boolean) => void;
  onChangePlatinumAvatar: (next: PlatinumAvatarCustomization, equipToo: boolean) => void;
  onClose: () => void;
}

const FILL_MODE_OPTIONS: Array<{ id: PlatinumNameFillMode; label: string }> = [
  { id: 'solid', label: 'Sólido' },
  { id: 'gradient2', label: '2 colores' },
  { id: 'gradient3', label: '3 colores' },
  { id: 'prism', label: 'Prisma' },
];

const NAME_ANIM_OPTIONS: Array<{ id: PlatinumNameAnimation; label: string }> = [
  { id: 'none', label: 'Fija' },
  { id: 'shimmer', label: 'Flujo' },
  { id: 'wave', label: 'Destello' },
  { id: 'pulse', label: 'Latido' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'neon', label: 'Neón' },
];

const AVATAR_PATTERN_OPTIONS: Array<{ id: PlatinumAvatarPattern; label: string }> = [
  { id: 'halo', label: 'Halo' },
  { id: 'vortex', label: 'Vórtice' },
  { id: 'radar', label: 'Radar' },
  { id: 'orbit', label: 'Órbita' },
  { id: 'pulse_wave', label: 'Onda' },
  { id: 'reticle', label: 'Retícula' },
  { id: 'dual_spin', label: 'Doble giro' },
];

const RING_STYLE_OPTIONS: Array<{ id: PlatinumRingStyle; label: string }> = [
  { id: 'solid', label: 'Sólido' },
  { id: 'dashed', label: 'Trazos' },
  { id: 'dotted', label: 'Puntos' },
  { id: 'double', label: 'Doble' },
];

const SPEED_OPTIONS: Array<{ id: PlatinumSpeed; label: string }> = [
  { id: 'slow', label: 'Lenta' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Rápida' },
];

const BADGE_PRESETS = ['', '👑', '💎', '⚡', '🔥', '⭐', '✨', '🎯'];

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

const ColorField: React.FC<ColorFieldProps> = ({ label, value, onChange }) => {
  const safe = sanitizeHexColor(value);
  const [draft, setDraft] = useState(safe);

  useEffect(() => {
    setDraft(safe);
  }, [safe]);

  const handleHexDraft = (raw: string) => {
    const withHash = raw.startsWith('#') ? raw : `#${raw}`;
    const cleaned = `#${withHash.slice(1).replace(/[^0-9a-fA-F]/g, '').slice(0, 6)}`;
    setDraft(cleaned);
    if (/^#[0-9a-f]{6}$/i.test(cleaned)) {
      onChange(cleaned.toUpperCase());
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
      <span className="text-xs font-medium text-slate-600 truncate">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-lg border border-slate-300 shadow-2xs">
          <span
            className="block h-full w-full"
            style={{ backgroundColor: safe }}
          />
          <input
            type="color"
            aria-label={label}
            value={safe}
            onChange={(e) => onChange(sanitizeHexColor(e.target.value, safe))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <input
          type="text"
          aria-label={`Hex ${label}`}
          maxLength={7}
          value={draft}
          onChange={(e) => handleHexDraft(e.target.value)}
          onBlur={() => setDraft(safe)}
          className="h-7 w-[70px] rounded-md border border-slate-200 bg-white px-1.5 text-center font-mono text-[11px] font-semibold uppercase text-slate-700 focus:border-emerald-600 focus:outline-none"
        />
      </div>
    </div>
  );
};

export const PlatinumCustomizer: React.FC<PlatinumCustomizerProps> = ({
  initialTab,
  profile,
  platinumName,
  platinumAvatar,
  unlocked,
  onChangePlatinumName,
  onChangePlatinumAvatar,
  onClose,
}) => {
  const [tab, setTab] = useState<PlatinumTab>(initialTab);
  const [nameCfg, setNameCfg] = useState<PlatinumNameCustomization>(() =>
    sanitizePlatinumNameCustomization(platinumName)
  );
  const [avatarCfg, setAvatarCfg] = useState<PlatinumAvatarCustomization>(() =>
    sanitizePlatinumAvatarCustomization(platinumAvatar)
  );

  useEffect(() => {
    setNameCfg(sanitizePlatinumNameCustomization(platinumName));
  }, [platinumName]);

  useEffect(() => {
    setAvatarCfg(sanitizePlatinumAvatarCustomization(platinumAvatar));
  }, [platinumAvatar]);

  const commitName = (next: PlatinumNameCustomization, equipToo = unlocked) => {
    const clean = sanitizePlatinumNameCustomization(next);
    setNameCfg(clean);
    onChangePlatinumName(clean, equipToo);
  };

  const commitAvatar = (next: PlatinumAvatarCustomization, equipToo = unlocked) => {
    const clean = sanitizePlatinumAvatarCustomization(next);
    setAvatarCfg(clean);
    onChangePlatinumAvatar(clean, equipToo);
  };

  const previewCosmetics = {
    nameEffectId: 'name_platino',
    avatarEffectId: 'avatar_platino',
    platinumName: nameCfg,
    platinumAvatar: avatarCfg,
  };

  const activeColorCount =
    nameCfg.fillMode === 'solid' ? 1 : nameCfg.fillMode === 'gradient2' ? 2 : 3;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudio Platino 100 % personalizable"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
                Estudio Platino · 100 % Personalizable
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Recompensa por completar los 20 logros de Baliza
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Estudio Platino"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Vista previa dual (fondo claro + fondo oscuro de mapa/ruleta) */}
        <div className="border-b border-slate-100 px-5 py-3.5 shrink-0 space-y-2.5">
          {!unlocked && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
              <span>
                Modo prueba: completa todos los logros para equiparlo en partidas reales.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <PlayerAvatar
                emoji={profile.emoji}
                color={profile.color}
                size="md"
                name={profile.name || 'Jugador'}
                avatarEffectId="avatar_platino"
                platinumAvatar={avatarCfg}
              />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-medium text-slate-500">
                  En sala
                </span>
                <PlayerCosmeticName
                  name={profile.name.trim() || 'Tu nombre'}
                  cosmetics={previewCosmetics}
                  className="text-sm font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5">
              <PlayerAvatar
                emoji={profile.emoji}
                color={profile.color}
                size="md"
                name={profile.name || 'Jugador'}
                avatarEffectId="avatar_platino"
                platinumAvatar={avatarCfg}
              />
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-medium text-slate-400">
                  En mapa / ruleta
                </span>
                <PlayerCosmeticName
                  name={profile.name.trim() || 'Tu nombre'}
                  cosmetics={previewCosmetics}
                  className="text-sm font-bold text-white"
                />
              </div>
            </div>
          </div>

          {/* Selector de pestaña + acciones rápidas */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Personalización Platino"
              className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 flex-1 min-w-[200px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'name'}
                onClick={() => setTab('name')}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'name'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Color de texto
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'avatar'}
                onClick={() => setTab('avatar')}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === 'avatar'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Efecto de icono
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (tab === 'name') {
                    commitName(randomizePlatinumNameCustomization());
                  } else {
                    commitAvatar(randomizePlatinumAvatarCustomization());
                  }
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Azar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (tab === 'name') {
                    commitName(DEFAULT_PLATINUM_NAME);
                  } else {
                    commitAvatar(DEFAULT_PLATINUM_AVATAR);
                  }
                }}
                title="Restablecer valores por defecto"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Base</span>
              </button>
            </div>
          </div>
        </div>

        {/* Controles del editor */}
        <div className="overflow-y-auto p-5 space-y-4">
          {tab === 'name' ? (
            <>
              {/* Modo de relleno */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">
                  Tipo de relleno
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {FILL_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitName({ ...nameCfg, fillMode: opt.id })}
                      className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                        nameCfg.fillMode === opt.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selectores de color */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Colores personalizados
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ColorField
                    label={activeColorCount === 1 ? 'Color principal' : 'Color 1'}
                    value={nameCfg.colors[0]}
                    onChange={(hex) =>
                      commitName({
                        ...nameCfg,
                        colors: [hex, nameCfg.colors[1], nameCfg.colors[2]],
                      })
                    }
                  />
                  {activeColorCount >= 2 && (
                    <ColorField
                      label="Color 2"
                      value={nameCfg.colors[1]}
                      onChange={(hex) =>
                        commitName({
                          ...nameCfg,
                          colors: [nameCfg.colors[0], hex, nameCfg.colors[2]],
                        })
                      }
                    />
                  )}
                  {activeColorCount >= 3 && (
                    <ColorField
                      label="Color 3"
                      value={nameCfg.colors[2]}
                      onChange={(hex) =>
                        commitName({
                          ...nameCfg,
                          colors: [nameCfg.colors[0], nameCfg.colors[1], hex],
                        })
                      }
                    />
                  )}
                  <ColorField
                    label="Color de brillo"
                    value={nameCfg.glowColor}
                    onChange={(hex) =>
                      commitName({ ...nameCfg, glowColor: hex, glowEnabled: true })
                    }
                  />
                </div>
              </div>

              {/* Ángulo del degradado */}
              {nameCfg.fillMode !== 'solid' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      Ángulo del degradado
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-500">
                      {nameCfg.angleDeg}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={nameCfg.angleDeg}
                    onChange={(e) =>
                      commitName({ ...nameCfg, angleDeg: Number(e.target.value) })
                    }
                    className="h-2 w-full cursor-pointer accent-emerald-600"
                  />
                </div>
              )}

              {/* Animación */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">
                  Animación del texto
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {NAME_ANIM_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitName({ ...nameCfg, animation: opt.id })}
                      className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                        nameCfg.animation === opt.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Velocidad e intensidad de brillo */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Velocidad</p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    {SPEED_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => commitName({ ...nameCfg, speed: opt.id })}
                        className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                          nameCfg.speed === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      Intensidad de brillo
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-500">
                      {nameCfg.glowEnabled ? `${nameCfg.glowIntensity}%` : 'Off'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={nameCfg.glowEnabled ? nameCfg.glowIntensity : 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      commitName({
                        ...nameCfg,
                        glowEnabled: val > 0,
                        glowIntensity: val,
                      });
                    }}
                    className="h-2 w-full cursor-pointer accent-emerald-600"
                  />
                </div>
              </div>

              {/* Estilo tipográfico */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">
                  Tipografía y estilo
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => commitName({ ...nameCfg, italic: !nameCfg.italic })}
                    className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold italic transition-colors ${
                      nameCfg.italic
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Cursiva
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitName({ ...nameCfg, uppercase: !nameCfg.uppercase })
                    }
                    className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      nameCfg.uppercase
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    MAYÚSCULAS
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitName({
                        ...nameCfg,
                        letterSpacing:
                          nameCfg.letterSpacing === 'wide' ? 'normal' : 'wide',
                      })
                    }
                    className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      nameCfg.letterSpacing === 'wide'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Espaciado
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitName({
                        ...nameCfg,
                        weight:
                          nameCfg.weight === 'semibold'
                            ? 'bold'
                            : nameCfg.weight === 'bold'
                            ? 'black'
                            : 'semibold',
                      })
                    }
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Grosor:{' '}
                    {nameCfg.weight === 'semibold'
                      ? 'Medio'
                      : nameCfg.weight === 'bold'
                      ? 'Negrita'
                      : 'Extra'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Patrón geométrico del icono */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">
                  Patrón del efecto
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {AVATAR_PATTERN_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitAvatar({ ...avatarCfg, pattern: opt.id })}
                      className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition-colors ${
                        avatarCfg.pattern === opt.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colores del icono */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Colores del aro y aura
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <ColorField
                    label="Primario"
                    value={avatarCfg.primaryColor}
                    onChange={(hex) =>
                      commitAvatar({ ...avatarCfg, primaryColor: hex })
                    }
                  />
                  <ColorField
                    label="Secundario"
                    value={avatarCfg.secondaryColor}
                    onChange={(hex) =>
                      commitAvatar({ ...avatarCfg, secondaryColor: hex })
                    }
                  />
                  <ColorField
                    label="Brillo"
                    value={avatarCfg.glowColor}
                    onChange={(hex) =>
                      commitAvatar({ ...avatarCfg, glowColor: hex })
                    }
                  />
                </div>
              </div>

              {/* Estilo y grosor de borde */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">
                    Trazo del anillo
                  </p>
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
                    {RING_STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          commitAvatar({ ...avatarCfg, ringStyle: opt.id })
                        }
                        className={`min-h-[36px] rounded-lg px-1.5 text-[11px] font-semibold transition-colors ${
                          avatarCfg.ringStyle === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">Grosor</p>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    {([2, 3, 4] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => commitAvatar({ ...avatarCfg, ringWidth: w })}
                        className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                          avatarCfg.ringWidth === w
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Velocidad, sentido y brillo */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">
                      Velocidad de giro
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        commitAvatar({ ...avatarCfg, reverse: !avatarCfg.reverse })
                      }
                      className="text-[11px] font-semibold text-emerald-700 hover:underline"
                    >
                      {avatarCfg.reverse ? 'Sentido: inverso' : 'Sentido: normal'}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    {SPEED_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => commitAvatar({ ...avatarCfg, speed: opt.id })}
                        className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                          avatarCfg.speed === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">
                      Intensidad del aura
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-500">
                      {avatarCfg.glowIntensity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={avatarCfg.glowIntensity}
                    onChange={(e) =>
                      commitAvatar({
                        ...avatarCfg,
                        glowIntensity: Number(e.target.value),
                      })
                    }
                    className="h-2 w-full cursor-pointer accent-emerald-600"
                  />
                </div>
              </div>

              {/* Insignia en la esquina */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">
                  Insignia en esquina (opcional)
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {BADGE_PRESETS.map((b) => {
                    const active = avatarCfg.badge === b;
                    return (
                      <button
                        key={b || 'none'}
                        type="button"
                        onClick={() => commitAvatar({ ...avatarCfg, badge: b })}
                        className={`flex h-10 min-w-[40px] items-center justify-center rounded-xl border px-2.5 text-sm font-semibold transition-colors ${
                          active
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {b || 'Sin'}
                      </button>
                    );
                  })}
                  <input
                    type="text"
                    aria-label="Emoji personalizado para insignia"
                    placeholder="Otro…"
                    maxLength={8}
                    value={BADGE_PRESETS.includes(avatarCfg.badge) ? '' : avatarCfg.badge}
                    onChange={(e) =>
                      commitAvatar({ ...avatarCfg, badge: e.target.value })
                    }
                    className="h-10 w-20 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-center text-sm focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{unlocked ? 'Listo y guardado' : 'Cerrar vista previa'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
