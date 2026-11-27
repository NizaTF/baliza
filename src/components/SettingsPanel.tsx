import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Check, Coffee, ExternalLink, Lock, Sparkles, Volume2, X } from 'lucide-react';
import { AchievementsModal } from './AchievementsModal';
import { loadStatsAndAchievements } from '../lib/achievements';
import {
  AVATAR_EFFECT_COSMETICS,
  CosmeticKind,
  NAME_EFFECT_COSMETICS,
  getAchievementTitleById,
  sanitizeEquippedCosmetics,
} from '../lib/cosmetics';
import {
  APP_AUTHOR,
  APP_VERSION,
  AppFont,
  AppPreferences,
  AppTheme,
  BUY_ME_A_COFFEE_URL,
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  subscribePreferences,
  triggerHaptic,
} from '../lib/preferences';
import {
  playMusicPreviewSample,
  playPixelUiClick,
  playSecretUnlockChime,
  unlockRetroAudio,
} from '../lib/retroAudio';
import {
  isSecretSandboxUnlocked,
  setSecretSandboxUnlocked,
  subscribeSecretSandbox,
} from '../lib/soloSandbox';
import { loadProfile } from '../lib/storage';
import { PlayerCosmetics, PlayerProfile } from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerCosmeticName } from './PlayerCosmeticName';
import { ProfileCustomizer } from './ProfileCustomizer';
import { ShareAppButton } from './ShareAppButton';

interface SettingsPanelProps {
  onClose?: () => void;
  asModal?: boolean;
  profile?: PlayerProfile;
  onProfileChange?: (next: PlayerProfile) => void;
  isInRoom?: boolean;
  onOpenAchievements?: () => void;
}

const THEME_OPTIONS: Array<{ id: AppTheme; label: string }> = [
  { id: 'light', label: 'Claro' },
  { id: 'warm', label: 'Crema' },
  { id: 'dark', label: 'Oscuro' },
];

const FONT_OPTIONS: Array<{ id: AppFont; label: string; previewFont: string }> = [
  { id: 'sans', label: 'Moderna', previewFont: '"Plus Jakarta Sans", sans-serif' },
  { id: 'rounded', label: 'Redonda', previewFont: '"Nunito", sans-serif' },
  { id: 'mono', label: 'Técnica', previewFont: '"JetBrains Mono", monospace' },
  { id: 'serif', label: 'Clásica', previewFont: '"Lora", serif' },
];

interface SimpleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}

const SimpleSwitch: React.FC<SimpleSwitchProps> = ({
  checked,
  onToggle,
  ariaLabel,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={onToggle}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
      checked ? 'bg-emerald-600' : 'bg-slate-300'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  asModal = false,
  profile,
  onProfileChange,
  isInRoom = false,
  onOpenAchievements,
}) => {
  const [prefs, setPrefs] = useState<AppPreferences>(() => loadPreferences());
  const [localAchievementsOpen, setLocalAchievementsOpen] = useState(false);
  const [cosmeticTab, setCosmeticTab] = useState<CosmeticKind>('nameEffect');
  const [debugUnlockAll, setDebugUnlockAll] = useState(() =>
    isSecretSandboxUnlocked()
  );
  const secretTapRef = useRef<{ count: number; lastMs: number }>({
    count: 0,
    lastMs: 0,
  });

  useEffect(() => subscribePreferences(setPrefs), []);
  useEffect(() => subscribeSecretSandbox(setDebugUnlockAll), []);

  const unlockedAchievementIds = useMemo(() => {
    const { achievements } = loadStatsAndAchievements();
    return new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
  }, [localAchievementsOpen]);

  const equippedCosmetics = useMemo(
    () =>
      sanitizeEquippedCosmetics(
        prefs.equippedCosmetics,
        unlockedAchievementIds,
        debugUnlockAll
      ),
    [prefs.equippedCosmetics, unlockedAchievementIds, debugUnlockAll]
  );

  const previewProfile = useMemo(
    () => profile ?? loadProfile(),
    [profile]
  );

  const handleVersionTap = () => {
    const now = Date.now();
    if (now - secretTapRef.current.lastMs > 2000) {
      secretTapRef.current.count = 0;
    }
    secretTapRef.current.count += 1;
    secretTapRef.current.lastMs = now;
    if (secretTapRef.current.count >= 5) {
      secretTapRef.current.count = 0;
      const next = !isSecretSandboxUnlocked();
      setSecretSandboxUnlocked(next);
      if (next) {
        unlockRetroAudio();
        playSecretUnlockChime();
      }
    }
  };

  const updatePrefs = (patch: Partial<AppPreferences>) => {
    const next = savePreferences({ ...prefs, ...patch });
    setPrefs(next);
  };

  const trimmedNameLength = profile ? profile.name.trim().length : 0;
  const profileNameError =
    profile && trimmedNameLength < 2 && (isInRoom || trimmedNameLength > 0)
      ? 'Mínimo 2 letras.'
      : null;

  const content = (
    <div className="clean-card overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Configuración
          </h1>
          <p className="text-xs text-slate-500">
            Personaliza tu perfil, el aspecto y los sonidos en este dispositivo.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100 px-5 sm:px-6">
        {/* 0. Perfil de jugador (emoji libre y color personalizado) */}
        {profile && onProfileChange && (
          <section className="py-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Perfil de jugador
              </h2>
              <span className="text-[11px] font-medium text-slate-500">
                {isInRoom
                  ? 'Se sincroniza automáticamente con la sala'
                  : 'Guardado en tu dispositivo'}
              </span>
            </div>

            <ProfileCustomizer
              profile={profile}
              onChange={onProfileChange}
              defaultExpanded={true}
              nameError={profileNameError}
            />
          </section>
        )}

        {/* 0.5. Colores de texto y efectos de icono desbloqueables por logros */}
        <section className="py-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                Colores de texto y efectos de icono
              </h2>
              {debugUnlockAll && (
                <span className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  Debug · Todos activos
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenAchievements) {
                  onOpenAchievements();
                } else {
                  setLocalAchievementsOpen(true);
                }
              }}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Ver logros
            </button>
          </div>

          {/* Vista previa equipada */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <PlayerAvatar
              emoji={previewProfile.emoji}
              color={previewProfile.color}
              size="md"
              name={previewProfile.name || 'Jugador'}
              avatarEffectId={equippedCosmetics.avatarEffectId}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-500">
                Vista previa equipada
              </p>
              <PlayerCosmeticName
                name={previewProfile.name.trim() || 'Tu nombre'}
                cosmetics={equippedCosmetics}
                className="text-sm font-bold text-slate-900"
              />
            </div>
          </div>

          {/* Pestañas Color de texto / Efecto de icono */}
          <div
            role="tablist"
            aria-label="Categoría de cosméticos"
            className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {(
              [
                {
                  id: 'nameEffect' as CosmeticKind,
                  label: 'Color de texto',
                  count: debugUnlockAll
                    ? NAME_EFFECT_COSMETICS.length
                    : NAME_EFFECT_COSMETICS.filter((c) =>
                        unlockedAchievementIds.has(c.unlockAchievementId)
                      ).length,
                  total: NAME_EFFECT_COSMETICS.length,
                },
                {
                  id: 'avatarEffect' as CosmeticKind,
                  label: 'Efecto de icono',
                  count: debugUnlockAll
                    ? AVATAR_EFFECT_COSMETICS.length
                    : AVATAR_EFFECT_COSMETICS.filter((c) =>
                        unlockedAchievementIds.has(c.unlockAchievementId)
                      ).length,
                  total: AVATAR_EFFECT_COSMETICS.length,
                },
              ]
            ).map((tab) => {
              const active = cosmeticTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCosmeticTab(tab.id)}
                  className={`min-h-[36px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label} ({tab.count}/{tab.total})
                </button>
              );
            })}
          </div>

          {/* Lista de cosméticos de la pestaña */}
          {(() => {
            const list =
              cosmeticTab === 'nameEffect'
                ? NAME_EFFECT_COSMETICS
                : AVATAR_EFFECT_COSMETICS;
            const currentId =
              cosmeticTab === 'nameEffect'
                ? equippedCosmetics.nameEffectId
                : equippedCosmetics.avatarEffectId;
            const handleEquip = (nextId?: string) => {
              unlockRetroAudio();
              playPixelUiClick('confirm');
              triggerHaptic(14);
              const nextCosmetics: PlayerCosmetics = { ...equippedCosmetics };
              if (cosmeticTab === 'nameEffect') {
                if (nextId) nextCosmetics.nameEffectId = nextId;
                else delete nextCosmetics.nameEffectId;
              } else {
                if (nextId) nextCosmetics.avatarEffectId = nextId;
                else delete nextCosmetics.avatarEffectId;
              }
              updatePrefs({ equippedCosmetics: nextCosmetics });
            };

            return (
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-0.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleEquip(undefined)}
                  className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                    !currentId
                      ? 'border-emerald-500 bg-emerald-50/70'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {cosmeticTab === 'nameEffect'
                        ? 'Color estándar'
                        : 'Marco estándar'}
                    </p>
                    <p className="text-[11px] text-slate-500">Por defecto</p>
                  </div>
                  {!currentId && (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  )}
                </button>

                {list.map((item) => {
                  const unlocked =
                    debugUnlockAll ||
                    unlockedAchievementIds.has(item.unlockAchievementId);
                  const selected = currentId === item.id;
                  const reqTitle = getAchievementTitleById(item.unlockAchievementId);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => handleEquip(item.id)}
                      className={`flex min-h-[54px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50/70'
                          : unlocked
                          ? 'border-slate-200 bg-white hover:bg-slate-50'
                          : 'border-slate-200 bg-slate-50/70 opacity-65 cursor-not-allowed'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        {item.kind === 'nameEffect' ? (
                          <p className={`truncate text-xs ${item.className}`}>
                            {item.label}
                          </p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <PlayerAvatar
                              emoji={previewProfile.emoji}
                              color={previewProfile.color}
                              size="sm"
                              avatarEffectId={item.id}
                            />
                            <span className="truncate text-xs font-semibold text-slate-900">
                              {item.label}
                            </span>
                          </div>
                        )}
                        <p className="truncate text-[11px] text-slate-500">
                          {unlockedAchievementIds.has(item.unlockAchievementId)
                            ? item.description
                            : debugUnlockAll
                            ? `Debug libre · Logro: ${reqTitle}`
                            : `Logro: ${reqTitle}`}
                        </p>
                      </div>

                      {selected ? (
                        <Check
                          className="h-4 w-4 shrink-0 text-emerald-600"
                          aria-label="Equipado"
                        />
                      ) : !unlocked ? (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-slate-400"
                          aria-label="Bloqueado"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </section>

        {/* 1. Tema y Fuente */}
        <section className="py-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Apariencia</h2>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Tema</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {THEME_OPTIONS.map((opt) => {
                const active = prefs.theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updatePrefs({ theme: opt.id })}
                    className={`min-h-[38px] rounded-lg px-2 text-xs sm:text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Fuente</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-4">
              {FONT_OPTIONS.map((opt) => {
                const active = prefs.font === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updatePrefs({ font: opt.id })}
                    style={{ fontFamily: opt.previewFont }}
                    className={`min-h-[38px] rounded-lg px-2 text-xs sm:text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 2. Música y Sonidos */}
        <section className="py-5 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Música y sonidos
          </h2>

          {/* Música */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Música</p>
                <p className="text-xs text-slate-500">
                  Sintonías de inicio, ruleta, espera y resultado.
                </p>
              </div>
              <SimpleSwitch
                checked={prefs.musicEnabled}
                ariaLabel="Activar o silenciar música"
                onToggle={() =>
                  updatePrefs({ musicEnabled: !prefs.musicEnabled })
                }
              />
            </div>

            {prefs.musicEnabled && (
              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={prefs.musicVolume}
                  aria-label="Volumen de música"
                  onChange={(e) =>
                    updatePrefs({ musicVolume: Number(e.target.value) })
                  }
                  className="h-1.5 flex-1 cursor-pointer accent-emerald-600"
                />
                <span className="w-10 text-right font-mono text-xs font-semibold tabular-nums text-slate-600">
                  {prefs.musicVolume}%
                </span>
                <button
                  type="button"
                  onClick={() => playMusicPreviewSample()}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2 shrink-0"
                >
                  Probar
                </button>
              </div>
            )}
          </div>

          {/* Efectos de sonido */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Efectos y alertas
                </p>
                <p className="text-xs text-slate-500">
                  Avisos de captura, cuenta atrás, radar y clics.
                </p>
              </div>
              <SimpleSwitch
                checked={prefs.sfxEnabled}
                ariaLabel="Activar o silenciar efectos de sonido"
                onToggle={() => updatePrefs({ sfxEnabled: !prefs.sfxEnabled })}
              />
            </div>

            {prefs.sfxEnabled && (
              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={prefs.sfxVolume}
                  aria-label="Volumen de efectos de sonido"
                  onChange={(e) =>
                    updatePrefs({ sfxVolume: Number(e.target.value) })
                  }
                  className="h-1.5 flex-1 cursor-pointer accent-emerald-600"
                />
                <span className="w-10 text-right font-mono text-xs font-semibold tabular-nums text-slate-600">
                  {prefs.sfxVolume}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    unlockRetroAudio();
                    playPixelUiClick('confirm');
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2 shrink-0"
                >
                  Probar
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 3. Extras */}
        <section className="py-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Extras</h2>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Vibración</p>
              <p className="text-xs text-slate-500">
                Vibra en avisos importantes (si el móvil lo permite).
              </p>
            </div>
            <SimpleSwitch
              checked={prefs.vibrationEnabled}
              ariaLabel="Activar o desactivar vibración"
              onToggle={() => {
                const next = !prefs.vibrationEnabled;
                updatePrefs({ vibrationEnabled: next });
                if (next) triggerHaptic(20);
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Animaciones suaves
              </p>
              <p className="text-xs text-slate-500">
                Reduce efectos rápidos de movimiento en la interfaz.
              </p>
            </div>
            <SimpleSwitch
              checked={prefs.reducedMotion}
              ariaLabel="Reducir animaciones"
              onToggle={() =>
                updatePrefs({ reducedMotion: !prefs.reducedMotion })
              }
            />
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => savePreferences({ ...DEFAULT_PREFERENCES })}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline underline-offset-2"
            >
              Restablecer ajustes por defecto
            </button>
          </div>
        </section>

        {/* 4. Versión, autor y Buy Me a Coffee */}
        <section className="py-5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p
                onClick={handleVersionTap}
                className="text-sm font-semibold text-slate-900 select-none cursor-default"
              >
                Baliza · v{APP_VERSION}
              </p>
              <p className="text-xs text-slate-500">
                Creado por <strong className="text-slate-700">{APP_AUTHOR}</strong>
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => {
                  if (onOpenAchievements) {
                    onOpenAchievements();
                  } else {
                    setLocalAchievementsOpen(true);
                  }
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Award className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span>Logros</span>
              </button>
              <ShareAppButton variant="settings" />
              <a
                href={BUY_ME_A_COFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#FFDD00] px-4 py-2 text-sm font-bold text-slate-950 shadow-xs transition-transform hover:brightness-95 active:scale-[0.99]"
              >
                <Coffee className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Invítame a un café · Buy Me a Coffee</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </div>
      {localAchievementsOpen && (
        <AchievementsModal onClose={() => setLocalAchievementsOpen(false)} />
      )}
    </div>
  );

  if (asModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configuración de Baliza"
        className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-slate-900/55 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
      >
        <div className="my-auto w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl shadow-xl">
          {content}
        </div>
      </div>
    );
  }

  return <div className="mx-auto max-w-2xl">{content}</div>;
};
