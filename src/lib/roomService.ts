import {
  DEFAULT_RULES,
  PlayerProfile,
  PlayerRecord,
  RoomRecord,
  RoomRules,
} from '../types/game';
import { generateRoomCode, generateUuid, getPlayerId } from './storage';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const LOCAL_ROOMS_KEY = 'escondite_urbano_local_rooms_v1';
const CHANNEL_NAME = 'escondite_urbano_sync_v1';
const ROOM_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 horas

interface LocalStore {
  rooms: Record<string, RoomRecord>;
  players: Record<string, PlayerRecord[]>;
}

type SyncMessage =
  | { type: 'room_updated'; roomId: string }
  | { type: 'room_deleted'; roomId: string };

function readLocalStore(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_ROOMS_KEY);
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
    localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(store));
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
  return isSupabaseConfigured && supabase ? 'supabase' : 'local';
}

export async function createRoom(
  profile: PlayerProfile,
  initialRules: RoomRules = DEFAULT_RULES
): Promise<{ room: RoomRecord; player: PlayerRecord }> {
  const playerId = getPlayerId();
  const cleanName = profile.name.trim().slice(0, 12);

  if (isSupabaseConfigured && supabase) {
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
        throw new Error(roomError.message);
      }

      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .insert({
          id: playerId,
          room_id: roomId,
          name: cleanName,
          emoji: profile.emoji,
          color: profile.color,
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
    emoji: profile.emoji,
    color: profile.color,
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
  profile: PlayerProfile
): Promise<{ room: RoomRecord; player: PlayerRecord; players: PlayerRecord[] }> {
  const code = rawCode.trim().toUpperCase();
  const playerId = getPlayerId();
  const cleanName = profile.name.trim().slice(0, 12);

  if (code.length < 4 || code.length > 6) {
    throw new Error('No encontramos esa sala. Revisa el código.');
  }

  if (isSupabaseConfigured && supabase) {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .eq('status', 'lobby')
      .maybeSingle();

    if (roomError || !roomData) {
      throw new Error('No encontramos esa sala. Revisa el código.');
    }

    const room = roomData as RoomRecord;
    const isHost = room.host_id === playerId;
    const now = new Date().toISOString();

    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .upsert(
        {
          id: playerId,
          room_id: room.id,
          name: cleanName,
          emoji: profile.emoji,
          color: profile.color,
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
  const player: PlayerRecord = {
    id: playerId,
    room_id: room.id,
    name: cleanName,
    emoji: profile.emoji,
    color: profile.color,
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
  if (isSupabaseConfigured && supabase) {
    const { data: roomData } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .eq('status', 'lobby')
      .maybeSingle();

    if (!roomData) return null;

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });

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

export async function updateRoomRules(
  roomId: string,
  rules: RoomRules
): Promise<RoomRecord> {
  if (isSupabaseConfigured && supabase) {
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

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('players')
      .update({
        name: cleanName,
        emoji: profile.emoji,
        color: profile.color,
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
      emoji: profile.emoji,
      color: profile.color,
    };
    store.players[roomId] = list;
    writeLocalStore(store);
    broadcastLocalSync({ type: 'room_updated', roomId });
  }
}

export async function leaveRoom(
  roomId: string,
  playerId: string,
  isHost: boolean
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
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

export function subscribeToRoom(
  roomId: string,
  callbacks: {
    onRoomChange: (room: RoomRecord | null) => void;
    onPlayersChange: (players: PlayerRecord[]) => void;
  }
): () => void {
  if (isSupabaseConfigured && supabase) {
    const client = supabase;
    const channel = client
      .channel(`room-sync-${roomId}`)
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

    return () => {
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
