import { CaughtRecord, MatchWinner, PlayerRole } from '../types/game';
import type { ChatChannel, RoomChatMessage } from './firebase';

export type RestrictedMatchAction =
  | 'capture'
  | 'ability'
  | 'compass'
  | 'photo_challenge'
  | 'photo_reject'
  | 'beacon_capture'
  | 'broadcast_gps'
  | 'joystick'
  | 'undo_elimination';

export interface SpectatorChatContext {
  isSpectator: boolean;
  matchEnded: boolean;
  myRole: PlayerRole;
}

export function isPlayerSpectator(
  caughtMap: Record<string, CaughtRecord> | undefined,
  playerId: string
): boolean {
  return Boolean(caughtMap?.[playerId]);
}

export function getSpectatorChatRules(ctx: SpectatorChatContext): {
  lockedToSpectatorsOnly: boolean;
  canWriteGlobalOrTeam: boolean;
  allowedWriteChannels: ChatChannel[];
  defaultChannel: ChatChannel;
} {
  if (ctx.isSpectator && !ctx.matchEnded) {
    return {
      lockedToSpectatorsOnly: true,
      canWriteGlobalOrTeam: false,
      allowedWriteChannels: ['spectators'],
      defaultChannel: 'spectators',
    };
  }
  return {
    lockedToSpectatorsOnly: false,
    canWriteGlobalOrTeam: true,
    allowedWriteChannels: ['all', 'team'],
    defaultChannel: 'all',
  };
}

export function resolveOutgoingChatChannel(
  requestedChannel: ChatChannel,
  ctx: Pick<SpectatorChatContext, 'isSpectator' | 'matchEnded'>
): ChatChannel {
  if (ctx.isSpectator && !ctx.matchEnded) {
    return 'spectators';
  }
  return requestedChannel === 'team' ? 'team' : 'all';
}

export function canReadChatMessage(
  msg: Pick<RoomChatMessage, 'channel' | 'senderRole'>,
  ctx: SpectatorChatContext
): boolean {
  if (ctx.matchEnded) {
    return true;
  }
  if (msg.channel === 'spectators') {
    return ctx.isSpectator;
  }
  if (msg.channel === 'all') {
    return true;
  }
  // 'team' channel: only alive teammates of the same role
  return !ctx.isSpectator && msg.senderRole === ctx.myRole;
}

export function canSpectatorPerformAction(
  action: RestrictedMatchAction,
  params: {
    isSpectator: boolean;
    isSelf?: boolean;
    sandboxUnlocked?: boolean;
    matchWinner?: MatchWinner | null;
  }
): boolean {
  const {
    isSpectator,
    isSelf = false,
    sandboxUnlocked = false,
  } = params;

  if (!isSpectator) return true;

  switch (action) {
    case 'joystick':
      return Boolean(sandboxUnlocked);
    case 'undo_elimination':
      if (isSelf) return false;
      return Boolean(sandboxUnlocked);
    case 'capture':
    case 'ability':
    case 'compass':
    case 'photo_challenge':
    case 'photo_reject':
    case 'beacon_capture':
    case 'broadcast_gps':
      return false;
    default:
      return false;
  }
}

export function shouldPlayerBeVisibleOnMap(params: {
  isSpectator: boolean;
  myRole: PlayerRole;
  otherRole: PlayerRole;
  hidersCanSeeSeekers: boolean;
  seekersCanSeeHiders: boolean;
  stormExposed: boolean;
  isLocOff: boolean;
  isCampExposed: boolean;
  isClassicHintRevealed: boolean;
  fogEnabled: boolean;
  distanceToOtherM: number | null;
  fogRadiusM: number;
}): boolean {
  if (params.isSpectator) {
    return true;
  }

  if (params.fogEnabled) {
    if (
      params.distanceToOtherM === null ||
      params.distanceToOtherM > params.fogRadiusM
    ) {
      return false;
    }
    return true;
  }

  const allowedByRule =
    (params.myRole === 'hider' &&
      params.otherRole === 'seeker' &&
      params.hidersCanSeeSeekers) ||
    (params.myRole === 'seeker' &&
      params.otherRole === 'hider' &&
      params.seekersCanSeeHiders);

  return Boolean(
    allowedByRule ||
      params.stormExposed ||
      params.isLocOff ||
      params.isCampExposed ||
      params.isClassicHintRevealed
  );
}

export function shouldDecoyBeVisibleOnMap(params: {
  isSpectator: boolean;
  myRole: PlayerRole;
  isOwner: boolean;
  fogEnabled: boolean;
  distanceToDecoyM: number | null;
  fogRadiusM: number;
}): boolean {
  if (params.isSpectator) {
    return true;
  }
  if (params.fogEnabled) {
    if (
      params.distanceToDecoyM === null ||
      params.distanceToDecoyM > params.fogRadiusM
    ) {
      return false;
    }
  }
  return params.myRole === 'seeker' || params.isOwner;
}
