import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

function normalizeSupabaseUrl(value?: string): {
  url: string | null;
  error: string | null;
} {
  if (!value) return { url: null, error: null };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        url: null,
        error: 'VITE_SUPABASE_URL debe empezar por https:// (ej. https://tuproyecto.supabase.co).',
      };
    }

    // Si alguien pegó la URL del dashboard (https://supabase.com/dashboard/project/<ref>), convertir al Project URL real
    if (
      parsed.hostname === 'supabase.com' ||
      parsed.hostname === 'app.supabase.com'
    ) {
      const match = parsed.pathname.match(/\/(?:dashboard\/)?project\/([a-z0-9_-]+)/i);
      if (match?.[1]) {
        return {
          url: `https://${match[1]}.supabase.co`,
          error: null,
        };
      }
      return {
        url: null,
        error:
          'Has pegado la URL del panel de Supabase. Usa la "Project URL" de Project Settings → Data API (https://<id>.supabase.co).',
      };
    }

    // Eliminar cualquier ruta sobrante (/rest/v1, etc.) y quedarse solo con el origen
    return {
      url: parsed.origin,
      error: null,
    };
  } catch {
    return {
      url: null,
      error: 'VITE_SUPABASE_URL no tiene un formato de URL válido (https://<id>.supabase.co).',
    };
  }
}

let client: SupabaseClient | null = null;
let configError: string | null = null;

let credentials: { url: string; anonKey: string } | null = null;

if (rawUrl && rawKey) {
  const { url, error } = normalizeSupabaseUrl(rawUrl);
  if (error || !url) {
    configError = error;
  } else if (rawKey.length <= 10) {
    configError = 'VITE_SUPABASE_ANON_KEY parece incompleta.';
  } else {
    try {
      client = createClient(url, rawKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      credentials = { url, anonKey: rawKey };
    } catch (err) {
      configError =
        err instanceof Error
          ? err.message
          : 'No se pudo inicializar el cliente de Supabase.';
      client = null;
      credentials = null;
    }
  }
}

export const isSupabaseConfigured = Boolean(client);
export const supabaseConfigError = configError;
export const supabaseCredentials = credentials;
export const supabase = client;
