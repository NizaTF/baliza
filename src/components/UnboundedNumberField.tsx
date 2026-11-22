import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface UnboundedNumberFieldProps {
  id?: string;
  label: string;
  description?: string;
  value: number;
  unit: string;
  step?: number;
  min?: number;
  presets?: readonly number[];
  formatPreset?: (val: number) => string;
  recommendedValue?: number;
  recommendedContext?: string;
  accentTone?: 'emerald' | 'violet' | 'rose' | 'amber';
  onChange: (nextVal: number) => void;
}

export const UnboundedNumberField: React.FC<UnboundedNumberFieldProps> = ({
  id,
  label,
  description,
  value,
  unit,
  step = 5,
  min = 1,
  recommendedValue,
  onChange,
}) => {
  const [rawText, setRawText] = useState(String(value));

  useEffect(() => {
    setRawText(String(value));
  }, [value]);

  const commitText = (text: string) => {
    const parsed = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(parsed) || parsed < min) {
      setRawText(String(value));
      return;
    }
    onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-slate-900"
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        )}
        {recommendedValue !== undefined && (
          <p className="text-xs text-slate-500">
            Recomendado:{' '}
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {recommendedValue} {unit}
            </span>
            {value !== recommendedValue && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => onChange(recommendedValue)}
                  className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                >
                  Usar
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {/* Control único minimalista sin límite máximo: [-] [ input unit ] [+] */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`Restar ${step} ${unit} a ${label}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-35 transition-colors"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="relative w-24">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={rawText}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^\d]/g, '');
              setRawText(cleaned);
              const parsed = parseInt(cleaned, 10);
              if (!Number.isNaN(parsed) && parsed >= min) {
                onChange(parsed);
              }
            }}
            onBlur={() => commitText(rawText)}
            aria-label={label}
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-2.5 pr-9 text-center font-mono text-sm font-bold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
            {unit}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onChange(value + step)}
          aria-label={`Sumar ${step} ${unit} a ${label}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
