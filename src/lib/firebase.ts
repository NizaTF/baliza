import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { PlayerRole } from '../types/game';
import { safeSessionGet, safeSessionSet } from './safeStorage';
import { isForceLocalSandboxEnabled } from './soloSandbox';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (typeof window === 'undefined' || isForceLocalSandboxEnabled()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

// Constantes sincronizadas con firebase-blueprint.json y firestore.rules
const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const VALID_ROOM_CODE_REGEX = /^[A-Z0-9]+$/;
export const CHAT_TEXT_MAX_LENGTH = 180;
const SANDBOX_CHAT_EVENT = 'baliza:sandbox-chat-updated';

export type ChatChannel = 'all' | 'team';

export interface RoomChatMessage {
  id: string;
  roomId: string;
  roomCode: string;
  authUid: string;
  senderPlayerId: string;
  senderName: string;
  senderEmoji: string;
  senderRole: PlayerRole;
  channel: ChatChannel;
  text: string;
  createdAtMs: number;
}

function sanitizeIdForBlueprint(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return VALID_ID_REGEX.test(cleaned) && cleaned.length > 0
    ? cleaned
    : `${fallbackPrefix}_${Date.now()}`;
}

function sanitizeRoomCodeForBlueprint(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  if (cleaned.length >= 2 && VALID_ROOM_CODE_REGEX.test(cleaned)) {
    return cleaned;
  }
  return 'SALA';
}

function readSandboxChat(roomId: string): RoomChatMessage[] {
  try {
    const raw = safeSessionGet(`baliza_sandbox_chat_${roomId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RoomChatMessage[]) : [];
  } catch {
    return [];
  }
}

const sandboxChatListeners = new Set<(roomId: string) => void>();

function writeSandboxChat(roomId: string, messages: RoomChatMessage[]): void {
  safeSessionSet(
    `baliza_sandbox_chat_${roomId}`,
    JSON.stringify(messages.slice(-80))
  );
  sandboxChatListeners.forEach((fn) => fn(roomId));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SANDBOX_CHAT_EVENT, { detail: { roomId } })
    );
  }
}

export function subscribeChatAuth(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogleForChat(): Promise<User | null> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signOutChat(): Promise<void> {
  await signOut(auth);
}

export function subscribeRoomChatMessages(
  roomId: string,
  onMessages: (messages: RoomChatMessage[]) => void,
  onError?: (err: Error) => void,
  options?: { forceLocal?: boolean }
): () => void {
  const safeRoomId = sanitizeIdForBlueprint(roomId, 'room');

  if (options?.forceLocal || isForceLocalSandboxEnabled()) {
    onMessages(readSandboxChat(safeRoomId));
    const localListener = (updatedRoomId: string) => {
      if (updatedRoomId === safeRoomId) {
        onMessages(readSandboxChat(safeRoomId));
      }
    };
    sandboxChatListeners.add(localListener);
    if (typeof window === 'undefined') {
      return () => {
        sandboxChatListeners.delete(localListener);
      };
    }
    const handleEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ roomId?: string }>).detail;
      if (!detail?.roomId || detail.roomId === safeRoomId) {
        onMessages(readSandboxChat(safeRoomId));
      }
    };
    window.addEventListener(SANDBOX_CHAT_EVENT, handleEvent);
    return () => {
      sandboxChatListeners.delete(localListener);
      window.removeEventListener(SANDBOX_CHAT_EVENT, handleEvent);
    };
  }

  if (!auth.currentUser) {
    onMessages([]);
    return () => {};
  }

  const path = `rooms/${safeRoomId}/messages`;
  const messagesQuery = query(
    collection(db, 'rooms', safeRoomId, 'messages'),
    where('roomId', '==', safeRoomId),
    limit(80)
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const list: RoomChatMessage[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const ts = d.createdAt as Timestamp | undefined;
        const createdAtMs =
          ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
        return {
          id: docSnap.id,
          roomId: String(d.roomId ?? safeRoomId),
          roomCode: String(d.roomCode ?? 'SALA'),
          authUid: String(d.authUid ?? ''),
          senderPlayerId: String(d.senderPlayerId ?? ''),
          senderName: String(d.senderName ?? 'Jugador'),
          senderEmoji: String(d.senderEmoji ?? '💬'),
          senderRole: d.senderRole === 'seeker' ? 'seeker' : 'hider',
          channel: d.channel === 'team' ? 'team' : 'all',
          text: String(d.text ?? ''),
          createdAtMs,
        };
      });
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      onMessages(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(
          wrapped instanceof Error ? wrapped : new Error(String(wrapped))
        );
      }
    }
  );
}

export async function sendRoomChatMessage(input: {
  roomId: string;
  roomCode: string;
  senderPlayerId: string;
  senderName: string;
  senderEmoji: string;
  senderRole: PlayerRole;
  channel: ChatChannel;
  text: string;
  forceLocal?: boolean;
}): Promise<void> {
  const cleanText = input.text.replace(/\s+/g, ' ').trim().slice(0, CHAT_TEXT_MAX_LENGTH);
  if (!cleanText) return;

  const safeRoomId = sanitizeIdForBlueprint(input.roomId, 'room');
  const safeRoomCode = sanitizeRoomCodeForBlueprint(input.roomCode);
  const safePlayerId = sanitizeIdForBlueprint(input.senderPlayerId, 'player');
  const safeName = (input.senderName.trim() || 'Jugador').slice(0, 24);
  const safeEmoji = (input.senderEmoji.trim() || '🏃').slice(0, 16);

  if (input.forceLocal || isForceLocalSandboxEnabled()) {
    const existing = readSandboxChat(safeRoomId);
    const localMsg: RoomChatMessage = {
      id: `local_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      roomId: safeRoomId,
      roomCode: safeRoomCode,
      authUid: 'sandbox_local',
      senderPlayerId: safePlayerId,
      senderName: safeName,
      senderEmoji: safeEmoji,
      senderRole: input.senderRole,
      channel: input.channel,
      text: cleanText,
      createdAtMs: Date.now(),
    };
    writeSandboxChat(safeRoomId, [...existing, localMsg]);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesión con Google para enviar mensajes en el chat.');
  }

  const path = `rooms/${safeRoomId}/messages`;
  try {
    await addDoc(collection(db, 'rooms', safeRoomId, 'messages'), {
      roomId: safeRoomId,
      roomCode: safeRoomCode,
      authUid: user.uid,
      senderPlayerId: safePlayerId,
      senderName: safeName,
      senderEmoji: safeEmoji,
      senderRole: input.senderRole,
      channel: input.channel,
      text: cleanText,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
