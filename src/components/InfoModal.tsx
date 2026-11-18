import React, { useState } from 'react';
import { Check, Copy, Database, ExternalLink, X } from 'lucide-react';
import { getSyncMode } from '../lib/roomService';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUPABASE_SQL_SNIPPET = `-- Tablas para Escondite Urbano (v0.1)
create table if not exists public.rooms (
  id uuid primary key,
  code text unique not null,
  host_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  rules jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  emoji text not null,
  color text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;`;

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  const [copiedSql, setCopiedSql] = useState(false);
  const syncMode = getSyncMode();

  if (!isOpen) return null;

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SNIPPET);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 p-0 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-200 bg-white p-6 shadow-xl space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2
              id="info-modal-title"
              className="font-display text-xl font-bold text-slate-900"
            >
              Sincronización y despliegue en GitHub Pages
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Arquitectura 100% cliente + Supabase Realtime sin servidor propio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar información"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Estado actual de sincronización */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Database className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span>
              Modo activo:{' '}
              {syncMode === 'supabase'
                ? 'Supabase Realtime conectado'
                : 'Sincronización local entre pestañas'}
            </span>
          </div>
          {syncMode === 'local' ? (
            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p>
                No se han detectado variables <code className="font-mono text-slate-800">VITE_SUPABASE_URL</code> ni{' '}
                <code className="font-mono text-slate-800">VITE_SUPABASE_ANON_KEY</code>. Para probar la creación de salas y entrada en tiempo real ahora mismo, abre otra pestaña con esta misma URL.
              </p>
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[36px] items-center gap-1.5 font-semibold text-emerald-700 hover:underline"
              >
                <span>Abrir otra pestaña para probar</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              Las salas y jugadores se sincronizan en tiempo real entre distintos dispositivos mediante Supabase Postgres y Realtime.
            </p>
          )}
        </div>

        {/* SQL para Supabase */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Esquema SQL para tu proyecto Supabase (plan gratuito)
            </h3>
            <button
              type="button"
              onClick={handleCopySql}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {copiedSql ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  <span className="text-emerald-700">SQL copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copiar SQL</span>
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 font-mono text-xs text-slate-100 leading-relaxed">
            {SUPABASE_SQL_SNIPPET}
          </pre>
          <p className="text-xs text-slate-500">
            El archivo completo con políticas RLS y limpieza automática de salas inactivas está incluido en{' '}
            <code className="font-mono text-slate-700">supabase/schema.sql</code>.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
