// Almacenamiento seguro con respaldo automático en memoria, window.name (mismo origen)
// e IndexedDB para entornos donde localStorage/sessionStorage están bloqueados o restringidos.

const WINDOW_NAME_PREFIX = '__BALIZA_STORE_V1__:';
const IDB_NAME = 'baliza_persistence_v1';
const IDB_STORE = 'kv';

const memoryLocal = new Map<string, string>();
const memorySession = new Map<string, string>();

const PERSISTED_KEYS = new Set<string>([
  'baliza_app_preferences_v1',
  'escondite_urbano_profile',
  'escondite_urbano_player_id',
  'escondite_urbano_active_session',
]);

let cachedLocalWorks: boolean | null = null;
let cachedSessionWorks: boolean | null = null;

function testStorage(getStore: () => Storage): boolean {
  try {
    const store = getStore();
    const probeKey = '__baliza_storage_probe__';
    store.setItem(probeKey, '1');
    const ok = store.getItem(probeKey) === '1';
    store.removeItem(probeKey);
    return ok;
  } catch {
    return false;
  }
}

export function isLocalStorageUsable(): boolean {
  if (cachedLocalWorks === null) {
    cachedLocalWorks =
      typeof window !== 'undefined' && testStorage(() => window.localStorage);
  }
  return cachedLocalWorks;
}

export function isSessionStorageUsable(): boolean {
  if (cachedSessionWorks === null) {
    cachedSessionWorks =
      typeof window !== 'undefined' && testStorage(() => window.sessionStorage);
  }
  return cachedSessionWorks;
}

interface WindowNamePayload {
  origin: string;
  local: Record<string, string>;
  session: Record<string, string>;
}

function readWindowNameStore(): WindowNamePayload {
  const empty: WindowNamePayload = {
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    local: {},
    session: {},
  };
  try {
    if (typeof window === 'undefined') return empty;
    const raw = window.name || '';
    if (!raw.startsWith(WINDOW_NAME_PREFIX)) return empty;
    const parsed = JSON.parse(
      raw.slice(WINDOW_NAME_PREFIX.length)
    ) as Partial<WindowNamePayload>;
    if (!parsed || parsed.origin !== window.location.origin) {
      return empty;
    }
    return {
      origin: parsed.origin,
      local:
        parsed.local && typeof parsed.local === 'object' ? parsed.local : {},
      session:
        parsed.session && typeof parsed.session === 'object'
          ? parsed.session
          : {},
    };
  } catch {
    return empty;
  }
}

function writeWindowNameStore(mutator: (payload: WindowNamePayload) => void): void {
  try {
    if (typeof window === 'undefined') return;
    const payload = readWindowNameStore();
    payload.origin = window.location.origin;
    mutator(payload);
    window.name = `${WINDOW_NAME_PREFIX}${JSON.stringify(payload)}`;
  } catch {
    // Ignorar si el navegador restringe window.name
  }
}

function openFallbackDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(key: string, value: string | null): Promise<void> {
  const db = await openFallbackDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      if (value === null) {
        store.delete(key);
      } else {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore IDB errors
  } finally {
    db.close();
  }
}

async function idbGetAll(keys: string[]): Promise<Record<string, string>> {
  const db = await openFallbackDb();
  if (!db) return {};
  try {
    return await new Promise<Record<string, string>>((resolve) => {
      const result: Record<string, string> = {};
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      let remaining = keys.length;
      if (remaining === 0) {
        resolve(result);
        return;
      }
      keys.forEach((k) => {
        const req = store.get(k);
        req.onsuccess = () => {
          if (typeof req.result === 'string') {
            result[k] = req.result;
          }
          remaining -= 1;
          if (remaining === 0) resolve(result);
        };
        req.onerror = () => {
          remaining -= 1;
          if (remaining === 0) resolve(result);
        };
      });
      tx.onerror = () => resolve(result);
    });
  } catch {
    return {};
  } finally {
    db.close();
  }
}

export function safeLocalGet(key: string): string | null {
  if (isLocalStorageUsable()) {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        memoryLocal.set(key, val);
        return val;
      }
    } catch {
      cachedLocalWorks = false;
    }
  }
  const memVal = memoryLocal.get(key);
  if (memVal !== undefined) return memVal;

  if (PERSISTED_KEYS.has(key)) {
    const wn = readWindowNameStore();
    if (typeof wn.local[key] === 'string') {
      memoryLocal.set(key, wn.local[key]);
      return wn.local[key];
    }
  }
  return null;
}

export function safeLocalSet(key: string, value: string): void {
  memoryLocal.set(key, value);
  let savedToWebStorage = false;
  if (isLocalStorageUsable()) {
    try {
      window.localStorage.setItem(key, value);
      savedToWebStorage = true;
    } catch {
      cachedLocalWorks = false;
    }
  }
  if (PERSISTED_KEYS.has(key)) {
    if (!savedToWebStorage) {
      writeWindowNameStore((payload) => {
        payload.local[key] = value;
      });
    }
    void idbPut(key, value);
  }
}

export function safeLocalRemove(key: string): void {
  memoryLocal.delete(key);
  if (isLocalStorageUsable()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      cachedLocalWorks = false;
    }
  }
  if (PERSISTED_KEYS.has(key)) {
    writeWindowNameStore((payload) => {
      delete payload.local[key];
    });
    void idbPut(key, null);
  }
}

export function safeSessionGet(key: string): string | null {
  if (isSessionStorageUsable()) {
    try {
      const val = window.sessionStorage.getItem(key);
      if (val !== null) {
        memorySession.set(key, val);
        return val;
      }
    } catch {
      cachedSessionWorks = false;
    }
  }
  const memVal = memorySession.get(key);
  if (memVal !== undefined) return memVal;

  if (PERSISTED_KEYS.has(key)) {
    const wn = readWindowNameStore();
    if (typeof wn.session[key] === 'string') {
      memorySession.set(key, wn.session[key]);
      return wn.session[key];
    }
  }
  return null;
}

export function safeSessionSet(key: string, value: string): void {
  memorySession.set(key, value);
  let savedToWebStorage = false;
  if (isSessionStorageUsable()) {
    try {
      window.sessionStorage.setItem(key, value);
      savedToWebStorage = true;
    } catch {
      cachedSessionWorks = false;
    }
  }
  if (PERSISTED_KEYS.has(key) && !savedToWebStorage) {
    writeWindowNameStore((payload) => {
      payload.session[key] = value;
    });
  }
}

export function safeSessionRemove(key: string): void {
  memorySession.delete(key);
  if (isSessionStorageUsable()) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      cachedSessionWorks = false;
    }
  }
  if (PERSISTED_KEYS.has(key)) {
    writeWindowNameStore((payload) => {
      delete payload.session[key];
    });
  }
}

/**
 * Hidrata valores guardados en IndexedDB si localStorage fue limpiado o bloqueado al arrancar.
 */
export async function hydrateFromIndexedDbFallback(): Promise<string[]> {
  const keys = Array.from(PERSISTED_KEYS);
  const stored = await idbGetAll(keys);
  const restoredKeys: string[] = [];

  for (const key of keys) {
    const idbVal = stored[key];
    if (!idbVal) continue;
    const current = safeLocalGet(key);
    if (!current) {
      memoryLocal.set(key, idbVal);
      if (isLocalStorageUsable()) {
        try {
          window.localStorage.setItem(key, idbVal);
        } catch {
          cachedLocalWorks = false;
        }
      }
      if (!isLocalStorageUsable()) {
        writeWindowNameStore((payload) => {
          payload.local[key] = idbVal;
        });
      }
      restoredKeys.push(key);
    }
  }
  return restoredKeys;
}
