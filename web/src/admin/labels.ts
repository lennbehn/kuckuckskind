import type { RoomPhase } from '@kuckuckskind/shared';

export const PHASE_LABEL: Record<RoomPhase, string> = {
  lobby: 'Lobby',
  hatching: 'Ausbrüten',
  peekChoice: 'Spick-Wahl',
  rounds: 'Runden',
  homecoming: 'Heimkehr',
  voting: 'Abstimmung',
  reveal: 'Enthüllung',
};
