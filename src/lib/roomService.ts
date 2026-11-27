import {
  DEFAULT_RULES,
  LocationGuardStatus,
  PlayerLocationPayload,
  PlayerProfile,
  PlayerRecord,
  RoomRecord,
  RoomRules,
} from '../types/game';
import { safeLocalGet, safeLocalSet } from './safeStorage';
import {
  generateRoomCode,
  generateUuid,
  getPlayerId,
  sanitizeHexColor,
  sanitizePlayerEmoji,
} from './storage';
import {
  isSupabaseConfigured,
  supabase,
  supabaseCredentials,
} from './supabaseClient';
import {
  createBotPlayers,
  isBotPlayerId,
  isForceLocalSandboxEnabled,
} from './soloSandbox';
import { createRandomBotCosmetics } from './cosmetics';

function shouldUseRemoteDb(): boolean {
  return Boolean(isSupabaseConfigured && supabase && !isForceLocalSandboxEnabled());
}

const LOCAL_ROOMS_KEY = 'escondite_urbano_local_rooms_v1';
const CHANNEL_NAME = 'escondite_urbano_sync_v1';
const ROOM_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 horas

interface LocalStore {
  rooms: Record<string, RoomRecord>;
  players: Record<string, PlayerRecord[]>;
}

type SyncMessage =
  | { type: 'room_updated'; roomId: string }
  | { type: 'room_deleted'; roomId: string }
  | { type: 'player_kicked'; roomId: string; targetPlayerId: string };

const activeSyncChannels = new Map<
  string,
  ReturnType<NonNullable<typeof supabase>['channel']>
>();

function readLocalStore(): LocalStore {
  try {
    const raw = safeLocalGet(LOCAL_ROOMS_KEY);
    if (!raw) return { rooms: {}, players: {} };
    const parsed = JSON.parse(raw) as LocalStore;
    const now = Date.now();
    const cleanedRooms: Record<string, RoomRecord> = {};
    const cleanedPlayers: Record<string, PlayerRecord[]> = {};

    for (const [roomId, room] of Object.entries(parsed.rooms || {})) {
      const created = new Date(room.created_at).getTime();
      if (!Number.isNaN(created) && now - created < ROOM_EXPIRY_MS && room.status === 'lobby') {
        cleanedRooms[roomId] = room;
        cleanedPlayers[roomId] = parsed.players?.[roomId] || [];
      }
    }
    return { rooms: cleanedRooms, players: cleanedPlayers };
  } catch {
    return { rooms: {}, players: {} };
  }
}

function writeLocalStore(store: LocalStore): void {
  try {
    safeLocalSet(LOCAL_ROOMS_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}

function broadcastLocalSync(message: SyncMessage): void {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  }
}

export function getSyncMode(): 'supabase' | 'local' {
  return shouldUseRemoteDb() ? 'supabase' : 'local';
}

export async function createRoom(
  profile: PlayerProfile,
  initialRules: RoomRules = DEFAULT_RULES,
  explicitPlayerId?: string
): Promise<{ room: RoomRecord; player: PlayerRecord }> {
  const playerId = explicitPlayerId || getPlayerId();
  const cleanName = profile.name.trim().slice(0, 12);
  const cleanEmoji = sanitizePlayerEmoji(profile.emoji);
  const cleanColor = sanitizeHexColor(profile.color);

  if (shouldUseRemoteDb() && supabase) {
    // Intentar hasta 5 veces generar un código único
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode(4);
      const roomId = generateUuid();
      const now = new Date().toISOString();

      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          id: roomId,
          code,
          host_id: playerId,
          status: 'lobby',
          rules: initialRules,
          created_at: now,
        })
        .select()
        .single();

      if (roomError) {
        if (roomError.code === '23505') continue; // Código duplicado, reintentar
        if (roomError.code === '42P01' || roomError.code === 'PGRST205') {
          throw new Error(
            'Faltan las tablas en Supabase. Ejecuta supabase/schema.sql en el SQL Editor de tu proyecto.'
          );
        }
        if (/invalid path/i.test(roomError.message)) {
          throw new Error(
            'La URL de Supabase (VITE_SUPABASE_URL) contiene una ruta inválida. Debe ser solo https://<tu-id>.supabase.co (sin rutas extra).'
          );
        }
        throw new Error(roomError.message);
      }

      // Limpiar cualquier fila huérfana previa de este mismo jugador antes de insertar
      await supabase.from('players').delete().eq('id', playerId);

      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          id: playerId,
          room_id: roomId,
          name: cleanName,
          emoji: cleanEmoji,
          color: cleanColor,
          is_host: true,
          joined_at: now,
        })
        .select()
        .single();

      if (playerError) {
        throw new Error(playerError.message);
      }

      return {
        room: roomData as RoomRecord,
        player: playerData as PlayerRecord,
      };
    }

    throw new Error('No se pudo generar un código único. Inténtalo de nuevo.');
  }

  // Modo sincronización local (BroadcastChannel + localStorage)
  const store = readLocalStore();
  let code = generateRoomCode(4);
  const existingCodes = new Set(Object.values(store.rooms).map((r) => r.code));
  while (existingCodes.has(code)) {
    code = generateRoomCode(4);
  }

  const roomId = generateUuid();
  const now = new Date().toISOString();
  const room: RoomRecord = {
    id: roomId,
    code,
    host_id: playerId,
    status: 'lobby',
    rules: structuredClone(initialRules),
    created_at: now,
  };

  const player: PlayerRecord = {
    id: playerId,
    room_id: roomId,
    name: cleanName,
    emoji: cleanEmoji,
    color: cleanColor,
    is_host: true,
    joined_at: now,
  };

  store.rooms[roomId] = room;
  store.players[roomId] = [player];
  writeLocalStore(store);
  broadcastLocalSync({ type: 'room_updated', roomId });

  return { room, player };
}

export async function joinRoom(
  rawCode: string,
  profile: PlayerProfile,
  explicitPlayerId?: string
): Promise<{ room: RoomRecord; player: PlayerRecord; players: PlayerRecord[] }> {
  const code = rawCode.trim().toUpperCase();
  const playerId = explicitPlayerId || getPlayerId();
  const cleanName = profile.name.trim().slice(0, 12);
  const cleanEmoji = sanitizePlayerEmoji(profile.emoji);
  const cleanColor = sanitizeHexColor(profile.color);

  if (code.length < 4 || code.length > 6) {
    throw new Error('No encontramos esa sala. Revisa el código.');
  }

  if (shouldUseRemoteDb() && supabase) {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .eq('status', 'lobby')
      .maybeSingle();

    if (roomError) {
      if (roomError.code === '42P01' || roomError.code === 'PGRST205') {
        throw new Error(
          'Faltan las tablas en Supabase. Ejecuta supabase/schema.sql en el SQL Editor de tu proyecto.'
        );
      }
      throw new Error('Error al consultar la sala en Supabase. Inténtalo de nuevo.');
    }

    if (!roomData) {
      throw new Error('No encontramos esa sala. Revisa el código.');
    }

    const room = roomData as RoomRecord;
    const isHost = room.host_id === playerId;
    const now = new Date().toISOString();

    const { data: existingPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    const currentList = (existingPlayers as PlayerRecord[]) || [];
    const alreadyInRoom = currentList.some((p) => p.id === playerId);

    if (room.rules?.matchState?.active && !alreadyInRoom) {
      throw new Error('La partida ya ha comenzado.');
    }
    if (room.rules?.roomLocked && !alreadyInRoom && !isHost) {
      throw new Error('El anfitrión ha cerrado la entrada a nuevos jugadores.');
    }
    if (!alreadyInRoom && currentList.length >= 30) {
      throw new Error('La sala está llena (máximo 30 jugadores).');
    }

    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .upsert(
        {
          id: playerId,
          room_id: room.id,
          name: cleanName,
          emoji: cleanEmoji,
          color: cleanColor,
          is_host: isHost,
          joined_at: now,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (playerError) {
      throw new Error('No se pudo entrar a la sala. Inténtalo de nuevo.');
    }

    const { data: playersList } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true });

    return {
      room,
      player: playerData as PlayerRecord,
      players: (playersList as PlayerRecord[]) || [playerData as PlayerRecord],
    };
  }

  // Modo sincronización local
  const store = readLocalStore();
  const room = Object.values(store.rooms).find(
    (r) => r.code === code && r.status === 'lobby'
  );

  if (!room) {
    throw new Error('No encontramos esa sala. Revisa el código.');
  }

  const roomPlayers = store.players[room.id] || [];
  const existingIdx = roomPlayers.findIndex((p) => p.id === playerId);

  if (room.rules?.matchState?.active && existingIdx < 0) {
    throw new Error('La partida ya ha comenzado.');
  }
  if (room.rules?.roomLocked && existingIdx < 0 && room.host_id !== playerId) {
    throw new Error('El anfitrión ha cerrado la entrada a nuevos jugadores.');
  }
  if (existingIdx < 0 && roomPlayers.length >= 30) {
    throw new Error('La sala está llena (máximo 30 jugadores).');
  }

  const player: PlayerRecord = {
    id: playerId,
    room_id: room.id,
    name: cleanName,
    emoji: cleanEmoji,
    color: cleanColor,
    is_host: room.host_id === playerId,
    joined_at:
      existingIdx >= 0 ? roomPlayers[existingIdx].joined_at : new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    roomPlayers[existingIdx] = player;
  } else {
    roomPlayers.push(player);
  }

  store.players[room.id] = roomPlayers;
  writeLocalStore(store);
  broadcastLocalSync({ type: 'room_updated', roomId: room.id });

  return {
    room,
    player,
    players: [...roomPlayers],
  };
}

export async function fetchRoomState(
  roomId: string
): Promise<{ room: RoomRecord; players: PlayerRecord[] } | null> {
  if (shouldUseRemoteDb() && supabase) {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .eq('status', 'lobby')
      .maybeSingle();

    if (roomError) throw new Error(roomError.message);
    if (!roomData) return null;

    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

    if (playersError) throw new Error(playersError.message);

    return {
      room: roomData as RoomRecord,
      players: (playersData as PlayerRecord[]) || [],
    };
  }

  const store = readLocalStore();
  const room = store.rooms[roomId];
  if (!room || room.status !== 'lobby') return null;

  return {
    room,
    players: [...(store.players[roomId] || [])],
  };
}

export async function verifyPlayerInRoom(
  roomId: string,
  playerId: string
): Promise<'present' | 'missing' | 'unknown'> {
  if (shouldUseRemoteDb() && supabase) {
    try {
      const { data: roomData, error: roomErr } = await supabase
        .from('rooms')
        .select('id, status')
        .eq('id', roomId)
        .maybeSingle();
      if (roomErr || !roomData || roomData.status !== 'lobby') {
        return 'unknown';
      }

      const { data: playerData, error: playerErr } = await supabase
        .from('players')
        .select('id')
        .eq('room_id', roomId)
        .eq('id', playerId)
        .maybeSingle();
      if (playerErr) return 'unknown';
      return playerData ? 'present' : 'missing';
    } catch {
      return 'unknown';
    }
  }

  const store = readLocalStore();
  const room = store.rooms[roomId];
  if (!room || room.status !== 'lobby') return 'unknown';
  const list = store.players[roomId] || [];
  return list.some((p) => p.id === playerId) ? 'present' : 'missing';
}

export async function updateRoomRules(
  roomId: string,
  rules: RoomRules
): Promise<RoomRecord> {
  if (shouldUseRemoteDb() && supabase) {
    const { data, error } = await supabase
      .from('rooms')
      .update({ rules })
      .eq('id', roomId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as RoomRecord;
  }

  const store = readLocalStore();
  const room = store.rooms[roomId];
  if (!room) throw new Error('Sala no encontrada.');
  const updated: RoomRecord = { ...room, rules: structuredClone(rules) };
  store.rooms[roomId] = updated;
  writeLocalStore(store);
  broadcastLocalSync({ type: 'room_updated', roomId });
  return updated;
}

export async function updatePlayerProfileInRoom(
  playerId: string,
  roomId: string,
  profile: PlayerProfile
): Promise<void> {
  const cleanName = profile.name.trim().slice(0, 12);
  const cleanEmoji = sanitizePlayerEmoji(profile.emoji);
  const cleanColor = sanitizeHexColor(profile.color);

  if (shouldUseRemoteDb() && supabase) {
    const { error } = await supabase
      .from('players')
      .update({
        name: cleanName,
        emoji: cleanEmoji,
        color: cleanColor,
      })
      .eq('id', playerId)
      .eq('room_id', roomId);

    if (error) throw new Error(error.message);
    return;
  }

  const store = readLocalStore();
  const list = store.players[roomId] || [];
  const idx = list.findIndex((p) => p.id === playerId);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      name: cleanName,
      emoji: cleanEmoji,
      color: cleanColor,
    };
    store.players[roomId] = list;
    writeLocalStore(store);
    broadcastLocalSync({ type: 'room_updated', roomId });
  }
}

export async function kickPlayer(
  roomId: string,
  targetPlayerId: string
): Promise<void> {
  if (shouldUseRemoteDb() && supabase) {
    // Emitir evento broadcast inmediato para expulsar al instante sin esperar al refresco SQL
    const liveChannel = activeSyncChannels.get(roomId);
    if (liveChannel) {
      void liveChannel.send({
        type: 'broadcast',
        event: 'player_kicked',
        payload: { targetPlayerId },
      });
    }

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', targetPlayerId)
      .eq('room_id', roomId);
    if (error) throw new Error(error.message);
    return;
  }

  const store = readLocalStore();
  store.players[roomId] = (store.players[roomId] || []).filter(
    (p) => p.id !== targetPlayerId
  );
  writeLocalStore(store);
  broadcastLocalSync({ type: 'player_kicked', roomId, targetPlayerId });
}

export async function transferHost(
  roomId: string,
  currentHostId: string,
  nextHostId: string
): Promise<void> {
  if (shouldUseRemoteDb() && supabase) {
    const { error: roomErr } = await supabase
      .from('rooms')
      .update({ host_id: nextHostId })
      .eq('id', roomId);
    if (roomErr) throw new Error(roomErr.message);

    await supabase
      .from('players')
      .update({ is_host: false })
      .eq('id', currentHostId)
      .eq('room_id', roomId);

    const { error: nextErr } = await supabase
      .from('players')
      .update({ is_host: true })
      .eq('id', nextHostId)
      .eq('room_id', roomId);
    if (nextErr) throw new Error(nextErr.message);
    return;
  }

  const store = readLocalStore();
  const room = store.rooms[roomId];
  if (!room) throw new Error('Sala no encontrada.');
  store.rooms[roomId] = { ...room, host_id: nextHostId };
  store.players[roomId] = (store.players[roomId] || []).map((p) => ({
    ...p,
    is_host: p.id === nextHostId,
  }));
  writeLocalStore(store);
  broadcastLocalSync({ type: 'room_updated', roomId });
}

export async function leaveRoom(
  roomId: string,
  playerId: string,
  isHost: boolean
): Promise<void> {
  if (shouldUseRemoteDb() && supabase) {
    if (isHost) {
      await supabase.from('rooms').delete().eq('id', roomId);
    } else {
      await supabase.from('players').delete().eq('id', playerId).eq('room_id', roomId);
    }
    return;
  }

  const store = readLocalStore();
  if (isHost) {
    delete store.rooms[roomId];
    delete store.players[roomId];
    writeLocalStore(store);
    broadcastLocalSync({ type: 'room_deleted', roomId });
  } else {
    store.players[roomId] = (store.players[roomId] || []).filter(
      (p) => p.id !== playerId
    );
    writeLocalStore(store);
    broadcastLocalSync({ type: 'room_updated', roomId });
  }
}

export function leaveRoomOnUnload(
  roomId: string,
  playerId: string,
  isHost: boolean
): void {
  if (!isForceLocalSandboxEnabled() && isSupabaseConfigured && supabaseCredentials) {
    const { url, anonKey } = supabaseCredentials;
    const endpoint = isHost
      ? `${url}/rest/v1/rooms?id=eq.${encodeURIComponent(roomId)}`
      : `${url}/rest/v1/players?id=eq.${encodeURIComponent(playerId)}&room_id=eq.${encodeURIComponent(roomId)}`;

    try {
      void fetch(endpoint, {
        method: 'DELETE',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        keepalive: true,
      });
    } catch {
      // Ignore network errors during page unload
    }
    return;
  }

  const store = readLocalStore();
  if (isHost) {
    delete store.rooms[roomId];
    delete store.players[roomId];
    writeLocalStore(store);
    broadcastLocalSync({ type: 'room_deleted', roomId });
  } else {
    store.players[roomId] = (store.players[roomId] || []).filter(
      (p) => p.id !== playerId
    );
    writeLocalStore(store);
    broadcastLocalSync({ type: 'room_updated', roomId });
  }
}

export function subscribeToRoom(
  roomId: string,
  callbacks: {
    onRoomChange: (room: RoomRecord | null) => void;
    onPlayersChange: (players: PlayerRecord[]) => void;
    onPlayerKicked?: (targetPlayerId: string) => void;
  }
): () => void {
  if (shouldUseRemoteDb() && supabase) {
    const client = supabase;
    const channel = client
      .channel(`room-sync-${roomId}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'player_kicked' }, (msg) => {
        const targetId = (msg.payload as { targetPlayerId?: string } | undefined)
          ?.targetPlayerId;
        if (targetId) {
          callbacks.onPlayerKicked?.(targetId);
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            callbacks.onRoomChange(null);
            return;
          }
          const updated = payload.new as RoomRecord;
          if (updated.status !== 'lobby') {
            callbacks.onRoomChange(null);
          } else {
            callbacks.onRoomChange(updated);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data } = await client
            .from('players')
            .select('*')
            .eq('room_id', roomId)
            .order('joined_at', { ascending: true });
          if (data) {
            callbacks.onPlayersChange(data as PlayerRecord[]);
          }
        }
      )
      .subscribe();

    activeSyncChannels.set(roomId, channel);

    return () => {
      if (activeSyncChannels.get(roomId) === channel) {
        activeSyncChannels.delete(roomId);
      }
      client.removeChannel(channel);
    };
  }

  // Modo sincronización local entre pestañas
  const syncFromStore = () => {
    const store = readLocalStore();
    const room = store.rooms[roomId];
    if (!room || room.status !== 'lobby') {
      callbacks.onRoomChange(null);
      return;
    }
    callbacks.onRoomChange(room);
    callbacks.onPlayersChange([...(store.players[roomId] || [])]);
  };

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      if (event.data?.roomId === roomId) {
        if (event.data.type === 'player_kicked') {
          callbacks.onPlayerKicked?.(event.data.targetPlayerId);
        }
        syncFromStore();
      }
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_ROOMS_KEY) {
      syncFromStore();
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.close();
    }
  };
}

export function subscribeToMatchLocations(
  roomId: string,
  onLocation: (payload: PlayerLocationPayload) => void
): {
  sendLocation: (payload: PlayerLocationPayload) => void;
  unsubscribe: () => void;
} {
  if (shouldUseRemoteDb() && supabase) {
    const client = supabase;
    let isSubscribed = false;
    const channel = client.channel(`room-loc-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'player_location' }, (msg) => {
        const data = msg.payload as PlayerLocationPayload | undefined;
        if (data && typeof data.playerId === 'string') {
          onLocation(data);
        }
      })
      .subscribe((status) => {
        isSubscribed = status === 'SUBSCRIBED';
      });

    return {
      sendLocation: (payload) => {
        if (!isSubscribed) return;
        void channel.send({
          type: 'broadcast',
          event: 'player_location',
          payload,
        });
      },
      unsubscribe: () => {
        void client.removeChannel(channel);
      },
    };
  }

  // Modo sincronización local entre pestañas
  let localChannel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    localChannel = new BroadcastChannel(`baliza-loc-${roomId}`);
    localChannel.onmessage = (event: MessageEvent<PlayerLocationPayload>) => {
      if (event.data && typeof event.data.playerId === 'string') {
        onLocation(event.data);
      }
    };
  }

  return {
    sendLocation: (payload) => {
      localChannel?.postMessage(payload);
    },
    unsubscribe: () => {
      localChannel?.close();
    },
  };
}

interface ClockPingPayload {
  senderId: string;
  t0: number;
}

interface ClockPongPayload {
  targetId: string;
  t0: number;
  hostNow: number;
}

/**
 * Sincroniza el reloj de cada dispositivo cliente con el reloj del anfitrión
 * mediante pings NTP ligeros por Realtime Broadcast (o BroadcastChannel local).
 */
export function subscribeToRoomClockSync(
  roomId: string,
  playerId: string,
  isHost: boolean,
  onOffsetChange: (offsetMs: number) => void
): () => void {
  if (isHost) {
    onOffsetChange(0);
  }

  let disposed = false;
  let lastReportedOffset: number | null = isHost ? 0 : null;
  const recentSamples: Array<{ rtt: number; offset: number; at: number }> = [];

  const handlePong = (payload: ClockPongPayload) => {
    if (isHost || disposed) return;
    if (payload.targetId !== playerId) return;
    const rxTime = Date.now();
    const rtt = rxTime - payload.t0;
    if (rtt < 0 || rtt > 5000) return;

    const sampleOffset = payload.hostNow + rtt / 2 - rxTime;
    recentSamples.push({ rtt, offset: sampleOffset, at: rxTime });

    // Conservar muestras recientes (últimos 45s, máx 8)
    const cutoff = rxTime - 45000;
    while (
      recentSamples.length > 0 &&
      (recentSamples[0].at < cutoff || recentSamples.length > 8)
    ) {
      recentSamples.shift();
    }

    // Elegir la muestra con menor RTT (menos asimetría de red)
    let best = recentSamples[0];
    for (const s of recentSamples) {
      if (s.rtt < best.rtt) {
        best = s;
      }
    }

    const rounded = Math.round(best.offset);
    if (
      lastReportedOffset === null ||
      Math.abs(rounded - lastReportedOffset) >= 15
    ) {
      lastReportedOffset = rounded;
      onOffsetChange(rounded);
    }
  };

  if (shouldUseRemoteDb() && supabase) {
    const client = supabase;
    let isSubscribed = false;
    const timers: number[] = [];

    const channel = client.channel(`room-clock-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    const sendPing = () => {
      if (disposed || isHost || !isSubscribed) return;
      const payload: ClockPingPayload = {
        senderId: playerId,
        t0: Date.now(),
      };
      void channel.send({
        type: 'broadcast',
        event: 'clock_ping',
        payload,
      });
    };

    channel
      .on('broadcast', { event: 'clock_ping' }, (msg) => {
        if (!isHost || disposed) return;
        const data = msg.payload as ClockPingPayload | undefined;
        if (!data || typeof data.senderId !== 'string' || typeof data.t0 !== 'number') {
          return;
        }
        const pong: ClockPongPayload = {
          targetId: data.senderId,
          t0: data.t0,
          hostNow: Date.now(),
        };
        void channel.send({
          type: 'broadcast',
          event: 'clock_pong',
          payload: pong,
        });
      })
      .on('broadcast', { event: 'clock_pong' }, (msg) => {
        const data = msg.payload as ClockPongPayload | undefined;
        if (
          data &&
          typeof data.targetId === 'string' &&
          typeof data.t0 === 'number' &&
          typeof data.hostNow === 'number'
        ) {
          handlePong(data);
        }
      })
      .subscribe((status) => {
        isSubscribed = status === 'SUBSCRIBED';
        if (isSubscribed && !isHost) {
          sendPing();
          timers.push(window.setTimeout(sendPing, 250));
          timers.push(window.setTimeout(sendPing, 650));
        }
      });

    const intervalId = isHost
      ? 0
      : window.setInterval(sendPing, 3000);

    const handleVisible = () => {
      if (document.visibilityState === 'visible' && !isHost) {
        sendPing();
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('online', handleVisible);

    return () => {
      disposed = true;
      timers.forEach((id) => window.clearTimeout(id));
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('online', handleVisible);
      void client.removeChannel(channel);
    };
  }

  // Fallback local entre pestañas
  let localChannel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    localChannel = new BroadcastChannel(`baliza-clock-${roomId}`);
    localChannel.onmessage = (
      event: MessageEvent<
        | { kind: 'ping'; payload: ClockPingPayload }
        | { kind: 'pong'; payload: ClockPongPayload }
      >
    ) => {
      if (disposed || !event.data) return;
      if (event.data.kind === 'ping' && isHost) {
        localChannel?.postMessage({
          kind: 'pong',
          payload: {
            targetId: event.data.payload.senderId,
            t0: event.data.payload.t0,
            hostNow: Date.now(),
          },
        });
      } else if (event.data.kind === 'pong' && !isHost) {
        handlePong(event.data.payload);
      }
    };
    if (!isHost) {
      localChannel.postMessage({
        kind: 'ping',
        payload: { senderId: playerId, t0: Date.now() },
      });
    }
  }

  return () => {
    disposed = true;
    localChannel?.close();
  };
}

interface LocationGuardPayload {
  playerId: string;
  status: LocationGuardStatus;
  ts: number;
}

/**
 * Sincroniza en tiempo real el estado de la ubicación/GPS de cada jugador en la sala
 * para que el anfitrión y todos los jugadores detecten si alguien la desactiva.
 */
export function subscribeToRoomLocationGuard(
  roomId: string,
  playerId: string,
  initialStatus: LocationGuardStatus,
  onPeerStatus: (playerId: string, status: LocationGuardStatus) => void
): {
  updateMyStatus: (status: LocationGuardStatus) => void;
  unsubscribe: () => void;
} {
  let disposed = false;
  let currentStatus = initialStatus;

  if (shouldUseRemoteDb() && supabase) {
    const client = supabase;
    let isSubscribed = false;
    const channel = client.channel(`room-loc-guard-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    const emitStatus = () => {
      if (disposed || !isSubscribed) return;
      const payload: LocationGuardPayload = {
        playerId,
        status: currentStatus,
        ts: Date.now(),
      };
      void channel.send({
        type: 'broadcast',
        event: 'loc_guard_status',
        payload,
      });
    };

    channel
      .on('broadcast', { event: 'loc_guard_status' }, (msg) => {
        if (disposed) return;
        const data = msg.payload as LocationGuardPayload | undefined;
        if (data && typeof data.playerId === 'string' && data.status) {
          onPeerStatus(data.playerId, data.status);
        }
      })
      .subscribe((status) => {
        isSubscribed = status === 'SUBSCRIBED';
        if (isSubscribed) {
          emitStatus();
        }
      });

    const heartbeatId = window.setInterval(emitStatus, 4000);

    return {
      updateMyStatus: (nextStatus) => {
        currentStatus = nextStatus;
        emitStatus();
      },
      unsubscribe: () => {
        disposed = true;
        window.clearInterval(heartbeatId);
        void client.removeChannel(channel);
      },
    };
  }

  let localChannel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    localChannel = new BroadcastChannel(`baliza-loc-guard-${roomId}`);
    localChannel.onmessage = (event: MessageEvent<LocationGuardPayload>) => {
      if (disposed || !event.data) return;
      if (typeof event.data.playerId === 'string' && event.data.status) {
        onPeerStatus(event.data.playerId, event.data.status);
      }
    };
    localChannel.postMessage({
      playerId,
      status: currentStatus,
      ts: Date.now(),
    });
  }

  return {
    updateMyStatus: (nextStatus) => {
      currentStatus = nextStatus;
      localChannel?.postMessage({
        playerId,
        status: nextStatus,
        ts: Date.now(),
      });
    },
    unsubscribe: () => {
      disposed = true;
      localChannel?.close();
    },
  };
}

export interface PhotoProofPayload {
  challengeId: string;
  playerId: string;
  playerName: string;
  dataUrl: string;
  at: string;
}

/**
 * Canal ligero para compartir la foto del reto "Foto con el cazador" en tiempo real
 * sin saturar el JSON de la base de datos.
 */
export function subscribeToPhotoProofs(
  roomId: string,
  onProof: (payload: PhotoProofPayload) => void
): {
  sendProof: (payload: PhotoProofPayload) => void;
  unsubscribe: () => void;
} {
  if (shouldUseRemoteDb() && supabase) {
    const client = supabase;
    let isSubscribed = false;
    const channel = client.channel(`room-photo-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'photo_proof' }, (msg) => {
        const data = msg.payload as PhotoProofPayload | undefined;
        if (data && typeof data.playerId === 'string' && typeof data.dataUrl === 'string') {
          onProof(data);
        }
      })
      .subscribe((status) => {
        isSubscribed = status === 'SUBSCRIBED';
      });

    return {
      sendProof: (payload) => {
        if (!isSubscribed) return;
        void channel.send({
          type: 'broadcast',
          event: 'photo_proof',
          payload,
        });
      },
      unsubscribe: () => {
        void client.removeChannel(channel);
      },
    };
  }

  let localChannel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    localChannel = new BroadcastChannel(`baliza-photo-${roomId}`);
    localChannel.onmessage = (event: MessageEvent<PhotoProofPayload>) => {
      if (event.data && typeof event.data.playerId === 'string') {
        onProof(event.data);
      }
    };
  }

  return {
    sendProof: (payload) => {
      localChannel?.postMessage(payload);
    },
    unsubscribe: () => {
      localChannel?.close();
    },
  };
}

export async function addBotsToLocalRoom(
  roomId: string,
  count = 1
): Promise<PlayerRecord[]> {
  const store = readLocalStore();
  const room = store.rooms[roomId];
  if (!room) throw new Error('Sala local no encontrada.');

  const current = store.players[roomId] || [];
  const availableSlots = Math.max(0, 20 - current.length);
  const toAdd = Math.min(count, availableSlots);
  if (toAdd <= 0) return current;

  const bots = createBotPlayers(toAdd, current, roomId);
  const next = [...current, ...bots];
  store.players[roomId] = next;

  const nextCosmetics = { ...(room.rules.playerCosmetics || {}) };
  bots.forEach((bot) => {
    nextCosmetics[bot.id] = createRandomBotCosmetics();
  });
  store.rooms[roomId] = {
    ...room,
    rules: {
      ...room.rules,
      playerCosmetics: nextCosmetics,
    },
  };

  writeLocalStore(store);
  broadcastLocalSync({ type: 'room_updated', roomId });
  return next;
}

export async function removeBotsFromLocalRoom(
  roomId: string
): Promise<PlayerRecord[]> {
  const store = readLocalStore();
  const room = store.rooms[roomId];
  if (!room) return [];

  const current = store.players[roomId] || [];
  const next = current.filter((p) => !isBotPlayerId(p.id));
  store.players[roomId] = next;

  if (room.rules.playerCosmetics) {
    const cleanedCosmetics: typeof room.rules.playerCosmetics = {};
    for (const [pid, cos] of Object.entries(room.rules.playerCosmetics)) {
      if (!isBotPlayerId(pid)) {
        cleanedCosmetics[pid] = cos;
      }
    }
    store.rooms[roomId] = {
      ...room,
      rules: {
        ...room.rules,
        playerCosmetics: cleanedCosmetics,
      },
    };
  }

  writeLocalStore(store);
  broadcastLocalSync({ type: 'room_updated', roomId });
  return next;
}

