import React, { useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { triggerHaptic } from '../lib/preferences';
import { playPixelUiClick } from '../lib/retroAudio';

interface ShareAppButtonProps {
  variant?: 'header' | 'card' | 'settings';
  className?: string;
}

function getCleanAppShareUrl(): string {
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return window.location.origin || 'https://baliza.app';
  }
}

async function copyTextFallback(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to temporary textarea below
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const ShareAppButton: React.FC<ShareAppButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const [status, setStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showTemporaryStatus = (next: 'copied' | 'shared') => {
    setStatus(next);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setStatus('idle');
      timerRef.current = null;
    }, 2200);
  };

  const handleShareApp = async () => {
    playPixelUiClick();
    triggerHaptic(18);

    const shareUrl = getCleanAppShareUrl();
    const shareData: ShareData = {
      title: 'Baliza · Escondite GPS en el mapa',
      text: 'Juega conmigo al escondite e infección por GPS en el mapa con Baliza, directo en el navegador y sin crear cuenta:',
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        showTemporaryStatus('shared');
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Fallback to clipboard if navigator.share is blocked or fails
      }
    }

    const copied = await copyTextFallback(shareUrl);
    if (copied) {
      showTemporaryStatus('copied');
    }
  };

  const isDone = status !== 'idle';

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={() => void handleShareApp()}
        className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
          isDone
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100'
        } ${className}`}
      >
        {isDone ? (
          <>
            <Check className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>
              {status === 'shared'
                ? '¡Web compartida!'
                : '¡Enlace copiado para enviar a tus amigos!'}
            </span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Compartir Baliza con amigos</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'settings') {
    return (
      <button
        type="button"
        onClick={() => void handleShareApp()}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
          isDone
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
        } ${className}`}
      >
        {isDone ? (
          <>
            <Check className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{status === 'shared' ? '¡Compartido!' : '¡Enlace copiado!'}</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Compartir web con amigos</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleShareApp()}
      aria-label="Compartir Baliza con amigos"
      title="Compartir web con amigos"
      className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
        isDone
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      } ${className}`}
    >
      {isDone ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{status === 'shared' ? 'Enviado' : 'Copiado'}</span>
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">Compartir</span>
        </>
      )}
    </button>
  );
};
