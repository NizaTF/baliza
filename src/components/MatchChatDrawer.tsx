import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { LogIn, MessageSquare, Send, Shield, Eye, X } from 'lucide-react';
import {
  CHAT_TEXT_MAX_LENGTH,
  ChatChannel,
  RoomChatMessage,
  sendRoomChatMessage,
  signInWithGoogleForChat,
  subscribeChatAuth,
  subscribeRoomChatMessages,
} from '../lib/firebase';
import { triggerHaptic } from '../lib/preferences';
import { playPixelUiClick } from '../lib/retroAudio';
import { isForceLocalSandboxEnabled } from '../lib/soloSandbox';
import { PlayerRole } from '../types/game';

interface MatchChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomCode: string;
  currentPlayerId: string;
  playerName: string;
  playerEmoji: string;
  myRole: PlayerRole;
  sandboxUnlocked?: boolean;
  onUnreadCountChange?: (count: number) => void;
}

const QUICK_PHRASES_HIDER = [
  '¡Cuidado, viene por aquí!',
  'Voy hacia la Baliza',
  'Estoy escondido, todo limpio',
  '¿Dónde está el buscador?',
];

const QUICK_PHRASES_SEEKER = [
  '¡Visto por el centro!',
  'Cubro la Baliza verde',
  '¿Alguien tiene radar?',
  '¡Voy tras mi objetivo!',
];

export const MatchChatDrawer: React.FC<MatchChatDrawerProps> = ({
  isOpen,
  onClose,
  roomId,
  roomCode,
  currentPlayerId,
  playerName,
  playerEmoji,
  myRole,
  sandboxUnlocked = false,
  onUnreadCountChange,
}) => {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [channel, setChannel] = useState<ChatChannel>('all');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [seenCount, setSeenCount] = useState(0);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const isSandboxLocal = isForceLocalSandboxEnabled() || sandboxUnlocked;

  useEffect(() => {
    const unsub = subscribeChatAuth((user) => {
      setAuthUser(user);
      setChatError(null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeRoomChatMessages(
      roomId,
      (nextMessages) => {
        setMessages(nextMessages);
        setChatError(null);
      },
      (err) => {
        setChatError(
          err.message.includes('PERMISSION_DENIED')
            ? 'Inicia sesión con una cuenta de Google verificada para leer el chat.'
            : 'No se pudo sincronizar el chat en este momento.'
        );
      },
      { forceLocal: isSandboxLocal }
    );
    return unsub;
  }, [roomId, authUser?.uid, isSandboxLocal]);

  const visibleMessages = useMemo(() => {
    return messages.filter(
      (msg) => msg.channel === 'all' || msg.senderRole === myRole
    );
  }, [messages, myRole]);

  useEffect(() => {
    if (isOpen) {
      setSeenCount(visibleMessages.length);
      onUnreadCountChange?.(0);
      window.setTimeout(() => {
        listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      const unread = Math.max(0, visibleMessages.length - seenCount);
      onUnreadCountChange?.(unread);
    }
  }, [isOpen, visibleMessages.length, seenCount, onUnreadCountChange]);

  const handleGoogleConnect = async () => {
    setSigningIn(true);
    setChatError(null);
    try {
      await signInWithGoogleForChat();
      playPixelUiClick();
    } catch {
      setChatError('No se pudo completar el acceso con Google.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSend = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setChatError(null);
    try {
      await sendRoomChatMessage({
        roomId,
        roomCode,
        senderPlayerId: currentPlayerId,
        senderName: playerName,
        senderEmoji: playerEmoji,
        senderRole: myRole,
        channel,
        text: trimmed,
        forceLocal: isSandboxLocal,
      });
      setText('');
      triggerHaptic(14);
      playPixelUiClick();
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'No se pudo enviar el mensaje.'
      );
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const canWrite = isSandboxLocal || Boolean(authUser);
  const quickPhrases =
    myRole === 'seeker' ? QUICK_PHRASES_SEEKER : QUICK_PHRASES_HIDER;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat de partida"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 p-0 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex h-[78dvh] sm:h-[560px] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 truncate">
                Chat en partida
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                Sala {roomCode} ·{' '}
                {isSandboxLocal ? 'Modo pruebas local' : 'Sincronizado con Firebase'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar chat"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selector de canal */}
        <div className="border-b border-slate-100 px-4 py-2 shrink-0">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setChannel('all')}
              className={`min-h-[34px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                channel === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setChannel('team')}
              className={`inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
                channel === 'team'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {myRole === 'seeker' ? (
                <Eye className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
              ) : (
                <Shield className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              )}
              <span>
                Solo {myRole === 'seeker' ? 'Buscadores' : 'Fugitivos'}
              </span>
            </button>
          </div>
        </div>

        {/* Cuerpo de mensajes */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {!canWrite ? (
            <div className="flex h-full flex-col items-center justify-center text-center px-4 space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <LogIn className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Conecta tu cuenta para usar el chat en vivo
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Los mensajes se guardan en tiempo real con Firebase para toda tu sala.
                </p>
              </div>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void handleGoogleConnect()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>
                  {signingIn ? 'Conectando...' : 'Conectar con Google'}
                </span>
              </button>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center px-6">
              <p className="text-xs text-slate-500">
                Todavía no hay mensajes. Envía una señal rápida o escribe abajo.
              </p>
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const isMine = msg.senderPlayerId === currentPlayerId;
              const timeStr = new Date(msg.createdAtMs).toLocaleTimeString(
                'es-ES',
                { hour: '2-digit', minute: '2-digit' }
              );
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    isMine ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs shadow-xs ${
                      isMine
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-900'
                    }`}
                  >
                    <div
                      className={`mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold ${
                        isMine ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      <span>{msg.senderEmoji}</span>
                      <span>{msg.senderName}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {msg.senderRole === 'seeker' ? 'Buscador' : 'Fugitivo'}
                      </span>
                      {msg.channel === 'team' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Equipo</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{timeStr}</span>
                    </div>
                    <p className="leading-snug break-words">{msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>

        {chatError && (
          <div className="border-t border-rose-100 bg-rose-50 px-4 py-1.5 text-[11px] font-medium text-rose-700 shrink-0">
            {chatError}
          </div>
        )}

        {/* Mensajes rápidos y campo de texto */}
        {canWrite && (
          <div className="border-t border-slate-100 bg-slate-50/70 p-3 space-y-2 pb-safe shrink-0">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {quickPhrases.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  disabled={sending}
                  onClick={() => void handleSend(phrase)}
                  className="min-h-[30px] shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  {phrase}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend(text);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={text}
                maxLength={CHAT_TEXT_MAX_LENGTH}
                placeholder={
                  channel === 'team'
                    ? `Mensaje privado a tu bando...`
                    : `Mensaje corto para la sala...`
                }
                onChange={(e) => setText(e.target.value)}
                className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || text.trim().length === 0}
                aria-label="Enviar mensaje"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-45"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
