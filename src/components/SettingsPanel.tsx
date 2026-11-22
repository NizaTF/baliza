import React, { useEffect, useState } from 'react';
import { Coffee, ExternalLink, Volume2, X } from 'lucide-react';
import {
  APP_AUTHOR,
  APP_VERSION,
  AppFont,
  AppPreferences,
  AppTheme,
  BUY_ME_A_COFFEE_URL,
  DEFAULT_PREFERENCES,
  loadPreferences,
  MapTileStyle,
  savePreferences,
  subscribePreferences,
  triggerHaptic,
} from '../lib/preferences';
import {
  playMusicPreviewSample,
  playPixelUiClick,
  unlockRetroAudio,
} from '../lib/retroAudio';

interface SettingsPanelProps {
  onClose?: () => void;
  asModal?: boolean;
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

const MAP_STYLE_OPTIONS: Array<{ id: MapTileStyle; label: string }> = [
  { id: 'standard', label: 'Calles' },
  { id: 'clean', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
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
}) => {
  const [prefs, setPrefs] = useState<AppPreferences>(() => loadPreferences());

  useEffect(() => subscribePreferences(setPrefs), []);

  const updatePrefs = (patch: Partial<AppPreferences>) => {
    const next = savePreferences({ ...prefs, ...patch });
    setPrefs(next);
  };

  const content = (
    <div className="clean-card overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Configuración
          </h1>
          <p className="text-xs text-slate-500">
            Personaliza el aspecto, los sonidos y el mapa en este dispositivo.
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

        {/* 3. Mapa y extras */}
        <section className="py-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Mapa y extras</h2>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Estilo del mapa</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {MAP_STYLE_OPTIONS.map((opt) => {
                const active = prefs.mapStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updatePrefs({ mapStyle: opt.id })}
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

          <div className="flex items-center justify-between gap-3 pt-1">
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
              <p className="text-sm font-semibold text-slate-900">
                Baliza · v{APP_VERSION}
              </p>
              <p className="text-xs text-slate-500">
                Creado por <strong className="text-slate-700">{APP_AUTHOR}</strong>
              </p>
            </div>

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
        </section>
      </div>
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
