import {
  InfectedRecord,
  MatchWinner,
  PlayerRole,
} from '../types/game';

/**
 * Determina si un jugador gana la partida según las reglas activas.
 * En Modo Infección, si los buscadores/infectados atrapan a todos,
 * SOLO ganan quienes empezaron infectados (initialSeekers) y los infectados pierden.
 */
export function didPlayerWinMatch(params: {
  winner: MatchWinner;
  myRole: PlayerRole;
  currentPlayerId?: string;
  infectionModeEnabled?: boolean;
  infectedMap?: Record<string, InfectedRecord>;
  initialSeekers?: string[];
  roles?: Record<string, PlayerRole>;
}): boolean {
  const {
    winner,
    myRole,
    currentPlayerId,
    infectionModeEnabled = false,
    infectedMap = {},
    initialSeekers = [],
    roles = {},
  } = params;

  if (winner === 'hiders') {
    return myRole === 'hider';
  }
  if (!infectionModeEnabled) {
    return myRole === 'seeker';
  }
  if (!currentPlayerId || myRole !== 'seeker') {
    return false;
  }
  if (infectedMap[currentPlayerId]) {
    return false;
  }
  if (initialSeekers.length > 0) {
    return initialSeekers.includes(currentPlayerId);
  }
  return roles[currentPlayerId] === 'seeker';
}
